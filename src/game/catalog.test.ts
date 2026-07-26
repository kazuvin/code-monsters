import { describe, expect, it } from 'vitest';
import { GAME_DATA, validateGameData } from './game-data';

describe('DQM run game data', () => {
  it('keeps the validation catalog at 45 species and adds six oddity definitions', () => {
    const catalogMonsters = GAME_DATA.monsters.filter((monster) => monster.kind === 'standard');
    const oddities = GAME_DATA.monsters.filter((monster) => monster.kind === 'oddity');

    expect(catalogMonsters).toHaveLength(45);
    expect(oddities).toHaveLength(6);
    expect(new Set(GAME_DATA.monsters.map((monster) => monster.id)).size).toBe(51);
    expect(new Set(GAME_DATA.monsters.map((monster) => monster.name)).size).toBe(51);
    expect(GAME_DATA.monsters.find((monster) => monster.id === 'coin-crow-1')?.breedingMode).toBe('same-name-only');
    expect(GAME_DATA.monsters.find((monster) => monster.id === 'study-owl-1')?.breedingMode).toBe('same-name-only');
    expect(GAME_DATA.monsters.find((monster) => monster.id === 'slumbering-grove-1')?.roleTagIds).toContain(
      'late-bloom',
    );
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

  it('treats every white-star step as a distinct species instead of a renamed stat tier', () => {
    for (const archetype of GAME_DATA.archetypes) {
      const species = GAME_DATA.monsters.filter((monster) => monster.archetypeId === archetype.id);
      const skillLoadouts = species.map((monster) =>
        [...monster.intrinsicSkillIds, monster.defaultSkillId].sort().join('|'),
      );

      expect(species, archetype.id).toHaveLength(5);
      expect(new Set(species.map((monster) => monster.glyph)).size, `${archetype.id} silhouette`).toBe(5);
      expect(new Set(species.map((monster) => monster.appearance.attire)).size, `${archetype.id} attire`).toBe(5);
      expect(new Set(skillLoadouts).size, `${archetype.id} skill loadout`).toBe(5);
      expect(new Set(species.map((monster) => monster.traitId)).size, `${archetype.id} trait`).toBe(5);
    }
  });

  it('passes referential and tuning validation', () => {
    expect(validateGameData(GAME_DATA)).toEqual([]);
  });

  it('has enough route-changing support content for repeated casual runs', () => {
    expect(GAME_DATA.events.length).toBeGreaterThanOrEqual(9);
    expect(GAME_DATA.equipment.length).toBeGreaterThanOrEqual(12);
    expect(GAME_DATA.specialRecipes.length).toBeGreaterThanOrEqual(9);
  });

  it('rejects an invalid minimum breeding rank', () => {
    const invalid = structuredClone(GAME_DATA);
    invalid.rules.breeding.minimumResultWhiteStars = 0 as typeof invalid.rules.breeding.minimumResultWhiteStars;

    expect(validateGameData(invalid)).toContain('breeding.minimumResultWhiteStars must be between 1 and 5');
  });
});
