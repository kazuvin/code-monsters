import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { analyzeCircuit } from './circuit';
import { createBattle, resolveTick } from './battle';
import { generateEnemyBuild } from './enemy-builder';
import { maxHpBonusForBodyLevel, totalBodyUpgradeCost } from './progression';

const placedBlocks = (board: ReturnType<typeof generateEnemyBuild>['board']) =>
  board.flatMap((row) =>
    row.flatMap((placed) => {
      const block = GAME_DATA.blocks.find((candidate) => candidate.id === placed?.blockId);
      return block ? [block] : [];
    }),
  );

describe('packet enemy build generator', () => {
  it('is deterministic for one seed and can choose a different packet program for another', () => {
    const first = generateEnemyBuild(GAME_DATA, 1, 73);

    expect(generateEnemyBuild(GAME_DATA, 1, 73)).toEqual(first);
    expect(generateEnemyBuild(GAME_DATA, 1, 74)).not.toEqual(first);
  });

  it('builds a powered source → operator → converter route', () => {
    const build = generateEnemyBuild(GAME_DATA, 3, 73, {
      buildId: 'charge',
      circuitCoreId: 'resonance',
    });
    const analysis = analyzeCircuit(build.board, GAME_DATA.blocks, build.heartPosition, GAME_DATA.rules.heart.ports);
    const blocks = placedBlocks(build.board);

    expect(analysis.poweredCells.size).toBe(3);
    expect(blocks.some((block) => block.packet?.effects.some((effect) => effect.kind === 'generate-packet'))).toBe(
      true,
    );
    expect(blocks.some((block) => block.packet?.effects.some((effect) => effect.kind === 'echo-packet'))).toBe(true);
    expect(blocks.some((block) => block.packet?.effects.some((effect) => effect.kind === 'convert-packet'))).toBe(true);
  });

  it('routes generated charge through the operator into the converter', () => {
    const build = generateEnemyBuild(GAME_DATA, 3, 73, {
      buildId: 'charge',
      circuitCoreId: 'resonance',
    });
    const state = resolveTick(
      GAME_DATA,
      createBattle(GAME_DATA, GAME_DATA.playerBoard, build.board, {
        enemyHeartPosition: build.heartPosition,
      }),
      1,
    );
    const release = state.trace.find(
      (event) => 'blockId' in event && event.team === 'enemy' && event.charge !== undefined,
    );

    expect(release).toEqual(
      expect.objectContaining({
        kind: expect.stringMatching(/damage|shield|repair/),
        charge: expect.any(Number),
      }),
    );
    expect(release && 'charge' in release ? release.charge : 0).toBeGreaterThan(0);
  });

  it('keeps body upgrades and packet nodes inside the player-reachable budget', () => {
    for (let run = 1; run <= 9; run += 1) {
      const bodyLevel = Math.min(run, GAME_DATA.rules.bodyUpgrades.maxLevel);
      const budget = GAME_DATA.rules.startingCoins + (run - 1) * GAME_DATA.rules.retryReward;
      const build = generateEnemyBuild(GAME_DATA, run, 73, { bodyLevel, budget });
      const boardCost = placedBlocks(build.board).reduce((total, block) => total + block.price, 0);

      expect(build.skillCost).toBe(boardCost);
      expect(build.bodyUpgradeCost).toBe(totalBodyUpgradeCost(GAME_DATA, bodyLevel));
      expect(build.totalCost).toBeLessThanOrEqual(budget);
      expect(build.maxHpBonus).toBe(maxHpBonusForBodyLevel(GAME_DATA, bodyLevel));
    }
  });

  it('can combine every state build with every declared generic circuit core', () => {
    for (const buildId of GAME_DATA.buildDesign.builds.map((build) => build.id)) {
      for (const circuitCoreId of GAME_DATA.buildDesign.placementPatterns
        .filter((pattern) => pattern.category === 'core')
        .map((pattern) => pattern.id)) {
        const build = generateEnemyBuild(GAME_DATA, 9, 31, { buildId, circuitCoreId });
        const design = build.board
          .flatMap((row) =>
            row.flatMap((placed) =>
              GAME_DATA.buildDesign.skills.filter(
                (skill) => skill.blockId === placed?.blockId && skill.placementPatternId === circuitCoreId,
              ),
            ),
          )
          .at(0);

        expect(build.buildId).toBe(buildId);
        expect(build.circuitCoreId).toBe(circuitCoreId);
        expect(design?.placementPatternId).toBe(circuitCoreId);
      }
    }
  });

  it('can require an affordable converter without hard-coding its id', () => {
    const build = generateEnemyBuild(GAME_DATA, 9, 117, {
      buildId: 'charge',
      circuitCoreId: 'resonance',
      requiredBlockId: 'overcharge-cannon',
    });

    expect(build.board.flat().some((cell) => cell?.blockId === 'overcharge-cannon')).toBe(true);
    expect(build.totalCost).toBeLessThanOrEqual(build.budget);
  });

  it('discovers a newly declared build through its data links', () => {
    const data = structuredClone(GAME_DATA);
    const charge = data.buildDesign.builds.find((build) => build.id === 'charge')!;
    data.buildDesign.axes
      .find((axis) => axis.id === charge.axisId)!
      .values.push({ id: 'spark', title: '火花', description: '自動検出テスト用', color: '#ff9f43' });
    data.buildDesign.builds.push({ ...charge, id: 'spark', title: '火花' });
    data.buildDesign.skills.forEach((skill) => {
      const chargeLink = skill.buildLinks.find((link) => link.buildId === 'charge');
      if (!chargeLink) return;
      skill.buildLinks.push({ ...chargeLink, buildId: 'spark' });
      const state = skill.axisLinks.find((link) => link.axisId === charge.axisId);
      if (state?.valueIds.includes('charge')) state.valueIds.push('spark');
    });

    const build = generateEnemyBuild(data, 9, 73, {
      buildId: 'spark',
      requiredBlockId: 'overcharge-cannon',
    });

    expect(build.buildId).toBe('spark');
    expect(build.board.flat().some((cell) => cell?.blockId === 'overcharge-cannon')).toBe(true);
  });
});
