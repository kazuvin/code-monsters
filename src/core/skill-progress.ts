import { adjacentPoweredNeighbors, cellKey, matchesCircuitTrigger, type CircuitAnalysis } from './circuit';
import { upgradeBlockDefinition } from './fusion';
import type {
  ActiveEffect,
  BlockDefinition,
  BlockEffect,
  BuffStat,
  CellPosition,
  CircuitBoard,
  EffectScaling,
  MagicSigilRules,
  SkillFusionRules,
  SkillBuffState,
} from './types';

export const BUFF_STATS: BuffStat[] = ['damage', 'poison', 'shield', 'repair', 'rupture'];

export type EffectScalingContext = {
  enemyPoison: number;
  pathLength: number;
  straightLineLength: number;
  magicSigilLevel: number;
  magicSigilCount: number;
  adjacentPoweredCount: number;
  downstreamCount?: number;
  upstreamCount?: number;
  poweredAxisCounts?: Readonly<Record<string, number>>;
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
  const source =
    scaling.kind === 'enemy-poison'
      ? context.enemyPoison
      : scaling.kind === 'path-length'
        ? context.pathLength
        : scaling.kind === 'straight-line'
          ? context.straightLineLength
          : scaling.kind === 'magic-sigil-level'
            ? context.magicSigilLevel
            : scaling.kind === 'magic-sigil-count'
              ? context.magicSigilCount
              : scaling.kind === 'powered-axis'
                ? (context.poweredAxisCounts?.[`${scaling.axisId}:${scaling.valueId}`] ?? 0)
                : scaling.kind === 'adjacent-powered'
                  ? context.adjacentPoweredCount
                  : scaling.kind === 'downstream-count'
                    ? (context.downstreamCount ?? 0)
                    : (context.upstreamCount ?? 0);
  const stacks = Math.floor(source / scaling.every);
  return Math.min(stacks, scaling.maxStacks ?? stacks) * scaling.amount;
}

export function magicSigilModifiers(level: number, rules: MagicSigilRules): SkillModifiers {
  const safeLevel = Math.min(rules.maxLevel, Math.max(0, Math.floor(level)));
  return {
    effectPower: safeLevel * rules.effectPowerPerLevel,
    cooldownReduction: safeLevel >= rules.hasteLevel ? rules.cooldownReduction : 0,
  };
}

export function combineSkillModifiers(...values: SkillModifiers[]): SkillModifiers {
  return values.reduce(
    (result, value) => ({
      effectPower: result.effectPower + value.effectPower,
      cooldownReduction: result.cooldownReduction + value.cooldownReduction,
    }),
    { effectPower: 0, cooldownReduction: 0 },
  );
}

const modifierTriggerMatches = (
  effect: Extract<BlockEffect, { kind: 'amplify' | 'haste' }>,
  board: CircuitBoard,
  blocks: BlockDefinition[],
  analysis: CircuitAnalysis,
  position: CellPosition,
) => {
  const trigger = effect.trigger;
  const key = cellKey(position);
  if (!trigger) return true;
  if (trigger.kind === 'enemy-poisoned') return false;
  const adjacentPoweredCount =
    trigger.kind === 'adjacent-powered-at-least'
      ? adjacentPoweredNeighbors(board, blocks, analysis, position).length
      : 0;
  return matchesCircuitTrigger(trigger, {
    pathLength: analysis.routeLength.get(key) ?? 0,
    inCycle: analysis.cyclicCells.has(key),
    allPortsConnected: analysis.fullyConnectedCells.has(key),
    straightLineLength: analysis.straightLineLength.get(key) ?? 0,
    magicSigilLevel: 0,
    adjacentPoweredCount,
    downstreamCount: analysis.downstreamCells.get(key)?.length ?? 0,
    upstreamCount: analysis.upstreamCells.get(key)?.length ?? 0,
  });
};

export function incomingSkillModifiers(
  board: CircuitBoard,
  blocks: BlockDefinition[],
  analysis: CircuitAnalysis,
  position: CellPosition,
  fusionRules?: SkillFusionRules,
): SkillModifiers {
  const definitions = new Map(blocks.map((block) => [block.id, block]));
  const inputs = (analysis.upstreamCells.get(cellKey(position)) ?? [])
    .map((input) => ({ input, placed: board[input.row][input.column] }))
    .flatMap(({ input, placed }) => {
      const block = placed ? definitions.get(placed.blockId) : undefined;
      if (!block || !placed) return [];
      return [
        {
          input,
          block: fusionRules ? upgradeBlockDefinition(block, placed.stars ?? 0, fusionRules) : block,
        },
      ];
    });

  return inputs.reduce<SkillModifiers>(
    (modifiers, { block, input }) => {
      block.effects.forEach((effect) => {
        if (effect.kind === 'amplify' && modifierTriggerMatches(effect, board, blocks, analysis, input)) {
          modifiers.effectPower += effect.amount;
        }
        if (effect.kind === 'haste' && modifierTriggerMatches(effect, board, blocks, analysis, input)) {
          modifiers.cooldownReduction += effect.amount;
        }
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
  scalingContext: EffectScalingContext = {
    enemyPoison: 0,
    pathLength: 0,
    straightLineLength: 0,
    magicSigilLevel: 0,
    magicSigilCount: 0,
    adjacentPoweredCount: 0,
    downstreamCount: 0,
    upstreamCount: 0,
    poweredAxisCounts: {},
  },
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
