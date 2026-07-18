import { STATUSES } from '../data.ts';
import type { Fighter, StatusDefinition, StatusEffectKind, StatusInstance } from '../types.ts';

export const statusById = new Map(STATUSES.map((status) => [status.id, status]));

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function requireStatusDefinition(statusId: string): StatusDefinition {
  const definition = statusById.get(statusId);
  if (!definition) throw new Error(`Unknown status: ${statusId}`);
  return definition;
}

export function getStatus(fighter: Pick<Fighter, 'statuses'>, statusId: string): StatusInstance | undefined {
  return fighter.statuses.find((status) => status.statusId === statusId);
}

export const hasStatus = (fighter: Pick<Fighter, 'statuses'>, statusId: string) =>
  Boolean(getStatus(fighter, statusId));
export const statusStacks = (fighter: Pick<Fighter, 'statuses'>, statusId: string) =>
  getStatus(fighter, statusId)?.stacks ?? 0;
export const statusRemaining = (fighter: Pick<Fighter, 'statuses'>, statusId: string) =>
  getStatus(fighter, statusId)?.remainingSeconds ?? null;
export const statusTargetId = (fighter: Pick<Fighter, 'statuses'>, statusId: string) =>
  getStatus(fighter, statusId)?.targetId ?? null;

export function statusDamagePerSecond(statusId: string): number {
  const effect = requireStatusDefinition(statusId).effects.find((candidate) => candidate.kind === 'damagePerSecond');
  return effect?.value ?? 0;
}

export function statusEffectTargetId(
  fighter: Pick<Fighter, 'statuses'>,
  kind: Extract<StatusEffectKind, 'targetLock'>,
): string | null {
  const instance = fighter.statuses.find((status) =>
    requireStatusDefinition(status.statusId).effects.some((effect) => effect.kind === kind),
  );
  return instance?.targetId ?? null;
}

function definitionDuration(definition: StatusDefinition): number | null {
  if (definition.duration.mode === 'persistent') return null;
  throw new Error(`Status ${definition.id} requires durationSeconds from its application effect`);
}

function effectValue(definition: StatusDefinition, kind: StatusEffectKind): number {
  const effect = definition.effects.find((candidate) => candidate.kind === kind);
  if (!effect) return 1;
  if (typeof effect.value !== 'number') throw new Error(`Status ${definition.id}.${kind} requires a numeric value`);
  return effect.value;
}

export function applyStatus(
  fighter: Fighter,
  statusId: string,
  options: {
    stacks?: number;
    sourceId?: string | null;
    targetId?: string | null;
    remainingSeconds?: number | null;
  } = {},
): Fighter {
  const definition = requireStatusDefinition(statusId);
  const existing = getStatus(fighter, statusId);
  const requestedStacks = Math.max(1, Math.round(options.stacks ?? 1));
  const accumulatedStacks =
    definition.stacking === 'stack' ? (existing?.stacks ?? 0) + requestedStacks : requestedStacks;
  const stacks =
    definition.maxStacks === null ? Math.max(1, accumulatedStacks) : clamp(accumulatedStacks, 1, definition.maxStacks);
  const tickAccumulatorSeconds =
    statusDamagePerSecond(statusId) > 0 ? (existing?.tickAccumulatorSeconds ?? 0) : undefined;
  const instance: StatusInstance = {
    statusId,
    stacks,
    remainingSeconds:
      options.remainingSeconds !== undefined ? options.remainingSeconds : definitionDuration(definition),
    sourceId: options.sourceId !== undefined ? options.sourceId : (existing?.sourceId ?? null),
    targetId: options.targetId !== undefined ? options.targetId : (existing?.targetId ?? null),
    ...(tickAccumulatorSeconds === undefined ? {} : { tickAccumulatorSeconds }),
  };
  const statuses = existing
    ? fighter.statuses.map((status) => (status.statusId === statusId ? instance : status))
    : [...fighter.statuses, instance];
  if (existing) return { ...fighter, statuses };

  const attackScale = effectValue(definition, 'attackScale');
  const speedScale = effectValue(definition, 'speedScale');
  return {
    ...fighter,
    statuses,
    attack: attackScale === 1 ? fighter.attack : Math.round(fighter.attack * attackScale),
    speed: speedScale === 1 ? fighter.speed : round(fighter.speed * speedScale, 4),
  };
}

export function removeStatus(fighter: Fighter, statusId: string): Fighter {
  const definition = requireStatusDefinition(statusId);
  if (!getStatus(fighter, statusId)) return fighter;
  const attackScale = effectValue(definition, 'attackScale');
  const speedScale = effectValue(definition, 'speedScale');
  return {
    ...fighter,
    statuses: fighter.statuses.filter((status) => status.statusId !== statusId),
    attack: attackScale === 1 ? fighter.attack : Math.round(fighter.attack / attackScale),
    speed: speedScale === 1 ? fighter.speed : round(fighter.speed / speedScale, 4),
  };
}

export function consumeStatus(
  fighter: Fighter,
  statusId: string,
  requestedStacks: number,
): { fighter: Fighter; consumedStacks: number; fulfilled: boolean } {
  const instance = getStatus(fighter, statusId);
  const stacks = Math.max(1, Math.round(requestedStacks));
  if (!instance || instance.stacks < stacks) return { fighter, consumedStacks: 0, fulfilled: false };
  const remainingStacks = instance.stacks - stacks;
  return {
    fighter:
      remainingStacks > 0
        ? {
            ...fighter,
            statuses: fighter.statuses.map((status) =>
              status.statusId === statusId ? { ...status, stacks: remainingStacks } : status,
            ),
          }
        : removeStatus(fighter, statusId),
    consumedStacks: stacks,
    fulfilled: true,
  };
}

export function clearActionStatuses(fighter: Fighter): Fighter {
  return fighter.statuses.reduce(
    (next, status) =>
      requireStatusDefinition(status.statusId).clearOnAction ? removeStatus(next, status.statusId) : next,
    fighter,
  );
}

export function tickStatusDurations(fighter: Fighter, dt: number): Fighter {
  return fighter.statuses.reduce((next, status) => {
    const remainingSeconds = status.remainingSeconds === null ? null : Math.max(0, status.remainingSeconds - dt);
    if (remainingSeconds !== null && remainingSeconds <= 0) return removeStatus(next, status.statusId);
    const tickAccumulatorSeconds =
      statusDamagePerSecond(status.statusId) > 0 ? (status.tickAccumulatorSeconds ?? 0) + dt : undefined;
    return {
      ...next,
      statuses: next.statuses.map((candidate) =>
        candidate.statusId === status.statusId
          ? {
              ...candidate,
              remainingSeconds,
              ...(tickAccumulatorSeconds === undefined ? {} : { tickAccumulatorSeconds }),
            }
          : candidate,
      ),
    };
  }, fighter);
}

export function statusEffectMultiplier(fighter: Pick<Fighter, 'statuses'>, kind: StatusEffectKind): number {
  return fighter.statuses.reduce((multiplier, status) => {
    const definition = requireStatusDefinition(status.statusId);
    return multiplier * effectValue(definition, kind);
  }, 1);
}

export function statusVisualClasses(fighter: Pick<Fighter, 'statuses'>): string {
  return fighter.statuses.map((status) => requireStatusDefinition(status.statusId).visual.className).join(' ');
}

export function statusCardClasses(fighter: Pick<Fighter, 'statuses'>): string {
  return fighter.statuses.map((status) => requireStatusDefinition(status.statusId).visual.cardClass).join(' ');
}

export const activeStatusDetails = (fighter: Pick<Fighter, 'statuses'>) =>
  fighter.statuses.map((instance) => ({ instance, definition: requireStatusDefinition(instance.statusId) }));
