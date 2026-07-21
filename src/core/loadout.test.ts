import { describe, expect, it } from 'vitest';
import { moveBlock, placeBlockFromRack, removeBlockToRack, rotateBoardBlock } from './loadout';
import type { CircuitBoard } from './types';

const board: CircuitBoard = [
  [null, null, null],
  [
    { blockId: 'hub', rotation: 0, fixed: true },
    { blockId: 'strike', rotation: 0 },
    { blockId: 'guard', rotation: 0 },
  ],
  [null, null, null],
];

describe('circuit loadout', () => {
  it('places a rack block and returns the replaced block to the rack', () => {
    const result = placeBlockFromRack(['repair'], board, 'repair', { row: 1, column: 1 });

    expect(result.board[1][1]?.blockId).toBe('repair');
    expect(result.rack).toEqual(['strike']);
    expect(board[1][1]?.blockId).toBe('strike');
  });

  it('swaps two board blocks', () => {
    const result = moveBlock(board, { row: 1, column: 1 }, { row: 1, column: 2 });

    expect(result[1][1]?.blockId).toBe('guard');
    expect(result[1][2]?.blockId).toBe('strike');
  });

  it('does not replace, move, remove, or rotate a fixed block', () => {
    expect(placeBlockFromRack(['repair'], board, 'repair', { row: 1, column: 0 })).toEqual({ board, rack: ['repair'] });
    expect(moveBlock(board, { row: 1, column: 0 }, { row: 0, column: 0 })).toBe(board);
    expect(removeBlockToRack([], board, { row: 1, column: 0 })).toEqual({ board, rack: [] });
    expect(rotateBoardBlock(board, { row: 1, column: 0 })).toBe(board);
  });

  it('rotates and removes regular blocks', () => {
    const rotated = rotateBoardBlock(board, { row: 1, column: 1 });
    const removed = removeBlockToRack([], rotated, { row: 1, column: 1 });

    expect(rotated[1][1]?.rotation).toBe(1);
    expect(removed.board[1][1]).toBeNull();
    expect(removed.rack).toEqual(['strike']);
  });
});
