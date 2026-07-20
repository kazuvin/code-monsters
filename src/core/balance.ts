import type { GameBalanceData } from '../data.ts';
import type { Instruction, Rarity, ReactionTrigger, UnitDefinition } from '../types.ts';
import { effectByKind, effectsByKind } from './instruction-effects.ts';
import { analyzeSynergies } from './synergy.ts';

export type BalanceSeverity = 'error' | 'warning';
export type BalanceIssue = { severity: BalanceSeverity; code: string; message: string };
export type UnitBalanceMetric = {
  id: string;
  name: string;
  rarity: Rarity;
  baseDps: number;
  effectiveHp: number;
  reactionFactor: number;
  power: number;
  powerIndex: number;
};
export type AbilityBalanceMetric = {
  id: string;
  title: string;
  action: Instruction['action'];
  rarity: Rarity;
  gaugeCost: number;
  cooldownSeconds: number;
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
  const effect = effectByKind(instruction, 'damage');
  if (!effect) return 0;
  const raw = unit.attack * effect.attackScale + (effect.flatDamage ?? 0);
  const base = Math.round(raw - data.balanceAnalysis.referenceDefense * data.battle.defenseDamageFactor);
  const scale = effect.damageScale ?? 1;
  return scale <= 0 ? 0 : Math.max(effect.minimumDamage, Math.round(base * scale));
}

function cooldown(data: GameBalanceData, instruction: Instruction, speed: number): number {
  if (speed <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(data.battle.minimumInstructionCooldownSeconds, instruction.cooldownSeconds / speed);
}

function sustainableActionInterval(data: GameBalanceData, instruction: Instruction, speed: number): number {
  const actionInterval = cooldown(data, instruction, speed);
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

function statusEffectValue(data: GameBalanceData, instruction: Instruction, kind: string): number {
  const statusId = effectByKind(instruction, 'applyStatus')?.statusId;
  const status = data.statuses.find((candidate) => candidate.id === statusId);
  return status?.effects.find((effect) => effect.kind === kind)?.value ?? 1;
}

function reactionContribution(data: GameBalanceData, unit: UnitDefinition, baseDps: number, effectiveHp: number) {
  const reaction = data.defaultReactions.find((entry) => entry.unitId === unit.id && entry.trigger && entry.actionId);
  if (!reaction?.trigger || !reaction.actionId) return { dps: baseDps, effectiveHp, factor: 1 };
  const instruction = data.instructions.find((candidate) => candidate.id === reaction.actionId);
  if (!instruction) return { dps: baseDps, effectiveHp, factor: 1 };
  const configuredUptime = data.balanceAnalysis.reactionUptime[reaction.trigger as ReactionTrigger] ?? 0;
  const uptime = resourceAdjustedUptime(data, instruction, configuredUptime, data.battle.reactionCooldownSeconds);
  if (instruction.action === 'berserk') {
    const boosted =
      statusEffectValue(data, instruction, 'attackScale') * statusEffectValue(data, instruction, 'speedScale');
    const factor = 1 + uptime * (boosted - 1);
    return { dps: baseDps * factor, effectiveHp, factor };
  }
  if (instruction.action === 'guard') {
    const damageScale = statusEffectValue(data, instruction, 'incomingDamageScale');
    const factor = 1 + uptime * (1 / damageScale - 1);
    return { dps: baseDps, effectiveHp: effectiveHp * factor, factor };
  }
  if (effectByKind(instruction, 'damage')) {
    const attackInterval = cooldown(data, instruction, unit.speed);
    const attackUptime = resourceAdjustedUptime(data, instruction, configuredUptime, attackInterval);
    const reactionDps = (expectedDamage(data, unit, instruction) / attackInterval) * attackUptime;
    const factor = baseDps === 0 ? 1 : (baseDps + reactionDps) / baseDps;
    return { dps: baseDps + reactionDps, effectiveHp, factor };
  }
  return { dps: baseDps, effectiveHp, factor: 1 };
}

function validateData(data: GameBalanceData): BalanceIssue[] {
  const issues: BalanceIssue[] = [];
  const error = (code: string, message: string) => issues.push({ severity: 'error' as const, code, message });
  const unique = (kind: string, ids: string[]) => {
    for (const id of new Set(ids))
      if (ids.filter((candidate) => candidate === id).length > 1)
        error('DUPLICATE_ID', `${kind} id "${id}" が重複しています`);
  };
  const rejectUnknownKeys = (value: object, allowed: string[], context: string) => {
    const allowedKeys = new Set(allowed);
    for (const key of Object.keys(value))
      if (!allowedKeys.has(key)) error('UNKNOWN_EFFECT_FIELD', `${context} に未対応フィールド "${key}" があります`);
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
    'equipment',
    data.equipment.map((equipment) => equipment.id),
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
  unique(
    'debugPositionPreset',
    data.debugTraining.positionPresets.map((preset) => preset.id),
  );
  unique(
    'status',
    data.statuses.map((status) => status.id),
  );
  unique(
    'battleZone',
    data.battleZones.map((zone) => zone.id),
  );

  const units = new Set(data.units.map((unit) => unit.id));
  const instructions = new Set(data.instructions.map((instruction) => instruction.id));
  const equipmentIds = new Set(data.equipment.map((equipment) => equipment.id));
  const conditions = new Set(data.conditions.map((condition) => condition.id));
  const targetSelectors = new Set<string>(data.targetSelectors.map((target) => target.id));
  const statuses = new Set(data.statuses.map((status) => status.id));
  const battleZones = new Set(data.battleZones.map((zone) => zone.id));
  const supportedConditionKinds = new Set([
    'always',
    'targetInRange',
    'targetOutOfRange',
    'targetHpBelow',
    'selfHpBelow',
    'targetHasStatus',
    'selfHasStatus',
    'selfAirborne',
    'selfGrounded',
    'targetAirborne',
    'targetGrounded',
    'targetAirborneRemainingBelow',
  ]);
  const supportedActions = new Set([
    'attack',
    'heavy',
    'move',
    'jump',
    'hover',
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
    'field',
    'wait',
  ]);
  const supportedTargets = new Set(['nearestEnemy', 'lowestHpEnemy', 'partner', 'self']);
  const supportedTargetSelectors = new Set(['nearestEnemy', 'lowestHpEnemy', 'allEnemies', 'self', 'partner']);
  const supportedTargetModes = new Set(['selected', 'self', 'allEnemies', 'allAllies']);
  const supportedStatusEffects = new Set([
    'incomingDamageScale',
    'incomingKnockbackScale',
    'attackScale',
    'speedScale',
    'targetLock',
    'damagePerSecond',
  ]);
  const supportedEffectKinds = new Set([
    'damage',
    'move',
    'heal',
    'applyStatus',
    'consumeStatus',
    'removeStatus',
    'modifyStat',
    'placeZone',
    'airborne',
    'land',
    'wait',
  ]);
  const supportedEffectTargets = new Set(['actor', 'selected', 'allEnemies', 'allAllies']);
  const requireUnit = (id: string, context: string) => {
    if (!units.has(id)) error('UNKNOWN_UNIT', `${context} が未定義ユニット "${id}" を参照しています`);
  };
  const requireInstruction = (id: string, context: string) => {
    if (!instructions.has(id)) error('UNKNOWN_INSTRUCTION', `${context} が未定義スキル "${id}" を参照しています`);
  };
  const requireEquipment = (id: string, context: string) => {
    if (!equipmentIds.has(id)) error('UNKNOWN_EQUIPMENT', `${context} が未定義装備 "${id}" を参照しています`);
  };
  const requireTargetSelector = (id: string, context: string) => {
    if (!targetSelectors.has(id)) error('UNKNOWN_TARGET', `${context} が未定義対象 "${id}" を参照しています`);
  };
  const requireStatus = (id: string, context: string) => {
    if (!statuses.has(id)) error('UNKNOWN_STATUS', `${context} が未定義状態 "${id}" を参照しています`);
  };

  if (data.schemaVersion < 18) error('INVALID_SCHEMA_VERSION', 'schemaVersion は18以上である必要があります');
  if (
    data.battle.tickSeconds <= 0 ||
    data.battle.statusDamageTickSeconds <= 0 ||
    !Number.isInteger(data.battle.abilityGaugeMax) ||
    data.battle.abilityGaugeMax <= 0 ||
    data.battle.abilityGaugeInitial < 0 ||
    data.battle.abilityGaugeInitial > data.battle.abilityGaugeMax ||
    data.battle.abilityGaugeRegenPerSecond <= 0 ||
    data.battle.baseActionLockSeconds <= 0 ||
    data.battle.minimumActionLockSeconds <= 0 ||
    data.battle.baseActionWindupSeconds <= 0 ||
    data.battle.minimumActionWindupSeconds <= 0 ||
    data.battle.minimumInstructionCooldownSeconds <= 0
  )
    error('INVALID_BATTLE_CONFIG', '戦闘のtick/cooldown/abilityGauge設定が不正です');
  if (
    !Number.isInteger(data.debugTraining.minimumDummyHp) ||
    data.debugTraining.minimumDummyHp < 1 ||
    data.debugTraining.recoveryDelaySeconds <= 0 ||
    data.debugTraining.outsideRangeGap <= 0 ||
    data.debugTraining.positionPresets.length === 0
  )
    error('INVALID_DEBUG_TRAINING_CONFIG', 'デバッグ訓練のHP・回復・距離設定が不正です');
  if (!data.debugTraining.positionPresets.some((preset) => preset.id === data.debugTraining.defaultPositionPresetId))
    error('INVALID_DEBUG_POSITION', 'デバッグ訓練のデフォルト開始位置が未定義です');
  for (const preset of data.debugTraining.positionPresets)
    if (
      !['mutual', 'actor', 'target'].includes(preset.rangeReference) ||
      !['inside', 'outside'].includes(preset.relation)
    )
      error('INVALID_DEBUG_POSITION', `デバッグ開始位置 ${preset.id} の射程基準が不正です`);

  if (data.statuses.length === 0) error('MISSING_STATUS_REGISTRY', 'statuses に状態定義がありません');
  for (const status of data.statuses) {
    if (!status.id || !status.label || !status.description)
      error('INVALID_STATUS', '状態定義には id・label・description が必要です');
    const hasValidStackLimit =
      status.maxStacks === null
        ? status.stacking === 'stack'
        : Number.isInteger(status.maxStacks) && status.maxStacks >= 1;
    if (!['stack', 'replace'].includes(status.stacking) || !hasValidStackLimit)
      error('INVALID_STATUS', `状態 ${status.id} の stacking または maxStacks が不正です`);
    if (!['persistent', 'application'].includes(status.duration.mode))
      error('UNSUPPORTED_STATUS_DURATION', `状態 ${status.id} の duration.mode はエンジン未対応です`);
    if (!['combo', 'standalone'].includes(status.synergy?.mode))
      error('INVALID_STATUS_SYNERGY', `状態 ${status.id} の synergy.mode が不正です`);
    if (!status.synergy?.counterplay?.kind || !status.synergy.counterplay.description)
      error('INVALID_STATUS_SYNERGY', `状態 ${status.id} に対抗手段の定義がありません`);
    if (status.synergy?.mode === 'standalone' && !status.synergy.standaloneReason)
      error('INVALID_STATUS_SYNERGY', `単独完結状態 ${status.id} には standaloneReason が必要です`);
    if (!['toggle', 'stacks'].includes(status.debug.control))
      error('INVALID_DEBUG_STATUS', `状態 ${status.id} のデバッグ操作が不正です`);
    if (
      status.debug.control === 'stacks' &&
      ((status.debug.min ?? 0) < 0 || (status.debug.max ?? 0) <= (status.debug.min ?? 0))
    )
      error('INVALID_DEBUG_STATUS', `状態 ${status.id} のスタック範囲が不正です`);
    if (!status.visual.className || !status.visual.cardClass || !status.visual.chipClass || !status.visual.label)
      error('MISSING_STATUS_VISUAL', `状態 ${status.id} の表示定義が不足しています`);
    rejectUnknownKeys(status.duration, ['mode'], `状態 ${status.id}.duration`);
    for (const effect of status.effects) {
      rejectUnknownKeys(effect, ['kind', 'value'], `状態 ${status.id}.${effect.kind}`);
      if (!supportedStatusEffects.has(effect.kind))
        error('UNSUPPORTED_STATUS_EFFECT', `状態 ${status.id} の効果 "${effect.kind}" はエンジン未対応です`);
      if (effect.kind === 'targetLock' && effect.value !== undefined)
        error('INVALID_STATUS_EFFECT', `状態 ${status.id} の targetLock に value は指定できません`);
      if (effect.kind !== 'targetLock' && (typeof effect.value !== 'number' || effect.value <= 0))
        error('INVALID_STATUS_EFFECT', `状態 ${status.id} の数値効果は正の value を状態定義に持つ必要があります`);
      if (['attackScale', 'speedScale'].includes(effect.kind) && status.stacking !== 'replace')
        error('UNSUPPORTED_STATUS_EFFECT_LIFECYCLE', `状態 ${status.id} の能力倍率は置換型の場合のみ対応しています`);
    }
  }

  if (data.battleZones.length === 0) error('MISSING_BATTLE_ZONE_REGISTRY', 'battleZones に設置エリア定義がありません');
  for (const zone of data.battleZones) {
    rejectUnknownKeys(
      zone,
      ['id', 'label', 'description', 'radius', 'durationSeconds', 'targetFilter', 'trigger', 'visual'],
      `設置エリア ${zone.id}`,
    );
    if (!zone.id || !zone.label || !zone.description || zone.radius <= 0 || zone.durationSeconds <= 0)
      error('INVALID_BATTLE_ZONE', `設置エリア ${zone.id} の基本定義が不正です`);
    if (!['any', 'ally', 'enemy'].includes(zone.targetFilter))
      error('UNSUPPORTED_BATTLE_ZONE_TARGET', `設置エリア ${zone.id} の対象 ${zone.targetFilter} は未対応です`);
    rejectUnknownKeys(zone.trigger, ['kind', 'effects'], `設置エリア ${zone.id}.trigger`);
    if (!['onEnter', 'onActionWhileInside'].includes(zone.trigger.kind))
      error('UNSUPPORTED_BATTLE_ZONE_TRIGGER', `設置エリア ${zone.id} の発動 ${zone.trigger.kind} は未対応です`);
    if (!Array.isArray(zone.trigger.effects) || zone.trigger.effects.length === 0)
      error('MISSING_BATTLE_ZONE_EFFECT', `設置エリア ${zone.id} に発動効果がありません`);
    for (const effect of zone.trigger.effects ?? []) {
      rejectUnknownKeys(
        effect,
        ['kind', 'statusId', 'stacks', 'durationSeconds'],
        `設置エリア ${zone.id}.trigger.applyStatus`,
      );
      if (effect.kind !== 'applyStatus')
        error('UNSUPPORTED_BATTLE_ZONE_EFFECT', `設置エリア ${zone.id} の効果 ${effect.kind} は未対応です`);
      requireStatus(effect.statusId, `設置エリア ${zone.id}.trigger`);
      if (!Number.isInteger(effect.stacks) || effect.stacks < 1)
        error('INVALID_BATTLE_ZONE_EFFECT', `設置エリア ${zone.id} の状態スタックが不正です`);
      const status = data.statuses.find((candidate) => candidate.id === effect.statusId);
      if (status?.duration.mode === 'application' && (effect.durationSeconds ?? 0) <= 0)
        error('INVALID_STATUS_DURATION', `設置エリア ${zone.id} は状態 ${effect.statusId} の持続時間が必要です`);
      if (status?.duration.mode === 'persistent' && effect.durationSeconds !== undefined)
        error(
          'INVALID_STATUS_DURATION',
          `設置エリア ${zone.id} は永続状態 ${effect.statusId} に持続時間を指定できません`,
        );
    }
    rejectUnknownKeys(zone.visual, ['className', 'label', 'color'], `設置エリア ${zone.id}.visual`);
    if (!zone.visual.className || !zone.visual.label || !zone.visual.color)
      error('MISSING_BATTLE_ZONE_VISUAL', `設置エリア ${zone.id} の表示定義が不足しています`);
  }

  if (data.balanceAnalysis.abilityReferenceSpeed <= 0)
    error('INVALID_BALANCE_CONFIG', 'abilityReferenceSpeed は正数である必要があります');
  if (data.balanceAnalysis.warningThresholdRatio <= 0 || data.balanceAnalysis.warningThresholdRatio >= 1)
    error('INVALID_BALANCE_CONFIG', 'warningThresholdRatio は0より大きく1未満である必要があります');
  if (data.balanceAnalysis.maxSameRarityPowerSpread <= 1)
    error('INVALID_BALANCE_CONFIG', 'バランス差の上限は1より大きい必要があります');
  for (const [trigger, uptime] of Object.entries(data.balanceAnalysis.reactionUptime))
    if (uptime < 0 || uptime > 1)
      error('INVALID_BALANCE_CONFIG', `${trigger} の reactionUptime は0〜1で指定してください`);
  for (const unit of data.units)
    if (unit.maxHp <= 0 || unit.attack < 0 || unit.defense < 0 || unit.speed <= 0 || unit.range < 0 || unit.weight <= 0)
      error('INVALID_UNIT_STAT', `${unit.id} に0以下または不正な戦闘パラメータがあります`);
  const supportedEquipmentSlots = new Set(['frame', 'weapon', 'chip']);
  const supportedEquipmentModifiers = new Set([
    'maxHp',
    'attack',
    'defense',
    'speed',
    'range',
    'knockbackPower',
    'weight',
    'programLimit',
    'attackType',
  ]);
  for (const equipment of data.equipment) {
    if (!equipment.id || !equipment.name || !equipment.code || !equipment.description || !equipment.tradeoff)
      error('INVALID_EQUIPMENT', '装備には id・name・code・description・tradeoff が必要です');
    if (!supportedEquipmentSlots.has(equipment.slot))
      error('INVALID_EQUIPMENT_SLOT', `${equipment.id} の装備枠 ${equipment.slot} は未対応です`);
    if (equipment.price < 0) error('INVALID_EQUIPMENT_PRICE', `${equipment.id} の価格が負です`);
    for (const [key, value] of Object.entries(equipment.modifiers)) {
      if (!supportedEquipmentModifiers.has(key))
        error('UNSUPPORTED_EQUIPMENT_MODIFIER', `${equipment.id} の補正 ${key} は未対応です`);
      if (key === 'attackType') {
        if (!['melee', 'blunt', 'sniper'].includes(String(value)))
          error('INVALID_EQUIPMENT_MODIFIER', `${equipment.id}.attackType が不正です`);
      } else if (typeof value !== 'number' || !Number.isFinite(value)) {
        error('INVALID_EQUIPMENT_MODIFIER', `${equipment.id}.${key} は有限数で指定してください`);
      }
    }
    for (const actionId of equipment.grantsActionIds) requireInstruction(actionId, `equipment.${equipment.id}`);
    if (equipment.defaultReaction) {
      requireInstruction(equipment.defaultReaction.actionId, `equipment.${equipment.id}.defaultReaction`);
      if (!data.reactionTriggers.some((trigger) => trigger.id === equipment.defaultReaction?.trigger))
        error('UNKNOWN_REACTION_TRIGGER', `${equipment.id} のリアクショントリガーが未定義です`);
      if (!equipment.grantsActionIds.includes(equipment.defaultReaction.actionId))
        error('INVALID_EQUIPMENT_REACTION', `${equipment.id} の既定リアクションは同じ装備が解放する必要があります`);
    }
  }
  for (const target of data.targetSelectors) {
    if (!supportedTargetSelectors.has(target.id))
      error('UNSUPPORTED_TARGET', `対象セレクタ "${target.id}" はエンジン未対応です`);
    if (!['enemy', 'ally', 'self'].includes(target.domain) || !['one', 'many'].includes(target.cardinality))
      error('INVALID_TARGET', `${target.id} の domain または cardinality が不正です`);
  }
  for (const condition of data.conditions) {
    if (!supportedConditionKinds.has(condition.kind))
      error('UNSUPPORTED_CONDITION', `${condition.id} の kind "${condition.kind}" はエンジン未対応です`);
    if (condition.compatibleTargets.length === 0)
      error('MISSING_TARGET_COMPATIBILITY', `${condition.id} に対応対象がありません`);
    for (const targetId of condition.compatibleTargets)
      requireTargetSelector(targetId, `条件 ${condition.id}.compatibleTargets`);
    rejectUnknownKeys(
      condition.params,
      ['threshold', 'thresholdSeconds', 'statusId', 'minimumStacks'],
      `条件 ${condition.id}.params`,
    );
    if (['targetHpBelow', 'selfHpBelow'].includes(condition.kind)) {
      const threshold = condition.params.threshold;
      if (typeof threshold !== 'number' || threshold <= 0 || threshold >= 1)
        error('INVALID_CONDITION_PARAMETER', `条件 ${condition.id} の threshold は0より大きく1未満で指定してください`);
    }
    if (['targetHasStatus', 'selfHasStatus'].includes(condition.kind)) {
      if (!condition.params.statusId)
        error('MISSING_STATUS_REFERENCE', `条件 ${condition.id} に statusId がありません`);
      else requireStatus(condition.params.statusId, `条件 ${condition.id}.params.statusId`);
      if (!Number.isInteger(condition.params.minimumStacks) || (condition.params.minimumStacks ?? 0) < 1)
        error('INVALID_CONDITION_PARAMETER', `条件 ${condition.id} の minimumStacks は正の整数で指定してください`);
    }
    if (condition.kind === 'targetAirborneRemainingBelow') {
      if (!(condition.params.thresholdSeconds ?? 0) || (condition.params.thresholdSeconds ?? 0) <= 0)
        error('INVALID_CONDITION_PARAMETER', `条件 ${condition.id} の thresholdSeconds は正の数で指定してください`);
    }
  }

  const requiredMoveMode: Partial<Record<Instruction['action'], string>> = {
    move: 'advance',
    retreat: 'retreat',
    jump: 'jump',
    throw: 'throwTarget',
    pull: 'pullTarget',
  };
  const allowedEffectKindsByAction: Record<Instruction['action'], Set<string>> = {
    attack: new Set(['damage', 'applyStatus', 'consumeStatus', 'removeStatus', 'airborne', 'land']),
    heavy: new Set(['damage', 'applyStatus', 'consumeStatus', 'removeStatus', 'airborne', 'land']),
    move: new Set(['move']),
    jump: new Set(['move', 'airborne']),
    hover: new Set(['airborne']),
    throw: new Set(['damage', 'move', 'applyStatus', 'consumeStatus', 'removeStatus']),
    taunt: new Set(['applyStatus', 'removeStatus']),
    pull: new Set(['move']),
    retreat: new Set(['move']),
    heal: new Set(['heal']),
    guard: new Set(['applyStatus', 'removeStatus']),
    buff: new Set(['applyStatus', 'removeStatus', 'modifyStat']),
    berserk: new Set(['applyStatus', 'removeStatus']),
    poison: new Set(['damage', 'applyStatus', 'consumeStatus', 'removeStatus']),
    burn: new Set(['damage', 'applyStatus', 'consumeStatus', 'removeStatus']),
    follow: new Set(['damage', 'applyStatus', 'consumeStatus', 'removeStatus']),
    field: new Set(['placeZone']),
    wait: new Set(['wait']),
  };
  for (const instruction of data.instructions) {
    if (!Number.isFinite(instruction.cooldownSeconds) || instruction.cooldownSeconds <= 0)
      error('INVALID_INSTRUCTION_COOLDOWN', `${instruction.id} の cooldownSeconds は正の数で指定してください`);
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
        'hover',
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
        'field',
      ].includes(instruction.action) &&
      instruction.abilityCost <= 0
    )
      error('MISSING_ABILITY_COST', `${instruction.id} の強力な行動には正の abilityCost が必要です`);
    if (!conditions.has(instruction.condition))
      error('UNKNOWN_CONDITION', `${instruction.id} が未定義条件 "${instruction.condition}" を参照しています`);
    if (!supportedActions.has(instruction.action))
      error('UNSUPPORTED_ACTION', `${instruction.id} の action "${instruction.action}" はエンジン未対応です`);
    if (!supportedTargets.has(instruction.target))
      error('UNSUPPORTED_TARGET', `${instruction.id} の target "${instruction.target}" はエンジン未対応です`);
    const altitudeRequirements = new Set(['grounded', 'airborne', 'any']);
    if (
      instruction.altitude &&
      (!altitudeRequirements.has(instruction.altitude.actor) || !altitudeRequirements.has(instruction.altitude.target))
    )
      error('INVALID_ALTITUDE_REQUIREMENT', `${instruction.id} の altitude 定義が不正です`);
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
    if (instruction.fixedFor) requireUnit(instruction.fixedFor, `スキル ${instruction.id}`);
    if (!instruction.range || !['unit', 'fixed', 'scaled'].includes(instruction.range.mode))
      error('INVALID_RANGE', `${instruction.id} の range.mode が不正です`);
    if (instruction.range) rejectUnknownKeys(instruction.range, ['mode', 'value'], `スキル ${instruction.id}.range`);
    if (instruction.range?.mode !== 'unit' && (!(instruction.range.value ?? 0) || (instruction.range.value ?? 0) <= 0))
      error('INVALID_RANGE', `${instruction.id} の固定・倍率射程には正の value が必要です`);
    if (!Array.isArray(instruction.effects) || instruction.effects.length === 0)
      error('MISSING_EFFECT', `${instruction.id} に effects がありません`);

    for (const effect of instruction.effects ?? []) {
      if (!supportedEffectKinds.has(effect.kind)) {
        error('UNSUPPORTED_INSTRUCTION_EFFECT', `${instruction.id} の効果 "${effect.kind}" はエンジン未対応です`);
        continue;
      }
      if (!allowedEffectKindsByAction[instruction.action]?.has(effect.kind))
        error(
          'UNSUPPORTED_EFFECT_COMBINATION',
          `${instruction.id} の action ${instruction.action} は ${effect.kind} 効果を実行できません`,
        );
      if (effect.kind === 'damage') {
        rejectUnknownKeys(
          effect,
          ['kind', 'attackScale', 'flatDamage', 'damageScale', 'minimumDamage', 'knockbackPower'],
          `スキル ${instruction.id}.damage`,
        );
        if (effect.attackScale < 0 || effect.minimumDamage < 0 || (effect.damageScale ?? 1) < 0)
          error('INVALID_EFFECT', `${instruction.id} の damage 数値が不正です`);
      } else if (effect.kind === 'move') {
        rejectUnknownKeys(effect, ['kind', 'mode', 'distance'], `スキル ${instruction.id}.move`);
        if (!['advance', 'retreat', 'jump', 'throwTarget', 'pullTarget'].includes(effect.mode) || effect.distance <= 0)
          error('INVALID_EFFECT', `${instruction.id} の move 定義が不正です`);
      } else if (effect.kind === 'heal') {
        rejectUnknownKeys(effect, ['kind', 'amount', 'supportAmount'], `スキル ${instruction.id}.heal`);
        if (effect.amount <= 0 || (effect.supportAmount !== undefined && effect.supportAmount <= 0))
          error('INVALID_EFFECT', `${instruction.id} の heal 数値が不正です`);
      } else if (effect.kind === 'placeZone') {
        rejectUnknownKeys(effect, ['kind', 'zoneId', 'anchor', 'offset'], `スキル ${instruction.id}.placeZone`);
        if (!battleZones.has(effect.zoneId))
          error('UNKNOWN_BATTLE_ZONE', `${instruction.id} が未定義設置エリア "${effect.zoneId}" を参照しています`);
        if (!['actor', 'target'].includes(effect.anchor) || effect.offset < 0)
          error('INVALID_EFFECT', `${instruction.id} の placeZone 定義が不正です`);
      } else if (effect.kind === 'applyStatus') {
        rejectUnknownKeys(
          effect,
          ['kind', 'statusId', 'target', 'stacks', 'durationSeconds'],
          `スキル ${instruction.id}.applyStatus`,
        );
        requireStatus(effect.statusId, `スキル ${instruction.id}.applyStatus`);
        if (!supportedEffectTargets.has(effect.target) || !Number.isInteger(effect.stacks) || effect.stacks < 1)
          error('INVALID_EFFECT', `${instruction.id} の applyStatus 定義が不正です`);
        const status = data.statuses.find((candidate) => candidate.id === effect.statusId);
        if (
          status?.duration.mode === 'application' &&
          (!(effect.durationSeconds ?? 0) || (effect.durationSeconds ?? 0) <= 0)
        )
          error(
            'INVALID_STATUS_DURATION',
            `${instruction.id} は状態 ${effect.statusId} の持続時間を指定する必要があります`,
          );
        if (status?.duration.mode === 'persistent' && effect.durationSeconds !== undefined)
          error(
            'INVALID_STATUS_DURATION',
            `${instruction.id} は永続状態 ${effect.statusId} に持続時間を指定できません`,
          );
        const expectedTarget =
          instruction.action === 'taunt'
            ? 'allEnemies'
            : ['guard', 'berserk'].includes(instruction.action)
              ? 'actor'
              : 'selected';
        if (effect.target !== expectedTarget)
          error(
            'UNSUPPORTED_EFFECT_TARGET',
            `${instruction.id} の applyStatus 対象は ${expectedTarget} である必要があります`,
          );
      } else if (effect.kind === 'consumeStatus') {
        rejectUnknownKeys(
          effect,
          ['kind', 'statusId', 'target', 'stacks', 'bonusDamage'],
          `スキル ${instruction.id}.consumeStatus`,
        );
        requireStatus(effect.statusId, `スキル ${instruction.id}.consumeStatus`);
        if (!['actor', 'selected'].includes(effect.target) || !Number.isInteger(effect.stacks) || effect.stacks < 1)
          error('INVALID_EFFECT', `${instruction.id} の consumeStatus 定義が不正です`);
        if ((effect.bonusDamage ?? 0) < 0) error('INVALID_EFFECT', `${instruction.id} の bonusDamage が負です`);
      } else if (effect.kind === 'removeStatus') {
        rejectUnknownKeys(effect, ['kind', 'statusId', 'target'], `スキル ${instruction.id}.removeStatus`);
        requireStatus(effect.statusId, `スキル ${instruction.id}.removeStatus`);
        if (!supportedEffectTargets.has(effect.target)) error('INVALID_EFFECT', `${instruction.id} の対象が不正です`);
        const expectedTarget =
          instruction.action === 'taunt'
            ? 'allEnemies'
            : ['guard', 'berserk'].includes(instruction.action)
              ? 'actor'
              : 'selected';
        if (effect.target !== expectedTarget)
          error(
            'UNSUPPORTED_EFFECT_TARGET',
            `${instruction.id} の removeStatus 対象は ${expectedTarget} である必要があります`,
          );
      } else if (effect.kind === 'modifyStat') {
        rejectUnknownKeys(effect, ['kind', 'stat', 'amount', 'target'], `スキル ${instruction.id}.modifyStat`);
        if (effect.stat !== 'attack' || effect.target !== 'actor' || effect.amount === 0)
          error('INVALID_EFFECT', `${instruction.id} の modifyStat 定義が不正です`);
      } else if (effect.kind === 'airborne') {
        rejectUnknownKeys(effect, ['kind', 'target', 'height', 'durationSeconds'], `スキル ${instruction.id}.airborne`);
        if (!['actor', 'selected'].includes(effect.target) || effect.height <= 0 || effect.durationSeconds <= 0)
          error('INVALID_EFFECT', `${instruction.id} の airborne 定義が不正です`);
      } else if (effect.kind === 'land') {
        rejectUnknownKeys(effect, ['kind', 'target'], `スキル ${instruction.id}.land`);
        if (!['actor', 'selected'].includes(effect.target))
          error('INVALID_EFFECT', `${instruction.id} の land 定義が不正です`);
      } else if (effect.kind === 'wait') {
        rejectUnknownKeys(effect, ['kind', 'durationSeconds'], `スキル ${instruction.id}.wait`);
        if (effect.durationSeconds <= 0) error('INVALID_EFFECT', `${instruction.id} の wait 時間が不正です`);
      }
    }

    const moveMode = requiredMoveMode[instruction.action];
    if (moveMode && !effectsByKind(instruction, 'move').some((effect) => effect.mode === moveMode))
      error('MISSING_EFFECT', `${instruction.id} には ${moveMode} の move 効果が必要です`);
    if (
      ['attack', 'heavy', 'throw', 'poison', 'burn', 'follow'].includes(instruction.action) &&
      !effectByKind(instruction, 'damage')
    )
      error('MISSING_EFFECT', `${instruction.id} には damage 効果が必要です`);
    if (instruction.action === 'heal' && !effectByKind(instruction, 'heal'))
      error('MISSING_EFFECT', `${instruction.id} には heal 効果が必要です`);
    if (instruction.action === 'wait' && !effectByKind(instruction, 'wait'))
      error('MISSING_EFFECT', `${instruction.id} には wait 効果が必要です`);
    if (instruction.action === 'hover' && !effectByKind(instruction, 'airborne'))
      error('MISSING_EFFECT', `${instruction.id} には airborne 効果が必要です`);
    if (
      instruction.action === 'buff' &&
      !effectByKind(instruction, 'modifyStat') &&
      !effectByKind(instruction, 'applyStatus')
    )
      error('MISSING_EFFECT', `${instruction.id} には modifyStat または applyStatus 効果が必要です`);
    if (['guard', 'berserk', 'taunt'].includes(instruction.action) && !effectByKind(instruction, 'applyStatus'))
      error('MISSING_STATUS_REFERENCE', `${instruction.id} には applyStatus 効果が必要です`);
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
  if (data.battle.teamSize !== 1) error('INVALID_TEAM_SIZE', '1vs1では battle.teamSize を1にしてください');
  if (
    data.roster.startingUnitIds.length !== data.battle.teamSize ||
    data.roster.enemyUnitIds.length !== data.battle.teamSize
  )
    error('INVALID_ROSTER_SIZE', `標準の味方・敵編成はそれぞれ${data.battle.teamSize}体にしてください`);
  if (data.encounters.length !== 5) error('INVALID_ENCOUNTERS', 'encounters は5ラウンド定義してください');
  for (const encounter of data.encounters) {
    if (encounter.enemyUnitIds.length !== data.battle.teamSize)
      error('INVALID_ENCOUNTER', `${encounter.id} の敵編成は${data.battle.teamSize}体にしてください`);
    if (encounter.enemyStatScale <= 0 || encounter.reward < 0)
      error('INVALID_ENCOUNTER', `${encounter.id} の倍率または報酬が不正です`);
    for (const id of encounter.enemyUnitIds) requireUnit(id, `encounter ${encounter.id}`);
    if (encounter.enemyEquipmentIds.length !== 3)
      error('INVALID_ENCOUNTER_EQUIPMENT', `${encounter.id} の敵装備は3枠にしてください`);
    for (const id of encounter.enemyEquipmentIds) requireEquipment(id, `encounter ${encounter.id}`);
    for (const actionId of encounter.enemyProgramActionIds)
      requireInstruction(actionId, `encounter ${encounter.id}.enemyProgramActionIds`);
    if (encounter.enemyReaction) {
      requireInstruction(encounter.enemyReaction.actionId, `encounter ${encounter.id}.enemyReaction`);
      if (!data.reactionTriggers.some((trigger) => trigger.id === encounter.enemyReaction?.trigger))
        error('UNKNOWN_REACTION_TRIGGER', `${encounter.id} の敵リアクショントリガーが未定義です`);
    }
  }
  for (const id of data.roster.startingActionIds) requireInstruction(id, 'roster.startingActionIds');
  for (const id of data.roster.startingConditionIds)
    if (!conditions.has(id)) error('UNKNOWN_CONDITION', `roster が未定義条件 "${id}" を参照しています`);
  if (data.roster.startingEquipmentIds.length !== 3)
    error('INVALID_STARTING_EQUIPMENT', '初期装備は frame・weapon・chip の3枠にしてください');
  for (const id of data.roster.startingEquipmentIds) requireEquipment(id, 'roster.startingEquipmentIds');
  const startingSlots = data.roster.startingEquipmentIds
    .map((id) => data.equipment.find((equipment) => equipment.id === id)?.slot)
    .filter((slot) => slot !== undefined);
  if (new Set(startingSlots).size !== 3)
    error('INVALID_STARTING_EQUIPMENT', '初期装備の frame・weapon・chip が重複または不足しています');
  if (data.shop.size !== 4) error('INVALID_SHOP_SIZE', 'ショップの排出数は4枠にしてください');
  if (
    data.shop.equipmentSlots.length !== 2 ||
    new Set(data.shop.equipmentSlots).size !== data.shop.equipmentSlots.length ||
    data.shop.equipmentSlots.some((slot) => !Number.isInteger(slot) || slot < 0 || slot >= data.shop.size)
  )
    error('INVALID_SHOP_LAYOUT', 'ショップは重複しない2装備・2スキル構成にしてください');
  const shopInstructionCount = data.instructions.filter(
    (instruction) =>
      !instruction.fixedFor &&
      !instruction.reactionOnly &&
      instruction.price > 0 &&
      !data.roster.startingActionIds.includes(instruction.id) &&
      !data.equipment.some((equipment) => equipment.grantsActionIds.includes(instruction.id)),
  ).length;
  const shopEquipmentCount = data.equipment.filter(
    (equipment) => equipment.price > 0 && !data.roster.startingEquipmentIds.includes(equipment.id),
  ).length;
  if (
    shopEquipmentCount < data.shop.equipmentSlots.length ||
    shopInstructionCount < data.shop.size - data.shop.equipmentSlots.length
  )
    error('INSUFFICIENT_SHOP_POOL', '重複なしで4枠を生成できるショップ候補がありません');
  if (data.shop.initialPicks.length > 0)
    error('NON_RANDOM_INITIAL_SHOP', 'ランダムショップでは initialPicks を空にしてください');
  for (const pick of data.shop.initialPicks) {
    if (pick.slot < 0 || pick.slot >= data.shop.size)
      error('INVALID_SHOP_SLOT', `shop.initialPicks の slot ${pick.slot} はショップ範囲外です`);
    if (pick.kind === 'equipment') requireEquipment(pick.id, 'shop.initialPicks');
    else requireInstruction(pick.id, 'shop.initialPicks');
  }
  const canAnalyzeSynergies =
    data.statuses.every((status) => status.synergy?.counterplay) &&
    data.instructions.every((instruction) => Array.isArray(instruction.effects)) &&
    data.conditions.every((condition) => condition.params);
  if (canAnalyzeSynergies) for (const issue of analyzeSynergies(data).issues) error(issue.code, issue.message);
  return issues;
}

export function analyzeBalance(data: GameBalanceData): BalanceReport {
  const issues = validateData(data);
  const attack = defaultAttack(data);
  if (!attack) issues.push({ severity: 'error', code: 'NO_BASE_ATTACK', message: '基準となる通常攻撃がありません' });
  const weights = data.balanceAnalysis.powerWeights;
  const rawMetrics = data.units.map((unit) => {
    const baseDps = attack ? expectedDamage(data, unit, attack) / cooldown(data, attack, unit.speed) : 0;
    const baseEffectiveHp = unit.maxHp + unit.defense * data.balanceAnalysis.effectiveHpDefenseWeight;
    const reaction = reactionContribution(data, unit, baseDps, baseEffectiveHp);
    const knockbackPerSecond = attack ? unit.knockbackPower / cooldown(data, attack, unit.speed) : 0;
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
    baseDps: round(baseDps),
    effectiveHp: round(reaction.effectiveHp),
    reactionFactor: round(reaction.factor),
    power: round(power),
    powerIndex: round((power / medianPower) * 100, 1),
  }));
  const abilityMetrics = data.instructions.map((instruction) => {
    const referenceCooldown = cooldown(data, instruction, data.balanceAnalysis.abilityReferenceSpeed);
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
      cooldownSeconds: round(referenceCooldown),
      recoverySeconds: round(recoverySeconds),
      sustainableIntervalSeconds: round(sustainableIntervalSeconds),
      usesPerMinute: round(60 / sustainableIntervalSeconds, 1),
      costLimited: recoverySeconds > referenceCooldown,
    };
  });
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
