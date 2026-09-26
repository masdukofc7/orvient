'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ActionMenu } from '@/components/ui/action-menu';
import { PageHeader } from '@/components/ui/page-header';
import { ReceiptSkeleton } from '@/components/skeletons';
import { ErrorState } from '@/components/ui/error-state';
import { useToast } from '@/components/ui/toaster';
import { useActionFlash } from '@/hooks/use-action-flash';
import { usePrintLayout } from '@/hooks/use-print-layout';
import {
  ReceiptDocument,
  type ReceiptData,
} from '@/components/receipt/receipt-document';
import { apiBaseUrl, receiptPublicUrl } from '@/lib/receipt';

async function fetchPublicReceipt(token: string): Promise<ReceiptData> {
  const res = await fetch(`${apiBaseUrl()}/receipts/${token}`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!res.ok) {
    const text = await res.text();
    let message = 'Receipt not found';
    try {
      const data = JSON.parse(text) as { message?: string };
      if (data.message) message = data.message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json() as Promise<ReceiptData>;
}

export default function PublicReceiptPage() {
  const params = useParams<{ token: string }>();
  const { toast } = useToast();
  const token = params.token;
  const pdfAction = useActionFlash();
  const copyAction = useActionFlash();

  const { data, isLoading, isError, refetch, error } = useQuery({
    queryKey: ['public-receipt', token],
    queryFn: () => fetchPublicReceipt(token),
    enabled: Boolean(token),
  });

  const { layout, printAs } = usePrintLayout(null, Boolean(data));

  async function downloadPdf() {
    try {
      await pdfAction.run(async () => {
        const res = await fetch(`${apiBaseUrl()}/receipts/${token}/pdf`);
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
    try {
      await navigator.clipboard.writeText(receiptPublicUrl(token));
      copyAction.flashSuccess();
      toast({ title: 'Link copied' });
    } catch {
      toast({ title: 'Could not copy link', variant: 'destructive' });
    }
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl space-y-6 px-3 py-4 sm:px-6 sm:py-6">
      <div className="no-print">
        <PageHeader
          title={data?.invoiceNumber ?? 'Receipt'}
          description={data?.organization?.name}
          actions={
            <>
              <Button
                variant="outline"
                onClick={() => printAs('thermal')}
                disabled={!data}
              >
                Print receipt
              </Button>
              <ActionMenu
                label="More"
                items={[
                  {
                    label: 'Print invoice',
                    disabled: !data,
                    onClick: () => printAs('a4'),
                  },
                  {
                    label: pdfAction.success ? 'Downloaded' : 'Download PDF',
                    disabled: !data || pdfAction.loading,
                    onClick: () => void downloadPdf(),
                  },
                  {
                    label: copyAction.success ? 'Copied' : 'Copy link',
                    disabled: !token,
                    onClick: () => void copyLink(),
                  },
                ]}
              />
            </>
          }
        />
      </div>

      {isLoading ? (
        <ReceiptSkeleton />
      ) : isError ? (
        <ErrorState
          title="Could not load receipt"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      ) : data ? (
        <ReceiptDocument data={data} layout={layout} />
      ) : null}
    </div>
  );
}
