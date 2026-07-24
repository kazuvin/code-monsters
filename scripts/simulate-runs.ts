import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { simulateBattle } from '../src/core/battle';
import { createRivalJourney, type RivalAudit } from '../src/core/rival';
import { deriveSeed } from '../src/core/rng';
import type { BattleContribution, MonsterBattleReport, Team } from '../src/core/types';
import { GAME_DATA } from '../src/game/game-data';

type CycleAggregate = {
  cycle: number;
  battles: number;
  playerWins: number;
  enemyWins: number;
  draws: number;
  duration: number;
};

type SkillAggregate = BattleContribution & {
  id: string;
  name: string;
  monsters: number;
  wins: number;
  losses: number;
};

type SpeciesAggregate = {
  id: string;
  name: string;
  appearances: number;
  wins: number;
  damage: number;
  healing: number;
  shielding: number;
  buffs: number;
  debuffs: number;
};

const numberArgument = (name: string, fallback: number) => {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback;
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const simulationRuns = numberArgument('--runs', 200);
const initialSeed = numberArgument('--seed', 7261);
const check = process.argv.includes('--check');
const writeReports = !process.argv.includes('--no-write');
const outputDirectory = path.resolve(process.cwd(), 'reports/balance');

const cycles = Array.from(
  { length: GAME_DATA.rules.maxCycles },
  (_, index): CycleAggregate => ({
    cycle: index + 1,
    battles: 0,
    playerWins: 0,
    enemyWins: 0,
    draws: 0,
    duration: 0,
  }),
);
const skills = new Map<string, SkillAggregate>();
const species = new Map<string, SpeciesAggregate>();
const eventSelections = new Map<string, number>();
const breedKinds = new Map<string, number>();
const auditTotals = {
  monsterPurchases: 0,
  equipmentPurchases: 0,
  rerolls: 0,
  events: 0,
  breeds: 0,
  coinsSpent: 0,
};

const didWin = (winner: Team | 'draw', team: Team) => winner === team;
const contributionTotal = (report: MonsterBattleReport) =>
  Object.values(report.skillBreakdown).reduce(
    (total, contribution) => ({
      damage: total.damage + contribution.damage,
      healing: total.healing + contribution.healing,
      shielding: total.shielding + contribution.shielding,
      buffs: total.buffs + contribution.buffs,
      debuffs: total.debuffs + contribution.debuffs,
    }),
    { damage: 0, healing: 0, shielding: 0, buffs: 0, debuffs: 0 },
  );

const mergeAudit = (audit: RivalAudit) => {
  auditTotals.monsterPurchases += audit.monsterPurchases;
  auditTotals.equipmentPurchases += audit.equipmentPurchases;
  auditTotals.rerolls += audit.rerolls;
  auditTotals.events += audit.events;
  auditTotals.breeds += audit.breeds;
  auditTotals.coinsSpent += audit.coinsSpent;
  for (const [kind, count] of Object.entries(audit.breedKinds)) {
    breedKinds.set(kind, (breedKinds.get(kind) ?? 0) + count);
  }
  for (const [eventId, count] of Object.entries(audit.eventSelections)) {
    eventSelections.set(eventId, (eventSelections.get(eventId) ?? 0) + count);
  }
};

for (let runIndex = 0; runIndex < simulationRuns; runIndex += 1) {
  const runSeed = deriveSeed(initialSeed, runIndex + 1);
  const playerJourney = createRivalJourney(GAME_DATA, deriveSeed(runSeed, 11));
  const enemyJourney = createRivalJourney(GAME_DATA, deriveSeed(runSeed, 29));
  const playerAudit = playerJourney.at(-1)?.audit;
  const enemyAudit = enemyJourney.at(-1)?.audit;
  if (playerAudit) mergeAudit(playerAudit);
  if (enemyAudit) mergeAudit(enemyAudit);

  for (let cycleIndex = 0; cycleIndex < GAME_DATA.rules.maxCycles; cycleIndex += 1) {
    const player = playerJourney[cycleIndex];
    const enemy = enemyJourney[cycleIndex];
    if (!player || !enemy) continue;
    const battle = simulateBattle(GAME_DATA, {
      player: player.team,
      enemy: enemy.team,
      seed: deriveSeed(runSeed, (cycleIndex + 1) * 10_007),
    });
    const cycle = cycles[cycleIndex]!;
    cycle.battles += 1;
    cycle.duration += battle.durationSeconds;
    if (battle.winner === 'player') cycle.playerWins += 1;
    else if (battle.winner === 'enemy') cycle.enemyWins += 1;
    else cycle.draws += 1;

    for (const report of battle.monsterReports) {
      const won = didWin(battle.winner, report.team);
      const lost = battle.winner !== 'draw' && !won;
      const totals = contributionTotal(report);
      const definition = GAME_DATA.monsters.find((monster) => monster.id === report.definitionId);
      const speciesEntry = species.get(report.definitionId) ?? {
        id: report.definitionId,
        name: definition?.name ?? report.name,
        appearances: 0,
        wins: 0,
        damage: 0,
        healing: 0,
        shielding: 0,
        buffs: 0,
        debuffs: 0,
      };
      speciesEntry.appearances += 1;
      speciesEntry.wins += won ? 1 : 0;
      speciesEntry.damage += totals.damage;
      speciesEntry.healing += totals.healing;
      speciesEntry.shielding += totals.shielding;
      speciesEntry.buffs += totals.buffs;
      speciesEntry.debuffs += totals.debuffs;
      species.set(speciesEntry.id, speciesEntry);

      for (const [skillId, contribution] of Object.entries(report.skillBreakdown)) {
        const skillEntry = skills.get(skillId) ?? {
          id: skillId,
          name:
            skillId === 'normal-attack'
              ? '通常攻撃'
              : skillId === 'passive'
                ? '特性・装備'
                : (GAME_DATA.skills.find((skill) => skill.id === skillId)?.name ?? skillId),
          monsters: 0,
          wins: 0,
          losses: 0,
          uses: 0,
          damage: 0,
          healing: 0,
          shielding: 0,
          buffs: 0,
          debuffs: 0,
          criticalHits: 0,
          atb: 0,
          mp: 0,
        };
        skillEntry.monsters += 1;
        skillEntry.wins += won ? 1 : 0;
        skillEntry.losses += lost ? 1 : 0;
        for (const key of [
          'uses',
          'damage',
          'healing',
          'shielding',
          'buffs',
          'debuffs',
          'criticalHits',
          'atb',
          'mp',
        ] as const) {
          skillEntry[key] += contribution[key];
        }
        skills.set(skillId, skillEntry);
      }
    }
  }
}

const totalBattles = cycles.reduce((total, cycle) => total + cycle.battles, 0);
const playerWins = cycles.reduce((total, cycle) => total + cycle.playerWins, 0);
const enemyWins = cycles.reduce((total, cycle) => total + cycle.enemyWins, 0);
const draws = cycles.reduce((total, cycle) => total + cycle.draws, 0);
const decidedBattles = Math.max(1, playerWins + enemyWins);
const playerWinRate = playerWins / decidedBattles;
const average = (value: number, divisor = simulationRuns * 2) => value / Math.max(1, divisor);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const sortedSkills = [...skills.values()].sort((left, right) => right.uses - left.uses);
const sortedSpecies = [...species.values()].sort((left, right) => right.appearances - left.appearances);
const exercisedSkillCount = GAME_DATA.skills.filter((skill) => (skills.get(skill.id)?.uses ?? 0) > 0).length;

const report = {
  schemaVersion: 1,
  contentVersion: GAME_DATA.rules.contentVersion,
  generatedAt: new Date().toISOString(),
  parameters: { runs: simulationRuns, seed: initialSeed },
  overall: {
    battles: totalBattles,
    playerWins,
    enemyWins,
    draws,
    playerWinRate,
    skillCoverage: exercisedSkillCount / GAME_DATA.skills.length,
  },
  journey: {
    averageMonsterPurchases: average(auditTotals.monsterPurchases),
    averageEquipmentPurchases: average(auditTotals.equipmentPurchases),
    averageRerolls: average(auditTotals.rerolls),
    averageEvents: average(auditTotals.events),
    averageBreeds: average(auditTotals.breeds),
    averageCoinsSpent: average(auditTotals.coinsSpent),
    breedKinds: Object.fromEntries([...breedKinds.entries()].sort()),
    eventSelections: Object.fromEntries([...eventSelections.entries()].sort()),
  },
  cycles: cycles.map((cycle) => ({
    ...cycle,
    playerWinRate: cycle.playerWins / Math.max(1, cycle.playerWins + cycle.enemyWins),
    averageDuration: cycle.duration / Math.max(1, cycle.battles),
  })),
  skills: sortedSkills.map((skill) => ({
    ...skill,
    winRate: skill.wins / Math.max(1, skill.wins + skill.losses),
    damagePerUse: skill.damage / Math.max(1, skill.uses || skill.monsters),
    healingPerUse: skill.healing / Math.max(1, skill.uses || skill.monsters),
    shieldingPerUse: skill.shielding / Math.max(1, skill.uses || skill.monsters),
  })),
  species: sortedSpecies.map((entry) => ({
    ...entry,
    winRate: entry.wins / Math.max(1, entry.appearances),
  })),
};

const markdown = `# CODE MONSTERS 自動ラン・バランスレポート

- コンテンツ: ${report.contentVersion}
- ラン数: ${simulationRuns}
- 戦闘数: ${totalBattles}
- 自軍勝率: ${percent(playerWinRate)}
- 引き分け: ${draws}
- スキル使用網羅率: ${percent(report.overall.skillCoverage)}

## 1ランあたりの育成行動

| 購入モンスター | 購入装備 | 更新 | イベント | 配合 | 使用コイン |
| ---: | ---: | ---: | ---: | ---: | ---: |
| ${report.journey.averageMonsterPurchases.toFixed(2)} | ${report.journey.averageEquipmentPurchases.toFixed(2)} | ${report.journey.averageRerolls.toFixed(2)} | ${report.journey.averageEvents.toFixed(2)} | ${report.journey.averageBreeds.toFixed(2)} | ${report.journey.averageCoinsSpent.toFixed(2)} |

## サイクル別

| Cycle | 戦闘 | 自軍勝 | 相手勝 | 引分 | 自軍勝率 | 平均秒 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${report.cycles
  .map(
    (cycle) =>
      `| ${cycle.cycle} | ${cycle.battles} | ${cycle.playerWins} | ${cycle.enemyWins} | ${cycle.draws} | ${percent(cycle.playerWinRate)} | ${cycle.averageDuration.toFixed(1)} |`,
  )
  .join('\n')}

## スキル別

| スキル | 使用 | 採用個体 | 勝率 | dmg/use | heal/use | shield/use | Buff | Debuff |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${report.skills
  .map(
    (skill) =>
      `| ${skill.name} | ${skill.uses} | ${skill.monsters} | ${percent(skill.winRate)} | ${skill.damagePerUse.toFixed(1)} | ${skill.healingPerUse.toFixed(1)} | ${skill.shieldingPerUse.toFixed(1)} | ${skill.buffs} | ${skill.debuffs} |`,
  )
  .join('\n')}

## モンスター別

| モンスター | 出場 | 勝率 | Damage | Heal | Shield | Buff | Debuff |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${report.species
  .map(
    (entry) =>
      `| ${entry.name} | ${entry.appearances} | ${percent(entry.winRate)} | ${entry.damage} | ${entry.healing} | ${entry.shielding} | ${entry.buffs} | ${entry.debuffs} |`,
  )
  .join('\n')}
`;

const csv = [
  [
    'skillId',
    'name',
    'uses',
    'monsters',
    'winRate',
    'damagePerUse',
    'healingPerUse',
    'shieldingPerUse',
    'buffs',
    'debuffs',
  ],
  ...report.skills.map((skill) => [
    skill.id,
    skill.name,
    skill.uses,
    skill.monsters,
    skill.winRate,
    skill.damagePerUse,
    skill.healingPerUse,
    skill.shieldingPerUse,
    skill.buffs,
    skill.debuffs,
  ]),
]
  .map((row) => row.map((value) => JSON.stringify(value)).join(','))
  .join('\n');

if (writeReports) {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDirectory, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`),
    writeFile(path.join(outputDirectory, 'latest.md'), markdown),
    writeFile(path.join(outputDirectory, 'latest.csv'), `${csv}\n`),
  ]);
}

process.stdout.write(
  [
    `runs=${simulationRuns}`,
    `battles=${totalBattles}`,
    `playerWinRate=${percent(playerWinRate)}`,
    `draws=${draws}`,
    `avgBreeds=${report.journey.averageBreeds.toFixed(2)}`,
    `avgEquipment=${report.journey.averageEquipmentPurchases.toFixed(2)}`,
    writeReports ? `report=${path.join(outputDirectory, 'latest.md')}` : 'report=disabled',
  ].join(' '),
);
process.stdout.write('\n');

if (check) {
  const failures: string[] = [];
  if (playerWinRate < 0.45 || playerWinRate > 0.55) {
    failures.push(`side win rate ${percent(playerWinRate)} is outside 45%-55%`);
  }
  if (report.journey.averageBreeds < 1) failures.push('average breeding count is below 1 per run');
  if (report.journey.averageEquipmentPurchases < 1)
    failures.push('average equipment purchase count is below 1 per run');
  if (exercisedSkillCount < GAME_DATA.skills.length * 0.5) {
    failures.push('fewer than 50% of defined skills were exercised');
  }
  if (failures.length > 0) {
    throw new Error(`Balance check failed:\n- ${failures.join('\n- ')}`);
  }
}
