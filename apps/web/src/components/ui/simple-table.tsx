import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';

export type SimpleColumn<T> = {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Hide this column below `md` (still shown when printing) */
  hideOnMobile?: boolean;
};

type SimpleTableProps<T> = {
  columns: SimpleColumn<T>[];
  data: T[];
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  className?: string;
};

export function SimpleTable<T>({
  columns,
  data,
  getRowKey,
  onRowClick,
  emptyTitle = 'No results',
  emptyDescription,
  emptyAction,
  className,
}: SimpleTableProps<T>) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border print:overflow-visible', className)}>
      <div className="-mx-px overflow-x-auto overscroll-x-contain print:overflow-visible">
      <table className="w-full min-w-[20rem] text-sm sm:min-w-0 print:min-w-0">
        <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground print:bg-transparent">
          <tr>
            {columns.map((col) => (
              <th
                key={col.id}
                className={cn(
                  'h-10 whitespace-nowrap px-3 font-medium sm:px-4 print:h-auto print:px-1 print:py-1',
                  col.id === 'actions' && 'text-right',
                  col.hideOnMobile && 'hidden md:table-cell print:table-cell',
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length ? (
            data.map((row) => (
              <tr
                key={getRowKey(row)}
                className={cn(
                  'border-b border-border/70 transition-colors hover:bg-muted/40 print:hover:bg-transparent',
                  onRowClick && 'cursor-pointer',
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={cn(
                      'px-3 py-2.5 align-middle sm:px-4 print:px-1 print:py-1',
                      col.id === 'actions' && 'text-right',
                      col.hideOnMobile && 'hidden md:table-cell print:table-cell',
                      col.className,
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
