'use client';

import { cn } from '@/lib/utils';
import { SearchInput } from '@/components/ui/search-input';
import { EmptyState } from '@/components/ui/empty-state';

export type PickerItem = {
  id: string;
  primary: string;
  secondary?: string | null;
};

export function EntityPicker({
  items,
  search,
  onSearchChange,
  onSelect,
  selectedLabel,
  searchPlaceholder = 'Search…',
  emptyTitle = 'No matches',
  isLoading = false,
  className,
}: {
  items: PickerItem[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (item: PickerItem) => void;
  selectedLabel?: string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  isLoading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <SearchInput
        containerClassName="max-w-none"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !items.length) return;
          e.preventDefault();
          onSelect(items[0]);
        }}
        placeholder={searchPlaceholder}
        isFetching={isLoading}
      />
      {selectedLabel ? (
        <p className="text-xs text-muted-foreground">Selected: {selectedLabel}</p>
      ) : null}
      <div className="max-h-40 overflow-auto rounded-md border border-border bg-background scrollbar-none sm:max-h-48">
        {items.length ? (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              onClick={() => onSelect(item)}
            >
              <span className="min-w-0 flex-1 truncate">{item.primary}</span>
              {item.secondary ? (
                <span className="shrink-0 text-xs text-muted-foreground">{item.secondary}</span>
              ) : null}
            </button>
          ))
        ) : isLoading ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">Searching…</p>
        ) : (
          <EmptyState title={emptyTitle} className="py-8" />
        )}
      </div>
    </div>
  );
}
