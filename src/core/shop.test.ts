import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { createShop } from './shop';

describe('shop', () => {
  it('stocks only shop species and never sells breeding-only results', () => {
    const breedingOnlyIds = new Set(
      GAME_DATA.monsters.filter((monster) => monster.shopAvailability === 'breeding-only').map((monster) => monster.id),
    );
    const offers = Array.from({ length: 40 }, (_, seed) => createShop(GAME_DATA, seed).monsters).flat();

    expect(offers.filter(Boolean).length).toBeGreaterThan(0);
    expect(offers.every((offer) => !offer || !breedingOnlyIds.has(offer.definitionId))).toBe(true);
  });

  it('uses the configured rarity weights when stocking equipment', () => {
    const legendaryOnly = structuredClone(GAME_DATA);
    legendaryOnly.rules.shop.equipmentSlots = 1;
    legendaryOnly.rules.shop.equipmentRarityWeights = { common: 0, rare: 0, epic: 0, legendary: 1 };

    const offer = createShop(legendaryOnly, 42).equipment[0];
    const equipment = legendaryOnly.equipment.find((entry) => entry.id === offer?.equipmentId);

    expect(equipment?.rarity).toBe('legendary');
  });
});
