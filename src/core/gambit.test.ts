import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { chooseGambitDecision, conditionMatches, type GambitFighterView } from './gambit';
import { createMonster } from './monster';
import type { GambitCondition, StatusId } from './types';

const fighterView = (
  id: string,
  team: 'player' | 'enemy',
  overrides: Partial<GambitFighterView> = {},
): GambitFighterView => ({
  id,
  team,
  monster: createMonster(GAME_DATA, team === 'player' ? 'light-dragon-1' : 'dark-demon-1', id),
  hp: 80,
  maxHp: 100,
  mp: 20,
  maxMp: 40,
  attack: 20,
  alive: true,
  statuses: [],
  ...overrides,
});

const matches = (
  condition: GambitCondition,
  self: Partial<GambitFighterView> = {},
  ally: Partial<GambitFighterView> = {},
  enemy: Partial<GambitFighterView> = {},
) => {
  const actor = fighterView('self', 'player', self);
  return conditionMatches(condition, actor, [
    actor,
    fighterView('ally', 'player', ally),
    fighterView('enemy', 'enemy', enemy),
  ]);
};

describe('gambit conditions', () => {
  it.each([
    [{ kind: 'self-hp-below', threshold: 50 }, { hp: 50 }, {}, {}, true],
    [{ kind: 'self-hp-above', threshold: 50 }, { hp: 50 }, {}, {}, true],
    [{ kind: 'self-mp-below', threshold: 50 }, { mp: 20 }, {}, {}, true],
    [{ kind: 'self-mp-above', threshold: 50 }, { mp: 20 }, {}, {}, true],
    [{ kind: 'ally-hp-below', threshold: 50 }, {}, { hp: 40 }, {}, true],
    [{ kind: 'ally-hp-above', threshold: 75 }, {}, { hp: 75 }, {}, true],
    [{ kind: 'enemy-hp-below', threshold: 25 }, {}, {}, { hp: 25 }, true],
    [{ kind: 'enemy-hp-above', threshold: 75 }, {}, {}, { hp: 75 }, true],
  ] as const)('matches inclusive percentage boundaries for %o', (condition, self, ally, enemy, expected) => {
    expect(matches(condition as GambitCondition, self, ally, enemy)).toBe(expected);
  });

  it.each([
    [{ kind: 'self-has-status', statusId: 'silence' }, { statuses: ['silence'] }, {}, {}, true],
    [{ kind: 'self-lacks-status', statusId: 'silence' }, { statuses: [] }, {}, {}, true],
    [{ kind: 'ally-has-status', statusId: 'attack-up' }, {}, { statuses: ['attack-up'] }, {}, true],
    [{ kind: 'ally-lacks-status', statusId: 'attack-up' }, {}, { statuses: [] }, {}, true],
    [{ kind: 'enemy-has-status', statusId: 'wisdom-down' }, {}, {}, { statuses: ['wisdom-down'] }, true],
    [{ kind: 'enemy-lacks-status', statusId: 'wisdom-down' }, {}, {}, { statuses: [] }, true],
  ] as const)('matches present and absent status checks for %o', (condition, self, ally, enemy, expected) => {
    expect(
      matches(
        condition as GambitCondition,
        self as Partial<GambitFighterView>,
        ally as Partial<GambitFighterView>,
        enemy as Partial<GambitFighterView>,
      ),
    ).toBe(expected);
  });

  it('matches both maximum and minimum living-count conditions', () => {
    const actor = fighterView('self', 'player');
    const defeatedAlly = fighterView('ally', 'player', { alive: false, hp: 0 });
    const enemies = [fighterView('enemy-a', 'enemy'), fighterView('enemy-b', 'enemy'), fighterView('enemy-c', 'enemy')];
    const all = [actor, defeatedAlly, ...enemies];

    expect(conditionMatches({ kind: 'living-count-at-most', team: 'ally', count: 1 }, actor, all)).toBe(true);
    expect(conditionMatches({ kind: 'living-count-at-least', team: 'enemy', count: 3 }, actor, all)).toBe(true);
  });
});

describe('gambit decisions', () => {
  it('uses the first matching and usable rule, skipping insufficient MP', () => {
    const actor = fighterView('self', 'player', {
      mp: 5,
      monster: createMonster(GAME_DATA, 'dark-demon-1', 'self', {
        gambits: [
          {
            condition: { kind: 'always' },
            action: { skillId: 'silence-mark', target: 'lowest-hp-enemy' },
          },
          {
            condition: { kind: 'enemy-lacks-status', statusId: 'wisdom-down' },
            action: { skillId: 'void-needle', target: 'highest-attack-enemy' },
          },
          {
            condition: { kind: 'always' },
            action: { skillId: 'arc-shot', target: 'lowest-hp-enemy' },
          },
        ],
      }),
    });
    const decision = chooseGambitDecision(GAME_DATA, actor, [actor, fighterView('enemy', 'enemy')]);

    expect(decision).toEqual({
      action: { skillId: 'arc-shot', target: 'lowest-hp-enemy' },
      ruleIndex: 2,
      fallback: false,
    });
  });

  it('skips skills during silence but still permits an explicit normal-attack rule', () => {
    const actor = fighterView('self', 'player', {
      statuses: ['silence'] as StatusId[],
      monster: createMonster(GAME_DATA, 'dark-demon-1', 'self', {
        gambits: [
          {
            condition: { kind: 'always' },
            action: { skillId: 'arc-shot', target: 'lowest-hp-enemy' },
          },
          {
            condition: { kind: 'always' },
            action: { skillId: 'normal-attack', target: 'highest-attack-enemy' },
          },
        ],
      }),
    });

    expect(chooseGambitDecision(GAME_DATA, actor, [actor, fighterView('enemy', 'enemy')])).toEqual({
      action: { skillId: 'normal-attack', target: 'highest-attack-enemy' },
      ruleIndex: 1,
      fallback: false,
    });
  });

  it('falls back when no configured condition matches', () => {
    const actor = fighterView('self', 'player', {
      monster: createMonster(GAME_DATA, 'light-dragon-1', 'self', {
        gambits: [
          {
            condition: { kind: 'self-hp-below', threshold: 25 },
            action: { skillId: 'scale-wall', target: 'self' },
          },
          {
            condition: { kind: 'enemy-has-status', statusId: 'silence' },
            action: { skillId: 'halo-bite', target: 'lowest-hp-enemy' },
          },
        ],
      }),
    });

    expect(chooseGambitDecision(GAME_DATA, actor, [actor, fighterView('enemy', 'enemy')])).toEqual({
      action: { skillId: 'normal-attack', target: 'random-enemy' },
      fallback: true,
    });
  });
});
