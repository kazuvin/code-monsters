import { BATTLE_CONFIG, BATTLE_ZONES } from '../data.ts';
import type {
  BattleZoneDefinition,
  BattleZoneInstance,
  BattleZoneTriggerKind,
  Fighter,
  PlaceZoneEffect,
} from '../types.ts';
import { applyStatus } from './statuses.ts';

export type ZoneTrigger = { zoneId: string; fighterId: string; kind: BattleZoneTriggerKind };
export type BattleZoneChange = { kind: 'add'; zone: BattleZoneInstance } | { kind: 'remove'; zoneId: string };

export const battleZoneById = new Map(BATTLE_ZONES.map((zone) => [zone.id, zone]));

export const tickBattleZones = (zones: BattleZoneInstance[], dt: number): BattleZoneInstance[] =>
  zones
    .map((zone) => ({ ...zone, remainingSeconds: Math.max(0, zone.remainingSeconds - dt) }))
    .filter((zone) => zone.remainingSeconds > 0);

export const applyBattleZoneChanges = (
  zones: BattleZoneInstance[],
  changes: BattleZoneChange[] = [],
): BattleZoneInstance[] =>
  changes.reduce<BattleZoneInstance[]>((current, change) => {
    if (change.kind === 'remove') return current.filter((zone) => zone.instanceId !== change.zoneId);
    return [...current.filter((zone) => zone.instanceId !== change.zone.instanceId), change.zone];
  }, zones);

export const createBattleZone = (
  effect: PlaceZoneEffect,
  actor: Fighter,
  target: Fighter,
  elapsed: number,
): BattleZoneInstance => {
  const anchor = effect.anchor === 'target' ? target : actor;
  const direction = target.x >= actor.x ? 1 : -1;
  const x = Math.max(BATTLE_CONFIG.wallLeft, Math.min(BATTLE_CONFIG.wallRight, anchor.x + direction * effect.offsetX));
  const y = Math.max(BATTLE_CONFIG.floorY, Math.min(BATTLE_CONFIG.ceilingY, anchor.y + effect.offsetY));
  return createBattleZoneAt(effect, actor, x, y, elapsed);
};

export const createBattleZoneAt = (
  effect: PlaceZoneEffect,
  actor: Fighter,
  x: number,
  y: number,
  elapsed: number,
): BattleZoneInstance => {
  const definition = battleZoneById.get(effect.zoneId);
  if (!definition) throw new Error(`Unknown battle zone: ${effect.zoneId}`);
  const clampedX = Math.max(BATTLE_CONFIG.wallLeft, Math.min(BATTLE_CONFIG.wallRight, x));
  const clampedY = Math.max(BATTLE_CONFIG.floorY, Math.min(BATTLE_CONFIG.ceilingY, y));
  return {
    instanceId: `${effect.zoneId}:${actor.instanceId}:${Math.round(elapsed * 1000)}:${Math.round(clampedX * 100)}`,
    zoneId: effect.zoneId,
    x: clampedX,
    y: clampedY,
    remainingSeconds: definition.durationSeconds,
    sourceId: actor.instanceId,
    sourceTeam: actor.team,
  };
};

const canAffect = (fighter: Fighter, zone: BattleZoneInstance, definition: BattleZoneDefinition) =>
  definition.targetFilter === 'any' ||
  (definition.targetFilter === 'ally' && fighter.team === zone.sourceTeam) ||
  (definition.targetFilter === 'enemy' && fighter.team !== zone.sourceTeam);

const isInsideZone = (fighter: Fighter, zone: BattleZoneInstance, radius: number) =>
  Math.hypot(fighter.x - zone.x, fighter.y - zone.y) <= radius;

const applyZoneEffects = (fighter: Fighter, zone: BattleZoneInstance, definition: BattleZoneDefinition) =>
  definition.trigger.effects.reduce(
    (affected, effect) =>
      applyStatus(affected, effect.statusId, {
        stacks: effect.stacks,
        remainingSeconds: effect.durationSeconds ?? null,
        sourceId: zone.sourceId,
        targetId: affected.instanceId,
      }),
    fighter,
  );

export const pathEntersZone = (
  from: Pick<Fighter, 'x' | 'y'>,
  to: Pick<Fighter, 'x' | 'y'>,
  zone: Pick<BattleZoneInstance, 'x' | 'y'>,
  radius: number,
): boolean => {
  const wasInside = Math.hypot(from.x - zone.x, from.y - zone.y) <= radius;
  if (wasInside) return false;
  const segmentX = to.x - from.x;
  const segmentY = to.y - from.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (lengthSquared <= Number.EPSILON) return false;
  const projection = Math.max(
    0,
    Math.min(1, ((zone.x - from.x) * segmentX + (zone.y - from.y) * segmentY) / lengthSquared),
  );
  const closestX = from.x + segmentX * projection;
  const closestY = from.y + segmentY * projection;
  return Math.hypot(closestX - zone.x, closestY - zone.y) <= radius;
};

export const applyZoneEntries = (
  fighter: Fighter,
  from: Pick<Fighter, 'x' | 'y'>,
  to: Pick<Fighter, 'x' | 'y'>,
  zones: BattleZoneInstance[],
  includeCurrentPosition = false,
): { fighter: Fighter; triggers: ZoneTrigger[] } => {
  let affected = fighter;
  const triggers: ZoneTrigger[] = [];
  for (const zone of zones) {
    const definition = battleZoneById.get(zone.zoneId);
    if (!definition || definition.trigger.kind !== 'onEnter' || !canAffect(affected, zone, definition)) continue;
    const entered = includeCurrentPosition
      ? isInsideZone({ ...affected, ...to }, zone, definition.radius)
      : pathEntersZone(from, to, zone, definition.radius);
    if (!entered) continue;
    affected = applyZoneEffects(affected, zone, definition);
    triggers.push({ zoneId: zone.instanceId, fighterId: affected.instanceId, kind: definition.trigger.kind });
  }
  return { fighter: affected, triggers };
};

export const applyZoneActionTriggers = (
  fighter: Fighter,
  zones: BattleZoneInstance[],
): { fighter: Fighter; triggers: ZoneTrigger[] } => {
  let affected = fighter;
  const triggers: ZoneTrigger[] = [];
  for (const zone of zones) {
    const definition = battleZoneById.get(zone.zoneId);
    if (
      !definition ||
      definition.trigger.kind !== 'onActionWhileInside' ||
      !canAffect(affected, zone, definition) ||
      !isInsideZone(affected, zone, definition.radius)
    )
      continue;
    affected = applyZoneEffects(affected, zone, definition);
    triggers.push({ zoneId: zone.instanceId, fighterId: affected.instanceId, kind: definition.trigger.kind });
  }
  return { fighter: affected, triggers };
};
