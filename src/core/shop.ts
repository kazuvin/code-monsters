import type { BlockDefinition, RarityWeights, Rotation, ShopOffer } from './types';

const randomUnit = (seed: number) => {
  const value = Math.sin(seed * 9301 + 49297) * 233280;
  return value - Math.floor(value);
};

const effectiveWeight = (block: BlockDefinition, rarityWeights: RarityWeights) =>
  rarityWeights[block.rarity] * (block.shopWeight ?? 1);

const randomRotation = (seed: number): Rotation => Math.floor(randomUnit(seed * 53 + 11) * 4) as Rotation;

const pickWeighted = (blocks: BlockDefinition[], rarityWeights: RarityWeights, seed: number) => {
  const total = blocks.reduce((sum, block) => sum + effectiveWeight(block, rarityWeights), 0);
  let cursor = randomUnit(seed) * total;
  for (const block of blocks) {
    cursor -= effectiveWeight(block, rarityWeights);
    if (cursor <= 0) return block;
  }
  return blocks[blocks.length - 1];
};

export function createShop(
  blocks: BlockDefinition[],
  rarityWeights: RarityWeights,
  seed: number,
  size: number,
): ShopOffer[] {
  if (blocks.length < size) throw new Error('Shop size exceeds the block pool');
  const used = new Set<string>();
  return Array.from({ length: size }, (_, slot) => {
    const candidates = blocks.filter((block) => !used.has(block.id));
    const block = pickWeighted(candidates, rarityWeights, seed * 17 + slot * 31 + 7);
    used.add(block.id);
    return {
      id: `${seed}-${slot}-${block.id}`,
      slot,
      blockId: block.id,
      rotation: randomRotation(seed * 19 + slot * 37),
      locked: false,
    };
  });
}

export function rerollShop(
  blocks: BlockDefinition[],
  rarityWeights: RarityWeights,
  current: ShopOffer[],
  seed: number,
  size: number,
): ShopOffer[] {
  const retained = new Map(current.filter((offer) => offer.locked).map((offer) => [offer.slot, offer]));
  const used = new Set([...retained.values()].map((offer) => offer.blockId));
  return Array.from({ length: size }, (_, slot) => {
    const locked = retained.get(slot);
    if (locked) return locked;
    const candidates = blocks.filter((block) => !used.has(block.id));
    const block = pickWeighted(candidates, rarityWeights, seed * 17 + slot * 31 + 7);
    used.add(block.id);
    return {
      id: `${seed}-${slot}-${block.id}`,
      slot,
      blockId: block.id,
      rotation: randomRotation(seed * 19 + slot * 37),
      locked: false,
    };
  });
}

export function advanceShop(
  blocks: BlockDefinition[],
  rarityWeights: RarityWeights,
  current: ShopOffer[],
  seed: number,
  size: number,
): ShopOffer[] {
  return rerollShop(blocks, rarityWeights, current, seed, size);
}
