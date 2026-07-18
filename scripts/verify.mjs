import { spawnSync } from 'node:child_process';

const packageManager = process.env.npm_execpath;
const commands = [
  packageManager
    ? { label: 'format check', command: process.execPath, args: [packageManager, 'run', 'format:check'] }
    : { label: 'format check', command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: ['format:check'] },
  packageManager
    ? { label: 'production build', command: process.execPath, args: [packageManager, 'run', 'build'] }
    : { label: 'production build', command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: ['build'] },
  packageManager
    ? { label: 'asset contracts', command: process.execPath, args: [packageManager, 'run', 'assets:check'] }
    : { label: 'asset contracts', command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: ['assets:check'] },
  packageManager
    ? { label: 'asset CLI', command: process.execPath, args: [packageManager, 'run', 'assets:test'] }
    : { label: 'asset CLI', command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: ['assets:test'] },
  packageManager
    ? { label: 'sprite processing', command: process.execPath, args: [packageManager, 'run', 'assets:python:test'] }
    : {
        label: 'sprite processing',
        command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
        args: ['assets:python:test'],
      },
  { label: 'core rules', command: process.execPath, args: ['scripts/core-test.mjs'] },
  { label: 'combat math', command: process.execPath, args: ['scripts/combat-test.mjs'] },
  { label: 'debug room data contract', command: process.execPath, args: ['scripts/debug-data-test.mjs'] },
  { label: 'power balance', command: process.execPath, args: ['scripts/balance-check.mjs'] },
];

for (const task of commands) {
  console.log(`\n[verify] ${task.label}`);
  const result = spawnSync(task.command, task.args, { stdio: 'inherit', env: process.env });
  if (result.error) {
    console.error(`[verify] ${task.label} could not start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[verify] ${task.label} failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

console.log('\n[verify] PASS');
