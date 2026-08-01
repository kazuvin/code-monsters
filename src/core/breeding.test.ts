import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { breedingSkillChoices, breedMonsters, listBreedingCandidates } from './breeding';
import { createMonster } from './monster';

const recipeFixture = () => {
  const recipe = GAME_DATA.specialRecipes[0];
  if (!recipe) throw new Error('Expected at least one special recipe');
  const first = createMonster(GAME_DATA, recipe.parentDefinitionIds[0], 'first');
  const second = createMonster(GAME_DATA, recipe.parentDefinitionIds[1], 'second');
  const candidate = listBreedingCandidates(GAME_DATA, first, second).find((entry) => entry.recipeId === recipe.id);
  if (!candidate) throw new Error('Expected the authored special candidate');
  return { recipe, first, second, candidate };
};

describe('special breeding', () => {
  it('offers only recipes authored for the exact unordered parent pair', () => {
    const { recipe, first, second } = recipeFixture();
    const forward = listBreedingCandidates(GAME_DATA, first, second);
    const reverse = listBreedingCandidates(GAME_DATA, second, first);

    expect(forward).toEqual(reverse);
    expect(forward).toContainEqual(expect.objectContaining({ id: `special:${recipe.id}`, kind: 'special' }));
    expect(forward.every((candidate) => candidate.recipeId && candidate.kind === 'special')).toBe(true);
  });

  it('builds the choice pool from both parents and the child native skills', () => {
    const { first, second, candidate } = recipeFixture();
    const child = GAME_DATA.monsters.find((entry) => entry.id === candidate.definitionId);
    const choices = breedingSkillChoices(GAME_DATA, first, second, candidate);

    expect(choices).toEqual(expect.arrayContaining([...first.skillIds, ...second.skillIds]));
    expect(choices).toEqual(expect.arrayContaining([...(child?.intrinsicSkillIds ?? []), child?.defaultSkillId]));
    expect(new Set(choices).size).toBe(choices.length);
  });

  it('consumes no progression state and gives the child exactly the chosen three skills', () => {
    const { first, second, candidate } = recipeFixture();
    const choices = breedingSkillChoices(GAME_DATA, first, second, candidate).slice(0, 3) as [string, string, string];
    const child = breedMonsters(GAME_DATA, first, second, candidate, choices, 'child');

    expect(child.skillIds).toEqual(choices);
    expect(Object.keys(child)).not.toEqual(expect.arrayContaining(['level', 'xp', 'colorStars', 'inheritedStats']));
    expect(child.gambits.map((gambit) => gambit.action.skillId)).toEqual(choices);
  });
});
