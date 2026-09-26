'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SimpleTable, type SimpleColumn } from '@/components/ui/simple-table';
import { TableSkeleton } from '@/components/skeletons';
import { ErrorState } from '@/components/ui/error-state';
import { useToast } from '@/components/ui/toaster';
import { useMemo } from 'react';

type Row = {
  id: string;
  method: string | null;
  note: string | null;
  proofRef: string | null;
  amount: string | null;
  currency: string | null;
  billingCycle: string;
  status: string;
  createdAt: string;
  plan: { name: string; slug: string };
  organization: { id: string; name: string; slug: string };
};

export default function PlatformBillingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['platform', 'billing', 'requests'],
    queryFn: () => api<Row[]>('/platform/billing/requests'),
  });

  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) =>
      api(`/platform/billing/requests/${id}`, {
        method: 'PATCH',
        body: { status, rejectReason: status === 'REJECTED' ? 'Rejected by platform admin' : undefined },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform', 'billing'] });
      toast({ title: 'Request updated' });
    },
    onError: (e: Error) =>
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const columns: SimpleColumn<Row>[] = useMemo(
    () => [
      {
        id: 'org',
        header: 'Organization',
        cell: (r) => r.organization.name,
      },
      { id: 'plan', header: 'Plan', cell: (r) => `${r.plan.name} · ${r.billingCycle}` },
      {
        id: 'amount',
        header: 'Amount',
        cell: (r) => (r.amount != null ? `${r.currency ?? ''} ${r.amount}`.trim() : '—'),
        hideOnMobile: true,
      },
      {
        id: 'method',
        header: 'Method',
        cell: (r) => r.method ?? '—',
      },
      {
        id: 'trx',
        header: 'Transaction ID',
        cell: (r) => r.proofRef ?? '—',
        hideOnMobile: true,
      },
      {
        id: 'note',
        header: 'Note',
        cell: (r) => r.note ?? '—',
        hideOnMobile: true,
      },
      {
        id: 'when',
        header: 'Submitted',
        cell: (r) => formatDateTime(r.createdAt),
        hideOnMobile: true,
      },
      {
        id: 'status',
        header: 'Status',
        cell: (r) => <Badge variant="info">{r.status}</Badge>,
      },
      {
        id: 'actions',
        header: '',
        cell: (r) =>
          r.status === 'AWAITING_REVIEW' ? (
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={review.isPending}
                onClick={() => review.mutate({ id: r.id, status: 'REJECTED' })}
              >
                Reject
              </Button>
              <Button
                size="sm"
                disabled={review.isPending}
                onClick={() => review.mutate({ id: r.id, status: 'APPROVED' })}
              >
                Approve
              </Button>
            </div>
          ) : null,
      },
    ],
    [review],
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Billing requests" description="Offline payments awaiting review" />
      {list.isLoading && !list.data ? (
        <TableSkeleton rows={6} cols={9} />
      ) : list.isError ? (
        <ErrorState title="Could not load requests" onRetry={() => void list.refetch()} />
      ) : (
        <SimpleTable
          columns={columns}
          data={list.data ?? []}
          getRowKey={(r) => r.id}
          emptyTitle="No pending requests"
        />
      )}
    </div>
  );
}
