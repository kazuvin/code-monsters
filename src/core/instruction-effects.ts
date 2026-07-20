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
  airbornePath?: { startX: number; endX: number },
): Fighter {
  let next = applyInstructionStatusEffects(fighter, instruction, sourceId, actualTarget);
  for (const effect of effectsByKind(instruction, 'airborne')) {
    if (!targetsEffect(effect.target, actualTarget)) continue;
    const startZ = next.z;
    next = {
      ...next,
      z: startZ,
      airborne: {
        remainingSeconds: effect.durationSeconds,
        durationSeconds: effect.durationSeconds,
        maxHeight: effect.height,
        startX: airbornePath?.startX ?? next.x,
        endX: airbornePath?.endX ?? next.x,
        startZ,
        endZ: 0,
      },
    };
  }
  for (const effect of effectsByKind(instruction, 'land')) {
    if (targetsEffect(effect.target, actualTarget)) next = { ...next, z: 0, airborne: null };
  }
  return next;
}
