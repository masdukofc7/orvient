'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { SimpleTable, type SimpleColumn } from '@/components/ui/simple-table';
import { TableSkeleton } from '@/components/skeletons';
import { ErrorState } from '@/components/ui/error-state';
import { LoadMoreButton } from '@/components/ui/load-more-button';

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  organizationId: string | null;
  actorEmail: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
};

type Page = { items: AuditRow[]; nextCursor: string | null };

function detail(value: unknown) {
  if (!value || typeof value !== 'object') return '—';
  const reason = 'reason' in value ? (value as { reason?: string | null }).reason : null;
  const status = 'status' in value ? (value as { status?: string }).status : null;
  const active = 'isActive' in value ? (value as { isActive?: boolean }).isActive : undefined;
  const role = 'platformRole' in value ? (value as { platformRole?: string }).platformRole : null;
  return [status, role, active === undefined ? null : active ? 'active' : 'inactive', reason]
    .filter(Boolean)
    .join(' · ') || '—';
}

export default function PlatformAuditPage() {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);

  const list = useInfiniteQuery({
    queryKey: ['platform', 'audit', debounced],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (debounced) params.set('search', debounced);
      if (pageParam) params.set('cursor', pageParam);
      return api<Page>(`/platform/audit?${params}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  const columns: SimpleColumn<AuditRow>[] = useMemo(
    () => [
      { id: 'when', header: 'When', cell: (r) => formatDateTime(r.createdAt) },
      { id: 'action', header: 'Action', cell: (r) => r.action },
      { id: 'actor', header: 'Actor', cell: (r) => r.actorEmail ?? '—', hideOnMobile: true },
      { id: 'entity', header: 'Entity', cell: (r) => `${r.entityType}`, hideOnMobile: true },
      { id: 'after', header: 'After', cell: (r) => detail(r.after) },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Audit" description="Platform and tenant actions" />
      <SearchInput
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search action or entity…"
      />
      {list.isLoading && !list.data ? (
        <TableSkeleton />
      ) : list.isError ? (
        <ErrorState title="Could not load audit" onRetry={() => void list.refetch()} />
      ) : (
        <>
          <SimpleTable columns={columns} data={rows} getRowKey={(r) => r.id} emptyTitle="No audit events" />
          <LoadMoreButton
            hasMore={Boolean(list.hasNextPage)}
            isFetching={list.isFetchingNextPage}
            isError={list.isFetchNextPageError}
            onLoadMore={() => void list.fetchNextPage()}
          />
        </>
      )}
    </div>
  );
}
