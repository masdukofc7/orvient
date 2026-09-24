const WEAK_JWT = /change-me|dev-access-secret|your[-_]?secret/i;

/** Fail fast in production when required env is missing or weak. */
export function validateProductionEnv(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== 'production') return;

  const problems: string[] = [];
  if (!env.DATABASE_URL?.trim()) problems.push('DATABASE_URL');
  if (!env.CORS_ORIGIN?.trim()) problems.push('CORS_ORIGIN');
  if (!env.JWT_ACCESS_SECRET || env.JWT_ACCESS_SECRET.length < 32) {
    problems.push('JWT_ACCESS_SECRET (min 32 chars)');
  } else if (WEAK_JWT.test(env.JWT_ACCESS_SECRET)) {
    problems.push('JWT_ACCESS_SECRET (placeholder not allowed)');
  }
  if (/\/\/inventory:inventory@/i.test(env.DATABASE_URL ?? '')) {
    problems.push('DATABASE_URL (default inventory/inventory password not allowed)');
  }
  if (env.COOKIE_SECURE === 'false') {
    problems.push('COOKIE_SECURE (must be true in production)');
  }
  if (problems.length) {
    throw new Error(`Invalid production env: ${problems.join(', ')}`);
  }
}

export function cookieSecure(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.COOKIE_SECURE === 'true') return true;
  if (env.COOKIE_SECURE === 'false') return false;
  return env.NODE_ENV === 'production';
}
