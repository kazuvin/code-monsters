import { describe, expect, it } from 'vitest';
import { findPoweredCells, rotatePorts } from './circuit';
import type { CircuitBoard, Direction } from './types';

describe('circuit connectivity', () => {
  it('rotates block ports clockwise', () => {
    expect(rotatePorts(['north', 'east'], 1)).toEqual(['east', 'south']);
  });

  it('powers every mutually connected block, including a skill in the middle of a route', () => {
    const blocks: Array<{ id: string; ports: Direction[] }> = [
      { id: 'hub', ports: ['west', 'east'] },
      { id: 'strike', ports: ['west', 'east'] },
      { id: 'guard', ports: ['west'] },
    ];
    const board: CircuitBoard = [
      [null, null, null],
      [
        { blockId: 'hub', rotation: 0 },
        { blockId: 'strike', rotation: 0 },
        { blockId: 'guard', rotation: 0 },
      ],
      [null, null, null],
    ];

    expect(findPoweredCells(board, blocks, 1)).toEqual(new Set(['1:0', '1:1', '1:2']));
  });

  it('does not power a block when facing ports do not match', () => {
    const blocks: Array<{ id: string; ports: Direction[] }> = [
      { id: 'hub', ports: ['west', 'east'] },
      { id: 'corner', ports: ['west', 'north'] },
    ];
    const board: CircuitBoard = [
      [null, null],
      [
        { blockId: 'hub', rotation: 0 },
        { blockId: 'corner', rotation: 1 },
      ],
    ];

    expect(findPoweredCells(board, blocks, 1)).toEqual(new Set(['1:0']));
  });
});
