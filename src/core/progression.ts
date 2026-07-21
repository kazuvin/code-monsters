import type { GameData, Rarity, RarityWeights } from './types';

const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export function levelForRun(data: GameData, run: number): number {
  const safeRun = Math.max(1, Math.floor(run));
  const rules = data.rules.levelProgression;
  return Math.min(rules.maxLevel, 1 + Math.floor((safeRun - 1) / rules.runsPerLevel));
}

export function maxHpBonusForLevel(data: GameData, level: number): number {
  const safeLevel = Math.min(data.rules.levelProgression.maxLevel, Math.max(1, Math.floor(level)));
  return (safeLevel - 1) * data.rules.levelProgression.hpPerLevel;
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
