import { createSeededRandom } from './rng';
import type { GameData, ShopState } from './types';

export function createShop(
  data: GameData,
  seed: number,
  luckyUpgradeChance = data.rules.shop.luckyUpgradeChance,
): ShopState {
  const random = createSeededRandom(seed);
  const common = data.monsters.filter((monster) => monster.shopAvailability === 'common' && monster.whiteStars === 1);
  const rare = data.monsters.filter((monster) => monster.shopAvailability === 'rare' && monster.whiteStars === 1);
  const counts = new Map<string, number>();
  const monsters = Array.from({ length: data.rules.shop.monsterSlots }, (_, index) => {
    const pool = rare.length > 0 && random.next() < data.rules.shop.rareOfferChance ? rare : common;
    let definition = random.pick(pool);
    for (let attempt = 0; attempt < 20 && (counts.get(definition.id) ?? 0) >= 2; attempt += 1) {
      definition = random.pick(pool);
    }
    let lucky = false;
    if (random.next() < Math.min(0.5, luckyUpgradeChance)) {
      const upgraded = data.monsters.find(
        (monster) => monster.archetypeId === definition.archetypeId && monster.whiteStars === definition.whiteStars + 1,
      );
      if (upgraded) {
        definition = upgraded;
        lucky = true;
      }
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
