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
    const statGrowthProfileId = form.statGrowthProfileId ?? 'steady';
    return {
      id: `${archetype.attributeId}-${archetype.lineageId}-${whiteStars}`,
      archetypeId: archetype.id,
      shopAvailability: index === 0 ? ('common' as const) : ('upgrade-only' as const),
      lineageId: archetype.lineageId,
      attributeId: archetype.attributeId,
      name: form.name,
      whiteStars,
      glyph: form.glyph,
      appearance: form.appearance,
      baseStats: scaleStats(archetype.baseStats, fileData.rankStatMultipliers[index] ?? 1),
      growthPerLevel: scaleStats(archetype.growthPerLevel, 1 + index * 0.08),
      experienceProfileId: fileData.rules.experienceProfileIdsByWhiteStars[index] ?? 'standard',
      statGrowthProfileId,
      roleTagIds:
        statGrowthProfileId === 'late-surge'
          ? [...new Set(['late-bloom', ...archetype.roleTagIds])]
          : archetype.roleTagIds,
      intrinsicSkillIds: form.intrinsicSkillIds,
      defaultSkillId: form.defaultSkillId,
      traitId: form.traitId,
      price: PRICES[index] ?? PRICES[0],
      sellPrice: SELL_PRICES[index] ?? SELL_PRICES[0],
    };
  }),
);

const monsters: MonsterDefinition[] = [...catalogMonsters, ...fileData.standaloneMonsters];

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
  unique(
    'experience profile',
    data.experienceProfiles.map((entry) => entry.id),
  );
  unique(
    'stat growth profile',
    data.statGrowthProfiles.map((entry) => entry.id),
  );
  unique(
    'role tag',
    data.roleTags.map((entry) => entry.id),
  );

  if (data.lineages.length !== 3) errors.push('Validation catalog must contain exactly 3 lineages');
  if (data.attributes.length !== 3) errors.push('Validation catalog must contain exactly 3 attributes');
  const lineageGridIds = new Set(data.archetypes.map((archetype) => archetype.id));
  const lineageGridMonsters = data.monsters.filter((monster) => lineageGridIds.has(monster.archetypeId));
  if (lineageGridMonsters.length !== 45) errors.push('Validation catalog must expand to exactly 45 grid monsters');
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
  const experienceProfileIds = new Set(data.experienceProfiles.map((entry) => entry.id));
  const statGrowthProfileIds = new Set(data.statGrowthProfiles.map((entry) => entry.id));
  const roleTagIds = new Set(data.roleTags.map((entry) => entry.id));
  for (const profile of data.experienceProfiles) {
    if (profile.thresholds.length !== data.rules.maxLevel) {
      errors.push(`${profile.id} must contain one cumulative experience value per level`);
    }
    if (profile.thresholds[0] !== 0) errors.push(`${profile.id} must start at zero experience`);
    if (
      profile.thresholds.some((threshold, index) => index > 0 && threshold <= (profile.thresholds[index - 1] ?? -1))
    ) {
      errors.push(`${profile.id} experience thresholds must strictly increase`);
    }
  }
  for (const profile of data.statGrowthProfiles) {
    if (profile.incrementsByLevel.length !== data.rules.maxLevel - 1) {
      errors.push(`${profile.id} must contain one stat-growth increment for levels two through max`);
    }
    if (profile.incrementsByLevel.some((increment) => increment <= 0)) {
      errors.push(`${profile.id} stat-growth increments must be positive`);
    }
  }
  for (const profileId of data.rules.experienceProfileIdsByWhiteStars) {
    if (!experienceProfileIds.has(profileId)) {
      errors.push(`White-star experience mapping references unknown profile "${profileId}"`);
    }
  }
  for (const monster of data.monsters) {
    if (!experienceProfileIds.has(monster.experienceProfileId)) {
      errors.push(`${monster.id} references unknown experience profile "${monster.experienceProfileId}"`);
    }
    if (!statGrowthProfileIds.has(monster.statGrowthProfileId)) {
      errors.push(`${monster.id} references unknown stat growth profile "${monster.statGrowthProfileId}"`);
    }
    for (const tagId of monster.roleTagIds) {
      if (!roleTagIds.has(tagId)) errors.push(`${monster.id} references unknown role tag "${tagId}"`);
    }
    if (!['common', 'rare', 'upgrade-only'].includes(monster.shopAvailability)) {
      errors.push(`${monster.id} has an invalid shop availability`);
    }
  }
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
  for (const monster of data.standaloneMonsters) {
    const skillIdsForMonster = [...monster.intrinsicSkillIds, monster.defaultSkillId];
    if (new Set(skillIdsForMonster).size !== 3) errors.push(`${monster.id} must have three different skills`);
    for (const skillId of skillIdsForMonster) {
      if (!skillIds.has(skillId)) errors.push(`${monster.id} references unknown skill "${skillId}"`);
    }
    if (!traitIds.has(monster.traitId)) errors.push(`${monster.id} references unknown trait "${monster.traitId}"`);
    if (monster.hatch) {
      if (monster.hatch.afterHeldCycles < 1) errors.push(`${monster.id} must be held for at least one cycle`);
      if (monster.hatch.maximumWhiteStars < monster.whiteStars) {
        errors.push(`${monster.id} hatch maximum cannot be below its egg rank`);
      }
      if (monster.hatch.maximumWhiteStars > Math.min(5, monster.whiteStars + 1)) {
        errors.push(`${monster.id} hatch maximum can be at most one rank above its egg rank`);
      }
      if (monster.hatch.upgradeChance < 0 || monster.hatch.upgradeChance > 1) {
        errors.push(`${monster.id} has an invalid hatch upgrade chance`);
      }
    }
  }
  for (const skill of data.skills) {
    if (skill.mpCost < 0) errors.push(`${skill.id} has a negative MP cost`);
    if (skill.effects.length === 0) errors.push(`${skill.id} needs at least one effect`);
    if (skill.runReward?.amountsByColorStars.some((amount) => amount <= 0)) {
      errors.push(`${skill.id} needs positive run-reward amounts`);
    }
    if (
      skill.runReward &&
      (!Number.isInteger(skill.runReward.maximumTriggersPerBattle) || skill.runReward.maximumTriggersPerBattle < 1)
    ) {
      errors.push(`${skill.id} needs a positive run-reward trigger cap`);
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
      if (stage.postBattleXpAura && stage.postBattleXpAura.amount <= 0) {
        errors.push(`${trait.id} needs a positive post-battle experience aura`);
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
