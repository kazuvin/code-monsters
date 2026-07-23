export type Team = 'player' | 'enemy';
export type BattleWinner = Team | 'draw';
export type LineageId = 'dragon' | 'demon' | 'spirit';
export type AttributeId = 'light' | 'dark' | 'fire';
export type WhiteStars = 1 | 2 | 3 | 4 | 5;
export type ColorStars = 0 | 1 | 2;
export type StatId = 'maxHp' | 'maxMp' | 'attack' | 'defense' | 'speed' | 'wisdom' | 'crit';

export type StatBlock = Record<StatId, number>;

export type TargetRule =
  | 'self'
  | 'lowest-hp-ally'
  | 'highest-hp-ally'
  | 'lowest-hp-enemy'
  | 'highest-hp-enemy'
  | 'highest-attack-enemy'
  | 'random-enemy';

export type StatusId =
  | 'attack-up'
  | 'attack-down'
  | 'defense-up'
  | 'defense-down'
  | 'speed-up'
  | 'speed-down'
  | 'wisdom-up'
  | 'wisdom-down'
  | 'crit-up'
  | 'crit-down'
  | 'regeneration'
  | 'damage-over-time'
  | 'silence';

export type GambitCondition =
  | { kind: 'always' }
  | { kind: 'self-hp-below'; threshold: 25 | 50 | 75 }
  | { kind: 'self-mp-above'; threshold: 25 | 50 | 75 }
  | { kind: 'ally-hp-below'; threshold: 25 | 50 | 75 }
  | { kind: 'enemy-hp-below'; threshold: 25 | 50 | 75 }
  | { kind: 'ally-has-status'; statusId: StatusId }
  | { kind: 'enemy-has-status'; statusId: StatusId }
  | { kind: 'living-count-at-most'; team: 'ally' | 'enemy'; count: 1 | 2 };

export type GambitAction = {
  skillId: string | 'normal-attack';
  target: TargetRule;
};

export type GambitRule = {
  condition: GambitCondition;
  action: GambitAction;
};

export type EffectTarget = 'action-target' | 'self' | 'all-allies' | 'all-enemies';

export type EffectDefinition =
  | {
      kind: 'damage';
      scaling: 'physical' | 'magic';
      power: number;
      target: EffectTarget;
      canCrit?: boolean;
    }
  | { kind: 'heal'; power: number; target: EffectTarget }
  | { kind: 'shield'; maxHpPercent: number; target: EffectTarget }
  | { kind: 'status'; statusId: StatusId; amount: number; durationSeconds: number; target: EffectTarget }
  | { kind: 'atb'; amount: number; target: EffectTarget }
  | { kind: 'mp'; amount: number; target: EffectTarget };

export type SkillDefinition = {
  id: string;
  name: string;
  description: string;
  mpCost: number;
  targetScope: 'single-enemy' | 'single-ally' | 'self' | 'all-enemies' | 'all-allies';
  effects: EffectDefinition[];
};

export type TraitStageDefinition = {
  description: string;
  battleStartEffects: EffectDefinition[];
};

export type TraitDefinition = {
  id: string;
  name: string;
  stages: [TraitStageDefinition, TraitStageDefinition, TraitStageDefinition];
};

export type LineageDefinition = {
  id: LineageId;
  name: string;
  mark: string;
};

export type AttributeDefinition = {
  id: AttributeId;
  name: string;
  color: string;
  accent: string;
};

export type MonsterArchetypeDefinition = {
  id: string;
  lineageId: LineageId;
  attributeId: AttributeId;
  names: [string, string, string, string, string];
  glyph: string;
  baseStats: StatBlock;
  growthPerLevel: StatBlock;
  intrinsicSkillIds: [string, string];
  defaultSkillId: string;
  traitId: string;
};

export type MonsterDefinition = {
  id: string;
  archetypeId: string;
  lineageId: LineageId;
  attributeId: AttributeId;
  name: string;
  whiteStars: WhiteStars;
  glyph: string;
  baseStats: StatBlock;
  growthPerLevel: StatBlock;
  intrinsicSkillIds: [string, string];
  defaultSkillId: string;
  traitId: string;
  price: number;
  sellPrice: number;
};

export type EquipmentDefinition = {
  id: string;
  name: string;
  description: string;
  glyph: string;
  price: number;
  statBonus: Partial<StatBlock>;
  battleStartEffects: EffectDefinition[];
};

export type SpecialRecipeDefinition = {
  id: string;
  parentDefinitionIds: [string, string];
  resultDefinitionId: string;
};

export type EventDefinition = {
  id: string;
  name: string;
  description: string;
  glyph: string;
  effect: { kind: 'coins'; amount: number } | { kind: 'roster-xp'; amount: number };
};

export type GameRules = {
  contentVersion: string;
  maxCycles: number;
  maxLosses: number;
  rosterLimit: number;
  activeLimit: number;
  benchLimit: number;
  initialCoins: number;
  cycleIncome: number;
  breedingCoinBonus: number;
  levelThresholds: number[];
  maxLevel: number;
  activeXpByCycleBand: [number, number, number, number];
  battleWinXp: number;
  benchXpRate: number;
  shop: {
    monsterSlots: number;
    equipmentSlots: number;
    rerollCost: number;
    luckyUpgradeChance: number;
  };
  breeding: {
    minimumLevel: number;
    inheritanceRatesByTotalColorStars: [number, number, number, number, number];
    colorGrowthBonus: [number, number, number];
  };
  battle: {
    tickSeconds: number;
    gaugeMaximum: number;
    baseActionSeconds: number;
    criticalMultiplier: number;
    criticalCap: number;
    environmentStartSeconds: number;
    environmentIntervalSeconds: number;
    environmentInitialPercent: number;
    environmentGrowth: number;
    maximumSeconds: number;
    shieldCapPercent: number;
  };
  eventCycles: number[];
};

export type RawGameData = {
  schemaVersion: number;
  rules: GameRules;
  lineages: LineageDefinition[];
  attributes: AttributeDefinition[];
  rankStatMultipliers: [number, number, number, number, number];
  archetypes: MonsterArchetypeDefinition[];
  skills: SkillDefinition[];
  traits: TraitDefinition[];
  equipment: EquipmentDefinition[];
  specialRecipes: SpecialRecipeDefinition[];
  events: EventDefinition[];
};

export type GameData = RawGameData & {
  monsters: MonsterDefinition[];
};

export type MonsterInstance = {
  id: string;
  definitionId: string;
  colorStars: ColorStars;
  level: number;
  xp: number;
  inheritedStats: StatBlock;
  inheritedSkillId?: string;
  gambits: [GambitRule, GambitRule, GambitRule];
  equipmentId?: string;
};

export type BreedingCandidateKind = 'generic' | 'same-name' | 'special';

export type BreedingCandidate = {
  id: string;
  kind: BreedingCandidateKind;
  definitionId: string;
  colorStars: ColorStars;
  label: string;
};

export type ShopMonsterOffer = {
  id: string;
  definitionId: string;
  lucky: boolean;
};

export type ShopEquipmentOffer = {
  id: string;
  equipmentId: string;
};

export type ShopState = {
  seed: number;
  frozen: boolean;
  monsters: Array<ShopMonsterOffer | null>;
  equipment: Array<ShopEquipmentOffer | null>;
};

export type RunPhase = 'draft' | 'event' | 'prepare' | 'result' | 'finished';

export type CasualRunState = {
  schemaVersion: 1;
  mode: 'casual';
  seed: number;
  commandIndex: number;
  phase: RunPhase;
  cycle: number;
  completedCycles: number;
  wins: number;
  losses: number;
  coins: number;
  roster: MonsterInstance[];
  activeIds: string[];
  equipmentInventory: string[];
  shop: ShopState | null;
  draftRound: number;
  draftChoices: string[];
  eventChoices: string[];
  lastBattle?: BattleResult;
};

export type TimedStatus = {
  id: StatusId;
  amount: number;
  remainingSeconds: number;
};

export type FighterSnapshot = {
  id: string;
  team: Team;
  name: string;
  definitionId: string;
  colorStars: ColorStars;
  whiteStars: WhiteStars;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  gauge: number;
  shield: number;
  statuses: StatusId[];
  alive: boolean;
};

export type BattleFrame = {
  atSeconds: number;
  kind: 'start' | 'action' | 'environment' | 'defeat' | 'finish';
  actorId?: string;
  targetIds: string[];
  text: string;
  fighters: FighterSnapshot[];
};

export type BattleResult = {
  winner: BattleWinner;
  durationSeconds: number;
  frames: BattleFrame[];
  damageByTeam: Record<Team, number>;
};

export type BattleInput = {
  player: MonsterInstance[];
  enemy: MonsterInstance[];
  seed: number;
};

export type CommandResult<T> = { ok: true; state: T } | { ok: false; state: T; error: string };

export const EMPTY_STATS: StatBlock = {
  maxHp: 0,
  maxMp: 0,
  attack: 0,
  defense: 0,
  speed: 0,
  wisdom: 0,
  crit: 0,
};
