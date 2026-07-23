import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import {
  classifyBalanceSkills,
  compareBalanceResults,
  optionsFromBalanceBaseline,
  runBalanceSimulation,
  type BalanceSimulationResult,
} from './balance-simulation';
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
      [3, 3, 60],
      [5, 5, 88],
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

  it('refreshes playable skills and builds instead of inheriting a stale baseline catalog', () => {
    const baseline = runBalanceSimulation(GAME_DATA, quickConfig);
    const data = structuredClone(GAME_DATA);
    const strike = data.blocks.find((block) => block.id === 'strike')!;
    const strikeDesign = data.buildDesign.skills.find((skill) => skill.blockId === 'strike')!;
    data.blocks.push({ ...strike, id: 'test-pulse', code: 'TEST', title: '試験波' });
    data.buildDesign.skills.push({
      ...strikeDesign,
      id: 'test-pulse',
      blockId: 'test-pulse',
      title: '試験波',
    });

    const current = runBalanceSimulation(data, optionsFromBalanceBaseline(baseline, {}));

    expect(current.config.skillIds).toContain('test-pulse');
    expect(current.config.buildIds).toEqual(data.buildDesign.builds.map((build) => build.id));
    expect(compareBalanceResults(current, baseline).compatible).toBe(false);
  });

  it('keeps cross-build outcomes inside the tuning guardrail', () => {
    const result = runBalanceSimulation(GAME_DATA, {
      ...quickConfig,
      battles: 1200,
      runs: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    });
    const crossBuildMatchups = result.buildMatchups.filter((matchup) => matchup.playerBuild !== matchup.enemyBuild);

    expect(crossBuildMatchups).toHaveLength(
      GAME_DATA.buildDesign.builds.length * (GAME_DATA.buildDesign.builds.length - 1),
    );
    crossBuildMatchups.forEach((matchup) => {
      expect(matchup.battles, `${matchup.playerBuild} into ${matchup.enemyBuild}`).toBeGreaterThan(50);
      expect(matchup.playerScoreRate, `${matchup.playerBuild} into ${matchup.enemyBuild}`).toBeGreaterThanOrEqual(0.25);
      expect(matchup.playerScoreRate, `${matchup.playerBuild} into ${matchup.enemyBuild}`).toBeLessThanOrEqual(0.75);
    });
  }, 10_000);

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

  it('does not compare payoff skills from different payoff paths', () => {
    const result = runBalanceSimulation(GAME_DATA, {
      ...quickConfig,
      battles: 2,
      runs: [5],
      skillTrials: 1,
      skillIds: ['discharge-bow'],
    });
    const dischargeBow = result.skills.find((skill) => skill.blockId === 'discharge-bow');

    expect(dischargeBow?.counterfactual.samples).toBe(0);
    expect(dischargeBow?.ablation.samples).toBe(1);
  });

  it('does not compare skills with different placement identities', () => {
    const result = runBalanceSimulation(GAME_DATA, {
      ...quickConfig,
      battles: 2,
      runs: [9],
      skillTrials: 1,
      skillIds: ['return-coil'],
    });
    const returnCoil = result.skills.find((skill) => skill.blockId === 'return-coil');

    expect(returnCoil?.counterfactual.samples).toBe(0);
    expect(returnCoil?.ablation.samples).toBe(1);
  });

  it('renders machine-readable CSV and a human-readable Markdown report', () => {
    const result = runBalanceSimulation(GAME_DATA, quickConfig);
    const markdown = renderBalanceMarkdown(result);
    const csv = renderBalanceCsv(result);

    expect(markdown).toContain('# Code Monsters バランスシミュレーション');
    expect(markdown).toContain('## スキル別集計');
    expect(csv).toContain('blockId,title,placementPatternId,rarity,appearances');
    expect(csv).toContain(`strike,${GAME_DATA.blocks.find((block) => block.id === 'strike')?.title},free,common`);
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

  it('flags high-rarity skills whose targeted ablation impact separates from their rarity peers', () => {
    const result = runBalanceSimulation(GAME_DATA, quickConfig);
    const skills = structuredClone(result.skills);
    const setAblation = (blockId: string, scoreLift: number, lower: number, upper: number) => {
      const skill = skills.find((candidate) => candidate.blockId === blockId)!;
      skill.ablation = {
        samples: 80,
        scoreLift,
        scoreLift95: { lower, upper },
        reportedDamageDelta: 0,
        reportedDefenseDelta: 0,
        battleTicksDelta: 0,
      };
    };
    setAblation('overcharge-cannon', 0.65, 0.54, 0.76);
    setAblation('venom-bloom', 0.32, 0.22, 0.42);
    setAblation('repair-dividend', 0, -0.07, 0.07);
    setAblation('rupture-stake', 0, -0.07, 0.07);
    setAblation('charge-bastion', 0.3, 0.2, 0.4);
    setAblation('accelerator', 0.3, 0.2, 0.4);
    const overcharge = skills.find((skill) => skill.blockId === 'overcharge-cannon')!;
    overcharge.matchedSamples = 80;
    overcharge.matchedControlSamples = 80;
    overcharge.matchedScoreLift = 0.2;
    const dividend = skills.find((skill) => skill.blockId === 'repair-dividend')!;
    dividend.matchedSamples = 80;
    dividend.matchedControlSamples = 80;
    dividend.matchedScoreLift = -0.2;
    const rupture = skills.find((skill) => skill.blockId === 'rupture-stake')!;
    rupture.matchedSamples = 1000;
    rupture.matchedControlSamples = 40;
    rupture.matchedScoreLift = -0.3;

    const classified = classifyBalanceSkills(skills, {
      ...result.config,
      minimumCounterfactualSamples: 48,
    });

    expect(classified.find((skill) => skill.blockId === 'overcharge-cannon')).toMatchObject({
      ablationRarityDelta: 0.33,
      suspectedOutlier: true,
      signals: expect.arrayContaining(['ablation-rarity-high']),
    });
    expect(classified.find((skill) => skill.blockId === 'repair-dividend')).toMatchObject({
      ablationRarityDelta: -0.32,
      suspectedOutlier: false,
    });
    expect(classified.find((skill) => skill.blockId === 'repair-dividend')?.signals).not.toContain(
      'ablation-rarity-low',
    );
    expect(classified.find((skill) => skill.blockId === 'rupture-stake')).toMatchObject({
      ablationRarityDelta: -0.3,
      suspectedOutlier: false,
      signals: expect.arrayContaining(['ablation-rarity-low']),
    });
    expect(classified.find((skill) => skill.blockId === 'rupture-stake')?.signals).not.toContain(
      'matched-underrepresented',
    );
  });
});
