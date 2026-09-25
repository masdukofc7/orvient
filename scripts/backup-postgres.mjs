#!/usr/bin/env node
/**
 * pg_dump backup. Requires `pg_dump` on PATH and DATABASE_URL in env.
 * Usage: node scripts/backup-postgres.mjs [outdir]
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const outDir = resolve(process.argv[2] || 'backups');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = resolve(outDir, `orvient-${stamp}.sql`);

const result = spawnSync('pg_dump', [url, '-f', file, '--no-owner', '--no-acl'], {
  stdio: 'inherit',
  shell: true,
});
if (result.status !== 0) {
  console.error('pg_dump failed — is PostgreSQL client tools installed?');
  process.exit(result.status ?? 1);
}
console.log(`Wrote ${file}`);
