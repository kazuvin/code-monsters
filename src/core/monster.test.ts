import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import {
  createMonster,
  definitionFor,
  experienceThresholdsFor,
  statBreakdownFor,
  statGrowthUnitsForLevel,
  targetRulesForSkill,
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
        statGrowthUnitsForLevel(GAME_DATA, definition, monster.level) *
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

  it('keeps late bloom near the normal level pace while back-loading stat growth', () => {
    const late = GAME_DATA.monsters.find((monster) => monster.id === 'slumbering-grove-1');
    const standard = GAME_DATA.monsters.find((monster) => monster.id === 'light-dragon-2');
    if (!late || !standard) throw new Error('Expected late and standard growth specimens');

    expect(experienceThresholdsFor(GAME_DATA, late)).toEqual([0, 2, 4, 12, 24, 39, 57, 78, 102, 129]);
    expect(statGrowthUnitsForLevel(GAME_DATA, late, 3)).toBeLessThan(statGrowthUnitsForLevel(GAME_DATA, standard, 3));
    expect(statGrowthUnitsForLevel(GAME_DATA, late, 3)).toBeGreaterThanOrEqual(1.5);
    expect(statGrowthUnitsForLevel(GAME_DATA, late, 10)).toBeGreaterThan(
      statGrowthUnitsForLevel(GAME_DATA, standard, 10),
    );
  });

  it('adds late stat growth to existing rank-one monsters without slowing their early experience', () => {
    for (const definitionId of ['light-dragon-1', 'dark-demon-1', 'fire-spirit-1']) {
      const definition = GAME_DATA.monsters.find((monster) => monster.id === definitionId);
      if (!definition) throw new Error(`Expected ${definitionId}`);

      expect(definition.experienceProfileId, definitionId).toBe('early');
      expect(definition.statGrowthProfileId, definitionId).toBe('late-surge');
      expect(definition.roleTagIds, definitionId).toContain('late-bloom');
    }
  });
});

describe('default gambits', () => {
  it('gives every species executable target rules for all configured skills', () => {
    for (const definition of GAME_DATA.monsters) {
      const monster = createMonster(GAME_DATA, definition.id, `default-gambit-${definition.id}`);

      for (const [index, rule] of monster.gambits.entries()) {
        expect(
          targetRulesForSkill(GAME_DATA, rule.action.skillId),
          `${definition.id} gambit ${index + 1}: ${rule.action.skillId} -> ${rule.action.target}`,
        ).toContain(rule.action.target);
      }
    }
  });
});
