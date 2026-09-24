import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'api');
const mainJs = join(apiRoot, 'dist', 'main.js');

function pnpmExec(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['exec', ...args], {
      cwd: apiRoot,
      stdio: 'inherit',
      shell: true,
      windowsHide: true,
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(args.join(' ')))));
  });
}

async function main() {
  // Avoid stale incremental emits (common when watch/crash interrupts build)
  for (const p of [join(apiRoot, 'dist'), join(apiRoot, 'tsconfig.tsbuildinfo')]) {
    try {
      rmSync(p, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  console.log('[api-dev] compiling…');
  await pnpmExec(['tsc', '-p', 'tsconfig.json']);
  if (!existsSync(mainJs)) {
    throw new Error(`Build output missing: ${mainJs}`);
  }

  console.log('[api-dev] watching typescript…');
  const tscWatch = spawn(
    'pnpm',
    ['exec', 'tsc', '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'],
    { cwd: apiRoot, stdio: 'inherit', shell: true, windowsHide: true },
  );

  console.log('[api-dev] starting server with node --watch');
  // shell:false keeps "inventory management" as one path argument
  const nodeWatch = spawn(process.execPath, ['--watch', '--watch-path=dist', mainJs], {
    cwd: apiRoot,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    env: process.env,
  });

  const shutdown = () => {
    tscWatch.kill();
    nodeWatch.kill();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  nodeWatch.on('exit', (code) => {
    tscWatch.kill();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('[api-dev]', err);
  process.exit(1);
});
