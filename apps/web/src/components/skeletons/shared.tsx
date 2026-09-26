import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function FormFieldsSkeleton({
  fields = 4,
  columns = 1,
}: {
  fields?: number;
  columns?: 1 | 2;
}) {
  return (
    <div className={cn('grid gap-4', columns === 2 && 'sm:grid-cols-2')}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex gap-3 border-b border-border bg-muted/40 px-3 py-3 sm:px-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-3 w-16" />
        ))}
      </div>
      <div className="divide-y divide-border/70">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={`r-${r}`} className="flex gap-3 px-3 py-3 sm:px-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={`c-${r}-${c}`} className="h-4 w-full max-w-[9rem]" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PaginationSkeleton() {
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border pt-3 sm:flex-row">
      <Skeleton className="h-3 w-36" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-[4.5rem]" />
      </div>
    </div>
  );
}

export function MetricCardsSkeleton({
  count = 4,
  columns = 4,
  className,
}: {
  count?: number;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-3 sm:gap-4',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        columns === 4 && 'sm:grid-cols-2 xl:grid-cols-4',
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-7 w-28 sm:h-8" />
        </div>
      ))}
    </div>
  );
}

/** Summary card + lines table — invoice / PO detail body (no header). */
export function DetailPageSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="w-full min-w-0 space-y-6 sm:space-y-7">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: fields }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-32" />
            </div>
          ))}
        </div>
      </div>
      <TableSkeleton rows={5} cols={4} />
    </div>
  );
}

/** Billing body only — status + plans + pay row (no header). */
export function BillingPageSkeleton() {
  return (
    <div className="w-full min-w-0 space-y-6 sm:space-y-7">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="mt-2 h-4 w-48" />
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-40 rounded-lg" />
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col rounded-xl border border-border p-4">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="mt-3 h-7 w-16" />
              <div className="mt-4 flex-1 space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="mt-4 h-9 w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <Skeleton className="h-4 w-28" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="ml-auto h-9 w-36" />
      </div>
    </div>
  );
}

/** Receipt / invoice document body. */
export function ReceiptSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="space-y-2 sm:text-right">
          <Skeleton className="h-5 w-28 sm:ml-auto" />
          <Skeleton className="h-3 w-24 sm:ml-auto" />
        </div>
      </div>
      <TableSkeleton rows={4} cols={4} />
      <div className="ml-auto w-full max-w-xs space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    </div>
  );
}

/** Pricing plan grid. */
export function PlanCardsSkeleton() {
  return (
    <div className="mt-10 grid items-stretch gap-4 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex flex-col rounded-xl border border-border bg-card p-6">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="mt-5 h-9 w-28" />
          <div className="mt-6 flex-1 space-y-2">
            {Array.from({ length: 5 }).map((_, j) => (
              <Skeleton key={j} className="h-3 w-full" />
            ))}
          </div>
          <Skeleton className="mt-8 h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Platform org detail body (no header). */
export function PlatformOrgDetailSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-7">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={cn('space-y-1.5', i === 2 && 'sm:col-span-2')}>
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="flex flex-col space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="min-h-32 w-full flex-1 rounded-md" />
          <Skeleton className="ml-auto h-8 w-24" />
        </div>
      </div>
      <MetricCardsSkeleton count={5} columns={2} className="lg:grid-cols-5" />
      <TableSkeleton rows={5} cols={4} />
    </div>
  );
}
