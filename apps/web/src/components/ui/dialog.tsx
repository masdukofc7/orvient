'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] dark:bg-black/70" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 max-h-[min(92dvh,40rem)] w-full overflow-y-auto overscroll-contain scrollbar-none border border-border bg-card text-card-foreground shadow-soft outline-none',
          // Mobile bottom sheet
          'inset-x-0 bottom-0 rounded-t-2xl border-b-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3',
          // Desktop centered modal
          'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border sm:p-6 sm:pb-6 sm:pt-6',
          className,
        )}
        {...props}
      >
        <div
          className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-muted sm:hidden"
          aria-hidden
        />
        {children}
        <DialogPrimitive.Close
          className={cn(
            'absolute right-3 top-3 z-10 rounded-md p-1.5 text-foreground',
            'opacity-70 transition-opacity hover:bg-muted hover:opacity-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'sm:right-4 sm:top-4',
          )}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mb-4 space-y-1 pr-8', className)} {...props} />;
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-lg font-semibold tracking-tight text-foreground', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

/** Dialog actions: cancel/secondary left, primary right. */
export function DialogFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end',
        '[&>*]:w-full sm:[&>*]:w-auto',
        className,
      )}
      {...props}
    />
  );
}
