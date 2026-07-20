import { describe, expect, it } from 'vitest';
import { GAME_DATA, validateGameData } from './game-data';

describe('game data', () => {
  it('contains a complete 3x4 program and valid stable references', () => {
    expect(validateGameData(GAME_DATA)).toEqual([]);
    expect(GAME_DATA.playerProgram).toHaveLength(3);
    expect(GAME_DATA.playerProgram.every((row) => row.length === 4)).toBe(true);
  });

  it('rejects an unknown command in a program', () => {
    const invalid = structuredClone(GAME_DATA);
    invalid.enemyProgram[0][0] = 'missing-command';

    expect(validateGameData(invalid)).toContain('enemyProgram[0][0] references unknown command "missing-command"');
  });
});
