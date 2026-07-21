import { describe, expect, it } from 'vitest';
import { summarizeSkillGrowth } from './skill-progress';
import type { BlockDefinition } from './types';

const block = (effects: BlockDefinition['effects']): BlockDefinition => ({
  id: 'test-skill',
  code: 'TEST',
  title: 'テスト技',
  description: 'テスト用',
  glyph: '試',
  price: 1,
  rarity: 'common',
  inputPorts: ['west'],
  outputPorts: ['east'],
  effects,
  cooldown: 1,
});

describe('skill growth progress', () => {
  it('shows the current effect and next milestone for self-growth scaling', () => {
    const result = summarizeSkillGrowth(
      block([{ kind: 'poison', amount: 1, scaling: { kind: 'self-growth', every: 2, amount: 1 } }]),
      5,
    );

    expect(result).toEqual({
      growth: 5,
      nextGrowthAt: 6,
      effects: [{ effectIndex: 0, baseAmount: 1, growthBonus: 2, currentAmount: 3 }],
    });
  });

  it('keeps accumulated growth visible when a skill does not convert it yet', () => {
    const result = summarizeSkillGrowth(block([{ kind: 'damage', amount: 2 }]), 4);

    expect(result).toEqual({ growth: 4, nextGrowthAt: null, effects: [] });
  });

  it('normalizes missing or invalid growth to zero', () => {
    const skill = block([{ kind: 'shield', amount: 2, scaling: { kind: 'self-growth', every: 3, amount: 2 } }]);

    expect(summarizeSkillGrowth(skill, Number.NaN).growth).toBe(0);
    expect(summarizeSkillGrowth(skill, -2).growth).toBe(0);
  });
});
