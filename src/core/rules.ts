import { BATTLE_CONFIG, CONDITIONS, INSTRUCTIONS, TARGET_SELECTORS } from '../data.ts';
import { resolveImpact, type ImpactResult } from './combat.ts';
import type { ConditionId, Fighter, Instruction, TargetSelectorId, UnitDefinition } from '../types.ts';

export const instructionById = new Map(INSTRUCTIONS.map((instruction) => [instruction.id, instruction]));
export const conditionById = new Map(CONDITIONS.map((condition) => [condition.id, condition]));
export const targetSelectorById = new Map(TARGET_SELECTORS.map((target) => [target.id, target]));

export const clampStage = (x: number) => Math.max(BATTLE_CONFIG.wallLeft, Math.min(BATTLE_CONFIG.wallRight, x));
export const distanceTo = (a: Pick<Fighter, 'x'>, b: Pick<Fighter, 'x'>) => Math.abs(a.x - b.x);
export const nearestEnemy = (actor: Fighter, enemies: Fighter[]) =>
  [...enemies].sort((a, b) => distanceTo(actor, a) - distanceTo(actor, b))[0];
export const lowestHpRatio = (fighters: Fighter[]) => [...fighters].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];

export const forcedEnemy = (actor: Fighter, enemies: Fighter[]) =>
  actor.tauntSeconds > 0 && actor.tauntTargetId
    ? enemies.find((enemy) => enemy.instanceId === actor.tauntTargetId && enemy.hp > 0)
    : undefined;

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
  return actor.range * (instruction.params.rangeScale ?? 1);
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
  if (selector === 'currentEnemy') {
    const target = priorityEnemy(actor, enemies);
    return target ? [target] : [];
  }
  if (selector === 'lowestHpEnemy') {
    const target = lowestHpRatio(enemies);
    return target ? [target] : [];
  }
  if (selector === 'lowestHpAlly') {
    const target = lowestHpRatio(allies);
    return target ? [target] : [];
  }
  if (selector === 'allEnemies') return enemies;
  return allies;
}

export function matchCondition(condition: ConditionId, actor: Fighter, targets: Fighter[]): Fighter[] {
  if (condition === 'always') return targets;
  if (condition === 'enemyInRange') return targets.filter((target) => distanceTo(actor, target) <= actor.range);
  if (condition === 'enemyOutOfRange') return targets.filter((target) => distanceTo(actor, target) > actor.range);
  if (condition === 'enemyHpBelow50')
    return targets.filter((target) => target.hp / target.maxHp <= BATTLE_CONFIG.enemyLowHpThreshold);
  if (condition === 'selfHpBelow30')
    return targets.filter((target) => target.hp / target.maxHp <= BATTLE_CONFIG.lowHpThreshold);
  if (condition === 'allyHpBelow50')
    return targets.filter((target) => target.hp / target.maxHp <= BATTLE_CONFIG.allyLowHpThreshold);
  return targets.filter((target) => target.poison > 0);
}

export function canRunCondition(condition: ConditionId, actor: Fighter, targets: Fighter[]): boolean {
  return matchCondition(condition, actor, targets).length > 0;
}

export function isConditionCompatibleWithTarget(condition: ConditionId, target: TargetSelectorId): boolean {
  return conditionById.get(condition)?.compatibleTargets.includes(target) ?? false;
}

export function isInstructionCompatibleWithTarget(instruction: Instruction, target: TargetSelectorId): boolean {
  return instruction.targetMode !== 'selected' || instruction.compatibleTargets.includes(target);
}

export function actionCooldown(speed: number): number {
  return Math.max(BATTLE_CONFIG.minimumActionCooldownSeconds, BATTLE_CONFIG.baseActionCooldownSeconds / speed);
}

export function tickCooldowns(fighters: Fighter[], dt: number): Fighter[] {
  return fighters.map((fighter) => {
    const tauntSeconds = Math.max(0, fighter.tauntSeconds - dt);
    return {
      ...fighter,
      cooldown: fighter.cooldown - dt,
      reactionCooldown: fighter.reactionCooldown - dt,
      tauntTargetId: tauntSeconds > 0 ? fighter.tauntTargetId : null,
      tauntSeconds,
    };
  });
}

export function rawActionDamage(actor: Fighter, instruction: Instruction, target: Fighter): number {
  const statusBonus = target.poison > 0 ? (instruction.params.statusTargetDamageBonus ?? 0) : 0;
  return actor.attack * (instruction.params.attackScale ?? 1) + (instruction.params.flatDamage ?? 0) + statusBonus;
}

export function resolveActionImpact(actor: Fighter, target: Fighter, instruction: Instruction): ImpactResult {
  return resolveImpact({
    rawDamage: rawActionDamage(actor, instruction, target),
    minimumDamage: instruction.params.minimumDamage ?? 0,
    attackType: actor.attackType,
    attackerKnockbackPower: actor.knockbackPower,
    targetDefense: target.defense,
    targetWeight: target.weight,
    targetRole: target.role,
    targetGuarded: target.guarded,
    guardDamageScale: target.guardDamageScale,
    guardKnockbackScale: target.guardKnockbackScale,
    impact: { damageScale: instruction.params.damageScale, knockbackPower: instruction.params.knockbackPower },
  });
}

export function activateBerserker(
  actor: Fighter,
  instruction: Instruction,
): Pick<Fighter, 'attack' | 'speed' | 'berserk'> {
  return {
    attack: Math.round(actor.attack * (instruction.params.attackScale ?? 1)),
    speed: Number((actor.speed * (instruction.params.speedScale ?? 1)).toFixed(2)),
    berserk: true,
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
  if (instruction.target === 'lowestHpAlly') return lowestHpRatio(allies);
  return nearestEnemy(actor, enemies);
}

export function instructionMetrics(instruction: Instruction, unit: UnitDefinition): { label: string; value: string }[] {
  const metricNumber = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
  if (instruction.action === 'move')
    return [
      { label: '前進', value: `${metricNumber(instruction.params.moveDistance ?? 0)} m` },
      { label: '停止', value: 'RNG内' },
    ];
  if (instruction.action === 'jump')
    return [
      { label: '跳躍', value: `${metricNumber(instruction.params.moveDistance ?? 0)} m` },
      { label: '通過', value: '可能' },
    ];
  if (instruction.action === 'throw') {
    const rawDamage = unit.attack * (instruction.params.attackScale ?? 1) + (instruction.params.flatDamage ?? 0);
    return [
      { label: '基礎DMG', value: metricNumber(rawDamage) },
      { label: '着地', value: `背後 ${metricNumber(instruction.params.throwDistance ?? 0)} m` },
    ];
  }
  if (instruction.action === 'taunt')
    return [
      { label: '効果', value: '敵の標的→自分' },
      { label: '持続', value: `${metricNumber(instruction.params.durationSeconds ?? 0)} s` },
    ];
  if (instruction.action === 'pull')
    return [
      {
        label: '射程',
        value: `${metricNumber(unit.range * (instruction.params.rangeScale ?? 1))} m`,
      },
      { label: '着地', value: `手前 ${metricNumber(instruction.params.pullDistance ?? 0)} m` },
    ];
  if (instruction.action === 'retreat')
    return [
      { label: '後退', value: `${metricNumber(instruction.params.moveDistance ?? 0)} m` },
      { label: '停止', value: '壁際' },
    ];
  if (instruction.action === 'guard')
    return [
      { label: '被DMG', value: `−${Math.round((1 - (instruction.params.incomingDamageScale ?? 1)) * 100)}%` },
      { label: '被KB', value: `−${Math.round((1 - (instruction.params.incomingKnockbackScale ?? 1)) * 100)}%` },
    ];
  if (instruction.action === 'heal')
    return [
      {
        label: '回復',
        value: `${unit.role === 'SUPPORT' ? (instruction.params.supportHealAmount ?? instruction.params.healAmount ?? 0) : (instruction.params.healAmount ?? 0)} HP`,
      },
    ];
  if (instruction.action === 'buff') return [{ label: 'ATK', value: `+${instruction.params.attackFlat ?? 0}` }];
  if (instruction.action === 'berserk')
    return [
      { label: 'ATK', value: `+${Math.round(((instruction.params.attackScale ?? 1) - 1) * 100)}%` },
      { label: 'SPD', value: `+${Math.round(((instruction.params.speedScale ?? 1) - 1) * 100)}%` },
    ];
  if (instruction.action === 'wait') return [{ label: '待機', value: `${instruction.params.cooldownSeconds ?? 0} s` }];
  const rawDamage = unit.attack * (instruction.params.attackScale ?? 1) + (instruction.params.flatDamage ?? 0);
  const knockbackPower = instruction.params.knockbackPower ?? (unit.attackType === 'sniper' ? 0 : unit.knockbackPower);
  return [
    { label: '基礎DMG', value: metricNumber(rawDamage) },
    { label: 'KB出力', value: metricNumber(knockbackPower) },
  ];
}
