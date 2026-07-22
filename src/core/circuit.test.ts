import { describe, expect, it } from 'vitest';
import {
  analyzeCircuit,
  circuitConditionsForBlock,
  evaluateCircuitCondition,
  findPoweredCells,
  rotatePorts,
} from './circuit';
import type { CircuitBoard, Direction } from './types';
import { GAME_DATA } from '../game/game-data';

describe('circuit connectivity', () => {
  it('starts four independent powered routes from a heart without counting the heart as a skill', () => {
    const blocks: Array<{ id: string; ports: Direction[] }> = [
      { id: 'north', ports: ['south'] },
      { id: 'east', ports: ['west'] },
      { id: 'south', ports: ['north'] },
      { id: 'west', ports: ['east'] },
    ];
    const board: CircuitBoard = [
      [null, { blockId: 'north', rotation: 0 }, null],
      [{ blockId: 'west', rotation: 0 }, null, { blockId: 'east', rotation: 0 }],
      [null, { blockId: 'south', rotation: 0 }, null],
    ];

    const analysis = analyzeCircuit(board, blocks, { row: 1, column: 1 });

    expect(analysis.poweredCells).toEqual(new Set(['0:1', '1:2', '2:1', '1:0']));
    expect([...analysis.routeLength.values()]).toEqual([1, 1, 1, 1]);
    expect(analysis.poweredCells).not.toContain('1:1');
    expect(analysis.cyclicCells).toEqual(new Set());
  });

  it('merges heart routes where their wave fronts meet without turning the heart into a free loop', () => {
    const blocks: Array<{ id: string; ports: Direction[] }> = [
      { id: 'north', ports: ['south', 'west'] },
      { id: 'west', ports: ['east', 'north'] },
      { id: 'merge', ports: ['east', 'south'] },
    ];
    const board: CircuitBoard = [
      [{ blockId: 'merge', rotation: 0 }, { blockId: 'north', rotation: 0 }, null],
      [{ blockId: 'west', rotation: 0 }, null, null],
      [null, null, null],
    ];

    const analysis = analyzeCircuit(board, blocks, { row: 1, column: 1 });

    expect(analysis.routeLength.get('0:0')).toBe(2);
    expect(analysis.mergeCells).toEqual(new Set(['0:0']));
    expect(analysis.cyclicCells).toEqual(new Set());
    expect(analysis.straightLineLength.get('0:1')).toBe(2);
  });

  it('rotates block ports clockwise', () => {
    expect(rotatePorts(['north', 'east'], 1)).toEqual(['east', 'south']);
  });

  it('powers every mutually connected block, including a skill in the middle of a route', () => {
    const blocks: Array<{ id: string; ports: Direction[] }> = [
      { id: 'guard', ports: ['west', 'east'] },
      { id: 'strike', ports: ['west', 'east'] },
      { id: 'rail', ports: ['west'] },
    ];
    const board: CircuitBoard = [
      [null, null, null],
      [
        { blockId: 'guard', rotation: 0 },
        { blockId: 'strike', rotation: 0 },
        { blockId: 'rail', rotation: 0 },
      ],
      [null, null, null],
    ];

    expect(findPoweredCells(board, blocks, 1)).toEqual(new Set(['1:0', '1:1', '1:2']));
  });

  it('does not power a block when facing ports do not match', () => {
    const blocks: Array<{ id: string; ports: Direction[] }> = [
      { id: 'strike', ports: ['west', 'east'] },
      { id: 'breaker', ports: ['west', 'north'] },
    ];
    const board: CircuitBoard = [
      [null, null],
      [
        { blockId: 'strike', rotation: 0 },
        { blockId: 'breaker', rotation: 1 },
      ],
    ];

    expect(findPoweredCells(board, blocks, 1)).toEqual(new Set(['1:0']));
  });

  it('sends power through a connection in either direction', () => {
    const blocks: Array<{ id: string; ports: Direction[] }> = [
      { id: 'source-skill', ports: ['west', 'east'] },
      { id: 'backward-skill', ports: ['east', 'west'] },
    ];
    const board: CircuitBoard = [
      [null, null],
      [
        { blockId: 'source-skill', rotation: 0 },
        { blockId: 'backward-skill', rotation: 0 },
      ],
    ];

    expect(findPoweredCells(board, blocks, 1)).toEqual(new Set(['1:0', '1:1']));
  });

  it('automatically powers every connected branch of a three-port skill', () => {
    const blocks: Array<{ id: string; ports: Direction[] }> = [
      { id: 'junction', ports: ['west', 'north', 'east'] },
      { id: 'upper', ports: ['east', 'south'] },
      { id: 'right', ports: ['west', 'east'] },
    ];
    const board: CircuitBoard = [
      [{ blockId: 'upper', rotation: 0 }, null],
      [
        { blockId: 'junction', rotation: 0 },
        { blockId: 'right', rotation: 0 },
      ],
    ];

    expect(findPoweredCells(board, blocks, 1)).toEqual(new Set(['1:0', '0:0', '1:1']));
  });

  it('reports route length and reachable cycles', () => {
    const blocks: Array<{ id: string; ports: Direction[] }> = [
      { id: 'a', ports: ['west', 'east', 'north'] },
      { id: 'b', ports: ['south', 'east'] },
      { id: 'c', ports: ['west', 'south'] },
      { id: 'd', ports: ['north', 'west'] },
    ];
    const board: CircuitBoard = [
      [
        { blockId: 'b', rotation: 0 },
        { blockId: 'c', rotation: 0 },
      ],
      [
        { blockId: 'a', rotation: 0 },
        { blockId: 'd', rotation: 0 },
      ],
    ];

    const analysis = analyzeCircuit(board, blocks, 1);

    expect(analysis.routeLength.get('1:0')).toBe(1);
    expect(analysis.routeLength.get('1:1')).toBe(2);
    expect(analysis.cyclicCells).toEqual(new Set(['1:0', '0:0', '0:1', '1:1']));
  });

  it('reports fully connected ports and the longest straight segment through each node', () => {
    const blocks: Array<{ id: string; ports: Direction[] }> = [
      { id: 'line', ports: ['west', 'east'] },
      { id: 'junction', ports: ['west', 'north', 'east'] },
      { id: 'cap', ports: ['south'] },
    ];
    const board: CircuitBoard = [
      [null, { blockId: 'cap', rotation: 0 }, null],
      [
        { blockId: 'line', rotation: 0 },
        { blockId: 'junction', rotation: 0 },
        { blockId: 'line', rotation: 0 },
      ],
      [null, null, null],
    ];

    const analysis = analyzeCircuit(board, blocks, 1);

    expect(analysis.fullyConnectedCells).toContain('1:1');
    expect(analysis.straightLineLength.get('1:1')).toBe(3);
    expect(analysis.straightLineLength.get('0:1')).toBe(2);
  });

  it('reports topology-condition progress and the cells that satisfy it', () => {
    const blocks: Array<{ id: string; ports: Direction[] }> = [
      { id: 'line', ports: ['west', 'east'] },
      { id: 'junction', ports: ['west', 'north', 'east'] },
      { id: 'cap', ports: ['south'] },
    ];
    const board: CircuitBoard = [
      [null, { blockId: 'cap', rotation: 0 }, null],
      [
        { blockId: 'line', rotation: 0 },
        { blockId: 'junction', rotation: 0 },
        { blockId: 'line', rotation: 0 },
      ],
      [null, null, null],
    ];
    const analysis = analyzeCircuit(board, blocks, 1);

    expect(
      evaluateCircuitCondition(
        board,
        blocks,
        analysis,
        { row: 1, column: 1 },
        {
          kind: 'straight-line-at-least',
          amount: 3,
        },
      ),
    ).toEqual({
      trigger: { kind: 'straight-line-at-least', amount: 3 },
      met: true,
      current: 3,
      required: 3,
      contributingCells: ['1:0', '1:1', '1:2'],
    });
    expect(
      evaluateCircuitCondition(
        board,
        blocks,
        analysis,
        { row: 1, column: 1 },
        {
          kind: 'all-ports-connected',
        },
      ),
    ).toEqual({
      trigger: { kind: 'all-ports-connected' },
      met: true,
      current: 3,
      required: 3,
      contributingCells: ['0:1', '1:0', '1:1', '1:2'],
    });
    expect(
      circuitConditionsForBlock(
        board,
        blocks,
        analysis,
        { row: 1, column: 1 },
        {
          effects: [
            { kind: 'damage', amount: 1, trigger: { kind: 'straight-line-at-least', amount: 3 } },
            { kind: 'shield', amount: 1, trigger: { kind: 'straight-line-at-least', amount: 3 } },
            { kind: 'damage', amount: 1, trigger: { kind: 'enemy-poisoned' } },
          ],
        },
      ),
    ).toHaveLength(1);
  });

  it('keeps an incomplete straight-line condition visible as progress', () => {
    const blocks: Array<{ id: string; ports: Direction[] }> = [{ id: 'line', ports: ['west', 'east'] }];
    const board: CircuitBoard = [
      [null, null, null],
      [{ blockId: 'line', rotation: 0 }, { blockId: 'line', rotation: 0 }, null],
      [null, null, null],
    ];
    const analysis = analyzeCircuit(board, blocks, 1);

    expect(
      evaluateCircuitCondition(
        board,
        blocks,
        analysis,
        { row: 1, column: 1 },
        {
          kind: 'straight-line-at-least',
          amount: 3,
        },
      ),
    ).toMatchObject({ met: false, current: 2, required: 3, contributingCells: ['1:0', '1:1'] });
  });

  it('can build a reachable cycle from the playable poison skills', () => {
    const board: CircuitBoard = Array.from({ length: GAME_DATA.rules.boardSize }, () =>
      Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
    );
    board[2][0] = { blockId: 'poison-needle', rotation: 0 };
    board[2][1] = { blockId: 'cultivation-blade', rotation: 0 };
    board[1][1] = { blockId: 'return-coil', rotation: 0 };
    board[1][0] = { blockId: 'charge-guard', rotation: 0 };

    const analysis = analyzeCircuit(board, GAME_DATA.blocks, 2);

    expect(analysis.poweredCells).toEqual(new Set(['2:0', '2:1', '1:1', '1:0']));
    expect(analysis.cyclicCells).toEqual(new Set(['2:0', '2:1', '1:1', '1:0']));
  });

  it('powers both branches when each output faces a matching input', () => {
    const board: CircuitBoard = Array.from({ length: GAME_DATA.rules.boardSize }, () =>
      Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
    );
    board[2][0] = { blockId: 'arc-shot', rotation: 0 };
    board[2][1] = { blockId: 'strike', rotation: 0 };
    board[1][0] = { blockId: 'charge-guard', rotation: 0 };

    expect(findPoweredCells(board, GAME_DATA.blocks, 2)).toEqual(new Set(['2:0', '2:1', '1:0']));
  });

  it('advances every branch each stage and merges where wave fronts arrive together', () => {
    const blocks: Array<{ id: string; ports: Direction[] }> = [
      { id: 'split', ports: ['west', 'north', 'east'] },
      { id: 'east', ports: ['west', 'east'] },
      { id: 'north-east', ports: ['south', 'east'] },
      { id: 'east-east', ports: ['west', 'east'] },
      { id: 'down', ports: ['west', 'south'] },
      { id: 'merge', ports: ['west', 'north', 'east'] },
    ];
    const board: CircuitBoard = [
      [null, null, null],
      [
        { blockId: 'north-east', rotation: 0 },
        { blockId: 'east-east', rotation: 0 },
        { blockId: 'down', rotation: 0 },
      ],
      [
        { blockId: 'split', rotation: 0 },
        { blockId: 'east', rotation: 0 },
        { blockId: 'merge', rotation: 0 },
      ],
    ];

    const analysis = analyzeCircuit(board, blocks, 2);

    expect(analysis.waveStep.get('2:0')).toBe(1);
    expect(analysis.waveStep.get('2:1')).toBe(2);
    expect(analysis.waveStep.get('1:0')).toBe(2);
    expect(analysis.waveStep.get('1:1')).toBe(3);
    expect(analysis.waveStep.get('1:2')).toBe(4);
    expect(analysis.waveStep.get('2:2')).toBe(3);
    expect(analysis.mergeCells).toEqual(new Set(['1:2']));
    expect(analysis.branchCells).toEqual(new Set(['2:0']));
  });

  it('treats the cell reached by both advancing fronts as its merge', () => {
    const board: CircuitBoard = Array.from({ length: GAME_DATA.rules.boardSize }, () =>
      Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
    );
    board[2][0] = { blockId: 'poison-needle', rotation: 0 };
    board[2][1] = { blockId: 'cultivation-blade', rotation: 0 };
    board[1][1] = { blockId: 'return-coil', rotation: 0 };
    board[1][0] = { blockId: 'charge-guard', rotation: 0 };

    expect(analyzeCircuit(board, GAME_DATA.blocks, 2).mergeCells).toEqual(new Set(['1:1']));
  });
});
