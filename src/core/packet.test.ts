import { describe, expect, it } from 'vitest';
import { analyzeCircuit } from './circuit';
import { resolvePacketCircuit } from './packet';
import type { BlockDefinition, CircuitBoard, PacketNodeEffect } from './types';

const board = (size = 5): CircuitBoard => Array.from({ length: size }, () => Array.from({ length: size }, () => null));

const block = (
  id: string,
  ports: BlockDefinition['ports'],
  effects: PacketNodeEffect[],
  cooldown?: number,
): BlockDefinition => ({
  id,
  code: id.toUpperCase(),
  title: id,
  description: `${id}。`,
  glyph: id[0],
  price: 1,
  rarity: 'common',
  ports,
  effects: [{ kind: 'damage', amount: 1 }],
  packet: {
    role: effects.some((effect) => effect.kind === 'generate-packet')
      ? effects.some((effect) => effect.kind !== 'generate-packet')
        ? 'hybrid'
        : 'source'
      : effects.some((effect) => effect.kind === 'convert-packet')
        ? 'sink'
        : 'operator',
    effects,
  },
  ...(cooldown ? { cooldown } : {}),
});

const fusionRules = {
  copiesRequired: 3,
  rewardChoices: 3,
  effectMultiplier: 1.5,
  cooldownReduction: 1,
};

describe('packet circuit', () => {
  it('generates state, lets operators transform it, and resolves it at the route end', () => {
    const blocks = [
      block('source', ['west', 'east'], [{ kind: 'generate-packet', payload: 'poison', amount: 4 }], 1),
      block('echo-a', ['west', 'east'], [{ kind: 'echo-packet' }]),
      block('echo-b', ['west'], [{ kind: 'echo-packet' }]),
    ];
    const circuit = board(3);
    circuit[1][0] = { blockId: 'source', rotation: 0 };
    circuit[1][1] = { blockId: 'echo-a', rotation: 0 };
    circuit[1][2] = { blockId: 'echo-b', rotation: 0 };
    const analysis = analyzeCircuit(circuit, blocks, { row: 1, column: -1 });

    const result = resolvePacketCircuit({
      board: circuit,
      blocks,
      analysis,
      tick: 1,
      fusionRules,
    });

    expect(result.actions).toEqual([expect.objectContaining({ blockId: 'echo-b', kind: 'poison', amount: 8 })]);
  });

  it('conserves payload while splitting and recombines simultaneous routes at a merge', () => {
    const blocks = [
      block(
        'split-source',
        ['west', 'north', 'south'],
        [{ kind: 'generate-packet', payload: 'charge', amount: 10 }, { kind: 'split-packet' }],
        1,
      ),
      block('upper-corner', ['south', 'east'], [{ kind: 'imprint-packet', imprint: 'assault' }]),
      block('upper-line', ['west', 'south'], [{ kind: 'imprint-packet', imprint: 'assault' }]),
      block('lower-corner', ['north', 'east'], [{ kind: 'imprint-packet', imprint: 'assault' }]),
      block('lower-line', ['west', 'north'], [{ kind: 'imprint-packet', imprint: 'assault' }]),
      block('merge', ['north', 'south', 'east'], [{ kind: 'merge-packet' }]),
      block(
        'cannon',
        ['west'],
        [{ kind: 'convert-packet', input: 'charge', output: 'damage', amount: 0, perUnit: 10 }],
        1,
      ),
    ];
    const circuit = board();
    circuit[2][1] = { blockId: 'split-source', rotation: 0 };
    circuit[1][1] = { blockId: 'upper-corner', rotation: 0 };
    circuit[1][2] = { blockId: 'upper-line', rotation: 0 };
    circuit[3][1] = { blockId: 'lower-corner', rotation: 0 };
    circuit[3][2] = { blockId: 'lower-line', rotation: 0 };
    circuit[2][2] = { blockId: 'merge', rotation: 0 };
    circuit[2][3] = { blockId: 'cannon', rotation: 0 };
    const analysis = analyzeCircuit(circuit, blocks, { row: 2, column: 0 });

    const result = resolvePacketCircuit({
      board: circuit,
      blocks,
      analysis,
      tick: 1,
      fusionRules,
    });

    expect(result.actions).toEqual([
      expect.objectContaining({ blockId: 'cannon', kind: 'damage', amount: 100, charge: 10 }),
    ]);
  });

  it('uses an imprint to change the eventual output without knowing the carried state', () => {
    const blocks = [
      block('source', ['west', 'east'], [{ kind: 'generate-packet', payload: 'damage', amount: 12 }], 1),
      block('guard-imprint', ['west'], [{ kind: 'imprint-packet', imprint: 'guard' }]),
    ];
    const circuit = board(3);
    circuit[1][0] = { blockId: 'source', rotation: 0 };
    circuit[1][1] = { blockId: 'guard-imprint', rotation: 0 };
    const analysis = analyzeCircuit(circuit, blocks, { row: 1, column: -1 });

    const result = resolvePacketCircuit({
      board: circuit,
      blocks,
      analysis,
      tick: 1,
      fusionRules,
    });

    expect(result.actions).toEqual([expect.objectContaining({ blockId: 'guard-imprint', kind: 'shield', amount: 12 })]);
  });

  it('does not generate state again while its source is on cooldown', () => {
    const blocks = [
      block('source', ['west', 'east'], [{ kind: 'generate-packet', payload: 'damage', amount: 9 }], 2),
      block('route', ['west'], [{ kind: 'imprint-packet', imprint: 'assault' }]),
    ];
    const circuit = board(3);
    circuit[1][0] = { blockId: 'source', rotation: 0 };
    circuit[1][1] = { blockId: 'route', rotation: 0 };
    const analysis = analyzeCircuit(circuit, blocks, { row: 1, column: -1 });

    const result = resolvePacketCircuit({
      board: circuit,
      blocks,
      analysis,
      tick: 2,
      fusionRules,
    });

    expect(result.actions).toEqual([]);
  });

  it('recirculates the whole packet once when the operator belongs to a loop', () => {
    const blocks = [
      block('source', ['west', 'east'], [{ kind: 'generate-packet', payload: 'damage', amount: 7 }], 1),
      block('return', ['west'], [{ kind: 'recirculate-packet' }]),
    ];
    const circuit = board(3);
    circuit[1][0] = { blockId: 'source', rotation: 0 };
    circuit[1][1] = { blockId: 'return', rotation: 0 };
    const analysis = analyzeCircuit(circuit, blocks, { row: 1, column: -1 });
    analysis.cyclicCells.add('1:1');

    const result = resolvePacketCircuit({
      board: circuit,
      blocks,
      analysis,
      tick: 1,
      fusionRules,
    });

    expect(result.actions).toEqual([expect.objectContaining({ blockId: 'return', kind: 'damage', amount: 14 })]);
  });
});
