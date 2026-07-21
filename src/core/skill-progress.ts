import { cellKey, type CircuitAnalysis } from './circuit';
import type {
  ActiveEffect,
  BlockDefinition,
  BlockEffect,
  BuffStat,
  CellPosition,
  CircuitBoard,
  EffectScaling,
  SkillBuffState,
} from './types';

export const BUFF_STATS: BuffStat[] = ['damage', 'poison', 'shield', 'repair', 'rupture'];

export type EffectScalingContext = {
  enemyPoison: number;
  pathLength: number;
};

export type SkillModifiers = {
  effectPower: number;
  cooldownReduction: number;
};

export type SkillEffectProgress = {
  effectIndex: number;
  stat: BuffStat;
  baseAmount: number;
  battleBuff: number;
  circuitBoost: number;
  scalingBonus: number;
  currentAmount: number;
};

export type SkillProgress = {
  buffs: SkillBuffState;
  effects: SkillEffectProgress[];
};

export function buffStatForEffect(effect: BlockEffect): BuffStat | null {
  if (effect.kind === 'damage') return 'damage';
  if (effect.kind === 'poison') return 'poison';
  if (effect.kind === 'shield') return 'shield';
  if (effect.kind === 'repair') return 'repair';
  if (effect.kind === 'rupture-poison') return 'rupture';
  if (effect.kind === 'release-charge') return effect.output;
  return null;
}

export function buffStatsForBlock(block: BlockDefinition): BuffStat[] {
  return [...new Set(block.effects.map(buffStatForEffect).filter((stat): stat is BuffStat => stat !== null))];
}

export function effectScalingBonus(scaling: EffectScaling | undefined, context: EffectScalingContext): number {
  if (!scaling) return 0;
  const source = scaling.kind === 'enemy-poison' ? context.enemyPoison : context.pathLength;
  return Math.floor(source / scaling.every) * scaling.amount;
}

export function incomingSkillModifiers(
  board: CircuitBoard,
  blocks: BlockDefinition[],
  analysis: CircuitAnalysis,
  position: CellPosition,
): SkillModifiers {
  const definitions = new Map(blocks.map((block) => [block.id, block]));
  const inputs = (analysis.upstreamCells.get(cellKey(position)) ?? [])
    .map((input) => board[input.row][input.column])
    .map((placed) => (placed ? definitions.get(placed.blockId) : undefined))
    .filter((block): block is BlockDefinition => Boolean(block));

  return inputs.reduce<SkillModifiers>(
    (modifiers, block) => {
      block.effects.forEach((effect) => {
        if (effect.kind === 'amplify') modifiers.effectPower += effect.amount;
        if (effect.kind === 'haste') modifiers.cooldownReduction += effect.amount;
      });
      return modifiers;
    },
    { effectPower: 0, cooldownReduction: 0 },
  );
}

const activeEffectAmount = (effect: ActiveEffect) =>
  effect.kind === 'rupture-poison' ? effect.damagePerStack : effect.amount;

export function summarizeSkillProgress(
  block: BlockDefinition,
  buffs: SkillBuffState = {},
  modifiers: SkillModifiers = { effectPower: 0, cooldownReduction: 0 },
  scalingContext: EffectScalingContext = { enemyPoison: 0, pathLength: 0 },
): SkillProgress {
  const normalizedBuffs = Object.fromEntries(
    BUFF_STATS.flatMap((stat) => {
      const value = buffs[stat];
      return Number.isFinite(value) && value && value > 0 ? [[stat, Math.floor(value)]] : [];
    }),
  ) as SkillBuffState;
  const effects = block.effects.flatMap((effect, effectIndex): SkillEffectProgress[] => {
    const stat = buffStatForEffect(effect);
    if (!stat) return [];
    const activeEffect = effect as ActiveEffect;
    const baseAmount = activeEffectAmount(activeEffect);
    const battleBuff = normalizedBuffs[stat] ?? 0;
    const scalingBonus = 'scaling' in activeEffect ? effectScalingBonus(activeEffect.scaling, scalingContext) : 0;
    return [
      {
        effectIndex,
        stat,
        baseAmount,
        battleBuff,
        circuitBoost: modifiers.effectPower,
        scalingBonus,
        currentAmount: baseAmount + battleBuff + modifiers.effectPower + scalingBonus,
      },
    ];
  });

  return { buffs: normalizedBuffs, effects };
}
