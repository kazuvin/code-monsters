import { describe, expect, it } from 'vitest';
import { GAME_DATA, validateGameData } from './game-data';

describe('DQM run game data', () => {
  it('keeps the 27 MVP lineage-grid species and seven ordinary standalone species without a monster-kind category', () => {
    const lineageGridIds = new Set(GAME_DATA.archetypes.map((archetype) => archetype.id));
    const lineageGridMonsters = GAME_DATA.monsters.filter((monster) => lineageGridIds.has(monster.archetypeId));

    expect(GAME_DATA.rules.maxWhiteStars).toBe(3);
    expect(lineageGridMonsters).toHaveLength(27);
    expect(GAME_DATA.standaloneMonsters).toHaveLength(7);
    expect(new Set(GAME_DATA.monsters.map((monster) => monster.id)).size).toBe(34);
    expect(new Set(GAME_DATA.monsters.map((monster) => monster.name)).size).toBe(34);
    expect(GAME_DATA.monsters.every((monster) => monster.whiteStars <= GAME_DATA.rules.maxWhiteStars)).toBe(true);
    expect(GAME_DATA.monsters.every((monster) => !('kind' in monster) && !('breedingMode' in monster))).toBe(true);
    expect(GAME_DATA.monsters.find((monster) => monster.id === 'slumbering-grove-1')?.roleTagIds).toContain(
      'late-bloom',
    );
    expect(GAME_DATA.monsters.find((monster) => monster.id === 'training-lynx-1')).toMatchObject({
      lineageId: 'demon',
      attributeId: 'fire',
      whiteStars: 1,
    });
  });

  it('keeps attack rewards on skills and the owl end-of-battle experience on its trait', () => {
    const coinSkill = GAME_DATA.skills.find((skill) => skill.id === 'coin-snatch');
    const trainingSkill = GAME_DATA.skills.find((skill) => skill.id === 'training-pounce');
    const owlSkill = GAME_DATA.skills.find((skill) => skill.id === 'study-lantern');
    const owl = GAME_DATA.monsters.find((monster) => monster.id === 'study-owl-1');
    const owlTrait = GAME_DATA.traits.find((trait) => trait.id === owl?.traitId);

    expect(coinSkill?.runReward?.kind).toBe('coins-per-damage-action');
    expect(trainingSkill?.runReward?.kind).toBe('xp-per-damage-action');
    expect(owlSkill?.runReward).toBeUndefined();
    expect(owlTrait?.stages.map((stage) => stage.postBattleXpAura)).toEqual([
      { amount: 2, activatesFromBench: false, targets: 'active' },
      { amount: 2, activatesFromBench: true, targets: 'active' },
      { amount: 2, activatesFromBench: true, targets: 'roster' },
    ]);
  });

  it('contains every lineage, attribute, and white-star combination', () => {
    for (const lineage of GAME_DATA.lineages) {
      for (const attribute of GAME_DATA.attributes) {
        for (let whiteStars = 1; whiteStars <= GAME_DATA.rules.maxWhiteStars; whiteStars += 1) {
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

      expect(species, archetype.id).toHaveLength(GAME_DATA.rules.maxWhiteStars);
      expect(new Set(species.map((monster) => monster.glyph)).size, `${archetype.id} silhouette`).toBe(
        GAME_DATA.rules.maxWhiteStars,
      );
      expect(new Set(species.map((monster) => monster.appearance.attire)).size, `${archetype.id} attire`).toBe(
        GAME_DATA.rules.maxWhiteStars,
      );
      expect(new Set(skillLoadouts).size, `${archetype.id} skill loadout`).toBe(GAME_DATA.rules.maxWhiteStars);
      expect(new Set(species.map((monster) => monster.traitId)).size, `${archetype.id} trait`).toBe(
        GAME_DATA.rules.maxWhiteStars,
      );
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

  it('assigns every skill and equipment item to one of all four rarity tiers without adding event rarity', () => {
    const rarities = ['common', 'rare', 'epic', 'legendary'];

    expect([...new Set(GAME_DATA.skills.map((skill) => skill.rarity))].sort()).toEqual([...rarities].sort());
    expect([...new Set(GAME_DATA.equipment.map((equipment) => equipment.rarity))].sort()).toEqual([...rarities].sort());
    expect(GAME_DATA.events.every((event) => !('rarity' in event))).toBe(true);
    expect(GAME_DATA.rules.shop.equipmentRarityWeights).toEqual({
      common: 55,
      rare: 28,
      epic: 13,
      legendary: 4,
    });
    expect(GAME_DATA.equipment.every((equipment) => /\p{Extended_Pictographic}/u.test(equipment.icon))).toBe(true);
  });

  it('rejects an invalid minimum breeding rank', () => {
    const invalid = structuredClone(GAME_DATA);
    invalid.rules.breeding.minimumResultWhiteStars = 0 as typeof invalid.rules.breeding.minimumResultWhiteStars;

    expect(validateGameData(invalid)).toContain('breeding.minimumResultWhiteStars must be between 1 and maxWhiteStars');
  });
});
