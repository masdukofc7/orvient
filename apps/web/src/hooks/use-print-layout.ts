'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReceiptLayout } from '@/components/receipt/receipt-document';

/** Switch layout then print after paint. POS uses `?print=1` → thermal. */
export function usePrintLayout(autoPrint: ReceiptLayout | null, ready: boolean) {
  const [layout, setLayout] = useState<ReceiptLayout>('thermal');
  const [pendingPrint, setPendingPrint] = useState(false);
  const autoDone = useRef(false);

  useEffect(() => {
    if (!autoPrint || !ready || autoDone.current) return;
    autoDone.current = true;
    setLayout(autoPrint);
    setPendingPrint(true);
  }, [autoPrint, ready]);

  useEffect(() => {
    if (!pendingPrint || !ready) return;
    const t = setTimeout(() => {
      window.print();
      setPendingPrint(false);
    }, 200);
    return () => clearTimeout(t);
  }, [pendingPrint, ready, layout]);

  return {
    layout,
    printAs: (next: ReceiptLayout) => {
      setLayout(next);
      setPendingPrint(true);
    },
  };
}

/** Parse `?print=1` / `?print=thermal` / `?print=a4`. */
export function parsePrintQuery(value: string | null): ReceiptLayout | null {
  if (!value) return null;
  if (value === '1' || value === 'thermal') return 'thermal';
  if (value === 'a4') return 'a4';
  return null;
}
