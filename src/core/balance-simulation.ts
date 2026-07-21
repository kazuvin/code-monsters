import { createBattle, resolveTick } from './battle';
import { createBattleReport } from './battle-report';
import { analyzeCircuit, cloneBoard, rotatePorts } from './circuit';
import { generateEnemyBuild, type EnemyBuild } from './enemy-builder';
import type {
  BattleState,
  BlockDefinition,
  CircuitBoard,
  GameData,
  PlacementPatternId,
  Rarity,
  Rotation,
  Team,
  Winner,
} from './types';

export type BalanceSignal =
  | 'counterfactual-overpowered'
  | 'counterfactual-underpowered'
  | 'matched-overrepresented'
  | 'matched-underrepresented'
  | 'reported-output-high'
  | 'reported-output-low'
  | 'ablation-impact-high'
  | 'ablation-impact-low'
  | 'ablation-rarity-high'
  | 'ablation-rarity-low';

export type BalanceSimulationOptions = {
  battles?: number;
  runs?: number[];
  seed?: number;
  skillTrials?: number;
  skillIds?: string[];
  minimumSamples?: number;
  minimumCounterfactualSamples?: number;
  winRateLiftThreshold?: number;
  efficiencyZScoreThreshold?: number;
};

export type ResolvedBalanceSimulationConfig = {
  battles: number;
  runs: number[];
  seed: number;
  skillTrials: number;
  skillIds: string[];
  buildIds: string[];
  minimumSamples: number;
  minimumCounterfactualSamples: number;
  winRateLiftThreshold: number;
  efficiencyZScoreThreshold: number;
};

export type ConfidenceInterval = { lower: number; upper: number };

export type SkillCounterfactualReport = {
  samples: number;
  scoreLift: number | null;
  scoreLift95: ConfidenceInterval | null;
  reportedDamageDelta: number | null;
  reportedDefenseDelta: number | null;
  battleTicksDelta: number | null;
};

export type SkillBalanceReport = {
  blockId: string;
  code: string;
  title: string;
  rarity: Rarity;
  price: number;
  appearances: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number | null;
  scoreRate: number | null;
  winRate95: ConfidenceInterval | null;
  matchedSamples: number;
  matchedControlSamples: number;
  matchedScoreLift: number | null;
  placementPatternId: PlacementPatternId;
  averageTicks: number | null;
  activationsPerBattle: number | null;
  reportedDamagePerBattle: number | null;
  poisonAppliedPerBattle: number | null;
  reportedShieldPerBattle: number | null;
  effectiveRepairPerBattle: number | null;
  reportedOutputPerActivation: number | null;
  averageTeamDamageWhenPresent: number | null;
  efficiencyZScore: number | null;
  counterfactual: SkillCounterfactualReport;
  ablation: SkillCounterfactualReport;
  ablationImpactZScore: number | null;
  ablationRarityDelta: number | null;
  signals: BalanceSignal[];
  suspectedOutlier: boolean;
};

export type RunBalanceReport = {
  run: number;
  level: number;
  budget: number;
  battles: number;
  playerWins: number;
  enemyWins: number;
  draws: number;
  averageTicks: number;
  averageBuildCost: number;
  averageNodes: number;
};

export type BuildMatchupReport = {
  playerBuild: string;
  enemyBuild: string;
  battles: number;
  playerWins: number;
  enemyWins: number;
  draws: number;
  playerScoreRate: number;
  averageTicks: number;
};

export type BalanceSimulationResult = {
  simulationVersion: 3;
  gameSchemaVersion: number;
  config: ResolvedBalanceSimulationConfig;
  summary: {
    tournamentBattles: number;
    benchmarkBattles: number;
    totalBattles: number;
    sideSwappedPairs: number;
    teamSamples: number;
    playerWins: number;
    enemyWins: number;
    draws: number;
    playerWinRate: number;
    enemyWinRate: number;
    drawRate: number;
    sideBias: number;
    averageTicks: number;
  };
  byRun: RunBalanceReport[];
  buildMatchups: BuildMatchupReport[];
  skills: SkillBalanceReport[];
  methodology: {
    tournament: string;
    counterfactual: string;
    ablation: string;
    limitations: string[];
  };
};

export type BalanceComparison = {
  compatible: boolean;
  summary: {
    averageTicksDelta: number;
    sideBiasDelta: number;
  };
  newSuspectedOutliers: string[];
  resolvedSuspectedOutliers: string[];
  skills: Array<{
    blockId: string;
    scoreRateDelta: number | null;
    matchedScoreLiftDelta: number | null;
    counterfactualScoreLiftDelta: number | null;
    ablationScoreLiftDelta: number | null;
  }>;
};

type TournamentObservation = {
  run: number;
  buildId: string;
  skillIds: string[];
  score: number;
};

type MutableSkillReport = {
  appearances: number;
  wins: number;
  losses: number;
  draws: number;
  totalTicks: number;
  activations: number;
  reportedDamage: number;
  poisonApplied: number;
  reportedShield: number;
  effectiveRepair: number;
  totalTeamDamage: number;
};

type MutableRunReport = Omit<RunBalanceReport, 'averageTicks' | 'averageBuildCost' | 'averageNodes'> & {
  totalTicks: number;
  totalBuildCost: number;
  totalNodes: number;
};
type MutableBuildMatchup = Omit<BuildMatchupReport, 'playerScoreRate' | 'averageTicks'> & { totalTicks: number };
type CounterfactualSample = {
  scoreDelta: number;
  reportedDamageDelta: number;
  reportedDefenseDelta: number;
  battleTicksDelta: number;
};

const DEFAULT_OPTIONS: ResolvedBalanceSimulationConfig = {
  battles: 10_000,
  runs: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  seed: 20260721,
  skillTrials: 40,
  skillIds: [],
  buildIds: [],
  minimumSamples: 40,
  minimumCounterfactualSamples: 24,
  winRateLiftThreshold: 0.08,
  efficiencyZScoreThreshold: 2,
};

const round = (value: number, digits = 6) => Number(value.toFixed(digits));
const mean = (values: number[]) =>
  values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : 0;
const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};
const outcomeScore = (winner: Winner, team: Team) => (winner === 'draw' ? 0.5 : winner === team ? 1 : 0);
const blockIdsOn = (board: CircuitBoard) => [
  ...new Set(board.flatMap((row) => row.flatMap((cell) => (cell ? [cell.blockId] : [])))),
];

const resolveOptions = (data: GameData, options: BalanceSimulationOptions): ResolvedBalanceSimulationConfig => {
  const playableIds = data.buildDesign.skills.flatMap((skill) =>
    skill.status === 'playable' && skill.blockId ? [skill.blockId] : [],
  );
  const config = {
    ...DEFAULT_OPTIONS,
    ...options,
    runs: options.runs ? [...options.runs] : [...DEFAULT_OPTIONS.runs],
    skillIds: options.skillIds ? [...new Set(options.skillIds)] : [...playableIds],
    buildIds: data.buildDesign.builds.map((build) => build.id),
  };
  if (!Number.isInteger(config.battles) || config.battles <= 0) throw new Error('battles must be a positive integer');
  if (config.runs.length === 0 || config.runs.some((run) => !Number.isInteger(run) || run <= 0)) {
    throw new Error('runs must contain positive integers');
  }
  if (!Number.isInteger(config.seed)) throw new Error('seed must be an integer');
  if (!Number.isInteger(config.skillTrials) || config.skillTrials < 0) {
    throw new Error('skillTrials must be a non-negative integer');
  }
  if (!Number.isInteger(config.minimumSamples) || config.minimumSamples <= 0) {
    throw new Error('minimumSamples must be a positive integer');
  }
  if (!Number.isInteger(config.minimumCounterfactualSamples) || config.minimumCounterfactualSamples <= 0) {
    throw new Error('minimumCounterfactualSamples must be a positive integer');
  }
  const unknownIds = config.skillIds.filter((id) => !playableIds.includes(id));
  if (unknownIds.length > 0) throw new Error(`Unknown playable skill ids: ${unknownIds.join(', ')}`);
  return config;
};

const runHeadlessBattle = (
  data: GameData,
  playerBoard: CircuitBoard,
  enemyBoard: CircuitBoard,
  maxHpBonus: number,
): BattleState => {
  let state = createBattle(data, playerBoard, enemyBoard, {
    playerMaxHpBonus: maxHpBonus,
    enemyMaxHpBonus: maxHpBonus,
  });
  for (let tick = 1; !state.winner; tick += 1) {
    if (tick > 10_000) throw new Error('Battle exceeded the 10,000 tick simulation guard');
    state = resolveTick(data, state, tick);
  }
  return state;
};

const wilsonInterval = (successes: number, samples: number): ConfidenceInterval | null => {
  if (samples === 0) return null;
  const z = 1.96;
  const proportion = successes / samples;
  const denominator = 1 + (z * z) / samples;
  const center = (proportion + (z * z) / (2 * samples)) / denominator;
  const margin =
    (z * Math.sqrt((proportion * (1 - proportion)) / samples + (z * z) / (4 * samples * samples))) / denominator;
  return { lower: round(Math.max(0, center - margin)), upper: round(Math.min(1, center + margin)) };
};

const meanInterval = (values: number[]): ConfidenceInterval | null => {
  if (values.length === 0) return null;
  const average = mean(values);
  if (values.length === 1) return { lower: round(average), upper: round(average) };
  const variance = values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1);
  const margin = 1.96 * Math.sqrt(variance / values.length);
  return { lower: round(average - margin), upper: round(average + margin) };
};

const portSignature = (block: BlockDefinition, rotation: Rotation) =>
  [...rotatePorts(block.ports, rotation)].sort().join(',');

const replacementFor = (data: GameData, base: EnemyBuild, targetBlock: BlockDefinition): CircuitBoard | null => {
  if (blockIdsOn(base.board).includes(targetBlock.id)) return null;
  const targetDesign = data.buildDesign.skills.find((skill) => skill.blockId === targetBlock.id);
  const targetLink = targetDesign?.buildLinks.find((link) => link.buildId === base.buildId);
  if (!targetDesign || !targetLink) return null;
  const blocksById = new Map(data.blocks.map((block) => [block.id, block]));
  const designsByBlockId = new Map(
    data.buildDesign.skills.flatMap((skill) => (skill.blockId ? [[skill.blockId, skill] as const] : [])),
  );
  const rotations: Rotation[] = [0, 1, 2, 3];

  for (let row = 0; row < base.board.length; row += 1) {
    for (let column = 0; column < base.board[row].length; column += 1) {
      const placed = base.board[row][column];
      const reference = placed ? blocksById.get(placed.blockId) : undefined;
      const referenceDesign = reference ? designsByBlockId.get(reference.id) : undefined;
      const referenceLink = referenceDesign?.buildLinks.find((link) => link.buildId === base.buildId);
      if (!placed || !reference || !referenceLink || reference.id === targetBlock.id) continue;
      if (reference.rarity !== targetBlock.rarity) continue;
      if (!referenceLink.roles.some((role) => targetLink.roles.includes(role))) continue;
      if (base.totalCost - reference.price + targetBlock.price > base.budget) continue;
      const signature = portSignature(reference, placed.rotation);
      const targetRotation = rotations.find((rotation) => portSignature(targetBlock, rotation) === signature);
      if (targetRotation === undefined) continue;

      const candidate = cloneBoard(base.board);
      candidate[row][column] = { blockId: targetBlock.id, rotation: targetRotation };
      if (analyzeCircuit(candidate, data.blocks, data.rules.sourceRow).poweredCells.size === base.nodeCount) {
        return candidate;
      }
    }
  }
  return null;
};

const boardOutcome = (state: BattleState, team: Team) => outcomeScore(state.winner, team);

const boardOutput = (data: GameData, state: BattleState, team: Team) => {
  const totals = createBattleReport(data, state.trace)[team].totals;
  return {
    damage: totals.totalDamage,
    defense: totals.shield + totals.repair,
  };
};

const counterfactualSample = (
  data: GameData,
  targetBoard: CircuitBoard,
  baselineBoard: CircuitBoard,
  opponentBoard: CircuitBoard,
  maxHpBonus: number,
): CounterfactualSample => {
  const baselinePlayer = runHeadlessBattle(data, baselineBoard, opponentBoard, maxHpBonus);
  const targetPlayer = runHeadlessBattle(data, targetBoard, opponentBoard, maxHpBonus);
  const baselineEnemy = runHeadlessBattle(data, opponentBoard, baselineBoard, maxHpBonus);
  const targetEnemy = runHeadlessBattle(data, opponentBoard, targetBoard, maxHpBonus);
  const baselinePlayerOutput = boardOutput(data, baselinePlayer, 'player');
  const targetPlayerOutput = boardOutput(data, targetPlayer, 'player');
  const baselineEnemyOutput = boardOutput(data, baselineEnemy, 'enemy');
  const targetEnemyOutput = boardOutput(data, targetEnemy, 'enemy');

  return {
    scoreDelta: round(
      (boardOutcome(targetPlayer, 'player') -
        boardOutcome(baselinePlayer, 'player') +
        boardOutcome(targetEnemy, 'enemy') -
        boardOutcome(baselineEnemy, 'enemy')) /
        2,
    ),
    reportedDamageDelta: round(
      (targetPlayerOutput.damage -
        baselinePlayerOutput.damage +
        targetEnemyOutput.damage -
        baselineEnemyOutput.damage) /
        2,
    ),
    reportedDefenseDelta: round(
      (targetPlayerOutput.defense -
        baselinePlayerOutput.defense +
        targetEnemyOutput.defense -
        baselineEnemyOutput.defense) /
        2,
    ),
    battleTicksDelta: round((targetPlayer.tick - baselinePlayer.tick + targetEnemy.tick - baselineEnemy.tick) / 2),
  };
};

const ablationSample = (
  data: GameData,
  ablatedData: GameData,
  board: CircuitBoard,
  opponentBoard: CircuitBoard,
  maxHpBonus: number,
): CounterfactualSample => {
  const activePlayer = runHeadlessBattle(data, board, opponentBoard, maxHpBonus);
  const ablatedPlayer = runHeadlessBattle(ablatedData, board, opponentBoard, maxHpBonus);
  const activeEnemy = runHeadlessBattle(data, opponentBoard, board, maxHpBonus);
  const ablatedEnemy = runHeadlessBattle(ablatedData, opponentBoard, board, maxHpBonus);
  const activePlayerOutput = boardOutput(data, activePlayer, 'player');
  const ablatedPlayerOutput = boardOutput(ablatedData, ablatedPlayer, 'player');
  const activeEnemyOutput = boardOutput(data, activeEnemy, 'enemy');
  const ablatedEnemyOutput = boardOutput(ablatedData, ablatedEnemy, 'enemy');

  return {
    scoreDelta: round(
      (boardOutcome(activePlayer, 'player') -
        boardOutcome(ablatedPlayer, 'player') +
        boardOutcome(activeEnemy, 'enemy') -
        boardOutcome(ablatedEnemy, 'enemy')) /
        2,
    ),
    reportedDamageDelta: round(
      (activePlayerOutput.damage - ablatedPlayerOutput.damage + activeEnemyOutput.damage - ablatedEnemyOutput.damage) /
        2,
    ),
    reportedDefenseDelta: round(
      (activePlayerOutput.defense -
        ablatedPlayerOutput.defense +
        activeEnemyOutput.defense -
        ablatedEnemyOutput.defense) /
        2,
    ),
    battleTicksDelta: round((activePlayer.tick - ablatedPlayer.tick + activeEnemy.tick - ablatedEnemy.tick) / 2),
  };
};

const counterfactualsFor = (
  data: GameData,
  config: ResolvedBalanceSimulationConfig,
): {
  bySkill: Map<string, CounterfactualSample[]>;
  ablationBySkill: Map<string, CounterfactualSample[]>;
  battles: number;
} => {
  const bySkill = new Map<string, CounterfactualSample[]>();
  const ablationBySkill = new Map<string, CounterfactualSample[]>();
  if (config.skillTrials === 0) return { bySkill, ablationBySkill, battles: 0 };
  const blockById = new Map(data.blocks.map((block) => [block.id, block]));

  config.skillIds.forEach((blockId, skillIndex) => {
    const target = blockById.get(blockId);
    const design = data.buildDesign.skills.find((skill) => skill.blockId === blockId);
    const buildIds = design?.buildLinks.map((link) => link.buildId).filter((id) => config.buildIds.includes(id)) ?? [];
    if (!target || buildIds.length === 0) return;
    const samples: CounterfactualSample[] = [];
    const maxAttempts = Math.max(config.skillTrials * 250, 250);
    for (let attempt = 0; attempt < maxAttempts && samples.length < config.skillTrials; attempt += 1) {
      const run = config.runs[(skillIndex + attempt) % config.runs.length];
      const buildId = buildIds[attempt % buildIds.length];
      const baseSeed = config.seed + 1_000_003 + skillIndex * 100_003 + attempt * 97;
      const base = generateEnemyBuild(data, run, baseSeed, { buildId });
      const targetBoard = replacementFor(data, base, target);
      if (!targetBoard) continue;
      const opponent = generateEnemyBuild(data, run, baseSeed + 43);
      samples.push(counterfactualSample(data, targetBoard, base.board, opponent.board, base.maxHpBonus));
    }
    bySkill.set(blockId, samples);

    const ablatedData: GameData = {
      ...data,
      blocks: data.blocks.map((block) =>
        block.id === blockId ? { ...block, effects: [], cooldown: undefined } : block,
      ),
    };
    const ablationSamples: CounterfactualSample[] = [];
    for (let attempt = 0; attempt < maxAttempts && ablationSamples.length < config.skillTrials; attempt += 1) {
      const run = config.runs[(skillIndex + attempt) % config.runs.length];
      const buildId = buildIds[attempt % buildIds.length];
      const baseSeed = config.seed + 2_000_003 + skillIndex * 100_019 + attempt * 101;
      let base: EnemyBuild;
      try {
        base = generateEnemyBuild(data, run, baseSeed, { buildId, requiredBlockId: blockId });
      } catch {
        continue;
      }
      const opponent = generateEnemyBuild(data, run, baseSeed + 47);
      if (blockIdsOn(opponent.board).includes(blockId)) continue;
      ablationSamples.push(ablationSample(data, ablatedData, base.board, opponent.board, base.maxHpBonus));
    }
    ablationBySkill.set(blockId, ablationSamples);
  });

  return {
    bySkill,
    ablationBySkill,
    battles: [...bySkill.values(), ...ablationBySkill.values()].reduce(
      (total, samples) => total + samples.length * 4,
      0,
    ),
  };
};

const matchedLifts = (observations: TournamentObservation[]) => {
  type Stratum = { count: number; totalScore: number; bySkill: Map<string, { count: number; totalScore: number }> };
  const strata = new Map<string, Stratum>();
  observations.forEach((observation) => {
    const key = `${observation.run}:${observation.buildId}`;
    const stratum = strata.get(key) ?? { count: 0, totalScore: 0, bySkill: new Map() };
    stratum.count += 1;
    stratum.totalScore += observation.score;
    observation.skillIds.forEach((blockId) => {
      const skill = stratum.bySkill.get(blockId) ?? { count: 0, totalScore: 0 };
      skill.count += 1;
      skill.totalScore += observation.score;
      stratum.bySkill.set(blockId, skill);
    });
    strata.set(key, stratum);
  });

  const result = new Map<string, { samples: number; controlSamples: number; liftTotal: number }>();
  strata.forEach((stratum) => {
    stratum.bySkill.forEach((skill, blockId) => {
      const withoutCount = stratum.count - skill.count;
      if (skill.count === 0 || withoutCount === 0) return;
      const withScore = skill.totalScore / skill.count;
      const withoutScore = (stratum.totalScore - skill.totalScore) / withoutCount;
      const current = result.get(blockId) ?? { samples: 0, controlSamples: 0, liftTotal: 0 };
      current.samples += skill.count;
      current.controlSamples += withoutCount;
      current.liftTotal += (withScore - withoutScore) * skill.count;
      result.set(blockId, current);
    });
  });
  return new Map(
    [...result].map(([blockId, value]) => [
      blockId,
      { samples: value.samples, controlSamples: value.controlSamples, lift: round(value.liftTotal / value.samples) },
    ]),
  );
};

const emptySkillReport = (): MutableSkillReport => ({
  appearances: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  totalTicks: 0,
  activations: 0,
  reportedDamage: 0,
  poisonApplied: 0,
  reportedShield: 0,
  effectiveRepair: 0,
  totalTeamDamage: 0,
});

const counterfactualReport = (samples: CounterfactualSample[]): SkillCounterfactualReport => ({
  samples: samples.length,
  scoreLift: samples.length > 0 ? round(mean(samples.map((sample) => sample.scoreDelta))) : null,
  scoreLift95: meanInterval(samples.map((sample) => sample.scoreDelta)),
  reportedDamageDelta: samples.length > 0 ? round(mean(samples.map((sample) => sample.reportedDamageDelta))) : null,
  reportedDefenseDelta: samples.length > 0 ? round(mean(samples.map((sample) => sample.reportedDefenseDelta))) : null,
  battleTicksDelta: samples.length > 0 ? round(mean(samples.map((sample) => sample.battleTicksDelta))) : null,
});

export function classifyBalanceSkills(
  skills: SkillBalanceReport[],
  config: ResolvedBalanceSimulationConfig,
): SkillBalanceReport[] {
  skills.forEach((skill) => {
    skill.efficiencyZScore = null;
    skill.ablationImpactZScore = null;
    skill.ablationRarityDelta = null;
    skill.signals = [];
    skill.suspectedOutlier = false;
  });

  (['common', 'rare', 'epic', 'legendary'] as Rarity[]).forEach((rarity) => {
    const outputComparable = skills.filter(
      (skill) =>
        skill.rarity === rarity &&
        skill.appearances >= config.minimumSamples &&
        skill.reportedOutputPerActivation !== null,
    );
    if (outputComparable.length >= 2) {
      const average = mean(outputComparable.map((skill) => skill.reportedOutputPerActivation!));
      const standardDeviation = Math.sqrt(
        mean(outputComparable.map((skill) => (skill.reportedOutputPerActivation! - average) ** 2)),
      );
      outputComparable.forEach((skill) => {
        skill.efficiencyZScore =
          standardDeviation > 0 ? round((skill.reportedOutputPerActivation! - average) / standardDeviation) : 0;
      });
    }

    const ablationComparable = skills.filter(
      (skill) =>
        skill.rarity === rarity &&
        skill.ablation.samples >= config.minimumCounterfactualSamples &&
        skill.ablation.scoreLift !== null,
    );
    if (ablationComparable.length < 2) return;
    const average = mean(ablationComparable.map((skill) => skill.ablation.scoreLift!));
    const rarityMedian = median(ablationComparable.map((skill) => skill.ablation.scoreLift!));
    const standardDeviation = Math.sqrt(
      mean(ablationComparable.map((skill) => (skill.ablation.scoreLift! - average) ** 2)),
    );
    ablationComparable.forEach((skill) => {
      skill.ablationImpactZScore =
        standardDeviation > 0 ? round((skill.ablation.scoreLift! - average) / standardDeviation) : 0;
      skill.ablationRarityDelta = round(skill.ablation.scoreLift! - rarityMedian);
    });
  });

  skills.forEach((skill) => {
    const signals: BalanceSignal[] = [];
    if (
      skill.matchedSamples >= config.minimumSamples &&
      skill.matchedControlSamples >= config.minimumSamples &&
      Math.min(skill.matchedSamples, skill.matchedControlSamples) /
        Math.max(skill.matchedSamples, skill.matchedControlSamples) >=
        0.1 &&
      skill.matchedScoreLift !== null
    ) {
      if (skill.matchedScoreLift >= config.winRateLiftThreshold) signals.push('matched-overrepresented');
      if (skill.matchedScoreLift <= -config.winRateLiftThreshold) signals.push('matched-underrepresented');
    }
    if (
      skill.counterfactual.samples >= config.minimumCounterfactualSamples &&
      skill.counterfactual.scoreLift !== null &&
      skill.counterfactual.scoreLift95
    ) {
      if (skill.counterfactual.scoreLift >= config.winRateLiftThreshold && skill.counterfactual.scoreLift95.lower > 0) {
        signals.push('counterfactual-overpowered');
      }
      if (
        skill.counterfactual.scoreLift <= -config.winRateLiftThreshold &&
        skill.counterfactual.scoreLift95.upper < 0
      ) {
        signals.push('counterfactual-underpowered');
      }
    }
    if (skill.efficiencyZScore !== null) {
      if (skill.efficiencyZScore >= config.efficiencyZScoreThreshold) signals.push('reported-output-high');
      if (skill.efficiencyZScore <= -config.efficiencyZScoreThreshold) signals.push('reported-output-low');
    }
    if (skill.ablationImpactZScore !== null) {
      if (skill.ablationImpactZScore >= config.efficiencyZScoreThreshold) signals.push('ablation-impact-high');
      if (skill.ablationImpactZScore <= -config.efficiencyZScoreThreshold) signals.push('ablation-impact-low');
    }
    const rarityThreshold = config.winRateLiftThreshold * 2;
    if (
      skill.placementPatternId === 'free' &&
      skill.ablationRarityDelta !== null &&
      skill.ablation.scoreLift95 &&
      skill.ablation.scoreLift !== null
    ) {
      const rarityMedian = skill.ablation.scoreLift - skill.ablationRarityDelta;
      if (skill.ablationRarityDelta >= rarityThreshold && skill.ablation.scoreLift95.lower > rarityMedian) {
        signals.push('ablation-rarity-high');
      }
      if (skill.ablationRarityDelta <= -rarityThreshold && skill.ablation.scoreLift95.upper < rarityMedian) {
        signals.push('ablation-rarity-low');
      }
    }
    skill.signals = signals;
    const directSignal = signals.some((signal) => signal.startsWith('counterfactual-'));
    const alignedHigh =
      signals.includes('matched-overrepresented') &&
      (signals.includes('reported-output-high') || signals.includes('ablation-impact-high'));
    const alignedLow =
      signals.includes('matched-underrepresented') &&
      (signals.includes('reported-output-low') || signals.includes('ablation-impact-low'));
    const alignedRarityHigh = signals.includes('matched-overrepresented') && signals.includes('ablation-rarity-high');
    const alignedRarityLow = signals.includes('matched-underrepresented') && signals.includes('ablation-rarity-low');
    skill.suspectedOutlier = directSignal || alignedHigh || alignedLow || alignedRarityHigh || alignedRarityLow;
  });

  return skills;
}

export function runBalanceSimulation(data: GameData, options: BalanceSimulationOptions = {}): BalanceSimulationResult {
  const config = resolveOptions(data, options);
  const playableBlocks = data.buildDesign.skills.flatMap((skill) => {
    if (skill.status !== 'playable' || !skill.blockId) return [];
    const block = data.blocks.find((candidate) => candidate.id === skill.blockId);
    return block ? [block] : [];
  });
  const designByBlockId = new Map(
    data.buildDesign.skills.flatMap((skill) => (skill.blockId ? [[skill.blockId, skill] as const] : [])),
  );
  const mutableSkills = new Map(playableBlocks.map((block) => [block.id, emptySkillReport()]));
  const observations: TournamentObservation[] = [];
  const byRun = new Map<number, MutableRunReport>();
  const buildMatchups = new Map<string, MutableBuildMatchup>();
  let playerWins = 0;
  let enemyWins = 0;
  let draws = 0;
  let totalTicks = 0;
  let tournamentBattles = 0;

  const recordBattle = (state: BattleState, run: number, playerBuild: EnemyBuild, enemyBuild: EnemyBuild) => {
    tournamentBattles += 1;
    totalTicks += state.tick;
    if (state.winner === 'player') playerWins += 1;
    else if (state.winner === 'enemy') enemyWins += 1;
    else draws += 1;

    const runReport = byRun.get(run) ?? {
      run,
      level: playerBuild.level,
      budget: playerBuild.budget,
      battles: 0,
      playerWins: 0,
      enemyWins: 0,
      draws: 0,
      totalTicks: 0,
      totalBuildCost: 0,
      totalNodes: 0,
    };
    runReport.battles += 1;
    runReport.totalTicks += state.tick;
    runReport.totalBuildCost += playerBuild.totalCost + enemyBuild.totalCost;
    runReport.totalNodes += playerBuild.nodeCount + enemyBuild.nodeCount;
    if (state.winner === 'player') runReport.playerWins += 1;
    else if (state.winner === 'enemy') runReport.enemyWins += 1;
    else runReport.draws += 1;
    byRun.set(run, runReport);

    const matchupKey = `${playerBuild.buildId}:${enemyBuild.buildId}`;
    const matchup = buildMatchups.get(matchupKey) ?? {
      playerBuild: playerBuild.buildId,
      enemyBuild: enemyBuild.buildId,
      battles: 0,
      playerWins: 0,
      enemyWins: 0,
      draws: 0,
      totalTicks: 0,
    };
    matchup.battles += 1;
    matchup.totalTicks += state.tick;
    if (state.winner === 'player') matchup.playerWins += 1;
    else if (state.winner === 'enemy') matchup.enemyWins += 1;
    else matchup.draws += 1;
    buildMatchups.set(matchupKey, matchup);

    const report = createBattleReport(data, state.trace);
    const builds: Record<Team, EnemyBuild> = { player: playerBuild, enemy: enemyBuild };
    (['player', 'enemy'] as Team[]).forEach((team) => {
      const skillIds = blockIdsOn(builds[team].board);
      const score = outcomeScore(state.winner, team);
      observations.push({ run, buildId: builds[team].buildId, skillIds, score });
      const reportBySkill = new Map(report[team].skills.map((skill) => [skill.blockId, skill]));
      skillIds.forEach((blockId) => {
        const aggregate = mutableSkills.get(blockId);
        if (!aggregate) return;
        const skill = reportBySkill.get(blockId);
        aggregate.appearances += 1;
        aggregate.totalTicks += state.tick;
        aggregate.totalTeamDamage += report[team].totals.totalDamage;
        if (state.winner === 'draw') aggregate.draws += 1;
        else if (state.winner === team) aggregate.wins += 1;
        else aggregate.losses += 1;
        if (skill) {
          aggregate.activations += skill.activations;
          aggregate.reportedDamage += skill.damage;
          aggregate.poisonApplied += skill.poisonApplied;
          aggregate.reportedShield += skill.shield;
          aggregate.effectiveRepair += skill.repair;
        }
      });
    });
  };

  const pairs = Math.ceil(config.battles / 2);
  for (let pairIndex = 0; pairIndex < pairs; pairIndex += 1) {
    const run = config.runs[pairIndex % config.runs.length];
    const pairSeed = config.seed + pairIndex * 10_007;
    const left = generateEnemyBuild(data, run, pairSeed + 17);
    const right = generateEnemyBuild(data, run, pairSeed + 53);
    recordBattle(runHeadlessBattle(data, left.board, right.board, left.maxHpBonus), run, left, right);
    if (tournamentBattles < config.battles) {
      recordBattle(runHeadlessBattle(data, right.board, left.board, left.maxHpBonus), run, right, left);
    }
  }

  const matched = matchedLifts(observations);
  const counterfactuals = counterfactualsFor(data, config);
  const skills: SkillBalanceReport[] = playableBlocks.map((block) => {
    const aggregate = mutableSkills.get(block.id)!;
    const matchedResult = matched.get(block.id);
    const counterfactual = counterfactualReport(counterfactuals.bySkill.get(block.id) ?? []);
    const ablation = counterfactualReport(counterfactuals.ablationBySkill.get(block.id) ?? []);
    const reportedOutput =
      aggregate.reportedDamage + aggregate.poisonApplied + aggregate.reportedShield + aggregate.effectiveRepair;
    return {
      blockId: block.id,
      code: block.code,
      title: block.title,
      rarity: block.rarity,
      price: block.price,
      appearances: aggregate.appearances,
      wins: aggregate.wins,
      losses: aggregate.losses,
      draws: aggregate.draws,
      winRate: aggregate.appearances > 0 ? round(aggregate.wins / aggregate.appearances) : null,
      scoreRate:
        aggregate.appearances > 0 ? round((aggregate.wins + aggregate.draws * 0.5) / aggregate.appearances) : null,
      winRate95: wilsonInterval(aggregate.wins, aggregate.appearances),
      matchedSamples: matchedResult?.samples ?? 0,
      matchedControlSamples: matchedResult?.controlSamples ?? 0,
      matchedScoreLift: matchedResult?.lift ?? null,
      placementPatternId: designByBlockId.get(block.id)?.placementPatternId ?? 'free',
      averageTicks: aggregate.appearances > 0 ? round(aggregate.totalTicks / aggregate.appearances) : null,
      activationsPerBattle: aggregate.appearances > 0 ? round(aggregate.activations / aggregate.appearances) : null,
      reportedDamagePerBattle:
        aggregate.appearances > 0 ? round(aggregate.reportedDamage / aggregate.appearances) : null,
      poisonAppliedPerBattle: aggregate.appearances > 0 ? round(aggregate.poisonApplied / aggregate.appearances) : null,
      reportedShieldPerBattle:
        aggregate.appearances > 0 ? round(aggregate.reportedShield / aggregate.appearances) : null,
      effectiveRepairPerBattle:
        aggregate.appearances > 0 ? round(aggregate.effectiveRepair / aggregate.appearances) : null,
      reportedOutputPerActivation: aggregate.activations > 0 ? round(reportedOutput / aggregate.activations) : null,
      averageTeamDamageWhenPresent:
        aggregate.appearances > 0 ? round(aggregate.totalTeamDamage / aggregate.appearances) : null,
      efficiencyZScore: null,
      counterfactual,
      ablation,
      ablationImpactZScore: null,
      ablationRarityDelta: null,
      signals: [],
      suspectedOutlier: false,
    };
  });

  classifyBalanceSkills(skills, config);

  skills.sort(
    (left, right) =>
      Number(right.suspectedOutlier) - Number(left.suspectedOutlier) ||
      Math.abs(right.counterfactual.scoreLift ?? right.matchedScoreLift ?? 0) -
        Math.abs(left.counterfactual.scoreLift ?? left.matchedScoreLift ?? 0) ||
      left.blockId.localeCompare(right.blockId),
  );

  const totalBattles = tournamentBattles + counterfactuals.battles;
  return {
    simulationVersion: 3,
    gameSchemaVersion: data.schemaVersion,
    config,
    summary: {
      tournamentBattles,
      benchmarkBattles: counterfactuals.battles,
      totalBattles,
      sideSwappedPairs: Math.floor(config.battles / 2),
      teamSamples: tournamentBattles * 2,
      playerWins,
      enemyWins,
      draws,
      playerWinRate: round(playerWins / tournamentBattles),
      enemyWinRate: round(enemyWins / tournamentBattles),
      drawRate: round(draws / tournamentBattles),
      sideBias: round((playerWins - enemyWins) / tournamentBattles),
      averageTicks: round(totalTicks / tournamentBattles),
    },
    byRun: [...byRun.values()]
      .map(({ totalTicks: runTicks, totalBuildCost, totalNodes, ...report }) => ({
        ...report,
        averageTicks: round(runTicks / report.battles),
        averageBuildCost: round(totalBuildCost / (report.battles * 2)),
        averageNodes: round(totalNodes / (report.battles * 2)),
      }))
      .sort((left, right) => left.run - right.run),
    buildMatchups: [...buildMatchups.values()]
      .map(({ totalTicks: matchupTicks, ...report }) => ({
        ...report,
        playerScoreRate: round((report.playerWins + report.draws * 0.5) / report.battles),
        averageTicks: round(matchupTicks / report.battles),
      }))
      .sort(
        (left, right) =>
          left.playerBuild.localeCompare(right.playerBuild) || left.enemyBuild.localeCompare(right.enemyBuild),
      ),
    skills,
    methodology: {
      tournament:
        'Each generated matchup uses the same run level, cumulative coin budget, and health bonus on both sides, then replays with boards swapped. Runs and seeds are fixed by config.',
      counterfactual:
        'A skill replaces a same-rarity, overlapping-role node with an identical rotated port signature, then baseline and replacement boards fight the same opponent on both sides.',
      ablation:
        'A linked build is generated with the target skill required, then the same board is replayed with that skill disabled while ports remain unchanged, using an opponent that does not contain it.',
      limitations: [
        'Generated builds spend no more than the average cumulative player coin budget for that run and use level-adjusted rarity weights, but do not model individual shop choices, rerolls, locked offers, or fusion decisions.',
        'Per-skill damage is reported trace output before shield absorption and overkill; repair is capped effective healing.',
        'Poison tick damage is team-attributed rather than source-skill-attributed.',
        'Passive support is evaluated primarily through matched and counterfactual outcome lift rather than direct trace output.',
        'Generated builds are not an optimizer for strongest placements or multi-skill combo ceilings; multiplicative payoffs require deterministic high-synergy regression tests.',
        'Rarity-relative signals for topology-gated skills remain informational because the fixed generator does not guarantee each loop, fully-connected, or straight-line condition.',
      ],
    },
  };
}

const nullableDelta = (current: number | null, baseline: number | null) =>
  current === null || baseline === null ? null : round(current - baseline);

export function optionsFromBalanceBaseline(
  baseline: BalanceSimulationResult,
  overrides: BalanceSimulationOptions,
): BalanceSimulationOptions {
  const { skillIds: _skillIds, buildIds: _buildIds, ...reusableConfig } = baseline.config;
  return { ...reusableConfig, ...overrides };
}

export function compareBalanceResults(
  current: BalanceSimulationResult,
  baseline: BalanceSimulationResult,
): BalanceComparison {
  const comparableConfig = (config: ResolvedBalanceSimulationConfig) => ({
    battles: config.battles,
    runs: config.runs,
    seed: config.seed,
    skillTrials: config.skillTrials,
    skillIds: config.skillIds,
    buildIds: config.buildIds,
    minimumSamples: config.minimumSamples,
    minimumCounterfactualSamples: config.minimumCounterfactualSamples,
    winRateLiftThreshold: config.winRateLiftThreshold,
    efficiencyZScoreThreshold: config.efficiencyZScoreThreshold,
  });
  const compatible =
    current.simulationVersion === baseline.simulationVersion &&
    JSON.stringify(comparableConfig(current.config)) === JSON.stringify(comparableConfig(baseline.config));
  const baselineById = new Map(baseline.skills.map((skill) => [skill.blockId, skill]));
  const currentById = new Map(current.skills.map((skill) => [skill.blockId, skill]));
  const skills = current.skills.flatMap((skill) => {
    const previous = baselineById.get(skill.blockId);
    if (!previous) return [];
    return [
      {
        blockId: skill.blockId,
        scoreRateDelta: nullableDelta(skill.scoreRate, previous.scoreRate),
        matchedScoreLiftDelta: nullableDelta(skill.matchedScoreLift, previous.matchedScoreLift),
        counterfactualScoreLiftDelta: nullableDelta(skill.counterfactual.scoreLift, previous.counterfactual.scoreLift),
        ablationScoreLiftDelta: nullableDelta(skill.ablation.scoreLift, previous.ablation.scoreLift),
      },
    ];
  });
  return {
    compatible,
    summary: {
      averageTicksDelta: round(current.summary.averageTicks - baseline.summary.averageTicks),
      sideBiasDelta: round(current.summary.sideBias - baseline.summary.sideBias),
    },
    newSuspectedOutliers: current.skills
      .filter((skill) => skill.suspectedOutlier && !baselineById.get(skill.blockId)?.suspectedOutlier)
      .map((skill) => skill.blockId)
      .sort(),
    resolvedSuspectedOutliers: baseline.skills
      .filter((skill) => skill.suspectedOutlier && !currentById.get(skill.blockId)?.suspectedOutlier)
      .map((skill) => skill.blockId)
      .sort(),
    skills,
  };
}
