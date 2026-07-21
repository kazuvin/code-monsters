import { describe, expect, it } from 'vitest';
import { createBattle, resolveTick } from './battle';
import type { CircuitBoard } from './types';
import { GAME_DATA } from '../game/game-data';

const emptyBoard = (): CircuitBoard =>
  Array.from({ length: GAME_DATA.rules.boardSize }, () =>
    Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
  );

describe('charge build', () => {
  it('carries charge through the route and releases it as terminal damage', () => {
    const board = emptyBoard();
    board[GAME_DATA.rules.sourceRow][0] = { blockId: 'charge-blade', rotation: 0 };
    board[GAME_DATA.rules.sourceRow][1] = { blockId: 'charge-coil', rotation: 0 };
    board[GAME_DATA.rules.sourceRow][2] = { blockId: 'rail-cannon', rotation: 0 };

    const state = resolveTick(GAME_DATA, createBattle(GAME_DATA, board, emptyBoard()), 1);
    const release = state.trace.find((event) => 'blockId' in event && event.blockId === 'rail-cannon');

    expect(release).toMatchObject({ kind: 'damage', value: 17, charge: 5 });
  });

  it('only deals the base release damage when the cannon is next to the source', () => {
    const board = emptyBoard();
    board[GAME_DATA.rules.sourceRow][0] = { blockId: 'rail-cannon', rotation: 0 };

    const state = resolveTick(GAME_DATA, createBattle(GAME_DATA, board, emptyBoard()), 1);
    const release = state.trace.find((event) => 'blockId' in event && event.blockId === 'rail-cannon');

    expect(release).toMatchObject({ kind: 'damage', value: 2, charge: 0 });
  });

  it('can release the same route charge as a defensive payoff', () => {
    const board = emptyBoard();
    board[GAME_DATA.rules.sourceRow][0] = { blockId: 'charge-blade', rotation: 0 };
    board[GAME_DATA.rules.sourceRow][1] = { blockId: 'charge-coil', rotation: 0 };
    board[GAME_DATA.rules.sourceRow][2] = { blockId: 'charge-bastion', rotation: 0 };

    const state = resolveTick(GAME_DATA, createBattle(GAME_DATA, board, emptyBoard()), 1);
    const release = state.trace.find((event) => 'blockId' in event && event.blockId === 'charge-bastion');

    expect(release).toMatchObject({ kind: 'shield', value: 11, charge: 5 });
    expect(state.fighters.find((fighter) => fighter.team === 'player')?.shield).toBe(11);
  });
});
