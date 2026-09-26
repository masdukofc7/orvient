'use client';

import { useMemo, useState } from 'react';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  CONTACT_TYPE_OPTIONS,
  DEFAULT_CURRENCY,
  type ContactType,
  can,
} from '@inventory/shared';
import { api } from '@/lib/api';
import { notifyError } from '@/lib/notify';
import { formatDateTime, formatMoney } from '@/lib/utils';
import { formOptional, formString } from '@/lib/form';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAuthStore } from '@/stores';
import { SimpleTable, type SimpleColumn } from '@/components/ui/simple-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { PageContent, PageFilters } from '@/components/ui/page-content';
import { PageHeader } from '@/components/ui/page-header';
import { SearchInput } from '@/components/ui/search-input';
import { ContactTypeBadge } from '@/components/ui/status-badge';
import { ErrorState } from '@/components/ui/error-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LoadMoreButton } from '@/components/ui/load-more-button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toaster';
import { TableSkeleton } from '@/components/skeletons';

type Contact = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  type: ContactType;
};

type ContactPage = { data: Contact[]; nextCursor: string | null };

export default function ContactsPage() {
  const canArchive = can(useAuthStore((s) => s.user?.membershipRole), 'contacts.delete');
  const currency = useAuthStore((s) => s.user?.defaultCurrency ?? DEFAULT_CURRENCY);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [typeFilter, setTypeFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const purchases = useQuery({
    queryKey: ['customer-purchases', editing?.id],
    queryFn: () =>
      api<
        Array<{
          id: string;
          invoiceNumber: string;
          grandTotal: string;
          currency: string;
          createdAt: string;
        }>
      >(`/reports/customers/${editing!.id}/purchases`),
    enabled: Boolean(editing?.id && editing.type === 'CUSTOMER' && open),
  });

  const list = useInfiniteQuery({
    queryKey: ['contacts', debouncedSearch, typeFilter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (typeFilter) params.set('type', typeFilter);
      if (pageParam) params.set('cursor', pageParam);
      return api<ContactPage>(`/contacts?${params}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(
    () => list.data?.pages.flatMap((p) => p.data) ?? [],
    [list.data],
  );

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editing
        ? api(`/contacts/${editing.id}`, { method: 'PATCH', body })
        : api('/contacts', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      setOpen(false);
      setEditing(null);
      toast({ title: editing ? 'Contact updated' : 'Contact created' });
    },
    onError: (e: Error) =>
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/contacts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      setDeleteTarget(null);
      toast({ title: 'Contact archived' });
    },
    onError: (e: Error) =>
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
  });

  const columns = useMemo<SimpleColumn<Contact>[]>(
    () => [
      { id: 'name', header: 'Name', cell: (c) => c.name },
      {
        id: 'type',
        header: 'Type',
        cell: (c) => <ContactTypeBadge value={c.type} />,
      },
      { id: 'phone', header: 'Phone', cell: (c) => c.phone ?? '—' },
      {
        id: 'email',
        header: 'Email',
        hideOnMobile: true,
        cell: (c) => c.email ?? '—',
      },
      {
        id: 'address',
        header: 'Address',
        hideOnMobile: true,
        cell: (c) => c.address ?? '—',
      },
      {
        id: 'actions',
        header: '',
        cell: (c) => (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              aria-label={`Edit ${c.name}`}
              onClick={(e) => {
                e.stopPropagation();
                setEditing(c);
                setOpen(true);
              }}
            >
              Edit
            </Button>
            {canArchive ? (
              <Button
                size="sm"
                variant="destructive"
                aria-label={`Archive ${c.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(c);
                }}
              >
                Archive
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [canArchive],
  );

  const hasFilters = Boolean(debouncedSearch || typeFilter);

  return (
    <PageContent>
      <PageHeader
        title="Contacts"
        description="Customers and suppliers"
        actions={
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Quick create
          </Button>
        }
      />
      <PageFilters>
        <SearchInput
          placeholder="Search name, phone, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          isFetching={list.isFetching && !list.isLoading}
        />
        <Select
          className="w-full sm:w-44"
          containerClassName="w-full shrink-0 sm:w-44"
          aria-label="Filter by type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[{ value: '', label: 'All types' }, ...CONTACT_TYPE_OPTIONS]}
        />
      </PageFilters>
      {list.isLoading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : list.isError ? (
        <ErrorState title="Could not load contacts" onRetry={() => void list.refetch()} />
      ) : (
        <>
          <SimpleTable
            columns={columns}
            data={rows}
            getRowKey={(row) => row.id}
            emptyTitle={hasFilters ? 'No matching contacts' : 'No contacts yet'}
            emptyDescription={
              hasFilters
                ? 'Try a different search or clear filters'
                : 'Create a customer or supplier to get started'
            }
            emptyAction={
              hasFilters ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setTypeFilter('');
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setOpen(true);
                  }}
                >
                  Quick create
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

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit contact' : 'New contact'}</DialogTitle>
          </DialogHeader>
          <form
            key={editing?.id ?? 'new'}
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const type = formString(fd, 'type');
              const phone = formOptional(fd, 'phone');
              const email = formOptional(fd, 'email');
              if (type === 'SUPPLIER' && !phone && !email) {
                toast({
                  title: 'Supplier needs phone or email',
                  variant: 'destructive',
                });
                return;
              }
              save.mutate({
                name: formString(fd, 'name'),
                phone,
                email,
                address: formOptional(fd, 'address'),
                type,
              });
            }}
          >
            <FormField label="Name">
              <Input name="name" defaultValue={editing?.name} required />
            </FormField>
            <FormField label="Type">
              <Select
                name="type"
                defaultValue={editing?.type ?? 'CUSTOMER'}
                options={CONTACT_TYPE_OPTIONS}
                required
              />
            </FormField>
            <FormField label="Phone" hint="Phone or email required for suppliers">
              <Input name="phone" defaultValue={editing?.phone ?? ''} />
            </FormField>
            <FormField label="Email" hint="Phone or email required for suppliers">
              <Input name="email" type="email" defaultValue={editing?.email ?? ''} />
            </FormField>
            <FormField label="Address">
              <Input name="address" defaultValue={editing?.address ?? ''} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button loading={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
          {editing?.type === 'CUSTOMER' ? (
            <div className="mt-4 border-t border-border pt-4">
              <div className="mb-2 text-sm font-medium">Purchase history</div>
              {purchases.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : purchases.isError ? (
                <p className="text-xs text-destructive">Could not load purchases</p>
              ) : !(purchases.data ?? []).length ? (
                <p className="text-xs text-muted-foreground">No purchases yet</p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-auto text-xs scrollbar-none">
                  {(purchases.data ?? []).slice(0, 20).map((inv) => (
                    <li key={inv.id} className="flex justify-between gap-2">
                      <span>
                        {inv.invoiceNumber} ·{' '}
                        {formatMoney(inv.grandTotal, inv.currency || currency)}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatDateTime(inv.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Archive contact?"
        description={
          deleteTarget
            ? `${deleteTarget.name} will be archived and hidden from lists.`
            : undefined
        }
        confirmLabel="Archive"
        loading={remove.isPending}
        onConfirm={() => {
          if (deleteTarget) remove.mutate(deleteTarget.id);
        }}
      />
    </PageContent>
  );
}
