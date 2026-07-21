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
  it('applies poison needle self growth to later poison applications', () => {
    const data = structuredClone(GAME_DATA);
    data.rules.poisonTickSeconds = 100;
    const state = createBattle(data, horizontalRoute('poison-needle'), emptyBoard());

    const tick1 = resolveTick(data, state, 1);
    const tick2 = resolveTick(data, tick1, 2);
    const tick3 = resolveTick(data, tick2, 3);
    const enemy = tick3.fighters.find((fighter) => fighter.team === 'enemy')!;

    expect(enemy.poison).toBe(4);
    expect(enemy.hp).toBe(enemy.maxHp - 3);
    expect(tick3.skillBuffs.player['2:0']).toEqual({ poison: 2 });
  });

  it('keeps poison and grows an output payoff across the battle', () => {
    const data = structuredClone(GAME_DATA);
    data.rules.poisonTickSeconds = 100;
    const board = horizontalRoute('poison-needle', 'status-relay', 'venom-bloom');
    const tick1 = resolveTick(data, createBattle(data, board, emptyBoard()), 1);
    const tick2 = resolveTick(data, tick1, 2);
    const tick3 = resolveTick(data, tick2, 3);
    const tick4 = resolveTick(data, tick3, 4);
    const enemy = tick4.fighters.find((fighter) => fighter.team === 'enemy')!;

    expect(tick1.skillBuffs.player['2:2']).toEqual({ poison: 1 });
    expect(tick3.skillBuffs.player['2:2']).toEqual({ poison: 2 });
    expect(enemy.poison).toBe(12);
  });

  it('activates every skill in a real poison cycle and applies named buffs in route order', () => {
    const data = structuredClone(GAME_DATA);
    data.rules.poisonTickSeconds = 100;
    const board = emptyBoard();
    board[2][0] = { blockId: 'poison-needle', rotation: 0 };
    board[2][1] = { blockId: 'cultivation-blade', rotation: 0 };
    board[1][1] = { blockId: 'return-coil', rotation: 0 };
    board[1][0] = { blockId: 'serpentine-venom', rotation: 0 };

    const result = resolveTick(data, createBattle(data, board, emptyBoard()), 1);
    const player = result.fighters.find((fighter) => fighter.team === 'player')!;
    const firedBlocks = new Set(
      result.trace
        .filter(
          (event): event is Extract<(typeof result.trace)[number], { blockId: string }> =>
            'blockId' in event && event.kind !== 'growth',
        )
        .map((event) => event.blockId),
    );

    expect(firedBlocks).toEqual(new Set(['poison-needle', 'cultivation-blade', 'return-coil', 'serpentine-venom']));
    expect(result.skillBuffs.player['1:1']).toEqual({ shield: 2 });
    expect(result.skillBuffs.player['1:0']).toEqual({ poison: 2 });
    expect(player.shield).toBe(2);
  });

  it('fires every powered branch instead of only following one output', () => {
    const data = structuredClone(GAME_DATA);
    data.rules.poisonTickSeconds = 100;
    const board = emptyBoard();
    board[2][0] = { blockId: 'arc-shot', rotation: 0 };
    board[2][1] = { blockId: 'strike', rotation: 0 };
    board[1][0] = { blockId: 'corrosion-film', rotation: 0 };

    const result = resolveTick(data, createBattle(data, board, emptyBoard()), 1);
    const firedBlocks = result.trace.flatMap((event) => ('blockId' in event ? [event.blockId] : []));
    const enemy = result.fighters.find((fighter) => fighter.team === 'enemy')!;

    expect(firedBlocks).toEqual(['arc-shot', 'corrosion-film', 'strike']);
    expect(enemy.hp).toBe(enemy.maxHp - 5);
    expect(result.fighters.find((fighter) => fighter.team === 'player')?.shield).toBe(2);
  });

  it('doubles active effects when two branches merge in the same wave', () => {
    const data = structuredClone(GAME_DATA);
    data.rules.poisonTickSeconds = 100;
    const board = emptyBoard();
    board[2][0] = { blockId: 'arc-shot', rotation: 0 };
    board[2][1] = { blockId: 'status-relay', rotation: 0 };
    board[2][2] = { blockId: 'poison-needle', rotation: 0 };
    board[1][0] = { blockId: 'corrosion-film', rotation: 0 };
    board[1][1] = { blockId: 'strike', rotation: 0 };
    board[1][2] = { blockId: 'serpentine-venom', rotation: 0 };

    const result = resolveTick(data, createBattle(data, board, emptyBoard()), 1);
    const needleEvents = result.trace.filter(
      (event) => 'blockId' in event && event.blockId === 'poison-needle' && event.kind !== 'growth',
    );

    expect(needleEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'damage', value: 2, mergeMultiplier: 2 }),
        expect.objectContaining({ kind: 'poison', value: 2, mergeMultiplier: 2 }),
      ]),
    );
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

  it('lets an upstream amplifier increase rupture damage per consumed poison', () => {
    const data = structuredClone(GAME_DATA);
    data.rules.poisonTickSeconds = 100;
    const state = createBattle(data, horizontalRoute('amplifier', 'rupture-stake'), emptyBoard());
    state.fighters.find((fighter) => fighter.team === 'enemy')!.poison = 6;

    const result = resolveTick(data, state, 1);
    const enemy = result.fighters.find((fighter) => fighter.team === 'enemy')!;

    expect(enemy.poison).toBe(3);
    expect(enemy.hp).toBe(enemy.maxHp - 15);
    expect(result.trace).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'rupture', value: 15 })]));
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
