import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { mergeDiscoveredMonsterIds, monsterCatalogEntries, normalizeDiscoveredMonsterIds } from './catalog';
import { createMonster } from './monster';

describe('monster catalog discovery', () => {
  it('lists all 45 monsters without exposing locked details', () => {
    const entries = monsterCatalogEntries(GAME_DATA, new Set());

    expect(entries).toHaveLength(45);
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
});
