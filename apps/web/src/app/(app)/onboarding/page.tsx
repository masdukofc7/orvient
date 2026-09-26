'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_CURRENCY, ensureCurrencyOption } from '@inventory/shared';
import { api } from '@/lib/api';
import {
  billingHrefFromIntent,
  isSetupDone,
  markSetupDone,
} from '@/lib/signup-intent';
import { useAuthStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { PageHeader } from '@/components/ui/page-header';
import { PageContent } from '@/components/ui/page-content';
import { Card, CardBody } from '@/components/ui/card';
import { FormFieldsSkeleton } from '@/components/skeletons';
import { ErrorState } from '@/components/ui/error-state';
import { useToast } from '@/components/ui/toaster';
import { ActionBar } from '@/components/ui/action-bar';

type Organization = {
  id: string;
  name: string;
  defaultCurrency: string;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const qc = useQueryClient();
  const setSession = useAuthStore((s) => s.setSession);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user?.organizationId) return;
    if (isSetupDone(user.organizationId)) {
      router.replace('/dashboard');
      return;
    }
    setReady(true);
  }, [user?.organizationId, router]);

  const org = useQuery({
    queryKey: ['organization'],
    queryFn: () => api<Organization>('/organizations/current'),
    enabled: ready,
  });

  function finish(next: string) {
    if (user?.organizationId) markSetupDone(user.organizationId);
    router.replace(next);
  }

  const save = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api<Organization>('/organizations/current', { method: 'PATCH', body }),
    onSuccess: (updated) => {
      void qc.invalidateQueries({ queryKey: ['organization'] });
      if (user && accessToken) {
        setSession(accessToken, {
          ...user,
          organizationName: updated.name,
          defaultCurrency: updated.defaultCurrency,
        });
      }
      toast({ title: 'Store saved' });
      finish('/dashboard');
    },
    onError: (e: Error) =>
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  if (!ready) {
    return (
      <PageContent width="form" className="max-w-md">
        <PageHeader
          title="Set up your store"
          description="Shown on invoices — skip and finish later in Settings"
        />
        <Card>
          <CardBody>
            <FormFieldsSkeleton fields={3} columns={1} />
          </CardBody>
        </Card>
      </PageContent>
    );
  }

  const currencyOptions = ensureCurrencyOption(org.data?.defaultCurrency ?? DEFAULT_CURRENCY);

  return (
    <PageContent width="form" className="max-w-md">
      <PageHeader
        title="Set up your store"
        description="Shown on invoices — skip and finish later in Settings"
      />
      <Card>
        <CardBody>
          {org.isLoading && !org.data ? (
            <FormFieldsSkeleton fields={3} columns={1} />
          ) : org.isError ? (
            <ErrorState title="Could not load store" onRetry={() => void org.refetch()} />
          ) : (
            <form
              key={org.data?.id}
              className="space-y-4"
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
                  email,
                  phone,
                  address,
                });
              }}
            >
              <FormField label="Store name">
                <Input name="name" defaultValue={org.data?.name} required />
              </FormField>
              <FormField label="Currency">
                <Select
                  name="defaultCurrency"
                  defaultValue={org.data?.defaultCurrency ?? DEFAULT_CURRENCY}
                  options={currencyOptions}
                  required
                />
              </FormField>
              <FormField label="Email" hint="Email or phone required" required>
                <Input
                  name="email"
                  type="email"
                  defaultValue={org.data?.email ?? ''}
                  placeholder="billing@company.com"
                />
              </FormField>
              <FormField label="Phone" hint="Email or phone required" required>
                <Input name="phone" type="tel" defaultValue={org.data?.phone ?? ''} />
              </FormField>
              <FormField label="Address" required>
                <Input name="address" defaultValue={org.data?.address ?? ''} required />
              </FormField>
              <ActionBar>
                <Button loading={save.isPending}>
                  {save.isPending ? 'Saving…' : 'Save and continue'}
                </Button>
              </ActionBar>
            </form>
          )}
        </CardBody>
      </Card>
      <ActionBar align="between">
        <Button variant="ghost" onClick={() => finish('/dashboard')}>
          Skip for now
        </Button>
        <Button variant="outline" onClick={() => finish(billingHrefFromIntent())}>
          Choose a plan
        </Button>
      </ActionBar>
    </PageContent>
  );
}
