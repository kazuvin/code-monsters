import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPowerFormulaReport } from '../src/core/power-formula.ts';
import { renderPowerFormulaCsv, renderPowerFormulaMarkdown } from '../src/core/power-formula-report.ts';
import { GAME_DATA } from '../src/game/game-data.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.slice(2).includes('--check');
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--' && argument !== '--check');
if (unknownArguments.length > 0) throw new Error(`Unknown argument: ${unknownArguments[0]}`);

const outputBase = resolve(repositoryRoot, 'reports/balance/formula');
const report = createPowerFormulaReport(GAME_DATA);
const outputs = new Map([
  [`${outputBase}.json`, `${JSON.stringify(report, null, 2)}\n`],
  [`${outputBase}.csv`, renderPowerFormulaCsv(report)],
  [`${outputBase}.md`, renderPowerFormulaMarkdown(report)],
]);

if (check) {
  const stale = [];
  for (const [path, expected] of outputs) {
    let actual = '';
    try {
      actual = await readFile(path, 'utf8');
    } catch {
      stale.push(path);
      continue;
    }
    const matches = path.endsWith('.json')
      ? JSON.stringify(JSON.parse(actual)) === JSON.stringify(JSON.parse(expected))
      : actual === expected;
    if (!matches) stale.push(path);
  }
  if (stale.length > 0) {
    throw new Error(
      `Deterministic power reports are stale:\n${stale.map((path) => `- ${path}`).join('\n')}\nRun pnpm balance:formula.`,
    );
  }
  console.log(`Deterministic power formula is current for ${report.summary.skillCount} skills. No battles run.`);
} else {
  await mkdir(dirname(outputBase), { recursive: true });
  await Promise.all([...outputs].map(([path, content]) => writeFile(path, content)));
  console.log(
    [
      `Deterministic power formula calculated for ${report.summary.skillCount} skills. No battles run.`,
      `Budget status: LOW ${report.summary.low} / OK ${report.summary['in-range']} / HIGH ${report.summary.high}.`,
      'Reports: reports/balance/formula.{json,csv,md}',
    ].join('\n'),
  );
}
