import type { AttributeId, GameData, LineageId, MonsterDefinition, MonsterInstance, WhiteStars } from './types';

export type MonsterCatalogEntry = {
  id: string;
  index: number;
  state: 'locked' | 'unlocked';
  silhouette: {
    lineageId: LineageId;
    attributeId: AttributeId;
    whiteStars: WhiteStars;
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

export function monsterCatalogEntries(data: GameData, discoveredIds: ReadonlySet<string>): MonsterCatalogEntry[] {
  return data.monsters.map((definition, index) => ({
    id: definition.id,
    index: index + 1,
    state: discoveredIds.has(definition.id) ? 'unlocked' : 'locked',
    silhouette: {
      lineageId: definition.lineageId,
      attributeId: definition.attributeId,
      whiteStars: definition.whiteStars,
      glyph: definition.glyph,
    },
    details: discoveredIds.has(definition.id) ? definition : undefined,
  }));
}
