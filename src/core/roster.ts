import { BATTLE_CONFIG, DEFAULT_PROGRAMS, DEFAULT_REACTIONS, ROSTER_CONFIG, UNITS } from '../data.ts';
import type { Fighter, UnitInventoryItem } from '../types.ts';
import { instructionById } from './rules.ts';

export const unitById = new Map(UNITS.map((unit) => [unit.id, unit]));

export function createInventoryUnit(unitId: string, inventoryId: string): UnitInventoryItem {
  const unit = unitById.get(unitId);
  if (!unit) throw new Error(`Unknown unit: ${unitId}`);
  return {
    ...unit,
    inventoryId,
    program: (DEFAULT_PROGRAMS[unitId] ?? ROSTER_CONFIG.startingActionIds).map((actionId) => ({
      actionId,
      conditionId: instructionById.get(actionId)?.condition ?? 'always',
      targetId: instructionById.get(actionId)?.defaultTarget ?? 'currentEnemy',
      fixedAction: instructionById.get(actionId)?.fixedFor === unit.id,
    })),
    reaction: DEFAULT_REACTIONS[unitId] ? { ...DEFAULT_REACTIONS[unitId]! } : null,
  };
}

export function createBattleFighters(team: UnitInventoryItem[]): Fighter[] {
  const enemies = ROSTER_CONFIG.enemyUnitIds.map((id, index) =>
    createInventoryUnit(id, `enemy-template-${id}-${index}`),
  );
  const baseState = {
    z: 0,
    reactionCooldown: 0,
    guarded: false,
    guardDamageScale: 1,
    guardKnockbackScale: 1,
    berserk: false,
    poison: 0,
    tauntTargetId: null,
    tauntSeconds: 0,
  };
  return [
    ...team.map((unit, index) => ({
      ...unit,
      ...baseState,
      instanceId: unit.inventoryId,
      team: 'ally' as const,
      hp: unit.maxHp,
      x: BATTLE_CONFIG.wallLeft + BATTLE_CONFIG.initialPositionInset + index * BATTLE_CONFIG.teamPositionSpacing,
      cooldown: index * BATTLE_CONFIG.initialCooldownStaggerSeconds,
    })),
    ...enemies.map((unit, index) => ({
      ...unit,
      ...baseState,
      instanceId: `enemy-${unit.inventoryId}`,
      team: 'enemy' as const,
      hp: unit.maxHp,
      x: BATTLE_CONFIG.wallRight - BATTLE_CONFIG.initialPositionInset - index * BATTLE_CONFIG.teamPositionSpacing,
      cooldown: index * BATTLE_CONFIG.initialCooldownStaggerSeconds + BATTLE_CONFIG.enemyCooldownOffsetSeconds,
    })),
  ];
}
