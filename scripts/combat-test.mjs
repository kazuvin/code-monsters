import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveImpact } from '../src/core/combat.ts';
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

const knockAwayInstruction = INSTRUCTIONS.find((instruction) => instruction.id === 'knock-away');
assert.ok(knockAwayInstruction, '「ちょっと吹き飛ばす」の指示が登録されていません');
const knockAway = resolveImpact({
  rawDamage: 26,
  minimumDamage: 4,
  attackType: 'melee',
  attackerKnockbackPower: 8,
  impact: { knockbackPower: knockAwayInstruction.params.knockbackPower },
  targetDefense: 15,
  targetWeight: 14,
  targetRole: 'TANK',
  targetGuarded: true,
  guardDamageScale: 0.82,
  guardKnockbackScale: 0.7,
});
assert.ok(knockAway.damage > 0, '「ちょっと吹き飛ばす」はダメージを与える必要があります');
assert.ok(
  knockAway.knockbackDistance >= 35,
  '「ちょっと吹き飛ばす」はガード中の重量級も大きくノックバックさせる必要があります',
);

console.log(
  JSON.stringify(
    {
      goldenCases: goldenFixture.cases.length,
      normalSniper,
      knockbackOnlySniper,
      normalMelee,
      explicitNoKnockback,
      knockAway,
    },
    null,
    2,
  ),
);
