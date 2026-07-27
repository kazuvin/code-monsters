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
    for (const skill of criticalData.skills) {
      for (const effect of skill.effects) {
        if (effect.kind === 'damage') effect.canCrit = true;
      }
    }
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

  it('emits trait and equipment start effects in descending initial-speed order', () => {
    const startData = structuredClone(GAME_DATA);
    const playerIds = ['light-dragon-1', 'dark-demon-1', 'fire-spirit-1'];
    const enemyIds = ['dark-dragon-1', 'fire-demon-1', 'light-spirit-1'];
    const allIds = [...playerIds, ...enemyIds];
    const speeds = [12, 52, 22, 42, 32, 62];
    for (const [index, definitionId] of allIds.entries()) {
      const monster = startData.monsters.find((entry) => entry.id === definitionId);
      if (!monster) throw new Error(`Expected ${definitionId}`);
      monster.baseStats.speed = speeds[index] as number;
      const trait = startData.traits.find((entry) => entry.id === monster.traitId);
      if (!trait) throw new Error(`Expected ${monster.traitId}`);
      trait.stages[0].battleStartEffects = [{ kind: 'shield', maxHpPercent: 5, target: 'self' }];
    }
    const result = simulateBattle(startData, {
      player: team('p', playerIds, 0).map((monster) => ({ ...monster, equipmentId: 'opening-drum' })),
      enemy: team('e', enemyIds, 0).map((monster) => ({ ...monster, equipmentId: 'opening-drum' })),
      seed: 902,
    });
    const startFrames = result.frames.filter((frame) => frame.kind === 'battle-start-effect');

    expect(result.frames[0]?.kind).toBe('start');
    expect(startFrames.map((frame) => frame.actorId)).toEqual([
      'e-2',
      'e-2',
      'p-1',
      'p-1',
      'e-0',
      'e-0',
      'e-1',
      'e-1',
      'p-2',
      'p-2',
      'p-0',
      'p-0',
    ]);
    expect(startFrames.map((frame) => frame.battleStartSource?.kind)).toEqual([
      'trait',
      'equipment',
      'trait',
      'equipment',
      'trait',
      'equipment',
      'trait',
      'equipment',
      'trait',
      'equipment',
      'trait',
      'equipment',
    ]);
    expect(startFrames.every((frame) => frame.targetIds.length > 0 && frame.text.includes('発動'))).toBe(true);
  });

  it('executes the configured matching skill and records it in battle reports', () => {
    const configuredData = structuredClone(GAME_DATA);
    const casterDefinition = configuredData.monsters.find((monster) => monster.id === 'dark-demon-2');
    if (!casterDefinition) throw new Error('Expected dark-demon-2');
    casterDefinition.baseStats.maxHp = 1_000;
    casterDefinition.baseStats.speed = 1_000;
    const caster = createMonster(configuredData, 'dark-demon-2', 'configured-caster', {
      gambits: [
        {
          condition: { kind: 'enemy-lacks-status', statusId: 'silence' },
          action: { skillId: 'silence-mark', target: 'highest-attack-enemy' },
        },
        {
          condition: { kind: 'always' },
          action: { skillId: 'normal-attack', target: 'random-enemy' },
        },
      ],
    });
    const result = simulateBattle(configuredData, {
      player: [caster, ...team('p', ['light-dragon-1', 'fire-spirit-1'], 0)],
      enemy: team('e', ['dark-dragon-1', 'fire-demon-1', 'light-spirit-1'], 0),
      seed: 1337,
    });
    const report = result.monsterReports.find((entry) => entry.id === caster.id);

    expect(report?.skillUses['silence-mark']).toBeGreaterThan(0);
    expect(
      result.frames.some(
        (frame) => frame.kind === 'action' && frame.actorId === caster.id && frame.skillId === 'silence-mark',
      ),
    ).toBe(true);
  });

  it('supports shield-spending attacks and explicit recoil as reusable effects', () => {
    const peakData = structuredClone(GAME_DATA);
    const haloBite = peakData.skills.find((skill) => skill.id === 'halo-bite');
    const haku = peakData.monsters.find((monster) => monster.id === 'light-dragon-1');
    const trait = peakData.traits.find((entry) => entry.id === haku?.traitId);
    if (!haloBite || !haku || !trait) throw new Error('Expected Haku peak mechanics');
    haloBite.mpCost = 0;
    haloBite.effects = [
      { kind: 'shield-burst', power: 160, target: 'action-target' },
      { kind: 'recoil', maxHpPercent: 10, target: 'self' },
    ] as typeof haloBite.effects;
    trait.stages[0].battleStartEffects = [{ kind: 'shield', maxHpPercent: 30, target: 'self' }];
    haku.baseStats.speed = 200;
    const caster = createMonster(peakData, haku.id, 'peak-caster', {
      gambits: [
        {
          condition: { kind: 'self-shield-above', threshold: 25 },
          action: { skillId: 'halo-bite', target: 'highest-hp-enemy' },
        },
        {
          condition: { kind: 'always' },
          action: { skillId: 'normal-attack', target: 'random-enemy' },
        },
      ],
    });
    const result = simulateBattle(peakData, {
      player: [caster, ...team('p', ['light-dragon-1', 'light-dragon-1'], 0)],
      enemy: team('e', ['light-dragon-1', 'light-dragon-1', 'light-dragon-1'], 0),
      seed: 144,
    });
    const actionFrame = result.frames.find(
      (frame) => frame.kind === 'action' && frame.actorId === caster.id && frame.skillId === 'halo-bite',
    );
    const report = result.monsterReports.find((entry) => entry.id === caster.id);

    expect(actionFrame?.text).toContain('盾');
    expect(actionFrame?.text).toContain('反動');
    expect(report?.skillBreakdown['halo-bite']?.damage).toBeGreaterThan(0);
  });
});
