import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { createRivalBuild } from './rival';

describe('rival run builder', () => {
  it('builds a deterministic cycle team through the same serialized run rules', () => {
    const first = createRivalBuild(GAME_DATA, 9, 401);
    const second = createRivalBuild(GAME_DATA, 9, 401);

    expect(first).toEqual(second);
    expect(first.run.phase).toBe('prepare');
    expect(first.run.cycle).toBe(9);
    expect(first.run.completedCycles).toBe(8);
    expect(first.team).toHaveLength(3);
    expect(first.run.activeIds).toEqual(first.team.map((monster) => monster.id));
    expect(first.run.roster.length).toBeLessThanOrEqual(GAME_DATA.rules.rosterLimit);
    expect(first.run.coins).toBeGreaterThanOrEqual(0);
  });

  it('uses legal purchases, equipment, rerolls, events, and breeding across seeded journeys', () => {
    const builds = Array.from({ length: 24 }, (_, seed) => createRivalBuild(GAME_DATA, 12, 800 + seed));
    const totals = builds.reduce(
      (summary, build) => ({
        monsterPurchases: summary.monsterPurchases + build.audit.monsterPurchases,
        equipmentPurchases: summary.equipmentPurchases + build.audit.equipmentPurchases,
        rerolls: summary.rerolls + build.audit.rerolls,
        events: summary.events + build.audit.events,
        breeds: summary.breeds + build.audit.breeds,
      }),
      { monsterPurchases: 0, equipmentPurchases: 0, rerolls: 0, events: 0, breeds: 0 },
    );

    expect(totals.monsterPurchases).toBeGreaterThan(0);
    expect(totals.equipmentPurchases).toBeGreaterThan(0);
    expect(totals.rerolls).toBeGreaterThan(0);
    expect(totals.events).toBeGreaterThan(0);
    expect(totals.breeds).toBeGreaterThan(0);
    expect(
      builds.every((build) =>
        build.team.every(
          (monster) =>
            !monster.equipmentId || GAME_DATA.equipment.some((equipment) => equipment.id === monster.equipmentId),
        ),
      ),
    ).toBe(true);
  });
});
