import type { BlockDefinition, EffectScaling } from './types';

export type SkillEffectProgress = {
  effectIndex: number;
  baseAmount: number;
  growthBonus: number;
  currentAmount: number;
};

export type SkillGrowthProgress = {
  growth: number;
  nextGrowthAt: number | null;
  effects: SkillEffectProgress[];
};

export type EffectScalingContext = {
  selfGrowth: number;
  enemyPoison: number;
  pathLength: number;
};

export function effectScalingBonus(scaling: EffectScaling | undefined, context: EffectScalingContext): number {
  if (!scaling) return 0;
  const source =
    scaling.kind === 'self-growth'
      ? context.selfGrowth
      : scaling.kind === 'enemy-poison'
        ? context.enemyPoison
        : context.pathLength;
  return Math.floor(source / scaling.every) * scaling.amount;
}

export function summarizeSkillGrowth(block: BlockDefinition, growthValue: number): SkillGrowthProgress {
  const growth = Number.isFinite(growthValue) ? Math.max(0, Math.floor(growthValue)) : 0;
  const effects = block.effects.flatMap((effect, effectIndex): SkillEffectProgress[] => {
    if (!('scaling' in effect) || effect.scaling?.kind !== 'self-growth') return [];
    const growthBonus = effectScalingBonus(effect.scaling, { selfGrowth: growth, enemyPoison: 0, pathLength: 0 });
    return [
      {
        effectIndex,
        baseAmount: effect.amount,
        growthBonus,
        currentAmount: effect.amount + growthBonus,
      },
    ];
  });
  const nextGrowthAt = block.effects.reduce<number | null>((next, effect) => {
    if (!('scaling' in effect) || effect.scaling?.kind !== 'self-growth') return next;
    const milestone = (Math.floor(growth / effect.scaling.every) + 1) * effect.scaling.every;
    return next === null ? milestone : Math.min(next, milestone);
  }, null);

  return { growth, nextGrowthAt, effects };
}
