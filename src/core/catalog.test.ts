import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import {
  eventCatalogEntries,
  mergeDiscoveredEventIds,
  mergeDiscoveredMonsterIds,
  mergeDiscoveredSkillIds,
  mergeSkillsFromDiscoveredMonsters,
  monsterCatalogEntries,
  normalizeDiscoveredEventIds,
  normalizeDiscoveredMonsterIds,
  normalizeDiscoveredSkillIds,
  skillCatalogEntries,
  skillHolderRelationsFor,
  specialRecipeRelationsFor,
} from './catalog';
import { createMonster, skillIdsFor } from './monster';

describe('monster catalog discovery', () => {
  it('lists all 52 monsters without exposing locked details', () => {
    const entries = monsterCatalogEntries(GAME_DATA, new Set());

    expect(entries).toHaveLength(52);
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

  it('reveals every monster for developer viewing without changing discovery', () => {
    const discoveredIds = new Set<string>();
    const entries = monsterCatalogEntries(GAME_DATA, discoveredIds, true);

    expect(entries.every((entry) => entry.state === 'unlocked' && entry.details)).toBe(true);
    expect(discoveredIds.size).toBe(0);
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

  it('keeps both special recipe directions empty when a standalone species has no special recipe', () => {
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

describe('skill catalog discovery', () => {
  it('unlocks the skills actually held by welcomed monsters and ignores stale ids', () => {
    const monster = createMonster(GAME_DATA, 'light-dragon-1', 'skill-catalog-monster', {
      inheritedSkillId: 'mend',
    });
    const restored = normalizeDiscoveredSkillIds(GAME_DATA, ['missing-skill']);
    const discovered = mergeDiscoveredSkillIds(GAME_DATA, restored, [monster]);
    const expectedSkillIds = skillIdsFor(GAME_DATA, monster);
    const entries = skillCatalogEntries(GAME_DATA, discovered);

    expect([...discovered].sort()).toEqual([...expectedSkillIds].sort());
    expect(
      entries
        .filter((entry) => entry.state === 'unlocked')
        .map((entry) => entry.id)
        .sort(),
    ).toEqual([...expectedSkillIds].sort());
    expect(entries.filter((entry) => entry.state === 'locked').every((entry) => entry.details === undefined)).toBe(
      true,
    );
  });

  it('backfills base skills from monsters discovered before the skill catalog existed', () => {
    const definition = GAME_DATA.monsters.find((monster) => monster.id === 'light-dragon-1');
    if (!definition) throw new Error('Expected a base monster definition');

    const discovered = mergeSkillsFromDiscoveredMonsters(GAME_DATA, new Set(), new Set([definition.id]));

    expect([...discovered].sort()).toEqual([...definition.intrinsicSkillIds, definition.defaultSkillId].sort());
  });

  it('shows which monster forms own a skill in intrinsic and default slots', () => {
    const relations = skillHolderRelationsFor(GAME_DATA, 'tail-swipe');

    expect(relations.intrinsic.some((monster) => monster.intrinsicSkillIds.includes('tail-swipe'))).toBe(true);
    expect(relations.default.some((monster) => monster.defaultSkillId === 'tail-swipe')).toBe(true);
    expect(relations.intrinsic.every((monster) => monster.defaultSkillId !== 'tail-swipe')).toBe(true);
    expect(relations.default.every((monster) => !monster.intrinsicSkillIds.includes('tail-swipe'))).toBe(true);
  });

  it('reveals every skill for developer viewing without recording discoveries', () => {
    const discoveredIds = new Set<string>();
    const entries = skillCatalogEntries(GAME_DATA, discoveredIds, true);

    expect(entries).toHaveLength(GAME_DATA.skills.length);
    expect(entries.every((entry) => entry.state === 'unlocked' && entry.details)).toBe(true);
    expect(discoveredIds.size).toBe(0);
  });
});

describe('event catalog discovery', () => {
  it('unlocks resolved events and ignores stale ids', () => {
    const eventId = GAME_DATA.events[0]?.id;
    if (!eventId) throw new Error('The event catalog needs at least one event');
    const restored = normalizeDiscoveredEventIds(GAME_DATA, ['missing-event']);
    const discovered = mergeDiscoveredEventIds(GAME_DATA, restored, eventId);
    const entries = eventCatalogEntries(GAME_DATA, discovered);

    expect([...discovered]).toEqual([eventId]);
    expect(entries.find((entry) => entry.id === eventId)).toMatchObject({
      state: 'unlocked',
      details: { id: eventId },
    });
    expect(entries.filter((entry) => entry.id !== eventId).every((entry) => entry.details === undefined)).toBe(true);
  });

  it('reveals every event for developer viewing without recording discoveries', () => {
    const discoveredIds = new Set<string>();
    const entries = eventCatalogEntries(GAME_DATA, discoveredIds, true);

    expect(entries).toHaveLength(GAME_DATA.events.length);
    expect(entries.every((entry) => entry.state === 'unlocked' && entry.details)).toBe(true);
    expect(discoveredIds.size).toBe(0);
  });
});
