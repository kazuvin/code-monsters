import type { GameData, Rarity, RarityWeights } from './types';

const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export function levelForRun(data: GameData, run: number): number {
  const safeRun = Math.max(1, Math.floor(run));
  const rules = data.rules.levelProgression;
  return Math.min(rules.maxLevel, 1 + Math.floor((safeRun - 1) / rules.runsPerLevel));
}

const safeBodyLevel = (data: GameData, level: number) =>
  Math.min(data.rules.bodyUpgrades.maxLevel, Math.max(1, Math.floor(level)));

export function maxHpBonusForBodyLevel(data: GameData, level: number): number {
  return (safeBodyLevel(data, level) - 1) * data.rules.bodyUpgrades.hpPerLevel;
}

export function bodyUpgradeCostForLevel(data: GameData, level: number): number | null {
  const safeLevel = safeBodyLevel(data, level);
  return safeLevel >= data.rules.bodyUpgrades.maxLevel ? null : data.rules.bodyUpgrades.upgradeCosts[safeLevel - 1];
}

export function totalBodyUpgradeCost(data: GameData, level: number): number {
  return data.rules.bodyUpgrades.upgradeCosts
    .slice(0, safeBodyLevel(data, level) - 1)
    .reduce((total, cost) => total + cost, 0);
}

export function bodyLevelForRun(data: GameData, run: number): number {
  const safeRun = Math.max(1, Math.floor(run));
  return Math.min(
    data.rules.bodyUpgrades.maxLevel,
    1 + Math.floor((safeRun - 1) / data.rules.bodyUpgrades.rivalRunsPerLevel),
  );
}

export function rarityWeightsForLevel(data: GameData, level: number): RarityWeights {
  const safeLevel = Math.min(data.rules.levelProgression.maxLevel, Math.max(1, Math.floor(level)));
  const steps = safeLevel - 1;
  return Object.fromEntries(
    RARITIES.map((rarity) => [
      rarity,
      data.rules.rarityWeights[rarity] * data.rules.levelProgression.rarityWeightMultiplierPerLevel[rarity] ** steps,
    ]),
  ) as RarityWeights;
}

export function cumulativeBudgetForRun(data: GameData, run: number): number {
  const safeRun = Math.max(1, Math.floor(run));
  const averageReward = Math.round((data.rules.winReward + data.rules.retryReward) / 2);
  return data.rules.startingCoins + (safeRun - 1) * averageReward;
}
