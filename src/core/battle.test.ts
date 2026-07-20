import { describe, expect, it } from 'vitest';
import { createBattle, resolveBeat, runBattle } from './battle';
import type { GameData, ProgramBoard } from './types';

const testData: GameData = {
  schemaVersion: 1,
  rules: {
    lanes: 3,
    programSlots: 4,
    maxRounds: 1,
    stackLimit: 2,
    startingCoins: 7,
    winReward: 4,
    retryReward: 1,
    rerollCost: 1,
    shopSize: 5,
  },
  units: [
    { id: 'volt', name: 'ヴォルト', code: 'V-01', maxHp: 12, color: '#62e8ff' },
    { id: 'bastion', name: 'バスティオン', code: 'B-07', maxHp: 14, color: '#ffd36a' },
    { id: 'relay', name: 'リレイ', code: 'R-11', maxHp: 10, color: '#ff7b72' },
  ],
  commands: [
    {
      id: 'strike',
      code: 'HIT',
      title: '攻撃',
      description: '正面の相手へ3ダメージ',
      price: 2,
      rarity: 'common',
      effect: { kind: 'damage', amount: 3 },
    },
    {
      id: 'guard',
      code: 'GRD',
      title: '守る',
      description: 'シールドを3得る',
      price: 2,
      rarity: 'common',
      effect: { kind: 'shield', amount: 3 },
    },
    {
      id: 'loop',
      code: 'RPT',
      title: 'もう一度',
      description: 'ひとつ前の命令をもう一度動かす',
      price: 3,
      rarity: 'rare',
      effect: { kind: 'repeatPrevious' },
    },
  ],
  startingInventory: ['strike', 'guard', 'loop'],
  playerProgram: [
    ['strike', null, null, null],
    [null, null, null, null],
    [null, null, null, null],
  ],
  enemyProgram: [
    ['strike', null, null, null],
    [null, null, null, null],
    [null, null, null, null],
  ],
};

const emptyBoard = (): ProgramBoard => Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => null));

describe('battle core', () => {
  it('resolves attacks from the same beat simultaneously', () => {
    const data = structuredClone(testData);
    data.units = data.units.map((unit) => ({ ...unit, maxHp: 3 }));
    const player = emptyBoard();
    const enemy = emptyBoard();
    for (let lane = 0; lane < 3; lane += 1) {
      player[lane][0] = 'strike';
      enemy[lane][0] = 'strike';
    }
    const state = createBattle(data, player, enemy);

    const next = resolveBeat(data, state, 0);

    expect(next.fighters.every((fighter) => fighter.hp === 0)).toBe(true);
    expect(next.winner).toBe('draw');
  });

  it('repeats the previous command recursively within the stack limit', () => {
    const player = emptyBoard();
    player[0] = ['strike', 'loop', 'loop', 'loop'];
    const enemy = emptyBoard();
    const result = runBattle(testData, player, enemy);
    const enemyVolt = result.fighters.find((fighter) => fighter.team === 'enemy' && fighter.lane === 0);

    expect(enemyVolt?.hp).toBe(3);
    expect(result.trace.filter((event) => event.kind === 'execute' && event.commandId === 'strike')).toHaveLength(3);
    expect(result.trace.some((event) => event.kind === 'stackOverflow')).toBe(true);
  });

  it('falls back to the next living lane when the opposing lane is empty', () => {
    const player = emptyBoard();
    player[0][0] = 'strike';
    const enemy = emptyBoard();
    const state = createBattle(testData, player, enemy);
    state.fighters = state.fighters.map((fighter) =>
      fighter.team === 'enemy' && fighter.lane === 0 ? { ...fighter, hp: 0 } : fighter,
    );

    const next = resolveBeat(testData, state, 0);
    const fallback = next.fighters.find((fighter) => fighter.team === 'enemy' && fighter.lane === 1);

    expect(fallback?.hp).toBe(11);
  });
});
