import type { GameData, MotionConfig } from './types.ts';

const baseMotionIds = ['idle', 'move', 'attack', 'hit', 'death'];
const targetReactionIds = ['thrown', 'pulled', 'miss'];

export type MotionRequirements = {
  unitId: string;
  requiredMotionIds: string[];
  optionalMotionIds: string[];
  fallbacks: Record<string, string>;
};

export function deriveMotionRequirements(
  data: GameData,
  motionConfig: MotionConfig,
  unitId: string,
): MotionRequirements {
  const configuredIds = new Set(motionConfig.motions.map((motion) => motion.motionId));
  const instructionById = new Map(data.instructions.map((instruction) => [instruction.id, instruction]));
  const required = new Set(baseMotionIds);
  const program = data.defaultPrograms.find((entry) => entry.unitId === unitId);
  const reaction = data.defaultReactions.find((entry) => entry.unitId === unitId);
  for (const actionId of [...(program?.actionIds ?? []), ...(reaction?.actionId ? [reaction.actionId] : [])]) {
    const instruction = instructionById.get(actionId);
    if (instruction) required.add(instruction.visualKind ?? instruction.action);
  }
  for (const instruction of data.instructions) {
    if (instruction.fixedFor === unitId) required.add(instruction.visualKind ?? instruction.action);
  }

  const optional = new Set(targetReactionIds);
  for (const instruction of data.instructions) {
    if (!instruction.fixedFor || instruction.fixedFor === unitId) {
      optional.add(instruction.visualKind ?? instruction.action);
    }
  }
  for (const id of required) optional.delete(id);

  const ordered = motionConfig.motions.map((motion) => motion.motionId);
  const unknown = [...required, ...optional].filter((motionId) => !configuredIds.has(motionId));
  if (unknown.length > 0) throw new Error(`Motion configuration is missing: ${[...new Set(unknown)].join(', ')}`);
  const requiredMotionIds = ordered.filter((motionId) => required.has(motionId));
  const optionalMotionIds = ordered.filter((motionId) => optional.has(motionId));
  const fallbacks = Object.fromEntries(
    motionConfig.motions
      .filter((motion) => optional.has(motion.motionId) && motion.fallbackMotionId)
      .map((motion) => [motion.motionId, motion.fallbackMotionId as string]),
  );
  return { unitId, requiredMotionIds, optionalMotionIds, fallbacks };
}
