'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/utils';
import { useAuthStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { PageContent } from '@/components/ui/page-content';
import { PageHeader } from '@/components/ui/page-header';
import { MetricCard, MetricGrid } from '@/components/ui/metric-card';
import { Section } from '@/components/ui/section';
import { SimpleTable, type SimpleColumn } from '@/components/ui/simple-table';
import { MetricCardsSkeleton, TableSkeleton } from '@/components/skeletons';
import { ErrorState } from '@/components/ui/error-state';
import { DEFAULT_CURRENCY } from '@inventory/shared';

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  grandTotal: string;
  createdAt: string;
  contact?: { name: string } | null;
};

type Dashboard = {
  todaySalesTotal: number;
  todaySalesCount: number;
  totalProducts: number;
  lowStockCount: number;
  recentInvoices: InvoiceRow[];
};

export default function DashboardPage() {
  const currency = useAuthStore((s) => s.user?.defaultCurrency ?? DEFAULT_CURRENCY);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('/reports/dashboard'),
  });

  const showSkeleton = isLoading && !data;

  const columns: SimpleColumn<InvoiceRow>[] = [
    {
      id: 'invoice',
      header: 'Invoice',
      cell: (inv) => (
        <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
          {inv.invoiceNumber}
        </Link>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      cell: (inv) => (
        <span className="text-muted-foreground">{inv.contact?.name ?? 'Walk-in'}</span>
      ),
    },
    {
      id: 'total',
      header: 'Total',
      cell: (inv) => formatMoney(inv.grandTotal, currency),
    },
    {
      id: 'when',
      header: 'When',
      hideOnMobile: true,
      cell: (inv) => (
        <span className="text-muted-foreground">{formatDateTime(inv.createdAt)}</span>
      ),
    },
  ];

  return (
    <PageContent>
      <PageHeader
        title="Dashboard"
        description="What needs attention right now"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/products">Add product</Link>
            </Button>
            <Button asChild>
              <Link href="/pos">New sale</Link>
            </Button>
          </>
        }
      />

      {showSkeleton ? (
        <MetricCardsSkeleton count={4} columns={4} />
      ) : isError ? (
        <ErrorState title="Could not load dashboard" onRetry={() => void refetch()} />
      ) : (
        <MetricGrid columns={4}>
          <MetricCard label="Today's sales" value={formatMoney(data?.todaySalesTotal ?? 0, currency)} />
          <MetricCard label="Orders today" value={String(data?.todaySalesCount ?? 0)} index={1} />
          <MetricCard
            label="Products"
            value={String(data?.totalProducts ?? 0)}
            index={2}
            href="/products"
          />
          <MetricCard
            label="Low stock"
            value={String(data?.lowStockCount ?? 0)}
            index={3}
            href="/reports"
          />
        </MetricGrid>
      )}

      <Section
        title="Recent invoices"
        action={
          <Link href="/invoices" className="text-xs text-muted-foreground hover:text-foreground">
            View all
          </Link>
        }
      >
        {showSkeleton ? (
          <TableSkeleton rows={6} cols={4} />
        ) : isError ? (
          <ErrorState title="Could not load recent invoices" onRetry={() => void refetch()} />
        ) : (
          <SimpleTable
            columns={columns}
            data={data?.recentInvoices ?? []}
            getRowKey={(row) => row.id}
            emptyTitle="No invoices yet"
            emptyDescription="Start a sale from POS"
            emptyAction={
              <Button asChild size="sm">
                <Link href="/pos">Open POS</Link>
              </Button>
            }
          />
        )}
      </Section>
    </PageContent>
  );
}
