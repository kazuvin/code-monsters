import {
  BATTLE_CONFIG,
  DEFAULT_PROGRAMS,
  DEFAULT_REACTIONS,
  EQUIPMENT,
  ENCOUNTERS,
  ROSTER_CONFIG,
  UNITS,
  type EncounterDefinition,
} from '../data.ts';
import type { EquipmentDefinition, EquipmentSlot, Fighter, UnitDefinition, UnitInventoryItem } from '../types.ts';
import { instructionById } from './rules.ts';

export const unitById = new Map(UNITS.map((unit) => [unit.id, unit]));
export const equipmentById = new Map(EQUIPMENT.map((equipment) => [equipment.id, equipment]));

const equipmentSlots: EquipmentSlot[] = ['frame', 'weapon', 'chip'];

export function equipmentLoadout(equipmentIds: string[]): EquipmentDefinition[] {
  return equipmentIds.map((id) => equipmentById.get(id)).filter((item) => item !== undefined);
}

export function equipmentForSlot(equipmentIds: string[], slot: EquipmentSlot): EquipmentDefinition | undefined {
  return equipmentLoadout(equipmentIds).find((equipment) => equipment.slot === slot);
}

export function equipmentActionIds(equipmentIds: string[]): string[] {
  return [...new Set(equipmentLoadout(equipmentIds).flatMap((equipment) => equipment.grantsActionIds))];
}

export function applyEquipment(unit: UnitDefinition, equipmentIds: string[]): UnitDefinition {
  const equipment = equipmentLoadout(equipmentIds);
  type NumericModifier = Exclude<keyof EquipmentDefinition['modifiers'], 'attackType'>;
  const sum = (key: NumericModifier) =>
    equipment.reduce((total, item) => total + (Number(item.modifiers[key]) || 0), 0);
  return {
    ...unit,
    maxHp: Math.max(1, Math.round(unit.maxHp + sum('maxHp'))),
    attack: Math.max(0, Math.round(unit.attack + sum('attack'))),
    defense: Math.max(0, Math.round(unit.defense + sum('defense'))),
    speed: Math.max(0.1, Number((unit.speed + sum('speed')).toFixed(2))),
    range: Math.max(1, Number((unit.range + sum('range')).toFixed(2))),
    knockbackPower: Math.max(0, Number((unit.knockbackPower + sum('knockbackPower')).toFixed(2))),
    weight: Math.max(1, Number((unit.weight + sum('weight')).toFixed(2))),
    programLimit: Math.max(1, Math.round(unit.programLimit + sum('programLimit'))),
    attackType:
      [...equipment].reverse().find((item) => item.modifiers.attackType)?.modifiers.attackType ?? unit.attackType,
  };
}

export function createInventoryUnit(
  unitId: string,
  inventoryId: string,
  equipmentIds: string[] = ROSTER_CONFIG.startingEquipmentIds,
): UnitInventoryItem {
  const unit = unitById.get(unitId);
  if (!unit) throw new Error(`Unknown unit: ${unitId}`);
  const equipped = equipmentSlots
    .map((slot) => equipmentForSlot(equipmentIds, slot)?.id)
    .filter((id) => id !== undefined);
  const configured = applyEquipment(unit, equipped);
  const equipmentReaction = equipmentLoadout(equipped).find((item) => item.defaultReaction)?.defaultReaction ?? null;
  return {
    ...configured,
    inventoryId,
    equipmentIds: equipped,
    program: (DEFAULT_PROGRAMS[unitId] ?? ROSTER_CONFIG.startingActionIds).map((actionId) => ({
      actionId,
      conditionId: instructionById.get(actionId)?.condition ?? 'always',
      targetId: instructionById.get(actionId)?.defaultTarget ?? 'nearestEnemy',
      fixedAction: instructionById.get(actionId)?.fixedFor === unit.id,
    })),
    reaction: equipmentReaction
      ? { ...equipmentReaction }
      : DEFAULT_REACTIONS[unitId]
        ? { ...DEFAULT_REACTIONS[unitId]! }
        : null,
  };
}

export function equipInventoryUnit(unit: UnitInventoryItem, equipmentId: string): UnitInventoryItem {
  const equipment = equipmentById.get(equipmentId);
  const definition = unitById.get(unit.id);
  if (!equipment || !definition) return unit;
  const equipmentIds = [
    ...unit.equipmentIds.filter((id) => equipmentById.get(id)?.slot !== equipment.slot),
    equipment.id,
  ];
  const configured = applyEquipment(definition, equipmentIds);
  const grantedActions = new Set(equipmentActionIds(equipmentIds));
  const reaction = grantedActions.has(unit.reaction?.actionId ?? '')
    ? unit.reaction
    : equipment.defaultReaction
      ? { ...equipment.defaultReaction }
      : null;
  return {
    ...unit,
    ...configured,
    equipmentIds,
    program: unit.program.slice(0, configured.programLimit),
    reaction,
  };
}

export function createBattleFighters(
  team: UnitInventoryItem[],
  encounter: EncounterDefinition = ENCOUNTERS[0],
): Fighter[] {
  const enemies = (encounter?.enemyUnitIds ?? ROSTER_CONFIG.enemyUnitIds).map((id, index) => {
    const enemy = createInventoryUnit(id, `enemy-template-${id}-${index}`, encounter.enemyEquipmentIds);
    return {
      ...enemy,
      program: encounter.enemyProgramActionIds.map((actionId) => ({
        actionId,
        conditionId: instructionById.get(actionId)?.condition ?? 'always',
        targetId: instructionById.get(actionId)?.defaultTarget ?? 'nearestEnemy',
      })),
      reaction: encounter.enemyReaction ? { ...encounter.enemyReaction } : null,
    };
  });
  const enemyStatScale = encounter?.enemyStatScale ?? 1;
  const baseState = {
    z: 0,
    abilityGauge: BATTLE_CONFIG.abilityGaugeInitial,
    instructionCooldowns: {},
    reactionCooldown: 0,
    statuses: [],
  };
  return [
    ...team.map((unit, index) => ({
      ...unit,
      ...baseState,
      instanceId: unit.inventoryId,
      team: 'ally' as const,
      hp: unit.maxHp,
      x: BATTLE_CONFIG.wallLeft + BATTLE_CONFIG.initialPositionInset + index * BATTLE_CONFIG.teamPositionSpacing,
      actionLock: index * BATTLE_CONFIG.initialActionLockStaggerSeconds,
    })),
    ...enemies.map((unit, index) => ({
      ...unit,
      maxHp: Math.round(unit.maxHp * enemyStatScale),
      attack: Math.round(unit.attack * enemyStatScale),
      defense: Math.round(unit.defense * enemyStatScale),
      ...baseState,
      instanceId: `enemy-${unit.inventoryId}`,
      team: 'enemy' as const,
      hp: Math.round(unit.maxHp * enemyStatScale),
      x: BATTLE_CONFIG.wallRight - BATTLE_CONFIG.initialPositionInset - index * BATTLE_CONFIG.teamPositionSpacing,
      actionLock: index * BATTLE_CONFIG.initialActionLockStaggerSeconds + BATTLE_CONFIG.enemyActionLockOffsetSeconds,
    })),
  ];
}
