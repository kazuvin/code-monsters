import type {
  ColorStars,
  GameData,
  GambitRule,
  MonsterDefinition,
  MonsterInstance,
  StatBlock,
  StatId,
  TargetRule,
} from './types';
import { EMPTY_STATS } from './types';

const STAT_IDS: StatId[] = ['maxHp', 'maxMp', 'attack', 'defense', 'speed', 'wisdom', 'crit'];

export type StatValueBreakdown = {
  base: number;
  growth: number;
  individual: number;
  equipment: number;
  total: number;
  capped: boolean;
};

export type MonsterStatBreakdown = Record<StatId, StatValueBreakdown>;

export const MIN_GAMBIT_RULES = 2;
export const MAX_GAMBIT_RULES = 6;

export const definitionFor = (data: GameData, monster: MonsterInstance) => {
  const definition = data.monsters.find((entry) => entry.id === monster.definitionId);
  if (!definition) throw new Error(`Unknown monster definition: ${monster.definitionId}`);
  return definition;
};

const definitionFrom = (data: GameData, source: MonsterDefinition | MonsterInstance) =>
  'definitionId' in source ? definitionFor(data, source) : source;

export const experienceProfileFor = (data: GameData, source: MonsterDefinition | MonsterInstance) => {
  const definition = definitionFrom(data, source);
  const profile = data.experienceProfiles.find((entry) => entry.id === definition.experienceProfileId);
  if (!profile) throw new Error(`Unknown experience profile: ${definition.experienceProfileId}`);
  return profile;
};

export const experienceThresholdsFor = (data: GameData, source: MonsterDefinition | MonsterInstance) =>
  experienceProfileFor(data, source).thresholds;

export const statGrowthProfileFor = (data: GameData, source: MonsterDefinition | MonsterInstance) => {
  const definition = definitionFrom(data, source);
  const profile = data.statGrowthProfiles.find((entry) => entry.id === definition.statGrowthProfileId);
  if (!profile) throw new Error(`Unknown stat growth profile: ${definition.statGrowthProfileId}`);
  return profile;
};

export const statGrowthUnitsForLevel = (data: GameData, source: MonsterDefinition | MonsterInstance, level: number) =>
  statGrowthProfileFor(data, source)
    .incrementsByLevel.slice(0, Math.max(0, Math.min(data.rules.maxLevel, level) - 1))
    .reduce((total, increment) => total + increment, 0);

export const levelForXp = (data: GameData, definition: MonsterDefinition, xp: number) => {
  const thresholds = experienceThresholdsFor(data, definition);
  let level = 1;
  for (let index = 1; index < thresholds.length; index += 1) {
    if (xp < (thresholds[index] ?? Number.POSITIVE_INFINITY)) break;
    level = index + 1;
  }
  return Math.min(data.rules.maxLevel, level);
};

export const effectiveStarsFor = (data: GameData, monster: MonsterInstance) =>
  definitionFor(data, monster).whiteStars + monster.colorStars;

const defaultTargetForSkill = (data: GameData, skillId: string) =>
  targetRulesForSkill(data, skillId)[0] ?? 'random-enemy';

const defaultConditionForSkill = (data: GameData, skillId: string): GambitRule['condition'] => {
  const skill = data.skills.find((entry) => entry.id === skillId);
  if (!skill) return { kind: 'always' };
  const targetGroup =
    skill.targetScope === 'self' ? 'self' : skill.targetScope.includes('all') ? 'ally' : 'action-target';
  const restorative = skill.effects.find((effect) => effect.kind === 'heal' || effect.kind === 'shield');
  if (restorative) {
    if (restorative.kind === 'shield') {
      if (skill.targetScope === 'self') return { kind: 'self-shield-below', threshold: 25 };
      if (skill.targetScope.includes('ally')) return { kind: 'ally-shield-below', threshold: 25 };
    }
    if (skill.targetScope === 'self') return { kind: 'self-hp-below', threshold: 50 };
    if (skill.targetScope.includes('ally')) return { kind: 'ally-hp-below', threshold: 50 };
  }
  if (skill.effects.some((effect) => effect.kind === 'mp')) {
    return targetGroup === 'self' ? { kind: 'self-mp-below', threshold: 50 } : { kind: 'ally-mp-below', threshold: 50 };
  }
  const status = skill.effects.find((effect) => effect.kind === 'status');
  if (status?.kind === 'status') {
    const beneficial = status.statusId.endsWith('-up') || status.statusId === 'regeneration';
    if (beneficial) {
      return targetGroup === 'self'
        ? { kind: 'self-lacks-status', statusId: status.statusId }
        : { kind: 'ally-lacks-status', statusId: status.statusId };
    }
    return { kind: 'enemy-lacks-status', statusId: status.statusId };
  }
  return { kind: 'enemy-hp-below', threshold: 50 };
};

export const defaultGambitsFor = (
  data: GameData,
  definition: MonsterDefinition,
  inheritedSkillId?: string,
): GambitRule[] => {
  const signatureSkillId = definition.identity?.signatureSkillId ?? definition.intrinsicSkillIds[0];
  const secondarySkillId =
    definition.intrinsicSkillIds.find((skillId) => skillId !== signatureSkillId) ?? definition.intrinsicSkillIds[1];
  const slotSkillId =
    inheritedSkillId && !definition.intrinsicSkillIds.includes(inheritedSkillId)
      ? inheritedSkillId
      : definition.defaultSkillId;
  return [
    {
      condition: definition.identity?.recommendedCondition ?? defaultConditionForSkill(data, signatureSkillId),
      action: { skillId: signatureSkillId, target: defaultTargetForSkill(data, signatureSkillId) },
    },
    {
      condition: defaultConditionForSkill(data, secondarySkillId),
      action: { skillId: secondarySkillId, target: defaultTargetForSkill(data, secondarySkillId) },
    },
    {
      condition: defaultConditionForSkill(data, slotSkillId),
      action: { skillId: slotSkillId, target: defaultTargetForSkill(data, slotSkillId) },
    },
  ];
};

export function createMonster(
  data: GameData,
  definitionId: string,
  id: string,
  options: {
    colorStars?: ColorStars;
    xp?: number;
    inheritedStats?: StatBlock;
    inheritedSkillId?: string;
    gambits?: GambitRule[];
    equipmentId?: string;
    cyclesHeld?: number;
    journeySeed?: number;
  } = {},
): MonsterInstance {
  const definition = data.monsters.find((entry) => entry.id === definitionId);
  if (!definition) throw new Error(`Unknown monster definition: ${definitionId}`);
  const xp = Math.max(0, options.xp ?? 0);
  return {
    id,
    definitionId,
    colorStars: options.colorStars ?? 0,
    level: levelForXp(data, definition, xp),
    xp,
    cyclesHeld: Math.max(0, Math.floor(options.cyclesHeld ?? 0)),
    journeySeed: Math.floor(options.journeySeed ?? 0),
    inheritedStats: { ...(options.inheritedStats ?? EMPTY_STATS) },
    inheritedSkillId: options.inheritedSkillId,
    gambits: options.gambits ?? defaultGambitsFor(data, definition, options.inheritedSkillId),
    equipmentId: options.equipmentId,
  };
}

export type FarewellCoinBreakdown = {
  whiteStars: number;
  level: number;
  colorStars: number;
  trait: number;
  total: number;
};

export function farewellCoinBreakdownFor(data: GameData, monster: MonsterInstance): FarewellCoinBreakdown {
  const definition = definitionFor(data, monster);
  const trait = data.traits.find((entry) => entry.id === definition.traitId);
  const traitStage = trait?.stages[monster.colorStars];
  const traitRate = traitStage?.farewellCoinsPerHeldCycle ?? 0;
  const growthEvery = Math.max(1, Math.floor(traitStage?.farewellCoinGrowthEveryHeldCycles ?? 1));
  const growthAmount = traitStage?.farewellCoinGrowthAmount ?? 0;
  const completedBands = Math.floor(monster.cyclesHeld / growthEvery);
  const cyclesInCurrentBand = monster.cyclesHeld % growthEvery;
  const growthUnits = (growthEvery * completedBands * (completedBands - 1)) / 2 + completedBands * cyclesInCurrentBand;
  const breakdown = {
    whiteStars: definition.sellPrice,
    level: Math.max(0, monster.level - 1) * data.rules.farewell.levelCoinPerLevel,
    colorStars: monster.colorStars * data.rules.farewell.colorStarCoinBonus,
    trait: monster.cyclesHeld * traitRate + growthUnits * growthAmount,
  };
  return {
    ...breakdown,
    total: breakdown.whiteStars + breakdown.level + breakdown.colorStars + breakdown.trait,
  };
}

export const farewellCoinsFor = (data: GameData, monster: MonsterInstance) =>
  farewellCoinBreakdownFor(data, monster).total;

export const gainMonsterXp = (data: GameData, monster: MonsterInstance, amount: number): MonsterInstance => {
  const definition = definitionFor(data, monster);
  const maximumXp = experienceThresholdsFor(data, definition)[data.rules.maxLevel - 1] ?? monster.xp;
  const xp = Math.min(maximumXp, monster.xp + Math.max(0, Math.floor(amount)));
  return { ...monster, xp, level: levelForXp(data, definition, xp) };
};

export function permanentStatsFor(data: GameData, monster: MonsterInstance): StatBlock {
  const definition = definitionFor(data, monster);
  const growthMultiplier = data.rules.breeding.colorGrowthBonus[monster.colorStars];
  const growthUnits = statGrowthUnitsForLevel(data, definition, monster.level);
  return Object.fromEntries(
    STAT_IDS.map((statId) => {
      const levelGrowth = Math.floor(definition.growthPerLevel[statId] * growthUnits * growthMultiplier);
      const value = definition.baseStats[statId] + levelGrowth + monster.inheritedStats[statId];
      return [statId, statId === 'crit' ? Math.min(data.rules.battle.criticalCap, value) : value];
    }),
  ) as StatBlock;
}

export function statBreakdownFor(data: GameData, monster: MonsterInstance): MonsterStatBreakdown {
  const definition = definitionFor(data, monster);
  const equipment = data.equipment.find((entry) => entry.id === monster.equipmentId);
  const growthMultiplier = data.rules.breeding.colorGrowthBonus[monster.colorStars];
  const growthUnits = statGrowthUnitsForLevel(data, definition, monster.level);
  return Object.fromEntries(
    STAT_IDS.map((statId) => {
      const base = definition.baseStats[statId];
      const growth = Math.floor(definition.growthPerLevel[statId] * growthUnits * growthMultiplier);
      const individual = monster.inheritedStats[statId];
      const equipmentBonus = equipment?.statBonus[statId] ?? 0;
      const rawTotal = base + growth + individual + equipmentBonus;
      const total = statId === 'crit' ? Math.min(data.rules.battle.criticalCap, rawTotal) : rawTotal;
      return [
        statId,
        {
          base,
          growth,
          individual,
          equipment: equipmentBonus,
          total,
          capped: total < rawTotal,
        },
      ];
    }),
  ) as MonsterStatBreakdown;
}

export function battleStatsFor(data: GameData, monster: MonsterInstance): StatBlock {
  const breakdown = statBreakdownFor(data, monster);
  return Object.fromEntries(STAT_IDS.map((statId) => [statId, breakdown[statId].total])) as StatBlock;
}

export const skillIdsFor = (data: GameData, monster: MonsterInstance) => {
  const definition = definitionFor(data, monster);
  return [
    ...definition.intrinsicSkillIds,
    monster.inheritedSkillId && !definition.intrinsicSkillIds.includes(monster.inheritedSkillId)
      ? monster.inheritedSkillId
      : definition.defaultSkillId,
  ];
};

export const setMonsterGambit = (monster: MonsterInstance, index: number, rule: GambitRule): MonsterInstance => {
  if (index < 0 || index >= monster.gambits.length) return monster;
  const gambits = [...monster.gambits];
  gambits[index] = rule;
  return { ...monster, gambits };
};

export const replaceMonsterGambits = (monster: MonsterInstance, gambits: GambitRule[]): MonsterInstance => {
  if (gambits.length < MIN_GAMBIT_RULES || gambits.length > MAX_GAMBIT_RULES) return monster;
  return { ...monster, gambits: [...gambits] };
};

export const targetRulesForSkill = (data: GameData, skillId: string): TargetRule[] => {
  if (skillId === 'normal-attack') {
    return ['lowest-hp-enemy', 'highest-hp-enemy', 'highest-attack-enemy', 'random-enemy'];
  }
  const skill = data.skills.find((entry) => entry.id === skillId);
  if (!skill) return [];
  if (skill.targetScope === 'self') return ['self'];
  if (skill.targetScope === 'single-ally') return ['self', 'lowest-hp-ally', 'highest-hp-ally'];
  if (skill.targetScope === 'single-enemy') {
    return ['lowest-hp-enemy', 'highest-hp-enemy', 'highest-attack-enemy', 'random-enemy'];
  }
  return skill.targetScope === 'all-allies' ? ['lowest-hp-ally'] : ['lowest-hp-enemy'];
};
