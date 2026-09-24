import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-xl border border-border bg-card', className)}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('p-4 sm:p-5', className)} {...props} />;
}
