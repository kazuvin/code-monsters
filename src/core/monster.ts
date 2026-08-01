import type { GameData, GambitRule, MonsterDefinition, MonsterInstance, StatBlock, StatId, TargetRule } from './types';

const STAT_IDS: StatId[] = ['maxHp', 'maxMp', 'attack', 'defense', 'speed', 'wisdom', 'crit'];

export type StatValueBreakdown = {
  base: number;
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

export const nativeSkillIdsForDefinition = (definition: MonsterDefinition): [string, string, string] => [
  definition.intrinsicSkillIds[0],
  definition.intrinsicSkillIds[1],
  definition.defaultSkillId,
];

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
  skillIds: readonly string[] = nativeSkillIdsForDefinition(definition),
): GambitRule[] =>
  skillIds.map((skillId) => ({
    condition:
      skillId === definition.identity?.signatureSkillId
        ? definition.identity.recommendedCondition
        : defaultConditionForSkill(data, skillId),
    action: { skillId, target: defaultTargetForSkill(data, skillId) },
  }));

export function createMonster(
  data: GameData,
  definitionId: string,
  id: string,
  options: {
    skillIds?: readonly string[];
    gambits?: GambitRule[];
    equipmentId?: string;
  } = {},
): MonsterInstance {
  const definition = data.monsters.find((entry) => entry.id === definitionId);
  if (!definition) throw new Error(`Unknown monster definition: ${definitionId}`);
  const skillIds = [...(options.skillIds ?? nativeSkillIdsForDefinition(definition))];
  if (skillIds.length !== 3 || new Set(skillIds).size !== 3) {
    throw new Error(`${definition.name}には重複しないスキルを3つ設定してください`);
  }
  for (const skillId of skillIds) {
    if (!data.skills.some((skill) => skill.id === skillId)) throw new Error(`Unknown skill: ${skillId}`);
  }
  const selectedSkillIds = skillIds as [string, string, string];
  return {
    id,
    definitionId,
    skillIds: selectedSkillIds,
    gambits: options.gambits ?? defaultGambitsFor(data, definition, selectedSkillIds),
    equipmentId: options.equipmentId,
  };
}

export type FarewellCoinBreakdown = {
  species: number;
  total: number;
};

export function farewellCoinBreakdownFor(data: GameData, monster: MonsterInstance): FarewellCoinBreakdown {
  const species = definitionFor(data, monster).sellPrice;
  return { species, total: species };
}

export const farewellCoinsFor = (data: GameData, monster: MonsterInstance) =>
  farewellCoinBreakdownFor(data, monster).total;

export function permanentStatsFor(data: GameData, monster: MonsterInstance): StatBlock {
  return { ...definitionFor(data, monster).baseStats };
}

export function statBreakdownFor(data: GameData, monster: MonsterInstance): MonsterStatBreakdown {
  const definition = definitionFor(data, monster);
  const equipment = data.equipment.find((entry) => entry.id === monster.equipmentId);
  return Object.fromEntries(
    STAT_IDS.map((statId) => {
      const base = definition.baseStats[statId];
      const equipmentBonus = equipment?.statBonus[statId] ?? 0;
      const rawTotal = base + equipmentBonus;
      const total = statId === 'crit' ? Math.min(data.rules.battle.criticalCap, rawTotal) : rawTotal;
      return [statId, { base, equipment: equipmentBonus, total, capped: total < rawTotal }];
    }),
  ) as MonsterStatBreakdown;
}

export function battleStatsFor(data: GameData, monster: MonsterInstance): StatBlock {
  const breakdown = statBreakdownFor(data, monster);
  return Object.fromEntries(STAT_IDS.map((statId) => [statId, breakdown[statId].total])) as StatBlock;
}

export const skillIdsFor = (_data: GameData, monster: MonsterInstance) => [...monster.skillIds];

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
