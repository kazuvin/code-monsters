import { describe, expect, it } from 'vitest';
import { GAME_DATA, validateGameData } from './game-data';

describe('DQM run game data', () => {
  it('expands the validation catalog to 45 monsters', () => {
    expect(GAME_DATA.monsters).toHaveLength(45);
    expect(new Set(GAME_DATA.monsters.map((monster) => monster.id)).size).toBe(45);
    expect(new Set(GAME_DATA.monsters.map((monster) => monster.name)).size).toBe(45);
  });

  it('contains every lineage, attribute, and white-star combination', () => {
    for (const lineage of GAME_DATA.lineages) {
      for (const attribute of GAME_DATA.attributes) {
        for (let whiteStars = 1; whiteStars <= 5; whiteStars += 1) {
          expect(
            GAME_DATA.monsters.some(
              (monster) =>
                monster.lineageId === lineage.id &&
                monster.attributeId === attribute.id &&
                monster.whiteStars === whiteStars,
            ),
          ).toBe(true);
        }
      }
    }
  });

  it('passes referential and tuning validation', () => {
    expect(validateGameData(GAME_DATA)).toEqual([]);
  });

  it('rejects an invalid minimum breeding rank', () => {
    const invalid = structuredClone(GAME_DATA);
    invalid.rules.breeding.minimumResultWhiteStars = 0 as typeof invalid.rules.breeding.minimumResultWhiteStars;

    expect(validateGameData(invalid)).toContain('breeding.minimumResultWhiteStars must be between 1 and 5');
  });
});
