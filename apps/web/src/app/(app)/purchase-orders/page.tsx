'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DEFAULT_CURRENCY, PURCHASE_ORDER_STATUS_OPTIONS } from '@inventory/shared';
import { api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAuthStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { PageContent, PageFilters } from '@/components/ui/page-content';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { SimpleTable, type SimpleColumn } from '@/components/ui/simple-table';
import { PurchaseOrderStatusBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';
import { TableSkeleton } from '@/components/skeletons';

type PurchaseOrder = {
  id: string;
  poNumber: string;
  subtotal: string;
  status: string;
  currency: string;
  createdAt: string;
  contact?: { name: string } | null;
};

type PurchaseOrderPage = {
  data: PurchaseOrder[];
  total: number;
  page: number;
  limit: number;
};

export default function PurchaseOrdersPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const currency = useAuthStore((s) => s.user?.defaultCurrency ?? DEFAULT_CURRENCY);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, limit]);

  const list = useQuery({
    queryKey: ['purchase-orders', debouncedSearch, statusFilter, page, limit],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);
      return api<PurchaseOrderPage>(`/purchase-orders?${params}`);
    },
    placeholderData: keepPreviousData,
  });

  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;

  const columns: SimpleColumn<PurchaseOrder>[] = [
    {
      id: 'number',
      header: 'Number',
      cell: (po) => (
        <Link className="font-medium hover:underline" href={`/purchase-orders/${po.id}`}>
          {po.poNumber}
        </Link>
      ),
    },
    {
      id: 'supplier',
      header: 'Supplier',
      cell: (po) => (
        <span className="text-muted-foreground">{po.contact?.name ?? '—'}</span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (po) => <PurchaseOrderStatusBadge value={po.status} />,
    },
    {
      id: 'total',
      header: 'Total',
      cell: (po) => formatMoney(po.subtotal, po.currency || currency),
    },
    {
      id: 'date',
      header: 'Date',
      hideOnMobile: true,
      cell: (po) => (
        <span className="text-muted-foreground">{formatDateTime(po.createdAt)}</span>
      ),
    },
  ];

  const hasFilters = Boolean(debouncedSearch || statusFilter);

  return (
    <PageContent>
      <PageHeader
        title="Purchasing"
        description="Order from suppliers and receive stock later"
        actions={
          <Button asChild className="w-full sm:w-auto">
            <Link href="/purchase-orders/new">New PO</Link>
          </Button>
        }
      />
      <PageFilters>
        <SearchInput
          placeholder="Search PO # or supplier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          isFetching={list.isFetching && !list.isLoading}
        />
        <Select
          className="w-full shrink-0 sm:w-48"
          containerClassName="w-full sm:w-48"
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[{ value: '', label: 'All statuses' }, ...PURCHASE_ORDER_STATUS_OPTIONS]}
        />
      </PageFilters>
      {list.isLoading ? (
        <TableSkeleton rows={10} cols={5} />
      ) : list.isError ? (
        <ErrorState title="Could not load purchase orders" onRetry={() => void list.refetch()} />
      ) : (
        <>
          <SimpleTable
            columns={columns}
            data={rows}
            getRowKey={(row) => row.id}
            emptyTitle={hasFilters ? 'No matching purchase orders' : 'No purchase orders yet'}
            emptyDescription={
              hasFilters
                ? 'Try a different search or clear filters'
                : 'Create a PO to track supplier orders'
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
                <Button asChild size="sm">
                  <Link href="/purchase-orders/new">New PO</Link>
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
    </PageContent>
  );
}
