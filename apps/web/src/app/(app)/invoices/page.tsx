'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import {
  DEFAULT_CURRENCY,
  INVOICE_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
} from '@inventory/shared';
import { api } from '@/lib/api';
import { notifyError } from '@/lib/notify';
import { formatDateTime, formatMoney } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAuthStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { PageContent, PageFilters } from '@/components/ui/page-content';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { SimpleTable, type SimpleColumn } from '@/components/ui/simple-table';
import { InvoicePaymentBadges } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/error-state';
import { LoadMoreButton } from '@/components/ui/load-more-button';
import { TableSkeleton } from '@/components/skeletons';

type Invoice = {
  id: string;
  invoiceNumber: string;
  grandTotal: string;
  paymentStatus: string;
  status: string;
  currency: string;
  createdAt: string;
  contact?: { name: string } | null;
};

type InvoicePage = { data: Invoice[]; nextCursor: string | null };

export default function InvoicesPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const currency = useAuthStore((s) => s.user?.defaultCurrency ?? DEFAULT_CURRENCY);

  const list = useInfiniteQuery({
    queryKey: ['invoices', debouncedSearch, statusFilter, paymentFilter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);
      if (paymentFilter) params.set('paymentStatus', paymentFilter);
      if (pageParam) params.set('cursor', pageParam);
      return api<InvoicePage>(`/invoices?${params}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(
    () => list.data?.pages.flatMap((p) => p.data) ?? [],
    [list.data],
  );

  const columns: SimpleColumn<Invoice>[] = [
    {
      id: 'number',
      header: 'Number',
      cell: (inv) => (
        <Link className="font-medium hover:underline" href={`/invoices/${inv.id}`}>
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
      id: 'status',
      header: 'Status',
      cell: (inv) => (
        <InvoicePaymentBadges status={inv.status} paymentStatus={inv.paymentStatus} />
      ),
    },
    {
      id: 'total',
      header: 'Total',
      cell: (inv) => formatMoney(inv.grandTotal, inv.currency || currency),
    },
    {
      id: 'date',
      header: 'Date',
      hideOnMobile: true,
      cell: (inv) => (
        <span className="text-muted-foreground">{formatDateTime(inv.createdAt)}</span>
      ),
    },
  ];

  const hasFilters = Boolean(debouncedSearch || statusFilter || paymentFilter);

  return (
    <PageContent>
      <PageHeader
        title="Invoices"
        description="Completed sales, payments, and invoice lookup"
        actions={
          <Button asChild className="w-full sm:w-auto">
            <Link href="/pos">New invoice</Link>
          </Button>
        }
      />
      <PageFilters>
        <SearchInput
          placeholder="Search invoice # or customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          isFetching={list.isFetching && !list.isLoading}
        />
        <div className="flex w-full shrink-0 flex-col gap-3 sm:flex-row lg:w-auto">
          <Select
            className="w-full sm:w-40"
            containerClassName="w-full sm:w-40"
            aria-label="Filter by invoice status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[{ value: '', label: 'All statuses' }, ...INVOICE_STATUS_OPTIONS]}
          />
          <Select
            className="w-full sm:w-40"
            containerClassName="w-full sm:w-40"
            aria-label="Filter by payment status"
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            options={[{ value: '', label: 'All payments' }, ...PAYMENT_STATUS_OPTIONS]}
          />
        </div>
      </PageFilters>
      {list.isLoading ? (
        <TableSkeleton rows={10} cols={5} />
      ) : list.isError ? (
        <ErrorState title="Could not load invoices" onRetry={() => void list.refetch()} />
      ) : (
        <>
          <SimpleTable
            columns={columns}
            data={rows}
            getRowKey={(row) => row.id}
            emptyTitle={hasFilters ? 'No matching invoices' : 'No invoices yet'}
            emptyDescription={
              hasFilters
                ? 'Try a different search or clear filters'
                : 'Create your first sale from POS'
            }
            emptyAction={
              hasFilters ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('');
                    setPaymentFilter('');
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button asChild size="sm">
                  <Link href="/pos">Open POS</Link>
                </Button>
              )
            }
          />
          <LoadMoreButton
            hasMore={Boolean(list.hasNextPage)}
            isFetching={list.isFetchingNextPage}
            isError={list.isFetchNextPageError}
            onLoadMore={() => {
              void list.fetchNextPage().then((r) => {
                if (r.isError) notifyError('Could not load more', r.error.message);
              });
            }}
          />
        </>
      )}
    </PageContent>
  );
}
