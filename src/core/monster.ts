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

export const definitionFor = (data: GameData, monster: MonsterInstance) => {
  const definition = data.monsters.find((entry) => entry.id === monster.definitionId);
  if (!definition) throw new Error(`Unknown monster definition: ${monster.definitionId}`);
  return definition;
};

export const levelForXp = (data: GameData, xp: number) => {
  let level = 1;
  for (let index = 1; index < data.rules.levelThresholds.length; index += 1) {
    if (xp < (data.rules.levelThresholds[index] ?? Number.POSITIVE_INFINITY)) break;
    level = index + 1;
  }
  return Math.min(data.rules.maxLevel, level);
};

export const effectiveStarsFor = (data: GameData, monster: MonsterInstance) =>
  definitionFor(data, monster).whiteStars + monster.colorStars;

export const defaultGambitsFor = (definition: MonsterDefinition): [GambitRule, GambitRule, GambitRule] => [
  {
    condition: { kind: 'ally-hp-below', threshold: 50 },
    action: { skillId: definition.intrinsicSkillIds[1], target: 'lowest-hp-ally' },
  },
  {
    condition: { kind: 'always' },
    action: { skillId: definition.intrinsicSkillIds[0], target: 'lowest-hp-enemy' },
  },
  {
    condition: { kind: 'always' },
    action: { skillId: 'normal-attack', target: 'random-enemy' },
  },
];

export function createMonster(
  data: GameData,
  definitionId: string,
  id: string,
  options: {
    colorStars?: ColorStars;
    xp?: number;
    inheritedStats?: StatBlock;
    inheritedSkillId?: string;
    gambits?: [GambitRule, GambitRule, GambitRule];
    equipmentId?: string;
  } = {},
): MonsterInstance {
  const definition = data.monsters.find((entry) => entry.id === definitionId);
  if (!definition) throw new Error(`Unknown monster definition: ${definitionId}`);
  const xp = Math.max(0, options.xp ?? 0);
  return {
    id,
    definitionId,
    colorStars: options.colorStars ?? 0,
    level: levelForXp(data, xp),
    xp,
    inheritedStats: { ...(options.inheritedStats ?? EMPTY_STATS) },
    inheritedSkillId: options.inheritedSkillId,
    gambits: options.gambits ?? defaultGambitsFor(definition),
    equipmentId: options.equipmentId,
  };
}

export const gainMonsterXp = (data: GameData, monster: MonsterInstance, amount: number): MonsterInstance => {
  const maximumXp = data.rules.levelThresholds[data.rules.maxLevel - 1] ?? monster.xp;
  const xp = Math.min(maximumXp, monster.xp + Math.max(0, Math.floor(amount)));
  return { ...monster, xp, level: levelForXp(data, xp) };
};

export function permanentStatsFor(data: GameData, monster: MonsterInstance): StatBlock {
  const definition = definitionFor(data, monster);
  const growthMultiplier = data.rules.breeding.colorGrowthBonus[monster.colorStars];
  return Object.fromEntries(
    STAT_IDS.map((statId) => {
      const levelGrowth = Math.floor(definition.growthPerLevel[statId] * (monster.level - 1) * growthMultiplier);
      const value = definition.baseStats[statId] + levelGrowth + monster.inheritedStats[statId];
      return [statId, statId === 'crit' ? Math.min(data.rules.battle.criticalCap, value) : value];
    }),
  ) as StatBlock;
}

export function battleStatsFor(data: GameData, monster: MonsterInstance): StatBlock {
  const stats = permanentStatsFor(data, monster);
  const equipment = data.equipment.find((entry) => entry.id === monster.equipmentId);
  if (!equipment) return stats;
  return Object.fromEntries(
    STAT_IDS.map((statId) => {
      const value = stats[statId] + (equipment.statBonus[statId] ?? 0);
      return [statId, statId === 'crit' ? Math.min(data.rules.battle.criticalCap, value) : value];
    }),
  ) as StatBlock;
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

export const setMonsterGambit = (monster: MonsterInstance, index: 0 | 1 | 2, rule: GambitRule): MonsterInstance => {
  const gambits = [...monster.gambits] as [GambitRule, GambitRule, GambitRule];
  gambits[index] = rule;
  return { ...monster, gambits };
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
