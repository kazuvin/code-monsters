import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { createBattle } from './battle';
import { analyzeCircuit } from './circuit';
import { generateEnemyBuild } from './enemy-builder';

describe('enemy build generator', () => {
  it('is deterministic for a seed while producing different mechanical builds for other seeds', () => {
    const first = generateEnemyBuild(GAME_DATA, 1, 73);

    expect(generateEnemyBuild(GAME_DATA, 1, 73)).toEqual(first);
    expect(generateEnemyBuild(GAME_DATA, 1, 74)).not.toEqual(first);
  });

  it('adds only nodes that fit the same cumulative budget available to the player', () => {
    const builds = Array.from({ length: 11 }, (_, index) => generateEnemyBuild(GAME_DATA, index + 1, 73));

    expect(builds[0].nodeCount).toBe(5);
    expect(builds.map((build) => build.maxHpBonus)).toEqual([
      0, 2500, 5000, 7500, 10_000, 12_500, 15_000, 17_500, 20_000, 20_000, 20_000,
    ]);
    builds.forEach((build, index) => {
      const targetNodes = Math.min(15, 7 + index);
      const analysis = analyzeCircuit(build.board, GAME_DATA.blocks, GAME_DATA.rules.sourceRow);
      expect(analysis.poweredCells.size).toBe(build.nodeCount);
      expect(build.nodeCount).toBeLessThanOrEqual(targetNodes);
      expect(build.totalCost).toBeLessThanOrEqual(build.budget);
      expect(build.budget).toBe(32 + index * 10);
    });
  });

  it('applies the generated level health bonus equally to both fighters', () => {
    const build = generateEnemyBuild(GAME_DATA, 4, 73);
    const battle = createBattle(GAME_DATA, GAME_DATA.playerBoard, build.board, {
      playerMaxHpBonus: build.maxHpBonus,
      enemyMaxHpBonus: build.maxHpBonus,
    });
    const player = battle.fighters.find((fighter) => fighter.team === 'player')!;
    const enemy = battle.fighters.find((fighter) => fighter.team === 'enemy')!;

    expect(player.maxHp).toBe(12_500);
    expect(player.hp).toBe(12_500);
    expect(enemy.maxHp).toBe(12_500);
    expect(enemy.hp).toBe(12_500);
  });

  it('never spends more than an explicitly supplied player budget', () => {
    const build = generateEnemyBuild(GAME_DATA, 2, 73, { budget: 40 });

    expect(build.budget).toBe(40);
    expect(build.totalCost).toBeLessThanOrEqual(40);
    expect(build.nodeCount).toBeLessThanOrEqual(8);
  });

  it('fills the most affordable nodes before lowering the run target', () => {
    const build = generateEnemyBuild(GAME_DATA, 2, 221, { budget: 40 });

    expect(build.nodeCount).toBe(7);
    expect(build.totalCost).toBeLessThanOrEqual(40);
  });

  it('builds around one real trait plus neutral support and includes a starter and payoff', () => {
    [73, 74, 75, 76].forEach((seed) => {
      const build = generateEnemyBuild(GAME_DATA, 5, seed);
      const placedIds = new Set(
        build.board.flatMap((row) => row.flatMap((placed) => (placed ? [placed.blockId] : []))),
      );
      const designs = GAME_DATA.buildDesign.skills.filter((skill) => skill.blockId && placedIds.has(skill.blockId));
      const buildLinks = designs.flatMap((skill) => skill.buildLinks.filter((link) => link.buildId === build.traitId));

      designs.forEach((skill) => {
        const traits = skill.axisLinks.find((link) => link.axisId === 'trait')?.valueIds ?? [];
        expect(
          traits.some((trait) => trait === 'neutral' || trait === build.traitId),
          skill.id,
        ).toBe(true);
      });
      expect(buildLinks.some((link) => link.roles.includes('starter'))).toBe(true);
      expect(buildLinks.some((link) => link.roles.includes('payoff'))).toBe(true);
    });
  });
});
