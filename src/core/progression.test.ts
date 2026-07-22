import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import {
  bodyLevelForRun,
  cumulativeBudgetForRun,
  bodyUpgradeCostForLevel,
  levelForRun,
  maxHpBonusForBodyLevel,
  rarityWeightsForLevel,
  totalBodyUpgradeCost,
} from './progression';
import { rarityRatesForPool } from './shop';

describe('run progression', () => {
  it('levels once per run until the configured cap', () => {
    expect([1, 2, 3, 9, 10].map((run) => levelForRun(GAME_DATA, run))).toEqual([1, 2, 3, 9, 9]);
  });

  it('keeps paid body upgrades separate from automatic run tiers', () => {
    expect(maxHpBonusForBodyLevel(GAME_DATA, 1)).toBe(0);
    expect(maxHpBonusForBodyLevel(GAME_DATA, 2)).toBe(GAME_DATA.rules.bodyUpgrades.hpPerLevel);
    expect(maxHpBonusForBodyLevel(GAME_DATA, GAME_DATA.rules.bodyUpgrades.maxLevel)).toBe(
      (GAME_DATA.rules.bodyUpgrades.maxLevel - 1) * GAME_DATA.rules.bodyUpgrades.hpPerLevel,
    );
    expect(bodyUpgradeCostForLevel(GAME_DATA, 1)).toBe(GAME_DATA.rules.bodyUpgrades.upgradeCosts[0]);
    expect(totalBodyUpgradeCost(GAME_DATA, 3)).toBe(
      GAME_DATA.rules.bodyUpgrades.upgradeCosts[0] + GAME_DATA.rules.bodyUpgrades.upgradeCosts[1],
    );
    expect(bodyLevelForRun(GAME_DATA, 1)).toBe(1);
    expect(bodyLevelForRun(GAME_DATA, 9)).toBeLessThanOrEqual(GAME_DATA.rules.bodyUpgrades.maxLevel);
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

  it('improves the actual high-rarity shop rate with each paid body level', () => {
    const shopBlocks = GAME_DATA.blocks.filter((block) => block.price > 0);
    const rates = [1, 2, 3, 4, 5, 6].map((bodyLevel) =>
      rarityRatesForPool(shopBlocks, rarityWeightsForLevel(GAME_DATA, bodyLevel)),
    );

    rates.slice(1).forEach((current, index) => {
      const previous = rates[index];
      expect(current.epic + current.legendary).toBeGreaterThan(previous.epic + previous.legendary);
      expect(current.common).toBeLessThan(previous.common);
    });
  });

  it('uses the average configured battle reward for a standard simulation budget', () => {
    expect(cumulativeBudgetForRun(GAME_DATA, 1)).toBe(32);
    expect(cumulativeBudgetForRun(GAME_DATA, 2)).toBe(42);
    expect(cumulativeBudgetForRun(GAME_DATA, 5)).toBe(72);
  });
});
