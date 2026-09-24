'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';

let pending = false;
let clearTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function startRouteNavigation() {
  if (pending) return;
  pending = true;
  emit();
  if (clearTimer) clearTimeout(clearTimer);
  // ponytail: failsafe if navigation never completes (cancel / same-route edge)
  clearTimer = setTimeout(() => clearRouteNavigation(), 4000);
}

export function clearRouteNavigation() {
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  if (!pending) return;
  pending = false;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return pending;
}

function getServerSnapshot() {
  return false;
}

export function useRoutePending() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function isInternalNavClick(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = (event.target as HTMLElement | null)?.closest('a');
  if (!anchor) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(anchor.href);
  } catch {
    return false;
  }
  if (url.origin !== window.location.origin) return false;
  if (url.pathname.startsWith('/login')) return false;
  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

export function RouteProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const searchKey = search.toString();
  const active = useRoutePending();

  useEffect(() => {
    clearRouteNavigation();
  }, [pathname, searchKey]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!isInternalNavClick(event)) return;
      startRouteNavigation();
    };
    const onPopState = () => clearRouteNavigation();
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  return (
    <div
      role="progressbar"
      aria-hidden={!active}
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-[200] h-0.5 overflow-hidden bg-transparent transition-opacity duration-150',
        active ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="relative h-full w-full overflow-hidden bg-muted">
        <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-foreground to-transparent" />
      </div>
    </div>
  );
}
