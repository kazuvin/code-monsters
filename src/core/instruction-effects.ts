import type { EffectTarget, Fighter, Instruction, InstructionEffectByKind, InstructionEffectKind } from '../types.ts';
import { applyStatus, consumeStatus, hasStatus, removeStatus, statusStacks } from './statuses.ts';

export function effectsByKind<Kind extends InstructionEffectKind>(
  instruction: Instruction,
  kind: Kind,
): InstructionEffectByKind<Kind>[] {
  return (instruction.effects ?? []).filter((effect): effect is InstructionEffectByKind<Kind> => effect.kind === kind);
}

export function effectByKind<Kind extends InstructionEffectKind>(
  instruction: Instruction,
  kind: Kind,
): InstructionEffectByKind<Kind> | undefined {
  return effectsByKind(instruction, kind)[0];
}

export function requireEffect<Kind extends InstructionEffectKind>(
  instruction: Instruction,
  kind: Kind,
): InstructionEffectByKind<Kind> {
  const effect = effectByKind(instruction, kind);
  if (!effect) throw new Error(`${instruction.id} requires a ${kind} effect`);
  return effect;
}

export function instructionHasDamage(instruction: Instruction): boolean {
  return Boolean(effectByKind(instruction, 'damage'));
}

export function statusBonusDamage(instruction: Instruction, actor: Fighter, target: Fighter): number {
  return effectsByKind(instruction, 'consumeStatus').reduce((total, effect) => {
    const statusOwner = effect.target === 'actor' ? actor : target;
    return total + (statusStacks(statusOwner, effect.statusId) >= effect.stacks ? (effect.bonusDamage ?? 0) : 0);
  }, 0);
}

const targetsEffect = (effectTarget: EffectTarget, actualTarget: EffectTarget) => effectTarget === actualTarget;

export function applyInstructionStatusEffects(
  fighter: Fighter,
  instruction: Instruction,
  sourceId: string,
  actualTarget: EffectTarget,
): Fighter {
  let next = fighter;
  for (const effect of effectsByKind(instruction, 'consumeStatus')) {
    if (targetsEffect(effect.target, actualTarget)) next = consumeStatus(next, effect.statusId, effect.stacks).fighter;
  }
  for (const effect of effectsByKind(instruction, 'removeStatus')) {
    if (targetsEffect(effect.target, actualTarget) && hasStatus(next, effect.statusId))
      next = removeStatus(next, effect.statusId);
  }
  for (const effect of effectsByKind(instruction, 'applyStatus')) {
    if (!targetsEffect(effect.target, actualTarget)) continue;
    next = applyStatus(next, effect.statusId, {
      stacks: effect.stacks,
      sourceId,
      targetId: effect.target === 'allEnemies' ? sourceId : null,
      remainingSeconds: effect.durationSeconds,
    });
  }
  return next;
}

export function applyInstructionFighterEffects(
  fighter: Fighter,
  instruction: Instruction,
  sourceId: string,
  actualTarget: EffectTarget,
  context: { direction?: number } = {},
): Fighter {
  let next = applyInstructionStatusEffects(fighter, instruction, sourceId, actualTarget);
  for (const effect of effectsByKind(instruction, 'motion')) {
    if (!targetsEffect(effect.target, actualTarget)) continue;
    const direction = effect.relativeTo === 'target' ? (context.direction ?? 1) : 1;
    const vx = effect.x * direction;
    const applyVertical = effect.verticalMaxY === undefined || next.y <= effect.verticalMaxY;
    next = {
      ...next,
      vx: effect.mode === 'addVelocity' ? next.vx + vx : vx,
      vy: applyVertical ? (effect.mode === 'addVelocity' ? next.vy + effect.y : effect.y) : next.vy,
    };
  }
  for (const effect of effectsByKind(instruction, 'gravity')) {
    if (!targetsEffect(effect.target, actualTarget)) continue;
    next = {
      ...next,
      gravityScale: effect.scale,
      gravityScaleRemaining: effect.durationSeconds,
    };
  }
  return next;
}
