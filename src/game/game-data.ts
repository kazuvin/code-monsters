import rawGameData from './game.json';
import type { GameData, MonsterDefinition, RawGameData, StatBlock, StatId, WhiteStars } from '../core/types';

const STAT_IDS: StatId[] = ['maxHp', 'maxMp', 'attack', 'defense', 'speed', 'wisdom', 'crit'];
const PRICES = [3, 6, 10, 15, 21] as const;
const SELL_PRICES = [1, 3, 5, 7, 10] as const;

const scaleStats = (stats: StatBlock, multiplier: number): StatBlock =>
  Object.fromEntries(STAT_IDS.map((statId) => [statId, Math.round(stats[statId] * multiplier)])) as StatBlock;

const fileData = rawGameData as RawGameData;

const catalogMonsters: MonsterDefinition[] = fileData.archetypes.flatMap((archetype) =>
  archetype.forms.map((form, index) => {
    const whiteStars = (index + 1) as WhiteStars;
    return {
      id: `${archetype.attributeId}-${archetype.lineageId}-${whiteStars}`,
      archetypeId: archetype.id,
      kind: 'standard' as const,
      breedable: true,
      lineageId: archetype.lineageId,
      attributeId: archetype.attributeId,
      name: form.name,
      whiteStars,
      glyph: form.glyph,
      appearance: form.appearance,
      baseStats: scaleStats(archetype.baseStats, fileData.rankStatMultipliers[index] ?? 1),
      growthPerLevel: scaleStats(archetype.growthPerLevel, 1 + index * 0.08),
      intrinsicSkillIds: form.intrinsicSkillIds,
      defaultSkillId: form.defaultSkillId,
      traitId: form.traitId,
      price: PRICES[index] ?? PRICES[0],
      sellPrice: SELL_PRICES[index] ?? SELL_PRICES[0],
    };
  }),
);

const monsters: MonsterDefinition[] = [...catalogMonsters, ...fileData.oddities];

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
  const standardMonsters = data.monsters.filter((monster) => monster.kind === 'standard');
  const oddities = data.monsters.filter((monster) => monster.kind === 'oddity');
  if (standardMonsters.length !== 45) errors.push('Validation catalog must expand to exactly 45 monsters');
  if (oddities.some((monster) => monster.breedable)) errors.push('Oddity monsters must not be breedable');
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
    if (archetype.forms.length !== 5) errors.push(`${archetype.id} needs exactly five white-star forms`);
    const formLoadouts = new Set<string>();
    const formGlyphs = new Set<string>();
    const formAttires = new Set<string>();
    const formTraits = new Set<string>();
    for (const [index, form] of archetype.forms.entries()) {
      const label = `${archetype.id} white-star ${index + 1}`;
      const skillIdsForForm = [...form.intrinsicSkillIds, form.defaultSkillId];
      if (new Set(skillIdsForForm).size !== 3) errors.push(`${label} must have three different skills`);
      for (const skillId of skillIdsForForm) {
        if (!skillIds.has(skillId)) errors.push(`${label} references unknown skill "${skillId}"`);
      }
      if (!traitIds.has(form.traitId)) {
        errors.push(`${label} references unknown trait "${form.traitId}"`);
      }
      formLoadouts.add([...skillIdsForForm].sort().join('|'));
      formGlyphs.add(form.glyph);
      formAttires.add(form.appearance.attire);
      formTraits.add(form.traitId);
    }
    if (formLoadouts.size !== 5) errors.push(`${archetype.id} must change skill loadout at every white star`);
    if (formGlyphs.size !== 5) errors.push(`${archetype.id} must change appearance at every white star`);
    if (formAttires.size !== 5) errors.push(`${archetype.id} must change attire at every white star`);
    if (formTraits.size !== 5) errors.push(`${archetype.id} must change trait at every white star`);
  }
  for (const recipe of data.specialRecipes) {
    for (const parentId of recipe.parentDefinitionIds) {
      if (!monsterIds.has(parentId)) errors.push(`${recipe.id} references unknown parent "${parentId}"`);
    }
    if (!monsterIds.has(recipe.resultDefinitionId)) {
      errors.push(`${recipe.id} references unknown result "${recipe.resultDefinitionId}"`);
    }
  }
  for (const oddity of oddities) {
    const skillIdsForOddity = [...oddity.intrinsicSkillIds, oddity.defaultSkillId];
    if (new Set(skillIdsForOddity).size !== 3) errors.push(`${oddity.id} must have three different skills`);
    for (const skillId of skillIdsForOddity) {
      if (!skillIds.has(skillId)) errors.push(`${oddity.id} references unknown skill "${skillId}"`);
    }
    if (!traitIds.has(oddity.traitId)) errors.push(`${oddity.id} references unknown trait "${oddity.traitId}"`);
    if (oddity.hatch) {
      if (oddity.hatch.afterHeldCycles < 1) errors.push(`${oddity.id} must be held for at least one cycle`);
      if (oddity.hatch.maximumWhiteStars < oddity.whiteStars) {
        errors.push(`${oddity.id} hatch maximum cannot be below its egg rank`);
      }
      if (oddity.hatch.maximumWhiteStars > Math.min(5, oddity.whiteStars + 1)) {
        errors.push(`${oddity.id} hatch maximum can be at most one rank above its egg rank`);
      }
      if (oddity.hatch.upgradeChance < 0 || oddity.hatch.upgradeChance > 1) {
        errors.push(`${oddity.id} has an invalid hatch upgrade chance`);
      }
    }
  }
  for (const skill of data.skills) {
    if (skill.mpCost < 0) errors.push(`${skill.id} has a negative MP cost`);
    if (skill.effects.length === 0) errors.push(`${skill.id} needs at least one effect`);
    if (skill.postBattleReward && skill.postBattleReward.amount <= 0) {
      errors.push(`${skill.id} needs a positive post-battle reward`);
    }
  }
  for (const trait of data.traits) {
    if (trait.stages.length !== 3) errors.push(`${trait.id} needs exactly three color-star stages`);
    for (const stage of trait.stages) {
      if ((stage.farewellCoinsPerHeldCycle ?? 0) < 0) {
        errors.push(`${trait.id} has a negative held-cycle farewell reward`);
      }
      if (
        stage.farewellCoinGrowthEveryHeldCycles !== undefined &&
        (!Number.isInteger(stage.farewellCoinGrowthEveryHeldCycles) || stage.farewellCoinGrowthEveryHeldCycles < 1)
      ) {
        errors.push(`${trait.id} needs a positive integer farewell growth interval`);
      }
      if ((stage.farewellCoinGrowthAmount ?? 0) < 0) {
        errors.push(`${trait.id} has a negative farewell growth amount`);
      }
    }
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
