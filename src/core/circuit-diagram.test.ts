import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { circuitDiagramForBlock } from './circuit-diagram';

const block = (blockId: string) => GAME_DATA.blocks.find((candidate) => candidate.id === blockId)!;

describe('packet circuit diagram', () => {
  it('omits the diagram for a source that does not alter circuit flow', () => {
    expect(circuitDiagramForBlock(block('strike'), 0)).toBeNull();
  });

  it.each([
    ['return-coil', 'cycle'],
    ['accelerator', 'merge'],
    ['long-route-fang', 'resonance'],
    ['guiding-bolt', 'inscription'],
    ['spirit-blade', 'resonance'],
    ['prism-arrow', 'branch'],
    ['convergence-cannon', 'merge'],
    ['charge-coil', 'charge-flow'],
    ['rail-cannon', 'charge-release'],
    ['rupture-stake', 'charge-release'],
  ] as const)('maps %s to a %s packet diagram', (blockId, kind) => {
    const result = circuitDiagramForBlock(block(blockId), 0);

    expect(result?.kind).toBe(kind);
    expect(result?.nodes).toContainEqual(expect.objectContaining({ row: 2, column: 2, role: 'target' }));
    expect(result?.nodes.every((node) => node.row >= 0 && node.row < 5 && node.column >= 0 && node.column < 5)).toBe(
      true,
    );
  });

  it('rotates the shown input and output with the card while keeping the target centered', () => {
    const normal = circuitDiagramForBlock(block('guiding-bolt'), 0)!;
    const rotated = circuitDiagramForBlock(block('guiding-bolt'), 1)!;

    expect(normal.nodes).toContainEqual(expect.objectContaining({ row: 2, column: 0, role: 'source' }));
    expect(normal.nodes).toContainEqual(expect.objectContaining({ row: 2, column: 3, role: 'affected' }));
    expect(rotated.nodes).toContainEqual(expect.objectContaining({ row: 0, column: 2, role: 'source' }));
    expect(rotated.nodes).toContainEqual(expect.objectContaining({ row: 3, column: 2, role: 'affected' }));
    expect(rotated.nodes).toContainEqual(expect.objectContaining({ row: 2, column: 2, role: 'target' }));
  });

  it('uses all 25 cells as a fixed visual frame', () => {
    expect(circuitDiagramForBlock(block('spirit-blade'), 0)?.size).toBe(5);
  });
});
