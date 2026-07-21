import { describe, expect, it } from 'vitest';
import { createBattle, createPlayback, resolveTick, runBattle } from './battle';
import type { CircuitBoard, GameData } from './types';

const emptyBoard = (size = 3): CircuitBoard =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => null));

const testData = (): GameData => ({
  schemaVersion: 2,
  rules: {
    boardSize: 3,
    sourceRow: 1,
    battleStepMs: 1000,
    suddenDeathSeconds: 4,
    suddenDeathBaseDamage: 2,
    suddenDeathGrowth: 2,
    poisonTickSeconds: 1,
    poisonDecay: 1,
    mergeEffectMultiplier: 2,
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
  buildDesign: {
    rules: {
      requiredRoles: ['starter', 'grower', 'cycler', 'sustain', 'payoff'],
      requiredPayoffRoles: ['grower', 'cycler', 'payoff'],
      minimumPayoffsPerBuild: 2,
      minimumOpenSkillsPerBuild: 2,
      maximumExclusiveSkillRatio: 0.75,
      minimumPlayableSkillsPerBuild: 0,
    },
    builds: [],
    skills: [],
  },
  blocks: [
    {
      id: 'strike',
      code: 'HIT',
      title: '斬撃',
      description: '',
      glyph: '斬',
      price: 2,
      rarity: 'common',
      inputPorts: ['west'],
      outputPorts: ['east'],
      cooldown: 1,
      effects: [{ kind: 'damage', amount: 3 }],
    },
    {
      id: 'guard',
      code: 'GRD',
      title: '装甲',
      description: '',
      glyph: '盾',
      price: 2,
      rarity: 'common',
      inputPorts: ['west'],
      outputPorts: ['east'],
      cooldown: 2,
      effects: [{ kind: 'shield', amount: 2 }],
    },
    {
      id: 'repair',
      code: 'FIX',
      title: '修復',
      description: '',
      glyph: '修',
      price: 2,
      rarity: 'common',
      inputPorts: ['west'],
      outputPorts: ['east'],
      cooldown: 1,
      effects: [{ kind: 'repair', amount: 3 }],
    },
    {
      id: 'amp',
      code: 'AMP',
      title: '増幅',
      description: '',
      glyph: '増',
      price: 2,
      rarity: 'common',
      inputPorts: ['west'],
      outputPorts: ['east'],
      effects: [{ kind: 'amplify', amount: 2 }],
    },
    {
      id: 'haste',
      code: 'SPD',
      title: '加速',
      description: '',
      glyph: '速',
      price: 2,
      rarity: 'common',
      inputPorts: ['west'],
      outputPorts: ['east'],
      effects: [{ kind: 'haste', amount: 1 }],
    },
  ],
  startingRack: [],
  playerBoard: emptyBoard(),
  enemyBoard: emptyBoard(),
});

const route = (...blockIds: string[]): CircuitBoard => {
  const board = emptyBoard();
  blockIds.forEach((blockId, column) => {
    board[1][column] = { blockId, rotation: 0 };
  });
  return board;
};

describe('1vs1 circuit battle', () => {
  it('activates powered skills on their own cooldowns', () => {
    const data = testData();
    const state = createBattle(data, route('guard'), emptyBoard());
    const tick1 = resolveTick(data, state, 1);
    const tick2 = resolveTick(data, tick1, 2);

    expect(tick1.fighters.find((fighter) => fighter.team === 'player')?.shield).toBe(2);
    expect(tick2.fighters.find((fighter) => fighter.team === 'player')?.shield).toBe(2);
  });

  it('lets a powered skill pass the circuit to the next skill', () => {
    const data = testData();
    const result = resolveTick(data, createBattle(data, route('guard', 'strike'), emptyBoard()), 1);

    expect(result.fighters.find((fighter) => fighter.team === 'enemy')?.hp).toBe(9);
    expect(result.fighters.find((fighter) => fighter.team === 'player')?.shield).toBe(2);
  });

  it('plays one frame per circuit depth while parallel cells share a frame', () => {
    const data = testData();
    const frames = createPlayback(data, route('guard', 'strike'), emptyBoard()).filter((frame) => frame.tick === 1);

    expect(frames).toHaveLength(2);
    expect(frames.map((frame) => frame.pulseStep)).toEqual([1, 2]);
    expect(frames.map((frame) => frame.activePulse.player)).toEqual([['1:0'], ['1:1']]);
    expect(frames.every((frame) => frame.pulseStepCount === 2)).toBe(true);
    expect(frames[0].fighters.find((fighter) => fighter.team === 'player')?.shield).toBe(2);
    expect(frames[0].fighters.find((fighter) => fighter.team === 'enemy')?.hp).toBe(12);
    expect(frames[1].fighters.find((fighter) => fighter.team === 'enemy')?.hp).toBe(9);
  });

  it('boosts a directly connected skill with a powered amplifier', () => {
    const data = testData();
    const result = resolveTick(data, createBattle(data, route('amp', 'strike'), emptyBoard()), 1);

    expect(result.fighters.find((fighter) => fighter.team === 'enemy')?.hp).toBe(7);
  });

  it('reports only the health that a repair actually restores', () => {
    const data = testData();
    const result = resolveTick(data, createBattle(data, route('repair'), route('strike')), 1);

    expect(result.trace.find((event) => event.kind === 'repair')?.value).toBe(0);
  });

  it('resolves lethal attacks simultaneously', () => {
    const data = testData();
    data.units = data.units.map((unit) => ({ ...unit, maxHp: 3 }));
    const result = resolveTick(data, createBattle(data, route('strike'), route('strike')), 1);

    expect(result.winner).toBe('draw');
    expect(result.fighters.every((fighter) => fighter.hp === 0)).toBe(true);
  });

  it('continues past a fixed beat count and applies exponential overload damage', () => {
    const data = testData();
    const playback = createPlayback(data, route('guard'), route('guard'));
    const result = playback.at(-1)!;
    const overload = result.trace.filter((event) => event.kind === 'overload' && event.team === 'player');
    const overloadPulses = playback.filter((frame) => frame.overloadLevel > 0).map((frame) => frame.overloadDamage);

    expect(result.winner).toBe('draw');
    expect(result.tick).toBe(6);
    expect(overloadPulses).toEqual([2, 4, 8]);
    expect(overload.map((event) => event.value)).toEqual([2, 4, 6]);
    expect(result.fighters.every((fighter) => fighter.shield > 0)).toBe(true);
  });

  it('awards a simultaneous overload knockout to the fighter with more health before the pulse', () => {
    const data = testData();
    data.rules.suddenDeathSeconds = 1;
    data.rules.suddenDeathBaseDamage = 16;
    const state = createBattle(data, route('guard'), route('guard'));
    state.fighters.find((fighter) => fighter.team === 'player')!.hp = 10;
    state.fighters.find((fighter) => fighter.team === 'enemy')!.hp = 8;

    expect(resolveTick(data, state, 1).winner).toBe('player');
  });

  it('runs to an actual knockout instead of comparing health at a time limit', () => {
    const result = runBattle(testData(), route('guard'), route('guard'));

    expect(result.tick).toBe(6);
    expect(result.fighters.every((fighter) => fighter.hp === 0)).toBe(true);
  });
});
