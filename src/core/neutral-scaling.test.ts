import { describe, expect, it } from 'vitest';
import { upgradeBlockDefinition } from './fusion';
import { effectScalingBonus } from './skill-progress';
import { GAME_DATA } from '../game/game-data';

describe('neutral high-rarity scaling ceilings', () => {
  it('stops growing after eight powered neutral nodes for normal and fused skills', () => {
    const blockIds = ['adaptive-arsenal', 'adaptive-bulwark', 'bridge-core'];

    for (const blockId of blockIds) {
      const base = GAME_DATA.blocks.find((block) => block.id === blockId)!;
      for (const block of [base, upgradeBlockDefinition(base, 1, GAME_DATA.rules.skillFusion)]) {
        const scalingEffects = block.effects.filter(
          (effect) => 'scaling' in effect && effect.scaling?.kind === 'powered-axis',
        );
        expect(scalingEffects.length, `${blockId} needs an axis scaling effect`).toBeGreaterThan(0);
        for (const effect of scalingEffects) {
          if (!('scaling' in effect) || !effect.scaling) continue;
          const atEight = effectScalingBonus(effect.scaling, {
            enemyPoison: 0,
            pathLength: 0,
            straightLineLength: 0,
            magicSigilLevel: 0,
            magicSigilCount: 0,
            adjacentBuildCounts: {},
            poweredAxisCounts: { 'trait:neutral': 8 },
          });
          const fullBoard = effectScalingBonus(effect.scaling, {
            enemyPoison: 0,
            pathLength: 0,
            straightLineLength: 0,
            magicSigilLevel: 0,
            magicSigilCount: 0,
            adjacentBuildCounts: {},
            poweredAxisCounts: { 'trait:neutral': 24 },
          });
          expect(fullBoard, `${blockId} full-board scaling`).toBe(atEight);
          expect((effect.amount + fullBoard) * GAME_DATA.rules.mergeEffectMultiplier).toBeLessThan(
            GAME_DATA.units[0].maxHp,
          );
        }
      }
    }
  });
});
