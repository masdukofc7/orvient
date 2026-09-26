'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ActionBar } from '@/components/ui/action-bar';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { PageContent } from '@/components/ui/page-content';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { Section } from '@/components/ui/section';
import { EntityPicker } from '@/components/ui/entity-picker';
import { SimpleTable, type SimpleColumn } from '@/components/ui/simple-table';
import { InventoryTxnBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/error-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toaster';
import { TableSkeleton } from '@/components/skeletons';
import { formatDateTime } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAuthStore } from '@/stores';

type Txn = {
  id: string;
  type: string;
  quantity: string;
  quantityBefore: string;
  quantityAfter: string;
  createdAt: string;
  notes: string | null;
  referenceType: string | null;
  referenceId: string | null;
  product: { name: string; sku: string };
};

type Product = { id: string; name: string; sku: string; stock: string };
type Contact = { id: string; name: string; phone: string | null };
type Branch = { id: string; name: string };
type LedgerPage = { data: Txn[]; total: number; page: number; limit: number };

export default function InventoryPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const currentBranchId = useAuthStore((s) => s.user?.branchId ?? '');
  const [productSearch, setProductSearch] = useState('');
  const debouncedProductSearch = useDebouncedValue(productSearch, 300);
  const [supplierSearch, setSupplierSearch] = useState('');
  const debouncedSupplierSearch = useDebouncedValue(supplierSearch, 300);
  const [productId, setProductId] = useState('');
  const [productLabel, setProductLabel] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierLabel, setSupplierLabel] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  const products = useQuery({
    queryKey: ['products-pick', debouncedProductSearch],
    queryFn: () =>
      api<{ data: Product[] }>(
        `/products?limit=10&status=ACTIVE${debouncedProductSearch ? `&search=${encodeURIComponent(debouncedProductSearch)}` : ''}`,
      ),
    placeholderData: keepPreviousData,
  });

  const suppliers = useQuery({
    queryKey: ['suppliers-pick', debouncedSupplierSearch],
    queryFn: () =>
      api<{ data: Contact[] }>(
        `/contacts?type=SUPPLIER&limit=20${debouncedSupplierSearch ? `&search=${encodeURIComponent(debouncedSupplierSearch)}` : ''}`,
      ),
    placeholderData: keepPreviousData,
  });

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api<Branch[]>('/organizations/branches'),
  });

  const otherBranches = useMemo(
    () => (branches.data ?? []).filter((b) => b.id !== currentBranchId),
    [branches.data, currentBranchId],
  );

  const supplierNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of suppliers.data?.data ?? []) map.set(s.id, s.name);
    if (supplierId && supplierLabel) map.set(supplierId, supplierLabel);
    return map;
  }, [suppliers.data, supplierId, supplierLabel]);

  useEffect(() => {
    setPage(1);
  }, [productId, limit]);

  const ledger = useQuery({
    queryKey: ['ledger', productId || 'all', page, limit],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (productId) params.set('productId', productId);
      return api<LedgerPage>(`/inventory/ledger?${params}`);
    },
    placeholderData: keepPreviousData,
  });

  const rows = ledger.data?.data ?? [];
  const total = ledger.data?.total ?? 0;

  const mutate = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      api(path, { method: 'POST', body }),
    onSuccess: () => {
      setPendingPath(null);
      setQuantity('1');
      setNotes('');
      qc.invalidateQueries({ queryKey: ['ledger'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products-pick'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['report'] });
      toast({ title: 'Stock updated' });
    },
    onError: (e: Error) => {
      setPendingPath(null);
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    },
  });

  function mutationBody(path: string) {
    const body: Record<string, unknown> = {
      productId,
      quantity: Number(quantity),
      notes: notes || null,
    };
    if (path === '/inventory/stock-in' && supplierId) {
      body.contactId = supplierId;
    }
    return body;
  }

  function request(path: string) {
    if (!productId) {
      toast({ title: 'Select a product', variant: 'destructive' });
      return;
    }
    if (!Number.isFinite(Number(quantity)) || Number(quantity) === 0) {
      toast({ title: 'Enter a valid quantity', variant: 'destructive' });
      return;
    }
    if (
      (path === '/inventory/stock-out' || path === '/inventory/adjust') &&
      !notes.trim()
    ) {
      toast({ title: 'Add a reason in Notes', variant: 'destructive' });
      return;
    }
    if (path === '/inventory/stock-out' || path === '/inventory/adjust') {
      setPendingPath(path);
      return;
    }
    setPendingPath(path);
    mutate.mutate({ path, body: mutationBody(path) });
  }

  const columns: SimpleColumn<Txn>[] = [
    {
      id: 'when',
      header: 'When',
      hideOnMobile: true,
      cell: (t) => (
        <span className="text-muted-foreground">{formatDateTime(t.createdAt)}</span>
      ),
    },
    {
      id: 'product',
      header: 'Product',
      cell: (t) => (
        <div>
          <div>{t.product.name}</div>
          <div className="text-xs text-muted-foreground">{t.product.sku}</div>
          {t.referenceType === 'Contact' && t.referenceId ? (
            <div className="text-xs text-muted-foreground">
              Supplier: {supplierNameById.get(t.referenceId) ?? t.referenceId.slice(0, 8)}
            </div>
          ) : null}
          <div className="mt-1 text-xs text-muted-foreground md:hidden">
            {formatDateTime(t.createdAt)}
          </div>
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      cell: (t) => <InventoryTxnBadge value={t.type} />,
    },
    { id: 'qty', header: 'Qty', cell: (t) => t.quantity },
    {
      id: 'delta',
      header: 'Before → After',
      hideOnMobile: true,
      cell: (t) => `${t.quantityBefore} → ${t.quantityAfter}`,
    },
  ];

  const confirmTitle =
    pendingPath === '/inventory/stock-out' ? 'Stock out?' : 'Adjust stock?';
  const confirmDescription =
    pendingPath === '/inventory/stock-out'
      ? `Remove ${quantity} from ${productLabel || 'selected product'}?`
      : `Apply quantity ${quantity} to ${productLabel || 'selected product'}?`;

  return (
    <PageContent>
      <PageHeader title="Stock" description="Receive, remove, and adjust on-hand quantities" />

      <Card className="w-full max-w-xl">
        <CardBody className="grid gap-3">
          <FormField label="Product" required>
            <EntityPicker
              search={productSearch}
              onSearchChange={setProductSearch}
              searchPlaceholder="Search product…"
              selectedLabel={productLabel || undefined}
              isLoading={products.isFetching}
              items={(products.data?.data ?? []).map((p) => ({
                id: p.id,
                primary: p.name,
                secondary: `${p.sku} · ${p.stock}`,
              }))}
              onSelect={(item) => {
                setProductId(item.id);
                setProductLabel(`${item.primary} (${item.secondary})`);
              }}
            />
            {productId ? (
              <button
                type="button"
                className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => {
                  setProductId('');
                  setProductLabel('');
                  setProductSearch('');
                }}
              >
                Clear product filter (show all ledger)
              </button>
            ) : null}
            {products.isError ? (
              <p className="mt-1 text-xs text-destructive">Could not load products</p>
            ) : null}
          </FormField>
          <FormField label="Supplier" hint="Optional — for stock in only">
            <EntityPicker
              search={supplierSearch}
              onSearchChange={setSupplierSearch}
              searchPlaceholder="Search supplier…"
              selectedLabel={supplierLabel || undefined}
              isLoading={suppliers.isFetching}
              items={(suppliers.data?.data ?? []).map((c) => ({
                id: c.id,
                primary: c.name,
                secondary: c.phone,
              }))}
              onSelect={(item) => {
                setSupplierId(item.id);
                setSupplierLabel(item.primary);
              }}
            />
            {supplierId ? (
              <button
                type="button"
                className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => {
                  setSupplierId('');
                  setSupplierLabel('');
                  setSupplierSearch('');
                }}
              >
                Clear supplier
              </button>
            ) : null}
          </FormField>
          <FormField label="Quantity" required>
            <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </FormField>
          <FormField
            label="Notes"
            required
            hint="Required for stock out and adjust"
          >
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          <ActionBar>
            <Button
              variant="outline"
              disabled={mutate.isPending || Boolean(pendingPath)}
              onClick={() => request('/inventory/adjust')}
            >
              Adjust (+/-)
            </Button>
            <Button
              variant="secondary"
              disabled={mutate.isPending || Boolean(pendingPath)}
              onClick={() => request('/inventory/stock-out')}
            >
              Stock out
            </Button>
            <Button
              loading={mutate.isPending && pendingPath === '/inventory/stock-in'}
              disabled={mutate.isPending || Boolean(pendingPath && pendingPath !== '/inventory/stock-in')}
              onClick={() => request('/inventory/stock-in')}
            >
              Stock in
            </Button>
          </ActionBar>
          {otherBranches.length ? (
            <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <FormField label="Transfer to branch" required>
                <Select
                  value={toBranchId}
                  onChange={(e) => setToBranchId(e.target.value)}
                  options={[
                    { value: '', label: 'Select branch…' },
                    ...otherBranches.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                />
              </FormField>
              <Button
                className="w-full sm:w-auto sm:justify-self-end"
                variant="secondary"
                disabled={mutate.isPending || Boolean(pendingPath) || !toBranchId}
                onClick={() => {
                  if (!productId) {
                    toast({ title: 'Select a product', variant: 'destructive' });
                    return;
                  }
                  if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
                    toast({ title: 'Enter a positive quantity', variant: 'destructive' });
                    return;
                  }
                  if (!currentBranchId || !toBranchId) {
                    toast({ title: 'Pick a destination branch', variant: 'destructive' });
                    return;
                  }
                  setPendingPath('/inventory/transfer');
                  mutate.mutate({
                    path: '/inventory/transfer',
                    body: {
                      productId,
                      quantity: Number(quantity),
                      fromBranchId: currentBranchId,
                      toBranchId,
                      notes: notes || null,
                    },
                  });
                }}
              >
                Transfer
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Section title="Ledger">
        {ledger.isLoading && !ledger.data ? (
          <TableSkeleton rows={8} cols={5} />
        ) : ledger.isError ? (
          <ErrorState title="Could not load ledger" onRetry={() => void ledger.refetch()} />
        ) : (
          <>
            <SimpleTable
              columns={columns}
              data={rows}
              getRowKey={(row) => row.id}
              emptyTitle={
                productId ? 'No movements for this product' : 'No stock movements yet'
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
      </Section>

      <ConfirmDialog
        open={Boolean(pendingPath)}
        onOpenChange={(v) => !v && setPendingPath(null)}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel="Confirm"
        variant={pendingPath === '/inventory/stock-out' ? 'destructive' : 'default'}
        loading={mutate.isPending}
        onConfirm={() => {
          if (!pendingPath) return;
          mutate.mutate({
            path: pendingPath,
            body: mutationBody(pendingPath),
          });
        }}
      />
    </PageContent>
  );
}
