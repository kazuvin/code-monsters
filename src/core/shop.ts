import { EQUIPMENT, INSTRUCTIONS, ROSTER_CONFIG, SHOP_CONFIG } from '../data.ts';
import type { Rarity } from '../types.ts';

export type ShopItem = {
  key: string;
  slot: number;
  kind: 'equipment' | 'instruction';
  id: string;
  locked: boolean;
};

const shopInstructions = INSTRUCTIONS.filter(
  (instruction) =>
    !instruction.fixedFor &&
    !instruction.reactionOnly &&
    instruction.price > 0 &&
    !ROSTER_CONFIG.startingActionIds.includes(instruction.id) &&
    !EQUIPMENT.some((equipment) => equipment.grantsActionIds.includes(instruction.id)),
);
const shopEquipment = EQUIPMENT.filter(
  (equipment) => equipment.price > 0 && !ROSTER_CONFIG.startingEquipmentIds.includes(equipment.id),
);

const seededRandom = (seed: number) => {
  const x = Math.sin(seed * 999.7 + 17.13) * 10000;
  return x - Math.floor(x);
};

const weightedPick = <T extends { rarity: Rarity }>(items: T[], seed: number): T => {
  if (items.length === 0) throw new Error('Shop candidate pool is empty');
  const total = items.reduce((sum, item) => sum + SHOP_CONFIG.rarityWeights[item.rarity], 0);
  let cursor = seededRandom(seed) * total;
  for (const item of items) {
    cursor -= SHOP_CONFIG.rarityWeights[item.rarity];
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
};

export function createShop(seed = 0, current: ShopItem[] = [], ownedEquipmentIds: string[] = []): ShopItem[] {
  const retainedBySlot = new Map(current.filter((item) => item.locked).map((item) => [item.slot, item]));
  const usedIds = new Set<string>();
  return Array.from({ length: SHOP_CONFIG.size }, (_, index): ShopItem => {
    const retained = retainedBySlot.get(index);
    if (retained && !usedIds.has(retained.id)) {
      usedIds.add(retained.id);
      return retained;
    }
    const kind = SHOP_CONFIG.equipmentSlots.includes(index) ? ('equipment' as const) : ('instruction' as const);
    const candidates = (kind === 'equipment' ? shopEquipment : shopInstructions).filter(
      (item) => !usedIds.has(item.id) && (kind !== 'equipment' || !ownedEquipmentIds.includes(item.id)),
    );
    const id = weightedPick(candidates, seed * 17 + index * 13 + 5).id;
    usedIds.add(id);
    return { key: `${seed}-${index}`, slot: index, kind, id, locked: false };
  });
}
