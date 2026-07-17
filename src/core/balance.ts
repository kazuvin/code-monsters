import type { GameBalanceData } from '../data.ts';
import type { Instruction, Rarity, ReactionTrigger, UnitDefinition } from '../types.ts';

export type BalanceSeverity = 'error' | 'warning';
export type BalanceIssue = { severity: BalanceSeverity; code: string; message: string };
export type UnitBalanceMetric = {
  id: string;
  name: string;
  rarity: Rarity;
  price: number;
  baseDps: number;
  effectiveHp: number;
  reactionFactor: number;
  power: number;
  powerIndex: number;
  costEfficiency: number;
};
export type AbilityBalanceMetric = {
  id: string;
  title: string;
  action: Instruction['action'];
  rarity: Rarity;
  gaugeCost: number;
  recoverySeconds: number;
  sustainableIntervalSeconds: number;
  usesPerMinute: number;
  costLimited: boolean;
};
export type BalanceReport = {
  schemaVersion: number;
  metrics: UnitBalanceMetric[];
  abilityMetrics: AbilityBalanceMetric[];
  issues: BalanceIssue[];
  errors: number;
  warnings: number;
};

const round = (value: number, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : 0);
const ratio = (values: number[]) => {
  const comparable = values.filter((value) => Number.isFinite(value) && value > 0);
  return comparable.length < 2 ? 1 : Math.max(...comparable) / Math.min(...comparable);
};

function defaultAttack(data: GameBalanceData): Instruction | undefined {
  return (
    data.instructions.find((instruction) => instruction.id === data.balanceAnalysis.baselineActionId) ??
    data.instructions.find((instruction) => instruction.action === 'attack')
  );
}

function expectedDamage(data: GameBalanceData, unit: UnitDefinition, instruction: Instruction): number {
  const params = instruction.params ?? {};
  const raw = unit.attack * (params.attackScale ?? 1) + (params.flatDamage ?? 0);
  const base = Math.round(raw - data.balanceAnalysis.referenceDefense * data.battle.defenseDamageFactor);
  const scale = params.damageScale ?? 1;
  return scale <= 0 ? 0 : Math.max(params.minimumDamage ?? 0, Math.round(base * scale));
}

function cooldown(data: GameBalanceData, speed: number): number {
  if (speed <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(data.battle.minimumActionCooldownSeconds, data.battle.baseActionCooldownSeconds / speed);
}

function sustainableActionInterval(data: GameBalanceData, instruction: Instruction, speed: number): number {
  const actionInterval = cooldown(data, speed);
  const resourceInterval =
    instruction.abilityCost <= 0 ? 0 : instruction.abilityCost / data.battle.abilityGaugeRegenPerSecond;
  return Math.max(actionInterval, resourceInterval);
}

function resourceAdjustedUptime(
  data: GameBalanceData,
  instruction: Instruction,
  uptime: number,
  attemptIntervalSeconds: number,
): number {
  if (instruction.abilityCost <= 0 || uptime <= 0) return uptime;
  const attemptedUsesPerSecond = uptime / attemptIntervalSeconds;
  const sustainableUsesPerSecond = data.battle.abilityGaugeRegenPerSecond / instruction.abilityCost;
  return attemptedUsesPerSecond <= sustainableUsesPerSecond
    ? uptime
    : uptime * (sustainableUsesPerSecond / attemptedUsesPerSecond);
}

function reactionContribution(data: GameBalanceData, unit: UnitDefinition, baseDps: number, effectiveHp: number) {
  const reaction = data.defaultReactions.find((entry) => entry.unitId === unit.id && entry.trigger && entry.actionId);
  if (!reaction?.trigger || !reaction.actionId) return { dps: baseDps, effectiveHp, factor: 1 };
  const instruction = data.instructions.find((candidate) => candidate.id === reaction.actionId);
  if (!instruction) return { dps: baseDps, effectiveHp, factor: 1 };
  const params = instruction.params ?? {};
  const configuredUptime = data.balanceAnalysis.reactionUptime[reaction.trigger as ReactionTrigger] ?? 0;
  const uptime = resourceAdjustedUptime(data, instruction, configuredUptime, data.battle.reactionCooldownSeconds);
  if (instruction.action === 'berserk') {
    const boosted = (params.attackScale ?? 1) * (params.speedScale ?? 1);
    const factor = 1 + uptime * (boosted - 1);
    return { dps: baseDps * factor, effectiveHp, factor };
  }
  if (instruction.action === 'guard') {
    const damageScale = params.incomingDamageScale ?? 1;
    const factor = 1 + uptime * (1 / damageScale - 1);
    return { dps: baseDps, effectiveHp: effectiveHp * factor, factor };
  }
  if (['attack', 'heavy', 'throw', 'follow', 'poison', 'burn'].includes(instruction.action)) {
    const attackInterval = cooldown(data, unit.speed);
    const attackUptime = resourceAdjustedUptime(data, instruction, configuredUptime, attackInterval);
    const reactionDps = (expectedDamage(data, unit, instruction) / attackInterval) * attackUptime;
    const factor = baseDps === 0 ? 1 : (baseDps + reactionDps) / baseDps;
    return { dps: baseDps + reactionDps, effectiveHp, factor };
  }
  return { dps: baseDps, effectiveHp, factor: 1 };
}

function validateData(data: GameBalanceData): BalanceIssue[] {
  const issues: BalanceIssue[] = [];
  const error = (code: string, message: string) => issues.push({ severity: 'error', code, message });
  const unique = (kind: string, ids: string[]) => {
    for (const id of new Set(ids))
      if (ids.filter((candidate) => candidate === id).length > 1)
        error('DUPLICATE_ID', `${kind} id "${id}" が重複しています`);
  };
  unique(
    'unit',
    data.units.map((unit) => unit.id),
  );
  unique(
    'instruction',
    data.instructions.map((instruction) => instruction.id),
  );
  unique(
    'condition',
    data.conditions.map((condition) => condition.id),
  );
  unique(
    'targetSelector',
    data.targetSelectors.map((target) => target.id),
  );
  unique(
    'defaultPrograms',
    data.defaultPrograms.map((entry) => entry.unitId),
  );
  unique(
    'defaultReactions',
    data.defaultReactions.map((entry) => entry.unitId),
  );
  const units = new Set(data.units.map((unit) => unit.id));
  const instructions = new Set(data.instructions.map((instruction) => instruction.id));
  const conditions = new Set(data.conditions.map((condition) => condition.id));
  const targetSelectors = new Set<string>(data.targetSelectors.map((target) => target.id));
  const supportedConditions = new Set([
    'always',
    'targetInRange',
    'targetOutOfRange',
    'enemyHpBelow50',
    'selfHpBelow30',
    'enemyHasStatus',
  ]);
  const supportedActions = new Set([
    'attack',
    'heavy',
    'move',
    'jump',
    'throw',
    'taunt',
    'pull',
    'retreat',
    'heal',
    'guard',
    'buff',
    'berserk',
    'poison',
    'burn',
    'follow',
    'wait',
  ]);
  const supportedTargets = new Set([
    'nearestEnemy',
    'lowestHpEnemy',
    'nearestAlly',
    'lowestHpAlly',
    'criticalAlly',
    'self',
  ]);
  const supportedTargetSelectors = new Set([
    'nearestEnemy',
    'lowestHpEnemy',
    'allEnemies',
    'self',
    'nearestAlly',
    'lowestHpAlly',
    'criticalAlly',
    'allAllies',
  ]);
  const supportedTargetModes = new Set(['selected', 'self', 'allEnemies', 'allAllies']);
  const requireUnit = (id: string, context: string) => {
    if (!units.has(id)) error('UNKNOWN_UNIT', `${context} が未定義ユニット "${id}" を参照しています`);
  };
  const requireInstruction = (id: string, context: string) => {
    if (!instructions.has(id)) error('UNKNOWN_INSTRUCTION', `${context} が未定義スキル "${id}" を参照しています`);
  };
  const requireTargetSelector = (id: string, context: string) => {
    if (!targetSelectors.has(id)) error('UNKNOWN_TARGET', `${context} が未定義対象 "${id}" を参照しています`);
  };
  if (data.schemaVersion < 6) error('INVALID_SCHEMA_VERSION', 'schemaVersion は6以上である必要があります');
  if (
    data.battle.tickSeconds <= 0 ||
    !Number.isInteger(data.battle.abilityGaugeMax) ||
    data.battle.abilityGaugeMax <= 0 ||
    data.battle.abilityGaugeInitial < 0 ||
    data.battle.abilityGaugeInitial > data.battle.abilityGaugeMax ||
    data.battle.abilityGaugeRegenPerSecond <= 0 ||
    data.battle.baseActionCooldownSeconds <= 0 ||
    data.battle.minimumActionCooldownSeconds <= 0
  )
    error('INVALID_BATTLE_CONFIG', '戦闘のtick/cooldown/abilityGauge設定が不正です');
  if (data.balanceAnalysis.abilityReferenceSpeed <= 0)
    error('INVALID_BALANCE_CONFIG', 'abilityReferenceSpeed は正数である必要があります');
  if (data.balanceAnalysis.warningThresholdRatio <= 0 || data.balanceAnalysis.warningThresholdRatio >= 1)
    error('INVALID_BALANCE_CONFIG', 'warningThresholdRatio は0より大きく1未満である必要があります');
  if (data.balanceAnalysis.maxCostEfficiencySpread <= 1 || data.balanceAnalysis.maxSameRarityPowerSpread <= 1)
    error('INVALID_BALANCE_CONFIG', 'バランス差の上限は1より大きい必要があります');
  for (const [trigger, uptime] of Object.entries(data.balanceAnalysis.reactionUptime))
    if (uptime < 0 || uptime > 1)
      error('INVALID_BALANCE_CONFIG', `${trigger} の reactionUptime は0〜1で指定してください`);
  for (const unit of data.units) {
    if (
      unit.maxHp <= 0 ||
      unit.attack < 0 ||
      unit.defense < 0 ||
      unit.speed <= 0 ||
      unit.price <= 0 ||
      unit.range < 0 ||
      unit.weight <= 0
    )
      error('INVALID_UNIT_STAT', `${unit.id} に0以下または不正な戦闘パラメータがあります`);
  }
  for (const target of data.targetSelectors) {
    if (!supportedTargetSelectors.has(target.id))
      error('UNSUPPORTED_TARGET', `対象セレクタ "${target.id}" はエンジン未対応です`);
    if (!['enemy', 'ally', 'self'].includes(target.domain) || !['one', 'many'].includes(target.cardinality))
      error('INVALID_TARGET', `${target.id} の domain または cardinality が不正です`);
  }
  for (const condition of data.conditions) {
    if (condition.compatibleTargets.length === 0)
      error('MISSING_TARGET_COMPATIBILITY', `${condition.id} に対応対象がありません`);
    for (const targetId of condition.compatibleTargets)
      requireTargetSelector(targetId, `条件 ${condition.id}.compatibleTargets`);
  }
  for (const instruction of data.instructions) {
    if (
      !Number.isInteger(instruction.abilityCost) ||
      instruction.abilityCost < 0 ||
      instruction.abilityCost > data.battle.abilityGaugeMax
    )
      error(
        'INVALID_ABILITY_COST',
        `${instruction.id} の abilityCost は0〜${data.battle.abilityGaugeMax}の整数で指定してください`,
      );
    if (
      [
        'heavy',
        'jump',
        'throw',
        'taunt',
        'pull',
        'heal',
        'guard',
        'buff',
        'berserk',
        'poison',
        'burn',
        'follow',
      ].includes(instruction.action) &&
      instruction.abilityCost <= 0
    )
      error('MISSING_ABILITY_COST', `${instruction.id} の強力な行動には正の abilityCost が必要です`);
    if (!conditions.has(instruction.condition))
      error('UNKNOWN_CONDITION', `${instruction.id} が未定義条件 "${instruction.condition}" を参照しています`);
    if (!supportedConditions.has(instruction.condition))
      error('UNSUPPORTED_CONDITION', `${instruction.id} の条件 "${instruction.condition}" はエンジン未対応です`);
    if (!supportedActions.has(instruction.action))
      error('UNSUPPORTED_ACTION', `${instruction.id} の action "${instruction.action}" はエンジン未対応です`);
    if (!supportedTargets.has(instruction.target))
      error('UNSUPPORTED_TARGET', `${instruction.id} の target "${instruction.target}" はエンジン未対応です`);
    requireTargetSelector(instruction.defaultTarget, `スキル ${instruction.id}.defaultTarget`);
    if (!supportedTargetModes.has(instruction.targetMode))
      error('UNSUPPORTED_TARGET_MODE', `${instruction.id} の targetMode "${instruction.targetMode}" は未対応です`);
    for (const targetId of instruction.compatibleTargets)
      requireTargetSelector(targetId, `スキル ${instruction.id}.compatibleTargets`);
    if (instruction.targetMode === 'selected' && !instruction.compatibleTargets.includes(instruction.defaultTarget))
      error('INVALID_DEFAULT_TARGET', `${instruction.id} の defaultTarget がアクション対象と互換ではありません`);
    const defaultCondition = data.conditions.find((condition) => condition.id === instruction.condition);
    if (defaultCondition && !defaultCondition.compatibleTargets.includes(instruction.defaultTarget))
      error('INVALID_DEFAULT_TARGET', `${instruction.id} の defaultTarget が既定条件と互換ではありません`);
    if (!instruction.params) {
      error('MISSING_PARAMETER', `${instruction.id} に params がありません`);
      continue;
    }
    if (instruction.fixedFor) requireUnit(instruction.fixedFor, `スキル ${instruction.id}`);
    if (
      (instruction.action === 'move' || instruction.action === 'jump' || instruction.action === 'retreat') &&
      (instruction.params.moveDistance ?? 0) <= 0
    )
      error('MISSING_PARAMETER', `${instruction.id} には正の moveDistance が必要です`);
    if (
      instruction.action === 'heal' &&
      ((instruction.params.healAmount ?? 0) <= 0 || (instruction.params.supportHealAmount ?? 0) <= 0)
    )
      error('MISSING_PARAMETER', `${instruction.id} には正の healAmount と supportHealAmount が必要です`);
    if (instruction.action === 'throw' && (instruction.params.throwDistance ?? 0) <= 0)
      error('MISSING_PARAMETER', `${instruction.id} には正の throwDistance が必要です`);
    if (instruction.action === 'pull' && (instruction.params.pullDistance ?? 0) <= 0)
      error('MISSING_PARAMETER', `${instruction.id} には正の pullDistance が必要です`);
    if (instruction.params.fixedRange !== undefined && instruction.params.fixedRange <= 0)
      error('INVALID_PARAMETER', `${instruction.id} の fixedRange は正数で指定してください`);
    if (
      ['heavy', 'jump', 'throw', 'pull', 'heal'].includes(instruction.action) &&
      (instruction.params.fixedRange ?? 0) <= 0
    )
      error('MISSING_PARAMETER', `${instruction.id} の行動には正の fixedRange が必要です`);
    if (instruction.action === 'taunt' && (instruction.params.durationSeconds ?? 0) <= 0)
      error('MISSING_PARAMETER', `${instruction.id} には正の durationSeconds が必要です`);
    if (
      instruction.action === 'berserk' &&
      ((instruction.params.attackScale ?? 1) < 1 || (instruction.params.speedScale ?? 1) < 1)
    )
      error('MISSING_PARAMETER', `${instruction.id} のバーサーカーバフ倍率が不正です`);
    if (
      instruction.action === 'guard' &&
      ((instruction.params.incomingDamageScale ?? 0) <= 0 ||
        (instruction.params.incomingDamageScale ?? 1) > 1 ||
        (instruction.params.incomingKnockbackScale ?? 0) <= 0 ||
        (instruction.params.incomingKnockbackScale ?? 1) > 1)
    )
      error('INVALID_PARAMETER', `${instruction.id} のガード倍率は0より大きく1以下で指定してください`);
    if (
      ['attack', 'heavy', 'throw', 'follow', 'poison', 'burn'].includes(instruction.action) &&
      (instruction.params.minimumDamage ?? 0) < 0
    )
      error('INVALID_PARAMETER', `${instruction.id} の minimumDamage が負です`);
  }
  for (const entry of data.defaultPrograms) {
    requireUnit(entry.unitId, 'defaultPrograms');
    for (const actionId of entry.actionIds) requireInstruction(actionId, `defaultPrograms.${entry.unitId}`);
    const unit = data.units.find((candidate) => candidate.id === entry.unitId);
    if (unit && entry.actionIds.length > unit.programLimit)
      error('PROGRAM_OVER_CAPACITY', `${entry.unitId} のデフォルト作戦が容量 ${unit.programLimit} を超えています`);
  }
  for (const entry of data.defaultReactions) {
    requireUnit(entry.unitId, 'defaultReactions');
    if (entry.actionId) requireInstruction(entry.actionId, `defaultReactions.${entry.unitId}`);
    if (Boolean(entry.trigger) !== Boolean(entry.actionId))
      error(
        'INCOMPLETE_REACTION',
        `defaultReactions.${entry.unitId} は trigger と actionId を両方指定する必要があります`,
      );
    const instruction = data.instructions.find((candidate) => candidate.id === entry.actionId);
    if (instruction?.fixedFor && instruction.fixedFor !== entry.unitId)
      error(
        'REACTION_OWNER_MISMATCH',
        `${entry.unitId} が ${instruction.fixedFor} 固有スキル ${instruction.id} を参照しています`,
      );
  }
  for (const unit of data.units) {
    if (!data.defaultPrograms.some((entry) => entry.unitId === unit.id))
      error('MISSING_DEFAULT_PROGRAM', `${unit.id} にデフォルト作戦がありません`);
    if (!data.defaultReactions.some((entry) => entry.unitId === unit.id))
      error('MISSING_DEFAULT_REACTION', `${unit.id} にデフォルトリアクション定義がありません`);
  }
  for (const id of [...data.roster.startingUnitIds, ...data.roster.enemyUnitIds]) requireUnit(id, 'roster');
  if (data.roster.startingUnitIds.length !== 3 || data.roster.enemyUnitIds.length !== 3)
    error('INVALID_ROSTER_SIZE', '標準の味方・敵編成はそれぞれ3体にしてください');
  if (data.encounters.length !== 5) error('INVALID_ENCOUNTERS', 'encounters は5ラウンド定義してください');
  for (const encounter of data.encounters) {
    if (encounter.enemyUnitIds.length !== 3) error('INVALID_ENCOUNTER', `${encounter.id} の敵編成は3体にしてください`);
    if (encounter.enemyStatScale <= 0 || encounter.reward < 0)
      error('INVALID_ENCOUNTER', `${encounter.id} の倍率または報酬が不正です`);
    for (const id of encounter.enemyUnitIds) requireUnit(id, `encounter ${encounter.id}`);
  }
  for (const id of data.roster.startingActionIds) requireInstruction(id, 'roster.startingActionIds');
  for (const id of data.roster.startingConditionIds)
    if (!conditions.has(id)) error('UNKNOWN_CONDITION', `roster が未定義条件 "${id}" を参照しています`);
  for (const pick of data.shop.initialPicks) {
    if (pick.slot < 0 || pick.slot >= data.shop.size)
      error('INVALID_SHOP_SLOT', `shop.initialPicks の slot ${pick.slot} はショップ範囲外です`);
    if (pick.kind === 'unit') requireUnit(pick.id, 'shop.initialPicks');
    else requireInstruction(pick.id, 'shop.initialPicks');
  }
  return issues;
}

export function analyzeBalance(data: GameBalanceData): BalanceReport {
  const issues = validateData(data);
  const attack = defaultAttack(data);
  if (!attack) issues.push({ severity: 'error', code: 'NO_BASE_ATTACK', message: '基準となる通常攻撃がありません' });
  const weights = data.balanceAnalysis.powerWeights;
  const rawMetrics = data.units.map((unit) => {
    const baseDps = attack ? expectedDamage(data, unit, attack) / cooldown(data, unit.speed) : 0;
    const baseEffectiveHp = unit.maxHp + unit.defense * data.balanceAnalysis.effectiveHpDefenseWeight;
    const reaction = reactionContribution(data, unit, baseDps, baseEffectiveHp);
    const knockbackPerSecond = unit.knockbackPower / cooldown(data, unit.speed);
    const power =
      reaction.dps * weights.dps +
      reaction.effectiveHp * weights.effectiveHp +
      unit.range * weights.range +
      knockbackPerSecond * weights.knockbackPerSecond +
      unit.programLimit * weights.programLimit;
    return { unit, baseDps, reaction, power };
  });
  const medianPower =
    [...rawMetrics].map((metric) => metric.power).sort((a, b) => a - b)[Math.floor(rawMetrics.length / 2)] || 1;
  const metrics = rawMetrics.map(({ unit, baseDps, reaction, power }) => ({
    id: unit.id,
    name: unit.name,
    rarity: unit.rarity,
    price: unit.price,
    baseDps: round(baseDps),
    effectiveHp: round(reaction.effectiveHp),
    reactionFactor: round(reaction.factor),
    power: round(power),
    powerIndex: round((power / medianPower) * 100, 1),
    costEfficiency: round(unit.price > 0 ? power / unit.price : 0),
  }));
  const referenceCooldown = cooldown(data, data.balanceAnalysis.abilityReferenceSpeed);
  const abilityMetrics = data.instructions.map((instruction) => {
    const recoverySeconds =
      instruction.abilityCost <= 0 ? 0 : instruction.abilityCost / data.battle.abilityGaugeRegenPerSecond;
    const sustainableIntervalSeconds = sustainableActionInterval(
      data,
      instruction,
      data.balanceAnalysis.abilityReferenceSpeed,
    );
    return {
      id: instruction.id,
      title: instruction.title,
      action: instruction.action,
      rarity: instruction.rarity,
      gaugeCost: instruction.abilityCost,
      recoverySeconds: round(recoverySeconds),
      sustainableIntervalSeconds: round(sustainableIntervalSeconds),
      usesPerMinute: round(60 / sustainableIntervalSeconds, 1),
      costLimited: recoverySeconds > referenceCooldown,
    };
  });
  const efficiencySpread = ratio(metrics.map((metric) => metric.costEfficiency));
  const mostEfficient = [...metrics].sort((a, b) => b.costEfficiency - a.costEfficiency)[0];
  const leastEfficient = [...metrics].sort((a, b) => a.costEfficiency - b.costEfficiency)[0];
  const efficiencyDetail = `${mostEfficient.id} ${mostEfficient.costEfficiency} / ${leastEfficient.id} ${leastEfficient.costEfficiency}`;
  if (efficiencySpread > data.balanceAnalysis.maxCostEfficiencySpread) {
    issues.push({
      severity: 'error',
      code: 'COST_EFFICIENCY_SPREAD',
      message: `価格効率の最大差 ${efficiencySpread.toFixed(2)}x (${efficiencyDetail}) が上限 ${data.balanceAnalysis.maxCostEfficiencySpread.toFixed(2)}x を超えています`,
    });
  } else if (
    efficiencySpread >
    data.balanceAnalysis.maxCostEfficiencySpread * data.balanceAnalysis.warningThresholdRatio
  ) {
    issues.push({
      severity: 'warning',
      code: 'COST_EFFICIENCY_NEAR_LIMIT',
      message: `価格効率の最大差 ${efficiencySpread.toFixed(2)}x (${efficiencyDetail}) が上限に近づいています`,
    });
  }
  for (const rarity of ['common', 'rare', 'epic'] as const) {
    const group = metrics.filter((metric) => metric.rarity === rarity);
    const spread = ratio(group.map((metric) => metric.power));
    if (group.length < 2) continue;
    const strongest = [...group].sort((a, b) => b.power - a.power)[0];
    const weakest = [...group].sort((a, b) => a.power - b.power)[0];
    const detail = `${strongest.id} ${strongest.power} / ${weakest.id} ${weakest.power}`;
    if (spread > data.balanceAnalysis.maxSameRarityPowerSpread) {
      issues.push({
        severity: 'error',
        code: 'RARITY_POWER_SPREAD',
        message: `${rarity} 内の戦力差 ${spread.toFixed(2)}x (${detail}) が上限 ${data.balanceAnalysis.maxSameRarityPowerSpread.toFixed(2)}x を超えています`,
      });
    } else if (spread > data.balanceAnalysis.maxSameRarityPowerSpread * data.balanceAnalysis.warningThresholdRatio) {
      issues.push({
        severity: 'warning',
        code: 'RARITY_POWER_NEAR_LIMIT',
        message: `${rarity} 内の戦力差 ${spread.toFixed(2)}x (${detail}) が上限に近づいています`,
      });
    }
  }
  return {
    schemaVersion: data.schemaVersion,
    metrics,
    abilityMetrics,
    issues,
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
  };
}
