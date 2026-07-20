import { BATTLE_CONFIG, CONDITIONS, INSTRUCTIONS, TARGET_SELECTORS } from '../data.ts';
import type { ConditionId, Fighter, Instruction, TargetSelectorId, UnitDefinition } from '../types.ts';
import { resolveImpact, type ImpactResult } from './combat.ts';
import { effectByKind, requireEffect, statusBonusDamage } from './instruction-effects.ts';
import { directionToward, spatialDistance } from './spatial-combat.ts';
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
export const clampHeight = (y: number) => Math.max(BATTLE_CONFIG.floorY, Math.min(BATTLE_CONFIG.ceilingY, y));
export const distanceTo = (left: Pick<Fighter, 'x' | 'y'>, right: Pick<Fighter, 'x' | 'y'>) =>
  spatialDistance(left, right);
export const isTouchingFloor = (fighter: Pick<Fighter, 'y'>) => fighter.y <= BATTLE_CONFIG.floorY + Number.EPSILON * 16;

export const nearestEnemy = (actor: Fighter, enemies: Fighter[]) =>
  [...enemies].sort((left, right) => distanceTo(actor, left) - distanceTo(actor, right))[0];
export const lowestHpRatio = (fighters: Fighter[]) =>
  [...fighters].sort((left, right) => left.hp / left.maxHp - right.hp / right.maxHp)[0];
export const otherAllies = (actor: Fighter, allies: Fighter[]) =>
  allies.filter((ally) => ally.instanceId !== actor.instanceId);
export const partner = (actor: Fighter, allies: Fighter[]) => otherAllies(actor, allies)[0];

export const forcedEnemy = (actor: Fighter, enemies: Fighter[]) => {
  const targetId = statusEffectTargetId(actor, 'targetLock');
  return targetId ? enemies.find((enemy) => enemy.instanceId === targetId && enemy.hp > 0) : undefined;
};

export const priorityEnemy = (actor: Fighter, enemies: Fighter[]) =>
  forcedEnemy(actor, enemies) ?? nearestEnemy(actor, enemies);

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
  if (selector === 'partner') {
    const target = partner(actor, allies);
    return target ? [target] : [];
  }
  if (selector === 'allEnemies') return enemies;
  return allies;
}

export function matchCondition(condition: ConditionId, actor: Fighter, targets: Fighter[]): Fighter[] {
  const definition = conditionById.get(condition);
  if (!definition) return [];
  if (definition.kind === 'always') return targets;
  if (definition.kind === 'targetWithinDistance')
    return targets.filter((target) => distanceTo(actor, target) <= (definition.params.distance ?? 0));
  if (definition.kind === 'targetBeyondDistance')
    return targets.filter((target) => distanceTo(actor, target) > (definition.params.distance ?? 0));
  if (definition.kind === 'targetHpBelow')
    return targets.filter((target) => target.hp / target.maxHp <= (definition.params.threshold ?? 0));
  if (definition.kind === 'selfHpBelow')
    return targets.filter(
      (target) =>
        target.instanceId === actor.instanceId && actor.hp / actor.maxHp <= (definition.params.threshold ?? 0),
    );
  if (definition.kind === 'selfHeightAbove')
    return actor.y >= (definition.params.height ?? Number.POSITIVE_INFINITY) ? targets : [];
  if (definition.kind === 'selfHeightBelow')
    return actor.y <= (definition.params.height ?? Number.NEGATIVE_INFINITY) ? targets : [];
  if (definition.kind === 'targetHeightAbove')
    return targets.filter((target) => target.y >= (definition.params.height ?? Number.POSITIVE_INFINITY));
  if (definition.kind === 'selfDescending') return actor.vy <= -(definition.params.verticalSpeed ?? 0) ? targets : [];
  const statusId = definition.params.statusId;
  const minimumStacks = definition.params.minimumStacks ?? 1;
  if (definition.kind === 'selfHasStatus')
    return statusId && statusStacks(actor, statusId) >= minimumStacks ? targets : [];
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

export function actionLockDuration(speed: number): number {
  return Math.max(BATTLE_CONFIG.minimumActionLockSeconds, BATTLE_CONFIG.baseActionLockSeconds / speed);
}

export function actionWindupDuration(speed: number): number {
  return Math.max(BATTLE_CONFIG.minimumActionWindupSeconds, BATTLE_CONFIG.baseActionWindupSeconds / speed);
}

export function instructionCooldown(instruction: Instruction, speed: number): number {
  return Math.max(BATTLE_CONFIG.minimumInstructionCooldownSeconds, instruction.cooldownSeconds / speed);
}

const moveTowardZero = (value: number, amount: number) => {
  if (Math.abs(value) <= amount) return 0;
  return value - Math.sign(value) * amount;
};

export function tickCooldowns(fighters: Fighter[], dt: number): Fighter[] {
  return fighters.map((fighter) => {
    const statusTicked = tickStatusDurations(fighter, dt);
    const activeGravityScale = fighter.gravityScaleRemaining > 0 ? fighter.gravityScale : 1;
    const nextGravityRemaining = Math.max(0, fighter.gravityScaleRemaining - dt);
    const nextGravityScale = nextGravityRemaining > 0 ? fighter.gravityScale : 1;
    const acceleratedVy = Math.max(
      -BATTLE_CONFIG.maxFallSpeed,
      fighter.vy - BATTLE_CONFIG.gravityPerSecond * activeGravityScale * dt,
    );
    const unclampedX = fighter.x + fighter.vx * dt;
    const unclampedY = fighter.y + acceleratedVy * dt;
    const x = clampStage(unclampedX);
    const y = clampHeight(unclampedY);
    const hitFloor = y <= BATTLE_CONFIG.floorY && acceleratedVy < 0;
    const hitCeiling = y >= BATTLE_CONFIG.ceilingY && acceleratedVy > 0;
    const drag = hitFloor ? BATTLE_CONFIG.groundFrictionPerSecond : BATTLE_CONFIG.horizontalDragPerSecond;
    const vx = x !== unclampedX ? 0 : moveTowardZero(fighter.vx, Math.max(0, drag) * dt);
    const vy = hitFloor || hitCeiling ? 0 : acceleratedVy;
    return {
      ...statusTicked,
      x,
      y,
      vx,
      vy,
      gravityScale: nextGravityScale,
      gravityScaleRemaining: nextGravityRemaining,
      actionLock: Math.max(0, fighter.actionLock - dt),
      instructionCooldowns: Object.fromEntries(
        Object.entries(fighter.instructionCooldowns).map(([actionId, remaining]) => [
          actionId,
          Math.max(0, remaining - dt),
        ]),
      ),
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
  return actor.attack * effect.attackScale + (effect.flatDamage ?? 0) + statusBonusDamage(instruction, actor, target);
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
  return { attack: boosted.attack, speed: boosted.speed, statuses: boosted.statuses };
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
  if (instruction.target === 'partner') return partner(actor, allies);
  return nearestEnemy(actor, enemies);
}

export function instructionReach(instruction: Instruction): number {
  const delivery = instruction.delivery;
  if (!delivery) return 0;
  if (delivery.kind === 'projectile') return delivery.speed * delivery.lifetimeSeconds;
  if (delivery.kind === 'lob') return BATTLE_CONFIG.wallRight - BATTLE_CONFIG.wallLeft;
  if (delivery.shape.kind === 'circle') return delivery.shape.offsetX + delivery.shape.radius;
  return delivery.shape.offsetX + delivery.shape.width / 2;
}

export function instructionMetrics(instruction: Instruction, unit: UnitDefinition): { label: string; value: string }[] {
  const metricNumber = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
  const withCost = (metrics: { label: string; value: string }[]) => [
    ...metrics,
    { label: '基準CD', value: `${metricNumber(instruction.cooldownSeconds)} s` },
    { label: 'COST', value: instruction.abilityCost === 0 ? 'FREE' : String(instruction.abilityCost) },
  ];
  const delivery = instruction.delivery;
  const motion = effectByKind(instruction, 'motion');
  const gravity = effectByKind(instruction, 'gravity');
  const damage = effectByKind(instruction, 'damage');
  const application = effectByKind(instruction, 'applyStatus');
  if (delivery?.kind === 'shape') {
    const shape = delivery.shape;
    const geometry =
      shape.kind === 'circle'
        ? `円 半径${metricNumber(shape.radius)}m`
        : `矩形 ${metricNumber(shape.width)}×${shape.height === null ? '∞' : metricNumber(shape.height)}m`;
    return withCost([
      { label: '判定', value: geometry },
      ...(damage
        ? [{ label: '基礎DMG', value: metricNumber(unit.attack * damage.attackScale + (damage.flatDamage ?? 0)) }]
        : []),
    ]);
  }
  if (delivery?.kind === 'projectile')
    return withCost([
      { label: delivery.homing ? '追尾弾速' : '弾速', value: `${metricNumber(delivery.speed)} m/s` },
      { label: '寿命', value: `${metricNumber(delivery.lifetimeSeconds)} s` },
      ...(damage
        ? [{ label: '基礎DMG', value: metricNumber(unit.attack * damage.attackScale + (damage.flatDamage ?? 0)) }]
        : []),
    ]);
  if (delivery?.kind === 'lob')
    return withCost([
      { label: '弾道', value: '放物線→地面' },
      { label: '滞空', value: `${metricNumber(delivery.flightSeconds)} s` },
      { label: '重力倍率', value: `${metricNumber(delivery.gravityScale)}×` },
    ]);
  if (motion)
    return withCost([
      { label: '水平速度', value: `${motion.x >= 0 ? '+' : ''}${metricNumber(motion.x)} m/s` },
      { label: '垂直速度', value: `${motion.y >= 0 ? '+' : ''}${metricNumber(motion.y)} m/s` },
      ...(gravity
        ? [
            { label: '重力倍率', value: `${metricNumber(gravity.scale)}×` },
            { label: '持続', value: `${metricNumber(gravity.durationSeconds)} s` },
          ]
        : []),
    ]);
  if (instruction.action === 'guard' && application) {
    const status = requireStatusDefinition(application.statusId);
    const damageScale = status.effects.find((effect) => effect.kind === 'incomingDamageScale')?.value ?? 1;
    return withCost([{ label: '被DMG', value: `−${Math.round((1 - damageScale) * 100)}%` }]);
  }
  const heal = effectByKind(instruction, 'heal');
  if (heal) return withCost([{ label: '回復', value: `${heal.amount} HP` }]);
  if (application) return withCost([{ label: '状態', value: requireStatusDefinition(application.statusId).label }]);
  return withCost([]);
}

export { directionToward } from './spatial-combat.ts';
