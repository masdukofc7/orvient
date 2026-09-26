'use client';

import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import { registerToast } from '@/lib/notify';
import { cn } from '@/lib/utils';

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
};

const ToastContext = React.createContext<{
  toast: (t: Omit<ToastItem, 'id'>) => void;
} | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within Toaster');
  return ctx;
}

export function Toaster({ children }: { children?: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const toast = React.useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = crypto.randomUUID();
    setItems((prev) => [...prev, { ...t, id }]);
  }, []);

  React.useEffect(() => {
    registerToast(toast);
    return () => registerToast(null);
  }, [toast]);

  function dismiss(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
        {items.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            open
            onOpenChange={(open) => {
              if (!open) dismiss(item.id);
            }}
            className={cn(
              'pointer-events-auto relative rounded-lg border border-border bg-card p-4 pr-10 text-card-foreground shadow-soft data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=open]:slide-in-from-bottom-full data-[state=closed]:slide-out-to-right-full',
              item.variant === 'destructive' &&
                'border-destructive bg-destructive text-destructive-foreground',
            )}
          >
            <ToastPrimitive.Title className="text-sm font-medium">{item.title}</ToastPrimitive.Title>
            {item.description ? (
              <ToastPrimitive.Description
                className={cn(
                  'mt-1 text-sm',
                  item.variant === 'destructive'
                    ? 'text-destructive-foreground/90'
                    : 'text-muted-foreground',
                )}
              >
                {item.description}
              </ToastPrimitive.Description>
            ) : null}
            <ToastPrimitive.Close
              className="absolute right-2 top-2 rounded-md p-1 opacity-70 hover:opacity-100"
              aria-label="Dismiss"
              onClick={() => dismiss(item.id)}
            >
              <X className="h-4 w-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        {/* Radix portals toast roots into Viewport — must be visible, not sr-only */}
        <ToastPrimitive.Viewport className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-[100] flex w-[calc(100%-2rem)] max-w-[360px] flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
