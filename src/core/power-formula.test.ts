import { describe, expect, it } from 'vitest';
import { assessSkillPower, conditionAvailability, createPowerFormulaReport } from './power-formula';
import type { BlockDefinition } from './types';
import { GAME_DATA } from '../game/game-data';

describe('deterministic skill power formula', () => {
  it('rewards harder straight-line requirements with a larger inverse difficulty multiplier', () => {
    const formula = GAME_DATA.rules.balanceFormula;
    const short = conditionAvailability({ kind: 'straight-line-at-least', amount: 3 }, 2, formula);
    const long = conditionAvailability({ kind: 'straight-line-at-least', amount: 5 }, 2, formula);

    expect(short).toBeGreaterThan(long);
    expect(1 / long).toBeGreaterThan(1 / short);
    expect(long).toBeGreaterThanOrEqual(formula.conditionAvailability.minimum);
  });

  it('converts beats to seconds before calculating DPS', () => {
    const block: BlockDefinition = {
      id: 'formula-damage',
      code: 'DMG',
      title: '式ダメージ',
      description: '試験用。',
      glyph: '式',
      price: 5,
      rarity: 'common',
      ports: ['west'],
      rotatable: false,
      cooldown: 2,
      effects: [{ kind: 'damage', amount: 100 }],
    };

    const result = assessSkillPower(GAME_DATA, block);

    expect(result.cooldownSeconds).toBe(1);
    expect(result.referenceOffensePerSecond).toBe(100);
    expect(result.effects[0]).toMatchObject({ rawCvps: 100, weightedCvps: 100, conditionAvailability: 1 });
  });

  it('discounts conditional output without changing its all-conditions-met DPS', () => {
    const block: BlockDefinition = {
      id: 'formula-seal',
      code: 'SEAL',
      title: '式結界',
      description: '試験用。',
      glyph: '式',
      price: 13,
      rarity: 'epic',
      ports: ['west', 'north', 'east', 'south'],
      rotatable: false,
      cooldown: 2,
      effects: [
        { kind: 'shield', amount: 100 },
        { kind: 'shield', amount: 400, trigger: { kind: 'all-ports-connected' } },
      ],
    };

    const result = assessSkillPower(GAME_DATA, block);
    const conditional = result.effects[1];

    expect(conditional.rawCvps).toBe(360);
    expect(conditional.weightedCvps).toBeLessThan(conditional.rawCvps);
    expect(conditional.rewardMultiplier).toBeCloseTo(1 / conditional.conditionAvailability, 6);
    expect(result.referenceDefensePerSecond).toBe(450);
  });

  it('reports charge-release DPS at the declared reference charge without double-counting all variable power', () => {
    const block = GAME_DATA.blocks.find((candidate) => candidate.id === 'overcharge-cannon')!;
    const result = assessSkillPower(GAME_DATA, block);

    expect(result.referenceOffensePerSecond).toBe(1176);
    expect(result.weightedCombatValuePerSecond).toBeLessThan(result.referenceOffensePerSecond);
    expect(result.effects[0].formula).toContain('charge=5');
  });

  it('covers every playable skill and reports normal and fused values without running battles', () => {
    const report = createPowerFormulaReport(GAME_DATA);
    const playableIds = GAME_DATA.buildDesign.skills
      .filter((skill) => skill.status === 'playable')
      .map((skill) => skill.blockId)
      .sort();

    expect(report.skills.map((skill) => skill.blockId).sort()).toEqual(playableIds);
    expect(report.skills.every((skill) => Number.isFinite(skill.budgetRatio))).toBe(true);
    expect(
      report.skills.find((skill) => skill.blockId === 'strike')?.fused.weightedCombatValuePerSecond,
    ).toBeGreaterThan(report.skills.find((skill) => skill.blockId === 'strike')!.weightedCombatValuePerSecond);
  });

  it('makes every neutral fusion stronger while keeping its deterministic gain restrained', () => {
    const report = createPowerFormulaReport(GAME_DATA);
    const neutralIds = new Set(
      GAME_DATA.buildDesign.skills
        .filter((skill) => skill.axisLinks.some((link) => link.axisId === 'trait' && link.valueIds.includes('neutral')))
        .map((skill) => skill.blockId),
    );
    const gains = report.skills
      .filter((skill) => neutralIds.has(skill.blockId))
      .map((skill) => [skill.blockId, skill.fused.gainOverNormal] as const);

    expect(gains.every(([, gain]) => gain > 1 && gain < 1.8)).toBe(true);
  });

  it('keeps every playable skill inside the declared deterministic power budget', () => {
    const report = createPowerFormulaReport(GAME_DATA);

    expect(report.chargeMarginalCvps).toBe(130);
    expect(
      report.skills
        .filter((skill) => skill.budgetStatus !== 'in-range')
        .map((skill) => ({ blockId: skill.blockId, ratio: skill.budgetRatio, status: skill.budgetStatus })),
    ).toEqual([]);
  });
});
