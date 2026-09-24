'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, Command, Menu, MoreHorizontal } from 'lucide-react';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthMembershipOption, SessionUser } from '@inventory/shared';
import { cn } from '@/lib/utils';
import { navItemsForRole, isNavActive, type NavItem } from '@/lib/nav';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuthStore } from '@/stores';
import { api, onSessionRestore, restoreSession } from '@/lib/api';
import { CommandPalette } from '@/components/command/command-palette';
import { ThemeToggle } from '@/components/theme-toggle';
import { PageSkeleton } from '@/components/skeletons';
import { RouteProgress } from '@/components/layout/route-progress';
import { BillingBanner } from '@/components/billing/billing-banner';

/** Survives layout remounts so page changes don't flash a blank screen. */
let sessionReady = false;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, hydrate, clearSession, accessToken, setSession } = useAuthStore();
  const qc = useQueryClient();
  const [ready, setReady] = useState(sessionReady);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [memberships, setMemberships] = useState<AuthMembershipOption[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [switching, setSwitching] = useState(false);
  const desktopNavRef = useRef<HTMLElement>(null);
  const [desktopPill, setDesktopPill] = useState({ top: 0, height: 0, ready: false });

  const membershipRole = user?.membershipRole;
  const navItems = useMemo(() => navItemsForRole(membershipRole), [membershipRole]);
  const primaryNav = useMemo(() => navItems.filter((item) => item.primary), [navItems]);
  const showOrgSwitcher = memberships.length > 1;
  const showBranchSwitcher = branches.length > 1;

  useEffect(() => {
    let cancelled = false;
    hydrate();
    onSessionRestore((token, sessionUser) => {
      setSession(token, sessionUser);
    });

    void (async () => {
      const ok = await restoreSession();
      if (cancelled) return;
      sessionReady = true;
      setReady(true);
      if (!ok && !useAuthStore.getState().accessToken) {
        clearSession();
        router.replace('/login');
      }
      if ('serviceWorker' in navigator) {
        void navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => void r.unregister());
        });
      }
    })();

    return () => {
      cancelled = true;
      onSessionRestore(null);
    };
  }, [hydrate, router, setSession, clearSession]);

  useEffect(() => {
    if (!ready || !accessToken) return;
    let cancelled = false;
    void api<AuthMembershipOption[]>('/auth/memberships')
      .then((list) => {
        if (!cancelled) setMemberships(list);
      })
      .catch(() => {
        if (!cancelled) setMemberships([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, accessToken, user?.organizationId]);

  useEffect(() => {
    if (!ready || !accessToken) return;
    let cancelled = false;
    void api<Array<{ id: string; name: string }>>('/organizations/branches')
      .then((list) => {
        if (!cancelled) setBranches(list);
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, accessToken, user?.organizationId]);

  async function switchOrg(organizationId: string) {
    if (!organizationId || organizationId === user?.organizationId || switching) return;
    setSwitching(true);
    try {
      const res = await api<{ accessToken: string; user: SessionUser }>('/auth/switch-org', {
        method: 'POST',
        body: { organizationId },
      });
      setSession(res.accessToken, res.user);
      qc.clear();
      router.refresh();
      router.replace('/dashboard');
    } finally {
      setSwitching(false);
    }
  }

  async function switchBranch(branchId: string) {
    if (!branchId || branchId === user?.branchId || switching) return;
    setSwitching(true);
    try {
      const res = await api<{ accessToken: string; user: SessionUser }>('/auth/switch-branch', {
        method: 'POST',
        body: { branchId },
      });
      setSession(res.accessToken, res.user);
      qc.clear();
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    if (!accessToken) {
      router.replace('/login');
    }
  }, [ready, accessToken, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const syncDesktopPill = useCallback(() => {
    const nav = desktopNavRef.current;
    const active = nav?.querySelector<HTMLElement>('[data-nav-active="true"]');
    if (!nav || !active) {
      setDesktopPill((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }
    const top = active.offsetTop;
    const height = active.offsetHeight;
    setDesktopPill((prev) =>
      prev.ready && prev.top === top && prev.height === height
        ? prev
        : { top, height, ready: true },
    );
  }, []);

  useEffect(() => {
    syncDesktopPill();
  }, [pathname, syncDesktopPill, ready, membershipRole, navItems]);

  useEffect(() => {
    window.addEventListener('resize', syncDesktopPill);
    return () => window.removeEventListener('resize', syncDesktopPill);
  }, [syncDesktopPill]);

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    clearSession();
    router.replace('/login');
  }

  function NavLinks({
    items,
    onNavigate,
    compact = false,
    trackActive = false,
  }: {
    items: NavItem[];
    onNavigate?: () => void;
    compact?: boolean;
    trackActive?: boolean;
  }) {
    return items.map((item) => {
      const active = isNavActive(pathname, item.href);
      const Icon = item.icon;
      const label = compact ? (item.shortLabel ?? item.label) : item.label;

      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          title={item.label}
          data-nav-active={trackActive && active ? 'true' : undefined}
          className={cn(
            'relative flex min-w-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground',
            compact && 'flex-col gap-1 px-1 py-1.5 text-[10px] leading-tight',
            active && 'text-foreground',
            active && !trackActive && 'bg-muted',
          )}
        >
          <Icon className={cn('relative z-10 shrink-0', compact ? 'h-5 w-5' : 'h-4 w-4')} />
          <span
            className={cn(
              'relative z-10 min-w-0 truncate',
              compact && 'max-w-[4.5rem] text-center',
            )}
          >
            {label}
          </span>
        </Link>
      );
    });
  }

  const workspaceBlock = (
    <div className="space-y-2 border-b border-border px-1 pb-3">
      <div className="px-1.5 text-sm font-semibold tracking-tight">Orvient</div>
      {showOrgSwitcher ? (
        <Select
          className="h-8 text-xs"
          value={user?.organizationId ?? ''}
          disabled={switching}
          onChange={(e) => void switchOrg(e.target.value)}
          options={memberships.map((m) => ({
            value: m.organizationId,
            label: m.organizationName,
          }))}
          aria-label="Switch workspace"
        />
      ) : (
        <div className="truncate px-1.5 text-xs text-muted-foreground">
          {user?.organizationName ?? 'Workspace'}
        </div>
      )}
      {showBranchSwitcher ? (
        <Select
          className="h-8 text-xs"
          value={user?.branchId ?? ''}
          disabled={switching}
          onChange={(e) => void switchBranch(e.target.value)}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
          aria-label="Switch branch"
        />
      ) : null}
    </div>
  );

  const utilityBar = (
    <div className="flex items-center justify-between gap-1">
      <Button
        size="icon"
        variant="ghost"
        aria-label="Command palette"
        title="Command (⌘K)"
        onClick={() => setCmdOpen(true)}
      >
        <Command className="h-4 w-4" />
      </Button>
      <ThemeToggle size="icon" />
      <Button size="icon" variant="ghost" aria-label="Log out" title="Log out" onClick={logout}>
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );

  const showPage = ready && Boolean(accessToken);
  const minimalChrome = pathname === '/onboarding';

  return (
    <div className="min-h-screen bg-background">
      <Suspense fallback={null}>
        <RouteProgress />
      </Suspense>
      {minimalChrome ? (
        <div className="mx-auto flex min-h-screen max-w-lg flex-col px-3 py-6 sm:px-4">
          <div className="mb-6 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold tracking-tight">Orvient</div>
            <div className="flex items-center gap-1">
              <ThemeToggle size="icon" />
              <Button size="icon" variant="ghost" aria-label="Log out" onClick={logout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {showPage ? children : <PageSkeleton pathname={pathname} />}
        </div>
      ) : (
      <>
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="no-print sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-3 border-r border-border bg-background px-3 py-4 lg:flex">
          {workspaceBlock}
          <nav
            ref={desktopNavRef}
            className="relative flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain scrollbar-none"
          >
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 rounded-md bg-muted"
              initial={false}
              animate={{
                y: desktopPill.top,
                height: desktopPill.height,
                opacity: desktopPill.ready ? 1 : 0,
              }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            />
            {navItems.length ? <NavLinks items={navItems} trackActive /> : null}
          </nav>
          <div className="shrink-0 space-y-2 border-t border-border pt-3">
            {utilityBar}
            {user?.isPlatformAdmin ? (
              <Link
                href="/platform"
                className="block px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Platform admin
              </Link>
            ) : null}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur lg:hidden">
            <div className="flex items-center gap-1 px-2 py-2 sm:px-3">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Open menu"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {user?.organizationName ?? 'Orvient'}
                </div>
              </div>
              {showBranchSwitcher ? (
                <Select
                  className="h-8 max-w-[9rem] text-[11px]"
                  value={user?.branchId ?? ''}
                  disabled={switching}
                  onChange={(e) => void switchBranch(e.target.value)}
                  options={branches.map((b) => ({ value: b.id, label: b.name }))}
                  aria-label="Switch branch"
                />
              ) : null}
              <Button
                size="icon"
                variant="ghost"
                aria-label="Command palette"
                onClick={() => setCmdOpen(true)}
              >
                <Command className="h-4 w-4" />
              </Button>
              <ThemeToggle size="icon" />
            </div>
            {showOrgSwitcher ? (
              <div className="border-t border-border px-3 py-2">
                <Select
                  className="h-8 text-xs"
                  value={user?.organizationId ?? ''}
                  disabled={switching}
                  onChange={(e) => void switchOrg(e.target.value)}
                  options={memberships.map((m) => ({
                    value: m.organizationId,
                    label: m.organizationName,
                  }))}
                  aria-label="Switch workspace"
                />
              </div>
            ) : null}
          </header>

          {showPage ? <BillingBanner /> : null}

          <main className="min-w-0 flex-1 px-3 py-5 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-8 lg:py-8 lg:pb-8 print:p-0 print:pb-0">
            {showPage ? children : <PageSkeleton pathname={pathname} />}
          </main>

          <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
            <div className="mx-auto grid max-w-[1600px] grid-cols-5 gap-0.5 px-1 py-1">
              <NavLinks items={primaryNav} compact />
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="flex flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <MoreHorizontal className="h-5 w-5" />
                More
              </button>
            </div>
          </nav>
        </div>
      </div>

      <div className="no-print">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="flex flex-col px-0">
            <SheetHeader className="space-y-2 border-b border-border pb-3">
              <SheetTitle>Orvient</SheetTitle>
              {showOrgSwitcher ? (
                <Select
                  className="h-8 text-xs"
                  value={user?.organizationId ?? ''}
                  disabled={switching}
                  onChange={(e) => void switchOrg(e.target.value)}
                  options={memberships.map((m) => ({
                    value: m.organizationId,
                    label: m.organizationName,
                  }))}
                  aria-label="Switch workspace"
                />
              ) : (
                <p className="truncate text-xs text-muted-foreground">
                  {user?.organizationName ?? 'Workspace'}
                </p>
              )}
              {showBranchSwitcher ? (
                <Select
                  className="h-8 text-xs"
                  value={user?.branchId ?? ''}
                  disabled={switching}
                  onChange={(e) => void switchBranch(e.target.value)}
                  options={branches.map((b) => ({ value: b.id, label: b.name }))}
                  aria-label="Switch branch"
                />
              ) : null}
            </SheetHeader>
            <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-3 scrollbar-none">
              {mobileOpen ? (
                <NavLinks items={navItems} onNavigate={() => setMobileOpen(false)} />
              ) : null}
            </nav>
            <div className="mt-auto shrink-0 space-y-2 border-t border-border p-3">
              {utilityBar}
              {user?.isPlatformAdmin ? (
                <Link
                  href="/platform"
                  className="block px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => setMobileOpen(false)}
                >
                  Platform admin
                </Link>
              ) : null}
            </div>
          </SheetContent>
        </Sheet>

        <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      </div>
      </>
      )}
    </div>
  );
}
