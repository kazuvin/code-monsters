import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveImpact } from '../src/core/combat.ts';
import { effectByKind } from '../src/core/instruction-effects.ts';
import { INSTRUCTIONS } from '../src/data.ts';

const goldenFixture = JSON.parse(
  fs.readFileSync(new URL('../game-data/golden/combat-cases.json', import.meta.url), 'utf8'),
);
for (const testCase of goldenFixture.cases) {
  const actual = resolveImpact(testCase.input);
  assert.equal(actual.damage, testCase.expected.damage, `${testCase.id}: ダメージが共有fixtureと一致しません`);
  assert.ok(
    Math.abs(actual.knockbackDistance - testCase.expected.knockbackDistance) < 0.0001,
    `${testCase.id}: ノックバックが共有fixtureと一致しません`,
  );
}

const target = {
  targetDefense: 6,
  targetWeight: 8,
  targetRole: 'STRIKER',
  targetGuarded: false,
};

const normalSniper = resolveImpact({
  rawDamage: 20,
  minimumDamage: 4,
  attackType: 'sniper',
  attackerKnockbackPower: 99,
  ...target,
});
assert.ok(normalSniper.damage > 0, '通常の遠距離攻撃はダメージを与える必要があります');
assert.equal(normalSniper.knockbackDistance, 0, '通常の遠距離攻撃はノックバックさせてはいけません');

const knockbackOnlySniper = resolveImpact({
  rawDamage: 20,
  minimumDamage: 4,
  attackType: 'sniper',
  attackerKnockbackPower: 0,
  impact: { damageScale: 0, knockbackPower: 12 },
  ...target,
});
assert.equal(knockbackOnlySniper.damage, 0, 'ノックバック専用攻撃はダメージ0を許可する必要があります');
assert.ok(knockbackOnlySniper.knockbackDistance > 0, '遠距離の特殊攻撃は明示的にノックバックできる必要があります');

const normalMelee = resolveImpact({
  rawDamage: 25,
  minimumDamage: 4,
  attackType: 'melee',
  attackerKnockbackPower: 10,
  ...target,
});
assert.ok(normalMelee.damage > 0, '通常の近接攻撃はダメージを与える必要があります');
assert.ok(normalMelee.knockbackDistance > 0, '通常の近接攻撃はノックバックを維持する必要があります');

const explicitNoKnockback = resolveImpact({
  rawDamage: 15,
  minimumDamage: 3,
  attackType: 'melee',
  attackerKnockbackPower: 10,
  impact: { knockbackPower: 0 },
  ...target,
});
assert.equal(explicitNoKnockback.knockbackDistance, 0, 'アクション固有設定でノックバックを無効化できる必要があります');

const impactRingInstruction = INSTRUCTIONS.find((instruction) => instruction.id === 'impact-ring');
assert.ok(impactRingInstruction, '空間衝撃スキルが登録されていません');
const impactRingDamage = effectByKind(impactRingInstruction, 'damage');
assert.ok(impactRingDamage, '空間衝撃スキルにダメージ効果がありません');
const impactRing = resolveImpact({
  rawDamage: 26,
  minimumDamage: 4,
  attackType: 'melee',
  attackerKnockbackPower: 8,
  impact: { knockbackPower: impactRingDamage.knockbackPower },
  targetDefense: 15,
  targetWeight: 14,
  targetRole: 'TANK',
  targetGuarded: true,
  guardDamageScale: 0.82,
  guardKnockbackScale: 0.7,
});
assert.ok(impactRing.damage > 0, 'インパクトリングはダメージを与える必要があります');
assert.ok(impactRing.knockbackDistance > 0, 'インパクトリングはガード中の重量級も押し返す必要があります');

console.log(
  JSON.stringify(
    {
      goldenCases: goldenFixture.cases.length,
      normalSniper,
      knockbackOnlySniper,
      normalMelee,
      explicitNoKnockback,
      impactRing,
    },
    null,
    2,
  ),
);
