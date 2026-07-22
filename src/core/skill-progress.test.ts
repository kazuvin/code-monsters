import { describe, expect, it } from 'vitest';
import { analyzeCircuit } from './circuit';
import {
  buffStatsForBlock,
  effectScalingBonus,
  incomingSkillModifiers,
  summarizeSkillProgress,
} from './skill-progress';
import type { BlockDefinition, CircuitBoard } from './types';

const block = (effects: BlockDefinition['effects']): BlockDefinition => ({
  id: 'test-skill',
  code: 'TEST',
  title: 'テスト技',
  description: 'テスト用。',
  glyph: '試',
  price: 1,
  rarity: 'common',
  ports: ['west', 'east'],
  effects,
  cooldown: 1,
});

describe('skill progress', () => {
  it('reports exactly which effects were buffed and their current values', () => {
    const result = summarizeSkillProgress(
      block([
        { kind: 'damage', amount: 2 },
        { kind: 'poison', amount: 1 },
      ]),
      { poison: 3 },
      { effectPower: 2, cooldownReduction: 0 },
    );

    expect(result.effects).toEqual([
      {
        effectIndex: 0,
        stat: 'damage',
        baseAmount: 2,
        battleBuff: 0,
        circuitBoost: 2,
        scalingBonus: 0,
        currentAmount: 4,
      },
      {
        effectIndex: 1,
        stat: 'poison',
        baseAmount: 1,
        battleBuff: 3,
        circuitBoost: 2,
        scalingBonus: 0,
        currentAmount: 6,
      },
    ]);
  });

  it('includes rupture damage per stack as a buffable effect', () => {
    const skill = block([{ kind: 'rupture-poison', fraction: 0.5, damagePerStack: 3 }]);

    expect(buffStatsForBlock(skill)).toEqual(['rupture']);
    expect(summarizeSkillProgress(skill, { rupture: 1 }).effects[0]?.currentAmount).toBe(4);
  });

  it('scales from any powered build-axis value without hard-coding neutral as a special build', () => {
    expect(
      effectScalingBonus(
        {
          kind: 'powered-axis',
          axisId: 'trait',
          valueId: 'neutral',
          every: 2,
          amount: 30,
        } as never,
        {
          enemyPoison: 0,
          pathLength: 0,
          straightLineLength: 0,
          magicSigilLevel: 0,
          magicSigilCount: 0,
          adjacentBuildCounts: {},
          poweredAxisCounts: { 'trait:neutral': 5 },
        } as never,
      ),
    ).toBe(60);
  });

  it('caps powered-axis scaling so a single-axis board cannot grow without limit', () => {
    expect(
      effectScalingBonus(
        {
          kind: 'powered-axis',
          axisId: 'trait',
          valueId: 'neutral',
          every: 2,
          amount: 30,
          maxStacks: 3,
        } as never,
        {
          enemyPoison: 0,
          pathLength: 0,
          straightLineLength: 0,
          magicSigilLevel: 0,
          magicSigilCount: 0,
          adjacentBuildCounts: {},
          poweredAxisCounts: { 'trait:neutral': 20 },
        },
      ),
    ).toBe(90);
  });

  it('reads amplifier and accelerator effects only from powered connected inputs', () => {
    const blocks = [
      { ...block([{ kind: 'amplify', amount: 2 }]), id: 'amp' },
      { ...block([{ kind: 'haste', amount: 1 }]), id: 'fast' },
      { ...block([{ kind: 'damage', amount: 2 }]), id: 'strike', ports: ['west', 'east', 'north'] as const },
    ] satisfies BlockDefinition[];
    const board: CircuitBoard = [
      [null, { blockId: 'fast', rotation: 0 }],
      [
        { blockId: 'amp', rotation: 0 },
        { blockId: 'strike', rotation: 0 },
      ],
    ];

    const analysis = analyzeCircuit(board, blocks, 1);
    expect(incomingSkillModifiers(board, blocks, analysis, { row: 1, column: 1 })).toEqual({
      effectPower: 2,
      cooldownReduction: 0,
    });
  });
});
