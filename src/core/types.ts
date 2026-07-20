export type Team = 'player' | 'enemy';
export type Rarity = 'common' | 'rare';
export type Winner = Team | 'draw' | null;

export type CommandEffect =
  | { kind: 'damage'; amount: number }
  | { kind: 'shield'; amount: number }
  | { kind: 'charge'; amount: number }
  | { kind: 'burst'; baseDamage: number; damagePerPower: number }
  | { kind: 'repeatPrevious' }
  | { kind: 'sharePower'; amount: number }
  | { kind: 'healLowest'; amount: number };

export type CommandDefinition = {
  id: string;
  code: string;
  title: string;
  description: string;
  price: number;
  rarity: Rarity;
  shopWeight?: number;
  effect: CommandEffect;
};

export type UnitDefinition = {
  id: string;
  name: string;
  code: string;
  maxHp: number;
  color: string;
};

export type ProgramBoard = Array<Array<string | null>>;

export type GameData = {
  schemaVersion: number;
  rules: {
    lanes: number;
    programSlots: number;
    maxRounds: number;
    stackLimit: number;
    startingCoins: number;
    winReward?: number;
    retryReward?: number;
    rerollCost: number;
    shopSize: number;
  };
  units: UnitDefinition[];
  commands: CommandDefinition[];
  startingInventory: string[];
  playerProgram: ProgramBoard;
  enemyProgram: ProgramBoard;
};

export type FighterState = {
  instanceId: string;
  unitId: string;
  name: string;
  code: string;
  color: string;
  team: Team;
  lane: number;
  hp: number;
  maxHp: number;
  shield: number;
  power: number;
};

export type TraceKind = 'execute' | 'repeat' | 'damage' | 'shield' | 'charge' | 'share' | 'heal' | 'stackOverflow';

export type BattleTraceEvent = {
  id: string;
  round: number;
  slot: number;
  team: Team;
  lane: number;
  actorId: string;
  kind: TraceKind;
  commandId: string;
  depth: number;
  value?: number;
  targetId?: string;
};

export type BattleState = {
  round: number;
  currentSlot: number;
  fighters: FighterState[];
  playerProgram: ProgramBoard;
  enemyProgram: ProgramBoard;
  trace: BattleTraceEvent[];
  winner: Winner;
};

export type ShopOffer = {
  id: string;
  slot: number;
  commandId: string;
  locked: boolean;
};
