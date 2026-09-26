'use client';

import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { SimpleTable, type SimpleColumn } from '@/components/ui/simple-table';
import { PaginationSkeleton, TableSkeleton } from '@/components/skeletons';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';

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

type Page = { items: AuditRow[]; total: number; page: number; limit: number };

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
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  useEffect(() => {
    setPage(1);
  }, [debounced, limit]);

  const list = useQuery({
    queryKey: ['platform', 'audit', debounced, page, limit],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (debounced) params.set('search', debounced);
      return api<Page>(`/platform/audit?${params}`);
    },
    placeholderData: keepPreviousData,
  });

  const rows = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

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
        <div className="space-y-0">
          <TableSkeleton rows={8} cols={5} />
          <PaginationSkeleton />
        </div>
      ) : list.isError ? (
        <ErrorState title="Could not load audit" onRetry={() => void list.refetch()} />
      ) : (
        <>
          <SimpleTable columns={columns} data={rows} getRowKey={(r) => r.id} emptyTitle="No audit events" />
          <Pagination
            page={page}
            limit={limit}
            total={total}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        </>
      )}
    </div>
  );
}
