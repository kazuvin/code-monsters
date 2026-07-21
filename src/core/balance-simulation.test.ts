import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { compareBalanceResults, runBalanceSimulation, type BalanceSimulationResult } from './balance-simulation';
import { renderBalanceCsv, renderBalanceMarkdown } from './balance-report';

const quickConfig = {
  battles: 6,
  runs: [1, 3, 5],
  seed: 20260721,
  skillTrials: 0,
  minimumSamples: 2,
  winRateLiftThreshold: 0.08,
  efficiencyZScoreThreshold: 2,
};

describe('balance simulation', () => {
  it('replays the same seeded, side-swapped tournament deterministically', () => {
    const first = runBalanceSimulation(GAME_DATA, quickConfig);
    const second = runBalanceSimulation(GAME_DATA, quickConfig);

    expect(second).toEqual(first);
    expect(first.summary.tournamentBattles).toBe(6);
    expect(first.summary.sideSwappedPairs).toBe(3);
    expect(first.summary.teamSamples).toBe(12);
    expect(first.byRun.reduce((total, run) => total + run.battles, 0)).toBe(6);
    expect(first.byRun.map((run) => [run.run, run.level, run.budget])).toEqual([
      [1, 1, 32],
      [3, 3, 52],
      [5, 5, 72],
    ]);
    expect(first.byRun.every((run) => run.averageBuildCost <= run.budget)).toBe(true);
  });

  it('keeps every playable skill visible even when it has no direct trace events', () => {
    const result = runBalanceSimulation(GAME_DATA, quickConfig);
    const playableBlockIds = GAME_DATA.buildDesign.skills.flatMap((skill) =>
      skill.status === 'playable' && skill.blockId ? [skill.blockId] : [],
    );

    expect(result.skills.map((skill) => skill.blockId).sort()).toEqual([...playableBlockIds].sort());
    expect(result.skills.find((skill) => skill.blockId === 'amplifier')).toMatchObject({
      blockId: 'amplifier',
      title: GAME_DATA.blocks.find((block) => block.id === 'amplifier')?.title,
    });
  });

  it('keeps poison and charge cross-trait outcomes inside the tuning guardrail', () => {
    const result = runBalanceSimulation(GAME_DATA, {
      ...quickConfig,
      battles: 400,
      runs: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    });
    const poisonIntoCharge = result.traitMatchups.find(
      (matchup) => matchup.playerTrait === 'poison' && matchup.enemyTrait === 'charge',
    );

    expect(poisonIntoCharge?.battles).toBeGreaterThan(50);
    expect(poisonIntoCharge?.playerScoreRate).toBeGreaterThanOrEqual(0.35);
    expect(poisonIntoCharge?.playerScoreRate).toBeLessThanOrEqual(0.65);
  });

  it('runs a connector-compatible counterfactual on both sides', () => {
    const result = runBalanceSimulation(GAME_DATA, {
      ...quickConfig,
      battles: 2,
      runs: [5],
      skillTrials: 1,
      skillIds: ['strike'],
    });
    const strike = result.skills.find((skill) => skill.blockId === 'strike');

    expect(strike?.counterfactual.samples).toBe(1);
    expect(strike?.ablation.samples).toBe(1);
    expect(result.summary.benchmarkBattles).toBe(8);
    expect(strike?.counterfactual.scoreLift).toBeGreaterThanOrEqual(-1);
    expect(strike?.counterfactual.scoreLift).toBeLessThanOrEqual(1);
    expect(strike?.ablation.scoreLift).toBeGreaterThanOrEqual(-1);
    expect(strike?.ablation.scoreLift).toBeLessThanOrEqual(1);
  });

  it('renders machine-readable CSV and a human-readable Markdown report', () => {
    const result = runBalanceSimulation(GAME_DATA, quickConfig);
    const markdown = renderBalanceMarkdown(result);
    const csv = renderBalanceCsv(result);

    expect(markdown).toContain('# Code Monsters バランスシミュレーション');
    expect(markdown).toContain('## スキル別集計');
    expect(csv).toContain('blockId,title,rarity,appearances');
    expect(csv).toContain(`strike,${GAME_DATA.blocks.find((block) => block.id === 'strike')?.title},common`);
  });

  it('compares a current run with a fixed-seed baseline and finds newly flagged skills', () => {
    const baseline = runBalanceSimulation(GAME_DATA, quickConfig);
    const current = JSON.parse(JSON.stringify(baseline)) as BalanceSimulationResult;
    current.skills[0].suspectedOutlier = true;
    current.skills[0].signals = ['counterfactual-overpowered'];

    const comparison = compareBalanceResults(current, baseline);

    expect(comparison.compatible).toBe(true);
    expect(comparison.newSuspectedOutliers).toEqual([current.skills[0].blockId]);
    expect(compareBalanceResults(baseline, baseline).newSuspectedOutliers).toEqual([]);
  });
});
