import { createMonster, skillIdsFor } from './monster';
import type { BreedingCandidate, GameData, MonsterInstance } from './types';

const matchesRecipe = (firstDefinitionId: string, secondDefinitionId: string, parents: readonly string[]) =>
  (firstDefinitionId === parents[0] && secondDefinitionId === parents[1]) ||
  (firstDefinitionId === parents[1] && secondDefinitionId === parents[0]);

export function listBreedingCandidates(
  data: GameData,
  first: MonsterInstance,
  second: MonsterInstance,
): BreedingCandidate[] {
  return data.specialRecipes
    .filter((recipe) => matchesRecipe(first.definitionId, second.definitionId, recipe.parentDefinitionIds))
    .map((recipe) => {
      const result = data.monsters.find((entry) => entry.id === recipe.resultDefinitionId);
      if (!result) throw new Error(`Unknown breeding result: ${recipe.resultDefinitionId}`);
      return {
        id: `special:${recipe.id}`,
        kind: 'special' as const,
        recipeId: recipe.id,
        definitionId: result.id,
        label: `特殊配合 → ${result.name}`,
      };
    })
    .sort((left, right) => left.definitionId.localeCompare(right.definitionId));
}

export function breedingSkillChoices(
  data: GameData,
  first: MonsterInstance,
  second: MonsterInstance,
  candidate: BreedingCandidate,
) {
  const childDefinition = data.monsters.find((entry) => entry.id === candidate.definitionId);
  if (!childDefinition) return [];
  return [
    ...new Set([
      ...skillIdsFor(data, first),
      ...skillIdsFor(data, second),
      ...childDefinition.intrinsicSkillIds,
      childDefinition.defaultSkillId,
    ]),
  ];
}

export function breedMonsters(
  data: GameData,
  first: MonsterInstance,
  second: MonsterInstance,
  candidate: BreedingCandidate,
  selectedSkillIds: readonly string[],
  childId: string,
): MonsterInstance {
  const recipe = data.specialRecipes.find((entry) => entry.id === candidate.recipeId);
  if (
    !recipe ||
    recipe.resultDefinitionId !== candidate.definitionId ||
    !matchesRecipe(first.definitionId, second.definitionId, recipe.parentDefinitionIds)
  ) {
    throw new Error('この親の組み合わせでは選んだ特殊配合を実行できません');
  }
  if (selectedSkillIds.length !== 3) throw new Error('継承するスキルを3つ選んでください');
  if (new Set(selectedSkillIds).size !== 3) throw new Error('同じスキルは重複して選べません');
  const allowedSkills = breedingSkillChoices(data, first, second, candidate);
  const invalidSkillId = selectedSkillIds.find((skillId) => !allowedSkills.includes(skillId));
  if (invalidSkillId) throw new Error(`スキル「${invalidSkillId}」はこの配合では選べません`);

  return createMonster(data, candidate.definitionId, childId, { skillIds: selectedSkillIds });
}
