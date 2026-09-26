'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { can } from '@inventory/shared';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores';

type Sub = {
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  plan: { name: string };
};

function daysLeft(iso: string | null) {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function BillingBanner() {
  const canManageBilling = can(useAuthStore((s) => s.user?.membershipRole), 'billing.manage');
  const { data } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: () => api<Sub>('/billing/subscription'),
    staleTime: 60_000,
  });

  if (!data) return null;
  if (data.status === 'ACTIVE') return null;

  if (data.status === 'TRIALING') {
    const d = daysLeft(data.trialEndsAt);
    return (
      <div className="border-b border-border bg-muted/40 px-3 py-2 text-sm leading-relaxed sm:px-6 lg:px-8">
        <span className="break-words">
          Trial · {data.plan.name}
          {d != null ? ` — ${d} day${d === 1 ? '' : 's'} left` : ''}. Pick a plan when you pay.
          {canManageBilling ? (
            <>
              {' '}
              <Link href="/settings/billing" className="underline underline-offset-2">
                Billing
              </Link>
            </>
          ) : null}
        </span>
      </div>
    );
  }

  if (data.status === 'PAST_DUE') {
    const g = daysLeft(data.graceEndsAt);
    return (
      <div className="sticky top-0 z-30 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-relaxed text-destructive backdrop-blur max-lg:top-14 sm:px-6 lg:px-8">
        <span className="break-words">
          Subscription past due for {data.plan.name}
          {g != null && g > 0
            ? ` — ${g} day${g === 1 ? '' : 's'} of grace left`
            : g != null
              ? ' — grace ended'
              : ''}
          .
          {canManageBilling ? (
            <>
              {' '}
              <Link href="/settings/billing" className="underline underline-offset-2">
                Pay now
              </Link>
            </>
          ) : null}
        </span>
      </div>
    );
  }

  return null;
}
