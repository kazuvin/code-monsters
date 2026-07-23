import { createMonster } from './monster';
import { createSeededRandom, deriveSeed } from './rng';
import type { GameData, MonsterInstance, StatBlock, WhiteStars } from './types';

const starsForCycle = (cycle: number): WhiteStars[] => {
  if (cycle <= 2) return [1, 1, 1];
  if (cycle <= 5) return [1, 1, 2];
  if (cycle <= 8) return [2, 2, 2];
  if (cycle <= 10) return [2, 2, 3];
  return [2, 3, 3];
};

export function createGhostTeam(data: GameData, cycle: number, seed: number): MonsterInstance[] {
  const random = createSeededRandom(deriveSeed(seed, cycle * 97));
  const level = Math.min(data.rules.maxLevel, 1 + Math.floor((cycle - 1) / 2));
  const xp = data.rules.levelThresholds[level - 1] ?? 0;
  return starsForCycle(cycle).map((whiteStars, index) => {
    const pool = data.monsters.filter((monster) => monster.whiteStars === whiteStars);
    const definition = random.pick(pool);
    const inheritance = Math.floor(Math.max(0, cycle - 4) / 3);
    const inheritedStats: StatBlock = {
      maxHp: inheritance * 4,
      maxMp: inheritance,
      attack: inheritance,
      defense: inheritance,
      speed: inheritance,
      wisdom: inheritance,
      crit: 0,
    };
    return createMonster(data, definition.id, `ghost-${cycle}-${index}`, {
      xp,
      inheritedStats,
    });
  });
}
