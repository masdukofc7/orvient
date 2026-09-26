/// <reference lib="webworker" />
import { parseProductCsv } from '@inventory/shared';

export type ProductCsvWorkerRequest = { csv: string };
export type ProductCsvWorkerResponse =
  | {
      ok: true;
      rows: ReturnType<typeof parseProductCsv>['rows'];
      errors: ReturnType<typeof parseProductCsv>['errors'];
    }
  | { ok: false; message: string };

self.onmessage = (event: MessageEvent<ProductCsvWorkerRequest>) => {
  try {
    const parsed = parseProductCsv(event.data.csv);
    const res: ProductCsvWorkerResponse = {
      ok: true,
      rows: parsed.rows,
      errors: parsed.errors,
    };
    self.postMessage(res);
  } catch (e) {
    const res: ProductCsvWorkerResponse = {
      ok: false,
      message: e instanceof Error ? e.message : 'CSV parse failed',
    };
    self.postMessage(res);
  }
};

export {};
