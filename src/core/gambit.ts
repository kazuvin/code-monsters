import type { GameData, GambitAction, GambitCondition, MonsterInstance, StatusId, TargetRule, Team } from './types';
import { skillIdsFor } from './monster';

export type GambitFighterView = {
  id: string;
  team: Team;
  monster: MonsterInstance;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attack: number;
  alive: boolean;
  statuses: StatusId[];
};

const percentage = (value: number, maximum: number) => (maximum <= 0 ? 0 : (value / maximum) * 100);

const teamFor = (fighter: GambitFighterView, all: GambitFighterView[], relation: 'ally' | 'enemy') =>
  all.filter(
    (candidate) =>
      candidate.alive && (relation === 'ally' ? candidate.team === fighter.team : candidate.team !== fighter.team),
  );

export function conditionMatches(condition: GambitCondition, fighter: GambitFighterView, all: GambitFighterView[]) {
  const allies = teamFor(fighter, all, 'ally');
  const enemies = teamFor(fighter, all, 'enemy');
  switch (condition.kind) {
    case 'always':
      return true;
    case 'self-hp-below':
      return percentage(fighter.hp, fighter.maxHp) <= condition.threshold;
    case 'self-mp-above':
      return percentage(fighter.mp, fighter.maxMp) >= condition.threshold;
    case 'ally-hp-below':
      return allies.some((ally) => percentage(ally.hp, ally.maxHp) <= condition.threshold);
    case 'enemy-hp-below':
      return enemies.some((enemy) => percentage(enemy.hp, enemy.maxHp) <= condition.threshold);
    case 'ally-has-status':
      return allies.some((ally) => ally.statuses.includes(condition.statusId));
    case 'enemy-has-status':
      return enemies.some((enemy) => enemy.statuses.includes(condition.statusId));
    case 'living-count-at-most':
      return (condition.team === 'ally' ? allies : enemies).length <= condition.count;
  }
}

const validTargetRule = (scope: string, target: TargetRule) => {
  if (scope === 'self') return target === 'self';
  if (scope === 'single-ally') return ['self', 'lowest-hp-ally', 'highest-hp-ally'].includes(target);
  if (scope === 'single-enemy') return target.includes('enemy');
  if (scope === 'all-allies') return target.includes('ally') || target === 'self';
  return target.includes('enemy');
};

const actionIsUsable = (data: GameData, fighter: GambitFighterView, action: GambitAction) => {
  if (action.skillId === 'normal-attack') return action.target.includes('enemy');
  if (!skillIdsFor(data, fighter.monster).includes(action.skillId)) return false;
  const skill = data.skills.find((entry) => entry.id === action.skillId);
  return Boolean(skill && fighter.mp >= skill.mpCost && validTargetRule(skill.targetScope, action.target));
};

export function chooseGambitAction(data: GameData, fighter: GambitFighterView, all: GambitFighterView[]): GambitAction {
  const silenced = fighter.statuses.includes('silence');
  for (const rule of fighter.monster.gambits) {
    if (silenced && rule.action.skillId !== 'normal-attack') continue;
    if (!conditionMatches(rule.condition, fighter, all)) continue;
    if (actionIsUsable(data, fighter, rule.action)) return rule.action;
  }
  return { skillId: 'normal-attack', target: 'random-enemy' };
}
