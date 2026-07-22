import { describe, expect, it } from 'vitest';
import { analyzeCircuit, circuitConditionsForBlock } from './circuit';
import { effectScalingBonus } from './skill-progress';
import type { BlockDefinition, CircuitBoard } from './types';

const block = (
  id: string,
  ports: BlockDefinition['ports'],
  effects: BlockDefinition['effects'] = [{ kind: 'damage', amount: 1 }],
): BlockDefinition => ({
  id,
  code: id.toUpperCase(),
  title: id,
  description: id,
  glyph: '光',
  price: 4,
  rarity: 'common',
  ports,
  buildIds: ['light-vein'],
  cooldown: 1,
  effects,
});

const splitter = block(
  'splitter',
  ['west', 'north', 'south'],
  [
    {
      kind: 'damage',
      amount: 10,
      trigger: { kind: 'branch-at-least', amount: 2 },
      scaling: { kind: 'downstream-count', every: 1, amount: 5, maxStacks: 3 },
    },
  ],
);
const convergence = block(
  'convergence',
  ['north', 'south', 'east'],
  [
    {
      kind: 'damage',
      amount: 10,
      trigger: { kind: 'merge-at-least', amount: 2 },
      scaling: { kind: 'upstream-count', every: 1, amount: 5, maxStacks: 3 },
    },
  ],
);
const corner = block('corner', ['south', 'east']);
const line = block('line', ['west', 'east']);
const lowerCorner = block('lower-corner', ['north', 'east']);
const upperMerge = block('upper-merge', ['west', 'south']);
const lowerMerge = block('lower-merge', ['west', 'north']);
const blocks = [splitter, convergence, corner, line, lowerCorner, upperMerge, lowerMerge];

const splitBoard: CircuitBoard = [
  [{ blockId: 'corner', rotation: 0 }, null, null],
  [{ blockId: 'splitter', rotation: 0 }, null, null],
  [{ blockId: 'lower-corner', rotation: 0 }, null, null],
];

const mergedBoard: CircuitBoard = [
  [
    { blockId: 'corner', rotation: 0 },
    { blockId: 'line', rotation: 0 },
    { blockId: 'upper-merge', rotation: 0 },
  ],
  [{ blockId: 'splitter', rotation: 0 }, null, { blockId: 'convergence', rotation: 0 }],
  [
    { blockId: 'lower-corner', rotation: 0 },
    { blockId: 'line', rotation: 0 },
    { blockId: 'lower-merge', rotation: 0 },
  ],
];

describe('light vein topology', () => {
  it('counts only powered downstream branches at a split', () => {
    const analysis = analyzeCircuit(splitBoard, blocks, { row: 1, column: -1 });

    expect(analysis.branchCells).toEqual(new Set(['1:0']));
    expect(circuitConditionsForBlock(splitBoard, blocks, analysis, { row: 1, column: 0 }, splitter)).toEqual([
      {
        trigger: { kind: 'branch-at-least', amount: 2 },
        met: true,
        current: 2,
        required: 2,
        contributingCells: ['0:0', '1:0', '2:0'],
      },
    ]);
  });

  it('counts distinct powered upstream routes when they converge', () => {
    const analysis = analyzeCircuit(mergedBoard, blocks, { row: 1, column: -1 });

    expect(analysis.mergeCells).toEqual(new Set(['1:2']));
    expect(circuitConditionsForBlock(mergedBoard, blocks, analysis, { row: 1, column: 2 }, convergence)).toEqual([
      {
        trigger: { kind: 'merge-at-least', amount: 2 },
        met: true,
        current: 2,
        required: 2,
        contributingCells: ['0:2', '1:2', '2:2'],
      },
    ]);
  });

  it('scales branch and convergence effects from their actual route counts', () => {
    const context = {
      enemyPoison: 0,
      pathLength: 0,
      straightLineLength: 0,
      magicSigilLevel: 0,
      magicSigilCount: 0,
      adjacentPoweredCount: 0,
      upstreamCount: 3,
      downstreamCount: 2,
    };

    expect(effectScalingBonus({ kind: 'downstream-count', every: 1, amount: 5 }, context)).toBe(10);
    expect(effectScalingBonus({ kind: 'upstream-count', every: 1, amount: 5 }, context)).toBe(15);
  });
});
