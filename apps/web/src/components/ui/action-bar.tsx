import { cn } from '@/lib/utils';

/**
 * LTR action row: secondary left, primary right.
 * Mobile stacks primary on top (flex-col-reverse) for thumb reach.
 */
export function ActionBar({
  className,
  children,
  align = 'end',
}: {
  className?: string;
  children: React.ReactNode;
  /** end = flush right; between = skip/back left, primary right */
  align?: 'end' | 'between';
}) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:items-center',
        align === 'end' && 'sm:justify-end',
        align === 'between' && 'sm:justify-between',
        '[&>*]:w-full sm:[&>*]:w-auto',
        className,
      )}
    >
      {children}
    </div>
  );
}
