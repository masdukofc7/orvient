'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { downloadCsv, formatDateTime } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { SimpleTable, type SimpleColumn } from '@/components/ui/simple-table';
import { TableSkeleton } from '@/components/skeletons';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toaster';

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED';
  statusReason: string | null;
  createdAt: string;
  memberCount: number;
};

type Page = { items: OrgRow[]; total: number; page: number; limit: number };

export default function PlatformOrgsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [pending, setPending] = useState<OrgRow | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    setPage(1);
  }, [debounced, limit]);

  const list = useQuery({
    queryKey: ['platform', 'organizations', debounced, page, limit],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (debounced) params.set('search', debounced);
      return api<Page>(`/platform/organizations?${params}`);
    },
    placeholderData: keepPreviousData,
  });

  const rows = list.data?.items ?? [];
  const total = list.data?.total ?? 0;

  const patch = useMutation({
    mutationFn: (body: { id: string; status: 'ACTIVE' | 'SUSPENDED'; reason?: string }) =>
      api(`/platform/organizations/${body.id}`, {
        method: 'PATCH',
        body: { status: body.status, reason: body.reason },
      }),
    onSuccess: () => {
      setPending(null);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['platform'] });
      toast({ title: 'Organization updated' });
    },
    onError: (e: Error) =>
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const exportCsv = useMutation({
    mutationFn: () => {
      const params = new URLSearchParams();
      if (debounced) params.set('search', debounced);
      const q = params.toString();
      return api<{ filename: string; csv: string }>(
        `/platform/organizations/export${q ? `?${q}` : ''}`,
      );
    },
    onSuccess: (res) => downloadCsv(res.filename, res.csv),
    onError: (e: Error) =>
      toast({ title: 'Export failed', description: e.message, variant: 'destructive' }),
  });

  const columns: SimpleColumn<OrgRow>[] = useMemo(
    () => [
      {
        id: 'name',
        header: 'Name',
        cell: (row) => (
          <Link href={`/platform/organizations/${row.id}`} className="font-medium hover:underline">
            {row.name}
          </Link>
        ),
      },
      { id: 'slug', header: 'Slug', cell: (row) => row.slug, hideOnMobile: true },
      {
        id: 'status',
        header: 'Status',
        cell: (row) => (
          <Badge variant={row.status === 'ACTIVE' ? 'success' : 'danger'}>{row.status}</Badge>
        ),
      },
      {
        id: 'members',
        header: 'Members',
        cell: (row) => row.memberCount,
        hideOnMobile: true,
      },
      {
        id: 'created',
        header: 'Created',
        cell: (row) => formatDateTime(row.createdAt),
        hideOnMobile: true,
      },
      {
        id: 'actions',
        header: '',
        cell: (row) => (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              setReason('');
              setPending(row);
            }}
          >
            {row.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
          </Button>
        ),
      },
    ],
    [],
  );

  const suspending = pending?.status === 'ACTIVE';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Organizations"
        description="All store workspaces"
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={exportCsv.isPending}
            onClick={() => exportCsv.mutate()}
          >
            Export CSV
          </Button>
        }
      />
      <SearchInput
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name or slug…"
      />
      {list.isLoading && !list.data ? (
        <TableSkeleton />
      ) : list.isError ? (
        <ErrorState title="Could not load organizations" onRetry={() => void list.refetch()} />
      ) : (
        <>
          <SimpleTable
            columns={columns}
            data={rows}
            getRowKey={(r) => r.id}
            emptyTitle="No organizations"
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
      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={suspending ? `Suspend ${pending?.name}?` : `Activate ${pending?.name}?`}
        description={
          suspending
            ? 'Members lose access on their next request. Refresh sessions are revoked.'
            : 'Members can sign in again.'
        }
        confirmLabel={suspending ? 'Suspend' : 'Activate'}
        variant={suspending ? 'destructive' : 'default'}
        loading={patch.isPending}
        onConfirm={() => {
          if (!pending) return;
          if (suspending && !reason.trim()) {
            toast({ title: 'Reason is required', variant: 'destructive' });
            return;
          }
          patch.mutate({
            id: pending.id,
            status: suspending ? 'SUSPENDED' : 'ACTIVE',
            reason: suspending ? reason.trim() : undefined,
          });
        }}
      >
        {suspending ? (
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason"
            maxLength={500}
            autoFocus
          />
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
