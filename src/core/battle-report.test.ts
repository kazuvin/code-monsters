import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { createBattleReport } from './battle-report';
import type { BattleTraceEvent } from './types';

const trace: BattleTraceEvent[] = [
  {
    id: '1-player-2-0-0',
    tick: 1,
    team: 'player',
    kind: 'damage',
    blockId: 'poison-needle',
    row: 2,
    column: 0,
    value: 45,
    targetId: 'enemy-rust',
  },
  {
    id: '1-player-2-0-1',
    tick: 1,
    team: 'player',
    kind: 'poison',
    blockId: 'poison-needle',
    row: 2,
    column: 0,
    value: 35,
    targetId: 'enemy-rust',
  },
  {
    id: '1-player-2-0-2',
    tick: 1,
    team: 'player',
    kind: 'growth',
    blockId: 'poison-needle',
    row: 2,
    column: 0,
    value: 15,
    targetId: 'player:2:0',
    buffStat: 'poison',
  },
  {
    id: '2-player-2-1-3',
    tick: 2,
    team: 'player',
    kind: 'rupture',
    blockId: 'rupture-stake',
    row: 2,
    column: 1,
    value: 1430,
    targetId: 'enemy-rust',
  },
  {
    id: '1-player-1-0-4',
    tick: 1,
    team: 'player',
    kind: 'shield',
    blockId: 'repair-dividend',
    row: 1,
    column: 0,
    value: 130,
    targetId: 'player-volt',
  },
  {
    id: '2-player-1-1-5',
    tick: 1,
    team: 'player',
    kind: 'repair',
    blockId: 'repair-dividend',
    row: 1,
    column: 0,
    value: 50,
    targetId: 'player-volt',
  },
  {
    id: '1-enemy-2-0-6',
    tick: 1,
    team: 'enemy',
    kind: 'damage',
    blockId: 'strike',
    row: 2,
    column: 0,
    value: 190,
    targetId: 'player-volt',
  },
  {
    id: '1-enemy-2-1-7',
    tick: 1,
    team: 'enemy',
    kind: 'poison',
    blockId: 'venom-bloom',
    row: 2,
    column: 1,
    value: 120,
    targetId: 'player-volt',
  },
  {
    id: '1-player-0-0-8',
    tick: 1,
    team: 'player',
    kind: 'coin',
    blockId: 'repair-dividend',
    row: 1,
    column: 0,
    value: 1,
    targetId: 'player-volt',
  },
  { id: '2-poison-tick-enemy', tick: 2, team: 'enemy', kind: 'poison-tick', value: 300, targetId: 'enemy-rust' },
  { id: '2-poison-tick-player', tick: 2, team: 'player', kind: 'poison-tick', value: 20, targetId: 'player-volt' },
  { id: '40-overload-player', tick: 40, team: 'player', kind: 'overload', value: 250, targetId: 'player-volt' },
];

describe('battle report', () => {
  it('aggregates direct damage, poison damage, poison application, defense, and repair for both teams', () => {
    const report = createBattleReport(GAME_DATA, trace);

    expect(report.player.totals).toEqual({
      totalDamage: 1775,
      skillDamage: 1475,
      poisonDamage: 300,
      poisonApplied: 35,
      shield: 130,
      repair: 50,
      coinsEarned: 1,
    });
    expect(report.enemy.totals).toEqual({
      totalDamage: 210,
      skillDamage: 190,
      poisonDamage: 20,
      poisonApplied: 120,
      shield: 0,
      repair: 0,
      coinsEarned: 0,
    });
  });

  it('lists each skill once per activation while keeping its output categories separate', () => {
    const report = createBattleReport(GAME_DATA, trace);
    const needle = report.player.skills.find((skill) => skill.blockId === 'poison-needle');
    const rupture = report.player.skills.find((skill) => skill.blockId === 'rupture-stake');

    expect(needle).toMatchObject({
      title: '毒矢',
      activations: 1,
      damage: 45,
      poisonApplied: 35,
      shield: 0,
      repair: 0,
      coinsEarned: 0,
    });
    expect(rupture).toMatchObject({ activations: 1, damage: 1430 });
    expect(report.player.skills.find((skill) => skill.blockId === 'repair-dividend')).toMatchObject({
      activations: 1,
      shield: 130,
      repair: 50,
      coinsEarned: 1,
    });
    expect(report.enemy.skills.find((skill) => skill.blockId === 'strike')).toMatchObject({
      title: '斬撃',
      activations: 1,
      damage: 190,
    });
  });
});
