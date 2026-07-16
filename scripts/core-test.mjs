import assert from 'node:assert/strict';
import { applyBattleStep, planBattleFrame } from '../src/core/battle-engine.ts';
import { analyzeBalance } from '../src/core/balance.ts';
import { createBattleFighters, createInventoryUnit } from '../src/core/roster.ts';
import { actionCooldown, canRunCondition, instructionById } from '../src/core/rules.ts';
import { createShop } from '../src/core/shop.ts';
import { BATTLE_CONFIG, GAME_DATA, ROSTER_CONFIG } from '../src/data.ts';

const team = ROSTER_CONFIG.startingUnitIds.map((id, index) => createInventoryUnit(id, `test-${id}-${index}`));
const fighters = createBattleFighters(team);
assert.equal(
  fighters.filter((fighter) => fighter.team === 'ally').length,
  team.length,
  '味方編成を戦闘状態へ変換できません',
);
assert.equal(
  fighters.filter((fighter) => fighter.team === 'enemy').length,
  ROSTER_CONFIG.enemyUnitIds.length,
  '敵編成がデータ定義と一致しません',
);
assert.ok(
  fighters.every((fighter) => fighter.guardDamageScale === 1 && fighter.guardKnockbackScale === 1),
  '初期ガード倍率は1である必要があります',
);

const volt = fighters.find((fighter) => fighter.id === 'volt' && fighter.team === 'ally');
const enemies = fighters.filter((fighter) => fighter.team === 'enemy');
const allies = fighters.filter((fighter) => fighter.team === 'ally');
assert.ok(volt);
assert.equal(canRunCondition('enemyOutOfRange', volt, enemies, allies), true, '安定IDの射程外条件を評価できません');
assert.equal(
  actionCooldown(volt.speed),
  Math.max(BATTLE_CONFIG.minimumActionCooldownSeconds, BATTLE_CONFIG.baseActionCooldownSeconds / volt.speed),
);

const ready = fighters.map((fighter) => ({
  ...fighter,
  cooldown: fighter.team === 'ally' && fighter.id === 'volt' ? 0 : 10,
}));
const plan = planBattleFrame({
  fighters: ready,
  team,
  dt: BATTLE_CONFIG.tickSeconds,
  elapsed: BATTLE_CONFIG.tickSeconds,
  previousElapsed: 0,
});
assert.ok(plan.steps.length > 0, '戦闘エンジンが実行ステップを生成しません');
assert.doesNotThrow(() => JSON.stringify(plan.steps), 'Unityへ渡す戦闘ステップはシリアライズ可能である必要があります');
const applied = applyBattleStep(plan.fighters, plan.steps[0]);
assert.equal(applied.length, plan.fighters.length, '戦闘ステップ適用でユニット数が変化しました');

const shop = createShop(0);
assert.ok(
  shop.some((item) => item.kind === 'unit' && item.id === 'wrath'),
  '初期ショップ定義が反映されていません',
);
assert.ok(instructionById.get('berserker-mode')?.params.speedScale === 2, 'バーサーカー倍率がデータ定義から読めません');

const balance = analyzeBalance(GAME_DATA);
assert.equal(
  balance.errors,
  0,
  `バランス検査にエラーがあります: ${balance.issues.map((issue) => issue.message).join(' / ')}`,
);
assert.ok(
  balance.metrics.every((metric) => Number.isFinite(metric.power) && metric.power > 0),
  '全ユニットの戦力値を算出できません',
);
const invalidData = structuredClone(GAME_DATA);
invalidData.defaultPrograms[0].actionIds = ['missing-action'];
const invalidReport = analyzeBalance(invalidData);
assert.ok(
  invalidReport.issues.some((issue) => issue.code === 'UNKNOWN_INSTRUCTION'),
  '壊れたスキル参照を静的検査で検出できません',
);

console.log(
  JSON.stringify({ fighters: fighters.length, steps: plan.steps.length, balanceWarnings: balance.warnings }, null, 2),
);
