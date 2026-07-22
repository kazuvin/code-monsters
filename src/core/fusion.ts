import { cloneBoard } from './circuit';
import type {
  BlockDefinition,
  BlockEffect,
  CircuitBoard,
  PlacedBlock,
  Rarity,
  SkillFusionRules,
  SkillStars,
} from './types';

const randomUnit = (seed: number) => {
  const value = Math.sin(seed * 9301 + 49297) * 233280;
  return value - Math.floor(value);
};

const boosted = (value: number, multiplier: number) => Math.round(value * multiplier);

const upgradeEffect = (effect: BlockEffect, multiplier: number): BlockEffect => {
  if (effect.kind === 'coin') return { ...effect };
  if (effect.kind === 'release-charge') {
    return {
      ...effect,
      amount: boosted(effect.amount, multiplier),
      perCharge: boosted(effect.perCharge, multiplier),
    };
  }
  if (effect.kind === 'rupture-poison') {
    return {
      ...effect,
      fraction: Math.min(1, Math.round(effect.fraction * multiplier * 100) / 100),
      damagePerStack: boosted(effect.damagePerStack, multiplier),
    };
  }
  if (effect.kind === 'damage' || effect.kind === 'shield' || effect.kind === 'repair' || effect.kind === 'poison') {
    return {
      ...effect,
      amount: boosted(effect.amount, multiplier),
      ...(effect.scaling ? { scaling: { ...effect.scaling, amount: boosted(effect.scaling.amount, multiplier) } } : {}),
    };
  }
  return { ...effect, amount: boosted(effect.amount, multiplier) };
};

export function upgradeBlockDefinition(
  block: BlockDefinition,
  stars: SkillStars = 0,
  rules: SkillFusionRules,
): BlockDefinition {
  if (stars === 0) return block;
  if (block.fusion) {
    return {
      ...block,
      title: block.fusion.title,
      description: block.fusion.description,
      glyph: block.fusion.glyph ?? block.glyph,
      cooldown: block.fusion.cooldown === null ? undefined : (block.fusion.cooldown ?? block.cooldown),
      effects: block.fusion.effects.map((effect) => ({ ...effect })),
    };
  }
  return {
    ...block,
    cooldown: block.cooldown ? Math.max(1, block.cooldown - rules.cooldownReduction) : undefined,
    effects: block.effects.map((effect) => upgradeEffect(effect, rules.effectMultiplier)),
  };
}

type CopyLocation =
  | { kind: 'board'; row: number; column: number; placed: PlacedBlock }
  | { kind: 'rack'; index: number; placed: PlacedBlock };

export function fuseSkillCopies(
  board: CircuitBoard,
  rack: PlacedBlock[],
  blockId: string,
  copiesRequired: number,
): { board: CircuitBoard; rack: PlacedBlock[]; upgraded: PlacedBlock } | null {
  const copies: CopyLocation[] = [];
  board.forEach((row, rowIndex) =>
    row.forEach((placed, columnIndex) => {
      if (placed?.blockId === blockId && (placed.stars ?? 0) === 0) {
        copies.push({ kind: 'board', row: rowIndex, column: columnIndex, placed });
      }
    }),
  );
  rack.forEach((placed, index) => {
    if (placed.blockId === blockId && (placed.stars ?? 0) === 0) copies.push({ kind: 'rack', index, placed });
  });
  if (copies.length < copiesRequired) return null;

  const selected = copies.slice(0, copiesRequired);
  const keeper = selected[0];
  const nextBoard = cloneBoard(board);
  const consumedRackIndexes = new Set<number>();
  selected.forEach((copy) => {
    if (copy.kind === 'board') nextBoard[copy.row][copy.column] = null;
    else consumedRackIndexes.add(copy.index);
  });
  const nextRack = rack.filter((_, index) => !consumedRackIndexes.has(index));
  const upgraded: PlacedBlock = { ...keeper.placed, stars: 1 };
  if (keeper.kind === 'board') nextBoard[keeper.row][keeper.column] = upgraded;
  else nextRack.push(upgraded);

  return { board: nextBoard, rack: nextRack, upgraded };
}

export function pickFusionRewardIds(blocks: BlockDefinition[], rarity: Rarity, seed: number, size: number): string[] {
  const candidates = blocks.filter((block) => block.rarity === rarity && block.price > 0);
  if (candidates.length < size) throw new Error(`${rarity} fusion reward pool needs at least ${size} skills`);
  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(randomUnit(seed * 41 + index * 67) * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled.slice(0, size).map((block) => block.id);
}
