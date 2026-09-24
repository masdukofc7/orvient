'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlanCardsSkeleton } from '@/components/skeletons';
import { ErrorState } from '@/components/ui/error-state';

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

const COMPARE_ROWS: { label: string; starter: string; growth: string; scale: string }[] = [
  { label: 'Branches', starter: '1', growth: '3', scale: 'Unlimited' },
  { label: 'Users', starter: '3', growth: '10', scale: '25' },
  { label: 'POS & products', starter: 'Yes', growth: 'Yes', scale: 'Yes' },
  { label: 'Invoices & contacts', starter: 'Yes', growth: 'Yes', scale: 'Yes' },
  { label: 'Purchase orders', starter: 'Yes', growth: 'Yes', scale: 'Yes' },
  { label: 'Inventory & reports', starter: 'Yes', growth: 'Yes', scale: 'Yes' },
  { label: 'Offline / bank payment', starter: 'Yes', growth: 'Yes', scale: 'Yes' },
  { label: 'Support', starter: 'Standard', growth: 'Priority email', scale: 'WhatsApp priority' },
  { label: 'Onboarding', starter: 'Docs', growth: 'Guided', scale: 'Assisted' },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How does the 14-day trial work?',
    a: 'Sign up without picking a plan — you start on a 14-day trial. A short store setup comes next (skippable). Choose a plan under Billing when you are ready to pay. After trial, billing moves to past due with a short grace window — we do not suspend you on signup.',
  },
  {
    q: 'Can I pay offline?',
    a: 'Yes. After signup, open Settings → Billing, enter payment method, transaction ID, and an optional note. Our team reviews and activates your paid period.',
  },
  {
    q: 'What happens if I choose yearly billing?',
    a: 'Yearly is two months free (10× monthly). Pick yearly when you pay from Billing; the 14-day trial still runs first.',
  },
  {
    q: 'Can I upgrade later?',
    a: 'Yes. Move from Starter → Growth → Scale from Billing when you add branches or seats. Enterprise is custom — contact Distrofy.',
  },
  {
    q: 'Is there a free plan?',
    a: 'No freemium tier. A full trial keeps support quality high for paying wholesale teams.',
  },
];

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

export default function PricingPage() {
  const [cycle, setCycle] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: () => api<Plan[]>('/billing/plans', { token: null }),
  });

  const plans = useMemo(
    () => [...(data ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [data],
  );

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(var(--muted))_0%,_transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(hsl(var(--border))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border))_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
      />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Orvient
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/register">Start trial</Link>
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="text-sm font-medium tracking-wide text-muted-foreground">Orvient</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
            Pricing for wholesale teams that sell every day
          </h1>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Inventory, POS, invoices, and purchase orders — one workspace. Plans from $15/mo.
            14-day trial. Pay online or offline.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.35 }}
          className="mt-8 flex justify-center"
        >
          <div
            className="inline-flex rounded-lg border border-border bg-card p-1 text-sm"
            role="group"
            aria-label="Billing cycle"
          >
            <button
              type="button"
              className={cn(
                'rounded-md px-3 py-1.5 transition-colors',
                cycle === 'MONTHLY' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
              onClick={() => setCycle('MONTHLY')}
            >
              Monthly
            </button>
            <button
              type="button"
              className={cn(
                'rounded-md px-3 py-1.5 transition-colors',
                cycle === 'YEARLY' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
              onClick={() => setCycle('YEARLY')}
            >
              Yearly <span className="opacity-80">· 2 months free</span>
            </button>
          </div>
        </motion.div>

        {isLoading ? (
          <PlanCardsSkeleton />
        ) : isError ? (
          <div className="mt-10">
            <ErrorState title="Could not load plans" onRetry={() => void refetch()} />
          </div>
        ) : (
          <div className="mt-10 grid items-stretch gap-4 lg:grid-cols-3">
            {plans.map((plan, i) => {
              const recommended = plan.slug === 'growth';
              const price = Number(cycle === 'YEARLY' ? plan.priceYearly : plan.priceMonthly);
              const per = cycle === 'YEARLY' ? '/year' : '/mo';
              const currency = plan.currency || 'USD';
              return (
                <motion.article
                  key={plan.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * i, duration: 0.35 }}
                  className={cn(
                    'relative flex flex-col rounded-xl border bg-card p-6',
                    recommended
                      ? 'border-foreground/40 ring-1 ring-foreground/20 lg:-mt-2 lg:mb-2 lg:shadow-sm'
                      : 'border-border',
                  )}
                >
                  {recommended ? (
                    <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2" variant="info">
                      Recommended
                    </Badge>
                  ) : null}
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold tracking-tight">{plan.name}</h2>
                    {plan.description ? (
                      <p className="text-sm text-muted-foreground">{plan.description}</p>
                    ) : null}
                  </div>
                  <p className="mt-5 flex items-baseline gap-1">
                    <span className="text-4xl font-semibold tracking-tight">
                      {money(price, currency)}
                    </span>
                    <span className="text-sm text-muted-foreground">{per}</span>
                  </p>
                  {cycle === 'YEARLY' ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {money(Number(plan.priceMonthly), currency)}/mo billed yearly
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      or {money(Number(plan.priceYearly), currency)}/year
                    </p>
                  )}
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                    {(Array.isArray(plan.features) ? plan.features : []).map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="mt-8 w-full" variant={recommended ? 'default' : 'outline'}>
                    <Link href={`/register?plan=${plan.id}&cycle=${cycle}`}>
                      Start 14-day trial
                    </Link>
                  </Button>
                </motion.article>
              );
            })}
          </div>
        )}

        <section className="mt-16 rounded-xl border border-border bg-card/60 px-6 py-8 text-center sm:px-10">
          <h2 className="text-xl font-semibold tracking-tight">Enterprise</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Chains, custom SLAs, named support, and assisted rollout. Pricing by quote.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <a href="mailto:contact@distrofyent.com?subject=Orvient%20Enterprise">Contact Distrofy</a>
          </Button>
        </section>

        <section className="mt-16">
          <h2 className="text-center text-xl font-semibold tracking-tight">Compare plans</h2>
          <div className="mt-6 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-4 py-3 font-medium">Feature</th>
                  <th className="px-4 py-3 font-medium">Starter</th>
                  <th className="px-4 py-3 font-medium">Growth</th>
                  <th className="px-4 py-3 font-medium">Scale</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 text-muted-foreground">{row.label}</td>
                    <td className="px-4 py-2.5">{row.starter}</td>
                    <td className="px-4 py-2.5 font-medium">{row.growth}</td>
                    <td className="px-4 py-2.5">{row.scale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { t: '14-day full trial', d: 'Live workspace from day one — not a sandbox.' },
            { t: 'Card or offline', d: 'Secure card checkout or offline payment review.' },
            { t: 'Built to scale', d: 'Affordable entry, clear upgrades as you grow.' },
          ].map((item) => (
            <div key={item.t} className="rounded-xl border border-border bg-card/40 px-5 py-4">
              <p className="font-medium">{item.t}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.d}</p>
            </div>
          ))}
        </section>

        <section className="mt-16 max-w-2xl">
          <h2 className="text-xl font-semibold tracking-tight">FAQ</h2>
          <dl className="mt-6 space-y-6">
            {FAQS.map((item) => (
              <div key={item.q}>
                <dt className="font-medium">{item.q}</dt>
                <dd className="mt-1.5 text-sm text-muted-foreground">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="mt-16 text-center text-xs text-muted-foreground">
          Prices in USD, excl. tax. Limits are plan guidance; Enterprise customizes further.
        </p>
      </main>
    </div>
  );
}
