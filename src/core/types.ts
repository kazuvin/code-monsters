export type Team = 'player' | 'enemy';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type RarityWeights = Record<Rarity, number>;
export type Winner = Team | 'draw' | null;
export type Direction = 'north' | 'east' | 'south' | 'west';
export type Rotation = 0 | 1 | 2 | 3;
export type BuildRole = 'starter' | 'grower' | 'cycler' | 'sustain' | 'payoff';
export type SkillDesignStatus = 'planned' | 'playable';
export type SkillDesignScope = 'exclusive' | 'shared';
export type PlacementPatternId =
  | 'free'
  | 'loop'
  | 'fully-connected'
  | 'straight-line'
  | 'magic-sigil'
  | 'resonance'
  | 'light-vein';
export type SkillStars = 0 | 1;
export type BuffStat = 'damage' | 'poison' | 'shield' | 'repair' | 'rupture';
export type BuffTarget = BuffStat | 'all';
export type SkillBuffState = Partial<Record<BuffStat, number>>;

export type EffectTrigger =
  | { kind: 'enemy-poisoned' }
  | { kind: 'path-length-at-least'; amount: number }
  | { kind: 'in-cycle' }
  | { kind: 'all-ports-connected' }
  | { kind: 'straight-line-at-least'; amount: number }
  | { kind: 'magic-sigil-level-at-least'; amount: number }
  | { kind: 'adjacent-build-at-least'; buildId: string; amount: number }
  | { kind: 'branch-at-least'; amount: number }
  | { kind: 'merge-at-least'; amount: number };

export type CircuitEffectTrigger = Exclude<EffectTrigger, { kind: 'enemy-poisoned' }>;

export type EffectScaling = (
  | { kind: 'enemy-poison' }
  | { kind: 'path-length' }
  | { kind: 'straight-line' }
  | { kind: 'magic-sigil-level' }
  | { kind: 'magic-sigil-count' }
  | { kind: 'powered-axis'; axisId: string; valueId: string }
  | { kind: 'adjacent-build'; buildId: string }
  | { kind: 'downstream-count' }
  | { kind: 'upstream-count' }
) & { every: number; amount: number; maxStacks?: number };

type NumericEffect = {
  amount: number;
  trigger?: EffectTrigger;
  scaling?: EffectScaling;
};

export type ActiveEffect =
  | ({ kind: 'damage' } & NumericEffect)
  | ({ kind: 'shield' } & NumericEffect)
  | ({ kind: 'repair' } & NumericEffect)
  | ({ kind: 'poison' } & NumericEffect)
  | { kind: 'coin'; amount: number; trigger?: EffectTrigger }
  | {
      kind: 'release-charge';
      output: 'damage' | 'shield';
      amount: number;
      perCharge: number;
      trigger?: EffectTrigger;
    }
  | { kind: 'rupture-poison'; fraction: number; damagePerStack: number; trigger?: EffectTrigger };

export type BlockEffect =
  | ActiveEffect
  | {
      kind: 'growth';
      amount: number;
      target: 'self' | 'upstream' | 'downstream';
      stat: BuffTarget;
      trigger?: EffectTrigger;
    }
  | { kind: 'amplify'; amount: number; trigger?: EffectTrigger }
  | { kind: 'haste'; amount: number; trigger?: EffectTrigger }
  | { kind: 'charge'; amount: number; trigger?: CircuitEffectTrigger }
  | {
      kind: 'inscribe-magic-sigil';
      amount: number;
      offsets: Array<{ row: number; column: number }>;
    };

export type BlockDefinition = {
  id: string;
  code: string;
  title: string;
  description: string;
  glyph: string;
  price: number;
  rarity: Rarity;
  shopWeight?: number;
  ports: Direction[];
  rotatable?: boolean;
  buildIds?: string[];
  effects: BlockEffect[];
  cooldown?: number;
  fusion?: {
    title: string;
    description: string;
    glyph?: string;
    cooldown?: number | null;
    effects: BlockEffect[];
  };
};

export type BuildPayoffDefinition = {
  id: string;
  title: string;
  strategy: string;
};

export type BuildDefinition = {
  id: string;
  axisId: string;
  title: string;
  placementIdentity: string;
  strength: string;
  risk: string;
  gamePlan: string;
  payoffs: BuildPayoffDefinition[];
};

export type BuildAxisDefinition = {
  id: string;
  title: string;
  description: string;
  values: Array<{ id: string; title: string; description: string; color?: string }>;
};

export type SkillAxisLink = {
  axisId: string;
  valueIds: string[];
};

export type SkillBuildLink = {
  buildId: string;
  roles: BuildRole[];
  payoffIds: string[];
};

export type SkillDesignDefinition = {
  id: string;
  title: string;
  summary: string;
  status: SkillDesignStatus;
  blockId?: string;
  scope: SkillDesignScope;
  sharedSynergies: string[];
  placementPatternId: PlacementPatternId;
  axisLinks: SkillAxisLink[];
  buildLinks: SkillBuildLink[];
};

export type BuildDesign = {
  rules: {
    requiredRoles: BuildRole[];
    requiredPayoffRoles: BuildRole[];
    minimumPayoffsPerBuild: number;
    minimumOpenSkillsPerBuild: number;
    maximumExclusiveSkillRatio: number;
    minimumPlayableSkillsPerBuild: number;
    requiredAxisIds: string[];
    minimumHybridSkillsPerBuild: number;
    minimumWeaponTypesPerBuild: number;
    requireSkillDesignForEveryBlock: boolean;
  };
  placementPatterns: Array<{
    id: PlacementPatternId;
    title: string;
    description: string;
  }>;
  axes: BuildAxisDefinition[];
  builds: BuildDefinition[];
  skills: SkillDesignDefinition[];
};

export type UnitDefinition = {
  id: string;
  name: string;
  code: string;
  maxHp: number;
  color: string;
};

export type PlacedBlock = {
  blockId: string;
  rotation: Rotation;
  stars?: SkillStars;
};

export type SkillFusionRules = {
  copiesRequired: number;
  rewardChoices: number;
  effectMultiplier: number;
  cooldownReduction: number;
};

export type MagicSigilRules = {
  maxLevel: number;
  effectPowerPerLevel: number;
  hasteLevel: number;
  cooldownReduction: number;
};

export type BalanceFormulaRules = {
  version: number;
  reference: {
    windowSeconds: number;
    enemyPoison: number;
    charge: number;
    pathLength: number;
    straightLineLength: number;
    magicSigilLevel: number;
    magicSigilCount: number;
    adjacentBuildCount: number;
    downstreamCount: number;
    upstreamCount: number;
    poweredAxisCount: number;
    targetCooldownBeats: number;
    targetEffectAmount: number;
  };
  effectValue: {
    shield: number;
    repair: number;
    poisonTicks: number;
    supportPoint: number;
    coin: number;
  };
  conditionAvailability: {
    minimum: number;
    enemyPoisoned: number;
    inCycle: number;
    pathLengthBase: number;
    pathLengthPenaltyPerRequiredNode: number;
    straightLineBase: number;
    straightLinePenaltyPerRequiredNode: number;
    allPortsConnectedBase: number;
    allPortsConnectedPenaltyPerPort: number;
    magicSigilBase: number;
    magicSigilPenaltyPerRequiredLevel: number;
    adjacentBuildBase: number;
    adjacentBuildPenaltyPerRequiredNode: number;
    branchBase: number;
    branchPenaltyPerRequiredRoute: number;
    mergeBase: number;
    mergePenaltyPerRequiredRoute: number;
  };
  resourceAvailability: {
    charge: number;
    rupturePoison: number;
    magicSigil: number;
    poweredAxis: number;
  };
  chargeAttribution: {
    producer: number;
    consumer: number;
  };
  topologyUtility: {
    perAdditionalPort: number;
    rotatable: number;
  };
  targetCvpsByRarity: Record<Rarity, number>;
  referencePriceByRarity: Record<Rarity, number>;
  acceptableBudgetRatio: {
    minimum: number;
    maximum: number;
  };
};

export type LevelProgressionRules = {
  runsPerLevel: number;
  maxLevel: number;
  rarityWeightMultiplierPerLevel: RarityWeights;
};

export type HeartRules = {
  initialPosition: CellPosition;
  ports: Direction[];
};

export type BodyUpgradeRules = {
  maxLevel: number;
  hpPerLevel: number;
  upgradeCosts: number[];
  rivalRunsPerLevel: number;
};

export type CircuitBoard = Array<Array<PlacedBlock | null>>;

export type GameData = {
  schemaVersion: number;
  rules: {
    boardSize: number;
    heart: HeartRules;
    bodyUpgrades: BodyUpgradeRules;
    battleStepMs: number;
    pulseAnimationMs: number;
    suddenDeathSeconds: number;
    suddenDeathBaseDamage: number;
    suddenDeathGrowth: number;
    poisonTickSeconds: number;
    poisonDecay: number;
    mergeEffectMultiplier: number;
    startingCoins: number;
    winReward: number;
    retryReward: number;
    rerollCost: number;
    shopSize: number;
    rarityWeights: RarityWeights;
    levelProgression: LevelProgressionRules;
    skillFusion: SkillFusionRules;
    magicSigils: MagicSigilRules;
    balanceFormula: BalanceFormulaRules;
    enemyGeneration: {
      startingNodes: number;
      nodesPerRun: number;
      maxNodes: number;
    };
  };
  units: UnitDefinition[];
  playerUnitId: string;
  enemyUnitId: string;
  buildDesign: BuildDesign;
  blocks: BlockDefinition[];
  startingRack: string[];
  playerBoard: CircuitBoard;
};

export type CellPosition = { row: number; column: number };

export type FighterState = {
  instanceId: string;
  unitId: string;
  name: string;
  code: string;
  color: string;
  team: Team;
  hp: number;
  maxHp: number;
  shield: number;
  poison: number;
};

export type BattleTraceEvent =
  | {
      id: string;
      tick: number;
      team: Team;
      kind: 'damage' | 'shield' | 'repair' | 'poison' | 'growth' | 'rupture' | 'coin';
      blockId: string;
      row: number;
      column: number;
      value: number;
      targetId: string;
      buffStat?: BuffStat;
      mergeMultiplier?: number;
      charge?: number;
      stars?: SkillStars;
    }
  | {
      id: string;
      tick: number;
      team: Team;
      kind: 'overload' | 'poison-tick';
      value: number;
      targetId: string;
    };

export type BattleState = {
  tick: number;
  fighters: FighterState[];
  playerBoard: CircuitBoard;
  enemyBoard: CircuitBoard;
  playerHeartPosition: CellPosition;
  enemyHeartPosition: CellPosition;
  playerPowered: string[];
  enemyPowered: string[];
  skillBuffs: Record<Team, Record<string, SkillBuffState>>;
  activePulse: Record<Team, string[]>;
  pulseStep: number;
  pulseStepCount: number;
  trace: BattleTraceEvent[];
  overloadLevel: number;
  overloadDamage: number;
  winner: Winner;
};

export type ShopOffer = {
  id: string;
  slot: number;
  blockId: string;
  rotation: Rotation;
  locked: boolean;
};
