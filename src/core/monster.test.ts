import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import {
  createMonster,
  definitionFor,
  experienceThresholdsFor,
  statBreakdownFor,
  statGrowthUnitsForLevel,
} from './monster';

const inheritedStats = {
  maxHp: 12,
  maxMp: 3,
  attack: 7,
  defense: 4,
  speed: 2,
  wisdom: 1,
  crit: 2,
};

describe('monster stat breakdown', () => {
  it('separates species base, level growth, individual value, and equipment in the final stat', () => {
    const monster = createMonster(GAME_DATA, 'light-dragon-1', 'breakdown', {
      colorStars: 1,
      equipmentId: 'iron-fang',
      inheritedStats,
      xp: 18,
    });
    const definition = definitionFor(GAME_DATA, monster);
    const growth = Math.floor(
      definition.growthPerLevel.attack *
        (monster.level - 1) *
        GAME_DATA.rules.breeding.colorGrowthBonus[monster.colorStars],
    );

    expect(statBreakdownFor(GAME_DATA, monster).attack).toEqual({
      base: definition.baseStats.attack,
      growth,
      individual: inheritedStats.attack,
      equipment: 5,
      total: definition.baseStats.attack + growth + inheritedStats.attack + 5,
      capped: false,
    });
  });

  it('reports the raw bonuses while marking a critical-rate total capped by the battle rule', () => {
    const monster = createMonster(GAME_DATA, 'light-dragon-1', 'critical-cap', {
      equipmentId: 'red-lens',
      inheritedStats: { ...inheritedStats, crit: 100 },
    });
    const crit = statBreakdownFor(GAME_DATA, monster).crit;

    expect(crit.individual).toBe(100);
    expect(crit.equipment).toBe(8);
    expect(crit.total).toBe(GAME_DATA.rules.battle.criticalCap);
    expect(crit.capped).toBe(true);
  });
});

describe('monster growth profiles', () => {
  it('lets every white-star-one monster reach level three after one active loss', () => {
    for (const definition of GAME_DATA.monsters.filter((monster) => monster.whiteStars === 1)) {
      const monster = createMonster(GAME_DATA, definition.id, `growth-${definition.id}`, { xp: 4 });

      expect(monster.level, definition.id).toBe(3);
      expect(experienceThresholdsFor(GAME_DATA, definition).slice(0, 3), definition.id).toEqual([0, 2, 4]);
    }
  });

  it('makes the late-bloom specimen slower after level three and much stronger near level ten', () => {
    const late = GAME_DATA.monsters.find((monster) => monster.id === 'slumbering-grove-1');
    const standard = GAME_DATA.monsters.find((monster) => monster.id === 'light-dragon-2');
    if (!late || !standard) throw new Error('Expected late and standard growth specimens');

    expect(experienceThresholdsFor(GAME_DATA, late)).toEqual([0, 2, 4, 14, 28, 46, 68, 94, 124, 158]);
    expect(statGrowthUnitsForLevel(GAME_DATA, late, 3)).toBeLessThan(statGrowthUnitsForLevel(GAME_DATA, standard, 3));
    expect(statGrowthUnitsForLevel(GAME_DATA, late, 10)).toBeGreaterThan(
      statGrowthUnitsForLevel(GAME_DATA, standard, 10),
    );
  });
});
