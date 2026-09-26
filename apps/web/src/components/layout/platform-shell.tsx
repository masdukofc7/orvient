'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, CreditCard, LayoutDashboard, ScrollText, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores';
import { onSessionRestore, restoreSession } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

const NAV = [
  { href: '/platform', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/platform/organizations', label: 'Organizations', icon: Building2 },
  { href: '/platform/users', label: 'Users', icon: Users },
  { href: '/platform/billing', label: 'Billing', icon: CreditCard },
  { href: '/platform/audit', label: 'Audit', icon: ScrollText },
];

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, hydrate, clearSession, accessToken, setSession } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hydrate();
    onSessionRestore((token, sessionUser) => setSession(token, sessionUser));
    void (async () => {
      const ok = await restoreSession();
      if (cancelled) return;
      setReady(true);
      if (!ok && !useAuthStore.getState().accessToken) {
        clearSession();
        router.replace('/login');
      }
    })();
    return () => {
      cancelled = true;
      onSessionRestore(null);
    };
  }, [hydrate, router, setSession, clearSession]);

  useEffect(() => {
    if (!ready) return;
    if (!accessToken) {
      router.replace('/login');
      return;
    }
    if (!user?.isPlatformAdmin) {
      router.replace('/dashboard');
    }
  }, [ready, accessToken, user?.isPlatformAdmin, router]);

  // Don't flash the platform skeleton for store users — wait or redirect quietly.
  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }

  if (!accessToken || !user?.isPlatformAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-[1400px]">
        <aside className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col border-r border-border px-3 py-4 md:flex">
          <div className="mb-4 px-2">
            <div className="text-sm font-semibold tracking-tight">Orvient Platform</div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</div>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5">
            {NAV.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-2 py-2 text-sm',
                    active
                      ? 'bg-muted font-medium'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto space-y-2 border-t border-border pt-3">
            <Button asChild variant="ghost" size="sm" className="w-full justify-start">
              <Link href="/dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to app
              </Link>
            </Button>
            <ThemeToggle />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur md:hidden">
            <div className="min-w-0 flex-1 text-sm font-semibold">Platform</div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/dashboard">App</Link>
            </Button>
            <ThemeToggle size="icon" />
          </header>
          <nav className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1 scrollbar-none md:hidden">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'whitespace-nowrap rounded-md px-2 py-1.5 text-xs',
                  (item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`))
                    ? 'bg-muted font-medium'
                    : 'text-muted-foreground',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <main className="min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
