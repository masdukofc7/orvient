'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { MetricCard, MetricGrid } from '@/components/ui/metric-card';
import { Section } from '@/components/ui/section';
import { MetricCardsSkeleton } from '@/components/skeletons';
import { ErrorState } from '@/components/ui/error-state';

type Overview = {
  orgsActive: number;
  orgsSuspended: number;
  orgsTotal: number;
  users: number;
  products: number;
  invoices: number;
  orgsLast7Days: number;
  usersLast7Days: number;
};

export default function PlatformOverviewPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['platform', 'overview'],
    queryFn: () => api<Overview>('/platform/overview'),
  });

  return (
    <div className="space-y-6 sm:space-y-7">
      <PageHeader
        title="Platform overview"
        description="All Orvient workspaces and accounts"
      />
      {isLoading && !data ? (
        <>
          <Section title="Workspaces">
            <MetricCardsSkeleton count={3} columns={3} />
          </Section>
          <Section title="Activity">
            <MetricCardsSkeleton count={3} columns={3} />
          </Section>
          <Section title="Last 7 days">
            <MetricCardsSkeleton count={2} columns={2} />
          </Section>
        </>
      ) : isError ? (
        <ErrorState title="Could not load overview" onRetry={() => void refetch()} />
      ) : (
        <>
          <Section title="Workspaces">
            <MetricGrid columns={3}>
              <MetricCard
                label="Organizations"
                value={String(data?.orgsTotal ?? 0)}
                index={0}
                href="/platform/organizations"
              />
              <MetricCard label="Active" value={String(data?.orgsActive ?? 0)} index={1} />
              <MetricCard label="Suspended" value={String(data?.orgsSuspended ?? 0)} index={2} />
            </MetricGrid>
          </Section>

          <Section title="Activity">
            <MetricGrid columns={3}>
              <MetricCard
                label="Users"
                value={String(data?.users ?? 0)}
                index={0}
                href="/platform/users"
              />
              <MetricCard label="Products" value={String(data?.products ?? 0)} index={1} />
              <MetricCard label="Invoices" value={String(data?.invoices ?? 0)} index={2} />
            </MetricGrid>
          </Section>

          <Section title="Last 7 days">
            <MetricGrid columns={2}>
              <MetricCard label="New orgs" value={String(data?.orgsLast7Days ?? 0)} index={0} />
              <MetricCard label="New users" value={String(data?.usersLast7Days ?? 0)} index={1} />
            </MetricGrid>
          </Section>
        </>
      )}
    </div>
  );
}
