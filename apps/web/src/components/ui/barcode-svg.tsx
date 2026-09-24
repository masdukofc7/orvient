'use client';

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export function BarcodeSvg({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    JsBarcode(ref.current, value, {
      format: 'CODE128',
      displayValue: true,
      fontSize: 12,
      height: 40,
      margin: 0,
    });
  }, [value]);

  return <svg ref={ref} className={className} />;
}
