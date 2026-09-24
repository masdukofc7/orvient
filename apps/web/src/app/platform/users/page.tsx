'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { downloadCsv, formatDateTime } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAuthStore } from '@/stores';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SimpleTable, type SimpleColumn } from '@/components/ui/simple-table';
import { TableSkeleton } from '@/components/skeletons';
import { ErrorState } from '@/components/ui/error-state';
import { LoadMoreButton } from '@/components/ui/load-more-button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toaster';

type PlatformRole = 'NONE' | 'SUPPORT' | 'OWNER';

type UserRow = {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  isPlatformAdmin: boolean;
  platformRole: PlatformRole;
  lastLoginAt: string | null;
  createdAt: string;
  memberships: Array<{
    organizationId: string;
    organizationName: string;
    slug: string;
    membershipRole: string;
  }>;
};

type Page = { items: UserRow[]; nextCursor: string | null };

const ROLE_OPTIONS = [
  { value: 'NONE', label: 'None' },
  { value: 'SUPPORT', label: 'Support' },
  { value: 'OWNER', label: 'Owner' },
];

export default function PlatformUsersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const selfId = useAuthStore((s) => s.user?.id);
  const isOwner = useAuthStore((s) => s.user?.platformRole === 'OWNER');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const [pending, setPending] = useState<UserRow | null>(null);
  const [reason, setReason] = useState('');
  const [roleChange, setRoleChange] = useState<{ user: UserRow; platformRole: PlatformRole } | null>(
    null,
  );

  const list = useInfiniteQuery({
    queryKey: ['platform', 'users', debounced],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (debounced) params.set('search', debounced);
      if (pageParam) params.set('cursor', pageParam);
      return api<Page>(`/platform/users?${params}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  const patch = useMutation({
    mutationFn: (body: { id: string; isActive?: boolean; platformRole?: PlatformRole; reason?: string }) =>
      api(`/platform/users/${body.id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      setPending(null);
      setRoleChange(null);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['platform', 'users'] });
      toast({ title: 'User updated' });
    },
    onError: (e: Error) =>
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const exportCsv = useMutation({
    mutationFn: () => {
      const params = new URLSearchParams();
      if (debounced) params.set('search', debounced);
      const q = params.toString();
      return api<{ filename: string; csv: string }>(`/platform/users/export${q ? `?${q}` : ''}`);
    },
    onSuccess: (res) => downloadCsv(res.filename, res.csv),
    onError: (e: Error) =>
      toast({ title: 'Export failed', description: e.message, variant: 'destructive' }),
  });

  const columns: SimpleColumn<UserRow>[] = useMemo(
    () => [
      { id: 'name', header: 'Name', cell: (u) => u.name },
      { id: 'email', header: 'Email', cell: (u) => u.email },
      {
        id: 'flags',
        header: 'Status',
        cell: (u) => (
          <Badge variant={u.isActive ? 'success' : 'muted'}>{u.isActive ? 'Active' : 'Inactive'}</Badge>
        ),
      },
      {
        id: 'role',
        header: 'Platform',
        cell: (u) =>
          isOwner && u.id !== selfId ? (
            <Select
              aria-label={`Platform role for ${u.email}`}
              value={u.platformRole}
              options={ROLE_OPTIONS}
              onChange={(e) =>
                setRoleChange({ user: u, platformRole: e.target.value as PlatformRole })
              }
            />
          ) : (
            <span className="text-xs">{u.platformRole}</span>
          ),
      },
      {
        id: 'orgs',
        header: 'Workspaces',
        cell: (u) =>
          u.memberships.length ? u.memberships.map((m) => m.organizationName).join(', ') : '—',
        hideOnMobile: true,
      },
      {
        id: 'login',
        header: 'Last login',
        cell: (u) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'),
        hideOnMobile: true,
      },
      {
        id: 'actions',
        header: '',
        cell: (u) => (
          <Button
            size="sm"
            variant="outline"
            disabled={u.id === selfId}
            onClick={() => {
              setReason('');
              setPending(u);
            }}
          >
            {u.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        ),
      },
    ],
    [isOwner, selfId],
  );

  const deactivating = pending?.isActive === true;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        description="All accounts across Orvient"
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
        placeholder="Search name or email…"
      />
      {list.isLoading && !list.data ? (
        <TableSkeleton />
      ) : list.isError ? (
        <ErrorState title="Could not load users" onRetry={() => void list.refetch()} />
      ) : (
        <>
          <SimpleTable columns={columns} data={rows} getRowKey={(u) => u.id} emptyTitle="No users" />
          <LoadMoreButton
            hasMore={Boolean(list.hasNextPage)}
            isFetching={list.isFetchingNextPage}
            isError={list.isFetchNextPageError}
            onLoadMore={() => void list.fetchNextPage()}
          />
        </>
      )}
      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={deactivating ? `Deactivate ${pending?.email}?` : `Activate ${pending?.email}?`}
        description={
          deactivating ? 'Their sessions stop on the next request.' : 'They can sign in again.'
        }
        confirmLabel={deactivating ? 'Deactivate' : 'Activate'}
        variant={deactivating ? 'destructive' : 'default'}
        loading={patch.isPending}
        onConfirm={() => {
          if (!pending) return;
          if (deactivating && !reason.trim()) {
            toast({ title: 'Reason is required', variant: 'destructive' });
            return;
          }
          patch.mutate({
            id: pending.id,
            isActive: !pending.isActive,
            reason: deactivating ? reason.trim() : undefined,
          });
        }}
      >
        {deactivating ? (
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason"
            maxLength={500}
            autoFocus
          />
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(roleChange)}
        onOpenChange={(open) => {
          if (!open) setRoleChange(null);
        }}
        title={`Set ${roleChange?.user.email} to ${roleChange?.platformRole}?`}
        description="Support can operate tenants. Only owners can grant platform access."
        confirmLabel="Save role"
        variant="default"
        loading={patch.isPending}
        onConfirm={() => {
          if (!roleChange) return;
          patch.mutate({ id: roleChange.user.id, platformRole: roleChange.platformRole });
        }}
      />
    </div>
  );
}
