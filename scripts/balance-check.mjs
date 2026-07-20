import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeBalance } from '../src/core/balance.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'game-data/game-balance.json'), 'utf8'));
const report = analyzeBalance(data);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Balance schema v${report.schemaVersion}`);
  console.table(
    report.metrics.map((metric) => ({
      Unit: `${metric.name} (${metric.id})`,
      Rarity: metric.rarity,
      DPS: metric.baseDps,
      EHP: metric.effectiveHp,
      Reaction: `x${metric.reactionFactor}`,
      Power: metric.power,
      Index: metric.powerIndex,
    })),
  );
  console.log('Ability economy (resource-sustainable rate)');
  console.table(
    report.abilityMetrics.map((metric) => ({
      Ability: `${metric.title} (${metric.id})`,
      Action: metric.action,
      Rarity: metric.rarity,
      Cost: metric.gaugeCost === 0 ? 'FREE' : metric.gaugeCost,
      'Recharge(s)': metric.recoverySeconds,
      'Interval(s)': metric.sustainableIntervalSeconds,
      'Uses/min': metric.usesPerMinute,
      Limited: metric.costLimited ? 'COST' : 'COOLDOWN',
    })),
  );
  if (report.issues.length === 0) console.log('PASS: data references and balance thresholds are healthy.');
  for (const issue of report.issues) console.log(`${issue.severity.toUpperCase()} [${issue.code}] ${issue.message}`);
  console.log(`Result: ${report.errors} error(s), ${report.warnings} warning(s)`);
}

if (report.errors > 0) process.exitCode = 1;
