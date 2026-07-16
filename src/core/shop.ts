import { INSTRUCTIONS, ROSTER_CONFIG, SHOP_CONFIG, UNITS } from '../data.ts';
import type { Rarity } from '../types.ts';

export type ShopItem = { key: string; kind: 'unit' | 'instruction'; id: string; locked: boolean };

const shopInstructions = INSTRUCTIONS.filter(
  (instruction) => !instruction.fixedFor && !ROSTER_CONFIG.startingActionIds.includes(instruction.id),
);

const seededRandom = (seed: number) => {
  const x = Math.sin(seed * 999.7 + 17.13) * 10000;
  return x - Math.floor(x);
};

const weightedPick = <T extends { rarity: Rarity }>(items: T[], seed: number) => {
  const total = items.reduce((sum, item) => sum + SHOP_CONFIG.rarityWeights[item.rarity], 0);
  let cursor = seededRandom(seed) * total;
  for (const item of items) {
    cursor -= SHOP_CONFIG.rarityWeights[item.rarity];
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
};

export function createShop(seed = 0): ShopItem[] {
  const picks = Array.from({ length: SHOP_CONFIG.size }, (_, index) => {
    const kind = SHOP_CONFIG.unitSlots.includes(index) ? ('unit' as const) : ('instruction' as const);
    const id =
      kind === 'unit'
        ? weightedPick(UNITS, seed * 11 + index + 1).id
        : weightedPick(shopInstructions, seed * 13 + index + 5).id;
    return { kind, id };
  });
  if (seed === 0) {
    for (const pick of SHOP_CONFIG.initialPicks) picks[pick.slot] = { kind: pick.kind, id: pick.id };
  }
  return picks.map((pick, index) => ({ ...pick, key: `${seed}-${index}`, locked: false }));
}
