import { describe, expect, it } from 'vitest';
import { createBattle, resolveTick } from './battle';
import type { CircuitBoard } from './types';
import { GAME_DATA } from '../game/game-data';

const emptyBoard = (): CircuitBoard =>
  Array.from({ length: GAME_DATA.rules.boardSize }, () =>
    Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
  );

const horizontalRoute = (...blockIds: string[]) => {
  const board = emptyBoard();
  blockIds.forEach((blockId, column) => {
    board[GAME_DATA.rules.sourceRow][column] = { blockId, rotation: 0 };
  });
  return board;
};

describe('poison build', () => {
  it('keeps poison and grows an output payoff across the battle', () => {
    const data = structuredClone(GAME_DATA);
    data.rules.poisonTickSeconds = 100;
    const board = horizontalRoute('poison-needle', 'status-relay', 'venom-bloom');
    const tick1 = resolveTick(data, createBattle(data, board, emptyBoard()), 1);
    const tick2 = resolveTick(data, tick1, 2);
    const tick3 = resolveTick(data, tick2, 3);
    const tick4 = resolveTick(data, tick3, 4);
    const enemy = tick4.fighters.find((fighter) => fighter.team === 'enemy')!;

    expect(tick1.skillGrowth.player['2:2']).toBe(1);
    expect(tick3.skillGrowth.player['2:2']).toBe(2);
    expect(enemy.poison).toBe(7);
  });

  it('ruptures half of the stored poison for immediate damage', () => {
    const data = structuredClone(GAME_DATA);
    data.rules.poisonTickSeconds = 100;
    const state = createBattle(data, horizontalRoute('rupture-stake'), emptyBoard());
    state.fighters.find((fighter) => fighter.team === 'enemy')!.poison = 6;

    const result = resolveTick(data, state, 1);
    const enemy = result.fighters.find((fighter) => fighter.team === 'enemy')!;

    expect(enemy.poison).toBe(3);
    expect(enemy.hp).toBe(enemy.maxHp - 9);
    expect(result.trace).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'rupture', value: 9 })]));
  });

  it('deals poison damage periodically and lets one stack decay', () => {
    const data = structuredClone(GAME_DATA);
    data.rules.poisonTickSeconds = 1;
    const state = createBattle(data, emptyBoard(), emptyBoard());
    const enemy = state.fighters.find((fighter) => fighter.team === 'enemy')!;
    enemy.poison = 4;

    const tick1 = resolveTick(data, state, 1);
    const tick2 = resolveTick(data, tick1, 2);
    const afflicted = tick2.fighters.find((fighter) => fighter.team === 'enemy')!;

    expect(afflicted.hp).toBe(afflicted.maxHp - 4);
    expect(afflicted.poison).toBe(3);
    expect(tick2.trace).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'poison-tick', value: 4 })]));
  });
});
