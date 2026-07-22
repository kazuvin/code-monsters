import { describe, expect, it } from 'vitest';
import { analyzeCircuit, analyzeMagicSigils, countActiveMagicSigils } from './circuit';
import { createBattle, resolveTick } from './battle';
import { magicSigilModifiers } from './skill-progress';
import type { BlockDefinition, CircuitBoard, MagicSigilRules, SkillFusionRules } from './types';
import { GAME_DATA } from '../game/game-data';

const sigilRules: MagicSigilRules = {
  maxLevel: 3,
  effectPowerPerLevel: 15,
  hasteLevel: 3,
  cooldownReduction: 1,
};

const fusionRules: SkillFusionRules = {
  copiesRequired: 3,
  rewardChoices: 3,
  effectMultiplier: 1.5,
  cooldownReduction: 1,
};

const blocks: BlockDefinition[] = [
  {
    id: 'branch-source',
    code: 'BR',
    title: '分岐源',
    description: '右のマスへ魔紋を刻む。',
    glyph: '刻',
    price: 4,
    rarity: 'common',
    ports: ['west', 'north', 'east'],
    effects: [{ kind: 'inscribe-magic-sigil', amount: 1, offsets: [{ row: 0, column: 1 }] }],
  },
  {
    id: 'bridge',
    code: 'BG',
    title: '橋',
    description: '回路をつなぐ。',
    glyph: '橋',
    price: 4,
    rarity: 'common',
    ports: ['south', 'east'],
    effects: [{ kind: 'shield', amount: 1 }],
    cooldown: 1,
  },
  {
    id: 'focus-source',
    code: 'FC',
    title: '集束源',
    description: '下のマスへ二重の魔紋を刻む。',
    glyph: '集',
    price: 8,
    rarity: 'rare',
    ports: ['west', 'south'],
    effects: [{ kind: 'inscribe-magic-sigil', amount: 2, offsets: [{ row: 1, column: 0 }] }],
  },
  {
    id: 'target',
    code: 'TG',
    title: '対象',
    description: '魔紋の強化を受ける。',
    glyph: '技',
    price: 5,
    rarity: 'common',
    ports: ['west', 'east'],
    effects: [{ kind: 'damage', amount: 10 }],
    cooldown: 3,
  },
];

const board = (): CircuitBoard => [
  [{ blockId: 'bridge', rotation: 0 }, { blockId: 'focus-source', rotation: 0 }, null],
  [{ blockId: 'branch-source', rotation: 0 }, { blockId: 'target', rotation: 0 }, null],
  [null, null, null],
];

describe('magic sigils', () => {
  it('layers powered inscriptions on board cells and caps their level', () => {
    const circuit = analyzeCircuit(board(), blocks, 1);
    const sigils = analyzeMagicSigils(board(), blocks, circuit, fusionRules, sigilRules);

    expect(sigils.levels.get('1:1')).toBe(3);
    expect(sigils.sources.get('1:1')).toEqual(['0:1', '1:0']);
    expect(sigils.targets.get('0:1')).toEqual(['1:1']);
    expect(sigils.targets.get('1:0')).toEqual(['1:1']);
    expect(countActiveMagicSigils(board(), circuit, sigils)).toBe(1);
  });

  it('ignores inscriptions from a source that is not powered', () => {
    const disconnected = board();
    disconnected[0][0] = null;
    const circuit = analyzeCircuit(disconnected, blocks, 1);
    const sigils = analyzeMagicSigils(disconnected, blocks, circuit, fusionRules, sigilRules);

    expect(sigils.levels.get('1:1')).toBe(1);
    expect(sigils.sources.get('1:1')).toEqual(['1:0']);
  });

  it('turns each level into effect power and unlocks haste at level three', () => {
    expect(magicSigilModifiers(0, sigilRules)).toEqual({ effectPower: 0, cooldownReduction: 0 });
    expect(magicSigilModifiers(2, sigilRules)).toEqual({ effectPower: 30, cooldownReduction: 0 });
    expect(magicSigilModifiers(3, sigilRules)).toEqual({ effectPower: 45, cooldownReduction: 1 });
  });

  it('boosts any active skill placed on an inscribed cell', () => {
    const playerBoard: CircuitBoard = Array.from({ length: GAME_DATA.rules.boardSize }, () =>
      Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
    );
    const enemyBoard: CircuitBoard = Array.from({ length: GAME_DATA.rules.boardSize }, () =>
      Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
    );
    playerBoard[2][0] = { blockId: 'inscription-stone', rotation: 0 };
    playerBoard[2][1] = { blockId: 'sigil-blade', rotation: 0 };

    const result = resolveTick(GAME_DATA, createBattle(GAME_DATA, playerBoard, enemyBoard), 1);
    const blade = result.trace.find(
      (event) => 'blockId' in event && event.blockId === 'sigil-blade' && event.kind === 'damage',
    );

    expect(blade).toMatchObject({ value: 125, row: 2, column: 1 });
  });

  it('keeps the fused level-three focus finisher below a deterministic ceiling', () => {
    const playerBoard: CircuitBoard = Array.from({ length: GAME_DATA.rules.boardSize }, () =>
      Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
    );
    const enemyBoard: CircuitBoard = Array.from({ length: GAME_DATA.rules.boardSize }, () =>
      Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
    );
    playerBoard[2][0] = { blockId: 'guiding-bolt', rotation: 0 };
    playerBoard[1][0] = { blockId: 'guardian-sigil', rotation: 2 };
    playerBoard[1][1] = { blockId: 'convergence-sigil', rotation: 0 };
    playerBoard[2][1] = { blockId: 'deep-sigil-cannon', rotation: 0, stars: 1 };

    const circuit = analyzeCircuit(playerBoard, GAME_DATA.blocks, GAME_DATA.rules.sourceRow);
    const sigils = analyzeMagicSigils(
      playerBoard,
      GAME_DATA.blocks,
      circuit,
      GAME_DATA.rules.skillFusion,
      GAME_DATA.rules.magicSigils,
    );
    const result = resolveTick(GAME_DATA, createBattle(GAME_DATA, playerBoard, enemyBoard), 1);
    const finisher = result.trace.find(
      (event) => 'blockId' in event && event.blockId === 'deep-sigil-cannon' && event.kind === 'damage',
    );

    expect(sigils.levels.get('2:1')).toBe(3);
    expect(finisher).toMatchObject({ value: 3870, stars: 1 });
    expect(finisher && 'value' in finisher ? finisher.value : 0).toBeLessThan(GAME_DATA.units[1].maxHp);
  });

  it('turns the number of occupied magic sigils into a spread payoff', () => {
    const playerBoard: CircuitBoard = Array.from({ length: GAME_DATA.rules.boardSize }, () =>
      Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
    );
    const enemyBoard: CircuitBoard = Array.from({ length: GAME_DATA.rules.boardSize }, () =>
      Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
    );
    playerBoard[2][0] = { blockId: 'guiding-bolt', rotation: 0 };
    playerBoard[2][1] = { blockId: 'thunder-sigil', rotation: 0 };
    playerBoard[2][2] = { blockId: 'sigil-blade', rotation: 0 };
    playerBoard[2][3] = { blockId: 'resonance-circle', rotation: 0 };

    const result = resolveTick(GAME_DATA, createBattle(GAME_DATA, playerBoard, enemyBoard), 1);
    const resonance = result.trace.find(
      (event) => 'blockId' in event && event.blockId === 'resonance-circle' && event.kind === 'poison',
    );

    expect(resonance).toMatchObject({ value: 99 });
  });

  it('keeps the fused rank-one cannon payoff below its deterministic ceiling', () => {
    const playerBoard: CircuitBoard = Array.from({ length: GAME_DATA.rules.boardSize }, () =>
      Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
    );
    const enemyBoard: CircuitBoard = Array.from({ length: GAME_DATA.rules.boardSize }, () =>
      Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
    );
    playerBoard[2][0] = { blockId: 'guiding-bolt', rotation: 0 };
    playerBoard[2][1] = { blockId: 'sigil-cannon', rotation: 0, stars: 1 };

    const result = resolveTick(GAME_DATA, createBattle(GAME_DATA, playerBoard, enemyBoard), 1);
    const cannon = result.trace.find(
      (event) => 'blockId' in event && event.blockId === 'sigil-cannon' && event.kind === 'damage',
    );

    expect(cannon).toMatchObject({ value: 795, stars: 1 });
    expect(cannon && 'value' in cannon ? cannon.value : 0).toBeLessThan(1000);
  });

  it('keeps both fused spread payoffs below deterministic ceilings', () => {
    const spreadBoard = (payoffBlockId: 'resonance-circle' | 'all-sigil-resonance'): CircuitBoard => {
      const result: CircuitBoard = Array.from({ length: GAME_DATA.rules.boardSize }, () =>
        Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
      );
      result[2][0] = { blockId: 'guiding-bolt', rotation: 0 };
      result[2][1] = { blockId: 'thunder-sigil', rotation: 0 };
      result[2][2] = { blockId: 'sigil-blade', rotation: 0 };
      result[2][3] = { blockId: payoffBlockId, rotation: 0, stars: 1 };
      return result;
    };
    const enemyBoard: CircuitBoard = Array.from({ length: GAME_DATA.rules.boardSize }, () =>
      Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
    );
    const poisonResult = resolveTick(
      GAME_DATA,
      createBattle(GAME_DATA, spreadBoard('resonance-circle'), enemyBoard),
      1,
    );
    const resonance = poisonResult.trace.find(
      (event) => 'blockId' in event && event.blockId === 'resonance-circle' && event.kind === 'poison',
    );
    const allResult = resolveTick(
      GAME_DATA,
      createBattle(GAME_DATA, spreadBoard('all-sigil-resonance'), enemyBoard),
      1,
    );
    const allDamage = allResult.trace.find(
      (event) => 'blockId' in event && event.blockId === 'all-sigil-resonance' && event.kind === 'damage',
    );
    const allShield = allResult.trace.find(
      (event) => 'blockId' in event && event.blockId === 'all-sigil-resonance' && event.kind === 'shield',
    );

    expect(resonance).toMatchObject({ value: 141, stars: 1 });
    expect(resonance && 'value' in resonance ? resonance.value : 0).toBeLessThan(250);
    expect(allDamage).toMatchObject({ value: 1140, stars: 1 });
    expect(allShield).toMatchObject({ value: 540, stars: 1 });
    expect(
      (allDamage && 'value' in allDamage ? allDamage.value : 0) +
        (allShield && 'value' in allShield ? allShield.value : 0),
    ).toBeLessThan(2000);
  });
});
