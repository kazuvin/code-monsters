import { describe, expect, it } from 'vitest';
import { createPowerFormulaReport } from './power-formula';
import { renderPowerFormulaCsv, renderPowerFormulaMarkdown } from './power-formula-report';
import { GAME_DATA } from '../game/game-data';

describe('power formula report', () => {
  it('documents the equations, condition weights, reference DPS, and every playable skill', () => {
    const report = createPowerFormulaReport(GAME_DATA);
    const markdown = renderPowerFormulaMarkdown(report);

    expect(markdown).toContain('シミュレーションではない');
    expect(markdown).toContain('targetCVPS = rarityTargetCVPS × price / rarityReferencePrice');
    expect(markdown).toContain('conditionRewardMultiplier = 1 / conditionAvailability');
    expect(markdown).toContain('| 超過解放砲 | legendary |');
    expect(markdown).toContain('charge=5');
  });

  it('exports comparison columns to CSV', () => {
    const csv = renderPowerFormulaCsv(createPowerFormulaReport(GAME_DATA));

    expect(csv.split('\n')[0]).toContain('referenceOffensePerSecond');
    expect(csv.split('\n')[0]).toContain('weightedCombatValuePerSecond');
    expect(csv.split('\n')[0]).toContain('budgetRatio');
    expect(csv).toContain('overcharge-cannon,超過解放砲');
  });
});
