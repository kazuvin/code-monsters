import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { simulateBattle } from './battle';
import { createMonster } from './monster';

const team = (prefix: string, definitions: string[]) =>
  definitions.map((definitionId, index) =>
    createMonster(GAME_DATA, definitionId, `${prefix}-${index}`, {
      xp: 18,
    }),
  );

describe('deterministic 3v3 battle', () => {
  it('replays the same battle exactly from the same seed and inputs', () => {
    const input = {
      player: team('p', ['light-dragon-1', 'dark-demon-1', 'fire-spirit-1']),
      enemy: team('e', ['dark-dragon-1', 'fire-demon-1', 'light-spirit-1']),
      seed: 7261,
    };

    expect(simulateBattle(GAME_DATA, input)).toEqual(simulateBattle(GAME_DATA, input));
  });

  it('resolves a full team battle and emits serializable playback frames', () => {
    const result = simulateBattle(GAME_DATA, {
      player: team('p', ['light-dragon-1', 'dark-demon-1', 'fire-spirit-1']),
      enemy: team('e', ['dark-dragon-1', 'fire-demon-1', 'light-spirit-1']),
      seed: 18,
    });

    expect(['player', 'enemy', 'draw']).toContain(result.winner);
    expect(result.durationSeconds).toBeLessThanOrEqual(66);
    expect(result.frames.length).toBeGreaterThan(3);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('starts exponential environment-collapse damage at 45 seconds', () => {
    const slowData = structuredClone(GAME_DATA);
    slowData.rules.battle.baseActionSeconds = 1000;
    const result = simulateBattle(slowData, {
      player: team('p', ['light-dragon-1', 'dark-demon-1', 'fire-spirit-1']),
      enemy: team('e', ['dark-dragon-1', 'fire-demon-1', 'light-spirit-1']),
      seed: 88,
    });
    const environmentFrames = result.frames.filter((frame) => frame.kind === 'environment');

    expect(environmentFrames[0]?.atSeconds).toBe(45);
    expect(environmentFrames[0]?.text).toContain('5%');
    expect(environmentFrames[1]?.text).toContain('8%');
    expect(result.durationSeconds).toBeLessThanOrEqual(66);
  });
});
