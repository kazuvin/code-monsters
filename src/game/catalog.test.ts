import { describe, expect, it } from 'vitest';
import { GAME_DATA, validateGameData } from './game-data';

describe('game content catalog', () => {
  it('is internally valid and keeps the 45-species lineage/attribute catalog', () => {
    expect(validateGameData(GAME_DATA)).toEqual([]);
    const gridIds = new Set(GAME_DATA.archetypes.map((archetype) => archetype.id));
    const grid = GAME_DATA.monsters.filter((monster) => gridIds.has(monster.archetypeId));

    expect(grid).toHaveLength(45);
    expect(grid.filter((monster) => monster.shopAvailability === 'common')).toHaveLength(18);
    expect(grid.filter((monster) => monster.shopAvailability === 'breeding-only')).toHaveLength(27);
    expect(new Set(grid.map((monster) => monster.name)).size).toBe(45);
  });

  it('defines a fixed trait and three unique native skills for every species', () => {
    for (const monster of GAME_DATA.monsters) {
      const trait = GAME_DATA.traits.find((entry) => entry.id === monster.traitId);
      const skills = [...monster.intrinsicSkillIds, monster.defaultSkillId];
      expect(trait, monster.id).toMatchObject({ id: monster.traitId, battleStartEffects: expect.any(Array) });
      expect(trait, monster.id).not.toHaveProperty('stages');
      expect(new Set(skills).size, monster.id).toBe(3);
      expect(
        skills.every((skillId) => GAME_DATA.skills.some((skill) => skill.id === skillId)),
        monster.id,
      ).toBe(true);
    }
  });

  it('gives every breeding-only species exactly two authored routes from shop species', () => {
    const breedingOnly = GAME_DATA.monsters.filter((monster) => monster.shopAvailability === 'breeding-only');
    const shopIds = new Set(
      GAME_DATA.monsters.filter((monster) => monster.shopAvailability === 'common').map((monster) => monster.id),
    );

    for (const child of breedingOnly) {
      const recipes = GAME_DATA.specialRecipes.filter((recipe) => recipe.resultDefinitionId === child.id);
      expect(recipes, child.id).toHaveLength(2);
      expect(
        recipes.every((recipe) => recipe.parentDefinitionIds.every((id) => shopIds.has(id))),
        child.id,
      ).toBe(true);
    }
  });

  it('contains no star, level, experience, growth, or hatch rules', () => {
    const serialized = JSON.stringify(GAME_DATA);
    for (const retired of [
      'whiteStars',
      'colorStars',
      'maxLevel',
      'experienceProfiles',
      'statGrowthProfiles',
      'cyclesHeld',
      'hatch',
    ]) {
      expect(serialized).not.toContain(`"${retired}"`);
    }
  });
});
