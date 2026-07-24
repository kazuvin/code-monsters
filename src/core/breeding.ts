import { createMonster, definitionFor, effectiveStarsFor, permanentStatsFor, skillIdsFor } from './monster';
import type { BreedingCandidate, ColorStars, GameData, MonsterInstance, StatBlock, StatId, WhiteStars } from './types';

const STAT_IDS: StatId[] = ['maxHp', 'maxMp', 'attack', 'defense', 'speed', 'wisdom', 'crit'];

const candidateId = (kind: BreedingCandidate['kind'], definitionId: string, colorStars: ColorStars) =>
  `${kind}:${definitionId}:${colorStars}`;

const pushUnique = (candidates: BreedingCandidate[], candidate: BreedingCandidate) => {
  if (!candidates.some((entry) => entry.id === candidate.id)) candidates.push(candidate);
};

export function listBreedingCandidates(
  data: GameData,
  first: MonsterInstance,
  second: MonsterInstance,
): BreedingCandidate[] {
  const firstDefinition = definitionFor(data, first);
  const secondDefinition = definitionFor(data, second);
  const candidates: BreedingCandidate[] = [];
  const averagedWhiteStars = Math.min(
    5,
    Math.ceil((effectiveStarsFor(data, first) + effectiveStarsFor(data, second)) / 2),
  ) as WhiteStars;
  const resultWhiteStars = Math.max(data.rules.breeding.minimumResultWhiteStars, averagedWhiteStars) as WhiteStars;

  const genericPairs = [
    { lineageId: firstDefinition.lineageId, attributeId: secondDefinition.attributeId },
    { lineageId: secondDefinition.lineageId, attributeId: firstDefinition.attributeId },
  ];
  for (const pair of genericPairs) {
    const definition = data.monsters.find(
      (entry) =>
        entry.lineageId === pair.lineageId &&
        entry.attributeId === pair.attributeId &&
        entry.whiteStars === resultWhiteStars,
    );
    if (!definition) continue;
    if (
      first.definitionId === second.definitionId &&
      definition.id === first.definitionId &&
      Math.max(first.colorStars, second.colorStars) < 2
    ) {
      continue;
    }
    pushUnique(candidates, {
      id: candidateId('generic', definition.id, 0),
      kind: 'generic',
      definitionId: definition.id,
      colorStars: 0,
      label: `位階配合 → ${definition.name}`,
    });
  }

  if (first.definitionId === second.definitionId) {
    const nextColor = Math.min(2, Math.max(first.colorStars, second.colorStars) + 1) as ColorStars;
    if (nextColor > Math.max(first.colorStars, second.colorStars)) {
      pushUnique(candidates, {
        id: candidateId('same-name', firstDefinition.id, nextColor),
        kind: 'same-name',
        definitionId: firstDefinition.id,
        colorStars: nextColor,
        label: `同名配合 → 色星${nextColor}`,
      });
    }
  }

  for (const recipe of data.specialRecipes) {
    const [left, right] = recipe.parentDefinitionIds;
    const matches =
      (first.definitionId === left && second.definitionId === right) ||
      (first.definitionId === right && second.definitionId === left);
    if (!matches) continue;
    const result = data.monsters.find((entry) => entry.id === recipe.resultDefinitionId);
    if (!result) continue;
    pushUnique(candidates, {
      id: candidateId('special', result.id, 0),
      kind: 'special',
      definitionId: result.id,
      colorStars: 0,
      label: `特殊配合 → ${result.name}`,
    });
  }

  return candidates.sort((left, right) => {
    const order = { special: 0, 'same-name': 1, generic: 2 };
    return order[left.kind] - order[right.kind] || left.definitionId.localeCompare(right.definitionId);
  });
}

export function inheritanceSkillChoices(
  data: GameData,
  first: MonsterInstance,
  second: MonsterInstance,
  candidate: BreedingCandidate,
) {
  const childDefinition = data.monsters.find((entry) => entry.id === candidate.definitionId);
  if (!childDefinition) return [];
  return [
    ...new Set(
      [...skillIdsFor(data, first), ...skillIdsFor(data, second)].filter(
        (skillId) => !childDefinition.intrinsicSkillIds.includes(skillId),
      ),
    ),
  ];
}

export function breedMonsters(
  data: GameData,
  first: MonsterInstance,
  second: MonsterInstance,
  candidate: BreedingCandidate,
  inheritedSkillId: string | undefined,
  childId: string,
): MonsterInstance {
  const definition = data.monsters.find((entry) => entry.id === candidate.definitionId);
  if (!definition) throw new Error(`Unknown breeding result: ${candidate.definitionId}`);
  const allowedSkills = inheritanceSkillChoices(data, first, second, candidate);
  if (inheritedSkillId && !allowedSkills.includes(inheritedSkillId)) {
    throw new Error(`Skill "${inheritedSkillId}" cannot be inherited by ${definition.name}`);
  }

  const firstStats = permanentStatsFor(data, first);
  const secondStats = permanentStatsFor(data, second);
  const totalColorStars = first.colorStars + second.colorStars;
  const rate = data.rules.breeding.inheritanceRatesByTotalColorStars[totalColorStars] ?? 0.25;
  const inheritedStats = Object.fromEntries(
    STAT_IDS.map((statId) => [statId, Math.floor(((firstStats[statId] + secondStats[statId]) / 2) * rate)]),
  ) as StatBlock;

  return createMonster(data, candidate.definitionId, childId, {
    colorStars: candidate.colorStars,
    inheritedStats,
    inheritedSkillId,
  });
}
