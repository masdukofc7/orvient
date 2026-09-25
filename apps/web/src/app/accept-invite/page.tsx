'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Card, CardBody } from '@/components/ui/card';
import { useToast } from '@/components/ui/toaster';

function InviteForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      toast({ title: 'Missing invite token', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await api('/auth/accept-invite', {
        method: 'POST',
        body: { token, password },
        token: null,
      });
      toast({ title: 'Welcome — sign in with your new password' });
      router.replace('/login');
    } catch (err) {
      toast({
        title: 'Invite failed',
        description: err instanceof Error ? err.message : 'Invalid or expired invite',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardBody className="p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Accept invite</h1>
        <p className="mt-1 text-sm text-muted-foreground">Set a password to join the workspace.</p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <FormField label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </FormField>
          <Button className="w-full" loading={loading} disabled={!token}>
            {loading ? 'Saving…' : 'Join workspace'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/login" className="underline underline-offset-2">
            Already have an account?
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <InviteForm />
      </Suspense>
    </div>
  );
}
