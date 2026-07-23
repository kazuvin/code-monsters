import { createSeededRandom } from './rng';
import type { GameData, ShopState } from './types';

export function createShop(data: GameData, seed: number): ShopState {
  const random = createSeededRandom(seed);
  const rankOne = data.monsters.filter((monster) => monster.whiteStars === 1);
  const counts = new Map<string, number>();
  const monsters = Array.from({ length: data.rules.shop.monsterSlots }, (_, index) => {
    let definition = random.pick(rankOne);
    for (let attempt = 0; attempt < 20 && (counts.get(definition.id) ?? 0) >= 2; attempt += 1) {
      definition = random.pick(rankOne);
    }
    const lucky = random.next() < data.rules.shop.luckyUpgradeChance;
    if (lucky) {
      definition =
        data.monsters.find((monster) => monster.archetypeId === definition.archetypeId && monster.whiteStars === 2) ??
        definition;
    }
    counts.set(definition.id, (counts.get(definition.id) ?? 0) + 1);
    return {
      id: `monster-offer-${seed}-${index}`,
      definitionId: definition.id,
      lucky,
    };
  });
  const equipment = random
    .shuffle(data.equipment)
    .slice(0, data.rules.shop.equipmentSlots)
    .map((item, index) => ({
      id: `equipment-offer-${seed}-${index}`,
      equipmentId: item.id,
    }));
  return { seed, frozen: false, monsters, equipment };
}
