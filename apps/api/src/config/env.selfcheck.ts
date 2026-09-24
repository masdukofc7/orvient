import assert from 'node:assert/strict';
import { resolveJwtAccessSecret } from '../modules/auth/infrastructure/jwt-secrets';
import { cookieSecure, validateProductionEnv } from './validate-env';

function selfcheck() {
  const prev = { ...process.env };

  process.env.NODE_ENV = 'development';
  delete process.env.JWT_ACCESS_SECRET;
  assert.ok(resolveJwtAccessSecret().length >= 32);

  process.env.NODE_ENV = 'production';
  delete process.env.JWT_ACCESS_SECRET;
  assert.throws(() => resolveJwtAccessSecret(), /JWT_ACCESS_SECRET/);

  process.env.JWT_ACCESS_SECRET = 'change-me-access-secret-min-32-chars!!';
  process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
  process.env.CORS_ORIGIN = 'https://app.example';
  delete process.env.COOKIE_SECURE;
  assert.throws(() => validateProductionEnv(), /placeholder/);

  process.env.JWT_ACCESS_SECRET = 'prod-grade-secret-at-least-32-chars!!';
  process.env.DATABASE_URL = 'postgresql://inventory:inventory@localhost:5432/inventory';
  assert.throws(() => validateProductionEnv(), /inventory\/inventory/);

  process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
  process.env.COOKIE_SECURE = 'false';
  assert.throws(() => validateProductionEnv(), /COOKIE_SECURE/);

  process.env.COOKIE_SECURE = 'true';
  assert.doesNotThrow(() => validateProductionEnv());

  process.env.COOKIE_SECURE = 'false';
  assert.equal(cookieSecure(), false);
  delete process.env.COOKIE_SECURE;
  assert.equal(cookieSecure(), true);

  Object.assign(process.env, prev);
  console.log('env.selfcheck ok');
}

selfcheck();
