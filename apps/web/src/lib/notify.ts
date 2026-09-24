type ToastPayload = {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
};

type ToastFn = (t: ToastPayload) => void;

let toastFn: ToastFn | null = null;

export function registerToast(fn: ToastFn | null) {
  toastFn = fn;
}

export function notifyError(title: string, description?: string) {
  toastFn?.({ title, description, variant: 'destructive' });
}
