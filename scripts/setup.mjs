import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function run(command, args, opts = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    ...opts,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureEnv() {
  const example = join(root, '.env.example');
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) {
    copyFileSync(example, envPath);
    console.log('Created .env from .env.example');
  } else {
    console.log('.env already exists');
  }

  // Prisma loads .env from the package directory
  const dbDir = join(root, 'packages', 'database');
  const dbEnv = join(dbDir, '.env');
  copyFileSync(envPath, dbEnv);
  console.log('Synced .env -> packages/database/.env');

  // Nest/tsx cwd is apps/api — keep a local copy for tooling
  const apiEnv = join(root, 'apps', 'api', '.env');
  copyFileSync(envPath, apiEnv);
  console.log('Synced .env -> apps/api/.env');

  // Next public URL for the web app
  const webEnv = join(root, 'apps', 'web', '.env.local');
  if (!existsSync(webEnv)) {
    const raw = readFileSync(envPath, 'utf8');
    const apiUrl =
      raw.match(/^NEXT_PUBLIC_API_URL=(.*)$/m)?.[1]?.trim() ??
      'http://localhost:4000/api/v1';
    writeFileSync(webEnv, `NEXT_PUBLIC_API_URL=${apiUrl}\n`);
    console.log('Created apps/web/.env.local');
  }
}

const step = process.argv[2] ?? 'all';

if (step === 'env' || step === 'all') {
  ensureEnv();
}

if (step === 'install' || step === 'all') {
  run('pnpm', ['install']);
}

if (step === 'build' || step === 'all') {
  run('pnpm', ['--filter', '@inventory/shared', 'build']);
  run('pnpm', ['--filter', '@inventory/database', 'generate']);
  run('pnpm', ['--filter', '@inventory/database', 'build']);
}

if (step === 'all') {
  console.log('\nSetup complete.');
  console.log('Next:');
  console.log('  pnpm infra:up     # start Postgres, Redis');
  console.log('  pnpm db:setup     # migrate + seed');
  console.log('  pnpm dev          # API + Web');
}
