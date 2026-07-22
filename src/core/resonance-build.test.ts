import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { createBattle, resolveTick } from './battle';
import type { CircuitBoard, SkillStars } from './types';

const emptyBoard = (): CircuitBoard =>
  Array.from({ length: GAME_DATA.rules.boardSize }, () =>
    Array.from({ length: GAME_DATA.rules.boardSize }, () => null),
  );

const surroundedGrandHarmony = (stars: SkillStars): CircuitBoard => {
  const board = emptyBoard();
  const fixture: Array<[number, number, string, SkillStars?]> = [
    [1, 0, 'grand-harmony'],
    [1, 1, 'harmonic-sanctuary'],
    [1, 2, 'sealed-junction'],
    [2, 0, 'sealed-junction'],
    [2, 1, 'grand-harmony', stars],
    [2, 2, 'sealed-junction'],
    [3, 0, 'sealed-junction'],
    [3, 1, 'harmonic-sanctuary'],
    [3, 2, 'harmonic-sanctuary'],
  ];
  fixture.forEach(([row, column, blockId, cellStars]) => {
    board[row][column] = { blockId, rotation: 0, ...(cellStars ? { stars: cellStars } : {}) };
  });
  return board;
};

describe('spirit resonance build', () => {
  it('uses a fused payoff to count all eight powered neighbors without multiplying the count itself', () => {
    const data = structuredClone(GAME_DATA);
    data.rules.heart.initialPosition = { row: 2, column: -1 };
    data.rules.mergeEffectMultiplier = 1;
    const normal = resolveTick(data, createBattle(data, surroundedGrandHarmony(0), emptyBoard()), 1);
    const fused = resolveTick(data, createBattle(data, surroundedGrandHarmony(1), emptyBoard()), 1);
    const normalGrandHarmony = normal.trace.filter(
      (event) => 'blockId' in event && event.blockId === 'grand-harmony' && event.row === 2 && event.column === 1,
    );
    const fusedDamage = fused.trace.find(
      (event) =>
        'blockId' in event &&
        event.blockId === 'grand-harmony' &&
        event.row === 2 &&
        event.column === 1 &&
        event.kind === 'damage',
    );
    const fusedShield = fused.trace.find(
      (event) =>
        'blockId' in event &&
        event.blockId === 'grand-harmony' &&
        event.row === 2 &&
        event.column === 1 &&
        event.kind === 'shield',
    );

    expect(normalGrandHarmony).toEqual([]);
    expect(fusedDamage).toMatchObject({ value: 2340, stars: 1 });
    expect(fusedShield).toMatchObject({ value: 1170, stars: 1 });
    expect(fusedDamage && 'value' in fusedDamage ? fusedDamage.value : 0).toBeLessThan(GAME_DATA.units[1].maxHp);
  });
});
