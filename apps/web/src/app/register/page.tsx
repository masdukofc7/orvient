'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import type { SessionUser } from '@inventory/shared';
import { setSignupIntent } from '@/lib/signup-intent';
import { useAuthStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Card, CardBody } from '@/components/ui/card';
import { FormFieldsSkeleton } from '@/components/skeletons';
import { useToast } from '@/components/ui/toaster';

function RegisterForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { setSession } = useAuthStore();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const planId = search.get('plan') ?? undefined;
    const cycleRaw = search.get('cycle');
    const cycle =
      cycleRaw === 'YEARLY' || cycleRaw === 'MONTHLY' ? cycleRaw : undefined;
    if (planId || cycle) setSignupIntent({ planId, cycle });
  }, [search]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api<{ accessToken: string; user: SessionUser }>('/auth/signup', {
        method: 'POST',
        body: { name, email, password, organizationName },
        token: null,
      });
      setSession(res.accessToken, res.user);
      toast({
        title: 'Workspace created',
        description: 'Quick store setup next — you can skip anytime.',
      });
      router.replace('/onboarding');
    } catch (err) {
      toast({
        title: 'Could not create workspace',
        description: err instanceof Error ? err.message : 'Signup failed',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardBody className="p-6 sm:p-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Orvient</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create your workspace</p>
          <p className="mt-3 text-xs text-muted-foreground">
            14-day trial included. Choose a plan when you pay.{' '}
            <Link href="/pricing" className="underline underline-offset-2 hover:text-foreground">
              See pricing
            </Link>
          </p>
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          <FormField label="Your name" htmlFor="name">
            <Input
              id="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Work email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Password" htmlFor="password" hint="At least 8 characters">
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </FormField>
          <FormField label="Company / store name" htmlFor="organizationName">
            <Input
              id="organizationName"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              required
            />
          </FormField>
          <Button className="w-full" loading={loading}>
            {loading ? 'Creating…' : 'Create workspace'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="underline underline-offset-2 hover:text-foreground">
            Sign in
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(24,24,27,0.06),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.06),_transparent_55%)]" />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative w-full max-w-md"
      >
        <Suspense
          fallback={
            <Card>
              <CardBody className="p-8">
                <FormFieldsSkeleton fields={4} columns={1} />
              </CardBody>
            </Card>
          }
        >
          <RegisterForm />
        </Suspense>
      </motion.div>
    </div>
  );
}
