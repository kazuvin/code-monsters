import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameData } from '../src/core/types.ts';
import { renderBuildMatrixMarkdown, validateBuildDesign } from '../src/game/build-design.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gameDataPath = resolve(repositoryRoot, 'src/game/game.json');
const matrixPath = resolve(repositoryRoot, 'docs/build-synergy-matrix.md');
const data = JSON.parse(readFileSync(gameDataPath, 'utf8')) as GameData;
const errors = validateBuildDesign(
  data.buildDesign,
  data.blocks.map((block) => block.id),
);

if (errors.length > 0) {
  console.error(`Build design is invalid:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  process.exitCode = 1;
} else {
  const expected = renderBuildMatrixMarkdown(data.buildDesign);
  if (process.argv.includes('--check')) {
    const current = readFileSync(matrixPath, 'utf8');
    if (current !== expected) {
      console.error('Build synergy matrix is stale. Run `pnpm design:matrix`.');
      process.exitCode = 1;
    } else {
      console.log('Build design and generated matrix are valid.');
    }
  } else {
    mkdirSync(dirname(matrixPath), { recursive: true });
    writeFileSync(matrixPath, expected);
    console.log(`Generated ${matrixPath}`);
  }
}
