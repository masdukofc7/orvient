'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SessionUser } from '@inventory/shared';
import { setAccessToken, setSessionFlag, setLastOrganizationId } from '@/lib/auth-token';

export type PosLine = {
  key: string;
  productId: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  stock?: number;
};

type PosState = {
  lines: PosLine[];
  contactId: string | null;
  contactName: string | null;
  discount: number;
  taxRate: number;
  notes: string;
  addOrIncrement: (line: Omit<PosLine, 'key' | 'quantity'> & { quantity?: number }) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  setContact: (id: string | null, name?: string | null) => void;
  setDiscount: (n: number) => void;
  setTaxRate: (n: number) => void;
  setNotes: (n: string) => void;
  clear: () => void;
};

export const usePosStore = create<PosState>()(
  persist(
    (set, get) => ({
      lines: [],
      contactId: null,
      contactName: null,
      discount: 0,
      taxRate: 0,
      notes: '',
      addOrIncrement: (line) => {
        const existing = get().lines.find((l) => l.productId === line.productId);
        if (existing) {
          set({
            lines: get().lines.map((l) =>
              l.key === existing.key
                ? {
                    ...l,
                    quantity: l.quantity + (line.quantity ?? 1),
                    stock: line.stock ?? l.stock,
                    unitPrice: line.unitPrice,
                    costPrice: line.costPrice,
                  }
                : l,
            ),
          });
          return;
        }
        set({
          lines: [
            ...get().lines,
            {
              ...line,
              key: `${line.productId}-${Date.now()}`,
              quantity: line.quantity ?? 1,
            },
          ],
        });
      },
      setQuantity: (key, quantity) =>
        set({
          lines: get()
            .lines.map((l) => (l.key === key ? { ...l, quantity } : l))
            .filter((l) => l.quantity > 0),
        }),
      removeLine: (key) => set({ lines: get().lines.filter((l) => l.key !== key) }),
      setContact: (id, name = null) => set({ contactId: id, contactName: name }),
      setDiscount: (discount) => set({ discount }),
      setTaxRate: (taxRate) => set({ taxRate }),
      setNotes: (notes) => set({ notes }),
      clear: () =>
        set({
          lines: [],
          contactId: null,
          contactName: null,
          discount: 0,
          taxRate: 0,
          notes: '',
        }),
    }),
    { name: 'pos-draft' },
  ),
);

function applyBrandColor(user: SessionUser | null) {
  if (typeof document === 'undefined') return;
  if (user?.brandColor) {
    document.documentElement.style.setProperty('--brand', user.brandColor);
  }
}

type AuthState = {
  accessToken: string | null;
  user: SessionUser | null;
  setSession: (token: string, user: SessionUser) => void;
  clearSession: () => void;
  hydrate: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  setSession: (accessToken, user) => {
    setAccessToken(accessToken);
    setSessionFlag(true);
    setLastOrganizationId(user.organizationId);
    applyBrandColor(user);
    set({ accessToken, user });
  },
  clearSession: () => {
    setAccessToken(null);
    setSessionFlag(false);
    setLastOrganizationId(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
    }
    set({ accessToken: null, user: null });
  },
  hydrate: () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
    }
  },
}));
