import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { circuitDiagramForBlock } from './circuit-diagram';

const block = (blockId: string) => GAME_DATA.blocks.find((candidate) => candidate.id === blockId)!;

describe('circuit diagram', () => {
  it('omits the diagram for cards without spatial circuit behavior', () => {
    expect(circuitDiagramForBlock(block('strike'), 0)).toBeNull();
  });

  it.each([
    ['return-coil', 'cycle'],
    ['accelerator', 'all-ports'],
    ['long-route-fang', 'straight-line'],
    ['guiding-bolt', 'inscription'],
    ['sigil-cannon', 'magic-sigil'],
    ['resonance-circle', 'magic-sigil-network'],
    ['spirit-blade', 'resonance'],
    ['prism-arrow', 'branch'],
    ['convergence-cannon', 'merge'],
    ['adaptive-arsenal', 'powered-trait'],
    ['cultivation-blade', 'downstream'],
    ['charge-coil', 'charge-flow'],
    ['rail-cannon', 'charge-release'],
  ] as const)('maps %s to a %s diagram', (blockId, kind) => {
    const diagram = circuitDiagramForBlock(block(blockId), 0);

    expect(diagram?.kind).toBe(kind);
    expect(diagram?.nodes).toContainEqual(expect.objectContaining({ row: 2, column: 2, role: 'target' }));
    expect(diagram?.nodes.every((node) => node.row >= 0 && node.row < 5 && node.column >= 0 && node.column < 5)).toBe(
      true,
    );
  });

  it('rotates inscription targets with the card', () => {
    const normal = circuitDiagramForBlock(block('guiding-bolt'), 0)!;
    const rotated = circuitDiagramForBlock(block('guiding-bolt'), 1)!;

    expect(normal.nodes.filter((node) => node.role === 'affected')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 2, column: 3 }),
        expect.objectContaining({ row: 2, column: 4 }),
      ]),
    );
    expect(rotated.nodes.filter((node) => node.role === 'affected')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 3, column: 2 }),
        expect.objectContaining({ row: 4, column: 2 }),
      ]),
    );
  });

  it('uses all 25 cells as a fixed visual frame', () => {
    expect(circuitDiagramForBlock(block('spirit-blade'), 0)?.size).toBe(5);
  });
});
