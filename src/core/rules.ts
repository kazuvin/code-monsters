import { BATTLE_CONFIG, CONDITIONS, INSTRUCTIONS, TARGET_SELECTORS } from '../data.ts';
import { resolveImpact, type ImpactResult } from './combat.ts';
import type { ConditionId, Fighter, Instruction, TargetSelectorId, UnitDefinition } from '../types.ts';
import { effectByKind, requireEffect, statusBonusDamage } from './instruction-effects.ts';
import {
  applyStatus,
  requireStatusDefinition,
  statusEffectMultiplier,
  statusEffectTargetId,
  statusStacks,
  tickStatusDurations,
} from './statuses.ts';

export const instructionById = new Map(INSTRUCTIONS.map((instruction) => [instruction.id, instruction]));
export const conditionById = new Map(CONDITIONS.map((condition) => [condition.id, condition]));
export const targetSelectorById = new Map(TARGET_SELECTORS.map((target) => [target.id, target]));

export const clampStage = (x: number) => Math.max(BATTLE_CONFIG.wallLeft, Math.min(BATTLE_CONFIG.wallRight, x));
export const distanceTo = (a: Pick<Fighter, 'x'>, b: Pick<Fighter, 'x'>) => Math.abs(a.x - b.x);
export const nearestEnemy = (actor: Fighter, enemies: Fighter[]) =>
  [...enemies].sort((a, b) => distanceTo(actor, a) - distanceTo(actor, b))[0];
export const lowestHpRatio = (fighters: Fighter[]) => [...fighters].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
export const otherAllies = (actor: Fighter, allies: Fighter[]) =>
  allies.filter((ally) => ally.instanceId !== actor.instanceId);
export const nearestAlly = (actor: Fighter, allies: Fighter[]) =>
  [...otherAllies(actor, allies)].sort((a, b) => distanceTo(actor, a) - distanceTo(actor, b))[0];
export const criticalAlly = (actor: Fighter, allies: Fighter[]) =>
  lowestHpRatio(otherAllies(actor, allies).filter((ally) => ally.hp / ally.maxHp <= BATTLE_CONFIG.lowHpThreshold));

export const forcedEnemy = (actor: Fighter, enemies: Fighter[]) => {
  const targetId = statusEffectTargetId(actor, 'targetLock');
  return targetId ? enemies.find((enemy) => enemy.instanceId === targetId && enemy.hp > 0) : undefined;
};

export const priorityEnemy = (actor: Fighter, enemies: Fighter[]) =>
  forcedEnemy(actor, enemies) ?? nearestEnemy(actor, enemies);

const directionToward = (actor: Fighter, target: Fighter) =>
  Math.sign(target.x - actor.x) || (actor.team === 'ally' ? 1 : -1);

export function advanceToward(actor: Fighter, target: Fighter, distance: number): number {
  const stoppingDistance = actor.range * BATTLE_CONFIG.rangeStopRatio;
  const direction = directionToward(actor, target);
  const next = actor.x + direction * distance;
  const stoppingPosition = target.x - direction * stoppingDistance;
  return clampStage(direction > 0 ? Math.min(next, stoppingPosition) : Math.max(next, stoppingPosition));
}

export function jumpToward(actor: Fighter, target: Fighter, distance: number): number {
  return clampStage(actor.x + directionToward(actor, target) * distance);
}

export function throwBehind(actor: Fighter, target: Fighter, distance: number): number {
  return clampStage(actor.x - directionToward(actor, target) * distance);
}

export function pullToward(actor: Fighter, target: Fighter, distance: number): number {
  if (distanceTo(actor, target) <= distance) return target.x;
  return clampStage(actor.x + directionToward(actor, target) * distance);
}

export function actionRange(actor: Fighter, instruction: Instruction): number {
  if (instruction.range.mode === 'fixed') return instruction.range.value ?? actor.range;
  if (instruction.range.mode === 'scaled') return actor.range * (instruction.range.value ?? 1);
  return actor.range;
}

export function retreatFrom(actor: Fighter, target: Fighter, distance: number): number {
  return clampStage(actor.x - directionToward(actor, target) * distance);
}

export function knockbackPosition(target: Fighter, source: Fighter, distance: number): number {
  return clampStage(target.x + directionToward(source, target) * distance);
}

export function selectConditionTargets(
  selector: TargetSelectorId,
  actor: Fighter,
  enemies: Fighter[],
  allies: Fighter[],
): Fighter[] {
  if (selector === 'self') return [actor];
  if (selector === 'nearestEnemy') {
    const target = priorityEnemy(actor, enemies);
    return target ? [target] : [];
  }
  if (selector === 'lowestHpEnemy') {
    const target = lowestHpRatio(enemies);
    return target ? [target] : [];
  }
  if (selector === 'nearestAlly') {
    const target = nearestAlly(actor, allies);
    return target ? [target] : [];
  }
  if (selector === 'lowestHpAlly') {
    const target = lowestHpRatio(otherAllies(actor, allies));
    return target ? [target] : [];
  }
  if (selector === 'criticalAlly') {
    const target = criticalAlly(actor, allies);
    return target ? [target] : [];
  }
  if (selector === 'allEnemies') return enemies;
  return allies;
}

export function matchCondition(condition: ConditionId, actor: Fighter, targets: Fighter[]): Fighter[] {
  const definition = conditionById.get(condition);
  if (!definition) return [];
  if (definition.kind === 'always') return targets;
  if (definition.kind === 'targetInRange') return targets.filter((target) => distanceTo(actor, target) <= actor.range);
  if (definition.kind === 'targetOutOfRange')
    return targets.filter((target) => distanceTo(actor, target) > actor.range);
  if (definition.kind === 'targetHpBelow')
    return targets.filter((target) => target.hp / target.maxHp <= (definition.params.threshold ?? 0));
  if (definition.kind === 'selfHpBelow')
    return targets.filter(
      (target) =>
        target.instanceId === actor.instanceId && actor.hp / actor.maxHp <= (definition.params.threshold ?? 0),
    );
  const statusId = definition.params.statusId;
  const minimumStacks = definition.params.minimumStacks ?? 1;
  return statusId ? targets.filter((target) => statusStacks(target, statusId) >= minimumStacks) : [];
}

export function canRunCondition(condition: ConditionId, actor: Fighter, targets: Fighter[]): boolean {
  return matchCondition(condition, actor, targets).length > 0;
}

export function isConditionCompatibleWithTarget(condition: ConditionId, target: TargetSelectorId): boolean {
  return conditionById.get(condition)?.compatibleTargets.includes(target) ?? false;
}

export function isInstructionCompatibleWithTarget(instruction: Instruction, target: TargetSelectorId): boolean {
  return instruction.targetMode === 'selected'
    ? instruction.compatibleTargets.includes(target)
    : instruction.defaultTarget === target;
}

export function actionCooldown(speed: number): number {
  return Math.max(BATTLE_CONFIG.minimumActionCooldownSeconds, BATTLE_CONFIG.baseActionCooldownSeconds / speed);
}

export function tickCooldowns(fighters: Fighter[], dt: number): Fighter[] {
  return fighters.map((fighter) => {
    const statusTicked = tickStatusDurations(fighter, dt);
    return {
      ...statusTicked,
      cooldown: fighter.cooldown - dt,
      abilityGauge: Math.min(
        BATTLE_CONFIG.abilityGaugeMax,
        fighter.abilityGauge + BATTLE_CONFIG.abilityGaugeRegenPerSecond * dt,
      ),
      reactionCooldown: fighter.reactionCooldown - dt,
    };
  });
}

export function rawActionDamage(actor: Fighter, instruction: Instruction, target: Fighter): number {
  const effect = requireEffect(instruction, 'damage');
  return actor.attack * effect.attackScale + (effect.flatDamage ?? 0) + statusBonusDamage(instruction, target);
}

export function resolveActionImpact(actor: Fighter, target: Fighter, instruction: Instruction): ImpactResult {
  const guardDamageScale = statusEffectMultiplier(target, 'incomingDamageScale');
  const guardKnockbackScale = statusEffectMultiplier(target, 'incomingKnockbackScale');
  const effect = requireEffect(instruction, 'damage');
  return resolveImpact({
    rawDamage: rawActionDamage(actor, instruction, target),
    minimumDamage: effect.minimumDamage,
    attackType: actor.attackType,
    attackerKnockbackPower: actor.knockbackPower,
    targetDefense: target.defense,
    targetWeight: target.weight,
    targetRole: target.role,
    targetGuarded: guardDamageScale !== 1 || guardKnockbackScale !== 1,
    guardDamageScale,
    guardKnockbackScale,
    impact: { damageScale: effect.damageScale, knockbackPower: effect.knockbackPower },
  });
}

export function activateBerserker(
  actor: Fighter,
  instruction: Instruction,
): Pick<Fighter, 'attack' | 'speed' | 'statuses'> {
  const effect = requireEffect(instruction, 'applyStatus');
  const boosted = applyStatus(actor, effect.statusId, {
    stacks: effect.stacks,
    sourceId: actor.instanceId,
    remainingSeconds: effect.durationSeconds,
  });
  return {
    attack: boosted.attack,
    speed: boosted.speed,
    statuses: boosted.statuses,
  };
}

export function selectInstructionTarget(
  instruction: Instruction,
  actor: Fighter,
  enemies: Fighter[],
  allies: Fighter[],
): Fighter | undefined {
  if (instruction.target === 'self') return actor;
  const forced = forcedEnemy(actor, enemies);
  if (forced) return forced;
  if (instruction.target === 'lowestHpEnemy') return lowestHpRatio(enemies);
  if (instruction.target === 'nearestAlly') return nearestAlly(actor, allies);
  if (instruction.target === 'lowestHpAlly') return lowestHpRatio(otherAllies(actor, allies));
  if (instruction.target === 'criticalAlly') return criticalAlly(actor, allies);
  return nearestEnemy(actor, enemies);
}

export function instructionMetrics(instruction: Instruction, unit: UnitDefinition): { label: string; value: string }[] {
  const metricNumber = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
  const withCost = (metrics: { label: string; value: string }[]) => [
    ...metrics,
    ...(instruction.range.mode === 'fixed' && instruction.range.value !== undefined
      ? [{ label: '固定射程', value: `${metricNumber(instruction.range.value)} m` }]
      : []),
    { label: 'COST', value: instruction.abilityCost === 0 ? 'FREE' : String(instruction.abilityCost) },
  ];
  const move = effectByKind(instruction, 'move');
  const damage = effectByKind(instruction, 'damage');
  const application = effectByKind(instruction, 'applyStatus');
  if (instruction.action === 'move' && move)
    return withCost([
      { label: '前進', value: `${metricNumber(move.distance)} m` },
      { label: '停止', value: 'RNG内' },
    ]);
  if (instruction.action === 'jump' && move)
    return withCost([
      { label: '跳躍', value: `${metricNumber(move.distance)} m` },
      { label: '通過', value: '可能' },
    ]);
  if (instruction.action === 'throw' && move && damage) {
    const rawDamage = unit.attack * damage.attackScale + (damage.flatDamage ?? 0);
    return withCost([
      { label: '基礎DMG', value: metricNumber(rawDamage) },
      { label: '着地', value: `背後 ${metricNumber(move.distance)} m` },
    ]);
  }
  if (instruction.action === 'taunt' && application)
    return withCost([
      { label: '効果', value: '敵の標的→自分' },
      { label: '持続', value: `${metricNumber(application.durationSeconds ?? 0)} s` },
    ]);
  if (instruction.action === 'pull' && move)
    return withCost([{ label: '着地', value: `手前 ${metricNumber(move.distance)} m` }]);
  if (instruction.action === 'retreat' && move)
    return withCost([
      { label: '後退', value: `${metricNumber(move.distance)} m` },
      { label: '停止', value: '壁際' },
    ]);
  if (instruction.action === 'guard' && application) {
    const status = requireStatusDefinition(application.statusId);
    const damageScale = status.effects.find((effect) => effect.kind === 'incomingDamageScale')?.value ?? 1;
    const knockbackScale = status.effects.find((effect) => effect.kind === 'incomingKnockbackScale')?.value ?? 1;
    return withCost([
      { label: '被DMG', value: `−${Math.round((1 - damageScale) * 100)}%` },
      { label: '被KB', value: `−${Math.round((1 - knockbackScale) * 100)}%` },
    ]);
  }
  const heal = effectByKind(instruction, 'heal');
  if (instruction.action === 'heal' && heal)
    return withCost([
      {
        label: '回復',
        value: `${unit.role === 'SUPPORT' ? (heal.supportAmount ?? heal.amount) : heal.amount} HP`,
      },
    ]);
  const modifier = effectByKind(instruction, 'modifyStat');
  if (instruction.action === 'buff' && modifier) return withCost([{ label: 'ATK', value: `+${modifier.amount}` }]);
  if (instruction.action === 'berserk' && application) {
    const status = requireStatusDefinition(application.statusId);
    const attackScale = status.effects.find((effect) => effect.kind === 'attackScale')?.value ?? 1;
    const speedScale = status.effects.find((effect) => effect.kind === 'speedScale')?.value ?? 1;
    return withCost([
      { label: 'ATK', value: `+${Math.round((attackScale - 1) * 100)}%` },
      { label: 'SPD', value: `+${Math.round((speedScale - 1) * 100)}%` },
    ]);
  }
  const wait = effectByKind(instruction, 'wait');
  if (instruction.action === 'wait' && wait) return withCost([{ label: '待機', value: `${wait.durationSeconds} s` }]);
  const rawDamage = damage ? unit.attack * damage.attackScale + (damage.flatDamage ?? 0) : 0;
  const knockbackPower = damage?.knockbackPower ?? (unit.attackType === 'sniper' ? 0 : unit.knockbackPower);
  return withCost([
    { label: '基礎DMG', value: metricNumber(rawDamage) },
    { label: 'KB出力', value: metricNumber(knockbackPower) },
  ]);
}
