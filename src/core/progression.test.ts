import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { cumulativeBudgetForRun, levelForRun, maxHpBonusForLevel, rarityWeightsForLevel } from './progression';

describe('run progression', () => {
  it('levels once per run until the configured cap', () => {
    expect([1, 2, 3, 9, 10].map((run) => levelForRun(GAME_DATA, run))).toEqual([1, 2, 3, 9, 9]);
  });

  it('raises both combatant health as the level rises', () => {
    expect(maxHpBonusForLevel(GAME_DATA, 1)).toBe(0);
    expect(maxHpBonusForLevel(GAME_DATA, 2)).toBe(2500);
    expect(maxHpBonusForLevel(GAME_DATA, 9)).toBe(20_000);
  });

  it('shifts shop weight from common skills toward high rarities', () => {
    const level1 = rarityWeightsForLevel(GAME_DATA, 1);
    const level9 = rarityWeightsForLevel(GAME_DATA, 9);
    const highRarityShare = (weights: typeof level1) =>
      (weights.epic + weights.legendary) / (weights.common + weights.rare + weights.epic + weights.legendary);

    expect(level1).toEqual(GAME_DATA.rules.rarityWeights);
    expect(level9.common).toBeLessThan(level1.common);
    expect(level9.legendary).toBeGreaterThan(level1.legendary);
    expect(highRarityShare(level9)).toBeGreaterThan(highRarityShare(level1));
  });

  it('uses the average configured battle reward for a standard simulation budget', () => {
    expect(cumulativeBudgetForRun(GAME_DATA, 1)).toBe(32);
    expect(cumulativeBudgetForRun(GAME_DATA, 2)).toBe(42);
    expect(cumulativeBudgetForRun(GAME_DATA, 5)).toBe(72);
  });
});
