import type { GameData, GambitAction, GambitCondition, MonsterInstance, StatusId, TargetRule, Team } from './types';
import { skillIdsFor, targetRulesForSkill } from './monster';

export type GambitFighterView = {
  id: string;
  team: Team;
  monster: MonsterInstance;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  shield: number;
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
    case 'self-hp-above':
      return percentage(fighter.hp, fighter.maxHp) >= condition.threshold;
    case 'self-mp-below':
      return percentage(fighter.mp, fighter.maxMp) <= condition.threshold;
    case 'self-mp-above':
      return percentage(fighter.mp, fighter.maxMp) >= condition.threshold;
    case 'self-shield-below':
      return percentage(fighter.shield, fighter.maxHp) <= condition.threshold;
    case 'self-shield-above':
      return percentage(fighter.shield, fighter.maxHp) >= condition.threshold;
    case 'ally-hp-below':
      return allies.some((ally) => percentage(ally.hp, ally.maxHp) <= condition.threshold);
    case 'ally-hp-above':
      return allies.some((ally) => percentage(ally.hp, ally.maxHp) >= condition.threshold);
    case 'ally-mp-below':
      return allies.some((ally) => percentage(ally.mp, ally.maxMp) <= condition.threshold);
    case 'ally-mp-above':
      return allies.some((ally) => percentage(ally.mp, ally.maxMp) >= condition.threshold);
    case 'ally-shield-below':
      return allies.some((ally) => percentage(ally.shield, ally.maxHp) <= condition.threshold);
    case 'ally-shield-above':
      return allies.some((ally) => percentage(ally.shield, ally.maxHp) >= condition.threshold);
    case 'enemy-hp-below':
      return enemies.some((enemy) => percentage(enemy.hp, enemy.maxHp) <= condition.threshold);
    case 'enemy-hp-above':
      return enemies.some((enemy) => percentage(enemy.hp, enemy.maxHp) >= condition.threshold);
    case 'enemy-mp-below':
      return enemies.some((enemy) => percentage(enemy.mp, enemy.maxMp) <= condition.threshold);
    case 'enemy-mp-above':
      return enemies.some((enemy) => percentage(enemy.mp, enemy.maxMp) >= condition.threshold);
    case 'enemy-shield-below':
      return enemies.some((enemy) => percentage(enemy.shield, enemy.maxHp) <= condition.threshold);
    case 'enemy-shield-above':
      return enemies.some((enemy) => percentage(enemy.shield, enemy.maxHp) >= condition.threshold);
    case 'self-has-status':
      return fighter.statuses.includes(condition.statusId);
    case 'self-lacks-status':
      return !fighter.statuses.includes(condition.statusId);
    case 'ally-has-status':
      return allies.some((ally) => ally.statuses.includes(condition.statusId));
    case 'ally-lacks-status':
      return allies.some((ally) => !ally.statuses.includes(condition.statusId));
    case 'enemy-has-status':
      return enemies.some((enemy) => enemy.statuses.includes(condition.statusId));
    case 'enemy-lacks-status':
      return enemies.some((enemy) => !enemy.statuses.includes(condition.statusId));
    case 'living-count-at-most':
      return (condition.team === 'ally' ? allies : enemies).length <= condition.count;
    case 'living-count-at-least':
      return (condition.team === 'ally' ? allies : enemies).length >= condition.count;
  }
}

const actionIsUsable = (data: GameData, fighter: GambitFighterView, action: GambitAction) => {
  if (!targetRulesForSkill(data, action.skillId).includes(action.target)) return false;
  if (action.skillId === 'normal-attack') return true;
  if (!skillIdsFor(data, fighter.monster).includes(action.skillId)) return false;
  const skill = data.skills.find((entry) => entry.id === action.skillId);
  return Boolean(skill && fighter.mp >= skill.mpCost);
};

export type GambitDecision = {
  action: GambitAction;
  ruleIndex?: number;
  fallback: boolean;
};

export function chooseGambitDecision(
  data: GameData,
  fighter: GambitFighterView,
  all: GambitFighterView[],
): GambitDecision {
  const silenced = fighter.statuses.includes('silence');
  for (const [ruleIndex, rule] of fighter.monster.gambits.entries()) {
    if (silenced && rule.action.skillId !== 'normal-attack') continue;
    if (!conditionMatches(rule.condition, fighter, all)) continue;
    if (actionIsUsable(data, fighter, rule.action)) return { action: rule.action, ruleIndex, fallback: false };
  }
  return { action: { skillId: 'normal-attack', target: 'random-enemy' }, fallback: true };
}

export function chooseGambitAction(data: GameData, fighter: GambitFighterView, all: GambitFighterView[]): GambitAction {
  return chooseGambitDecision(data, fighter, all).action;
}
