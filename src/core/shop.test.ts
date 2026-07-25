import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { createShop } from './shop';

describe('oddity shop offers', () => {
  it('can place economy and experience oddities in the normal three-slot shop', () => {
    const offerIds = createShop(GAME_DATA, 1).monsters.map((offer) => offer?.definitionId);

    expect(offerIds).toContain('buried-mole-1');
    expect(offerIds).toContain('study-owl-1');
  });

  it('only promotes the mystery egg to its defined rank-two form', () => {
    const offers = createShop(GAME_DATA, 48, 1).monsters.filter((offer): offer is NonNullable<typeof offer> =>
      Boolean(offer),
    );
    const egg = offers.find((offer) => offer.definitionId === 'mystery-egg-2');

    expect(egg).toMatchObject({ definitionId: 'mystery-egg-2', lucky: true });
    expect(
      offers.every((offer) => {
        const definition = GAME_DATA.monsters.find((monster) => monster.id === offer.definitionId);
        return definition?.kind === 'standard' || definition?.archetypeId === 'mystery-egg';
      }),
    ).toBe(true);
  });
});
