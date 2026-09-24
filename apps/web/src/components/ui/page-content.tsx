import { cn } from '@/lib/utils';

/** Consistent vertical rhythm + width for app pages. */
export function PageContent({
  children,
  className,
  width = 'full',
}: {
  children: React.ReactNode;
  className?: string;
  /** form = settings; readable = billing / focused detail */
  width?: 'full' | 'form' | 'readable';
}) {
  return (
    <div
      className={cn(
        'w-full min-w-0 space-y-6 sm:space-y-7',
        width === 'form' && 'mx-auto max-w-lg',
        width === 'readable' && 'mx-auto max-w-2xl',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Shared filter row: search + optional controls. */
export function PageFilters({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:p-3.5',
        '[&>:first-child]:w-full [&>:first-child]:min-w-0 [&>:first-child]:sm:flex-1',
        className,
      )}
    >
      {children}
    </div>
  );
}
