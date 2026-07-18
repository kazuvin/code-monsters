import rawGameData from '../game-data/game-balance.json' with { type: 'json' };
import type {
  ConditionId,
  ConditionKind,
  BattleZoneDefinition,
  Instruction,
  Rarity,
  ReactionBlock,
  ReactionTrigger,
  StatusDefinition,
  TargetCardinality,
  TargetDomain,
  TargetSelectorId,
  UnitDefinition,
} from './types.ts';

export type BattleConfig = {
  teamSize: number;
  tickSeconds: number;
  abilityGaugeMax: number;
  abilityGaugeInitial: number;
  abilityGaugeRegenPerSecond: number;
  actionStepMs: number;
  reactionCooldownSeconds: number;
  baseActionCooldownSeconds: number;
  minimumActionCooldownSeconds: number;
  rangeStopRatio: number;
  initialPositionInset: number;
  teamPositionSpacing: number;
  initialCooldownStaggerSeconds: number;
  enemyCooldownOffsetSeconds: number;
  wallLeft: number;
  wallRight: number;
  lowHpThreshold: number;
  enemyLowHpThreshold: number;
  defenseDamageFactor: number;
  minimumKnockbackDistance: number;
  weightKnockbackFactor: number;
  tankKnockbackScale: number;
  overheatStartSeconds: number;
  overheatWarningSeconds: number;
  overheatStepSeconds: number;
  overheatBaseDamageRate: number;
  resultDelayMs: number;
  maxLogEntries: number;
};

export type EconomyConfig = {
  startingCoins: number;
  refreshCost: number;
  roundReward: number;
  minimumSellPrice: number;
  sellPricePenalty: number;
};

export type DebugTrainingConfig = {
  minimumDummyHp: number;
  recoveryDelaySeconds: number;
  outsideRangeGap: number;
  defaultPositionPresetId: string;
  positionPresets: DebugPositionPresetDefinition[];
};

export type DebugPositionPresetDefinition = {
  id: string;
  label: string;
  description: string;
  rangeReference: 'mutual' | 'actor' | 'target';
  relation: 'inside' | 'outside';
};

export type ShopConfig = {
  size: number;
  unitSlots: number[];
  rarityWeights: Record<Rarity, number>;
  initialPicks: { slot: number; kind: 'unit' | 'instruction'; id: string }[];
};

export type EncounterDefinition = {
  id: string;
  name: string;
  briefing: string;
  enemyUnitIds: string[];
  enemyStatScale: number;
  reward: number;
};

export type BalanceAnalysisConfig = {
  baselineActionId: string;
  abilityReferenceSpeed: number;
  referenceDefense: number;
  effectiveHpDefenseWeight: number;
  powerWeights: { dps: number; effectiveHp: number; range: number; knockbackPerSecond: number; programLimit: number };
  reactionUptime: Record<ReactionTrigger, number>;
  warningThresholdRatio: number;
  maxCostEfficiencySpread: number;
  maxSameRarityPowerSpread: number;
};

export type TargetSelectorDefinition = {
  id: TargetSelectorId;
  label: string;
  flavor: string;
  domain: TargetDomain;
  cardinality: TargetCardinality;
};
export type ConditionDefinition = {
  id: ConditionId;
  kind: ConditionKind;
  params: {
    threshold?: number;
    statusId?: string;
    minimumStacks?: number;
  };
  label: string;
  flavor: string;
  effect: string;
  compatibleTargets: TargetSelectorId[];
};
export type ReactionTriggerDefinition = {
  id: ReactionTrigger;
  label: string;
  title: string;
  flavor: string;
  effect: string;
};

export type GameBalanceData = {
  schemaVersion: number;
  battle: BattleConfig;
  debugTraining: DebugTrainingConfig;
  battleZones: BattleZoneDefinition[];
  statuses: StatusDefinition[];
  economy: EconomyConfig;
  shop: ShopConfig;
  roster: {
    startingUnitIds: string[];
    enemyUnitIds: string[];
    startingActionIds: string[];
    startingConditionIds: ConditionId[];
  };
  encounters: EncounterDefinition[];
  balanceAnalysis: BalanceAnalysisConfig;
  targetSelectors: TargetSelectorDefinition[];
  conditions: ConditionDefinition[];
  reactionTriggers: ReactionTriggerDefinition[];
  units: UnitDefinition[];
  instructions: Instruction[];
  defaultPrograms: { unitId: string; actionIds: string[] }[];
  defaultReactions: {
    unitId: string;
    trigger: ReactionTrigger | null;
    actionId: string | null;
    fixedReaction: boolean;
  }[];
};

export const GAME_DATA = rawGameData as unknown as GameBalanceData;
export const GAME_SCHEMA_VERSION = GAME_DATA.schemaVersion;
export const BATTLE_CONFIG = GAME_DATA.battle;
export const DEBUG_TRAINING_CONFIG = GAME_DATA.debugTraining;
export const BATTLE_ZONES = GAME_DATA.battleZones;
export const STATUSES = GAME_DATA.statuses;
export const ECONOMY_CONFIG = GAME_DATA.economy;
export const SHOP_CONFIG = GAME_DATA.shop;
export const ROSTER_CONFIG = GAME_DATA.roster;
export const ENCOUNTERS = GAME_DATA.encounters;
export const BALANCE_ANALYSIS_CONFIG = GAME_DATA.balanceAnalysis;
export const TARGET_SELECTORS = GAME_DATA.targetSelectors;
export const CONDITIONS = GAME_DATA.conditions;
export const REACTION_TRIGGERS = GAME_DATA.reactionTriggers;
export const UNITS = GAME_DATA.units;
export const INSTRUCTIONS = GAME_DATA.instructions;

export const DEFAULT_PROGRAMS: Record<string, string[]> = Object.fromEntries(
  GAME_DATA.defaultPrograms.map((entry) => [entry.unitId, entry.actionIds]),
);

export const DEFAULT_REACTIONS: Record<string, ReactionBlock | null> = Object.fromEntries(
  GAME_DATA.defaultReactions.map((entry) => [
    entry.unitId,
    entry.trigger && entry.actionId
      ? { trigger: entry.trigger, actionId: entry.actionId, fixedReaction: entry.fixedReaction }
      : null,
  ]),
);
