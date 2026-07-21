export type Team = 'player' | 'enemy';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type RarityWeights = Record<Rarity, number>;
export type Winner = Team | 'draw' | null;
export type Direction = 'north' | 'east' | 'south' | 'west';
export type Rotation = 0 | 1 | 2 | 3;
export type BuildRole = 'starter' | 'grower' | 'cycler' | 'sustain' | 'payoff';
export type SkillDesignStatus = 'planned' | 'playable';
export type SkillDesignScope = 'exclusive' | 'shared';
export type BuffStat = 'damage' | 'poison' | 'shield' | 'repair' | 'rupture';
export type BuffTarget = BuffStat | 'all';
export type SkillBuffState = Partial<Record<BuffStat, number>>;

export type EffectTrigger =
  | { kind: 'enemy-poisoned' }
  | { kind: 'path-length-at-least'; amount: number }
  | { kind: 'in-cycle' };

export type EffectScaling =
  | { kind: 'enemy-poison'; every: number; amount: number }
  | { kind: 'path-length'; every: number; amount: number };

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
  | { kind: 'amplify'; amount: number }
  | { kind: 'haste'; amount: number }
  | { kind: 'charge'; amount: number };

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
};

export type CircuitBoard = Array<Array<PlacedBlock | null>>;

export type GameData = {
  schemaVersion: number;
  rules: {
    boardSize: number;
    sourceRow: number;
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
    enemyGeneration: {
      startingNodes: number;
      nodesPerRun: number;
      maxNodes: number;
      epicUnlockRun: number;
      legendaryUnlockRun: number;
      hpGrowthPerRun: number;
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
      kind: 'damage' | 'shield' | 'repair' | 'poison' | 'growth' | 'rupture';
      blockId: string;
      row: number;
      column: number;
      value: number;
      targetId: string;
      buffStat?: BuffStat;
      mergeMultiplier?: number;
      charge?: number;
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
