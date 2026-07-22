import { describe, expect, it } from 'vitest';
import { moveBlock, moveHeart, placeBlockFromRack, removeBlockToRack, rotateBoardBlock } from './loadout';
import type { CircuitBoard } from './types';

const board: CircuitBoard = [
  [null, null, null],
  [
    { blockId: 'repair', rotation: 0 },
    { blockId: 'strike', rotation: 0 },
    { blockId: 'guard', rotation: 0 },
  ],
  [null, null, null],
];

describe('circuit loadout', () => {
  it('moves the heart by swapping an occupied destination into its previous cell', () => {
    const result = moveHeart(board, { row: 0, column: 0 }, { row: 1, column: 1 });

    expect(result.heartPosition).toEqual({ row: 1, column: 1 });
    expect(result.board[0][0]).toEqual({ blockId: 'strike', rotation: 0 });
    expect(result.board[1][1]).toBeNull();
    expect(board[1][1]).toEqual({ blockId: 'strike', rotation: 0 });
  });

  it('never lets a skill replace or move into the heart cell', () => {
    const heartPosition = { row: 0, column: 0 };
    const placed = placeBlockFromRack(
      [{ blockId: 'repair', rotation: 3 }],
      board,
      { blockId: 'repair', rotation: 3 },
      heartPosition,
      heartPosition,
    );
    const moved = moveBlock(board, { row: 1, column: 1 }, heartPosition, heartPosition);

    expect(placed.board).toBe(board);
    expect(moved).toBe(board);
  });

  it('places a rack block and returns the replaced block to the rack', () => {
    const result = placeBlockFromRack(
      [{ blockId: 'repair', rotation: 3 }],
      board,
      { blockId: 'repair', rotation: 3 },
      {
        row: 1,
        column: 1,
      },
    );

    expect(result.board[1][1]?.blockId).toBe('repair');
    expect(result.board[1][1]?.rotation).toBe(3);
    expect(result.rack).toEqual([{ blockId: 'strike', rotation: 0 }]);
    expect(board[1][1]?.blockId).toBe('strike');
  });

  it('swaps two board blocks', () => {
    const result = moveBlock(board, { row: 1, column: 1 }, { row: 1, column: 2 });

    expect(result[1][1]?.blockId).toBe('guard');
    expect(result[1][2]?.blockId).toBe('strike');
  });

  it('allows every placed skill, including the source skill, to be edited', () => {
    const rotated = rotateBoardBlock(board, { row: 1, column: 0 });
    const moved = moveBlock(board, { row: 1, column: 0 }, { row: 0, column: 0 });
    const removed = removeBlockToRack([], board, { row: 1, column: 0 });

    expect(rotated[1][0]?.rotation).toBe(1);
    expect(moved[0][0]?.blockId).toBe('repair');
    expect(removed.board[1][0]).toBeNull();
    expect(removed.rack).toEqual([{ blockId: 'repair', rotation: 0 }]);
  });

  it('rotates and removes regular blocks', () => {
    const rotated = rotateBoardBlock(board, { row: 1, column: 1 });
    const removed = removeBlockToRack([], rotated, { row: 1, column: 1 });

    expect(rotated[1][1]?.rotation).toBe(1);
    expect(removed.board[1][1]).toBeNull();
    expect(removed.rack).toEqual([{ blockId: 'strike', rotation: 1 }]);
  });

  it('keeps a fixed-direction skill at its authored orientation', () => {
    const result = rotateBoardBlock(board, { row: 1, column: 1 }, [{ id: 'strike', rotatable: false }]);

    expect(result).toBe(board);
    expect(result[1][1]?.rotation).toBe(0);
  });
});
