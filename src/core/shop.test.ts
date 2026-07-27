import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { createShop } from './shop';

describe('rare shop offers', () => {
  it('can place economy and experience monsters in the normal three-slot shop', () => {
    const offerIds = createShop(GAME_DATA, 24).monsters.map((offer) => offer?.definitionId);

    expect(offerIds).toContain('buried-mole-1');
    expect(offerIds).toContain('study-owl-1');
  });

  it('stocks the rank-two egg directly in the rare shop pool', () => {
    const eggOnlyRare = structuredClone(GAME_DATA);
    for (const monster of eggOnlyRare.monsters) {
      if (monster.shopAvailability === 'rare') monster.shopAvailability = 'upgrade-only';
    }
    const rankTwoEgg = eggOnlyRare.monsters.find((monster) => monster.id === 'mystery-egg-2');
    if (!rankTwoEgg) throw new Error('Expected the rank-two egg definition');
    rankTwoEgg.shopAvailability = 'rare';
    eggOnlyRare.rules.shop.rareOfferChance = 1;

    const offers = createShop(eggOnlyRare, 1, 0).monsters.filter((offer): offer is NonNullable<typeof offer> =>
      Boolean(offer),
    );

    expect(GAME_DATA.monsters.find((monster) => monster.id === 'mystery-egg-2')?.shopAvailability).toBe('rare');
    expect(offers.every((offer) => offer.definitionId === 'mystery-egg-2')).toBe(true);
  });

  it('uses the configured rarity weights when stocking equipment', () => {
    const legendaryOnly = structuredClone(GAME_DATA);
    legendaryOnly.rules.shop.equipmentSlots = 1;
    legendaryOnly.rules.shop.equipmentRarityWeights = {
      common: 0,
      rare: 0,
      epic: 0,
      legendary: 1,
    };

    const offer = createShop(legendaryOnly, 42).equipment[0];
    const equipment = legendaryOnly.equipment.find((entry) => entry.id === offer?.equipmentId);

    expect(equipment?.rarity).toBe('legendary');
  });
});
