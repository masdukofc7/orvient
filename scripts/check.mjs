import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(label, command, args, env = {}) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    console.error(`\nFAILED: ${label}`);
    process.exit(result.status ?? 1);
  }
}

run('shared build', 'pnpm', ['--filter', '@inventory/shared', 'build']);
run('database generate', 'pnpm', ['--filter', '@inventory/database', 'generate']);
run('prisma validate', 'pnpm', ['--filter', '@inventory/database', 'exec', 'prisma', 'validate']);
run('shared typecheck', 'pnpm', ['--filter', '@inventory/shared', 'typecheck']);
run('database typecheck', 'pnpm', ['--filter', '@inventory/database', 'typecheck']);
run('api typecheck', 'pnpm', ['--filter', '@inventory/api', 'typecheck']);
run('web typecheck', 'pnpm', ['--filter', '@inventory/web', 'typecheck']);
run('api build', 'pnpm', ['--filter', '@inventory/api', 'build']);
run('web build', 'pnpm', ['--filter', '@inventory/web', 'build'], { NODE_ENV: 'production' });

console.log('\nAll checks passed.');
