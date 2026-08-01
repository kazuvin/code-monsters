import type { GameData, MonsterDefinition, Rarity, RawGameData, StatBlock, StatId } from '../core/types';
import rawJson from './game.json';

const STAT_IDS: StatId[] = ['maxHp', 'maxMp', 'attack', 'defense', 'speed', 'wisdom', 'crit'];
const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
const rawGameData = rawJson as unknown as RawGameData;

const applyStatMultipliers = (stats: StatBlock, multipliers?: Partial<StatBlock>): StatBlock =>
  Object.fromEntries(
    STAT_IDS.map((statId) => [statId, Math.max(0, Math.round(stats[statId] * (multipliers?.[statId] ?? 1)))]),
  ) as StatBlock;

const catalogMonsters: MonsterDefinition[] = rawGameData.archetypes.flatMap((archetype) =>
  archetype.forms.map((form, index) => ({
    id: `${archetype.attributeId}-${archetype.lineageId}-${index + 1}`,
    archetypeId: archetype.id,
    shopAvailability: form.shopAvailability,
    lineageId: archetype.lineageId,
    attributeId: archetype.attributeId,
    name: form.name,
    glyph: form.glyph,
    appearance: form.appearance,
    baseStats: applyStatMultipliers(archetype.baseStats, form.statMultipliers),
    roleTagIds: archetype.roleTagIds,
    intrinsicSkillIds: form.intrinsicSkillIds,
    defaultSkillId: form.defaultSkillId,
    traitId: form.traitId,
    identity: form.identity,
    price: form.price,
    sellPrice: form.sellPrice,
  })),
);

export const GAME_DATA: GameData = {
  ...rawGameData,
  monsters: [...catalogMonsters, ...rawGameData.standaloneMonsters],
};

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
    'special recipe',
    data.specialRecipes.map((entry) => entry.id),
  );
  unique(
    'equipment',
    data.equipment.map((entry) => entry.id),
  );
  unique(
    'role tag',
    data.roleTags.map((entry) => entry.id),
  );

  if (data.schemaVersion !== 7) errors.push('Synergy-first content must use schema version 7');
  if (data.lineages.length !== 3) errors.push('Validation catalog must contain exactly 3 lineages');
  if (data.attributes.length !== 3) errors.push('Validation catalog must contain exactly 3 attributes');
  if (data.rules.activeLimit !== 3) errors.push('The validation battle format must be 3v3');
  if (data.rules.rosterLimit !== data.rules.activeLimit + data.rules.benchLimit) {
    errors.push('rosterLimit must equal activeLimit plus benchLimit');
  }

  const gridIds = new Set(data.archetypes.map((archetype) => archetype.id));
  const grid = data.monsters.filter((monster) => gridIds.has(monster.archetypeId));
  if (grid.length !== 45) errors.push('Validation catalog must contain exactly 45 grid species');
  if (grid.filter((monster) => monster.shopAvailability === 'common').length !== 18) {
    errors.push('Validation catalog must contain exactly 18 shop grid species');
  }
  if (grid.filter((monster) => monster.shopAvailability === 'breeding-only').length !== 27) {
    errors.push('Validation catalog must contain exactly 27 breeding-only grid species');
  }

  const weightTotal = RARITIES.reduce(
    (total, rarity) => total + (data.rules.shop.equipmentRarityWeights[rarity] ?? 0),
    0,
  );
  if (weightTotal !== 100) errors.push('shop.equipmentRarityWeights must total 100');

  const skillIds = new Set(data.skills.map((entry) => entry.id));
  const traitIds = new Set(data.traits.map((entry) => entry.id));
  const roleTagIds = new Set(data.roleTags.map((entry) => entry.id));
  const monsterIds = new Set(data.monsters.map((entry) => entry.id));
  for (const monster of data.monsters) {
    const nativeSkills = [...monster.intrinsicSkillIds, monster.defaultSkillId];
    if (new Set(nativeSkills).size !== 3) errors.push(`${monster.id} must have three different native skills`);
    for (const skillId of nativeSkills) {
      if (!skillIds.has(skillId)) errors.push(`${monster.id} references unknown skill "${skillId}"`);
    }
    if (!traitIds.has(monster.traitId)) errors.push(`${monster.id} references unknown trait "${monster.traitId}"`);
    for (const roleTagId of monster.roleTagIds) {
      if (!roleTagIds.has(roleTagId)) errors.push(`${monster.id} references unknown role tag "${roleTagId}"`);
    }
  }

  const signatures = new Set<string>();
  for (const archetype of data.archetypes) {
    if (archetype.forms.length !== 5) errors.push(`${archetype.id} needs exactly five species forms`);
    for (const [index, form] of archetype.forms.entries()) {
      if (!form.identity) errors.push(`${archetype.id} form ${index + 1} needs a combat identity`);
      if (form.identity) signatures.add(form.identity.signatureSkillId);
    }
  }
  if (signatures.size !== 45) errors.push('Every grid species must have an exclusive signature skill');

  const parentPairs = new Set<string>();
  const recipesByResult = new Map<string, number>();
  for (const recipe of data.specialRecipes) {
    const parents = recipe.parentDefinitionIds.map((id) => data.monsters.find((monster) => monster.id === id));
    if (recipe.parentDefinitionIds[0] === recipe.parentDefinitionIds[1]) {
      errors.push(`${recipe.id} must use two different parents`);
    }
    for (const [index, parent] of parents.entries()) {
      if (!parent) errors.push(`${recipe.id} references unknown parent "${recipe.parentDefinitionIds[index]}"`);
      if (parent?.shopAvailability !== 'common')
        errors.push(`${recipe.id} parent must be available in the normal shop`);
    }
    const result = data.monsters.find((monster) => monster.id === recipe.resultDefinitionId);
    if (!result) errors.push(`${recipe.id} references unknown result "${recipe.resultDefinitionId}"`);
    if (result && result.shopAvailability !== 'breeding-only') errors.push(`${recipe.id} result must be breeding-only`);
    const pairKey = [...recipe.parentDefinitionIds].sort().join('+');
    if (parentPairs.has(pairKey)) errors.push(`${recipe.id} duplicates parent pair "${pairKey}"`);
    parentPairs.add(pairKey);
    recipesByResult.set(recipe.resultDefinitionId, (recipesByResult.get(recipe.resultDefinitionId) ?? 0) + 1);
  }
  for (const child of data.monsters.filter((monster) => monster.shopAvailability === 'breeding-only')) {
    if (recipesByResult.get(child.id) !== 2) errors.push(`${child.id} must have exactly two special recipes`);
  }

  for (const trait of data.traits) {
    if (!trait.description.trim()) errors.push(`${trait.id} needs a description`);
    if (!Array.isArray(trait.battleStartEffects)) errors.push(`${trait.id} needs battle-start effects`);
  }
  for (const skill of data.skills) {
    if (!RARITIES.includes(skill.rarity)) errors.push(`${skill.id} has an invalid rarity`);
    if (skill.effects.length === 0) errors.push(`${skill.id} needs at least one effect`);
    if (skill.runReward && skill.runReward.amount <= 0) errors.push(`${skill.id} needs a positive run reward`);
  }
  for (const cycle of data.rules.eventCycles) {
    if (cycle <= 1 || cycle >= data.rules.maxCycles) errors.push(`event cycle ${cycle} is outside the run`);
  }
  if (data.specialRecipes.some((recipe) => !monsterIds.has(recipe.resultDefinitionId))) {
    errors.push('Every special recipe must produce a known monster');
  }

  return errors;
}

const validationErrors = validateGameData(GAME_DATA);
if (validationErrors.length > 0) throw new Error(`Invalid game data:\n${validationErrors.join('\n')}`);
