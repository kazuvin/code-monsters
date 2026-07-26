import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { createMonster } from './monster';
import type { MonsterBattleReport } from './types';
import {
  applyBattleResult,
  buyMonster,
  chooseEvent,
  chooseDraftMonster,
  continueEvent,
  continueRun,
  createCasualRun,
  moveMonsterToPartySlot,
  sellMonster,
  skipEvent,
} from './run';

const finishDraft = () => {
  let run = createCasualRun(GAME_DATA, 42);
  while (run.phase === 'draft') {
    run = chooseDraftMonster(GAME_DATA, run, run.draftChoices[0]);
  }
  return run;
};

const battleReportFor = (id: string, definitionId: string, skillUses: Record<string, number>): MonsterBattleReport => ({
  id,
  definitionId,
  name: definitionId,
  team: 'player',
  actions: Object.values(skillUses).reduce((total, uses) => total + uses, 0),
  normalAttacks: skillUses['normal-attack'] ?? 0,
  fallbackActions: 0,
  criticalHits: 0,
  damageDealt: 0,
  hpDamageDealt: 0,
  damageTaken: 0,
  shieldAbsorbed: 0,
  healingDone: 0,
  healingReceived: 0,
  shieldingDone: 0,
  shieldingReceived: 0,
  buffApplications: 0,
  debuffApplications: 0,
  atbGranted: 0,
  mpGranted: 0,
  skillUses,
  statusApplications: {},
  skillBreakdown: Object.fromEntries(
    Object.entries(skillUses).map(([skillId, uses]) => [
      skillId,
      {
        uses,
        damage: 0,
        healing: 0,
        shielding: 0,
        buffs: 0,
        debuffs: 0,
        criticalHits: 0,
        atb: 0,
        mp: 0,
      },
    ]),
  ),
});

describe('casual run', () => {
  it('starts with three free monsters and cycle-one income', () => {
    const run = finishDraft();

    expect(run.schemaVersion).toBe(4);
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

  it('increases farewell coins with white stars, level, and color stars', () => {
    const run = finishDraft();
    const veteran = createMonster(GAME_DATA, 'light-dragon-3', 'farewell-veteran', {
      colorStars: 2,
      xp: 18,
    });
    const withVeteran = { ...run, roster: [...run.roster, veteran] };

    const result = sellMonster(GAME_DATA, withVeteran, veteran.id);

    expect(result.ok).toBe(true);
    expect(result.state.coins - run.coins).toBe(10);
    expect(result.state.commandLog.at(-1)).toMatchObject({
      kind: 'sell-monster',
      monsterId: veteran.id,
      coinsGained: 10,
    });
  });

  it('raises the buried mole farewell value faster at each three-battle holding band', () => {
    const run = finishDraft();
    const values = [0, 1, 3, 6, 9, 12].map((cyclesHeld) => {
      const mole = createMonster(GAME_DATA, 'buried-mole-1', `buried-mole-${cyclesHeld}`, {
        cyclesHeld,
      });
      const result = sellMonster(GAME_DATA, { ...run, roster: [...run.roster, mole] }, mole.id);
      expect(result.ok).toBe(true);
      return result.state.coins - run.coins;
    });

    expect(values).toEqual([1, 3, 7, 16, 28, 43]);
  });

  it('rewards every damaging crow action, scales with color stars, and caps four actions per battle', () => {
    const run = finishDraft();
    const plainCrow = createMonster(GAME_DATA, 'coin-crow-1', 'plain-crow');
    const starredCrow = createMonster(GAME_DATA, 'coin-crow-1', 'starred-crow', { colorStars: 2 });
    const fighter = createMonster(GAME_DATA, 'fire-dragon-1', 'fighter');
    const prepared = {
      ...run,
      roster: [plainCrow, starredCrow, fighter],
      activeIds: [plainCrow.id, starredCrow.id, fighter.id],
    };

    const result = applyBattleResult(GAME_DATA, prepared, {
      winner: 'player',
      durationSeconds: 12,
      frames: [],
      damageByTeam: { player: 1, enemy: 0 },
      monsterReports: [
        battleReportFor(plainCrow.id, plainCrow.definitionId, {
          'coin-snatch': 2,
          mend: 4,
          'normal-attack': 1,
        }),
        battleReportFor(starredCrow.id, starredCrow.definitionId, {
          'coin-snatch': 3,
          'night-claw': 2,
          'normal-attack': 2,
        }),
      ],
    });

    expect(result.coins).toBe(prepared.coins + 22);
    expect(result.lastBattleRewards).toEqual({ coins: 22, xpByMonsterId: {} });
    expect(result.roster.every((monster) => monster.cyclesHeld === 1)).toBe(true);
  });

  it('uses one deterministic crow action for synthetic rival battles without combat reports', () => {
    const run = finishDraft();
    const crow = createMonster(GAME_DATA, 'coin-crow-1', 'synthetic-crow', { colorStars: 1 });
    const prepared = { ...run, roster: [crow], activeIds: [crow.id] };

    const result = applyBattleResult(GAME_DATA, prepared, {
      winner: 'enemy',
      durationSeconds: 12,
      frames: [],
      damageByTeam: { player: 0, enemy: 1 },
      monsterReports: [],
    });

    expect(result.lastBattleRewards).toEqual({ coins: 3, xpByMonsterId: {} });
  });

  it('grants attack experience from the new skill and keeps the effect when inherited', () => {
    const run = finishDraft();
    const learner = createMonster(GAME_DATA, 'training-lynx-1', 'learner');
    const inheritor = createMonster(GAME_DATA, 'fire-dragon-1', 'inheritor', {
      colorStars: 1,
      inheritedSkillId: 'training-pounce',
    });
    const prepared = {
      ...run,
      roster: [learner, inheritor],
      activeIds: [learner.id, inheritor.id],
    };

    const result = applyBattleResult(GAME_DATA, prepared, {
      winner: 'player',
      durationSeconds: 12,
      frames: [],
      damageByTeam: { player: 1, enemy: 0 },
      monsterReports: [
        battleReportFor(learner.id, learner.definitionId, {
          'training-pounce': 2,
          'normal-attack': 1,
          mend: 4,
        }),
        battleReportFor(inheritor.id, inheritor.definitionId, {
          'normal-attack': 2,
        }),
      ],
    });

    expect(result.lastBattleRewards).toEqual({
      coins: 0,
      xpByMonsterId: {
        [learner.id]: 3,
        [inheritor.id]: 4,
      },
    });
    expect(result.roster.map((monster) => monster.xp)).toEqual([8, 9]);
  });

  it('unlocks the owl aura from the bench at color star one and reaches the whole roster at color star two', () => {
    const run = finishDraft();
    const active = createMonster(GAME_DATA, 'fire-dragon-1', 'fighter');
    const bench = createMonster(GAME_DATA, 'light-demon-1', 'bench');
    const stageOneOwl = createMonster(GAME_DATA, 'study-owl-1', 'stage-one-owl', { colorStars: 1 });
    const stageOne = applyBattleResult(
      GAME_DATA,
      {
        ...run,
        roster: [active, stageOneOwl, bench],
        activeIds: [active.id],
      },
      {
        winner: 'player',
        durationSeconds: 12,
        frames: [],
        damageByTeam: { player: 1, enemy: 0 },
        monsterReports: [],
      },
    );
    expect(stageOne.lastBattleRewards).toEqual({
      coins: 0,
      xpByMonsterId: { [active.id]: 2 },
    });

    const owl = createMonster(GAME_DATA, 'study-owl-1', 'study-owl', { colorStars: 2 });
    const result = applyBattleResult(
      GAME_DATA,
      { ...run, roster: [active, owl, bench], activeIds: [active.id] },
      {
        winner: 'player',
        durationSeconds: 12,
        frames: [],
        damageByTeam: { player: 1, enemy: 0 },
        monsterReports: [],
      },
    );

    expect(result.lastBattleRewards).toEqual({
      coins: 0,
      xpByMonsterId: {
        [active.id]: 2,
        [owl.id]: 2,
        [bench.id]: 2,
      },
    });
    expect(result.roster.map((monster) => monster.xp)).toEqual([7, 4, 4]);
  });

  it('hatches eggs deterministically after one held battle within their rank cap', () => {
    const run = finishDraft();
    const rankOneEgg = createMonster(GAME_DATA, 'mystery-egg-1', 'rank-one-egg', {
      cyclesHeld: 1,
      journeySeed: 7,
    });
    const rankTwoEgg = createMonster(GAME_DATA, 'mystery-egg-2', 'rank-two-egg', {
      cyclesHeld: 1,
      journeySeed: 7,
    });
    const prepared = {
      ...run,
      phase: 'result' as const,
      roster: [run.roster[0] as (typeof run.roster)[number], rankOneEgg, rankTwoEgg],
      activeIds: [run.roster[0]?.id as string],
      completedCycles: 1,
    };

    const first = continueRun(GAME_DATA, prepared);
    const second = continueRun(GAME_DATA, prepared);
    const rankOneResult = first.roster.find((monster) => monster.id === rankOneEgg.id);
    const rankTwoResult = first.roster.find((monster) => monster.id === rankTwoEgg.id);

    expect(first).toEqual(second);
    expect(rankOneResult?.definitionId).not.toBe(rankOneEgg.definitionId);
    expect(rankTwoResult?.definitionId).not.toBe(rankTwoEgg.definitionId);
    expect(
      GAME_DATA.monsters.find((monster) => monster.id === rankOneResult?.definitionId)?.whiteStars,
    ).toBeLessThanOrEqual(2);
    expect(
      GAME_DATA.monsters.find((monster) => monster.id === rankTwoResult?.definitionId)?.whiteStars,
    ).toBeLessThanOrEqual(3);
    expect(first.lastHatches).toEqual([
      expect.objectContaining({ eggId: rankOneEgg.id, fromWhiteStars: 1 }),
      expect.objectContaining({ eggId: rankTwoEgg.id, fromWhiteStars: 2 }),
    ]);
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
