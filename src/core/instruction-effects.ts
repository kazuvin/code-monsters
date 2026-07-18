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

export function statusBonusDamage(instruction: Instruction, target: Fighter): number {
  return effectsByKind(instruction, 'consumeStatus').reduce(
    (total, effect) => total + (statusStacks(target, effect.statusId) >= effect.stacks ? (effect.bonusDamage ?? 0) : 0),
    0,
  );
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
