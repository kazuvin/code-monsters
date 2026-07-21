import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareBalanceResults, runBalanceSimulation } from '../src/core/balance-simulation.ts';
import { renderBalanceCsv, renderBalanceMarkdown } from '../src/core/balance-report.ts';
import { GAME_DATA } from '../src/game/game-data.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const usage = `Usage: pnpm balance:simulate [options]

Options:
  --battles <count>                 Tournament battles (default: 10000)
  --runs <1:9|1,3,5>               Runs to sample (default: 1:9)
  --seed <integer>                  Fixed random seed (default: 20260721)
  --skill-trials <count>            Replacement and ablation trials per skill (default: 40)
  --skills <id,id>                  Limit counterfactual trials to selected skills
  --minimum-samples <count>         Tournament sample gate (default: 400)
  --minimum-counterfactual <count>  Counterfactual sample gate (default: 24)
  --win-rate-lift <ratio>           Outlier threshold, e.g. 0.08
  --efficiency-z <score>            Reported-output Z-score threshold
  --output <path>                   Output base without extension
  --baseline <json>                 Compare against a previous JSON result
  --fail-on-regression              Exit non-zero for incompatible config or new outliers
  --help                            Show this message
`;

const parseRuns = (value) => {
  if (value.includes(':')) {
    const [start, end] = value.split(':').map(Number);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end < start) {
      throw new Error(`Invalid run range: ${value}`);
    }
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }
  return value.split(',').map((run) => Number(run.trim()));
};

const parseArgs = (argv) => {
  const values = {};
  let output = 'reports/balance/latest';
  let baselinePath = null;
  let failOnRegression = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (argument === '--help') return { help: true };
    if (argument === '--fail-on-regression') {
      failOnRegression = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    index += 1;
    if (argument === '--battles') values.battles = Number(value);
    else if (argument === '--runs') values.runs = parseRuns(value);
    else if (argument === '--seed') values.seed = Number(value);
    else if (argument === '--skill-trials') values.skillTrials = Number(value);
    else if (argument === '--skills')
      values.skillIds = value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    else if (argument === '--minimum-samples') values.minimumSamples = Number(value);
    else if (argument === '--minimum-counterfactual') values.minimumCounterfactualSamples = Number(value);
    else if (argument === '--win-rate-lift') values.winRateLiftThreshold = Number(value);
    else if (argument === '--efficiency-z') values.efficiencyZScoreThreshold = Number(value);
    else if (argument === '--output') output = value;
    else if (argument === '--baseline') baselinePath = value;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return { help: false, values, output, baselinePath, failOnRegression };
};

const loadJson = async (path) => JSON.parse(await readFile(resolve(repositoryRoot, path), 'utf8'));

const main = async () => {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(usage);
    return;
  }
  if (parsed.failOnRegression && !parsed.baselinePath) {
    throw new Error('--fail-on-regression requires --baseline');
  }

  const baselinePayload = parsed.baselinePath ? await loadJson(parsed.baselinePath) : null;
  const baseline = baselinePayload?.result ?? baselinePayload;
  const options = { ...(baseline?.config ?? {}), ...parsed.values };
  const startedAt = performance.now();
  const result = runBalanceSimulation(GAME_DATA, options);
  const elapsedMs = Math.round(performance.now() - startedAt);
  const comparison = baseline ? compareBalanceResults(result, baseline) : null;
  const generatedAt = new Date().toISOString();
  const outputBase = resolve(repositoryRoot, parsed.output);
  await mkdir(dirname(outputBase), { recursive: true });
  await Promise.all([
    writeFile(
      `${outputBase}.json`,
      `${JSON.stringify({ ...result, generatedAt, elapsedMs, ...(comparison ? { comparison } : {}) }, null, 2)}\n`,
    ),
    writeFile(`${outputBase}.csv`, renderBalanceCsv(result)),
    writeFile(`${outputBase}.md`, renderBalanceMarkdown(result, comparison ?? undefined)),
  ]);

  const outliers = result.skills.filter((skill) => skill.suspectedOutlier).map((skill) => skill.blockId);
  console.log(
    [
      `Balance simulation completed in ${elapsedMs} ms.`,
      `Battles: ${result.summary.tournamentBattles} tournament + ${result.summary.benchmarkBattles} benchmark.`,
      `Suspected outliers: ${outliers.join(', ') || 'none'}.`,
      `Reports: ${parsed.output}.{json,csv,md}`,
    ].join('\n'),
  );

  if (parsed.failOnRegression && comparison) {
    if (!comparison.compatible) {
      console.error('Balance baseline config is incompatible with the current simulation config.');
      process.exitCode = 1;
    } else if (comparison.newSuspectedOutliers.length > 0) {
      console.error(`New suspected balance outliers: ${comparison.newSuspectedOutliers.join(', ')}`);
      process.exitCode = 1;
    }
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
