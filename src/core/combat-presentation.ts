export type DamageTier = 'small' | 'medium' | 'large';

export function damageTierFor(damage: number, maxHp: number): DamageTier {
  const ratio = maxHp > 0 ? damage / maxHp : 0;
  if (ratio >= 0.15) return 'large';
  if (ratio >= 0.03) return 'medium';
  return 'small';
}
