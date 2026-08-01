import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { battleStatsFor, createMonster, farewellCoinsFor, skillIdsFor, statBreakdownFor } from './monster';

describe('immediate monster builds', () => {
  it('creates a battle-ready monster with three native skills and default gambits', () => {
    const definition = GAME_DATA.monsters[0];
    if (!definition) throw new Error('Expected a monster definition');
    const monster = createMonster(GAME_DATA, definition.id, 'instant');

    expect(monster.skillIds).toEqual([...definition.intrinsicSkillIds, definition.defaultSkillId]);
    expect(monster.gambits).toHaveLength(3);
    expect(monster.gambits.map((gambit) => gambit.action.skillId)).toEqual(monster.skillIds);
    expect(monster).not.toHaveProperty('level');
    expect(monster).not.toHaveProperty('xp');
  });

  it('uses species stats plus equipment without growth or inherited stat layers', () => {
    const definition = GAME_DATA.monsters.find((entry) => entry.id === 'light-dragon-1');
    if (!definition) throw new Error('Expected light-dragon-1');
    const equipment = GAME_DATA.equipment.find((entry) => entry.statBonus.attack);
    const monster = createMonster(GAME_DATA, definition.id, 'equipped', { equipmentId: equipment?.id });
    const breakdown = statBreakdownFor(GAME_DATA, monster);

    expect(breakdown.attack).toEqual({
      base: definition.baseStats.attack,
      equipment: equipment?.statBonus.attack ?? 0,
      total: Math.min(Number.POSITIVE_INFINITY, definition.baseStats.attack + (equipment?.statBonus.attack ?? 0)),
      capped: false,
    });
    expect(battleStatsFor(GAME_DATA, monster).attack).toBe(breakdown.attack.total);
  });

  it('accepts any three unique known skills for a bred child and rejects invalid sets', () => {
    const definition = GAME_DATA.monsters[0];
    if (!definition) throw new Error('Expected a monster definition');
    const selected = GAME_DATA.skills.slice(0, 3).map((skill) => skill.id) as [string, string, string];
    const monster = createMonster(GAME_DATA, definition.id, 'custom', { skillIds: selected });

    expect(skillIdsFor(GAME_DATA, monster)).toEqual(selected);
    expect(() =>
      createMonster(GAME_DATA, definition.id, 'duplicate', { skillIds: [selected[0], selected[0], selected[1]] }),
    ).toThrow('重複');
  });

  it('uses the species sell value with no time-based farewell bonus', () => {
    const definition = GAME_DATA.monsters[0];
    if (!definition) throw new Error('Expected a monster definition');
    expect(farewellCoinsFor(GAME_DATA, createMonster(GAME_DATA, definition.id, 'farewell'))).toBe(definition.sellPrice);
  });
});
