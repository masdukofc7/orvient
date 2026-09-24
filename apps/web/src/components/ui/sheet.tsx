'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({
  className,
  children,
  side = 'left',
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  side?: 'left' | 'right' | 'bottom';
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] dark:bg-black/70" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col border border-border bg-card text-card-foreground shadow-soft outline-none',
          side === 'left' &&
            'inset-y-0 left-0 h-full w-[min(100%,20rem)] max-w-[85vw] border-r',
          side === 'right' &&
            'inset-y-0 right-0 h-full w-[min(100%,20rem)] max-w-[85vw] border-l',
          side === 'bottom' &&
            'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)]',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className={cn(
            'absolute right-3 top-3 z-10 rounded-md p-1.5 text-foreground',
            'opacity-70 transition-opacity hover:bg-muted hover:opacity-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('border-b border-border px-4 py-4 pr-12 text-foreground', className)}
      {...props}
    />
  );
}

export function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-sm font-semibold tracking-tight text-foreground', className)}
      {...props}
    />
  );
}
