import { describe, expect, it } from 'vitest';
import { damageTierFor } from './combat-presentation';

describe('combat presentation', () => {
  it('classifies damage by its share of maximum health', () => {
    expect(damageTierFor(70, 5000)).toBe('small');
    expect(damageTierFor(149, 5000)).toBe('small');
    expect(damageTierFor(150, 5000)).toBe('medium');
    expect(damageTierFor(749, 5000)).toBe('medium');
    expect(damageTierFor(750, 5000)).toBe('large');
    expect(damageTierFor(3800, 5000)).toBe('large');
  });
});
