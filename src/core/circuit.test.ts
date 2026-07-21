import { describe, expect, it } from 'vitest';
import { analyzeCircuit, findPoweredCells, rotatePorts } from './circuit';
import type { CircuitBoard, Direction } from './types';
import { GAME_DATA } from '../game/game-data';

describe('circuit connectivity', () => {
  it('rotates block ports clockwise', () => {
    expect(rotatePorts(['north', 'east'], 1)).toEqual(['east', 'south']);
  });

  it('powers every mutually connected block, including a skill in the middle of a route', () => {
    const blocks: Array<{ id: string; inputPorts: Direction[]; outputPorts: Direction[] }> = [
      { id: 'guard', inputPorts: ['west'], outputPorts: ['east'] },
      { id: 'strike', inputPorts: ['west'], outputPorts: ['east'] },
      { id: 'rail', inputPorts: ['west'], outputPorts: [] },
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
    const blocks: Array<{ id: string; inputPorts: Direction[]; outputPorts: Direction[] }> = [
      { id: 'strike', inputPorts: ['west'], outputPorts: ['east'] },
      { id: 'breaker', inputPorts: ['west'], outputPorts: ['north'] },
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

  it('does not send power backwards through an input', () => {
    const blocks: Array<{ id: string; inputPorts: Direction[]; outputPorts: Direction[] }> = [
      { id: 'source-skill', inputPorts: ['west'], outputPorts: ['east'] },
      { id: 'backward-skill', inputPorts: ['east'], outputPorts: ['west'] },
    ];
    const board: CircuitBoard = [
      [null, null],
      [
        { blockId: 'source-skill', rotation: 0 },
        { blockId: 'backward-skill', rotation: 0 },
      ],
    ];

    expect(findPoweredCells(board, blocks, 1)).toEqual(new Set(['1:0']));
  });

  it('reports route length and reachable directed cycles', () => {
    const blocks: Array<{ id: string; inputPorts: Direction[]; outputPorts: Direction[] }> = [
      { id: 'a', inputPorts: ['west', 'east'], outputPorts: ['north'] },
      { id: 'b', inputPorts: ['south'], outputPorts: ['east'] },
      { id: 'c', inputPorts: ['west'], outputPorts: ['south'] },
      { id: 'd', inputPorts: ['north'], outputPorts: ['west'] },
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
    expect(analysis.routeLength.get('1:1')).toBe(4);
    expect(analysis.cyclicCells).toEqual(new Set(['1:0', '0:0', '0:1', '1:1']));
  });

  it('can build a reachable cycle from the playable poison skills', () => {
    const board: CircuitBoard = Array.from({ length: GAME_DATA.rules.boardSize }, () =>
      Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
    );
    board[2][0] = { blockId: 'poison-needle', rotation: 0 };
    board[2][1] = { blockId: 'cultivation-blade', rotation: 0 };
    board[1][1] = { blockId: 'return-coil', rotation: 0 };
    board[1][0] = { blockId: 'serpentine-venom', rotation: 0 };

    const analysis = analyzeCircuit(board, GAME_DATA.blocks, GAME_DATA.rules.sourceRow);

    expect(analysis.poweredCells).toEqual(new Set(['2:0', '2:1', '1:1', '1:0']));
    expect(analysis.cyclicCells).toEqual(new Set(['2:0', '2:1', '1:1', '1:0']));
  });

  it('powers both branches when each output faces a matching input', () => {
    const board: CircuitBoard = Array.from({ length: GAME_DATA.rules.boardSize }, () =>
      Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
    );
    board[2][0] = { blockId: 'arc-shot', rotation: 0 };
    board[2][1] = { blockId: 'strike', rotation: 0 };
    board[1][0] = { blockId: 'corrosion-film', rotation: 0 };

    expect(findPoweredCells(board, GAME_DATA.blocks, GAME_DATA.rules.sourceRow)).toEqual(
      new Set(['2:0', '2:1', '1:0']),
    );
  });

  it('waits for the longer branch before firing a merge cell', () => {
    const blocks: Array<{ id: string; inputPorts: Direction[]; outputPorts: Direction[] }> = [
      { id: 'split', inputPorts: ['west'], outputPorts: ['north', 'east'] },
      { id: 'east', inputPorts: ['west'], outputPorts: ['east'] },
      { id: 'north-east', inputPorts: ['south'], outputPorts: ['east'] },
      { id: 'east-east', inputPorts: ['west'], outputPorts: ['east'] },
      { id: 'down', inputPorts: ['west'], outputPorts: ['south'] },
      { id: 'merge', inputPorts: ['west', 'north'], outputPorts: ['east'] },
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
    expect(analysis.waveStep.get('2:2')).toBe(5);
    expect(analysis.mergeCells).toEqual(new Set(['2:2']));
  });

  it('does not treat a returning cycle edge as a merge', () => {
    const board: CircuitBoard = Array.from({ length: GAME_DATA.rules.boardSize }, () =>
      Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
    );
    board[2][0] = { blockId: 'poison-needle', rotation: 0 };
    board[2][1] = { blockId: 'cultivation-blade', rotation: 0 };
    board[1][1] = { blockId: 'return-coil', rotation: 0 };
    board[1][0] = { blockId: 'serpentine-venom', rotation: 0 };

    expect(analyzeCircuit(board, GAME_DATA.blocks, GAME_DATA.rules.sourceRow).mergeCells).toEqual(new Set());
  });
});
