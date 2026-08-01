import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { breedMonsters, breedingSkillChoices, listBreedingCandidates } from './breeding';
import { createMonster, skillIdsFor } from './monster';

describe('instant synergy breeding', () => {
  it('removes star, level, experience, and maturation state from the playable data', () => {
    expect(GAME_DATA.rules).not.toHaveProperty('maxWhiteStars');
    expect(GAME_DATA.rules).not.toHaveProperty('maxLevel');
    expect(GAME_DATA.rules).not.toHaveProperty('breeding.minimumLevel');
    expect(GAME_DATA).not.toHaveProperty('experienceProfiles');
    expect(GAME_DATA).not.toHaveProperty('statGrowthProfiles');

    for (const definition of GAME_DATA.monsters) {
      expect(definition, definition.id).not.toHaveProperty('whiteStars');
      expect(definition, definition.id).not.toHaveProperty('growthPerLevel');
      expect(definition, definition.id).not.toHaveProperty('experienceProfileId');
      expect(definition, definition.id).not.toHaveProperty('statGrowthProfileId');
      expect(definition, definition.id).not.toHaveProperty('hatch');
    }

    const monster = createMonster(GAME_DATA, GAME_DATA.monsters[0]?.id ?? '', 'instant-monster');
    expect(monster).not.toHaveProperty('whiteStars');
    expect(monster).not.toHaveProperty('colorStars');
    expect(monster).not.toHaveProperty('level');
    expect(monster).not.toHaveProperty('xp');
    expect(monster).not.toHaveProperty('cyclesHeld');
    expect(monster.skillIds).toHaveLength(3);
  });

  it('keeps one fixed trait per species without trait stages', () => {
    for (const definition of GAME_DATA.monsters) {
      const trait = GAME_DATA.traits.find((entry) => entry.id === definition.traitId);
      expect(trait, definition.id).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        battleStartEffects: expect.any(Array),
      });
      expect(trait, definition.id).not.toHaveProperty('stages');
    }
  });

  it('offers only authored special breeding results and never invents a generic child', () => {
    const recipe = GAME_DATA.specialRecipes[0];
    if (!recipe) throw new Error('Expected a special breeding recipe');
    const first = createMonster(GAME_DATA, recipe.parentDefinitionIds[0], 'first');
    const second = createMonster(GAME_DATA, recipe.parentDefinitionIds[1], 'second');

    expect(listBreedingCandidates(GAME_DATA, first, second)).toContainEqual(
      expect.objectContaining({
        id: `special:${recipe.id}`,
        kind: 'special',
        recipeId: recipe.id,
        definitionId: recipe.resultDefinitionId,
      }),
    );

    const unrelatedPair = GAME_DATA.monsters
      .filter((monster) => monster.shopAvailability !== 'breeding-only')
      .flatMap((left, leftIndex, entries) => entries.slice(leftIndex + 1).map((right) => [left, right] as const))
      .find(
        ([left, right]) =>
          !GAME_DATA.specialRecipes.some(
            (entry) => entry.parentDefinitionIds.includes(left.id) && entry.parentDefinitionIds.includes(right.id),
          ),
      );
    if (!unrelatedPair) throw new Error('Expected an unrelated shop pair');
    const [unrelatedFirst, unrelatedSecond] = unrelatedPair;

    expect(
      listBreedingCandidates(
        GAME_DATA,
        createMonster(GAME_DATA, unrelatedFirst.id, 'unrelated-first'),
        createMonster(GAME_DATA, unrelatedSecond.id, 'unrelated-second'),
      ),
    ).toEqual([]);
  });

  it('lets the child choose exactly three unique skills from parent one, parent two, and its native skills', () => {
    const recipe = GAME_DATA.specialRecipes[0];
    if (!recipe) throw new Error('Expected a special breeding recipe');
    const candidate = {
      id: `special:${recipe.id}`,
      kind: 'special' as const,
      recipeId: recipe.id,
      definitionId: recipe.resultDefinitionId,
      label: '特殊配合',
    };
    const first = createMonster(GAME_DATA, recipe.parentDefinitionIds[0], 'skill-parent-one');
    const second = createMonster(GAME_DATA, recipe.parentDefinitionIds[1], 'skill-parent-two');
    const childDefinition = GAME_DATA.monsters.find((monster) => monster.id === recipe.resultDefinitionId);
    if (!childDefinition) throw new Error('Expected a child definition');

    const choices = breedingSkillChoices(GAME_DATA, first, second, candidate);
    const expectedChoices = new Set([
      ...skillIdsFor(GAME_DATA, first),
      ...skillIdsFor(GAME_DATA, second),
      ...childDefinition.intrinsicSkillIds,
      childDefinition.defaultSkillId,
    ]);
    expect(new Set(choices)).toEqual(expectedChoices);

    const selectedSkillIds = [...expectedChoices].slice(0, 3) as [string, string, string];
    const child = breedMonsters(GAME_DATA, first, second, candidate, selectedSkillIds, 'synergy-child');

    expect(child.definitionId).toBe(recipe.resultDefinitionId);
    expect(child.skillIds).toEqual(selectedSkillIds);
    expect(skillIdsFor(GAME_DATA, child)).toEqual(selectedSkillIds);
    expect(child).not.toHaveProperty('inheritedStats');
    expect(child).not.toHaveProperty('inheritedSkillId');
  });

  it('rejects incomplete, duplicate, or unrelated skill selections', () => {
    const recipe = GAME_DATA.specialRecipes[0];
    if (!recipe) throw new Error('Expected a special breeding recipe');
    const candidate = {
      id: `special:${recipe.id}`,
      kind: 'special' as const,
      recipeId: recipe.id,
      definitionId: recipe.resultDefinitionId,
      label: '特殊配合',
    };
    const first = createMonster(GAME_DATA, recipe.parentDefinitionIds[0], 'invalid-parent-one');
    const second = createMonster(GAME_DATA, recipe.parentDefinitionIds[1], 'invalid-parent-two');
    const choices = breedingSkillChoices(GAME_DATA, first, second, candidate);
    const unrelatedSkill = GAME_DATA.skills.find((skill) => !choices.includes(skill.id));
    if (!unrelatedSkill || !choices[0] || !choices[1]) throw new Error('Expected skill fixtures');

    expect(() => breedMonsters(GAME_DATA, first, second, candidate, [choices[0], choices[1]], 'too-few')).toThrow(
      '3つ',
    );
    expect(() =>
      breedMonsters(GAME_DATA, first, second, candidate, [choices[0], choices[0], choices[1]], 'duplicate'),
    ).toThrow('重複');
    expect(() =>
      breedMonsters(GAME_DATA, first, second, candidate, [choices[0], choices[1], unrelatedSkill.id], 'unrelated'),
    ).toThrow('選べません');
  });
});
