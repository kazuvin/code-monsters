import { describe, expect, it } from 'vitest';
import { rotatePorts } from './circuit';
import { advanceShop, createShop, rerollShop } from './shop';
import type { BlockDefinition, Rarity, RarityWeights } from './types';

const rarityWeights: RarityWeights = {
  common: 100,
  rare: 50,
  epic: 30,
  legendary: 15,
};

const blocks: BlockDefinition[] = Array.from({ length: 7 }, (_, index) => ({
  id: `block-${index}`,
  code: `B${index}`,
  title: `ブロック${index}`,
  description: `ブロック${index}の効果`,
  glyph: String(index),
  price: 2,
  rarity: index > 4 ? 'rare' : 'common',
  ports: ['west', 'east'],
  cooldown: 1,
  effects: [{ kind: 'damage', amount: 1 }],
}));

describe('shop', () => {
  it('creates deterministic unique block offers from a seed', () => {
    expect(createShop(blocks, rarityWeights, 42, 5)).toEqual(createShop(blocks, rarityWeights, 42, 5));
    expect(new Set(createShop(blocks, rarityWeights, 42, 5).map((offer) => offer.blockId)).size).toBe(5);
  });

  it('randomizes only connector direction while preserving the authored edge count', () => {
    const corner = [{ ...blocks[0], id: 'corner', ports: ['west', 'north'] as BlockDefinition['ports'] }];
    const offers = Array.from(
      { length: 32 },
      (_, seed) => createShop(corner, rarityWeights, seed + 1, 1, new Set(['corner']))[0],
    );

    expect(new Set(offers.map((offer) => offer.rotation))).toEqual(new Set([0, 1, 2, 3]));
    expect(offers.every((offer) => corner[0].ports.length === 2)).toBe(true);
  });

  it('gives every unowned offer a west connector while preserving eligible direction variety', () => {
    const corner = [{ ...blocks[0], id: 'corner', ports: ['west', 'north'] as BlockDefinition['ports'] }];
    const offers = Array.from({ length: 32 }, (_, seed) => createShop(corner, rarityWeights, seed + 1, 1)[0]);

    expect(offers.every((offer) => rotatePorts(corner[0].ports, offer.rotation).includes('west'))).toBe(true);
    expect(new Set(offers.map((offer) => offer.rotation)).size).toBeGreaterThan(1);
  });

  it('keeps locked offers when rerolling', () => {
    const current = createShop(blocks, rarityWeights, 12, 5).map((offer, index) => ({
      ...offer,
      locked: index === 1,
    }));
    const next = rerollShop(blocks, rarityWeights, current, 13, 5);

    expect(next[1]).toEqual(current[1]);
    expect(new Set(next.map((offer) => offer.blockId)).size).toBe(5);
  });

  it('keeps locked offers when advancing to the next run', () => {
    const current = createShop(blocks, rarityWeights, 12, 5).map((offer, index) => ({
      ...offer,
      locked: index === 1,
    }));
    const next = advanceShop(blocks, rarityWeights, current, 23, 5);

    expect(next[1]).toEqual(current[1]);
    expect(next.filter((offer) => offer.locked)).toHaveLength(1);
  });

  it('makes each higher rarity progressively harder to roll', () => {
    const rarityBlocks = (Object.keys(rarityWeights) as Rarity[]).map((rarity) => ({
      ...blocks[0],
      id: rarity,
      rarity,
      shopWeight: 1,
    }));
    const counts = Object.fromEntries((Object.keys(rarityWeights) as Rarity[]).map((rarity) => [rarity, 0])) as Record<
      Rarity,
      number
    >;

    for (let seed = 1; seed <= 4000; seed += 1) {
      const [offer] = createShop(rarityBlocks, rarityWeights, seed, 1);
      counts[offer.blockId as Rarity] += 1;
    }

    expect(counts.common).toBeGreaterThan(counts.rare);
    expect(counts.rare).toBeGreaterThan(counts.epic);
    expect(counts.epic).toBeGreaterThan(counts.legendary);
  });
});
