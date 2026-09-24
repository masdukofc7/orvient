'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-token';
import { receiptPublicUrl, apiBaseUrl } from '@/lib/receipt';
import { formatMoney } from '@/lib/utils';
import { useActionFlash } from '@/hooks/use-action-flash';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { PageHeader } from '@/components/ui/page-header';
import { PageContent } from '@/components/ui/page-content';
import { ReceiptSkeleton } from '@/components/skeletons';
import { useToast } from '@/components/ui/toaster';
import { InvoiceStatusBadge, PaymentStatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/error-state';
import { ReceiptDocument, type ReceiptData } from '@/components/receipt/receipt-document';
import { usePrintLayout, parsePrintQuery } from '@/hooks/use-print-layout';
import { isStaffRole, DEFAULT_CURRENCY } from '@inventory/shared';
import { useAuthStore } from '@/stores';

function InvoiceDetailInner() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [voidOpen, setVoidOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const canVoid = isStaffRole(useAuthStore((s) => s.user?.membershipRole));
  const pdfAction = useActionFlash();
  const copyAction = useActionFlash();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['invoice', params.id],
    queryFn: () => api<ReceiptData>(`/invoices/${params.id}`),
  });

  const { layout, printAs } = usePrintLayout(parsePrintQuery(search.get('print')), Boolean(data));

  const balanceDue = data
    ? Math.max(Number(data.grandTotal) - Number(data.paidAmount), 0)
    : 0;
  const canRecordPayment =
    data?.status === 'FINALIZED' &&
    data.paymentStatus !== 'VOID' &&
    data.paymentStatus !== 'PAID' &&
    balanceDue > 0;

  useEffect(() => {
    if (!data) return;
    const prev = document.title;
    document.title = data.invoiceNumber;
    return () => {
      document.title = prev;
    };
  }, [data]);

  const invalidateInvoice = () => {
    qc.invalidateQueries({ queryKey: ['invoice', params.id] });
    qc.invalidateQueries({ queryKey: ['invoices'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['ledger'] });
    qc.invalidateQueries({ queryKey: ['report'] });
  };

  const voidInvoice = useMutation({
    mutationFn: () => api(`/invoices/${params.id}/void`, { method: 'POST' }),
    onSuccess: () => {
      setVoidOpen(false);
      invalidateInvoice();
      toast({ title: 'Invoice voided' });
    },
    onError: (e: Error) =>
      toast({ title: 'Void failed', description: e.message, variant: 'destructive' }),
  });

  const returnInvoice = useMutation({
    mutationFn: () => api(`/invoices/${params.id}/return`, { method: 'POST' }),
    onSuccess: () => {
      setReturnOpen(false);
      invalidateInvoice();
      toast({ title: 'Sale returned — stock restored' });
    },
    onError: (e: Error) =>
      toast({ title: 'Return failed', description: e.message, variant: 'destructive' }),
  });

  const finalizeQuote = useMutation({
    mutationFn: () => api(`/invoices/${params.id}/finalize`, { method: 'POST' }),
    onSuccess: () => {
      invalidateInvoice();
      toast({ title: 'Quote finalized' });
    },
    onError: (e: Error) =>
      toast({ title: 'Finalize failed', description: e.message, variant: 'destructive' }),
  });

  const recordPayment = useMutation({
    mutationFn: (amount: number) =>
      api(`/invoices/${params.id}/payments`, { method: 'POST', body: { amount } }),
    onSuccess: () => {
      setPayOpen(false);
      setPayAmount('');
      qc.invalidateQueries({ queryKey: ['invoice', params.id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast({ title: 'Payment recorded' });
    },
    onError: (e: Error) =>
      toast({ title: 'Payment failed', description: e.message, variant: 'destructive' }),
  });

  async function downloadPdf() {
    try {
      await pdfAction.run(async () => {
        const token = getAccessToken();
        const res = await fetch(`${apiBaseUrl()}/invoices/${params.id}/pdf`, {
          credentials: 'include',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (!res.ok) throw new Error('Download failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${data?.invoiceNumber ?? 'invoice'}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      });
    } catch (e) {
      toast({
        title: 'PDF download failed',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    }
  }

  async function copyLink() {
    if (!data?.receiptToken) return;
    try {
      await navigator.clipboard.writeText(receiptPublicUrl(data.receiptToken));
      copyAction.flashSuccess();
      toast({ title: 'Receipt link copied' });
    } catch {
      toast({ title: 'Could not copy link', variant: 'destructive' });
    }
  }

  return (
    <PageContent>
      <div className="no-print">
        <PageHeader
          title={data?.invoiceNumber ?? 'Invoice'}
          description={
            data ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <InvoiceStatusBadge value={data.status} />
                {data.paymentStatus ? <PaymentStatusBadge value={data.paymentStatus} /> : null}
              </span>
            ) : undefined
          }
          actions={
            <>
              <Button asChild variant="outline">
                <Link href="/invoices">Back</Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => printAs('thermal')}
                disabled={!data}
              >
                Print receipt
              </Button>
              <Button variant="outline" onClick={() => printAs('a4')} disabled={!data}>
                Print invoice
              </Button>
              <Button
                variant="outline"
                onClick={() => void downloadPdf()}
                disabled={!data}
                loading={pdfAction.loading}
                success={pdfAction.success}
              >
                {pdfAction.success ? 'Downloaded' : 'Download PDF'}
              </Button>
              <Button
                variant="outline"
                onClick={() => void copyLink()}
                disabled={!data?.receiptToken}
                success={copyAction.success}
              >
                {copyAction.success ? 'Copied' : 'Copy link'}
              </Button>
              {canRecordPayment ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setPayAmount(String(balanceDue));
                    setPayOpen(true);
                  }}
                >
                  Record payment
                </Button>
              ) : null}
              {canVoid && data?.status === 'DRAFT' ? (
                <Button
                  disabled={finalizeQuote.isPending}
                  loading={finalizeQuote.isPending}
                  onClick={() => finalizeQuote.mutate()}
                >
                  Finalize quote
                </Button>
              ) : null}
              {canVoid && data?.status === 'FINALIZED' ? (
                <>
                  <Button
                    variant="outline"
                    disabled={returnInvoice.isPending}
                    onClick={() => setReturnOpen(true)}
                  >
                    Return
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={voidInvoice.isPending}
                    onClick={() => setVoidOpen(true)}
                  >
                    Void
                  </Button>
                </>
              ) : null}
            </>
          }
        />
      </div>

      {isLoading && !data ? (
        <ReceiptSkeleton />
      ) : isError ? (
        <ErrorState title="Could not load invoice" onRetry={() => void refetch()} />
      ) : data ? (
        <ReceiptDocument data={data} layout={layout} />
      ) : null}

      <ConfirmDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title="Void this invoice?"
        description="Stock will be restored and the sale marked void. This cannot be undone."
        confirmLabel="Void invoice"
        loading={voidInvoice.isPending}
        onConfirm={() => voidInvoice.mutate()}
      />

      <ConfirmDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        title="Return this sale?"
        description="Full return: stock is restored at the sale branch and the invoice is voided."
        confirmLabel="Return sale"
        loading={returnInvoice.isPending}
        onConfirm={() => returnInvoice.mutate()}
      />

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const amount = Number(payAmount);
              if (!Number.isFinite(amount) || amount <= 0) {
                toast({
                  title: 'Invalid amount',
                  description: 'Enter a positive payment amount.',
                  variant: 'destructive',
                });
                return;
              }
              recordPayment.mutate(amount);
            }}
          >
            <FormField
              label="Amount"
              hint={`Balance due: ${formatMoney(balanceDue, data?.currency ?? DEFAULT_CURRENCY)}`}
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>
                Cancel
              </Button>
              <Button loading={recordPayment.isPending}>
                {recordPayment.isPending ? 'Saving…' : 'Save payment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContent>
  );
}

function InvoiceDetailFallback() {
  return (
    <PageContent>
      <PageHeader
        title="Invoice"
        actions={
          <Button asChild variant="outline">
            <Link href="/invoices">Back</Link>
          </Button>
        }
      />
      <ReceiptSkeleton />
    </PageContent>
  );
}

export default function InvoiceDetailPage() {
  return (
    <Suspense fallback={<InvoiceDetailFallback />}>
      <InvoiceDetailInner />
    </Suspense>
  );
}
