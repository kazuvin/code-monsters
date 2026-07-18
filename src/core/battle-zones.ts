import { BATTLE_CONFIG, BATTLE_ZONES } from '../data.ts';
import type { BattleZoneDefinition, BattleZoneInstance, Fighter, PlaceZoneEffect } from '../types.ts';
import { applyStatus } from './statuses.ts';

export type ZoneTrigger = { zoneId: string; fighterId: string };
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
  const definition = battleZoneById.get(effect.zoneId);
  if (!definition) throw new Error(`Unknown battle zone: ${effect.zoneId}`);
  const anchor = effect.anchor === 'target' ? target.x : actor.x;
  const direction = target.x >= actor.x ? 1 : -1;
  const x = Math.max(BATTLE_CONFIG.wallLeft, Math.min(BATTLE_CONFIG.wallRight, anchor + direction * effect.offset));
  return {
    instanceId: `${effect.zoneId}:${actor.instanceId}:${Math.round(elapsed * 1000)}`,
    zoneId: effect.zoneId,
    x,
    remainingSeconds: definition.durationSeconds,
    sourceId: actor.instanceId,
    sourceTeam: actor.team,
  };
};

const canAffect = (fighter: Fighter, zone: BattleZoneInstance, definition: BattleZoneDefinition) =>
  definition.targetFilter === 'any' ||
  (definition.targetFilter === 'ally' && fighter.team === zone.sourceTeam) ||
  (definition.targetFilter === 'enemy' && fighter.team !== zone.sourceTeam);

export const pathEntersZone = (fromX: number, toX: number, zoneX: number, radius: number): boolean => {
  const wasInside = Math.abs(fromX - zoneX) <= radius;
  if (wasInside) return false;
  const low = Math.min(fromX, toX);
  const high = Math.max(fromX, toX);
  return high >= zoneX - radius && low <= zoneX + radius;
};

export const applyZoneEntries = (
  fighter: Fighter,
  fromX: number,
  toX: number,
  zones: BattleZoneInstance[],
  includeCurrentPosition = false,
): { fighter: Fighter; triggers: ZoneTrigger[] } => {
  let affected = fighter;
  const triggers: ZoneTrigger[] = [];
  for (const zone of zones) {
    const definition = battleZoneById.get(zone.zoneId);
    if (!definition || !canAffect(affected, zone, definition)) continue;
    const entered = includeCurrentPosition
      ? Math.abs(toX - zone.x) <= definition.radius
      : pathEntersZone(fromX, toX, zone.x, definition.radius);
    if (!entered) continue;
    for (const effect of definition.trigger.effects) {
      affected = applyStatus(affected, effect.statusId, {
        stacks: effect.stacks,
        remainingSeconds: effect.durationSeconds ?? null,
        sourceId: zone.sourceId,
        targetId: affected.instanceId,
      });
    }
    triggers.push({ zoneId: zone.instanceId, fighterId: affected.instanceId });
  }
  return { fighter: affected, triggers };
};
