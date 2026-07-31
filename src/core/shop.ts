import { createSeededRandom } from './rng';
import type { GameData, Rarity, ShopState } from './types';

const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export const pickEquipmentByRarity = (
  data: GameData,
  random: ReturnType<typeof createSeededRandom>,
  available: GameData['equipment'],
) => {
  const availableRarities = RARITIES.filter((rarity) => available.some((equipment) => equipment.rarity === rarity));
  const totalWeight = availableRarities.reduce(
    (total, rarity) => total + Math.max(0, data.rules.shop.equipmentRarityWeights[rarity]),
    0,
  );
  if (totalWeight <= 0) return random.pick(available);
  let roll = random.next() * totalWeight;
  let selectedRarity = availableRarities.at(-1) ?? 'common';
  for (const rarity of availableRarities) {
    roll -= Math.max(0, data.rules.shop.equipmentRarityWeights[rarity]);
    if (roll < 0) {
      selectedRarity = rarity;
      break;
    }
  }
  return random.pick(available.filter((equipment) => equipment.rarity === selectedRarity));
};

export function createShop(data: GameData, seed: number, rareOfferChance = data.rules.shop.rareOfferChance): ShopState {
  const random = createSeededRandom(seed);
  const common = data.monsters.filter((monster) => monster.shopAvailability === 'common' && monster.whiteStars === 1);
  const rare = data.monsters.filter((monster) => monster.shopAvailability === 'rare');
  const counts = new Map<string, number>();
  const monsters = Array.from({ length: data.rules.shop.monsterSlots }, (_, index) => {
    const pool = rare.length > 0 && random.next() < Math.min(1, rareOfferChance) ? rare : common;
    let definition = random.pick(pool);
    for (let attempt = 0; attempt < 20 && (counts.get(definition.id) ?? 0) >= 2; attempt += 1) {
      definition = random.pick(pool);
    }
    counts.set(definition.id, (counts.get(definition.id) ?? 0) + 1);
    return {
      id: `monster-offer-${seed}-${index}`,
      definitionId: definition.id,
    };
  });
  const availableEquipment = [...data.equipment];
  const equipment = Array.from(
    { length: Math.min(data.rules.shop.equipmentSlots, availableEquipment.length) },
    (_, index) => {
      const item = pickEquipmentByRarity(data, random, availableEquipment);
      availableEquipment.splice(
        availableEquipment.findIndex((equipment) => equipment.id === item.id),
        1,
      );
      return {
        id: `equipment-offer-${seed}-${index}`,
        equipmentId: item.id,
      };
    },
  );
  return { seed, frozen: false, monsters, equipment };
}
