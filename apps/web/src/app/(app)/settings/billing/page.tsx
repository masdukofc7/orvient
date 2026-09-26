'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Check } from 'lucide-react';
import { can } from '@inventory/shared';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { clearSignupIntent, getSignupIntent } from '@/lib/signup-intent';
import { useAuthStore } from '@/stores';
import { PageHeader } from '@/components/ui/page-header';
import { PageContent } from '@/components/ui/page-content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { ErrorState } from '@/components/ui/error-state';
import { BillingPageSkeleton } from '@/components/skeletons';
import { useToast } from '@/components/ui/toaster';

type Plan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMonthly: string;
  priceYearly: string;
  currency: string;
  features: string[];
  sortOrder: number;
};

type Sub = {
  status: string;
  billingCycle: string;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  lastPaymentAt: string | null;
  channel: string | null;
  plan: Plan & { currency: string; features: string[] };
};

function money(n: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `$${n}`;
  }
}

function BillingSettingsInner() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const search = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const canPay = can(user?.membershipRole, 'billing.manage');
  const [planId, setPlanId] = useState('');
  const [cycle, setCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [method, setMethod] = useState('');
  const [trxId, setTrxId] = useState('');
  const [note, setNote] = useState('');

  const sub = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: () => api<Sub>('/billing/subscription'),
  });
  const plans = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: () => api<Plan[]>('/billing/plans'),
  });

  useEffect(() => {
    const checkout = search.get('checkout');
    const requestId = search.get('request_id');
    const attemptId = search.get('attempt_id') ?? undefined;
    if (checkout !== 'success' || !requestId || !canPay) return;
    void api('/billing/checkout/sync', {
      method: 'POST',
      body: { requestId, attemptId },
    })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ['billing'] });
      })
      .catch(() => undefined);
  }, [search, canPay, qc]);

  useEffect(() => {
    const fromQuery = search.get('plan');
    const cycleQuery = search.get('cycle');
    const intent = getSignupIntent();
    if (fromQuery) setPlanId(fromQuery);
    else if (intent?.planId) setPlanId(intent.planId);
    if (cycleQuery === 'YEARLY' || cycleQuery === 'MONTHLY') setCycle(cycleQuery);
    else if (intent?.cycle) setCycle(intent.cycle);
    if (fromQuery || intent?.planId) clearSignupIntent();
  }, [search]);

  const sortedPlans = useMemo(
    () => [...(plans.data ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [plans.data],
  );

  const selectedPlanId = planId || sub.data?.plan.id || sortedPlans[0]?.id || '';
  const selectedPlan = sortedPlans.find((p) => p.id === selectedPlanId) ?? sub.data?.plan;
  const currentPlanOrder = sub.data?.plan.sortOrder ?? 0;
  const currentCycle = (sub.data?.billingCycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY') as
    | 'MONTHLY'
    | 'YEARLY';

  const checkout = useMutation({
    mutationFn: (targetPlanId: string) =>
      api<{ checkoutUrl: string }>('/billing/checkout', {
        method: 'POST',
        body: { planId: targetPlanId, billingCycle: cycle },
      }),
    onSuccess: (res) => {
      window.location.href = res.checkoutUrl;
    },
    onError: (e: Error) =>
      toast({ title: 'Checkout failed', description: e.message, variant: 'destructive' }),
  });

  const manual = useMutation({
    mutationFn: () =>
      api('/billing/manual-request', {
        method: 'POST',
        body: {
          planId: selectedPlanId,
          billingCycle: cycle,
          method: method.trim(),
          proofRef: trxId.trim(),
          note: note.trim() || undefined,
        },
      }),
    onSuccess: () => {
      setMethod('');
      setTrxId('');
      setNote('');
      void qc.invalidateQueries({ queryKey: ['billing'] });
      toast({
        title: 'Payment request submitted',
        description: 'We will review and activate your plan.',
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Request failed', description: e.message, variant: 'destructive' }),
  });

  if (sub.isLoading || plans.isLoading) {
    return <BillingPageSkeleton />;
  }
  if (sub.isError || !sub.data) {
    return <ErrorState title="Could not load billing" onRetry={() => void sub.refetch()} />;
  }

  const s = sub.data;
  const currency = selectedPlan?.currency || s.plan.currency || 'USD';

  function cardAction(plan: Plan): {
    label: string;
    disabled?: boolean;
    variant?: 'default' | 'outline' | 'secondary';
  } {
    const isCurrent = plan.id === s.plan.id && cycle === currentCycle;
    if (isCurrent) {
      // Still need a path to pay while trialing / past due
      if (s.status === 'TRIALING' || s.status === 'PAST_DUE') {
        const price = Number(cycle === 'YEARLY' ? plan.priceYearly : plan.priceMonthly);
        return {
          label: `Pay ${money(price, plan.currency || currency)}${cycle === 'YEARLY' ? '/year' : '/mo'}`,
          variant: 'default',
        };
      }
      return { label: 'Current plan', disabled: true, variant: 'secondary' };
    }
    const order = plan.sortOrder ?? 0;
    if (order > currentPlanOrder) return { label: 'Upgrade', variant: 'default' };
    if (order < currentPlanOrder) return { label: 'Downgrade', variant: 'outline' };
    return {
      label: cycle === 'YEARLY' ? 'Switch to yearly' : 'Switch to monthly',
      variant: 'outline',
    };
  }

  return (
    <PageContent className="mx-auto max-w-3xl">
      <PageHeader
        title="Billing"
        description="Choose a plan when you are ready to pay"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/pricing">Compare plans</Link>
          </Button>
        }
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">{s.plan.name}</span>
            <Badge
              variant={
                s.status === 'ACTIVE' ? 'success' : s.status === 'PAST_DUE' ? 'danger' : 'info'
              }
            >
              {s.status}
            </Badge>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Billing cycle</dt>
              <dd className="mt-0.5 font-medium">
                {s.billingCycle === 'YEARLY' ? 'Yearly' : 'Monthly'}
              </dd>
            </div>
            {s.trialEndsAt && s.status === 'TRIALING' ? (
              <div>
                <dt className="text-xs text-muted-foreground">Trial ends</dt>
                <dd className="mt-0.5 font-medium">{formatDateTime(s.trialEndsAt)}</dd>
              </div>
            ) : null}
            {s.currentPeriodEnd && s.status !== 'TRIALING' ? (
              <div>
                <dt className="text-xs text-muted-foreground">Period ends</dt>
                <dd className="mt-0.5 font-medium">{formatDateTime(s.currentPeriodEnd)}</dd>
              </div>
            ) : null}
            {s.status === 'PAST_DUE' && s.graceEndsAt ? (
              <div>
                <dt className="text-xs text-muted-foreground">Grace ends</dt>
                <dd className="mt-0.5 font-medium">{formatDateTime(s.graceEndsAt)}</dd>
              </div>
            ) : null}
            {s.lastPaymentAt ? (
              <div>
                <dt className="text-xs text-muted-foreground">Last payment</dt>
                <dd className="mt-0.5 font-medium">{formatDateTime(s.lastPaymentAt)}</dd>
              </div>
            ) : null}
            {s.channel ? (
              <div>
                <dt className="text-xs text-muted-foreground">Channel</dt>
                <dd className="mt-0.5 font-medium">{s.channel}</dd>
              </div>
            ) : null}
          </dl>
        </CardBody>
      </Card>

      {canPay ? (
        <>
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-0.5">
                <h2 className="text-sm font-medium">Choose plan</h2>
                <p className="text-xs text-muted-foreground">
                  Card payments processed securely by Dodo Payments.
                </p>
              </div>
              <div
                className="inline-flex rounded-lg border border-border bg-muted/30 p-1 text-sm"
                role="group"
                aria-label="Billing cycle"
              >
                <button
                  type="button"
                  className={cn(
                    'rounded-md px-3 py-1.5 transition-colors',
                    cycle === 'MONTHLY'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setCycle('MONTHLY')}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  className={cn(
                    'rounded-md px-3 py-1.5 transition-colors',
                    cycle === 'YEARLY'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setCycle('YEARLY')}
                >
                  Yearly
                </button>
              </div>
            </div>

            {plans.isError ? (
              <ErrorState title="Could not load plans" onRetry={() => void plans.refetch()} />
            ) : (
              <div className="grid gap-3 lg:grid-cols-3">
                {sortedPlans.map((plan) => {
                  const selected = plan.id === selectedPlanId;
                  const current = plan.id === s.plan.id && cycle === currentCycle;
                  const recommended = plan.slug === 'growth';
                  const price = Number(cycle === 'YEARLY' ? plan.priceYearly : plan.priceMonthly);
                  const highlights = Array.isArray(plan.features) ? plan.features : [];
                  const action = cardAction(plan);
                  return (
                    <div
                      key={plan.id}
                      className={cn(
                        'relative flex flex-col rounded-xl border bg-card p-4',
                        selected
                          ? 'border-foreground ring-1 ring-foreground/20'
                          : 'border-border',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setPlanId(plan.id)}
                        className="flex flex-1 flex-col text-left focus-visible:outline-none"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold tracking-tight">{plan.name}</span>
                          {current ? <Badge variant="info">Current</Badge> : null}
                          {!current && recommended ? (
                            <Badge variant="default">Recommended</Badge>
                          ) : null}
                        </div>
                        <p className="mt-3 flex items-baseline gap-1">
                          <span className="text-2xl font-semibold tracking-tight">
                            {money(price, plan.currency || currency)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {cycle === 'YEARLY' ? '/year' : '/mo'}
                          </span>
                        </p>
                        {plan.description ? (
                          <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
                        ) : null}
                        <ul className="mt-3 flex-1 space-y-1.5 text-xs text-muted-foreground">
                          {highlights.map((f) => (
                            <li key={f} className="flex gap-1.5">
                              <Check
                                className="mt-0.5 h-3 w-3 shrink-0 text-foreground"
                                aria-hidden
                              />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      </button>
                      <div className="mt-4 space-y-1.5">
                        <Button
                          className="w-full"
                          variant={action.variant}
                          disabled={action.disabled || checkout.isPending}
                          loading={checkout.isPending && checkout.variables === plan.id}
                          onClick={() => {
                            setPlanId(plan.id);
                            if (action.disabled) return;
                            checkout.mutate(plan.id);
                          }}
                        >
                          {action.label}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Card>
            <CardBody className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Paid offline?</p>
                <p className="text-xs text-muted-foreground">
                  Submitting for{' '}
                  <span className="font-medium text-foreground">
                    {selectedPlan?.name ?? 'selected plan'} · {cycle === 'YEARLY' ? 'Yearly' : 'Monthly'}
                  </span>
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Method">
                  <Input
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    placeholder="bKash, Nagad, bank transfer…"
                    required
                  />
                </FormField>
                <FormField label="Transaction ID">
                  <Input
                    value={trxId}
                    onChange={(e) => setTrxId(e.target.value)}
                    placeholder="Trx ID / reference"
                    required
                  />
                </FormField>
              </div>
              <FormField label="Note">
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Anything else we should know"
                />
              </FormField>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={!method.trim() || !trxId.trim() || !selectedPlanId}
                  loading={manual.isPending}
                  onClick={() => manual.mutate()}
                >
                  Submit for review
                </Button>
              </div>
            </CardBody>
          </Card>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Ask an owner or admin to manage billing.</p>
      )}
    </PageContent>
  );
}

export default function SettingsBillingPage() {
  return (
    <Suspense fallback={<BillingPageSkeleton />}>
      <BillingSettingsInner />
    </Suspense>
  );
}
