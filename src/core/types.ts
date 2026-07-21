export type Team = 'player' | 'enemy';
export type Rarity = 'common' | 'rare';
export type Winner = Team | 'draw' | null;
export type Direction = 'north' | 'east' | 'south' | 'west';
export type Rotation = 0 | 1 | 2 | 3;

export type ActiveEffect =
  | { kind: 'damage'; amount: number }
  | { kind: 'shield'; amount: number }
  | { kind: 'repair'; amount: number };

export type BlockEffect = ActiveEffect | { kind: 'amplify'; amount: number } | { kind: 'haste'; amount: number };

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
  effect: BlockEffect;
  cooldown?: number;
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
    suddenDeathSeconds: number;
    suddenDeathBaseDamage: number;
    suddenDeathGrowth: number;
    startingCoins: number;
    winReward: number;
    retryReward: number;
    rerollCost: number;
    shopSize: number;
  };
  units: UnitDefinition[];
  playerUnitId: string;
  enemyUnitId: string;
  blocks: BlockDefinition[];
  startingRack: string[];
  playerBoard: CircuitBoard;
  enemyBoard: CircuitBoard;
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
};

export type BattleTraceEvent =
  | {
      id: string;
      tick: number;
      team: Team;
      kind: ActiveEffect['kind'];
      blockId: string;
      row: number;
      column: number;
      value: number;
      targetId: string;
    }
  | {
      id: string;
      tick: number;
      team: Team;
      kind: 'overload';
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
  trace: BattleTraceEvent[];
  overloadLevel: number;
  overloadDamage: number;
  winner: Winner;
};

export type ShopOffer = {
  id: string;
  slot: number;
  blockId: string;
  locked: boolean;
};
