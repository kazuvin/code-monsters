export type Role = 'STRIKER' | 'TANK' | 'SUPPORT' | 'VENOM' | 'CHASE' | 'HACKER' | 'BERSERKER';
export type ActionType =
  | 'attack'
  | 'heavy'
  | 'move'
  | 'jump'
  | 'throw'
  | 'taunt'
  | 'pull'
  | 'retreat'
  | 'heal'
  | 'guard'
  | 'buff'
  | 'berserk'
  | 'poison'
  | 'burn'
  | 'follow'
  | 'wait';
export type AttackType = 'melee' | 'blunt' | 'sniper';
export type Rarity = 'common' | 'rare' | 'epic';
export type ReactionTrigger = 'selfAttackHit' | 'selfHit' | 'allyAttackHit' | 'selfHpLow';
export type ConditionId =
  | 'always'
  | 'enemyInRange'
  | 'enemyOutOfRange'
  | 'enemyHpBelow50'
  | 'selfHpBelow30'
  | 'allyHpBelow50'
  | 'enemyHasStatus';
export type TargetType = 'nearestEnemy' | 'lowestHpEnemy' | 'lowestHpAlly' | 'self';
export type TargetSelectorId = 'currentEnemy' | 'lowestHpEnemy' | 'lowestHpAlly' | 'self' | 'allEnemies' | 'allAllies';
export type TargetDomain = 'enemy' | 'ally' | 'self';
export type TargetCardinality = 'one' | 'many';
export type ActionTargetMode = 'selected' | 'self' | 'allEnemies' | 'allAllies';
export type ImpactProfile = { damageScale?: number; knockbackPower?: number };
export type ActionParameters = {
  attackScale?: number;
  flatDamage?: number;
  damageScale?: number;
  statusTargetDamageBonus?: number;
  minimumDamage?: number;
  knockbackPower?: number;
  moveDistance?: number;
  throwDistance?: number;
  pullDistance?: number;
  rangeScale?: number;
  durationSeconds?: number;
  healAmount?: number;
  supportHealAmount?: number;
  attackFlat?: number;
  speedScale?: number;
  cooldownSeconds?: number;
  statusStacks?: number;
  incomingDamageScale?: number;
  incomingKnockbackScale?: number;
};

export type UnitDefinition = {
  id: string;
  name: string;
  code: string;
  role: Role;
  color: string;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  price: number;
  range: number;
  knockbackPower: number;
  weight: number;
  attackType: AttackType;
  rarity: Rarity;
  programLimit: number;
};

export type Instruction = {
  id: string;
  title: string;
  short: string;
  flavor: string;
  action: ActionType;
  price: number;
  rarity: Rarity;
  condition: ConditionId;
  target: TargetType;
  defaultTarget: TargetSelectorId;
  targetMode: ActionTargetMode;
  compatibleTargets: TargetSelectorId[];
  tone: 'cyan' | 'amber' | 'lime' | 'violet';
  params: ActionParameters;
  fixedFor?: string;
  reactionOnly?: boolean;
  visualKind?: 'move' | 'dash' | 'jump' | 'retreat';
  showAttackTypeLabel?: boolean;
};

export type Fighter = UnitDefinition & {
  instanceId: string;
  team: 'ally' | 'enemy';
  hp: number;
  x: number;
  z: number;
  cooldown: number;
  reactionCooldown: number;
  guarded: boolean;
  guardDamageScale: number;
  guardKnockbackScale: number;
  berserk: boolean;
  poison: number;
  tauntTargetId: string | null;
  tauntSeconds: number;
};

export type ProgramBlock = {
  targetId: TargetSelectorId;
  conditionId: ConditionId;
  actionId: string;
  fixedAction?: boolean;
};
export type ReactionBlock = { trigger: ReactionTrigger; actionId: string; fixedReaction?: boolean };
export type UnitInventoryItem = UnitDefinition & {
  inventoryId: string;
  program: ProgramBlock[];
  reaction: ReactionBlock | null;
};
export type BattleFlash = {
  id: string;
  kind:
    | 'move'
    | 'dash'
    | 'jump'
    | 'throw'
    | 'thrown'
    | 'taunt'
    | 'pull'
    | 'pulled'
    | 'retreat'
    | 'heal'
    | 'hit'
    | 'attack'
    | 'heavy'
    | 'poison'
    | 'burn'
    | 'follow'
    | 'guard'
    | 'berserk'
    | 'wait'
    | 'miss'
    | 'death';
  n: number;
  targetId?: string;
  attackType?: AttackType;
  actionLabel?: string;
  reaction?: boolean;
};

export type LogItem = {
  id: number;
  time: string;
  actor: string;
  text: string;
  type: 'info' | 'hit' | 'heal' | 'skip' | 'miss' | 'reaction';
};
