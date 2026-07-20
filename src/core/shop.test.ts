import { describe, expect, it } from 'vitest';
import { createShop, rerollShop } from './shop';
import type { CommandDefinition } from './types';

const commands: CommandDefinition[] = Array.from({ length: 7 }, (_, index) => ({
  id: `command-${index}`,
  code: `C${index}`,
  title: `命令${index}`,
  description: `命令${index}の効果`,
  price: 2,
  rarity: index > 4 ? 'rare' : 'common',
  effect: { kind: 'damage', amount: index + 1 },
}));

describe('shop', () => {
  it('creates deterministic unique offers from a seed', () => {
    expect(createShop(commands, 42, 5)).toEqual(createShop(commands, 42, 5));
    expect(new Set(createShop(commands, 42, 5).map((offer) => offer.commandId)).size).toBe(5);
  });

  it('keeps locked offers when rerolling', () => {
    const current = createShop(commands, 12, 5).map((offer, index) => ({ ...offer, locked: index === 1 }));
    const next = rerollShop(commands, current, 13, 5);

    expect(next[1]).toEqual(current[1]);
    expect(new Set(next.map((offer) => offer.commandId)).size).toBe(5);
  });
});
