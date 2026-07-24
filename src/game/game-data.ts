import rawGameData from './game.json';
import type { GameData, MonsterDefinition, RawGameData, StatBlock, StatId, WhiteStars } from '../core/types';

const STAT_IDS: StatId[] = ['maxHp', 'maxMp', 'attack', 'defense', 'speed', 'wisdom', 'crit'];
const PRICES = [3, 6, 10, 15, 21] as const;
const SELL_PRICES = [1, 3, 5, 7, 10] as const;

const scaleStats = (stats: StatBlock, multiplier: number): StatBlock =>
  Object.fromEntries(STAT_IDS.map((statId) => [statId, Math.round(stats[statId] * multiplier)])) as StatBlock;

const fileData = rawGameData as RawGameData;

const monsters: MonsterDefinition[] = fileData.archetypes.flatMap((archetype) =>
  archetype.names.map((name, index) => {
    const whiteStars = (index + 1) as WhiteStars;
    return {
      id: `${archetype.attributeId}-${archetype.lineageId}-${whiteStars}`,
      archetypeId: archetype.id,
      lineageId: archetype.lineageId,
      attributeId: archetype.attributeId,
      name,
      whiteStars,
      glyph: archetype.glyph,
      baseStats: scaleStats(archetype.baseStats, fileData.rankStatMultipliers[index] ?? 1),
      growthPerLevel: scaleStats(archetype.growthPerLevel, 1 + index * 0.08),
      intrinsicSkillIds: archetype.intrinsicSkillIds,
      defaultSkillId: archetype.defaultSkillId,
      traitId: archetype.traitId,
      price: PRICES[index] ?? PRICES[0],
      sellPrice: SELL_PRICES[index] ?? SELL_PRICES[0],
    };
  }),
);

export const GAME_DATA: GameData = { ...fileData, monsters };

export function validateGameData(data: GameData): string[] {
  const errors: string[] = [];
  const unique = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${label} id "${id}" is duplicated`);
      seen.add(id);
    }
  };

  unique(
    'monster',
    data.monsters.map((entry) => entry.id),
  );
  unique(
    'monster name',
    data.monsters.map((entry) => entry.name),
  );
  unique(
    'skill',
    data.skills.map((entry) => entry.id),
  );
  unique(
    'trait',
    data.traits.map((entry) => entry.id),
  );
  unique(
    'equipment',
    data.equipment.map((entry) => entry.id),
  );

  if (data.lineages.length !== 3) errors.push('Validation catalog must contain exactly 3 lineages');
  if (data.attributes.length !== 3) errors.push('Validation catalog must contain exactly 3 attributes');
  if (data.monsters.length !== 45) errors.push('Validation catalog must expand to exactly 45 monsters');
  if (data.rules.levelThresholds.length !== data.rules.maxLevel) {
    errors.push('levelThresholds must contain one cumulative value per level');
  }
  if (data.rules.activeLimit !== 3) errors.push('The validation battle format must be 3v3');
  if (data.rules.rosterLimit !== data.rules.activeLimit + data.rules.benchLimit) {
    errors.push('rosterLimit must equal activeLimit plus benchLimit');
  }
  if (data.rules.breeding.minimumResultWhiteStars < 1 || data.rules.breeding.minimumResultWhiteStars > 5) {
    errors.push('breeding.minimumResultWhiteStars must be between 1 and 5');
  }

  const skillIds = new Set(data.skills.map((entry) => entry.id));
  const traitIds = new Set(data.traits.map((entry) => entry.id));
  const monsterIds = new Set(data.monsters.map((entry) => entry.id));
  for (const archetype of data.archetypes) {
    for (const skillId of [...archetype.intrinsicSkillIds, archetype.defaultSkillId]) {
      if (!skillIds.has(skillId)) errors.push(`${archetype.id} references unknown skill "${skillId}"`);
    }
    if (!traitIds.has(archetype.traitId)) {
      errors.push(`${archetype.id} references unknown trait "${archetype.traitId}"`);
    }
  }
  for (const recipe of data.specialRecipes) {
    for (const parentId of recipe.parentDefinitionIds) {
      if (!monsterIds.has(parentId)) errors.push(`${recipe.id} references unknown parent "${parentId}"`);
    }
    if (!monsterIds.has(recipe.resultDefinitionId)) {
      errors.push(`${recipe.id} references unknown result "${recipe.resultDefinitionId}"`);
    }
  }
  for (const skill of data.skills) {
    if (skill.mpCost < 0) errors.push(`${skill.id} has a negative MP cost`);
    if (skill.effects.length === 0) errors.push(`${skill.id} needs at least one effect`);
  }
  for (const trait of data.traits) {
    if (trait.stages.length !== 3) errors.push(`${trait.id} needs exactly three color-star stages`);
  }
  for (const cycle of data.rules.eventCycles) {
    if (cycle <= 1 || cycle >= data.rules.maxCycles) errors.push(`event cycle ${cycle} is outside the run`);
  }

  return errors;
}

const validationErrors = validateGameData(GAME_DATA);
if (validationErrors.length > 0) {
  throw new Error(`Invalid game data:\n${validationErrors.join('\n')}`);
}
