import { describe, expect, it } from 'vitest';
import { createShop, rerollShop } from './shop';
import type { BlockDefinition } from './types';

const blocks: BlockDefinition[] = Array.from({ length: 7 }, (_, index) => ({
  id: `block-${index}`,
  code: `B${index}`,
  title: `ブロック${index}`,
  description: `ブロック${index}の効果`,
  glyph: String(index),
  price: 2,
  rarity: index > 4 ? 'rare' : 'common',
  inputPorts: ['west'],
  outputPorts: ['east'],
  cooldown: 1,
  effects: [{ kind: 'damage', amount: 1 }],
}));

describe('shop', () => {
  it('creates deterministic unique block offers from a seed', () => {
    expect(createShop(blocks, 42, 5)).toEqual(createShop(blocks, 42, 5));
    expect(new Set(createShop(blocks, 42, 5).map((offer) => offer.blockId)).size).toBe(5);
  });

  it('keeps locked offers when rerolling', () => {
    const current = createShop(blocks, 12, 5).map((offer, index) => ({ ...offer, locked: index === 1 }));
    const next = rerollShop(blocks, current, 13, 5);

    expect(next[1]).toEqual(current[1]);
    expect(new Set(next.map((offer) => offer.blockId)).size).toBe(5);
  });
});
