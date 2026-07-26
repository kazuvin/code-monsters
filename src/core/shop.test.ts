import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { createShop } from './shop';

describe('rare shop offers', () => {
  it('can place economy and experience monsters in the normal three-slot shop', () => {
    const offerIds = createShop(GAME_DATA, 24).monsters.map((offer) => offer?.definitionId);

    expect(offerIds).toContain('buried-mole-1');
    expect(offerIds).toContain('study-owl-1');
  });

  it('does not stock the rank-two egg through lucky shop promotion', () => {
    const offers = createShop(GAME_DATA, 1, 1).monsters.filter((offer): offer is NonNullable<typeof offer> =>
      Boolean(offer),
    );

    expect(offers.every((offer) => offer.definitionId !== 'mystery-egg-2')).toBe(true);
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
