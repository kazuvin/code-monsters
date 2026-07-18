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
  | 'field'
  | 'wait';
export type AttackType = 'melee' | 'blunt' | 'sniper';
export type Rarity = 'common' | 'rare' | 'epic';
export type ReactionTrigger = 'selfAttackHit' | 'selfHit' | 'partnerAttackHit' | 'selfHpLow';
export type ConditionId = string;
export type ConditionKind =
  | 'always'
  | 'targetInRange'
  | 'targetOutOfRange'
  | 'targetHpBelow'
  | 'selfHpBelow'
  | 'targetHasStatus'
  | 'selfHasStatus';
export type TargetType = 'nearestEnemy' | 'lowestHpEnemy' | 'partner' | 'self';
export type TargetSelectorId = 'nearestEnemy' | 'lowestHpEnemy' | 'allEnemies' | 'self' | 'partner';
export type TargetDomain = 'enemy' | 'ally' | 'self';
export type TargetCardinality = 'one' | 'many';
export type ActionTargetMode = 'selected' | 'self' | 'allEnemies' | 'allAllies';
export type ImpactProfile = { damageScale?: number; knockbackPower?: number };
export type EffectTarget = 'actor' | 'selected' | 'allEnemies' | 'allAllies';
export type InstructionRange = { mode: 'unit' | 'fixed' | 'scaled'; value?: number };
export type DamageEffect = {
  kind: 'damage';
  attackScale: number;
  flatDamage?: number;
  damageScale?: number;
  minimumDamage: number;
  knockbackPower?: number;
};
export type MoveEffect = {
  kind: 'move';
  mode: 'advance' | 'retreat' | 'jump' | 'throwTarget' | 'pullTarget';
  distance: number;
};
export type HealEffect = { kind: 'heal'; amount: number; supportAmount?: number };
export type ApplyStatusEffect = {
  kind: 'applyStatus';
  statusId: string;
  target: EffectTarget;
  stacks: number;
  durationSeconds?: number;
};
export type ConsumeStatusEffect = {
  kind: 'consumeStatus';
  statusId: string;
  target: Extract<EffectTarget, 'actor' | 'selected'>;
  stacks: number;
  bonusDamage?: number;
};
export type RemoveStatusEffect = {
  kind: 'removeStatus';
  statusId: string;
  target: EffectTarget;
};
export type ModifyStatEffect = { kind: 'modifyStat'; stat: 'attack'; amount: number; target: 'actor' };
export type WaitEffect = { kind: 'wait'; durationSeconds: number };
export type PlaceZoneEffect = {
  kind: 'placeZone';
  zoneId: string;
  anchor: 'actor' | 'target';
  offset: number;
};
export type InstructionEffect =
  | DamageEffect
  | MoveEffect
  | HealEffect
  | ApplyStatusEffect
  | ConsumeStatusEffect
  | RemoveStatusEffect
  | ModifyStatEffect
  | PlaceZoneEffect
  | WaitEffect;
export type InstructionEffectKind = InstructionEffect['kind'];
export type InstructionEffectByKind<Kind extends InstructionEffectKind> = Extract<InstructionEffect, { kind: Kind }>;

export type StatusEffectKind =
  | 'incomingDamageScale'
  | 'incomingKnockbackScale'
  | 'attackScale'
  | 'speedScale'
  | 'targetLock'
  | 'damagePerSecond'
  | 'decayStacksPerTick';

export type StatusEffectDefinition = {
  kind: StatusEffectKind;
  value?: number;
};

export type StatusCounterplayKind = 'expires' | 'clearsOnAction' | 'consumedBySkill' | 'lowHpRequirement';

export type StatusDefinition = {
  id: string;
  label: string;
  description: string;
  stacking: 'stack' | 'replace';
  maxStacks: number | null;
  clearOnAction: boolean;
  duration: {
    mode: 'persistent' | 'application';
  };
  synergy: {
    mode: 'combo' | 'standalone';
    counterplay: {
      kind: StatusCounterplayKind;
      description: string;
    };
    standaloneReason?: string;
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
  tickAccumulatorSeconds?: number;
};

export type BattleZoneTargetFilter = 'any' | 'ally' | 'enemy';
export type BattleZoneTriggerEffect = Omit<ApplyStatusEffect, 'target'>;
export type BattleZoneDefinition = {
  id: string;
  label: string;
  description: string;
  radius: number;
  durationSeconds: number;
  targetFilter: BattleZoneTargetFilter;
  trigger: {
    kind: 'onEnter';
    effects: BattleZoneTriggerEffect[];
  };
  visual: {
    className: string;
    label: string;
    color: string;
  };
};
export type BattleZoneInstance = {
  instanceId: string;
  zoneId: string;
  x: number;
  remainingSeconds: number;
  sourceId: string;
  sourceTeam: Fighter['team'];
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
  range: InstructionRange;
  effects: InstructionEffect[];
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
  actorId?: string;
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
    | 'field'
    | 'guard'
    | 'berserk'
    | 'wait'
    | 'status'
    | 'miss'
    | 'death';
  n: number;
  targetId?: string;
  zoneX?: number;
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
