import { cn } from '@/lib/utils';

export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      {title || action ? (
        <div className="flex items-center justify-between gap-3">
          {title ? (
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action ? <div className="ml-auto shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
