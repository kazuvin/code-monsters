import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const python = path.join(
  root,
  'tools/sprite-pipeline/.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
if (!fs.existsSync(python)) throw new Error('Python asset environment is missing; run pnpm assets:python:setup');
const result = spawnSync(
  python,
  ['-m', 'unittest', 'discover', '-s', 'tools/sprite-pipeline/tests', '-p', 'test_*.py'],
  {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  },
);
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
