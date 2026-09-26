'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const DEFAULT_LIMITS = [10, 25, 50, 100] as const;

export function Pagination({
  page,
  limit,
  total,
  onPageChange,
  onLimitChange,
  limitOptions = DEFAULT_LIMITS,
  className,
}: {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  limitOptions?: readonly number[];
  className?: string;
}) {
  if (total <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * limit + 1;
  const to = Math.min(safePage * limit, total);

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground sm:flex-row',
        className,
      )}
    >
      <span className="tabular-nums">
        Showing {from}–{to} of {total}
      </span>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label="Previous page"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[4.5rem] text-center tabular-nums">
          {safePage} of {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label="Next page"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {onLimitChange ? (
          <Select
            aria-label="Rows per page"
            className="h-8 w-[4.5rem] text-xs"
            containerClassName="w-[4.5rem]"
            value={String(limit)}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            options={limitOptions.map((n) => ({ value: String(n), label: String(n) }))}
          />
        ) : null}
      </div>
    </div>
  );
}
