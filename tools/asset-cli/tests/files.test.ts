import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { copyFilesPreservingDirectory } from '../src/files.ts';

test('Unity publication updates inputs without deleting generated assets', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'code-monsters-assets-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'approved');
  const target = path.join(root, 'unity');
  await mkdir(source, { recursive: true });
  await mkdir(path.join(target, 'Animations'), { recursive: true });
  await writeFile(path.join(source, 'sprite-sheet.png'), 'new-sheet');
  await writeFile(path.join(source, 'manifest.json'), 'new-manifest');
  await writeFile(path.join(target, 'sprite-sheet.png.meta'), 'stable-texture-guid');
  await writeFile(path.join(target, 'Animations/idle.anim'), 'generated-clip');

  await copyFilesPreservingDirectory(source, target, ['sprite-sheet.png', 'manifest.json']);

  assert.equal(await readFile(path.join(target, 'sprite-sheet.png'), 'utf8'), 'new-sheet');
  assert.equal(await readFile(path.join(target, 'manifest.json'), 'utf8'), 'new-manifest');
  assert.equal(await readFile(path.join(target, 'sprite-sheet.png.meta'), 'utf8'), 'stable-texture-guid');
  assert.equal(await readFile(path.join(target, 'Animations/idle.anim'), 'utf8'), 'generated-clip');
});
