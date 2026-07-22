import { describe, expect, it } from 'vitest';
import { battleCoinsEarned, battleReward } from './economy';
import { GAME_DATA } from '../game/game-data';

describe('run economy', () => {
  it('awards coins after both victories and defeats', () => {
    expect(GAME_DATA.rules.winReward).toBe(16);
    expect(GAME_DATA.rules.retryReward).toBe(12);
    expect(battleReward(GAME_DATA, 'player')).toBe(GAME_DATA.rules.winReward);
    expect(battleReward(GAME_DATA, 'enemy')).toBe(GAME_DATA.rules.retryReward);
    expect(battleReward(GAME_DATA, 'enemy')).toBeGreaterThan(0);
  });

  it('totals only the selected team coin effects from the battle trace', () => {
    expect(
      battleCoinsEarned(
        [
          {
            id: '1-player-0-0-0',
            tick: 1,
            team: 'player',
            kind: 'coin',
            blockId: 'salvage-blade',
            row: 0,
            column: 0,
            value: 1,
            targetId: 'player-volt',
          },
          {
            id: '1-enemy-0-0-1',
            tick: 1,
            team: 'enemy',
            kind: 'coin',
            blockId: 'salvage-blade',
            row: 0,
            column: 0,
            value: 2,
            targetId: 'enemy-rust',
          },
        ],
        'player',
      ),
    ).toBe(1);
  });
});
