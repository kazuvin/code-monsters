export type Role = 'STRIKER' | 'TANK' | 'SUPPORT' | 'VENOM' | 'CHASE' | 'HACKER';
export type ActionType = 'attack' | 'heavy' | 'move' | 'retreat' | 'heal' | 'guard' | 'buff' | 'poison' | 'burn' | 'follow' | 'wait';
export type AttackType = 'melee' | 'blunt' | 'sniper';
export type Rarity = 'common' | 'rare' | 'epic';
export type ReactionTrigger = 'selfAttackHit' | 'selfHit' | 'allyAttackHit';
export type ImpactProfile = { damageScale?: number; knockbackPower?: number };

export type UnitDefinition = {
  id: string; name: string; code: string; role: Role; color: number;
  maxHp: number; attack: number; defense: number; speed: number; price: number;
  range: number; knockbackPower: number; weight: number; attackType: AttackType;
  rarity: Rarity; programLimit: number;
};

export type Instruction = {
  id: string; title: string; short: string; flavor: string; action: ActionType; price: number;
  rarity: Rarity;
  condition: string; target: string; tone: 'cyan' | 'amber' | 'lime' | 'violet';
  fixedFor?: string;
  movementScale?: number;
  impact?: ImpactProfile;
};

export type Fighter = UnitDefinition & {
  instanceId: string; team: 'ally' | 'enemy'; hp: number; x: number; z: number;
  cooldown: number; reactionCooldown: number; guarded: boolean; poison: number;
};

export type ProgramBlock = { conditionId: string; actionId: string; fixedAction?: boolean };
export type ReactionBlock = { trigger: ReactionTrigger; actionId: string; fixedReaction?: boolean };
export type UnitInventoryItem = UnitDefinition & { inventoryId: string; program: ProgramBlock[]; reaction: ReactionBlock | null };
export type BattleFlash = {
  id: string;
  kind: 'move' | 'dash' | 'retreat' | 'heal' | 'hit' | 'attack' | 'heavy' | 'poison' | 'burn' | 'follow' | 'guard' | 'wait' | 'death';
  n: number;
  targetId?: string;
  attackType?: AttackType;
  actionLabel?: string;
  reaction?: boolean;
};

export type LogItem = { id: number; time: string; actor: string; text: string; type: 'info' | 'hit' | 'heal' | 'skip' | 'reaction' };
