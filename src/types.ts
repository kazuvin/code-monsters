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
  | 'targetInRange'
  | 'targetOutOfRange'
  | 'enemyHpBelow50'
  | 'selfHpBelow30'
  | 'enemyHasStatus';
export type TargetType = 'nearestEnemy' | 'lowestHpEnemy' | 'nearestAlly' | 'lowestHpAlly' | 'criticalAlly' | 'self';
export type TargetSelectorId =
  | 'nearestEnemy'
  | 'lowestHpEnemy'
  | 'allEnemies'
  | 'self'
  | 'nearestAlly'
  | 'lowestHpAlly'
  | 'criticalAlly'
  | 'allAllies';
export type TargetDomain = 'enemy' | 'ally' | 'self';
export type TargetCardinality = 'one' | 'many';
export type ActionTargetMode = 'selected' | 'self' | 'allEnemies' | 'allAllies';
export type ImpactProfile = { damageScale?: number; knockbackPower?: number };
export type ActionParameters = {
  attackScale?: number;
  flatDamage?: number;
  damageScale?: number;
  statusTargetDamageBonus?: number;
  statusTargetId?: string;
  minimumDamage?: number;
  knockbackPower?: number;
  moveDistance?: number;
  throwDistance?: number;
  pullDistance?: number;
  rangeScale?: number;
  fixedRange?: number;
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

export type StatusEffectKind =
  | 'incomingDamageScale'
  | 'incomingKnockbackScale'
  | 'attackScale'
  | 'speedScale'
  | 'targetLock';

export type StatusEffectDefinition = {
  kind: StatusEffectKind;
  sourceInstructionId?: string;
  parameter?: keyof ActionParameters;
};

export type StatusDefinition = {
  id: string;
  label: string;
  description: string;
  stacking: 'stack' | 'replace';
  maxStacks: number;
  clearOnAction: boolean;
  duration: {
    mode: 'persistent' | 'instructionParam';
    sourceInstructionId?: string;
    parameter?: keyof ActionParameters;
  };
  debug: {
    control: 'toggle' | 'stacks';
    min?: number;
    max?: number;
    step?: number;
  };
  visual: {
    className: string;
    cardClass: string;
    chipClass: string;
    label: string;
    showStacks: boolean;
    showRemaining: boolean;
  };
  effects: StatusEffectDefinition[];
};

export type StatusInstance = {
  statusId: string;
  stacks: number;
  remainingSeconds: number | null;
  sourceId: string | null;
  targetId: string | null;
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
  abilityCost: number;
  price: number;
  rarity: Rarity;
  condition: ConditionId;
  target: TargetType;
  defaultTarget: TargetSelectorId;
  targetMode: ActionTargetMode;
  compatibleTargets: TargetSelectorId[];
  tone: 'cyan' | 'amber' | 'lime' | 'violet';
  params: ActionParameters;
  appliesStatusId?: string;
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
  abilityGauge: number;
  reactionCooldown: number;
  statuses: StatusInstance[];
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
