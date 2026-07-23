import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { applyBattleResult, chooseDraftMonster, continueRun, createCasualRun, skipEvent } from './run';

const finishDraft = () => {
  let run = createCasualRun(GAME_DATA, 42);
  while (run.phase === 'draft') {
    run = chooseDraftMonster(GAME_DATA, run, run.draftChoices[0]);
  }
  return run;
};

describe('casual run', () => {
  it('starts with three free monsters and cycle-one income', () => {
    const run = finishDraft();

    expect(run.phase).toBe('prepare');
    expect(run.roster).toHaveLength(3);
    expect(run.activeIds).toHaveLength(3);
    expect(run.coins).toBe(10);
    expect(run.cycle).toBe(1);
  });

  it('ends immediately on the fifth loss', () => {
    let run = finishDraft();
    for (let index = 0; index < 5; index += 1) {
      run = applyBattleResult(GAME_DATA, run, {
        winner: 'enemy',
        durationSeconds: 12,
        frames: [],
        damageByTeam: { player: 0, enemy: 1 },
      });
      run = continueRun(GAME_DATA, run);
      if (run.phase === 'event') run = skipEvent(GAME_DATA, run);
    }

    expect(run.phase).toBe('finished');
    expect(run.losses).toBe(5);
  });

  it('ends after exactly twelve completed cycles', () => {
    let run = finishDraft();
    for (let index = 0; index < 12; index += 1) {
      run = applyBattleResult(GAME_DATA, run, {
        winner: 'player',
        durationSeconds: 12,
        frames: [],
        damageByTeam: { player: 1, enemy: 0 },
      });
      run = continueRun(GAME_DATA, run);
      if (run.phase === 'event') run = skipEvent(GAME_DATA, run);
    }

    expect(run.phase).toBe('finished');
    expect(run.completedCycles).toBe(12);
    expect(run.wins).toBe(12);
  });
});
