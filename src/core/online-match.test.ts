import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { createMonster } from './monster';
import {
  battleForSeat,
  continueOnlineMatch,
  createOnlineMatch,
  submitOnlineBuild,
  type OnlineBuild,
} from './online-match';

const build = (_seat: 'a' | 'b'): OnlineBuild => ({
  contentVersion: GAME_DATA.rules.contentVersion,
  active: ['light-dragon-1', 'dark-demon-1', 'fire-spirit-1'].map((definitionId, index) =>
    createMonster(GAME_DATA, definitionId, `monster-${index + 1}`),
  ),
});

describe('online match state machine', () => {
  it('waits for both builds, then resolves one authoritative deterministic battle', () => {
    const initial = createOnlineMatch(GAME_DATA.rules.contentVersion);
    const first = submitOnlineBuild(GAME_DATA, initial, 'a', build('a'), 7261);

    expect(first.ok).toBe(true);
    expect(first.state.phase).toBe('preparing');
    expect(first.state.submittedSeats).toEqual(['a']);
    expect(first.battle).toBeUndefined();

    const second = submitOnlineBuild(GAME_DATA, first.state, 'b', build('b'), 7261);
    const repeated = submitOnlineBuild(GAME_DATA, first.state, 'b', build('b'), 7261);

    expect(second.ok).toBe(true);
    expect(second.state.phase).toBe('battle');
    expect(second.state.battleNumber).toBe(1);
    expect(second.battle).toEqual(repeated.battle);
    expect(second.state.score.a + second.state.score.b + second.state.score.draws).toBe(1);
  });

  it('rejects stale content and malformed three-monster builds', () => {
    const initial = createOnlineMatch(GAME_DATA.rules.contentVersion);
    const stale = submitOnlineBuild(GAME_DATA, initial, 'a', { ...build('a'), contentVersion: 'stale-client' }, 7);
    const duplicate = build('a');
    duplicate.active[1] = duplicate.active[0]!;
    const malformed = submitOnlineBuild(GAME_DATA, initial, 'a', duplicate, 7);
    const invalidSkills = build('a');
    invalidSkills.active[0] = { ...invalidSkills.active[0]!, skillIds: ['missing', 'missing', 'missing'] };
    const unsafe = submitOnlineBuild(GAME_DATA, initial, 'a', invalidSkills, 7);

    expect(stale.ok).toBe(false);
    expect(stale.error).toContain('更新');
    expect(malformed.ok).toBe(false);
    expect(malformed.error).toContain('3体');
    expect(unsafe.ok).toBe(false);
  });

  it('personalizes team labels and restores each player’s local monster ids', () => {
    const first = submitOnlineBuild(GAME_DATA, createOnlineMatch(GAME_DATA.rules.contentVersion), 'a', build('a'), 91);
    const resolved = submitOnlineBuild(GAME_DATA, first.state, 'b', build('b'), 91);
    if (!resolved.battle) throw new Error('Expected an authoritative battle');

    const forA = battleForSeat(resolved.battle, resolved.state.builds, 'a');
    const forB = battleForSeat(resolved.battle, resolved.state.builds, 'b');

    expect(forA.result.monsterReports.filter((report) => report.team === 'player').map((report) => report.id)).toEqual([
      'monster-1',
      'monster-2',
      'monster-3',
    ]);
    expect(forB.result.monsterReports.filter((report) => report.team === 'player').map((report) => report.id)).toEqual([
      'monster-1',
      'monster-2',
      'monster-3',
    ]);
    expect(forA.opponent.every((monster) => monster.id.startsWith('opponent:'))).toBe(true);
    expect(forB.result.damageByTeam).toEqual({
      player: forA.result.damageByTeam.enemy,
      enemy: forA.result.damageByTeam.player,
    });
    expect(forB.result.winner).toBe(
      forA.result.winner === 'player' ? 'enemy' : forA.result.winner === 'enemy' ? 'player' : 'draw',
    );
  });

  it('advances only after both players continue and starts sudden death from the final builds on a tied cycle 12', () => {
    const first = submitOnlineBuild(GAME_DATA, createOnlineMatch(GAME_DATA.rules.contentVersion), 'a', build('a'), 100);
    const resolved = submitOnlineBuild(GAME_DATA, first.state, 'b', build('b'), 100);
    const tiedFinal = {
      ...resolved.state,
      cycle: GAME_DATA.rules.maxCycles,
      score: { a: 6, b: 6, draws: 0 },
    };

    const waiting = continueOnlineMatch(GAME_DATA, tiedFinal, 'a', 101);
    const suddenDeath = continueOnlineMatch(GAME_DATA, waiting.state, 'b', 101);

    expect(waiting.state.phase).toBe('battle');
    expect(suddenDeath.state.phase).toBe('battle');
    expect(suddenDeath.state.cycle).toBe(GAME_DATA.rules.maxCycles);
    expect(suddenDeath.state.suddenDeathRound).toBe(1);
    expect(suddenDeath.state.battleNumber).toBe(2);
    expect(suddenDeath.battle).toBeDefined();
  });
});
