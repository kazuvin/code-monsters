import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { applyBattleResult, buyMonster, chooseDraftMonster, createCasualRun } from './run';
import { createPlaytestReport } from './playtest-report';

const finishDraft = () => {
  let run = createCasualRun(GAME_DATA, 73);
  while (run.phase === 'draft') {
    run = chooseDraftMonster(GAME_DATA, run, run.draftChoices[0]);
  }
  return run;
};

describe('playtest report', () => {
  it('exports a versioned, compact run summary with the complete command log', () => {
    let run = finishDraft();
    const offer = run.shop?.monsters[0];
    const purchase = buyMonster(GAME_DATA, run, offer?.id ?? '');
    expect(purchase.ok).toBe(true);
    run = purchase.state;
    run = applyBattleResult(GAME_DATA, run, {
      winner: 'player',
      durationSeconds: 18.4,
      frames: [],
      damageByTeam: { player: 120, enemy: 84 },
      monsterReports: [],
    });

    const report = createPlaytestReport(GAME_DATA, run, {
      startedAt: '2026-07-25T00:00:00.000Z',
      completedAt: '2026-07-25T00:02:00.000Z',
    });

    expect(report.schemaVersion).toBe(1);
    expect(report.contentVersion).toBe(GAME_DATA.rules.contentVersion);
    expect(report.run).toMatchObject({
      seed: 73,
      durationSeconds: 120,
      wins: 1,
      losses: 0,
      completedCycles: 1,
      commandCount: 5,
    });
    expect(report.activity).toMatchObject({
      drafted: 3,
      monstersBought: 1,
      battles: 1,
      battleWins: 1,
      breeds: 0,
    });
    expect(report.finalRoster).toHaveLength(4);
    expect(report.commandLog).toEqual(run.commandLog);
    expect(JSON.stringify(report)).not.toContain('"frames"');
  });
});
