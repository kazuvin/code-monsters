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

    expect(release).toMatchObject({ kind: 'damage', value: 2470, charge: 5 });
  });

  it('only deals the base release damage when the cannon is next to the source', () => {
    const board = emptyBoard();
    board[GAME_DATA.rules.sourceRow][0] = { blockId: 'rail-cannon', rotation: 0 };

    const state = resolveTick(GAME_DATA, createBattle(GAME_DATA, board, emptyBoard()), 1);
    const release = state.trace.find((event) => 'blockId' in event && event.blockId === 'rail-cannon');

    expect(release).toMatchObject({ kind: 'damage', value: 220, charge: 0 });
  });

  it('carries zero charge through neutral nodes', () => {
    const board = emptyBoard();
    board[GAME_DATA.rules.sourceRow][0] = { blockId: 'strike', rotation: 0 };
    board[GAME_DATA.rules.sourceRow][1] = { blockId: 'arc-shot', rotation: 0 };
    board[GAME_DATA.rules.sourceRow][2] = { blockId: 'rail-cannon', rotation: 0 };

    const state = resolveTick(GAME_DATA, createBattle(GAME_DATA, board, emptyBoard()), 1);
    const release = state.trace.find((event) => 'blockId' in event && event.blockId === 'rail-cannon');

    expect(release).toMatchObject({ kind: 'damage', value: 220, charge: 0 });
  });

  it('does not gain charge while traversing poison-only nodes', () => {
    const board = emptyBoard();
    board[GAME_DATA.rules.sourceRow][0] = { blockId: 'poison-needle', rotation: 0 };
    board[GAME_DATA.rules.sourceRow][1] = { blockId: 'venom-bloom', rotation: 0 };
    board[GAME_DATA.rules.sourceRow][2] = { blockId: 'rail-cannon', rotation: 0 };

    const state = resolveTick(GAME_DATA, createBattle(GAME_DATA, board, emptyBoard()), 1);
    const release = state.trace.find((event) => 'blockId' in event && event.blockId === 'rail-cannon');

    expect(release).toMatchObject({ kind: 'damage', value: 220, charge: 0 });
  });

  it('can release the same route charge as a defensive payoff', () => {
    const board = emptyBoard();
    board[GAME_DATA.rules.sourceRow][0] = { blockId: 'charge-blade', rotation: 0 };
    board[GAME_DATA.rules.sourceRow][1] = { blockId: 'charge-coil', rotation: 0 };
    board[GAME_DATA.rules.sourceRow][2] = { blockId: 'charge-bastion', rotation: 0 };

    const state = resolveTick(GAME_DATA, createBattle(GAME_DATA, board, emptyBoard()), 1);
    const release = state.trace.find((event) => 'blockId' in event && event.blockId === 'charge-bastion');

    expect(release).toMatchObject({ kind: 'shield', value: 2740, charge: 5 });
    expect(state.fighters.find((fighter) => fighter.team === 'player')?.shield).toBe(2740);
  });

  it('lets the defensive charge payoff repair poison damage as well as add shield', () => {
    const board = emptyBoard();
    board[GAME_DATA.rules.sourceRow][0] = { blockId: 'charge-bastion', rotation: 0 };
    const state = createBattle(GAME_DATA, board, emptyBoard());
    const player = state.fighters.find((fighter) => fighter.team === 'player')!;
    player.hp -= 1000;

    const result = resolveTick(GAME_DATA, state, 1);

    expect(result.fighters.find((fighter) => fighter.team === 'player')?.hp).toBe(player.hp + 600);
  });

  it('scales charge release strength with rarity', () => {
    const releaseValue = (blockId: string) => {
      const board = emptyBoard();
      board[GAME_DATA.rules.sourceRow][0] = { blockId: 'charge-blade', rotation: 0 };
      board[GAME_DATA.rules.sourceRow][1] = { blockId: 'charge-coil', rotation: 0 };
      board[GAME_DATA.rules.sourceRow][2] = { blockId, rotation: 0 };
      const state = resolveTick(GAME_DATA, createBattle(GAME_DATA, board, emptyBoard()), 1);
      return state.trace.find((event) => 'blockId' in event && event.blockId === blockId);
    };

    expect(releaseValue('discharge-bow')).toMatchObject({ kind: 'damage', value: 2120, charge: 5 });
    expect(releaseValue('rail-cannon')).toMatchObject({ kind: 'damage', value: 2470, charge: 5 });
    expect(releaseValue('overcharge-cannon')).toMatchObject({ kind: 'damage', value: 3550, charge: 5 });
  });
});
