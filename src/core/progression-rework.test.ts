import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { createMonster } from './monster';

describe('progression-free rules', () => {
  it('keeps stars, levels, experience, growth, and hatching out of authoritative data', () => {
    expect(GAME_DATA.rules).not.toHaveProperty('maxWhiteStars');
    expect(GAME_DATA.rules).not.toHaveProperty('maxLevel');
    expect(GAME_DATA).not.toHaveProperty('experienceProfiles');
    expect(GAME_DATA).not.toHaveProperty('statGrowthProfiles');
    expect(GAME_DATA.monsters.every((monster) => !('whiteStars' in monster) && !('hatch' in monster))).toBe(true);
    expect(GAME_DATA.traits.every((trait) => !('stages' in trait))).toBe(true);
  });

  it('makes every acquired monster ready immediately', () => {
    const monster = createMonster(GAME_DATA, GAME_DATA.monsters[0]?.id ?? '', 'ready');
    expect(monster.skillIds).toHaveLength(3);
    expect(monster.gambits).toHaveLength(3);
    expect(monster).not.toHaveProperty('cyclesHeld');
  });
});
