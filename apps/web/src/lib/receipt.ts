/** Absolute public receipt URL for QR / copy-link. */
export function receiptPublicUrl(token: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/receipt/${token}`;
}

export function apiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
}
