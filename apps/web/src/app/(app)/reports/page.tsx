'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { useAuthStore } from '@/stores';
import { PageContent } from '@/components/ui/page-content';
import { PageHeader } from '@/components/ui/page-header';
import { MetricCard, MetricGrid } from '@/components/ui/metric-card';
import { Section } from '@/components/ui/section';
import { SimpleTable, type SimpleColumn } from '@/components/ui/simple-table';
import { MetricCardsSkeleton, TableSkeleton } from '@/components/skeletons';
import { ErrorState } from '@/components/ui/error-state';
import { DEFAULT_CURRENCY } from '@inventory/shared';
import { Button } from '@/components/ui/button';
import { downloadCsv } from '@/lib/csv';
import { downloadCsv as downloadCsvText } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';

type LowStockRow = {
  id: string;
  name: string;
  sku: string;
  stock: string | number;
  lowStockAt: string | number;
};

type SalesDay = {
  day: string;
  count: number;
  total: number | string;
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return isoDate(d);
}

function defaultTo() {
  return isoDate(new Date());
}

const PRESETS = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
] as const;

export default function ReportsPage() {
  const { toast } = useToast();
  const currency = useAuthStore((s) => s.user?.defaultCurrency ?? DEFAULT_CURRENCY);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const activePreset = useMemo(() => {
    const end = new Date(to);
    for (const p of PRESETS) {
      const start = new Date(end);
      start.setDate(end.getDate() - (p.days - 1));
      if (isoDate(start) === from && isoDate(end) === to) return p.id;
    }
    const monthStart = new Date(end.getFullYear(), end.getMonth(), 1);
    if (isoDate(monthStart) === from && isoDate(end) === to) return 'month';
    return null;
  }, [from, to]);

  function applyDays(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    setFrom(isoDate(start));
    setTo(isoDate(end));
  }

  function applyThisMonth() {
    const end = new Date();
    setFrom(isoDate(new Date(end.getFullYear(), end.getMonth(), 1)));
    setTo(isoDate(end));
  }

  const rangeParams = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set('from', new Date(from).toISOString());
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      params.set('to', end.toISOString());
    }
    const q = params.toString();
    return q ? `?${q}` : '';
  }, [from, to]);

  const sales = useQuery({
    queryKey: ['report-sales', from, to],
    queryFn: () => api<any>(`/reports/sales${rangeParams}`),
    placeholderData: keepPreviousData,
  });
  const inventory = useQuery({
    queryKey: ['report-inventory'],
    queryFn: () => api<any>('/reports/inventory'),
    placeholderData: keepPreviousData,
  });
  const lowStock = useQuery({
    queryKey: ['report-low-stock'],
    queryFn: () => api<LowStockRow[]>('/reports/low-stock'),
    placeholderData: keepPreviousData,
  });

  const metricsLoading =
    (sales.isLoading && !sales.data) || (inventory.isLoading && !inventory.data);
  const metricsError = sales.isError || inventory.isError;
  const lowStockColumns: SimpleColumn<LowStockRow>[] = [
    { id: 'product', header: 'Product', cell: (p) => p.name },
    { id: 'sku', header: 'SKU', hideOnMobile: true, cell: (p) => p.sku },
    { id: 'stock', header: 'Stock', cell: (p) => String(p.stock) },
    {
      id: 'threshold',
      header: 'Threshold',
      hideOnMobile: true,
      cell: (p) => String(p.lowStockAt),
    },
  ];

  const salesColumns: SimpleColumn<SalesDay>[] = [
    {
      id: 'day',
      header: 'Day',
      cell: (d) => formatDate(d.day),
    },
    { id: 'orders', header: 'Orders', cell: (d) => d.count },
    {
      id: 'total',
      header: 'Total',
      cell: (d) => formatMoney(d.total, currency),
    },
  ];

  return (
    <PageContent>
      <PageHeader
        title="Reports"
        description="Trends, low stock, and business performance"
        actions={
          <>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const res = await api<{ filename: string; csv: string }>(
                    `/reports/export/sales?from=${from}T00:00:00.000Z&to=${to}T23:59:59.999Z`,
                  );
                  downloadCsvText(res.filename, res.csv);
                  toast({ title: 'Export downloaded' });
                } catch (e) {
                  toast({
                    title: 'Export failed',
                    description: e instanceof Error ? e.message : undefined,
                    variant: 'destructive',
                  });
                }
              }}
            >
              Export invoices CSV
            </Button>
            <Button
              variant="outline"
              disabled={!sales.data?.byDay?.length}
              onClick={() => {
                const byDay = (sales.data?.byDay ?? []) as SalesDay[];
                downloadCsv('sales-by-day.csv', [
                  ['Day', 'Orders', 'Total'],
                  ...byDay.map((d) => [d.day, d.count, d.total]),
                  [],
                  ['Summary grand total', sales.data?.summary?.grandTotal ?? 0],
                  ['Summary orders', sales.data?.summary?.count ?? 0],
                ]);
              }}
            >
              Export sales CSV
            </Button>
            <Button
              variant="outline"
              disabled={!lowStock.data?.length}
              onClick={() => {
                downloadCsv('low-stock.csv', [
                  ['Product', 'SKU', 'Stock', 'Threshold'],
                  ...(lowStock.data ?? []).map((p) => [
                    p.name,
                    p.sku,
                    p.stock,
                    p.lowStockAt,
                  ]),
                ]);
              }}
            >
              Export low-stock CSV
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div
          className={cn(
            'flex h-9 w-full min-w-0 items-center gap-2 rounded-lg bg-muted/60 px-2.5 sm:w-auto',
            'focus-within:ring-2 focus-within:ring-ring',
          )}
        >
          <CalendarRange className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="Report from date"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm tabular-nums text-foreground outline-none [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-40"
          />
          <span className="shrink-0 text-muted-foreground/50" aria-hidden>
            –
          </span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Report to date"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm tabular-nums text-foreground outline-none [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-40"
          />
        </div>

        <div
          role="group"
          aria-label="Date range presets"
          className="inline-flex w-fit max-w-full flex-wrap items-center rounded-lg bg-muted/60 p-0.5"
        >
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyDays(p.days)}
              aria-pressed={activePreset === p.id}
              className={cn(
                'h-8 rounded-md px-2.5 text-xs font-medium transition-colors',
                activePreset === p.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={applyThisMonth}
            aria-pressed={activePreset === 'month'}
            className={cn(
              'h-8 rounded-md px-2.5 text-xs font-medium transition-colors',
              activePreset === 'month'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            This month
          </button>
        </div>
      </div>

      {metricsLoading ? (
        <MetricCardsSkeleton count={3} columns={3} />
      ) : metricsError ? (
        <ErrorState
          title="Could not load report metrics"
          onRetry={() => {
            void sales.refetch();
            void inventory.refetch();
          }}
        />
      ) : (
        <MetricGrid columns={3}>
          <MetricCard
            label="Sales total"
            value={formatMoney(sales.data?.summary?.grandTotal ?? 0, currency)}
          />
          <MetricCard label="Orders" value={String(sales.data?.summary?.count ?? 0)} index={1} />
          <MetricCard
            label="Inventory cost value"
            value={formatMoney(inventory.data?.valuation?.costValue ?? 0, currency)}
            index={2}
          />
        </MetricGrid>
      )}

      <Section title="Low stock">
        {lowStock.isLoading && !lowStock.data ? (
          <TableSkeleton rows={6} cols={4} />
        ) : lowStock.isError ? (
          <ErrorState title="Could not load low stock" onRetry={() => void lowStock.refetch()} />
        ) : (
          <SimpleTable
            columns={lowStockColumns}
            data={lowStock.data ?? []}
            getRowKey={(row) => row.id}
            emptyTitle="No low-stock products"
          />
        )}
      </Section>

      <Section title="Sales by day">
        {sales.isLoading && !sales.data ? (
          <TableSkeleton rows={6} cols={3} />
        ) : sales.isError ? (
          <ErrorState title="Could not load sales by day" onRetry={() => void sales.refetch()} />
        ) : (
          <SimpleTable
            columns={salesColumns}
            data={(sales.data?.byDay ?? []) as SalesDay[]}
            getRowKey={(row) => String(row.day)}
            emptyTitle="No sales data in this range"
          />
        )}
      </Section>
    </PageContent>
  );
}
