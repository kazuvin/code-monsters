import { analyzeSynergies, synergyMetricCount } from '../src/core/synergy.ts';
import { GAME_DATA } from '../src/data.ts';
import { analyzePositionSynergies, positionMetricCount } from '../src/core/position-synergy.ts';

const report = analyzeSynergies(GAME_DATA);
const positionReport = analyzePositionSynergies(GAME_DATA);
const metricIds = ['producer', 'condition', 'consumer', 'crossUnit', 'counterplay'];
const countsFor = (pack) =>
  Object.fromEntries(metricIds.map((metricId) => [metricId, synergyMetricCount(pack, metricId)]));
const rows = report.packs.map((pack) => ({
  statusId: pack.statusId,
  label: pack.label,
  mode: pack.mode,
  counts: countsFor(pack),
}));

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify(
      {
        summary: {
          statuses: report.packs.length,
          covered: report.readyPacks,
          combo: report.comboPacks,
          standalone: report.standalonePacks,
          gaps: report.issues.length,
        },
        rows,
        position: {
          summary: {
            zones: positionReport.packs.length,
            covered: positionReport.readyPacks,
            gaps: positionReport.issues.length,
          },
          rows: positionReport.packs.map((pack) => ({
            zoneId: pack.zoneId,
            label: pack.label,
            counts: Object.fromEntries(
              ['placer', 'trigger', 'selfMove', 'forcedMove', 'interaction'].map((metricId) => [
                metricId,
                positionMetricCount(pack, metricId),
              ]),
            ),
          })),
          issues: positionReport.issues,
        },
        issues: report.issues,
      },
      null,
      2,
    ),
  );
} else {
  const density = (count) => {
    if (count === null) return '—';
    if (count === 0) return '· 0';
    if (count === 1) return '░ 1';
    if (count === 2) return '▒ 2';
    return `▓ ${count}`;
  };

  console.log('Synergy density matrix (reference only)');
  console.table(
    report.packs.map((pack) => ({
      Status: `${pack.label} (${pack.statusId})`,
      Type: pack.mode === 'combo' ? 'COMBO' : 'SOLO',
      Producer: density(synergyMetricCount(pack, 'producer')),
      Condition: density(synergyMetricCount(pack, 'condition')),
      Consumer: density(synergyMetricCount(pack, 'consumer')),
      'Cross-unit': density(synergyMetricCount(pack, 'crossUnit')),
      Counterplay: density(synergyMetricCount(pack, 'counterplay')),
    })),
  );
  console.log('Density: · 0  ░ 1  ▒ 2  ▓ 3+  — not applicable');
  console.log(
    `Coverage reference: ${report.readyPacks}/${report.packs.length} status packs, ${report.issues.length} gap(s)`,
  );
  for (const issue of report.issues) console.log(`GAP [${issue.code}] ${issue.message}`);
  console.log('\nPosition synergy density matrix (reference only)');
  console.table(
    positionReport.packs.map((pack) => ({
      Field: `${pack.label} (${pack.zoneId})`,
      Placer: density(positionMetricCount(pack, 'placer')),
      Trigger: density(positionMetricCount(pack, 'trigger')),
      'Self move': density(positionMetricCount(pack, 'selfMove')),
      'Forced move': density(positionMetricCount(pack, 'forcedMove')),
      Interactions: density(positionMetricCount(pack, 'interaction')),
    })),
  );
  console.log(
    `Coverage reference: ${positionReport.readyPacks}/${positionReport.packs.length} field packs, ${positionReport.issues.length} gap(s)`,
  );
  for (const issue of positionReport.issues) console.log(`GAP [${issue.code}] ${issue.message}`);
  console.log('Informational report: coverage gaps do not set a failing exit code.');
}
