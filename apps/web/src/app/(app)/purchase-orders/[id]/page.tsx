'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_CURRENCY } from '@inventory/shared';
import { api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/utils';
import { useAuthStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { ActionBar } from '@/components/ui/action-bar';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { PageContent } from '@/components/ui/page-content';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { SimpleTable, type SimpleColumn } from '@/components/ui/simple-table';
import { PurchaseOrderStatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState } from '@/components/ui/error-state';
import { DetailPageSkeleton } from '@/components/skeletons';
import { useToast } from '@/components/ui/toaster';

type PoItem = {
  id: string;
  quantityOrdered: string;
  quantityReceived: string;
  unitCost: string;
  lineTotal: string;
  product: { id: string; name: string; sku: string; unit: string };
};

type PurchaseOrder = {
  id: string;
  poNumber: string;
  status: string;
  currency: string;
  subtotal: string;
  notes: string | null;
  createdAt: string;
  receivedAt: string | null;
  contact?: { name: string; phone: string | null; address: string | null } | null;
  items: PoItem[];
};

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { toast } = useToast();
  const currency = useAuthStore((s) => s.user?.defaultCurrency ?? DEFAULT_CURRENCY);
  const [receiveNotes, setReceiveNotes] = useState('');
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [cancelOpen, setCancelOpen] = useState(false);

  const po = useQuery({
    queryKey: ['purchase-order', params.id],
    queryFn: () => api<PurchaseOrder>(`/purchase-orders/${params.id}`),
  });

  const pendingItems = useMemo(() => {
    if (!po.data) return [];
    return po.data.items
      .map((item) => {
        const pending = Number(item.quantityOrdered) - Number(item.quantityReceived);
        return { ...item, pending };
      })
      .filter((item) => item.pending > 0);
  }, [po.data]);

  const receive = useMutation({
    mutationFn: () => {
      const items = pendingItems
        .map((item) => ({
          itemId: item.id,
          quantity: Number(receiveQty[item.id] ?? item.pending),
        }))
        .filter((item) => item.quantity > 0);
      return api(`/purchase-orders/${params.id}/receive`, {
        method: 'POST',
        body: { items, notes: receiveNotes || null },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-order', params.id] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['ledger'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['report'] });
      setReceiveNotes('');
      setReceiveQty({});
      toast({ title: 'Stock received' });
    },
    onError: (e: Error) => {
      toast({ title: 'Receive failed', description: e.message, variant: 'destructive' });
    },
  });

  const cancel = useMutation({
    mutationFn: () =>
      api(`/purchase-orders/${params.id}/cancel`, {
        method: 'POST',
      }),
    onSuccess: () => {
      setCancelOpen(false);
      qc.invalidateQueries({ queryKey: ['purchase-order', params.id] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast({ title: 'Purchase order cancelled' });
    },
    onError: (e: Error) => {
      toast({ title: 'Cancel failed', description: e.message, variant: 'destructive' });
    },
  });

  const columns: SimpleColumn<PoItem>[] = [
    {
      id: 'product',
      header: 'Product',
      cell: (item) => (
        <div>
          <div className="font-medium">{item.product.name}</div>
          <div className="text-sm text-muted-foreground">{item.product.sku}</div>
        </div>
      ),
    },
    {
      id: 'ordered',
      header: 'Ordered',
      cell: (item) => item.quantityOrdered,
    },
    {
      id: 'received',
      header: 'Received',
      cell: (item) => item.quantityReceived,
    },
    {
      id: 'cost',
      header: 'Unit cost',
      hideOnMobile: true,
      cell: (item) => formatMoney(item.unitCost, po.data?.currency || currency),
    },
    {
      id: 'lineTotal',
      header: 'Line total',
      cell: (item) => formatMoney(item.lineTotal, po.data?.currency || currency),
    },
  ];

  if (po.isLoading && !po.data) return <DetailPageSkeleton />;
  if (po.isError || !po.data) {
    return <ErrorState title="Could not load purchase order" onRetry={() => void po.refetch()} />;
  }

  const data = po.data;
  const canReceive = data.status === 'ORDERED' || data.status === 'PARTIAL';
  const canCancel = data.status === 'ORDERED';

  return (
    <PageContent>
      <PageHeader
        title={data.poNumber}
        description="Purchase order detail"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/purchase-orders">Back</Link>
            </Button>
            {canCancel ? (
              <Button variant="outline" onClick={() => setCancelOpen(true)}>
                Cancel PO
              </Button>
            ) : null}
          </>
        }
      />

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-sm text-muted-foreground">Supplier</div>
            <div className="font-medium">{data.contact?.name ?? '—'}</div>
            {data.contact?.phone ? (
              <div className="text-sm text-muted-foreground">{data.contact.phone}</div>
            ) : null}
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Status</div>
            <PurchaseOrderStatusBadge value={data.status} />
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Created</div>
            <div>{formatDateTime(data.createdAt)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Total</div>
            <div className="font-medium">{formatMoney(data.subtotal, data.currency || currency)}</div>
          </div>
          {data.notes ? (
            <div className="sm:col-span-2">
              <div className="text-sm text-muted-foreground">Notes</div>
              <div>{data.notes}</div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <SimpleTable columns={columns} data={data.items} getRowKey={(row) => row.id} />

      {canReceive ? (
        <Card>
          <CardBody className="space-y-4">
            <div className="font-medium">Receive stock</div>
            <div className="space-y-3">
              {pendingItems.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-medium">{item.product.name}</div>
                    <div className="text-sm text-muted-foreground">
                      Pending: {item.pending} {item.product.unit}
                    </div>
                  </div>
                  <FormField label="Receive qty">
                    <Input
                      type="number"
                      min="0"
                      max={item.pending}
                      step="0.0001"
                      className="w-full sm:w-32"
                      value={receiveQty[item.id] ?? String(item.pending)}
                      onChange={(e) =>
                        setReceiveQty((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                    />
                  </FormField>
                </div>
              ))}
            </div>
            <FormField label="Receive notes">
              <Input
                value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                placeholder="Optional"
              />
            </FormField>
            <ActionBar>
              <Button
                onClick={() => receive.mutate()}
                disabled={!pendingItems.length}
                loading={receive.isPending}
              >
                {receive.isPending ? 'Receiving…' : 'Receive stock'}
              </Button>
            </ActionBar>
          </CardBody>
        </Card>
      ) : null}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel purchase order?"
        description="This PO has not received any stock yet. You can create a new one later."
        confirmLabel="Cancel PO"
        onConfirm={() => cancel.mutate()}
        loading={cancel.isPending}
      />
    </PageContent>
  );
}
