'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function ReceiptQr({
  url,
  size = 96,
  className,
}: {
  url: string;
  size?: number;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(url, { width: size, margin: 1, errorCorrectionLevel: 'M' }).then(
      (dataUrl) => {
        if (!cancelled) setSrc(dataUrl);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url, size]);

  if (!src) {
    return <div className={className} style={{ width: size, height: size }} aria-hidden />;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} className={className} />;
}
