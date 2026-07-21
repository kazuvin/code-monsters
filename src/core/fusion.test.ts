import { describe, expect, it } from 'vitest';
import { fuseSkillCopies, pickFusionRewardIds, upgradeBlockDefinition } from './fusion';
import type { BlockDefinition, CircuitBoard, SkillFusionRules } from './types';

const rules: SkillFusionRules = {
  copiesRequired: 3,
  rewardChoices: 3,
  effectMultiplier: 1.5,
  cooldownReduction: 1,
};

describe('skill fusion', () => {
  it('consumes three normal copies across board and rack and keeps a starred board copy', () => {
    const board: CircuitBoard = [
      [
        { blockId: 'strike', rotation: 0 },
        { blockId: 'strike', rotation: 1 },
      ],
      [null, null],
    ];
    const result = fuseSkillCopies(board, [{ blockId: 'strike', rotation: 2 }], 'strike', rules.copiesRequired);

    expect(result?.board[0][0]).toEqual({ blockId: 'strike', rotation: 0, stars: 1 });
    expect(result?.board[0][1]).toBeNull();
    expect(result?.rack).toEqual([]);
  });

  it('does not count an already starred skill as a normal fusion copy', () => {
    const board: CircuitBoard = [[{ blockId: 'strike', rotation: 0, stars: 1 }]];

    expect(
      fuseSkillCopies(
        board,
        [
          { blockId: 'strike', rotation: 1 },
          { blockId: 'strike', rotation: 2 },
        ],
        'strike',
        rules.copiesRequired,
      ),
    ).toBeNull();
  });

  it('upgrades effect parameters and cooldown without changing topology thresholds', () => {
    const block: BlockDefinition = {
      id: 'lance',
      code: 'LNC',
      title: '槍',
      description: '試験用。',
      glyph: '槍',
      price: 1,
      rarity: 'legendary',
      ports: ['west', 'east'],
      cooldown: 3,
      effects: [
        {
          kind: 'damage',
          amount: 100,
          scaling: { kind: 'straight-line', every: 2, amount: 40 },
          trigger: { kind: 'straight-line-at-least', amount: 5 },
        },
      ],
    };

    const upgraded = upgradeBlockDefinition(block, 1, rules);

    expect(upgraded.cooldown).toBe(2);
    expect(upgraded.effects[0]).toEqual({
      kind: 'damage',
      amount: 150,
      scaling: { kind: 'straight-line', every: 2, amount: 60 },
      trigger: { kind: 'straight-line-at-least', amount: 5 },
    });
  });

  it('offers three deterministic unique rewards from the fused rarity', () => {
    const blocks = Array.from(
      { length: 5 },
      (_, index): BlockDefinition => ({
        id: `rare-${index}`,
        code: `R${index}`,
        title: `レア${index}`,
        description: '試験用。',
        glyph: String(index),
        price: 1,
        rarity: 'rare',
        ports: ['west'],
        effects: [{ kind: 'damage', amount: 1 }],
      }),
    );

    const choices = pickFusionRewardIds(blocks, 'rare', 42, rules.rewardChoices);

    expect(choices).toEqual(pickFusionRewardIds(blocks, 'rare', 42, rules.rewardChoices));
    expect(choices).toHaveLength(3);
    expect(new Set(choices).size).toBe(3);
  });
});
