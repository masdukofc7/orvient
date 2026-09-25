'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { calcInvoiceTotals, DEFAULT_CURRENCY } from '@inventory/shared';
import { api } from '@/lib/api';
import { formatMoney, cn } from '@/lib/utils';
import { useAuthStore, usePosStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { PageHeader } from '@/components/ui/page-header';
import { PageContent } from '@/components/ui/page-content';
import { Card, CardBody } from '@/components/ui/card';
import { SearchInput } from '@/components/ui/search-input';
import { EntityPicker } from '@/components/ui/entity-picker';
import { EmptyState } from '@/components/ui/empty-state';
import { QtyStepper } from '@/components/ui/qty-stepper';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toaster';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

type Product = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  sellingPrice: string;
  costPrice: string;
  stock: string;
};

type Contact = { id: string; name: string; phone: string | null; email?: string | null; type: string };

export default function PosPage() {
  const scanRef = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState('');
  const debouncedScan = useDebouncedValue(scan, 250);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const debouncedContactSearch = useDebouncedValue(contactSearch, 300);
  const [newContactName, setNewContactName] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [stockWarnOpen, setStockWarnOpen] = useState(false);
  const [payMode, setPayMode] = useState<'PAID' | 'PARTIAL' | 'UNPAID'>('PAID');
  const [partialAmount, setPartialAmount] = useState('');
  const { toast } = useToast();
  const qc = useQueryClient();
  const currency = useAuthStore((s) => s.user?.defaultCurrency ?? DEFAULT_CURRENCY);
  const {
    lines,
    contactId,
    contactName,
    discount,
    taxRate,
    notes,
    addOrIncrement,
    setQuantity,
    removeLine,
    setContact,
    setDiscount,
    setTaxRate,
    setNotes,
    clear,
    held,
    holdCart,
    resumeHeld,
    discardHeld,
  } = usePosStore();

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  const stockIssues = useMemo(
    () =>
      lines.filter((l) => typeof l.stock === 'number' && l.quantity > l.stock),
    [lines],
  );

  const contacts = useQuery({
    queryKey: ['contacts', debouncedContactSearch, 'CUSTOMER'],
    queryFn: () =>
      api<{ data: Contact[] }>(
        `/contacts?type=CUSTOMER&limit=20${debouncedContactSearch ? `&search=${encodeURIComponent(debouncedContactSearch)}` : ''}`,
      ),
    enabled: contactOpen,
    placeholderData: keepPreviousData,
  });

  // Scanner stays quiet during fast barcode dumps; after a pause, show matches
  // for name / SKU / numeric queries alike.
  const searchQuery = debouncedScan.trim();
  const isSearchMode = searchQuery.length >= 2 && scan.trim() === searchQuery;

  const productMatches = useQuery({
    queryKey: ['pos-product-search', searchQuery],
    queryFn: () =>
      api<{ data: Product[] }>(
        `/products?limit=8&status=ACTIVE&search=${encodeURIComponent(searchQuery)}`,
      ),
    enabled: isSearchMode,
    placeholderData: keepPreviousData,
  });

  const totals = useMemo(
    () =>
      calcInvoiceTotals({
        items: lines.map((l) => ({
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
        discount,
        taxRate,
      }),
    [lines, discount, taxRate],
  );

  const checkout = useMutation({
    mutationFn: (opts?: { asQuote?: boolean }) => {
      const asQuote = Boolean(opts?.asQuote);
      const body: Record<string, unknown> = {
        contactId,
        discount,
        taxRate,
        notes: notes || null,
        paymentStatus: asQuote ? 'UNPAID' : payMode,
        asQuote,
        items: lines.map((l) => ({
          productId: l.productId,
          name: l.name,
          sku: l.sku,
          barcode: l.barcode,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          costPrice: l.costPrice,
        })),
      };
      if (!asQuote && payMode === 'PARTIAL') {
        const amount = Number(partialAmount);
        if (!Number.isFinite(amount) || amount <= 0 || amount >= totals.grandTotal) {
          return Promise.reject(
            new Error('Partial amount must be between 0 and total'),
          );
        }
        body.paidAmount = amount;
      }
      return api<{ id: string; invoiceNumber: string }>('/invoices', {
        method: 'POST',
        body,
      });
    },
    onSuccess: (invoice, vars) => {
      const asQuote = Boolean(vars?.asQuote);
      toast({ title: asQuote ? `Quote ${invoice.invoiceNumber}` : `Sold ${invoice.invoiceNumber}` });
      clear();
      setPayMode('PAID');
      setPartialAmount('');
      setStockWarnOpen(false);
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['products-pick'] });
      qc.invalidateQueries({ queryKey: ['ledger'] });
      qc.invalidateQueries({ queryKey: ['report'] });
      window.open(
        asQuote ? `/invoices/${invoice.id}` : `/invoices/${invoice.id}?print=1`,
        '_blank',
      );
      scanRef.current?.focus();
    },
    onError: (e: Error) =>
      toast({ title: 'Checkout failed', description: e.message, variant: 'destructive' }),
  });

  function requestCharge() {
    if (!lines.length || checkout.isPending) return;
    if (payMode === 'PARTIAL') {
      const amount = Number(partialAmount);
      if (!partialAmount.trim() || !Number.isFinite(amount) || amount <= 0 || amount >= totals.grandTotal) {
        toast({
          title: 'Enter amount paid',
          description: 'Must be greater than 0 and less than total',
          variant: 'destructive',
        });
        return;
      }
    }
    if (stockIssues.length) {
      setStockWarnOpen(true);
      return;
    }
    checkout.mutate(undefined);
  }

  const requestChargeRef = useRef(requestCharge);
  requestChargeRef.current = requestCharge;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        requestChargeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function addProduct(product: Product, cacheKey?: string) {
    const stock = Number(product.stock);
    addOrIncrement({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      unitPrice: Number(product.sellingPrice),
      costPrice: Number(product.costPrice),
      stock,
    });
    if (stock <= 0) {
      toast({
        title: 'Out of stock',
        description: `${product.name} has ${stock} on hand`,
        variant: 'destructive',
      });
    } else {
      toast({ title: `Added ${product.name}` });
    }
    if (cacheKey) {
      try {
        localStorage.setItem(`barcode-cache:${cacheKey}`, JSON.stringify(product));
      } catch {
        /* ignore */
      }
    }
    setScan('');
    scanRef.current?.focus();
  }

  async function lookupAndAdd(code: string) {
    const value = code.trim();
    if (!value) return;
    try {
      let product: Product | null = null;

      // Default: treat Enter as scanner (exact barcode), then fall back to search.
      try {
        product = await api<Product>(`/products/by-barcode/${encodeURIComponent(value)}`);
      } catch {
        /* not a barcode — try name/sku search */
      }

      if (!product) {
        const res = await api<{ data: Product[] }>(
          `/products?limit=8&status=ACTIVE&search=${encodeURIComponent(value)}`,
        );
        if (res.data.length === 1) {
          product = res.data[0];
        } else if (res.data.length > 1) {
          const exact = res.data.find(
            (p) =>
              p.name.toLowerCase() === value.toLowerCase() ||
              p.sku.toLowerCase() === value.toLowerCase(),
          );
          if (exact) {
            product = exact;
          } else {
            toast({
              title: 'Multiple matches',
              description: 'Pick a product from the list',
            });
            return;
          }
        }
      }

      if (!product) {
        toast({ title: 'Product not found', variant: 'destructive' });
        return;
      }
      addProduct(product, value);
    } catch (e) {
      try {
        const cached = localStorage.getItem(`barcode-cache:${value}`);
        if (cached) {
          addProduct(JSON.parse(cached) as Product, value);
          return;
        }
      } catch {
        /* ignore */
      }
      toast({
        title: 'Lookup failed',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    }
  }

  const createContact = useMutation({
    mutationFn: (name: string) =>
      api<Contact>('/contacts', {
        method: 'POST',
        body: { name, type: 'CUSTOMER' },
      }),
    onSuccess: (c) => {
      setContact(c.id, c.name);
      setContactOpen(false);
      setNewContactName('');
      qc.invalidateQueries({ queryKey: ['contacts'] });
      toast({ title: 'Customer added' });
    },
    onError: (e: Error) =>
      toast({ title: 'Could not create customer', description: e.message, variant: 'destructive' }),
  });

  const chargeButton = (
    <div className="grid gap-2">
      <Button
        className="h-11 w-full"
        disabled={!lines.length}
        loading={checkout.isPending && !stockWarnOpen}
        onClick={requestCharge}
      >
        {checkout.isPending && !stockWarnOpen
          ? 'Charging…'
          : `Charge ${formatMoney(totals.grandTotal, currency)}`}
      </Button>
      <Button
        className="h-10 w-full"
        variant="outline"
        disabled={!lines.length || checkout.isPending}
        onClick={() => checkout.mutate({ asQuote: true })}
      >
        Save quote
      </Button>
    </div>
  );

  return (
    <PageContent className="pb-[calc(9.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <PageHeader
        title="POS"
        description="Scan or search to add items · F2 charge on desktop"
        actions={
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            disabled={!lines.length}
            onClick={() => setClearOpen(true)}
          >
            Clear
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-3">
          <Input
            ref={scanRef}
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text/plain').trim();
              if (!text) return;
              e.preventDefault();
              void lookupAndAdd(text);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                lookupAndAdd(scan);
              }
              if (e.key === 'Escape') {
                setScan('');
              }
            }}
            placeholder="Scan barcode…"
            className="h-12 text-base"
            aria-label="Scan barcode or search"
            autoFocus
          />

          {isSearchMode ? (
            <div className="max-h-56 overflow-auto rounded-xl border border-border bg-card scrollbar-none">
              {productMatches.isFetching && !productMatches.data ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">Searching…</p>
              ) : productMatches.data?.data.length ? (
                productMatches.data.data.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 border-b border-border/70 px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                    onClick={() => addProduct(p)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {p.sku}
                        {p.barcode ? ` · ${p.barcode}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {formatMoney(p.sellingPrice, currency)}
                    </span>
                  </button>
                ))
              ) : (
                <EmptyState
                  title={productMatches.isError ? 'Search failed' : 'No matching products'}
                  className="py-8"
                />
              )}
            </div>
          ) : null}

          <div className="hidden overflow-x-auto rounded-xl border border-border scrollbar-none md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const overStock =
                    typeof line.stock === 'number' && line.quantity > line.stock;
                  return (
                    <tr key={line.key} className="border-b border-border/70">
                      <td className="px-3 py-2">
                        <div className="font-medium">{line.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {line.sku}
                          {typeof line.stock === 'number' ? ` · stock ${line.stock}` : ''}
                        </div>
                        {overStock ? (
                          <div className="text-xs text-destructive">Over available stock</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <QtyStepper
                          value={line.quantity}
                          onChange={(n) => setQuantity(line.key, n)}
                        />
                      </td>
                      <td className="px-3 py-2">{formatMoney(line.unitPrice, currency)}</td>
                      <td className="px-3 py-2">
                        {formatMoney(line.unitPrice * line.quantity, currency)}
                      </td>
                      <td className="px-3 py-2">
                        <Button size="sm" variant="ghost" onClick={() => removeLine(line.key)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {!lines.length ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState title="Ready for barcode input" />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 md:hidden">
            {lines.length ? (
              lines.map((line) => {
                const overStock =
                  typeof line.stock === 'number' && line.quantity > line.stock;
                return (
                  <Card key={line.key}>
                    <CardBody className="space-y-3 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{line.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {line.sku}
                            {typeof line.stock === 'number' ? ` · stock ${line.stock}` : ''}
                          </div>
                          {overStock ? (
                            <div className="text-xs text-destructive">Over available stock</div>
                          ) : null}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => removeLine(line.key)}>
                          Remove
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <FormField label="Qty">
                          <QtyStepper
                            value={line.quantity}
                            onChange={(n) => setQuantity(line.key, n)}
                          />
                        </FormField>
                        <div className="flex flex-col justify-end text-right text-sm">
                          <span className="text-muted-foreground">
                            {formatMoney(line.unitPrice, currency)} each
                          </span>
                          <span className="font-medium">
                            {formatMoney(line.unitPrice * line.quantity, currency)}
                          </span>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                );
              })
            ) : (
              <Card>
                <EmptyState title="Ready for barcode input" />
              </Card>
            )}
          </div>
        </div>

        <Card className="lg:sticky lg:top-6 lg:self-start">
          <CardBody className="space-y-4">
            <FormField label="Customer">
              <div className="flex gap-2">
                <button
                  type="button"
                  className={cn(
                    'flex h-10 min-w-0 flex-1 items-center rounded-md border border-input bg-background px-3 text-left text-base text-foreground sm:h-9 sm:text-sm',
                    !contactName && 'text-muted-foreground',
                  )}
                  onClick={() => setContactOpen(true)}
                >
                  {contactName ?? 'Select or create customer'}
                </button>
                {contactId ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 shrink-0 sm:h-9"
                    aria-label="Clear customer"
                    onClick={() => setContact(null, null)}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Discount">
                <Input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                />
              </FormField>
              <FormField label="Tax %">
                <Input
                  type="number"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                />
              </FormField>
            </div>
            <FormField label="Notes">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormField>
            <FormField label="Payment">
              <Select
                value={payMode}
                onChange={(e) =>
                  setPayMode(e.target.value as 'PAID' | 'PARTIAL' | 'UNPAID')
                }
                options={[
                  { value: 'PAID', label: 'Paid' },
                  { value: 'PARTIAL', label: 'Partial' },
                  { value: 'UNPAID', label: 'Pay later' },
                ]}
              />
            </FormField>
            {payMode === 'PARTIAL' ? (
              <FormField label="Amount paid" required>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  required
                />
              </FormField>
            ) : null}
            {stockIssues.length ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {stockIssues.length} line{stockIssues.length > 1 ? 's' : ''} exceed available stock
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={!lines.length}
                onClick={() => {
                  holdCart();
                  toast({ title: 'Cart held' });
                }}
              >
                Hold
              </Button>
            </div>
            {held.length ? (
              <div className="space-y-2 rounded-md border border-border p-2 text-sm">
                <p className="text-xs font-medium text-muted-foreground">Held carts</p>
                {held.map((h) => (
                  <div key={h.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left underline-offset-2 hover:underline"
                      onClick={() => resumeHeld(h.id)}
                    >
                      {h.label} ({h.lines.length})
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => discardHeld(h.id)}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="space-y-1 border-t border-border pt-4 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatMoney(totals.subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span>{formatMoney(totals.taxAmount, currency)}</span>
              </div>
              <div className="flex justify-between text-lg font-semibold">
                <span>Total</span>
                <span>{formatMoney(totals.grandTotal, currency)}</span>
              </div>
            </div>
            <div className="hidden lg:block">{chargeButton}</div>
          </CardBody>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background/95 p-3 backdrop-blur lg:hidden">
        {chargeButton}
      </div>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select customer</DialogTitle>
          </DialogHeader>
          <EntityPicker
            search={contactSearch}
            onSearchChange={setContactSearch}
            searchPlaceholder="Search name, phone, email…"
            isLoading={contacts.isFetching}
            items={(contacts.data?.data ?? []).map((c) => ({
              id: c.id,
              primary: c.name,
              secondary: c.phone || c.email,
            }))}
            onSelect={(item) => {
              setContact(item.id, item.primary);
              setContactOpen(false);
            }}
          />
          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
            <SearchInput
              containerClassName="max-w-none flex-1"
              placeholder="Quick create name"
              value={newContactName}
              onChange={(e) => setNewContactName(e.target.value)}
              onClear={() => setNewContactName('')}
            />
            <Button
              className="w-full shrink-0 sm:ml-auto sm:w-auto"
              disabled={!newContactName.trim()}
              loading={createContact.isPending}
              onClick={() => createContact.mutate(newContactName.trim())}
            >
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear cart?"
        description="All lines, customer, and totals on this sale will be removed."
        confirmLabel="Clear cart"
        onConfirm={() => {
          clear();
          setClearOpen(false);
          scanRef.current?.focus();
        }}
      />

      <ConfirmDialog
        open={stockWarnOpen}
        onOpenChange={setStockWarnOpen}
        title="Charge with low stock?"
        description={`${stockIssues.map((l) => l.name).join(', ')} exceed available stock. Charge anyway?`}
        confirmLabel="Charge anyway"
        variant="default"
        loading={checkout.isPending}
        onConfirm={() => checkout.mutate(undefined)}
      />
    </PageContent>
  );
}
