import { ConfigService } from '@nestjs/config';

const DEV_FALLBACK = 'dev-access-secret-change-me-32chars!!';
const WEAK_JWT = /change-me|dev-access-secret|your[-_]?secret/i;

/** Shared JWT access secret for JwtModule + Passport strategy. */
export function resolveJwtAccessSecret(config?: ConfigService) {
  const secret =
    config?.get?.<string>('JWT_ACCESS_SECRET') ?? process.env.JWT_ACCESS_SECRET ?? '';
  if (process.env.NODE_ENV === 'production') {
    if (secret.length < 32 || WEAK_JWT.test(secret)) {
      throw new Error('JWT_ACCESS_SECRET must be set to at least 32 characters in production');
    }
    return secret;
  }
  if (secret.length >= 32) return secret;
  return DEV_FALLBACK;
}
