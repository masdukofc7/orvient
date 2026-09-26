'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  DEFAULT_CURRENCY,
  PRODUCT_STATUS_OPTIONS,
  PRODUCT_UNIT_OPTIONS,
  PRODUCT_CSV_HEADERS,
  can,
  type CreateProductInput,
} from '@inventory/shared';
import { api } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import {
  runProductCsvImport,
  type ProductImportProgress,
} from '@/lib/product-import';
import { cn, formatDateTime, formatMoney } from '@/lib/utils';
import { formNumber, formOptional, formString } from '@/lib/form';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAuthStore } from '@/stores';
import { SimpleTable, type SimpleColumn } from '@/components/ui/simple-table';
import { Button } from '@/components/ui/button';
import { ActionMenu } from '@/components/ui/action-menu';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { PageContent, PageFilters } from '@/components/ui/page-content';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { ProductStatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';
import { Card, CardBody } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toaster';
import { TableSkeleton } from '@/components/skeletons';
import { BarcodeSvg } from '@/components/ui/barcode-svg';

type Product = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  costPrice: string;
  sellingPrice: string;
  stock: string;
  unit: string;
  status: string;
  lowStockAt: string;
  category: string | null;
};

type ProductPage = { data: Product[]; total: number; page: number; limit: number };

export default function ProductsPage() {
  const currency = useAuthStore((s) => s.user?.defaultCurrency ?? DEFAULT_CURRENCY);
  const canManage = can(useAuthStore((s) => s.user?.membershipRole), 'products.write');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, limit]);

  const list = useQuery({
    queryKey: ['products', debouncedSearch, statusFilter, page, limit],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);
      return api<ProductPage>(`/products?${params}`);
    },
    placeholderData: keepPreviousData,
  });

  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (rows.length > 0 && rows.every((r) => prev.has(r.id))) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  }, [rows]);
  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const printLabels = useCallback(() => {
    const printable = rows.filter((r) => selected.has(r.id) && r.barcode);
    if (!printable.length) {
      toast({
        title: 'Nothing to print',
        description: 'Select products that have a barcode.',
        variant: 'destructive',
      });
      return;
    }
    window.print();
  }, [rows, selected, toast]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editing
        ? api(`/products/${editing.id}`, { method: 'PATCH', body })
        : api('/products', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setOpen(false);
      setEditing(null);
      toast({ title: editing ? 'Product updated' : 'Product created' });
    },
    onError: (e: Error) =>
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setDeleteTarget(null);
      toast({ title: 'Product archived' });
    },
    onError: (e: Error) =>
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
  });

  const backfill = useMutation({
    mutationFn: () =>
      api<{ updated: number; skipped: number }>('/products/backfill-barcodes', {
        method: 'POST',
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast({
        title: 'Barcodes filled',
        description:
          res.skipped > 0
            ? `Updated ${res.updated}, skipped ${res.skipped} (SKU conflict).`
            : `Updated ${res.updated} product${res.updated === 1 ? '' : 's'}.`,
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Backfill failed', description: e.message, variant: 'destructive' }),
  });

  const [importProgress, setImportProgress] = useState<ProductImportProgress | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const importAbortRef = useRef<AbortController | null>(null);
  const importBusy =
    importProgress?.phase === 'reading' ||
    importProgress?.phase === 'parsing' ||
    importProgress?.phase === 'importing';

  useEffect(() => {
    if (!importBusy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [importBusy]);

  const cancelImport = useCallback(() => {
    importAbortRef.current?.abort();
  }, []);

  const dismissImport = useCallback(() => {
    if (importBusy) return;
    setImportProgress(null);
  }, [importBusy]);

  const onCsvPicked = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (importBusy) {
        toast({
          title: 'Import already running',
          description: 'Wait for it to finish or cancel it first.',
          variant: 'destructive',
        });
        return;
      }

      importAbortRef.current?.abort();
      const ac = new AbortController();
      importAbortRef.current = ac;

      const result = await runProductCsvImport({
        file,
        signal: ac.signal,
        onProgress: setImportProgress,
        importBatch: async (products: CreateProductInput[]) => {
          const res = await api<{
            created: number;
            failed: number;
            errors: Array<{ line: number; message: string }>;
          }>('/products/import', { method: 'POST', body: { products } });
          return { created: res.created, errors: res.errors };
        },
      }).catch((e: unknown) => {
        const message = e instanceof Error ? e.message : 'Import failed unexpectedly';
        const failed: ProductImportProgress = {
          phase: 'error',
          fileName: file.name,
          total: 0,
          processed: 0,
          created: 0,
          failed: 0,
          errors: [],
          message,
        };
        setImportProgress(failed);
        return failed;
      });

      if (csvInputRef.current) csvInputRef.current.value = '';

      if (result.created > 0) {
        qc.invalidateQueries({ queryKey: ['products'] });
      }

      if (result.phase === 'done') {
        toast({
          title: result.created ? `Imported ${result.created}` : 'Import finished',
          description: result.message,
          variant: result.created === 0 && result.failed > 0 ? 'destructive' : 'default',
        });
      } else if (result.phase === 'error') {
        toast({
          title: 'Import stopped',
          description: result.message,
          variant: 'destructive',
        });
      } else if (result.phase === 'cancelled') {
        toast({ title: 'Import cancelled', description: result.message });
      }
    },
    [importBusy, qc, toast],
  );

  const formRef = useRef<HTMLFormElement>(null);
  const fillBarcodeFromSku = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const sku = form.elements.namedItem('sku') as HTMLInputElement | null;
    const barcode = form.elements.namedItem('barcode') as HTMLInputElement | null;
    if (sku && barcode) barcode.value = sku.value.trim();
  }, []);

  const unitOptions = useMemo(() => {
    const unit = editing?.unit;
    if (unit && !PRODUCT_UNIT_OPTIONS.some((o) => o.value === unit)) {
      return [{ value: unit, label: unit }, ...PRODUCT_UNIT_OPTIONS];
    }
    return PRODUCT_UNIT_OPTIONS;
  }, [editing?.unit]);

  const columns = useMemo<SimpleColumn<Product>[]>(
    () => [
      {
        id: 'select',
        header: (
          <input
            type="checkbox"
            className="size-4 accent-foreground"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="Select all loaded products"
          />
        ),
        className: 'w-10 print:hidden',
        cell: (p) => (
          <input
            type="checkbox"
            className="size-4 accent-foreground"
            checked={selected.has(p.id)}
            onChange={() => toggleOne(p.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${p.name}`}
          />
        ),
      },
      { id: 'name', header: 'Name', cell: (p) => p.name },
      {
        id: 'category',
        header: 'Category',
        hideOnMobile: true,
        cell: (p) => p.category ?? '—',
      },
      { id: 'sku', header: 'SKU', cell: (p) => p.sku },
      {
        id: 'barcode',
        header: 'Barcode',
        hideOnMobile: true,
        cell: (p) => p.barcode ?? '—',
      },
      {
        id: 'price',
        header: 'Price',
        cell: (p) => formatMoney(p.sellingPrice, currency),
      },
      {
        id: 'stock',
        header: 'Stock',
        cell: (p) => `${p.stock} ${p.unit}`,
      },
      {
        id: 'status',
        header: 'Status',
        cell: (p) => <ProductStatusBadge value={p.status} />,
      },
      {
        id: 'actions',
        header: '',
        className: 'print:hidden',
        cell: (p) =>
          canManage ? (
            <div className="flex justify-end gap-1 sm:gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(p);
                  setOpen(true);
                }}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(p);
                }}
              >
                Delete
              </Button>
            </div>
          ) : null,
      },
    ],
    [allSelected, canManage, currency, selected, toggleAll, toggleOne],
  );

  const labelsToPrint = useMemo(
    () => rows.filter((r) => selected.has(r.id) && r.barcode),
    [rows, selected],
  );

  const hasFilters = Boolean(debouncedSearch || statusFilter);

  const history = useQuery({
    queryKey: ['product-history', editing?.id],
    queryFn: () =>
      api<
        Array<{
          id: string;
          type: string;
          quantity: string;
          notes: string | null;
          createdAt: string;
        }>
      >(`/reports/products/${editing!.id}/history`),
    enabled: Boolean(editing?.id && open),
  });

  return (
    <>
      <PageContent className="no-print">
      <PageHeader
        title="Products"
        description="Catalog setup, pricing, and barcode management"
        actions={
          <>
            {canManage ? (
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => void onCsvPicked(e.target.files?.[0])}
              />
            ) : null}
            {selected.size > 0 ? (
              <Button variant="outline" onClick={printLabels}>
                Print labels ({selected.size})
              </Button>
            ) : null}
            {canManage ? (
              <ActionMenu
                label="More"
                items={[
                  {
                    label: importBusy ? 'Importing…' : 'Import CSV',
                    disabled: importBusy,
                    onClick: () => csvInputRef.current?.click(),
                  },
                  {
                    label: 'Download CSV template',
                    onClick: () =>
                      downloadCsv('products-template.csv', [
                        [...PRODUCT_CSV_HEADERS],
                        [
                          'Sample Rice 25kg',
                          'RICE-25KG',
                          '8901001001001',
                          'Staples',
                          '1200',
                          '1450',
                          '10',
                          '5',
                          'bag',
                        ],
                      ]),
                  },
                  {
                    label: backfill.isPending ? 'Filling barcodes…' : 'Fill blank barcodes',
                    disabled: backfill.isPending,
                    onClick: () => backfill.mutate(),
                  },
                ]}
              />
            ) : null}
            {canManage ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                Add product
              </Button>
            ) : null}
          </>
        }
      />
      {importProgress ? (
        <Card
          className={cn(
            'mb-4',
            importProgress.phase === 'error' && 'border-destructive/40',
            importProgress.phase === 'done' && importProgress.failed === 0 && 'border-emerald-500/40',
          )}
          role="status"
          aria-live="polite"
        >
          <CardBody className="grid gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {importProgress.phase === 'reading' && 'Reading file…'}
                  {importProgress.phase === 'parsing' && 'Parsing CSV…'}
                  {importProgress.phase === 'importing' && 'Importing products…'}
                  {importProgress.phase === 'done' && 'Import complete'}
                  {importProgress.phase === 'error' && 'Import stopped'}
                  {importProgress.phase === 'cancelled' && 'Import cancelled'}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {importProgress.fileName}
                  {importProgress.message ? ` — ${importProgress.message}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {importBusy ? (
                  <Button size="sm" variant="outline" onClick={cancelImport}>
                    Cancel
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={dismissImport}>
                    Dismiss
                  </Button>
                )}
              </div>
            </div>
            {importProgress.total > 0 ? (
              <>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  aria-hidden
                >
                  <div
                    className={cn(
                      'h-full transition-[width] duration-300',
                      importProgress.phase === 'error' ? 'bg-destructive' : 'bg-foreground',
                    )}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((importProgress.processed / importProgress.total) * 100),
                      )}%`,
                    }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {importProgress.processed}/{importProgress.total} rows ·{' '}
                  {importProgress.created} created · {importProgress.failed} failed
                </p>
              </>
            ) : null}
            {importProgress.errors.length > 0 ? (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  Show {importProgress.errors.length} error
                  {importProgress.errors.length === 1 ? '' : 's'}
                </summary>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto font-mono text-xs">
                  {importProgress.errors.slice(0, 50).map((e, i) => (
                    <li key={`${e.line}-${i}`}>
                      L{e.line}: {e.message}
                    </li>
                  ))}
                  {importProgress.errors.length > 50 ? (
                    <li>…and {importProgress.errors.length - 50} more</li>
                  ) : null}
                </ul>
              </details>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
      <PageFilters className="sm:flex-row sm:items-center">
        <SearchInput
          placeholder="Search name, SKU, barcode…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          isFetching={list.isFetching && !list.isLoading}
          autoFocus
        />
        <Select
          className="w-full sm:w-44"
          containerClassName="w-full shrink-0 sm:w-44"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[{ value: '', label: 'All statuses' }, ...PRODUCT_STATUS_OPTIONS]}
        />
      </PageFilters>
      {list.isLoading ? (
        <TableSkeleton rows={10} cols={6} />
      ) : list.isError ? (
        <ErrorState title="Could not load products" onRetry={() => void list.refetch()} />
      ) : (
        <>
          <SimpleTable
            columns={columns}
            data={rows}
            getRowKey={(row) => row.id}
            emptyTitle={hasFilters ? 'No matching products' : 'No products yet'}
            emptyDescription={
              hasFilters
                ? 'Try a different search or clear filters'
                : 'Add your first product to start selling'
            }
            emptyAction={
              hasFilters ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('');
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setOpen(true);
                  }}
                >
                  Add product
                </Button>
              )
            }
          />
          <Pagination
            page={page}
            limit={limit}
            total={total}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        </>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit product' : 'New product'}</DialogTitle>
          </DialogHeader>
          <form
            ref={formRef}
            key={editing?.id ?? 'new'}
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const body: Record<string, unknown> = {
                name: formString(fd, 'name'),
                sku: formString(fd, 'sku'),
                barcode: formOptional(fd, 'barcode'),
                category: formOptional(fd, 'category'),
                costPrice: formNumber(fd, 'costPrice'),
                sellingPrice: formNumber(fd, 'sellingPrice'),
                unit: formString(fd, 'unit') || 'pcs',
                lowStockAt: formNumber(fd, 'lowStockAt', 5),
                status: formString(fd, 'status') || 'ACTIVE',
              };
              // Opening stock only on create — edits go through Inventory
              if (!editing) {
                body.stock = formNumber(fd, 'stock');
              }
              save.mutate(body);
            }}
          >
            <FormField label="Name">
              <Input name="name" defaultValue={editing?.name} required />
            </FormField>
            <FormField label="Category">
              <Input
                name="category"
                defaultValue={editing?.category ?? ''}
                placeholder="Optional"
              />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="SKU">
                <Input name="sku" defaultValue={editing?.sku} required />
              </FormField>
              <FormField
                label="Barcode"
                htmlFor="product-barcode"
                hint={!editing ? 'Leave blank to use SKU' : undefined}
              >
                <div className="flex gap-2">
                  <Input
                    id="product-barcode"
                    name="barcode"
                    className="min-w-0 flex-1"
                    defaultValue={editing?.barcode ?? ''}
                  />
                  <Button type="button" variant="outline" onClick={fillBarcodeFromSku}>
                    Use SKU
                  </Button>
                </div>
              </FormField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Cost">
                <Input
                  name="costPrice"
                  type="number"
                  step="0.01"
                  defaultValue={editing?.costPrice ?? 0}
                  required
                />
              </FormField>
              <FormField label="Sell">
                <Input
                  name="sellingPrice"
                  type="number"
                  step="0.01"
                  defaultValue={editing?.sellingPrice ?? 0}
                  required
                />
              </FormField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {editing ? (
                <FormField label="Stock" hint="Change via Inventory">
                  <Input value={editing.stock} disabled readOnly />
                </FormField>
              ) : (
                <FormField label="Opening stock">
                  <Input name="stock" type="number" step="0.01" defaultValue={0} />
                </FormField>
              )}
              <FormField label="Unit">
                <Select name="unit" defaultValue={editing?.unit ?? 'pcs'} options={unitOptions} />
              </FormField>
              <FormField label="Low at">
                <Input
                  name="lowStockAt"
                  type="number"
                  defaultValue={editing?.lowStockAt ?? 5}
                />
              </FormField>
            </div>
            <FormField label="Status">
              <Select
                name="status"
                defaultValue={editing?.status ?? 'ACTIVE'}
                options={PRODUCT_STATUS_OPTIONS}
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button loading={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
          {editing ? (
            <div className="mt-4 border-t border-border pt-4">
              <div className="mb-2 text-sm font-medium">Stock history</div>
              {history.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : history.isError ? (
                <p className="text-xs text-destructive">Could not load history</p>
              ) : !(history.data ?? []).length ? (
                <p className="text-xs text-muted-foreground">No movements yet</p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-auto text-xs scrollbar-none">
                  {(history.data ?? []).slice(0, 20).map((h) => (
                    <li key={h.id} className="flex justify-between gap-2">
                      <span>
                        {h.type} · {h.quantity}
                        {h.notes ? ` · ${h.notes}` : ''}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatDateTime(h.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Archive product?"
        description={
          deleteTarget
            ? `${deleteTarget.name} will be archived and hidden from the catalog.`
            : undefined
        }
        confirmLabel="Archive"
        loading={remove.isPending}
        onConfirm={() => {
          if (deleteTarget) remove.mutate(deleteTarget.id);
        }}
      />
      </PageContent>

      <div className="print-only">
        <div className="grid grid-cols-2 gap-4 p-2">
          {labelsToPrint.map((p) => (
            <div
              key={p.id}
              className="break-inside-avoid border border-black p-3 text-center"
            >
              <div className="truncate text-sm font-medium">{p.name}</div>
              <div className="text-xs text-neutral-600">{p.sku}</div>
              {p.barcode ? (
                <BarcodeSvg value={p.barcode} className="mx-auto mt-2 max-w-full" />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
