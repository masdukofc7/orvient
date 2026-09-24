import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-border bg-muted text-foreground',
        success:
          'border-emerald-600/25 bg-emerald-500/15 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-300',
        warning:
          'border-amber-600/25 bg-amber-500/15 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-300',
        danger:
          'border-destructive/35 bg-destructive/15 text-red-800 dark:border-red-400/30 dark:bg-destructive/20 dark:text-red-300',
        info: 'border-sky-600/25 bg-sky-500/15 text-sky-900 dark:border-sky-400/30 dark:bg-sky-400/15 dark:text-sky-300',
        muted: 'border-border bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export type BadgeProps = React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
