import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { createMonster } from './monster';
import {
  applyBattleResult,
  buyMonster,
  chooseEvent,
  chooseDraftMonster,
  continueEvent,
  continueRun,
  createCasualRun,
  moveMonsterToPartySlot,
  skipEvent,
} from './run';

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

    expect(run.schemaVersion).toBe(3);
    expect(run.contentVersion).toBe(GAME_DATA.rules.contentVersion);
    expect(run.commandLogVersion).toBe(1);
    expect(run.phase).toBe('prepare');
    expect(run.roster).toHaveLength(3);
    expect(run.activeIds).toHaveLength(3);
    expect(run.coins).toBe(10);
    expect(run.cycle).toBe(1);
    expect(run.commandLog).toEqual(
      run.roster.map((monster, index) => ({
        schemaVersion: 1,
        index: index + 1,
        cycle: 1,
        phase: 'draft',
        kind: 'draft-monster',
        definitionId: monster.definitionId,
        monsterId: monster.id,
      })),
    );
  });

  it('records successful commands without logging rejected attempts', () => {
    const run = finishDraft();
    const offer = run.shop?.monsters[0];
    expect(offer).toBeTruthy();

    const bought = buyMonster(GAME_DATA, run, offer?.id ?? '');
    expect(bought.ok).toBe(true);
    expect(bought.state.commandLog.at(-1)).toMatchObject({
      schemaVersion: 1,
      index: 4,
      cycle: 1,
      phase: 'prepare',
      kind: 'buy-monster',
      offerId: offer?.id,
      definitionId: offer?.definitionId,
      monsterId: 'monster-4',
    });

    const rejected = buyMonster(GAME_DATA, bought.state, 'missing-offer');
    expect(rejected.ok).toBe(false);
    expect(rejected.state.commandLog).toEqual(bought.state.commandLog);
  });

  it('ends immediately on the fifth loss', () => {
    let run = finishDraft();
    for (let index = 0; index < 5; index += 1) {
      run = applyBattleResult(GAME_DATA, run, {
        winner: 'enemy',
        durationSeconds: 12,
        frames: [],
        damageByTeam: { player: 0, enemy: 1 },
        monsterReports: [],
      });
      run = continueRun(GAME_DATA, run);
      if (run.phase === 'event') run = skipEvent(GAME_DATA, run);
    }

    expect(run.phase).toBe('finished');
    expect(run.losses).toBe(5);
    expect(run.commandLog.filter((command) => command.kind === 'battle-complete')).toHaveLength(5);
    expect(run.commandLog.at(-1)).toMatchObject({
      kind: 'finish-run',
      reason: 'max-losses',
    });
  });

  it('ends after exactly twelve completed cycles', () => {
    let run = finishDraft();
    for (let index = 0; index < 12; index += 1) {
      run = applyBattleResult(GAME_DATA, run, {
        winner: 'player',
        durationSeconds: 12,
        frames: [],
        damageByTeam: { player: 1, enemy: 0 },
        monsterReports: [],
      });
      run = continueRun(GAME_DATA, run);
      if (run.phase === 'event') run = skipEvent(GAME_DATA, run);
    }

    expect(run.phase).toBe('finished');
    expect(run.completedCycles).toBe(12);
    expect(run.wins).toBe(12);
  });

  it('reorders monsters inside the active formation', () => {
    const run = finishDraft();
    const [first, second, third] = run.activeIds;

    const result = moveMonsterToPartySlot(GAME_DATA, run, first as string, 'active', 2);

    expect(result.ok).toBe(true);
    expect(result.state.activeIds).toEqual([second, third, first]);
  });

  it('swaps a bench monster with an occupied active slot', () => {
    const run = finishDraft();
    const benchMonster = createMonster(GAME_DATA, 'fire-dragon-1', 'bench-1');
    const withBench = { ...run, roster: [...run.roster, benchMonster] };
    const displacedId = run.activeIds[1];

    const result = moveMonsterToPartySlot(GAME_DATA, withBench, benchMonster.id, 'active', 1);

    expect(result.ok).toBe(true);
    expect(result.state.activeIds[1]).toBe(benchMonster.id);
    expect(
      result.state.roster.filter((monster) => !result.state.activeIds.includes(monster.id)).map(({ id }) => id),
    ).toEqual([displacedId]);
  });

  it('swaps an active monster with a full bench slot', () => {
    const run = finishDraft();
    const bench = ['light-dragon-1', 'dark-dragon-1', 'fire-dragon-1', 'light-demon-1'].map((definitionId, index) =>
      createMonster(GAME_DATA, definitionId, `bench-${index}`),
    );
    const withFullBench = { ...run, roster: [...run.roster, ...bench] };
    const activeId = run.activeIds[0] as string;

    const result = moveMonsterToPartySlot(GAME_DATA, withFullBench, activeId, 'bench', 2);

    expect(result.ok).toBe(true);
    expect(result.state.activeIds[0]).toBe(bench[2]?.id);
    expect(result.state.roster.filter((monster) => !result.state.activeIds.includes(monster.id))[2]?.id).toBe(activeId);
  });

  it('offers three different route events and resolves targeted growth before preparation', () => {
    let run = finishDraft();
    run = { ...run, phase: 'event', eventChoices: ['focused-training'] };
    const target = run.roster[0]!;

    run = chooseEvent(GAME_DATA, run, 'focused-training', target.id);

    expect(run.phase).toBe('event-result');
    expect(run.roster[0]?.xp).toBe(target.xp + 10);
    expect(run.eventResolution?.targetMonsterId).toBe(target.id);
    expect(continueEvent(run).phase).toBe('prepare');
  });

  it('applies persistent shop luck and resolves gambling deterministically', () => {
    const base = finishDraft();
    const shopRun = chooseEvent(
      GAME_DATA,
      { ...base, phase: 'event', eventChoices: ['star-observatory'] },
      'star-observatory',
    );
    const wager = { ...base, coins: 10, phase: 'event' as const, eventChoices: ['coin-wager'] };
    const first = chooseEvent(GAME_DATA, wager, 'coin-wager');
    const second = chooseEvent(GAME_DATA, wager, 'coin-wager');

    expect(shopRun.shopLuckBonus).toBeCloseTo(0.08);
    expect(first).toEqual(second);
    expect(first.phase).toBe('event-result');
    expect(first.coins === 7 || first.coins === 17).toBe(true);
    expect(first.eventResolution?.tone === 'gain' || first.eventResolution?.tone === 'loss').toBe(true);
  });
});
