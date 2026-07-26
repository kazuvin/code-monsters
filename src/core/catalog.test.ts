import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import {
  mergeDiscoveredMonsterIds,
  monsterCatalogEntries,
  normalizeDiscoveredMonsterIds,
  specialRecipeRelationsFor,
} from './catalog';
import { createMonster } from './monster';

describe('monster catalog discovery', () => {
  it('lists all 45 standard monsters and five oddities without exposing locked details', () => {
    const entries = monsterCatalogEntries(GAME_DATA, new Set());

    expect(entries).toHaveLength(50);
    expect(entries.filter((entry) => entry.id === 'buried-mole-1')).toHaveLength(1);
    expect(entries.every((entry) => entry.state === 'locked')).toBe(true);
    expect(entries.every((entry) => entry.details === undefined)).toBe(true);
  });

  it('exposes details only for monsters the player has welcomed', () => {
    const discoveredId = GAME_DATA.monsters[0]?.id;
    if (!discoveredId) throw new Error('The catalog needs at least one monster');

    const entries = monsterCatalogEntries(GAME_DATA, new Set([discoveredId]));
    const discovered = entries.find((entry) => entry.id === discoveredId);
    const locked = entries.find((entry) => entry.id !== discoveredId);

    expect(discovered).toMatchObject({
      id: discoveredId,
      state: 'unlocked',
      details: { id: discoveredId },
    });
    expect(locked).toMatchObject({ state: 'locked', details: undefined });
  });

  it('merges roster discoveries and ignores stale stored ids', () => {
    const firstId = GAME_DATA.monsters[0]?.id;
    const secondId = GAME_DATA.monsters[1]?.id;
    if (!firstId || !secondId) throw new Error('The catalog needs at least two monsters');

    const restored = normalizeDiscoveredMonsterIds(GAME_DATA, [firstId, 'removed-monster', 42]);
    const roster = [createMonster(GAME_DATA, secondId, 'catalog-test-monster')];
    const merged = mergeDiscoveredMonsterIds(GAME_DATA, restored, roster);

    expect([...merged].sort()).toEqual([firstId, secondId].sort());
  });

  it('finds only special recipes that create or consume a selected species', () => {
    const resultRelations = specialRecipeRelationsFor(GAME_DATA, 'fire-spirit-3');
    const parentRelations = specialRecipeRelationsFor(GAME_DATA, 'light-dragon-2');
    const unrelatedRelations = specialRecipeRelationsFor(GAME_DATA, 'fire-dragon-5');

    expect(resultRelations.createdBy.map((recipe) => recipe.id)).toEqual(['dawn-chimera']);
    expect(resultRelations.usedBy).toEqual([]);
    expect(parentRelations.createdBy).toEqual([]);
    expect(parentRelations.usedBy.map((recipe) => recipe.id)).toEqual([
      'dawn-chimera',
      'cinder-contract',
      'umbral-grove',
    ]);
    expect(unrelatedRelations).toEqual({ createdBy: [], usedBy: [] });
  });

  it('keeps both special recipe directions empty for oddity species', () => {
    expect(specialRecipeRelationsFor(GAME_DATA, 'buried-mole-1')).toEqual({
      createdBy: [],
      usedBy: [],
    });
    expect(specialRecipeRelationsFor(GAME_DATA, 'mystery-egg-2')).toEqual({
      createdBy: [],
      usedBy: [],
    });
  });
});
