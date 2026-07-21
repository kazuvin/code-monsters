import { describe, expect, it } from 'vitest';
import { battleReward } from './economy';
import { GAME_DATA } from '../game/game-data';

describe('run economy', () => {
  it('awards coins after both victories and defeats', () => {
    expect(battleReward(GAME_DATA, 'player')).toBe(GAME_DATA.rules.winReward);
    expect(battleReward(GAME_DATA, 'enemy')).toBe(GAME_DATA.rules.retryReward);
    expect(battleReward(GAME_DATA, 'enemy')).toBeGreaterThan(0);
  });
});
