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
      <ToastPrimitive.Provider swipeDirection="right">
        <div className="pointer-events-none fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-[100] flex w-[calc(100%-2rem)] max-w-[360px] flex-col gap-2 lg:bottom-4">
          {items.map((item) => (
            <ToastPrimitive.Root
              key={item.id}
              duration={4000}
              onOpenChange={(open) => {
                if (!open) dismiss(item.id);
              }}
              className={cn(
                'pointer-events-auto relative rounded-lg border border-border bg-card p-4 pr-10 text-card-foreground shadow-soft',
                item.variant === 'destructive' && 'border-destructive/40',
              )}
            >
              <ToastPrimitive.Title className="text-sm font-medium">{item.title}</ToastPrimitive.Title>
              {item.description ? (
                <ToastPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                  {item.description}
                </ToastPrimitive.Description>
              ) : null}
              <ToastPrimitive.Close
                className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Dismiss"
                onClick={() => dismiss(item.id)}
              >
                <X className="h-4 w-4" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          ))}
        </div>
        <ToastPrimitive.Viewport className="sr-only" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
