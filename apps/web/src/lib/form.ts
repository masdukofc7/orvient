/** Read a FormData field as a trimmed string (empty → ''). */
export function formString(fd: FormData, key: string) {
  return String(fd.get(key) ?? '').trim();
}

/** Trimmed string or null when blank. */
export function formOptional(fd: FormData, key: string) {
  const value = formString(fd, key);
  return value || null;
}

export function formNumber(fd: FormData, key: string, fallback = 0) {
  const n = Number(fd.get(key));
  return Number.isFinite(n) ? n : fallback;
}
