import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { createShop } from './shop';

describe('rare shop offers', () => {
  it('can place economy and experience monsters in the normal three-slot shop', () => {
    const offerIds = createShop(GAME_DATA, 24).monsters.map((offer) => offer?.definitionId);

    expect(offerIds).toContain('buried-mole-1');
    expect(offerIds).toContain('study-owl-1');
  });

  it('only promotes the mystery egg to its defined rank-two form', () => {
    const offers = createShop(GAME_DATA, 1, 1).monsters.filter((offer): offer is NonNullable<typeof offer> =>
      Boolean(offer),
    );
    const egg = offers.find((offer) => offer.definitionId === 'mystery-egg-2');

    expect(egg).toMatchObject({ definitionId: 'mystery-egg-2', lucky: true });
    const standaloneIds = new Set(GAME_DATA.standaloneMonsters.map((monster) => monster.id));
    expect(
      offers
        .filter((offer) => offer.lucky && standaloneIds.has(offer.definitionId))
        .every((offer) => offer.definitionId === 'mystery-egg-2'),
    ).toBe(true);
  });
});
