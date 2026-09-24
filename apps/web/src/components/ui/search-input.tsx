'use client';

import { Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export function SearchInput({
  className,
  containerClassName,
  isFetching = false,
  value,
  onChange,
  onClear,
  'aria-label': ariaLabel = 'Search',
  ...props
}: React.ComponentProps<typeof Input> & {
  containerClassName?: string;
  isFetching?: boolean;
  onClear?: () => void;
}) {
  const hasValue = String(value ?? '').length > 0;

  return (
    <div className={cn('relative min-w-0 w-full flex-1', containerClassName)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className={cn('pl-9 pr-16', className)}
        value={value}
        onChange={onChange}
        aria-label={ariaLabel}
        {...props}
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        {isFetching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        {hasValue ? (
          <button
            type="button"
            aria-label="Clear search"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => {
              if (onClear) {
                onClear();
                return;
              }
              onChange?.({
                target: { value: '' },
              } as React.ChangeEvent<HTMLInputElement>);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
