'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import type { AuthMembershipOption, SessionUser } from '@inventory/shared';
import { useAuthStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Card, CardBody } from '@/components/ui/card';
import { useToast } from '@/components/ui/toaster';

type LoginResult =
  | { accessToken: string; user: SessionUser }
  | { requiresOrgChoice: true; memberships: AuthMembershipOption[] };

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuthStore();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [memberships, setMemberships] = useState<AuthMembershipOption[] | null>(null);

  async function completeLogin(organizationId?: string) {
    setLoading(true);
    try {
      const res = await api<LoginResult>('/auth/login', {
        method: 'POST',
        body: { email, password, ...(organizationId ? { organizationId } : {}) },
        token: null,
      });
      if ('requiresOrgChoice' in res) {
        setMemberships(res.memberships);
        return;
      }
      setSession(res.accessToken, res.user);
      router.replace('/dashboard');
    } catch (err) {
      toast({
        title: 'Sign in failed',
        description: err instanceof Error ? err.message : 'Invalid credentials',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMemberships(null);
    await completeLogin();
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(24,24,27,0.06),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.06),_transparent_55%)]" />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative w-full max-w-md"
      >
        <Card className="bg-card/80 backdrop-blur">
          <CardBody className="p-6 sm:p-8">
            <div className="mb-6 sm:mb-8">
              <h1 className="text-2xl font-semibold tracking-tight">Orvient</h1>
              <p className="mt-1 text-sm text-muted-foreground">Sign in to your workspace</p>
              <p className="mt-3 text-xs text-muted-foreground">
                A product of{' '}
                <a
                  href="https://distrofyent.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Distrofy Enterprises
                </a>
              </p>
            </div>

            {memberships ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Choose a workspace</p>
                {memberships.map((m) => (
                  <Button
                    key={m.organizationId}
                    className="w-full justify-start"
                    variant="outline"
                    disabled={loading}
                    onClick={() => void completeLogin(m.organizationId)}
                  >
                    <span className="truncate">{m.organizationName}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{m.slug}</span>
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  className="w-full"
                  disabled={loading}
                  onClick={() => setMemberships(null)}
                >
                  Back
                </Button>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={onSubmit}>
                <FormField label="Email" htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </FormField>
                <FormField label="Password" htmlFor="password">
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </FormField>
                <Button className="w-full" loading={loading}>
                  {loading ? 'Signing in…' : 'Continue'}
                </Button>
              </form>
            )}

            <p className="mt-4 text-center text-sm text-muted-foreground">
              New to Orvient?{' '}
              <Link href="/register" className="underline underline-offset-2 hover:text-foreground">
                Create a workspace
              </Link>
            </p>
          </CardBody>
        </Card>
      </motion.div>
    </div>
  );
}
