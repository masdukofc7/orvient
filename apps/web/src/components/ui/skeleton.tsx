import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-muted/80',
        'before:absolute before:inset-0 before:animate-shimmer',
        'before:bg-gradient-to-r before:from-transparent before:via-foreground/[0.08] before:to-transparent',
        className,
      )}
      {...props}
    />
  );
}
