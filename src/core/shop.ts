import type { BlockDefinition, ShopOffer } from './types';

const randomUnit = (seed: number) => {
  const value = Math.sin(seed * 9301 + 49297) * 233280;
  return value - Math.floor(value);
};

const pickWeighted = (blocks: BlockDefinition[], seed: number) => {
  const total = blocks.reduce((sum, block) => sum + (block.shopWeight ?? 1), 0);
  let cursor = randomUnit(seed) * total;
  for (const block of blocks) {
    cursor -= block.shopWeight ?? 1;
    if (cursor <= 0) return block;
  }
  return blocks[blocks.length - 1];
};

export function createShop(blocks: BlockDefinition[], seed: number, size: number): ShopOffer[] {
  if (blocks.length < size) throw new Error('Shop size exceeds the block pool');
  const used = new Set<string>();
  return Array.from({ length: size }, (_, slot) => {
    const candidates = blocks.filter((block) => !used.has(block.id));
    const block = pickWeighted(candidates, seed * 17 + slot * 31 + 7);
    used.add(block.id);
    return { id: `${seed}-${slot}-${block.id}`, slot, blockId: block.id, locked: false };
  });
}

export function rerollShop(blocks: BlockDefinition[], current: ShopOffer[], seed: number, size: number): ShopOffer[] {
  const retained = new Map(current.filter((offer) => offer.locked).map((offer) => [offer.slot, offer]));
  const used = new Set([...retained.values()].map((offer) => offer.blockId));
  return Array.from({ length: size }, (_, slot) => {
    const locked = retained.get(slot);
    if (locked) return locked;
    const candidates = blocks.filter((block) => !used.has(block.id));
    const block = pickWeighted(candidates, seed * 17 + slot * 31 + 7);
    used.add(block.id);
    return { id: `${seed}-${slot}-${block.id}`, slot, blockId: block.id, locked: false };
  });
}
