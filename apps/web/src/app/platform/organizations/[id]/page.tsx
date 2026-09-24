'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { ActionBar } from '@/components/ui/action-bar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardBody } from '@/components/ui/card';
import { MetricCard, MetricGrid } from '@/components/ui/metric-card';
import { Section } from '@/components/ui/section';
import { SimpleTable, type SimpleColumn } from '@/components/ui/simple-table';
import { ErrorState } from '@/components/ui/error-state';
import { DetailPageSkeleton } from '@/components/skeletons';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toaster';

type OrgDetail = {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED';
  statusReason: string | null;
  internalNote: string | null;
  defaultCurrency: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  subscription: {
    status: string;
    billingCycle: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    graceEndsAt: string | null;
    plan: { id: string; name: string; slug: string };
  } | null;
  counts: {
    products: number;
    contacts: number;
    invoices: number;
    purchaseOrders: number;
    members: number;
  };
  members: Array<{
    membershipId: string;
    membershipRole: string;
    userId: string;
    email: string;
    name: string;
    isActive: boolean;
    platformRole: string;
    lastLoginAt: string | null;
  }>;
};

export default function PlatformOrgDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['platform', 'organization', id],
    queryFn: () => api<OrgDetail>(`/platform/organizations/${id}`),
    enabled: Boolean(id),
  });

  const patch = useMutation({
    mutationFn: (body: { status?: 'ACTIVE' | 'SUSPENDED'; reason?: string; internalNote?: string }) =>
      api(`/platform/organizations/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      setConfirmOpen(false);
      setReason('');
      setNote(null);
      void qc.invalidateQueries({ queryKey: ['platform'] });
      toast({ title: 'Organization updated' });
    },
    onError: (e: Error) =>
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const memberCols: SimpleColumn<OrgDetail['members'][number]>[] = [
    { id: 'name', header: 'Name', cell: (m) => m.name },
    { id: 'email', header: 'Email', cell: (m) => m.email },
    { id: 'role', header: 'Role', cell: (m) => m.membershipRole },
    {
      id: 'status',
      header: 'Status',
      cell: (m) => (
        <span className="text-xs">
          {m.isActive ? 'Active' : 'Inactive'}
          {m.platformRole !== 'NONE' ? ` · ${m.platformRole}` : ''}
        </span>
      ),
    },
    {
      id: 'login',
      header: 'Last login',
      cell: (m) => (m.lastLoginAt ? formatDateTime(m.lastLoginAt) : '—'),
      hideOnMobile: true,
    },
  ];

  if (isLoading && !data) {
    return <DetailPageSkeleton fields={4} />;
  }

  if (isError || !data) {
    return <ErrorState title="Could not load organization" onRetry={() => void refetch()} />;
  }

  const suspending = data.status === 'ACTIVE';
  const noteValue = note ?? data.internalNote ?? '';

  return (
    <div className="space-y-6 sm:space-y-7">
      <PageHeader
        title={data.name}
        description={data.slug}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/platform/organizations">Back</Link>
            </Button>
            <Button
              size="sm"
              variant={suspending ? 'destructive' : 'default'}
              onClick={() => {
                setReason('');
                setConfirmOpen(true);
              }}
            >
              {suspending ? 'Suspend' : 'Activate'}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={data.status === 'ACTIVE' ? 'success' : 'danger'}>{data.status}</Badge>
              {data.subscription ? (
                <Badge variant="info">{data.subscription.status}</Badge>
              ) : (
                <Badge variant="muted">No billing</Badge>
              )}
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Currency</dt>
                <dd className="mt-0.5 font-medium">{data.defaultCurrency}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Created</dt>
                <dd className="mt-0.5 font-medium">{formatDateTime(data.createdAt)}</dd>
              </div>
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Contact</dt>
                <dd className="mt-0.5 break-all font-medium">
                  {[data.email, data.phone].filter(Boolean).join(' · ') || '—'}
                </dd>
              </div>
            </dl>

            {data.statusReason ? (
              <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Status reason: {data.statusReason}
              </p>
            ) : null}

            <div className="border-t border-border pt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Subscription
              </p>
              {data.subscription ? (
                <dl className="mt-2 grid gap-2 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <dt className="text-muted-foreground">Plan</dt>
                    <dd className="font-medium">
                      {data.subscription.plan.name} · {data.subscription.billingCycle}
                    </dd>
                  </div>
                  {data.subscription.status === 'TRIALING' && data.subscription.trialEndsAt ? (
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <dt className="text-muted-foreground">Trial ends</dt>
                      <dd>{formatDateTime(data.subscription.trialEndsAt)}</dd>
                    </div>
                  ) : null}
                  {data.subscription.currentPeriodEnd ? (
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <dt className="text-muted-foreground">Period ends</dt>
                      <dd>{formatDateTime(data.subscription.currentPeriodEnd)}</dd>
                    </div>
                  ) : null}
                  {data.subscription.status === 'PAST_DUE' && data.subscription.graceEndsAt ? (
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <dt className="text-muted-foreground">Grace ends</dt>
                      <dd>{formatDateTime(data.subscription.graceEndsAt)}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No subscription on this org.</p>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex h-full flex-col space-y-3">
            <label className="text-sm font-medium" htmlFor="internal-note">
              Internal note
            </label>
            <p className="text-xs text-muted-foreground">Only visible to platform admins.</p>
            <textarea
              id="internal-note"
              className="flex min-h-32 w-full flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={noteValue}
              maxLength={4000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Support context, billing follow-ups…"
            />
            <ActionBar>
              <Button
                size="sm"
                variant="outline"
                disabled={patch.isPending || note === null || note === (data.internalNote ?? '')}
                onClick={() => patch.mutate({ internalNote: noteValue })}
              >
                Save note
              </Button>
            </ActionBar>
          </CardBody>
        </Card>
      </div>

      <Section title="Usage">
        <MetricGrid columns={2} className="lg:grid-cols-5">
          <MetricCard label="Members" value={String(data.counts.members)} index={0} />
          <MetricCard label="Products" value={String(data.counts.products)} index={1} />
          <MetricCard label="Contacts" value={String(data.counts.contacts)} index={2} />
          <MetricCard label="Invoices" value={String(data.counts.invoices)} index={3} />
          <MetricCard label="POs" value={String(data.counts.purchaseOrders)} index={4} />
        </MetricGrid>
      </Section>

      <Section title="Members">
        <SimpleTable
          columns={memberCols}
          data={data.members}
          getRowKey={(m) => m.membershipId}
          emptyTitle="No members"
        />
      </Section>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={suspending ? `Suspend ${data.name}?` : `Activate ${data.name}?`}
        description={
          suspending
            ? 'Members lose access on their next request. Refresh sessions are revoked.'
            : 'Members can sign in again.'
        }
        confirmLabel={suspending ? 'Suspend' : 'Activate'}
        variant={suspending ? 'destructive' : 'default'}
        loading={patch.isPending}
        onConfirm={() => {
          if (suspending && !reason.trim()) {
            toast({ title: 'Reason is required', variant: 'destructive' });
            return;
          }
          patch.mutate({
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
