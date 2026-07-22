import { describe, expect, it } from 'vitest';
import { createBattle, resolveTick } from './battle';
import { upgradeBlockDefinition } from './fusion';
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

    expect(release).toMatchObject({ kind: 'damage', value: 1138, charge: 4 });
  });

  it('only deals the base release damage when the cannon is next to the source', () => {
    const board = emptyBoard();
    board[GAME_DATA.rules.sourceRow][0] = { blockId: 'rail-cannon', rotation: 0 };

    const state = resolveTick(GAME_DATA, createBattle(GAME_DATA, board, emptyBoard()), 1);
    const release = state.trace.find((event) => 'blockId' in event && event.blockId === 'rail-cannon');

    expect(release).toMatchObject({ kind: 'damage', value: 298, charge: 0 });
  });

  it('carries zero charge through neutral nodes', () => {
    const board = emptyBoard();
    board[GAME_DATA.rules.sourceRow][0] = { blockId: 'strike', rotation: 0 };
    board[GAME_DATA.rules.sourceRow][1] = { blockId: 'arc-shot', rotation: 0 };
    board[GAME_DATA.rules.sourceRow][2] = { blockId: 'rail-cannon', rotation: 0 };

    const state = resolveTick(GAME_DATA, createBattle(GAME_DATA, board, emptyBoard()), 1);
    const release = state.trace.find((event) => 'blockId' in event && event.blockId === 'rail-cannon');

    expect(release).toMatchObject({ kind: 'damage', value: 298, charge: 0 });
  });

  it('does not gain charge while traversing poison-only nodes', () => {
    const board = emptyBoard();
    board[GAME_DATA.rules.sourceRow][0] = { blockId: 'poison-needle', rotation: 0 };
    board[GAME_DATA.rules.sourceRow][1] = { blockId: 'venom-bloom', rotation: 0 };
    board[GAME_DATA.rules.sourceRow][2] = { blockId: 'rail-cannon', rotation: 0 };

    const state = resolveTick(GAME_DATA, createBattle(GAME_DATA, board, emptyBoard()), 1);
    const release = state.trace.find((event) => 'blockId' in event && event.blockId === 'rail-cannon');

    expect(release).toMatchObject({ kind: 'damage', value: 298, charge: 0 });
  });

  it('can release the same route charge as a defensive payoff', () => {
    const board = emptyBoard();
    board[GAME_DATA.rules.sourceRow][0] = { blockId: 'charge-blade', rotation: 0 };
    board[GAME_DATA.rules.sourceRow][1] = { blockId: 'charge-coil', rotation: 0 };
    board[GAME_DATA.rules.sourceRow][2] = { blockId: 'charge-bastion', rotation: 0 };

    const state = resolveTick(GAME_DATA, createBattle(GAME_DATA, board, emptyBoard()), 1);
    const release = state.trace.find((event) => 'blockId' in event && event.blockId === 'charge-bastion');

    expect(release).toMatchObject({ kind: 'shield', value: 1010, charge: 4 });
    expect(state.fighters.find((fighter) => fighter.team === 'player')?.shield).toBe(1010);
  });

  it('lets the defensive charge payoff repair poison damage as well as add shield', () => {
    const board = emptyBoard();
    board[GAME_DATA.rules.sourceRow][0] = { blockId: 'charge-bastion', rotation: 0 };
    const state = createBattle(GAME_DATA, board, emptyBoard());
    const player = state.fighters.find((fighter) => fighter.team === 'player')!;
    player.hp -= 1000;

    const result = resolveTick(GAME_DATA, state, 1);

    expect(result.fighters.find((fighter) => fighter.team === 'player')?.hp).toBe(player.hp + 175);
  });

  it('scales charge release DPS with rarity for normal and fused skills', () => {
    const releaseDps = (blockId: string, charge: number, stars: 0 | 1) => {
      const baseBlock = GAME_DATA.blocks.find((block) => block.id === blockId)!;
      const block = upgradeBlockDefinition(baseBlock, stars, GAME_DATA.rules.skillFusion);
      const release = block.effects.find((effect) => effect.kind === 'release-charge')!;
      return (release.amount + charge * release.perCharge) / block.cooldown!;
    };
    const releaseIds = ['discharge-bow', 'rail-cannon', 'overcharge-cannon'];

    for (const stars of [0, 1] as const) {
      for (const charge of [0, 5, 10]) {
        const dps = releaseIds.map((blockId) => releaseDps(blockId, charge, stars));
        expect(dps[0], `rare DPS at charge ${charge}, stars ${stars}`).toBeLessThan(dps[1]);
        expect(dps[1], `epic DPS at charge ${charge}, stars ${stars}`).toBeLessThan(dps[2]);
      }
    }

    expect(releaseDps('discharge-bow', 5, 0)).toBeCloseTo(356.67, 2);
    expect(releaseDps('rail-cannon', 5, 0)).toBeCloseTo(449.33, 2);
    expect(releaseDps('overcharge-cannon', 5, 0)).toBe(588);
  });

  it('uses the legendary lance as a topology-gated charge relay instead of a damage source', () => {
    const shortBoard = emptyBoard();
    shortBoard[GAME_DATA.rules.sourceRow][0] = { blockId: 'charge-blade', rotation: 0 };
    shortBoard[GAME_DATA.rules.sourceRow][1] = { blockId: 'charge-line-lance', rotation: 0 };
    shortBoard[GAME_DATA.rules.sourceRow][2] = { blockId: 'overcharge-cannon', rotation: 0 };
    const shortState = resolveTick(GAME_DATA, createBattle(GAME_DATA, shortBoard, emptyBoard()), 1);
    const shortRelease = shortState.trace.find((event) => 'blockId' in event && event.blockId === 'overcharge-cannon');

    expect(shortRelease).toMatchObject({ kind: 'damage', value: 3740, charge: 7 });
    expect(shortState.trace.some((event) => 'blockId' in event && event.blockId === 'charge-line-lance')).toBe(false);

    const longBoard = emptyBoard();
    longBoard[GAME_DATA.rules.sourceRow][0] = { blockId: 'charge-blade', rotation: 0 };
    longBoard[GAME_DATA.rules.sourceRow][1] = { blockId: 'charge-coil', rotation: 0 };
    longBoard[GAME_DATA.rules.sourceRow][2] = { blockId: 'strike', rotation: 0 };
    longBoard[GAME_DATA.rules.sourceRow][3] = { blockId: 'charge-line-lance', rotation: 0 };
    longBoard[GAME_DATA.rules.sourceRow][4] = { blockId: 'overcharge-cannon', rotation: 0 };
    const longState = resolveTick(GAME_DATA, createBattle(GAME_DATA, longBoard, emptyBoard()), 1);
    const longRelease = longState.trace.find((event) => 'blockId' in event && event.blockId === 'overcharge-cannon');

    expect(longRelease).toMatchObject({ kind: 'damage', value: 6940, charge: 15 });
  });

  it('keeps the first pulse release values explicit at five charge', () => {
    const releaseValue = (blockId: string) => {
      const board = emptyBoard();
      board[GAME_DATA.rules.sourceRow][0] = { blockId: 'charge-blade', rotation: 0 };
      board[GAME_DATA.rules.sourceRow][1] = { blockId: 'charge-coil', rotation: 0 };
      board[GAME_DATA.rules.sourceRow][2] = { blockId: 'status-relay', rotation: 0 };
      board[GAME_DATA.rules.sourceRow][3] = { blockId, rotation: 0 };
      const state = resolveTick(GAME_DATA, createBattle(GAME_DATA, board, emptyBoard()), 1);
      return state.trace.find((event) => 'blockId' in event && event.blockId === blockId);
    };

    expect(releaseValue('discharge-bow')).toMatchObject({ kind: 'damage', value: 1070, charge: 5 });
    expect(releaseValue('rail-cannon')).toMatchObject({ kind: 'damage', value: 1348, charge: 5 });
    expect(releaseValue('overcharge-cannon')).toMatchObject({ kind: 'damage', value: 2940, charge: 5 });
  });
});
