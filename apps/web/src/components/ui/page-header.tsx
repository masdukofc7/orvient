import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <div className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div
          className={cn(
            'grid w-full shrink-0 grid-cols-2 gap-2',
            'sm:ml-auto sm:flex sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end',
            '[&>*]:min-w-0 [&>*]:w-full sm:[&>*]:w-auto',
            '[&>*:only-child]:col-span-2',
          )}
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}
