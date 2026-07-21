import { describe, expect, it } from 'vitest';
import { createBattle, resolveTick, runBattle } from './battle';
import type { CircuitBoard, GameData } from './types';

const emptyBoard = (size = 3): CircuitBoard =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => null));

const testData = (): GameData => ({
  schemaVersion: 2,
  rules: {
    boardSize: 3,
    sourceRow: 1,
    battleTicks: 3,
    startingCoins: 7,
    winReward: 4,
    retryReward: 1,
    rerollCost: 1,
    shopSize: 3,
  },
  units: [
    { id: 'player-bot', name: 'プレイヤー', code: 'P-01', maxHp: 12, color: '#5de7f2' },
    { id: 'enemy-bot', name: 'ライバル', code: 'R-01', maxHp: 12, color: '#ff786e' },
  ],
  playerUnitId: 'player-bot',
  enemyUnitId: 'enemy-bot',
  blocks: [
    {
      id: 'hub',
      code: 'HUB',
      title: 'ハブ',
      description: '',
      glyph: '+',
      price: 1,
      rarity: 'common',
      ports: ['west', 'north', 'east', 'south'],
      effect: { kind: 'wire' },
    },
    {
      id: 'strike',
      code: 'HIT',
      title: '斬撃',
      description: '',
      glyph: '斬',
      price: 2,
      rarity: 'common',
      ports: ['west', 'east'],
      cooldown: 1,
      effect: { kind: 'damage', amount: 3 },
    },
    {
      id: 'guard',
      code: 'GRD',
      title: '装甲',
      description: '',
      glyph: '盾',
      price: 2,
      rarity: 'common',
      ports: ['west', 'east'],
      cooldown: 2,
      effect: { kind: 'shield', amount: 2 },
    },
    {
      id: 'repair',
      code: 'FIX',
      title: '修復',
      description: '',
      glyph: '修',
      price: 2,
      rarity: 'common',
      ports: ['west', 'east'],
      cooldown: 1,
      effect: { kind: 'repair', amount: 3 },
    },
    {
      id: 'amp',
      code: 'AMP',
      title: '増幅',
      description: '',
      glyph: '増',
      price: 2,
      rarity: 'common',
      ports: ['west', 'east'],
      effect: { kind: 'amplify', amount: 2 },
    },
    {
      id: 'haste',
      code: 'SPD',
      title: '加速',
      description: '',
      glyph: '速',
      price: 2,
      rarity: 'common',
      ports: ['west', 'east'],
      effect: { kind: 'haste', amount: 1 },
    },
  ],
  startingRack: [],
  playerBoard: emptyBoard(),
  enemyBoard: emptyBoard(),
});

const route = (...blockIds: string[]): CircuitBoard => {
  const board = emptyBoard();
  blockIds.forEach((blockId, column) => {
    board[1][column] = { blockId, rotation: 0, fixed: column === 0 };
  });
  return board;
};

describe('1vs1 circuit battle', () => {
  it('activates powered skills on their own cooldowns', () => {
    const data = testData();
    const state = createBattle(data, route('hub', 'guard'), route('hub'));
    const tick1 = resolveTick(data, state, 1);
    const tick2 = resolveTick(data, tick1, 2);

    expect(tick1.fighters.find((fighter) => fighter.team === 'player')?.shield).toBe(2);
    expect(tick2.fighters.find((fighter) => fighter.team === 'player')?.shield).toBe(2);
  });

  it('lets a powered skill pass the circuit to the next skill', () => {
    const data = testData();
    const result = resolveTick(data, createBattle(data, route('hub', 'guard', 'strike'), route('hub')), 1);

    expect(result.fighters.find((fighter) => fighter.team === 'enemy')?.hp).toBe(9);
    expect(result.fighters.find((fighter) => fighter.team === 'player')?.shield).toBe(2);
  });

  it('boosts a directly connected skill with a powered amplifier', () => {
    const data = testData();
    const result = resolveTick(data, createBattle(data, route('hub', 'amp', 'strike'), route('hub')), 1);

    expect(result.fighters.find((fighter) => fighter.team === 'enemy')?.hp).toBe(7);
  });

  it('reports only the health that a repair actually restores', () => {
    const data = testData();
    const result = resolveTick(data, createBattle(data, route('hub', 'repair'), route('hub', 'strike')), 1);

    expect(result.trace.find((event) => event.kind === 'repair')?.value).toBe(0);
  });

  it('resolves lethal attacks simultaneously', () => {
    const data = testData();
    data.units = data.units.map((unit) => ({ ...unit, maxHp: 3 }));
    const result = resolveTick(data, createBattle(data, route('hub', 'strike'), route('hub', 'strike')), 1);

    expect(result.winner).toBe('draw');
    expect(result.fighters.every((fighter) => fighter.hp === 0)).toBe(true);
  });

  it('finishes a timed battle by remaining health', () => {
    const data = testData();
    const result = runBattle(data, route('hub', 'strike'), route('hub'));

    expect(result.winner).toBe('player');
    expect(result.tick).toBe(3);
  });
});
