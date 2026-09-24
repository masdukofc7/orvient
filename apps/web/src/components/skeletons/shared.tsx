import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function PageHeaderSkeleton({
  action = false,
  className,
}: {
  action?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-8 w-40 sm:w-52" />
        <Skeleton className="h-4 w-56 max-w-full sm:w-72" />
      </div>
      {action ? <Skeleton className="h-9 w-full shrink-0 sm:ml-auto sm:w-28" /> : null}
    </div>
  );
}

export function FiltersSkeleton({ controls = 1 }: { controls?: number }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:p-3.5">
      <Skeleton className="h-9 w-full min-w-0 sm:flex-1" />
      {Array.from({ length: controls }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full shrink-0 sm:w-44" />
      ))}
    </div>
  );
}

export function FormFieldsSkeleton({
  fields = 4,
  columns = 1,
}: {
  fields?: number;
  columns?: 1 | 2;
}) {
  return (
    <div
      className={cn(
        'grid gap-4',
        columns === 2 && 'sm:grid-cols-2',
      )}
    >
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

export function MetricCardsSkeleton({
  count = 4,
  columns = 4,
}: {
  count?: number;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div
      className={cn(
        'grid gap-3 sm:gap-4',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        columns === 4 && 'sm:grid-cols-2 xl:grid-cols-4',
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-8 w-28" />
        </div>
      ))}
    </div>
  );
}

/** Header + filters + table — list pages. */
export function ListPageSkeleton({
  cols = 5,
  rows = 8,
  filterControls = 1,
  action = true,
}: {
  cols?: number;
  rows?: number;
  filterControls?: number;
  action?: boolean;
}) {
  return (
    <div className="w-full space-y-6 sm:space-y-7">
      <PageHeaderSkeleton action={action} />
      <FiltersSkeleton controls={filterControls} />
      <TableSkeleton rows={rows} cols={cols} />
    </div>
  );
}

/** Header + metrics + table section — dashboard / reports. */
export function DashboardPageSkeleton({
  metrics = 4,
  metricColumns = 4,
  tableCols = 4,
}: {
  metrics?: number;
  metricColumns?: 2 | 3 | 4;
  tableCols?: number;
}) {
  return (
    <div className="w-full space-y-6 sm:space-y-7">
      <PageHeaderSkeleton action />
      <MetricCardsSkeleton count={metrics} columns={metricColumns} />
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <TableSkeleton rows={6} cols={tableCols} />
      </div>
    </div>
  );
}

/** Header + summary card + lines table — invoice / PO detail. */
export function DetailPageSkeleton({
  action = true,
  fields = 4,
}: {
  action?: boolean;
  fields?: number;
}) {
  return (
    <div className="w-full space-y-6 sm:space-y-7">
      <PageHeaderSkeleton action={action} />
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

/** Header + form card — settings / onboarding. */
export function FormPageSkeleton({
  width = 'full',
  fields = 6,
  columns = 2,
  action = false,
}: {
  width?: 'full' | 'form' | 'readable';
  fields?: number;
  columns?: 1 | 2;
  action?: boolean;
}) {
  return (
    <div
      className={cn(
        'w-full space-y-6 sm:space-y-7',
        width === 'form' && 'mx-auto max-w-lg',
        width === 'readable' && 'mx-auto max-w-2xl',
      )}
    >
      <PageHeaderSkeleton action={action} />
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <FormFieldsSkeleton fields={fields} columns={columns} />
        <Skeleton className="mt-6 ml-auto h-9 w-28" />
      </div>
    </div>
  );
}

/** Billing: status + plan cards + pay row. */
export function BillingPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 sm:space-y-7">
      <PageHeaderSkeleton action />
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
        <div className="grid gap-3 sm:grid-cols-3">
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
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
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

/** POS two-column layout. */
export function PosPageSkeleton() {
  return (
    <div className="w-full space-y-6 sm:space-y-7">
      <PageHeaderSkeleton action />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="space-y-3">
          <Skeleton className="h-12 w-full rounded-md" />
          <div className="space-y-2 rounded-xl border border-border p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="space-y-2 border-t border-border pt-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}

/** Inventory: form card + ledger table. */
export function InventoryPageSkeleton() {
  return (
    <div className="w-full space-y-6 sm:space-y-7">
      <PageHeaderSkeleton />
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-4 sm:p-5">
        <FormFieldsSkeleton fields={4} columns={1} />
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Skeleton className="h-9 w-full sm:w-24" />
          <Skeleton className="h-9 w-full sm:w-24" />
          <Skeleton className="h-9 w-full sm:w-24" />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-3 w-20" />
        <TableSkeleton rows={8} cols={5} />
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
          <Skeleton className="ml-auto h-5 w-28" />
          <Skeleton className="ml-auto h-3 w-24" />
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

/**
 * Auth/shell fallback — picks a layout that matches the route so the flash
 * doesn't look like a dashboard on every page.
 */
export function PageSkeleton({ pathname = '/' }: { pathname?: string }) {
  const path = pathname.replace(/\/$/, '') || '/';

  if (path === '/onboarding') {
    return <FormPageSkeleton width="form" fields={3} columns={1} />;
  }
  if (path === '/pos') return <PosPageSkeleton />;
  if (path === '/dashboard' || path === '/') {
    return <DashboardPageSkeleton />;
  }
  if (path === '/reports') {
    return <DashboardPageSkeleton metrics={3} metricColumns={3} tableCols={4} />;
  }
  if (path === '/inventory') return <InventoryPageSkeleton />;
  if (path === '/settings') {
    return <FormPageSkeleton width="full" fields={6} columns={2} action />;
  }
  if (path === '/settings/billing') return <BillingPageSkeleton />;
  if (path.startsWith('/invoices/') || path.startsWith('/receipt/')) {
    return (
      <div className="w-full space-y-6 sm:space-y-7">
        <PageHeaderSkeleton action />
        <ReceiptSkeleton />
      </div>
    );
  }
  if (path.startsWith('/purchase-orders/') && path !== '/purchase-orders/new') {
    return <DetailPageSkeleton />;
  }
  if (path === '/purchase-orders/new') {
    return <FormPageSkeleton width="full" fields={4} columns={1} action />;
  }
  if (path === '/products' || path === '/contacts' || path === '/invoices' || path === '/purchase-orders') {
    return (
      <ListPageSkeleton
        cols={path === '/products' ? 6 : 5}
        filterControls={path === '/invoices' ? 2 : 1}
      />
    );
  }
  if (path === '/platform' || path.startsWith('/platform/')) {
    if (path.match(/^\/platform\/organizations\/[^/]+$/)) {
      return (
        <div className="space-y-6">
          <PageHeaderSkeleton action />
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <FormFieldsSkeleton fields={2} columns={2} />
          </div>
          <MetricCardsSkeleton count={5} columns={4} />
          <TableSkeleton rows={5} cols={4} />
        </div>
      );
    }
    if (path === '/platform') {
      return (
        <div className="space-y-6">
          <PageHeaderSkeleton />
          <MetricCardsSkeleton count={8} columns={4} />
        </div>
      );
    }
    if (path === '/platform/billing') {
      return (
        <div className="space-y-4">
          <PageHeaderSkeleton />
          <TableSkeleton rows={6} cols={6} />
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <PageHeaderSkeleton action={path !== '/platform/audit'} />
        <Skeleton className="h-9 w-full max-w-sm" />
        <TableSkeleton rows={8} cols={5} />
      </div>
    );
  }

  return <ListPageSkeleton />;
}
