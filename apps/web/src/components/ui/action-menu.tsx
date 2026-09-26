'use client';

import { useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ActionMenuItem = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

/** Compact overflow menu for PageHeader secondary actions. */
export function ActionMenu({
  label = 'More',
  items,
  className,
}: {
  label?: string;
  items: ActionMenuItem[];
  className?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  if (!items.length) return null;

  return (
    <details ref={ref} className={cn('relative', className)}>
      <summary
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'cursor-pointer list-none [&::-webkit-details-marker]:hidden',
        )}
      >
        {label}
        <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />
      </summary>
      <div className="absolute right-0 z-20 mt-1 flex min-w-[13rem] flex-col rounded-md border border-border bg-background p-1 shadow-md">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={item.disabled}
            className={cn(
              'rounded-sm px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50',
              item.destructive && 'text-destructive hover:bg-destructive/10',
            )}
            onClick={() => {
              ref.current?.removeAttribute('open');
              item.onClick();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}
