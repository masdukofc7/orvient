'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_CURRENCY,
  ensureCurrencyOption,
  isOwnerAdminRole,
} from '@inventory/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { PageHeader } from '@/components/ui/page-header';
import { PageContent } from '@/components/ui/page-content';
import { Card, CardBody } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FormFieldsSkeleton } from '@/components/skeletons';
import { ErrorState } from '@/components/ui/error-state';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ActionBar } from '@/components/ui/action-bar';
import { useToast } from '@/components/ui/toaster';
import { useAuthStore } from '@/stores';

type Organization = {
  id: string;
  name: string;
  slug: string;
  defaultCurrency: string;
  brandColor: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  taxId: string | null;
  logoUrl: string | null;
};

type TeamUser = {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  isActive: boolean;
  membershipRole: string;
};

type Branch = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  isDefault: boolean;
};

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'CASHIER', label: 'Cashier' },
];

function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0 self-stretch sm:ml-auto sm:self-auto sm:pt-0.5 [&>*]:w-full sm:[&>*]:w-auto">{action}</div> : null}
    </div>
  );
}

function FormBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const setSession = useAuthStore((s) => s.setSession);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const canManageTeam = isOwnerAdminRole(user?.membershipRole);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['organization'],
    queryFn: () => api<Organization>('/organizations/current'),
  });

  const team = useQuery({
    queryKey: ['users'],
    queryFn: () => api<TeamUser[]>('/users'),
    enabled: canManageTeam,
  });

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api<Branch[]>('/organizations/branches'),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api<Organization>('/organizations/current', { method: 'PATCH', body }),
    onSuccess: (org) => {
      qc.invalidateQueries({ queryKey: ['organization'] });
      qc.invalidateQueries({ queryKey: ['invoice'] });
      if (user && accessToken) {
        setSession(accessToken, {
          ...user,
          organizationName: org.name,
          defaultCurrency: org.defaultCurrency,
          brandColor: org.brandColor,
        });
      }
      document.documentElement.style.setProperty('--brand', org.brandColor);
      toast({ title: 'Settings saved' });
    },
    onError: (e: Error) =>
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const uploadLogo = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api<Organization>('/organizations/current/logo', { method: 'POST', body: fd });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organization'] });
      qc.invalidateQueries({ queryKey: ['invoice'] });
      toast({ title: 'Logo uploaded' });
    },
    onError: (e: Error) =>
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' }),
  });

  const clearLogo = useMutation({
    mutationFn: () => api<Organization>('/organizations/current/logo', { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organization'] });
      qc.invalidateQueries({ queryKey: ['invoice'] });
      toast({ title: 'Logo removed' });
    },
    onError: (e: Error) =>
      toast({ title: 'Could not remove logo', description: e.message, variant: 'destructive' }),
  });

  const createBranch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<Branch>('/organizations/branches', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] });
      setBranchOpen(false);
      toast({ title: 'Branch created' });
    },
    onError: (e: Error) =>
      toast({ title: 'Could not create branch', description: e.message, variant: 'destructive' }),
  });

  const setDefaultBranch = useMutation({
    mutationFn: (id: string) =>
      api<Branch>(`/organizations/branches/${id}`, {
        method: 'PATCH',
        body: { isDefault: true },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] });
      toast({ title: 'Default branch updated' });
    },
    onError: (e: Error) =>
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const invite = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api<TeamUser>('/users/invite', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setInviteOpen(false);
      toast({ title: 'Invite sent', description: 'They’ll get an email to set a password.' });
    },
    onError: (e: Error) =>
      toast({ title: 'Invite failed', description: e.message, variant: 'destructive' }),
  });

  const patchUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'User updated' });
    },
    onError: (e: Error) =>
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const currencyOptions = ensureCurrencyOption(data?.defaultCurrency ?? DEFAULT_CURRENCY);

  return (
    <PageContent className="mx-auto max-w-3xl">
      <PageHeader
        title="Settings"
        description="Company details, branches, and team for this workspace"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/billing">Billing</Link>
          </Button>
        }
      />

      <Card>
        <CardBody>
          {isLoading && !data ? (
            <FormFieldsSkeleton fields={8} columns={2} />
          ) : isError ? (
            <ErrorState title="Could not load settings" onRetry={() => void refetch()} />
          ) : (
            <form
              key={data?.id}
              className="space-y-8"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const email = String(fd.get('email') ?? '').trim();
                const phone = String(fd.get('phone') ?? '').trim();
                const address = String(fd.get('address') ?? '').trim();
                if (!email && !phone) {
                  toast({
                    title: 'Add email or phone',
                    description: 'Shown on invoices',
                    variant: 'destructive',
                  });
                  return;
                }
                if (!address) {
                  toast({ title: 'Address is required', variant: 'destructive' });
                  return;
                }
                save.mutate({
                  name: String(fd.get('name')),
                  defaultCurrency: String(fd.get('defaultCurrency')).toUpperCase(),
                  brandColor: String(fd.get('brandColor')),
                  email,
                  phone,
                  address,
                  website: String(fd.get('website') ?? ''),
                  taxId: String(fd.get('taxId') ?? ''),
                });
              }}
            >
              <FormBlock title="Business">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Company name" className="sm:col-span-2">
                    <Input name="name" defaultValue={data?.name} required />
                  </FormField>
                  <FormField
                    label="Workspace slug"
                    hint="Read-only identifier"
                    className="sm:col-span-2"
                  >
                    <Input value={data?.slug ?? ''} readOnly disabled />
                  </FormField>
                </div>
              </FormBlock>

              <div className="border-t border-border pt-8">
                <FormBlock title="Contact">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Email" hint="Email or phone required" required>
                      <Input
                        name="email"
                        type="email"
                        defaultValue={data?.email ?? ''}
                        placeholder="billing@company.com"
                      />
                    </FormField>
                    <FormField label="Phone" hint="Email or phone required" required>
                      <Input
                        name="phone"
                        type="tel"
                        defaultValue={data?.phone ?? ''}
                        placeholder="+880…"
                      />
                    </FormField>
                    <FormField label="Address" className="sm:col-span-2" required>
                      <Input
                        name="address"
                        defaultValue={data?.address ?? ''}
                        placeholder="Street, city, country"
                        required
                      />
                    </FormField>
                    <FormField label="Website">
                      <Input
                        name="website"
                        defaultValue={data?.website ?? ''}
                        placeholder="www.company.com"
                      />
                    </FormField>
                    <FormField label="Tax / VAT ID" hint="Recommended for tax invoices">
                      <Input
                        name="taxId"
                        defaultValue={data?.taxId ?? ''}
                        placeholder="VAT / TIN"
                      />
                    </FormField>
                  </div>
                </FormBlock>
              </div>

              <div className="border-t border-border pt-8">
                <FormBlock title="Branding">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      label="Logo"
                      hint="JPEG, PNG, WebP, or GIF · max 5MB · used on invoices"
                      className="sm:col-span-2"
                    >
                      <Input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        disabled={uploadLogo.isPending}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) uploadLogo.mutate(file);
                        }}
                      />
                    </FormField>
                    {data?.logoUrl ? (
                      <div className="flex items-center gap-3 rounded-lg border border-border p-3 sm:col-span-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={data.logoUrl} alt="" className="h-12 w-12 object-contain" />
                        <span className="flex-1 text-xs text-muted-foreground">
                          {uploadLogo.isPending ? 'Uploading…' : 'Current logo'}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={clearLogo.isPending}
                          onClick={() => clearLogo.mutate()}
                        >
                          Remove
                        </Button>
                      </div>
                    ) : null}
                    <FormField label="Default currency" hint="POS, invoices, reports">
                      <Select
                        name="defaultCurrency"
                        defaultValue={data?.defaultCurrency ?? DEFAULT_CURRENCY}
                        options={currencyOptions}
                        required
                      />
                    </FormField>
                    <FormField label="Brand color">
                      <Input
                        name="brandColor"
                        type="color"
                        className="h-10 cursor-pointer px-1.5 py-1"
                        defaultValue={data?.brandColor ?? '#18181b'}
                      />
                    </FormField>
                  </div>
                </FormBlock>
              </div>

              <div className="space-y-4 border-t border-border pt-8">
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                  POS prints an 80mm thermal receipt. Invoices also support A4 print and PDF. Set a
                  thermal printer as the system default for fastest checkout.
                </div>
                <ActionBar>
                  <Button loading={save.isPending}>
                    {save.isPending ? 'Saving…' : 'Save changes'}
                  </Button>
                </ActionBar>
              </div>
            </form>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <SectionTitle
            title="Branches"
            description="Stock and sales are scoped to the active branch."
            action={
              canManageTeam ? (
                <Button size="sm" className="w-full sm:w-auto" onClick={() => setBranchOpen(true)}>
                  Add branch
                </Button>
              ) : null
            }
          />
          {branches.isLoading && !branches.data ? (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-8 w-full sm:w-28" />
                </div>
              ))}
            </div>
          ) : branches.isError ? (
            <ErrorState title="Could not load branches" onRetry={() => void branches.refetch()} />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {(branches.data ?? []).map((b) => (
                <li
                  key={b.id}
                  className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium">
                      <span className="truncate">{b.name}</span>
                      {b.isDefault ? (
                        <span className="text-xs font-normal text-muted-foreground">Default</span>
                      ) : null}
                      {user?.branchId === b.id ? (
                        <span className="text-xs font-normal text-muted-foreground">Active</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[b.code, b.address].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  {canManageTeam && !b.isDefault ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full shrink-0 sm:w-auto"
                      disabled={setDefaultBranch.isPending}
                      onClick={() => setDefaultBranch.mutate(b.id)}
                    >
                      Make default
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {canManageTeam ? (
        <Card>
          <CardBody className="space-y-4">
            <SectionTitle
              title="Team"
              description="Share the password out of band — no email invite."
              action={
                <Button size="sm" className="w-full sm:w-auto" onClick={() => setInviteOpen(true)}>
                  Add user
                </Button>
              }
            />
            {team.isLoading && !team.data ? (
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                      <Skeleton className="h-9 w-full sm:w-36" />
                      <Skeleton className="h-8 w-full sm:w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : team.isError ? (
              <ErrorState title="Could not load team" onRetry={() => void team.refetch()} />
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {(team.data ?? []).map((u) => (
                  <li
                    key={u.userId}
                    className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                        <span className="truncate">{u.name}</span>
                        {!u.isActive ? (
                          <span className="text-xs font-normal text-muted-foreground">Inactive</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{u.email}</div>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                      <Select
                        className="w-full sm:w-36"
                        containerClassName="w-full sm:w-36"
                        value={u.membershipRole}
                        disabled={u.userId === user?.id || patchUser.isPending}
                        onChange={(e) =>
                          patchUser.mutate({
                            id: u.userId,
                            body: { membershipRole: e.target.value },
                          })
                        }
                        options={[{ value: 'OWNER', label: 'Owner' }, ...ROLE_OPTIONS]}
                      />
                      {u.userId !== user?.id ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full sm:w-auto"
                          disabled={patchUser.isPending}
                          onClick={() =>
                            patchUser.mutate({
                              id: u.userId,
                              body: { isActive: !u.isActive },
                            })
                          }
                        >
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite team member</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              invite.mutate({
                name: String(fd.get('name')),
                email: String(fd.get('email')),
                membershipRole: String(fd.get('membershipRole')),
              });
            }}
          >
            <FormField label="Name">
              <Input name="name" required />
            </FormField>
            <FormField label="Email">
              <Input name="email" type="email" required />
            </FormField>
            <FormField label="Role">
              <Select name="membershipRole" defaultValue="CASHIER" options={ROLE_OPTIONS} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button loading={invite.isPending}>
                {invite.isPending ? 'Sending…' : 'Send invite'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={branchOpen} onOpenChange={setBranchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add branch</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const code = String(fd.get('code') ?? '').trim();
              const address = String(fd.get('address') ?? '').trim();
              createBranch.mutate({
                name: String(fd.get('name')),
                ...(code ? { code } : {}),
                ...(address ? { address } : {}),
              });
            }}
          >
            <FormField label="Name">
              <Input name="name" required placeholder="Downtown" />
            </FormField>
            <FormField label="Code" hint="Optional short code">
              <Input name="code" placeholder="DT" />
            </FormField>
            <FormField label="Address">
              <Input name="address" placeholder="Optional" />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBranchOpen(false)}>
                Cancel
              </Button>
              <Button loading={createBranch.isPending}>
                {createBranch.isPending ? 'Creating…' : 'Create branch'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContent>
  );
}
