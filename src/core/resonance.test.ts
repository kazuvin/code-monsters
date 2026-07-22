import { describe, expect, it } from 'vitest';
import { adjacentPoweredBuildNeighbors, circuitConditionsForBlock, type CircuitAnalysis } from './circuit';
import { effectScalingBonus } from './skill-progress';
import type { BlockDefinition, CircuitBoard } from './types';

const blocks: BlockDefinition[] = [
  {
    id: 'resonance-core',
    code: 'CORE',
    title: '霊響核',
    description: '周囲の霊響と共鳴する。',
    glyph: '響',
    price: 4,
    rarity: 'common',
    ports: ['west', 'east'],
    buildIds: ['resonance'],
    cooldown: 1,
    effects: [
      {
        kind: 'damage',
        amount: 10,
        trigger: { kind: 'adjacent-build-at-least', buildId: 'resonance', amount: 2 },
        scaling: { kind: 'adjacent-build', buildId: 'resonance', every: 1, amount: 5 },
      },
    ],
  },
  {
    id: 'resonance-ally',
    code: 'ALLY',
    title: '霊響片',
    description: '霊響核へ力を与える。',
    glyph: '霊',
    price: 4,
    rarity: 'common',
    ports: ['west', 'east'],
    buildIds: ['resonance'],
    cooldown: 1,
    effects: [{ kind: 'damage', amount: 1 }],
  },
  {
    id: 'foreign-skill',
    code: 'OTHER',
    title: '異なる技',
    description: '霊響には属さない。',
    glyph: '異',
    price: 4,
    rarity: 'common',
    ports: ['west', 'east'],
    buildIds: ['poison'],
    cooldown: 1,
    effects: [{ kind: 'damage', amount: 1 }],
  },
];

const boardFor = (stars: 0 | 1): CircuitBoard => [
  [
    { blockId: 'resonance-ally', rotation: 0 },
    { blockId: 'resonance-ally', rotation: 0 },
    { blockId: 'foreign-skill', rotation: 0 },
  ],
  [
    { blockId: 'foreign-skill', rotation: 0 },
    { blockId: 'resonance-core', rotation: 0, stars },
    { blockId: 'resonance-ally', rotation: 0 },
  ],
  [
    { blockId: 'resonance-ally', rotation: 0 },
    { blockId: 'foreign-skill', rotation: 0 },
    { blockId: 'resonance-ally', rotation: 0 },
  ],
];

const analysis: CircuitAnalysis = {
  poweredCells: new Set(['0:0', '0:1', '0:2', '1:0', '1:1', '1:2', '2:0', '2:1', '2:2']),
  heartConnections: new Set(),
  routeLength: new Map([['1:1', 1]]),
  cyclicCells: new Set(),
  waveStep: new Map(),
  mergeCells: new Set(),
  branchCells: new Set(),
  fullyConnectedCells: new Set(),
  straightLineLength: new Map(),
  straightLineCells: new Map(),
  upstreamCells: new Map(),
  downstreamCells: new Map(),
};

describe('spirit resonance adjacency', () => {
  it('counts powered members of the configured build in all eight surrounding cells', () => {
    expect(
      adjacentPoweredBuildNeighbors(boardFor(0), blocks, analysis, { row: 1, column: 1 }, 'resonance').map(
        ({ row, column }) => `${row}:${column}`,
      ),
    ).toEqual(['0:0', '0:1', '1:2', '2:0', '2:2']);
  });

  it('lets a starred skill count every powered node in all eight surrounding cells', () => {
    expect(
      adjacentPoweredBuildNeighbors(boardFor(1), blocks, analysis, { row: 1, column: 1 }, 'resonance').map(
        ({ row, column }) => `${row}:${column}`,
      ),
    ).toEqual(['0:0', '0:1', '0:2', '1:0', '1:2', '2:0', '2:1', '2:2']);
  });

  it('reports current resonance progress and its contributing cells', () => {
    const [condition] = circuitConditionsForBlock(boardFor(0), blocks, analysis, { row: 1, column: 1 }, blocks[0]);

    expect(condition).toEqual({
      trigger: { kind: 'adjacent-build-at-least', buildId: 'resonance', amount: 2 },
      met: true,
      current: 5,
      required: 2,
      contributingCells: ['0:0', '0:1', '1:1', '1:2', '2:0', '2:2'],
    });
  });

  it('uses the requested build count for effect scaling', () => {
    expect(
      effectScalingBonus(
        { kind: 'adjacent-build', buildId: 'resonance', every: 1, amount: 5 },
        {
          enemyPoison: 0,
          pathLength: 0,
          straightLineLength: 0,
          magicSigilLevel: 0,
          magicSigilCount: 0,
          adjacentBuildCounts: { resonance: 8 },
        },
      ),
    ).toBe(40);
  });
});
