/**
 * One-shot remote deploy: SSH → git pull → ./scripts/deploy-vps.sh
 *
 * PowerShell:
 *   $env:VPS_SSH = "ubuntu@158.69.221.107"; pnpm deploy:vps
 *
 * Bash:
 *   VPS_SSH=ubuntu@158.69.221.107 pnpm deploy:vps
 *
 * Optional:
 *   VPS_APP_DIR   default /var/www/orvient
 *   VPS_GIT_REF   default main
 */
import { spawn } from 'node:child_process';

const VPS_SSH = process.env.VPS_SSH?.trim() || '';
const VPS_APP_DIR = process.env.VPS_APP_DIR?.trim() || '/var/www/orvient';
const VPS_GIT_REF = process.env.VPS_GIT_REF?.trim() || 'main';

if (!VPS_SSH) {
  console.error('Set VPS_SSH first.');
  console.error('  PowerShell: $env:VPS_SSH = "ubuntu@<server>"; pnpm deploy:vps');
  console.error('  Bash:       VPS_SSH=ubuntu@<server> pnpm deploy:vps');
  process.exit(1);
}

const remote = [
  `cd ${shellSingleQuote(VPS_APP_DIR)}`,
  `git pull origin ${shellSingleQuote(VPS_GIT_REF)}`,
  'chmod +x scripts/deploy-vps.sh',
  './scripts/deploy-vps.sh',
].join(' && ');

console.log(`Deploying via ${VPS_SSH} (${VPS_APP_DIR} @ ${VPS_GIT_REF})...`);

const child = spawn('ssh', [VPS_SSH, remote], { stdio: 'inherit', shell: false });
child.on('error', (err) => {
  console.error(err.message);
  process.exit(1);
});
child.on('close', (code) => {
  process.exit(code ?? 1);
});

function shellSingleQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
