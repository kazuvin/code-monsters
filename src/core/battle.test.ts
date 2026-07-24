import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { simulateBattle } from './battle';
import { createMonster } from './monster';

const team = (prefix: string, definitions: string[], xp = 18) =>
  definitions.map((definitionId, index) =>
    createMonster(GAME_DATA, definitionId, `${prefix}-${index}`, {
      xp,
    }),
  );

describe('deterministic 3v3 battle', () => {
  it('replays the same battle exactly from the same seed and inputs', () => {
    const input = {
      player: team('p', ['light-dragon-1', 'dark-demon-1', 'fire-spirit-1']),
      enemy: team('e', ['dark-dragon-1', 'fire-demon-1', 'light-spirit-1']),
      seed: 7261,
    };

    expect(simulateBattle(GAME_DATA, input)).toEqual(simulateBattle(GAME_DATA, input));
  });

  it('resolves a full team battle and emits serializable playback frames', () => {
    const result = simulateBattle(GAME_DATA, {
      player: team('p', ['light-dragon-1', 'dark-demon-1', 'fire-spirit-1']),
      enemy: team('e', ['dark-dragon-1', 'fire-demon-1', 'light-spirit-1']),
      seed: 18,
    });

    expect(['player', 'enemy', 'draw']).toContain(result.winner);
    expect(result.durationSeconds).toBeLessThanOrEqual(66);
    expect(result.frames.length).toBeGreaterThan(3);
    expect(result.monsterReports).toHaveLength(6);
    expect(result.monsterReports.every((report) => report.actions >= 0)).toBe(true);
    expect(result.monsterReports.reduce((total, report) => total + report.damageDealt, 0)).toBeGreaterThan(0);
    expect(
      result.monsterReports
        .filter((report) => report.team === 'player')
        .reduce((total, report) => total + report.hpDamageDealt, 0),
    ).toBe(result.damageByTeam.player);
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(result.frames.filter((frame) => frame.kind === 'action').every((frame) => frame.skillId)).toBe(true);
  });

  it('attributes damage, recovery, shielding, statuses, and skill usage to each monster', () => {
    const reportData = structuredClone(GAME_DATA);
    reportData.monsters.find((monster) => monster.id === 'light-demon-1')!.baseStats.maxMp = 200;
    reportData.monsters.find((monster) => monster.id === 'light-spirit-1')!.baseStats.maxMp = 200;
    const result = simulateBattle(reportData, {
      player: team('p', ['light-demon-1', 'light-spirit-1', 'fire-spirit-1']),
      enemy: team('e', ['dark-dragon-1', 'fire-demon-1', 'light-spirit-1']),
      seed: 211,
    });

    expect(result.monsterReports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'p-0',
          team: 'player',
          skillUses: expect.any(Object),
          statusApplications: expect.any(Object),
        }),
      ]),
    );
    expect(result.monsterReports.reduce((total, report) => total + report.healingDone, 0)).toBeGreaterThanOrEqual(0);
    expect(result.monsterReports.reduce((total, report) => total + report.shieldingDone, 0)).toBeGreaterThanOrEqual(0);
    expect(result.monsterReports.reduce((total, report) => total + report.buffApplications, 0)).toBeGreaterThan(0);
  });

  it('emits critical target ids independently from localized battle text', () => {
    const criticalData = structuredClone(GAME_DATA);
    criticalData.rules.battle.criticalCap = 100;
    for (const monster of criticalData.monsters) monster.baseStats.crit = 100;
    const result = simulateBattle(criticalData, {
      player: team('p', ['light-dragon-1', 'dark-demon-1', 'fire-spirit-1']),
      enemy: team('e', ['dark-dragon-1', 'fire-demon-1', 'light-spirit-1']),
      seed: 7261,
    });
    const criticalFrames = result.frames.filter((frame) => frame.criticalTargetIds.length > 0);

    expect(criticalFrames.length).toBeGreaterThan(0);
    expect(
      criticalFrames.every((frame) => frame.criticalTargetIds.every((targetId) => frame.targetIds.includes(targetId))),
    ).toBe(true);
  });

  it('starts exponential environment-collapse damage at 45 seconds', () => {
    const slowData = structuredClone(GAME_DATA);
    slowData.rules.battle.baseActionSeconds = 1000;
    const result = simulateBattle(slowData, {
      player: team('p', ['light-dragon-1', 'dark-demon-1', 'fire-spirit-1']),
      enemy: team('e', ['dark-dragon-1', 'fire-demon-1', 'light-spirit-1']),
      seed: 88,
    });
    const environmentFrames = result.frames.filter((frame) => frame.kind === 'environment');

    expect(environmentFrames[0]?.atSeconds).toBe(45);
    expect(environmentFrames[0]?.text).toContain('5%');
    expect(environmentFrames[1]?.text).toContain('8%');
    expect(result.durationSeconds).toBeLessThanOrEqual(66);
  });

  it('reports effective damage without counting overkill beyond remaining hp and shield', () => {
    const burstData = structuredClone(GAME_DATA);
    for (const definitionId of ['light-dragon-1', 'dark-demon-1', 'fire-spirit-1']) {
      const monster = burstData.monsters.find((entry) => entry.id === definitionId)!;
      monster.baseStats.attack = 10_000;
      monster.baseStats.speed = 1_000;
    }
    for (const definitionId of ['dark-dragon-1', 'fire-demon-1', 'light-spirit-1']) {
      const monster = burstData.monsters.find((entry) => entry.id === definitionId)!;
      monster.baseStats.maxHp = 1;
      monster.baseStats.defense = 1;
    }
    const result = simulateBattle(burstData, {
      player: team('p', ['light-dragon-1', 'dark-demon-1', 'fire-spirit-1'], 0),
      enemy: team('e', ['dark-dragon-1', 'fire-demon-1', 'light-spirit-1'], 0),
      seed: 19,
    });

    const enemyReports = result.monsterReports.filter((report) => report.team === 'enemy');
    const playerReports = result.monsterReports.filter((report) => report.team === 'player');

    expect(playerReports.reduce((total, report) => total + report.hpDamageDealt, 0)).toBe(3);
    expect(enemyReports.reduce((total, report) => total + report.damageTaken, 0)).toBe(
      3 + enemyReports.reduce((total, report) => total + report.shieldAbsorbed, 0),
    );
  });
});
