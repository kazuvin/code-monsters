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

  it('adds a powered node every round until the configured cap', () => {
    const builds = Array.from({ length: 11 }, (_, index) => generateEnemyBuild(GAME_DATA, index + 1, 73));

    expect(builds.map((build) => build.nodeCount)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 15, 15]);
    expect(builds.map((build) => build.maxHpBonus)).toEqual([
      0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000,
    ]);
    builds.forEach((build) => {
      const analysis = analyzeCircuit(build.board, GAME_DATA.blocks, GAME_DATA.rules.sourceRow);
      expect(analysis.poweredCells.size).toBe(build.nodeCount);
    });
  });

  it('applies the generated round health bonus to the rival fighter', () => {
    const build = generateEnemyBuild(GAME_DATA, 4, 73);
    const battle = createBattle(GAME_DATA, GAME_DATA.playerBoard, build.board, {
      enemyMaxHpBonus: build.maxHpBonus,
    });
    const enemy = battle.fighters.find((fighter) => fighter.team === 'enemy')!;

    expect(enemy.maxHp).toBe(5900);
    expect(enemy.hp).toBe(5900);
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
