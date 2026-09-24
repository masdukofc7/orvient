'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { calcPurchaseOrderTotals, DEFAULT_CURRENCY } from '@inventory/shared';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/utils';
import { useAuthStore } from '@/stores';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { startRouteNavigation } from '@/components/layout/route-progress';
import { ActionBar } from '@/components/ui/action-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { PageContent } from '@/components/ui/page-content';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { EntityPicker } from '@/components/ui/entity-picker';
import { SearchInput } from '@/components/ui/search-input';
import { QtyStepper } from '@/components/ui/qty-stepper';
import { useToast } from '@/components/ui/toaster';

type Product = {
  id: string;
  name: string;
  sku: string;
  costPrice: string;
  unit: string;
};

type Contact = { id: string; name: string; phone: string | null };

type Line = {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitCost: number;
};

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();
  const currency = useAuthStore((s) => s.user?.defaultCurrency ?? DEFAULT_CURRENCY);

  const [supplierId, setSupplierId] = useState('');
  const [supplierLabel, setSupplierLabel] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const debouncedSupplierSearch = useDebouncedValue(supplierSearch, 300);
  const [productSearch, setProductSearch] = useState('');
  const debouncedProductSearch = useDebouncedValue(productSearch, 300);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);

  const suppliers = useQuery({
    queryKey: ['suppliers-pick', debouncedSupplierSearch],
    queryFn: () =>
      api<{ data: Contact[] }>(
        `/contacts?type=SUPPLIER&limit=20${debouncedSupplierSearch ? `&search=${encodeURIComponent(debouncedSupplierSearch)}` : ''}`,
      ),
    placeholderData: keepPreviousData,
  });

  const products = useQuery({
    queryKey: ['products-pick', debouncedProductSearch],
    queryFn: () =>
      api<{ data: Product[] }>(
        `/products?limit=10&status=ACTIVE${debouncedProductSearch ? `&search=${encodeURIComponent(debouncedProductSearch)}` : ''}`,
      ),
    placeholderData: keepPreviousData,
  });

  const totals = useMemo(
    () =>
      calcPurchaseOrderTotals(
        lines.map((line) => ({ quantity: line.quantity, unitCost: line.unitCost })),
      ),
    [lines],
  );

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>('/purchase-orders', {
        method: 'POST',
        body: {
          contactId: supplierId,
          notes: notes || null,
          items: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitCost: line.unitCost,
          })),
        },
      }),
    onSuccess: (po) => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast({ title: 'Purchase order created' });
      startRouteNavigation();
      router.push(`/purchase-orders/${po.id}`);
    },
    onError: (e: Error) => {
      toast({ title: 'Failed to create PO', description: e.message, variant: 'destructive' });
    },
  });

  function addProduct(product: Product) {
    setLines((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) {
        return prev.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          quantity: 1,
          unitCost: Number(product.costPrice),
        },
      ];
    });
    setProductSearch('');
  }

  function submit() {
    if (!supplierId) {
      toast({ title: 'Select a supplier', variant: 'destructive' });
      return;
    }
    if (!lines.length) {
      toast({ title: 'Add at least one product', variant: 'destructive' });
      return;
    }
    create.mutate();
  }

  return (
    <PageContent>
      <PageHeader
        title="New purchase order"
        description="Order stock from a supplier"
        actions={
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/purchase-orders">Back</Link>
          </Button>
        }
      />

      <Card>
        <CardBody className="space-y-4">
          <FormField label="Supplier" required>
            <EntityPicker
              search={supplierSearch}
              onSearchChange={setSupplierSearch}
              searchPlaceholder="Search suppliers…"
              selectedLabel={supplierLabel || undefined}
              isLoading={suppliers.isFetching}
              items={(suppliers.data?.data ?? []).map((s) => ({
                id: s.id,
                primary: s.name,
                secondary: s.phone,
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
                }}
              >
                Clear supplier
              </button>
            ) : null}
          </FormField>

          <FormField label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </FormField>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <FormField label="Add products" required>
            <SearchInput
              placeholder="Search by name or SKU…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              onClear={() => setProductSearch('')}
            />
          </FormField>
          {products.data?.data?.length ? (
            <div className="flex flex-wrap gap-2">
              {products.data.data.map((product) => (
                <Button
                  key={product.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addProduct(product)}
                >
                  {product.name}
                </Button>
              ))}
            </div>
          ) : null}

          {lines.length ? (
            <div className="space-y-3">
              {lines.map((line) => (
                <div
                  key={line.productId}
                  className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{line.name}</div>
                    <div className="text-sm text-muted-foreground">{line.sku}</div>
                  </div>
                  <QtyStepper
                    value={line.quantity}
                    onChange={(quantity) =>
                      setLines((prev) =>
                        prev.map((row) =>
                          row.productId === line.productId ? { ...row, quantity } : row,
                        ),
                      )
                    }
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full sm:w-28"
                    value={line.unitCost}
                    onChange={(e) => {
                      const unitCost = Number(e.target.value);
                      setLines((prev) =>
                        prev.map((row) =>
                          row.productId === line.productId ? { ...row, unitCost } : row,
                        ),
                      );
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setLines((prev) => prev.filter((row) => row.productId !== line.productId))
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <div className="text-right text-sm font-medium">
                Total: {formatMoney(totals.subtotal, currency)}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Search and add products to this PO.</p>
          )}
        </CardBody>
      </Card>

      <ActionBar>
        <Button variant="outline" asChild>
          <Link href="/purchase-orders">Cancel</Link>
        </Button>
        <Button onClick={submit} loading={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create PO'}
        </Button>
      </ActionBar>
    </PageContent>
  );
}
