import { upgradeBlockDefinition } from './fusion';
import type {
  BalanceFormulaRules,
  BlockDefinition,
  BlockEffect,
  EffectScaling,
  EffectTrigger,
  GameData,
  Rarity,
} from './types';

export type PowerBudgetStatus = 'low' | 'in-range' | 'high';

export type SkillEffectPower = {
  effectIndex: number;
  kind: BlockEffect['kind'];
  formula: string;
  condition: string;
  conditionAvailability: number;
  rewardMultiplier: number;
  rawCvps: number;
  weightedCvps: number;
  referenceOffensePerSecond: number;
  referenceDefensePerSecond: number;
};

export type FusedSkillPower = {
  referenceOffensePerSecond: number;
  referenceDefensePerSecond: number;
  weightedCombatValuePerSecond: number;
  gainOverNormal: number;
};

export type SkillPowerAssessment = {
  blockId: string;
  title: string;
  rarity: Rarity;
  price: number;
  placementPatternId: string;
  cooldownBeats: number | null;
  cooldownSeconds: number | null;
  referenceOffensePerSecond: number;
  referenceDefensePerSecond: number;
  rawCombatValuePerSecond: number;
  weightedCombatValuePerSecond: number;
  topologyUtilityCvps: number;
  targetCombatValuePerSecond: number;
  budgetRatio: number;
  budgetStatus: PowerBudgetStatus;
  conditions: string[];
  effects: SkillEffectPower[];
  fused: FusedSkillPower;
};

export type PowerFormulaReport = {
  gameSchemaVersion: number;
  formulaVersion: number;
  formula: BalanceFormulaRules;
  battleStepSeconds: number;
  referenceCharge: number;
  referenceEnemyPoison: number;
  referenceWindowSeconds: number;
  chargeMarginalCvps: number;
  summary: Record<PowerBudgetStatus, number> & { skillCount: number };
  skills: SkillPowerAssessment[];
};

type EffectPowerContext = {
  data: GameData;
  block: BlockDefinition;
  rules: BalanceFormulaRules;
  cooldownSeconds: number;
  chargeMarginalCvps: number;
};

type EffectPowerValue = Omit<SkillEffectPower, 'effectIndex' | 'kind' | 'condition'>;

const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
const clamp = (value: number, minimum: number, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const secondsPerBeat = (data: GameData) => data.rules.battleStepMs / 1000;

const assertNever = (value: never): never => {
  throw new Error(`Unsupported balance-formula value: ${JSON.stringify(value)}`);
};

export function conditionAvailability(
  trigger: EffectTrigger | undefined,
  portCount: number,
  rules: BalanceFormulaRules,
): number {
  if (!trigger) return 1;
  const weights = rules.conditionAvailability;
  if (trigger.kind === 'enemy-poisoned') return weights.enemyPoisoned;
  if (trigger.kind === 'in-cycle') return weights.inCycle;
  if (trigger.kind === 'path-length-at-least') {
    return clamp(
      weights.pathLengthBase - weights.pathLengthPenaltyPerRequiredNode * Math.max(0, trigger.amount - 1),
      weights.minimum,
    );
  }
  if (trigger.kind === 'straight-line-at-least') {
    return clamp(
      weights.straightLineBase - weights.straightLinePenaltyPerRequiredNode * Math.max(0, trigger.amount - 2),
      weights.minimum,
    );
  }
  if (trigger.kind === 'all-ports-connected') {
    return clamp(
      weights.allPortsConnectedBase - weights.allPortsConnectedPenaltyPerPort * Math.max(0, portCount - 1),
      weights.minimum,
    );
  }
  if (trigger.kind === 'magic-sigil-level-at-least') {
    return clamp(
      weights.magicSigilBase - weights.magicSigilPenaltyPerRequiredLevel * Math.max(0, trigger.amount - 1),
      weights.minimum,
    );
  }
  if (trigger.kind === 'adjacent-build-at-least') {
    return clamp(
      weights.adjacentBuildBase - weights.adjacentBuildPenaltyPerRequiredNode * Math.max(0, trigger.amount - 1),
      weights.minimum,
    );
  }
  return assertNever(trigger);
}

const triggerLabel = (trigger: EffectTrigger | undefined, portCount: number) => {
  if (!trigger) return 'always';
  if (trigger.kind === 'enemy-poisoned') return 'enemy-poisoned';
  if (trigger.kind === 'in-cycle') return 'in-cycle';
  if (trigger.kind === 'path-length-at-least') return `path>=${trigger.amount}`;
  if (trigger.kind === 'straight-line-at-least') return `straight>=${trigger.amount}`;
  if (trigger.kind === 'all-ports-connected') return `all-${portCount}-ports`;
  if (trigger.kind === 'magic-sigil-level-at-least') return `magic-sigil>=${trigger.amount}`;
  if (trigger.kind === 'adjacent-build-at-least') return `adjacent-${trigger.buildId}>=${trigger.amount}`;
  return assertNever(trigger);
};

const effectUnitValue = (kind: 'damage' | 'shield' | 'repair' | 'poison', rules: BalanceFormulaRules) => {
  if (kind === 'damage') return 1;
  if (kind === 'shield') return rules.effectValue.shield;
  if (kind === 'repair') return rules.effectValue.repair;
  return rules.effectValue.poisonTicks;
};

const statUnitValue = (stat: Extract<BlockEffect, { kind: 'growth' }>['stat'], rules: BalanceFormulaRules) => {
  if (stat === 'poison') return rules.effectValue.poisonTicks;
  if (stat === 'shield') return rules.effectValue.shield;
  if (stat === 'repair') return rules.effectValue.repair;
  if (stat === 'all') return rules.effectValue.supportPoint;
  return 1;
};

const scalingReference = (scaling: EffectScaling, rules: BalanceFormulaRules) => {
  if (scaling.kind === 'enemy-poison') return rules.reference.enemyPoison;
  if (scaling.kind === 'path-length') return rules.reference.pathLength;
  if (scaling.kind === 'straight-line') return rules.reference.straightLineLength;
  if (scaling.kind === 'magic-sigil-level') return rules.reference.magicSigilLevel;
  if (scaling.kind === 'magic-sigil-count') return rules.reference.magicSigilCount;
  return rules.reference.adjacentBuildCount;
};

const scalingAvailability = (scaling: EffectScaling, portCount: number, rules: BalanceFormulaRules) => {
  if (scaling.kind === 'enemy-poison') {
    return conditionAvailability({ kind: 'enemy-poisoned' }, portCount, rules);
  }
  if (scaling.kind === 'path-length') {
    return conditionAvailability(
      { kind: 'path-length-at-least', amount: rules.reference.pathLength },
      portCount,
      rules,
    );
  }
  if (scaling.kind === 'magic-sigil-level' || scaling.kind === 'magic-sigil-count') {
    return rules.resourceAvailability.magicSigil;
  }
  if (scaling.kind === 'adjacent-build') {
    return conditionAvailability(
      {
        kind: 'adjacent-build-at-least',
        buildId: scaling.buildId,
        amount: rules.reference.adjacentBuildCount,
      },
      portCount,
      rules,
    );
  }
  return conditionAvailability(
    { kind: 'straight-line-at-least', amount: rules.reference.straightLineLength },
    portCount,
    rules,
  );
};

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) throw new Error('Balance formula needs at least one charge-release skill');
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const chargeMarginalCvps = (data: GameData) =>
  median(
    data.blocks.flatMap((block) => {
      const cooldown = block.cooldown ? block.cooldown * secondsPerBeat(data) : 0;
      if (cooldown <= 0) return [];
      return block.effects.flatMap((effect) =>
        effect.kind === 'release-charge'
          ? [
              (effect.perCharge * (effect.output === 'damage' ? 1 : data.rules.balanceFormula.effectValue.shield)) /
                cooldown,
            ]
          : [],
      );
    }),
  );

const numericEffectPower = (
  effect: Extract<BlockEffect, { kind: 'damage' | 'shield' | 'repair' | 'poison' }>,
  triggerWeight: number,
  context: EffectPowerContext,
): EffectPowerValue => {
  const unit = effectUnitValue(effect.kind, context.rules);
  const baseValue = effect.amount * unit;
  const scaling = effect.scaling;
  const scalingSource = scaling ? scalingReference(scaling, context.rules) : 0;
  const scalingBonus = scaling ? Math.floor(scalingSource / scaling.every) * scaling.amount * unit : 0;
  const scaleWeight = scaling ? scalingAvailability(scaling, context.block.ports.length, context.rules) : 1;
  const rawCvps = (baseValue + scalingBonus) / context.cooldownSeconds;
  const weightedCvps =
    (baseValue * triggerWeight + scalingBonus * triggerWeight * scaleWeight) / context.cooldownSeconds;
  const offense = effect.kind === 'damage' || effect.kind === 'poison' ? rawCvps : 0;
  const defense = effect.kind === 'shield' || effect.kind === 'repair' ? rawCvps : 0;
  const scaleText = scaling ? ` + floor(${scalingSource}/${scaling.every})*${scaling.amount}` : '';
  return {
    formula: `(amount ${effect.amount}${scaleText})*unit ${unit}/seconds ${context.cooldownSeconds}`,
    conditionAvailability: triggerWeight,
    rewardMultiplier: 1 / triggerWeight,
    rawCvps,
    weightedCvps,
    referenceOffensePerSecond: offense,
    referenceDefensePerSecond: defense,
  };
};

const releaseChargePower = (
  effect: Extract<BlockEffect, { kind: 'release-charge' }>,
  triggerWeight: number,
  context: EffectPowerContext,
): EffectPowerValue => {
  const unit = effect.output === 'damage' ? 1 : context.rules.effectValue.shield;
  const baseValue = effect.amount * unit;
  const variableValue = context.rules.reference.charge * effect.perCharge * unit;
  const rawCvps = (baseValue + variableValue) / context.cooldownSeconds;
  const weightedCvps =
    ((baseValue +
      variableValue * context.rules.resourceAvailability.charge * context.rules.chargeAttribution.consumer) *
      triggerWeight) /
    context.cooldownSeconds;
  return {
    formula: `(base ${effect.amount} + charge=${context.rules.reference.charge}*${effect.perCharge})*unit ${unit}/seconds ${context.cooldownSeconds}`,
    conditionAvailability: triggerWeight,
    rewardMultiplier: 1 / triggerWeight,
    rawCvps,
    weightedCvps,
    referenceOffensePerSecond: effect.output === 'damage' ? rawCvps : 0,
    referenceDefensePerSecond: effect.output === 'shield' ? rawCvps : 0,
  };
};

const rupturePower = (
  effect: Extract<BlockEffect, { kind: 'rupture-poison' }>,
  triggerWeight: number,
  context: EffectPowerContext,
): EffectPowerValue => {
  const consumed = Math.floor(context.rules.reference.enemyPoison * effect.fraction);
  const gross = consumed * effect.damagePerStack;
  const poisonOpportunityCost = consumed * context.rules.effectValue.poisonTicks;
  const rawCvps = gross / context.cooldownSeconds;
  const weightedCvps =
    ((gross - poisonOpportunityCost) * context.rules.resourceAvailability.rupturePoison * triggerWeight) /
    context.cooldownSeconds;
  return {
    formula: `(floor(poison ${context.rules.reference.enemyPoison}*${effect.fraction})*${effect.damagePerStack} - consumed*poisonTicks ${context.rules.effectValue.poisonTicks})/seconds ${context.cooldownSeconds}`,
    conditionAvailability: triggerWeight,
    rewardMultiplier: 1 / triggerWeight,
    rawCvps,
    weightedCvps,
    referenceOffensePerSecond: rawCvps,
    referenceDefensePerSecond: 0,
  };
};

const growthPower = (
  effect: Extract<BlockEffect, { kind: 'growth' }>,
  triggerWeight: number,
  context: EffectPowerContext,
): EffectPowerValue => {
  const sourceActivations = context.rules.reference.windowSeconds / context.cooldownSeconds;
  const averagePriorStacks = Math.max(0, (sourceActivations - 1) / 2);
  const targetCooldownSeconds =
    (effect.target === 'self'
      ? (context.block.cooldown ?? context.rules.reference.targetCooldownBeats)
      : context.rules.reference.targetCooldownBeats) * secondsPerBeat(context.data);
  const rawCvps =
    (effect.amount * averagePriorStacks * statUnitValue(effect.stat, context.rules)) / targetCooldownSeconds;
  return {
    formula: `amount ${effect.amount}*avgPriorStacks ${round(averagePriorStacks)}*unit ${statUnitValue(effect.stat, context.rules)}/targetSeconds ${targetCooldownSeconds}`,
    conditionAvailability: triggerWeight,
    rewardMultiplier: 1 / triggerWeight,
    rawCvps,
    weightedCvps: rawCvps * triggerWeight,
    referenceOffensePerSecond: 0,
    referenceDefensePerSecond: 0,
  };
};

const amplifyPower = (
  effect: Extract<BlockEffect, { kind: 'amplify' }>,
  triggerWeight: number,
  context: EffectPowerContext,
): EffectPowerValue => {
  const targetSeconds = context.rules.reference.targetCooldownBeats * secondsPerBeat(context.data);
  const rawCvps = (effect.amount * context.rules.effectValue.supportPoint) / targetSeconds;
  return {
    formula: `amount ${effect.amount}*supportUnit ${context.rules.effectValue.supportPoint}/targetSeconds ${targetSeconds}`,
    conditionAvailability: triggerWeight,
    rewardMultiplier: 1 / triggerWeight,
    rawCvps,
    weightedCvps: rawCvps * triggerWeight,
    referenceOffensePerSecond: 0,
    referenceDefensePerSecond: 0,
  };
};

const hastePower = (
  effect: Extract<BlockEffect, { kind: 'haste' }>,
  triggerWeight: number,
  context: EffectPowerContext,
): EffectPowerValue => {
  const beatSeconds = secondsPerBeat(context.data);
  const baseBeats = context.rules.reference.targetCooldownBeats;
  const reducedBeats = Math.max(1, baseBeats - effect.amount);
  const rawCvps =
    context.rules.reference.targetEffectAmount *
    context.rules.effectValue.supportPoint *
    (1 / (reducedBeats * beatSeconds) - 1 / (baseBeats * beatSeconds));
  return {
    formula: `target ${context.rules.reference.targetEffectAmount}*(1/${reducedBeats * beatSeconds} - 1/${baseBeats * beatSeconds})`,
    conditionAvailability: triggerWeight,
    rewardMultiplier: 1 / triggerWeight,
    rawCvps,
    weightedCvps: rawCvps * triggerWeight,
    referenceOffensePerSecond: 0,
    referenceDefensePerSecond: 0,
  };
};

const chargePower = (
  effect: Extract<BlockEffect, { kind: 'charge' }>,
  triggerWeight: number,
  context: EffectPowerContext,
): EffectPowerValue => {
  const rawCvps = effect.amount * context.chargeMarginalCvps;
  const weightedCvps =
    rawCvps * context.rules.resourceAvailability.charge * context.rules.chargeAttribution.producer * triggerWeight;
  return {
    formula: `charge ${effect.amount}*marginalCVPS ${round(context.chargeMarginalCvps)}*producerShare ${context.rules.chargeAttribution.producer}`,
    conditionAvailability: triggerWeight,
    rewardMultiplier: 1 / triggerWeight,
    rawCvps,
    weightedCvps,
    referenceOffensePerSecond: 0,
    referenceDefensePerSecond: 0,
  };
};

const magicSigilPower = (
  effect: Extract<BlockEffect, { kind: 'inscribe-magic-sigil' }>,
  context: EffectPowerContext,
): EffectPowerValue => {
  const targetSeconds = context.rules.reference.targetCooldownBeats * secondsPerBeat(context.data);
  const rawCvps =
    (effect.amount * effect.offsets.length * context.data.rules.magicSigils.effectPowerPerLevel) / targetSeconds;
  return {
    formula: `level ${effect.amount}*targets ${effect.offsets.length}*effectPower ${context.data.rules.magicSigils.effectPowerPerLevel}/targetSeconds ${targetSeconds}`,
    conditionAvailability: 1,
    rewardMultiplier: 1,
    rawCvps,
    weightedCvps: rawCvps * context.rules.resourceAvailability.magicSigil,
    referenceOffensePerSecond: 0,
    referenceDefensePerSecond: 0,
  };
};

const effectPower = (effect: BlockEffect, context: EffectPowerContext): EffectPowerValue => {
  const trigger = effect.kind === 'inscribe-magic-sigil' ? undefined : effect.trigger;
  const triggerWeight = conditionAvailability(trigger, context.block.ports.length, context.rules);
  if (effect.kind === 'damage' || effect.kind === 'shield' || effect.kind === 'repair' || effect.kind === 'poison') {
    return numericEffectPower(effect, triggerWeight, context);
  }
  if (effect.kind === 'release-charge') return releaseChargePower(effect, triggerWeight, context);
  if (effect.kind === 'rupture-poison') return rupturePower(effect, triggerWeight, context);
  if (effect.kind === 'growth') return growthPower(effect, triggerWeight, context);
  if (effect.kind === 'amplify') return amplifyPower(effect, triggerWeight, context);
  if (effect.kind === 'haste') return hastePower(effect, triggerWeight, context);
  if (effect.kind === 'charge') return chargePower(effect, triggerWeight, context);
  if (effect.kind === 'inscribe-magic-sigil') return magicSigilPower(effect, context);
  return assertNever(effect);
};

const assessBlock = (data: GameData, block: BlockDefinition, marginalChargeCvps: number) => {
  const rules = data.rules.balanceFormula;
  const cooldownSeconds = (block.cooldown ?? rules.reference.targetCooldownBeats) * secondsPerBeat(data);
  const effects = block.effects.map((effect, effectIndex): SkillEffectPower => {
    const power = effectPower(effect, { data, block, rules, cooldownSeconds, chargeMarginalCvps: marginalChargeCvps });
    return {
      effectIndex,
      kind: effect.kind,
      condition: triggerLabel(effect.kind === 'inscribe-magic-sigil' ? undefined : effect.trigger, block.ports.length),
      formula: power.formula,
      conditionAvailability: round(power.conditionAvailability),
      rewardMultiplier: round(power.rewardMultiplier),
      rawCvps: round(power.rawCvps),
      weightedCvps: round(power.weightedCvps),
      referenceOffensePerSecond: round(power.referenceOffensePerSecond),
      referenceDefensePerSecond: round(power.referenceDefensePerSecond),
    };
  });
  const topologyUtilityCvps =
    Math.max(0, block.ports.length - 1) * rules.topologyUtility.perAdditionalPort +
    (block.rotatable === false ? 0 : rules.topologyUtility.rotatable);
  return {
    effects,
    cooldownSeconds: block.cooldown ? round(block.cooldown * secondsPerBeat(data)) : null,
    referenceOffensePerSecond: round(effects.reduce((total, effect) => total + effect.referenceOffensePerSecond, 0)),
    referenceDefensePerSecond: round(effects.reduce((total, effect) => total + effect.referenceDefensePerSecond, 0)),
    rawCombatValuePerSecond: round(effects.reduce((total, effect) => total + effect.rawCvps, topologyUtilityCvps)),
    weightedCombatValuePerSecond: round(
      effects.reduce((total, effect) => total + effect.weightedCvps, topologyUtilityCvps),
    ),
    topologyUtilityCvps: round(topologyUtilityCvps),
  };
};

export function assessSkillPower(data: GameData, block: BlockDefinition): SkillPowerAssessment {
  const rules = data.rules.balanceFormula;
  const marginalChargeCvps = chargeMarginalCvps(data);
  const normal = assessBlock(data, block, marginalChargeCvps);
  const fusedBlock = upgradeBlockDefinition(block, 1, data.rules.skillFusion);
  const fused = assessBlock(data, fusedBlock, marginalChargeCvps);
  const target = rules.targetCvpsByRarity[block.rarity] * (block.price / rules.referencePriceByRarity[block.rarity]);
  const ratio = normal.weightedCombatValuePerSecond / target;
  const budgetStatus: PowerBudgetStatus =
    ratio < rules.acceptableBudgetRatio.minimum
      ? 'low'
      : ratio > rules.acceptableBudgetRatio.maximum
        ? 'high'
        : 'in-range';
  const design = data.buildDesign.skills.find((skill) => skill.blockId === block.id);
  return {
    blockId: block.id,
    title: block.title,
    rarity: block.rarity,
    price: block.price,
    placementPatternId: design?.placementPatternId ?? 'unassigned',
    cooldownBeats: block.cooldown ?? null,
    cooldownSeconds: normal.cooldownSeconds,
    referenceOffensePerSecond: normal.referenceOffensePerSecond,
    referenceDefensePerSecond: normal.referenceDefensePerSecond,
    rawCombatValuePerSecond: normal.rawCombatValuePerSecond,
    weightedCombatValuePerSecond: normal.weightedCombatValuePerSecond,
    topologyUtilityCvps: normal.topologyUtilityCvps,
    targetCombatValuePerSecond: round(target),
    budgetRatio: round(ratio),
    budgetStatus,
    conditions: [
      ...new Set(normal.effects.map((effect) => effect.condition).filter((condition) => condition !== 'always')),
    ],
    effects: normal.effects,
    fused: {
      referenceOffensePerSecond: fused.referenceOffensePerSecond,
      referenceDefensePerSecond: fused.referenceDefensePerSecond,
      weightedCombatValuePerSecond: fused.weightedCombatValuePerSecond,
      gainOverNormal: round(fused.weightedCombatValuePerSecond / normal.weightedCombatValuePerSecond),
    },
  };
}

export function createPowerFormulaReport(data: GameData): PowerFormulaReport {
  const playableIds = new Set(
    data.buildDesign.skills
      .filter((skill) => skill.status === 'playable')
      .flatMap((skill) => (skill.blockId ? [skill.blockId] : [])),
  );
  const rarityOrder: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
  const skills = data.blocks
    .filter((block) => playableIds.has(block.id))
    .map((block) => assessSkillPower(data, block))
    .sort(
      (left, right) =>
        rarityOrder.indexOf(left.rarity) - rarityOrder.indexOf(right.rarity) ||
        left.price - right.price ||
        left.blockId.localeCompare(right.blockId),
    );
  const statusCounts = (['low', 'in-range', 'high'] as const).map(
    (status) => [status, skills.filter((skill) => skill.budgetStatus === status).length] as const,
  );
  return {
    gameSchemaVersion: data.schemaVersion,
    formulaVersion: data.rules.balanceFormula.version,
    formula: data.rules.balanceFormula,
    battleStepSeconds: secondsPerBeat(data),
    referenceCharge: data.rules.balanceFormula.reference.charge,
    referenceEnemyPoison: data.rules.balanceFormula.reference.enemyPoison,
    referenceWindowSeconds: data.rules.balanceFormula.reference.windowSeconds,
    chargeMarginalCvps: round(chargeMarginalCvps(data)),
    summary: { skillCount: skills.length, ...Object.fromEntries(statusCounts) } as PowerFormulaReport['summary'],
    skills,
  };
}
