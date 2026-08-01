import type {
  AttributeId,
  GameData,
  LineageId,
  MonsterDefinition,
  MonsterInstance,
  SkillDefinition,
  SpecialRecipeDefinition,
} from './types';
import { skillIdsFor } from './monster';

export type MonsterCatalogEntry = {
  id: string;
  index: number;
  state: 'locked' | 'unlocked';
  silhouette: {
    lineageId: LineageId;
    attributeId: AttributeId;
    glyph: string;
  };
  details?: MonsterDefinition;
};

export function normalizeDiscoveredMonsterIds(data: GameData, stored: unknown): Set<string> {
  if (!Array.isArray(stored)) return new Set();
  const monsterIds = new Set(data.monsters.map((monster) => monster.id));
  return new Set(stored.filter((id): id is string => typeof id === 'string' && monsterIds.has(id)));
}

export function mergeDiscoveredMonsterIds(
  data: GameData,
  discoveredIds: ReadonlySet<string>,
  roster: readonly MonsterInstance[],
): Set<string> {
  const next = normalizeDiscoveredMonsterIds(data, [...discoveredIds]);
  const monsterIds = new Set(data.monsters.map((monster) => monster.id));
  for (const monster of roster) {
    if (monsterIds.has(monster.definitionId)) next.add(monster.definitionId);
  }
  return next;
}

export function monsterCatalogEntries(
  data: GameData,
  discoveredIds: ReadonlySet<string>,
  revealAll = false,
): MonsterCatalogEntry[] {
  return data.monsters.map((definition, index) => ({
    id: definition.id,
    index: index + 1,
    state: revealAll || discoveredIds.has(definition.id) ? 'unlocked' : 'locked',
    silhouette: {
      lineageId: definition.lineageId,
      attributeId: definition.attributeId,
      glyph: definition.glyph,
    },
    details: revealAll || discoveredIds.has(definition.id) ? definition : undefined,
  }));
}

export type SkillCatalogEntry = {
  id: string;
  index: number;
  state: 'locked' | 'unlocked';
  details?: SkillDefinition;
};

export function normalizeDiscoveredSkillIds(data: GameData, stored: unknown): Set<string> {
  if (!Array.isArray(stored)) return new Set();
  const skillIds = new Set(data.skills.map((skill) => skill.id));
  return new Set(stored.filter((id): id is string => typeof id === 'string' && skillIds.has(id)));
}

export function mergeDiscoveredSkillIds(
  data: GameData,
  discoveredIds: ReadonlySet<string>,
  roster: readonly MonsterInstance[],
): Set<string> {
  const next = normalizeDiscoveredSkillIds(data, [...discoveredIds]);
  for (const monster of roster) {
    for (const skillId of skillIdsFor(data, monster)) next.add(skillId);
  }
  return next;
}

export function mergeSkillsFromDiscoveredMonsters(
  data: GameData,
  discoveredSkillIds: ReadonlySet<string>,
  discoveredMonsterIds: ReadonlySet<string>,
): Set<string> {
  const next = normalizeDiscoveredSkillIds(data, [...discoveredSkillIds]);
  for (const definition of data.monsters) {
    if (!discoveredMonsterIds.has(definition.id)) continue;
    for (const skillId of [...definition.intrinsicSkillIds, definition.defaultSkillId]) next.add(skillId);
  }
  return next;
}

export function skillCatalogEntries(
  data: GameData,
  discoveredIds: ReadonlySet<string>,
  revealAll = false,
): SkillCatalogEntry[] {
  return data.skills.map((definition, index) => ({
    id: definition.id,
    index: index + 1,
    state: revealAll || discoveredIds.has(definition.id) ? 'unlocked' : 'locked',
    details: revealAll || discoveredIds.has(definition.id) ? definition : undefined,
  }));
}

export type SkillHolderRelations = {
  intrinsic: MonsterDefinition[];
  default: MonsterDefinition[];
};

export function skillHolderRelationsFor(data: GameData, skillId: string): SkillHolderRelations {
  return {
    intrinsic: data.monsters.filter((monster) => monster.intrinsicSkillIds.includes(skillId)),
    default: data.monsters.filter((monster) => monster.defaultSkillId === skillId),
  };
}

export type EventCatalogEntry = {
  id: string;
  index: number;
  state: 'locked' | 'unlocked';
  details?: GameData['events'][number];
};

export function normalizeDiscoveredEventIds(data: GameData, stored: unknown): Set<string> {
  if (!Array.isArray(stored)) return new Set();
  const eventIds = new Set(data.events.map((event) => event.id));
  return new Set(stored.filter((id): id is string => typeof id === 'string' && eventIds.has(id)));
}

export function mergeDiscoveredEventIds(
  data: GameData,
  discoveredIds: ReadonlySet<string>,
  eventId?: string,
): Set<string> {
  const next = normalizeDiscoveredEventIds(data, [...discoveredIds]);
  if (eventId && data.events.some((event) => event.id === eventId)) next.add(eventId);
  return next;
}

export function eventCatalogEntries(
  data: GameData,
  discoveredIds: ReadonlySet<string>,
  revealAll = false,
): EventCatalogEntry[] {
  return data.events.map((definition, index) => ({
    id: definition.id,
    index: index + 1,
    state: revealAll || discoveredIds.has(definition.id) ? 'unlocked' : 'locked',
    details: revealAll || discoveredIds.has(definition.id) ? definition : undefined,
  }));
}

export type MonsterSpecialRecipeRelations = {
  createdBy: SpecialRecipeDefinition[];
  usedBy: SpecialRecipeDefinition[];
};

export function specialRecipeRelationsFor(data: GameData, definitionId: string): MonsterSpecialRecipeRelations {
  return {
    createdBy: data.specialRecipes.filter((recipe) => recipe.resultDefinitionId === definitionId),
    usedBy: data.specialRecipes.filter((recipe) => recipe.parentDefinitionIds.includes(definitionId)),
  };
}

export type ShopSpecialRecipeSignal = {
  recipeId: string;
  partnerDefinitionId: string;
  resultDefinitionId: string;
  source: 'roster' | 'shelf';
};

export function specialRecipeSignalsForShopOffer(
  data: GameData,
  offerDefinitionId: string,
  rosterDefinitionIds: readonly string[],
  shelfDefinitionIds: readonly string[],
): ShopSpecialRecipeSignal[] {
  const rosterIds = new Set(rosterDefinitionIds);
  const shelfIds = new Set(shelfDefinitionIds);
  const signals: ShopSpecialRecipeSignal[] = [];
  for (const recipe of data.specialRecipes) {
    const [left, right] = recipe.parentDefinitionIds;
    let partnerDefinitionId: string | undefined;
    if (left === offerDefinitionId) partnerDefinitionId = right;
    else if (right === offerDefinitionId) partnerDefinitionId = left;
    if (!partnerDefinitionId) continue;
    const source = rosterIds.has(partnerDefinitionId)
      ? ('roster' as const)
      : shelfIds.has(partnerDefinitionId)
        ? ('shelf' as const)
        : undefined;
    if (!source) continue;
    signals.push({
      recipeId: recipe.id,
      partnerDefinitionId,
      resultDefinitionId: recipe.resultDefinitionId,
      source,
    });
  }
  return signals.sort(
    (left, right) =>
      Number(right.source === 'roster') - Number(left.source === 'roster') ||
      left.recipeId.localeCompare(right.recipeId),
  );
}
