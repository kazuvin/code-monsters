import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync('uv', ['sync', '--project', 'tools/sprite-pipeline', '--frozen'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, UV_CACHE_DIR: path.join(root, '.uv-cache') },
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
