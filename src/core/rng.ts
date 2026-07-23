export type SeededRandom = {
  next: () => number;
  integer: (maximumExclusive: number) => number;
  pick: <T>(values: readonly T[]) => T;
  shuffle: <T>(values: readonly T[]) => T[];
};

const normalizeSeed = (seed: number) => {
  const normalized = seed >>> 0;
  return normalized === 0 ? 0x6d2b79f5 : normalized;
};

export function createSeededRandom(seed: number): SeededRandom {
  let state = normalizeSeed(seed);
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  const integer = (maximumExclusive: number) => {
    if (!Number.isInteger(maximumExclusive) || maximumExclusive <= 0) {
      throw new Error('maximumExclusive must be a positive integer');
    }
    return Math.floor(next() * maximumExclusive);
  };
  const pick = <T>(values: readonly T[]) => {
    if (values.length === 0) throw new Error('Cannot pick from an empty collection');
    return values[integer(values.length)] as T;
  };
  const shuffle = <T>(values: readonly T[]) => {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = integer(index + 1);
      [copy[index], copy[swapIndex]] = [copy[swapIndex] as T, copy[index] as T];
    }
    return copy;
  };
  return { next, integer, pick, shuffle };
}

export const deriveSeed = (seed: number, salt: number) => {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
};
