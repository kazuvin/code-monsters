import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { createBattle, resolveTick } from './battle';
import { analyzeCircuit } from './circuit';
import type { CircuitBoard, SkillStars } from './types';

const emptyBoard = (): CircuitBoard =>
  Array.from({ length: GAME_DATA.rules.boardSize }, () =>
    Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
  );

const branchBoard = (stars: SkillStars): CircuitBoard => {
  const board = emptyBoard();
  board[2][0] = { blockId: 'myriad-light-array', rotation: 0, stars };
  board[1][0] = { blockId: 'light-guide', rotation: 0 };
  board[2][1] = { blockId: 'light-vein-blade', rotation: 0 };
  board[3][0] = { blockId: 'light-guide', rotation: 1 };
  return board;
};

const convergenceBoard = (stars: SkillStars): CircuitBoard => {
  const board = emptyBoard();
  board[2][0] = { blockId: 'radiant-fork', rotation: 0 };
  board[1][0] = { blockId: 'light-guide', rotation: 3 };
  board[1][1] = { blockId: 'prism-arrow', rotation: 2 };
  board[1][2] = { blockId: 'light-guide', rotation: 0 };
  board[2][1] = { blockId: 'light-guide', rotation: 2 };
  board[3][0] = { blockId: 'light-guide', rotation: 2 };
  board[3][1] = { blockId: 'light-vein-blade', rotation: 0 };
  board[3][2] = { blockId: 'light-guide', rotation: 1 };
  board[2][2] = { blockId: 'solar-convergence', rotation: 0, stars };
  return board;
};

const damageAt = (board: CircuitBoard, blockId: string) => {
  const data = structuredClone(GAME_DATA);
  data.rules.heart.initialPosition = { row: 2, column: -1 };
  const next = resolveTick(data, createBattle(data, board, emptyBoard()), 1);
  return next.trace.find((event) => 'blockId' in event && event.blockId === blockId && event.kind === 'damage');
};

describe('light vein circuit core', () => {
  it('keeps generic topology nodes neutral and hybrid outputs tied to their effect build', () => {
    const core = GAME_DATA.buildDesign.placementPatterns.find((candidate) => candidate.id === 'light-vein');
    const designs = GAME_DATA.buildDesign.skills.filter((skill) => skill.placementPatternId === 'light-vein');

    expect(GAME_DATA.buildDesign.builds.some((candidate) => candidate.id === 'light-vein')).toBe(false);
    expect(core).toMatchObject({ title: '光脈', category: 'core' });
    expect(designs.filter((skill) => skill.status === 'playable')).toHaveLength(10);
    const traits = (blockId: string) =>
      designs.find((skill) => skill.blockId === blockId)?.axisLinks.find((link) => link.axisId === 'trait')?.valueIds;
    expect(traits('light-vein-blade')).toEqual(['neutral']);
    expect(traits('thunder-prism')).toEqual(['charge']);
    expect(traits('venom-ray')).toEqual(['poison']);
  });

  it('caps the fused three-branch payoff below one enemy health bar', () => {
    const normal = damageAt(branchBoard(0), 'myriad-light-array');
    const fused = damageAt(branchBoard(1), 'myriad-light-array');

    expect(normal).toMatchObject({ value: 1720 });
    expect(fused).toMatchObject({ value: 2150, stars: 1 });
    expect(fused && 'value' in fused ? fused.value : 0).toBeLessThan(GAME_DATA.units[1].maxHp);
  });

  it('caps the fused three-route convergence after the existing merge multiplier', () => {
    const board = convergenceBoard(0);
    const analysis = analyzeCircuit(board, GAME_DATA.blocks, { row: 2, column: -1 });
    const normal = damageAt(board, 'solar-convergence');
    const fused = damageAt(convergenceBoard(1), 'solar-convergence');

    expect(analysis.upstreamCells.get('2:2')).toHaveLength(3);
    expect(normal).toMatchObject({ value: 1960, mergeMultiplier: 2 });
    expect(fused).toMatchObject({ value: 2450, mergeMultiplier: 2, stars: 1 });
    expect(fused && 'value' in fused ? fused.value : 0).toBeLessThan(GAME_DATA.units[1].maxHp);
  });
});
