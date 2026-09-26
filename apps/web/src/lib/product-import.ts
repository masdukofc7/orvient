import {
  PRODUCT_IMPORT_BATCH_MAX,
  parseProductCsv,
  type CreateProductInput,
} from '@inventory/shared';
import type { ProductCsvWorkerResponse } from './product-csv.worker';

export type ProductImportError = { line: number; message: string };

export type ProductImportProgress = {
  phase: 'reading' | 'parsing' | 'importing' | 'done' | 'error' | 'cancelled';
  fileName: string;
  /** Valid rows queued for create + parse failures counted in failed */
  total: number;
  processed: number;
  created: number;
  failed: number;
  errors: ProductImportError[];
  message?: string;
};

type ParsedRow = { line: number; input: CreateProductInput };

type BatchResult = {
  created: number;
  errors: ProductImportError[];
};

const MAX_FILE_BYTES = 2_000_000;

/** Parse off the main thread when Worker is available; fall back to sync parse. */
export function parseProductCsvOffthread(csv: string): Promise<{
  rows: ParsedRow[];
  errors: ProductImportError[];
}> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(parseProductCsv(csv));
  }

  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./product-csv.worker.ts', import.meta.url));
    } catch (e) {
      try {
        resolve(parseProductCsv(csv));
      } catch (err) {
        reject(err);
      }
      return;
    }

    const fail = (message: string) => {
      worker.terminate();
      reject(new Error(message));
    };

    worker.onmessage = (event: MessageEvent<ProductCsvWorkerResponse>) => {
      worker.terminate();
      const data = event.data;
      if (!data?.ok) {
        reject(new Error(data?.message || 'CSV parse failed'));
        return;
      }
      resolve({ rows: data.rows, errors: data.errors });
    };
    worker.onerror = (event) => {
      // Bundling quirk — fall back so import still works
      worker.terminate();
      try {
        resolve(parseProductCsv(csv));
      } catch (err) {
        fail(err instanceof Error ? err.message : event.message || 'Worker failed');
      }
    };
    worker.postMessage({ csv });
  });
}

/**
 * Read → parse (worker) → create in small batches with progress.
 * Never swallows errors; AbortSignal stops cleanly between batches.
 */
export async function runProductCsvImport(opts: {
  file: File;
  importBatch: (products: CreateProductInput[]) => Promise<BatchResult>;
  onProgress: (p: ProductImportProgress) => void;
  signal?: AbortSignal;
  batchSize?: number;
}): Promise<ProductImportProgress> {
  const { file, importBatch, onProgress, signal } = opts;
  const batchSize = Math.min(
    opts.batchSize ?? PRODUCT_IMPORT_BATCH_MAX,
    PRODUCT_IMPORT_BATCH_MAX,
  );

  const emit = (p: ProductImportProgress) => {
    onProgress(p);
    return p;
  };

  const base = {
    fileName: file.name,
    total: 0,
    processed: 0,
    created: 0,
    failed: 0,
    errors: [] as ProductImportError[],
  };

  if (signal?.aborted) {
    return emit({ ...base, phase: 'cancelled', message: 'Import cancelled' });
  }

  if (file.size > MAX_FILE_BYTES) {
    return emit({
      ...base,
      phase: 'error',
      message: `File too large (max ${Math.floor(MAX_FILE_BYTES / 1_000_000)}MB)`,
    });
  }

  emit({ ...base, phase: 'reading', message: 'Reading file…' });

  let csv: string;
  try {
    csv = await file.text();
  } catch (e) {
    return emit({
      ...base,
      phase: 'error',
      message: e instanceof Error ? e.message : 'Could not read file',
    });
  }

  if (signal?.aborted) {
    return emit({ ...base, phase: 'cancelled', message: 'Import cancelled' });
  }

  emit({ ...base, phase: 'parsing', message: 'Parsing CSV…' });

  let rows: ParsedRow[];
  let parseErrors: ProductImportError[];
  try {
    const parsed = await parseProductCsvOffthread(csv);
    rows = parsed.rows;
    parseErrors = parsed.errors;
  } catch (e) {
    return emit({
      ...base,
      phase: 'error',
      message: e instanceof Error ? e.message : 'CSV parse failed',
    });
  }

  const total = rows.length + parseErrors.length;
  let created = 0;
  let failed = parseErrors.length;
  const errors = [...parseErrors];

  if (!rows.length && !parseErrors.length) {
    return emit({
      ...base,
      total: 0,
      phase: 'error',
      message: 'CSV has no data rows',
    });
  }

  if (!rows.length) {
    return emit({
      ...base,
      total,
      processed: total,
      failed,
      errors,
      phase: 'done',
      message: 'No valid rows to import',
    });
  }

  emit({
    ...base,
    phase: 'importing',
    total,
    processed: parseErrors.length,
    created: 0,
    failed,
    errors: errors.slice(),
    message: `Importing 0/${rows.length}…`,
  });

  for (let i = 0; i < rows.length; i += batchSize) {
    if (signal?.aborted) {
      return emit({
        fileName: file.name,
        phase: 'cancelled',
        total,
        processed: parseErrors.length + i,
        created,
        failed,
        errors,
        message: `Cancelled after ${created} created (${i}/${rows.length} sent)`,
      });
    }

    const chunk = rows.slice(i, i + batchSize);
    try {
      const res = await importBatch(chunk.map((r) => r.input));
        created += res.created;
      for (const err of res.errors) {
        // API batch uses 1-based index within the batch — remap to CSV line
        const local = chunk[err.line - 1];
        errors.push({
          line: local?.line ?? err.line,
          message: err.message,
        });
        failed += 1;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      for (const row of chunk) {
        errors.push({ line: row.line, message: msg });
        failed += 1;
      }
      return emit({
        fileName: file.name,
        phase: 'error',
        total,
        processed: parseErrors.length + i + chunk.length,
        created,
        failed,
        errors,
        message: `Stopped at line ${chunk[0]!.line}: ${msg}`,
      });
    }

    const processed = parseErrors.length + Math.min(i + chunk.length, rows.length);
    emit({
      fileName: file.name,
      phase: 'importing',
      total,
      processed,
      created,
      failed,
      errors: errors.slice(),
      message: `Importing ${Math.min(i + chunk.length, rows.length)}/${rows.length}…`,
    });
  }

  return emit({
    fileName: file.name,
    phase: 'done',
    total,
    processed: total,
    created,
    failed,
    errors,
    message:
      failed > 0
        ? `Finished: ${created} created, ${failed} failed`
        : `Finished: ${created} product${created === 1 ? '' : 's'} created`,
  });
}
