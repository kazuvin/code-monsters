import assert from 'node:assert/strict';
import { applyBattleStep, planBattleFrame } from '../src/core/battle-engine.ts';
import { analyzeBalance } from '../src/core/balance.ts';
import { createBattleFighters, createInventoryUnit } from '../src/core/roster.ts';
import {
  actionCooldown,
  actionRange,
  advanceToward,
  canRunCondition,
  instructionById,
  jumpToward,
  knockbackPosition,
  priorityEnemy,
  pullToward,
  retreatFrom,
  throwBehind,
  tickCooldowns,
} from '../src/core/rules.ts';
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
  fighters.every(
    (fighter) =>
      fighter.guardDamageScale === 1 &&
      fighter.guardKnockbackScale === 1 &&
      fighter.tauntTargetId === null &&
      fighter.tauntSeconds === 0,
  ),
  'ガードと挑発の初期状態が不正です',
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

const jumpTarget = { ...enemies[0], x: 48 };
const jumpActor = { ...volt, x: 40 };
const crossedActor = { ...jumpActor, x: 54 };
assert.equal(jumpToward(jumpActor, jumpTarget, 14), 54, '固定距離ジャンプで敵を飛び越えられません');
assert.equal(throwBehind(jumpActor, jumpTarget, 6), 34, '背負い投げで敵を使用者の背後へ移動できません');
assert.equal(pullToward(jumpActor, jumpTarget, 4), 44, '引き寄せで敵を使用者の近くへ移動できません');
assert.equal(pullToward(jumpActor, { ...jumpTarget, x: 42 }, 4), 42, '近くの敵を引き寄せで押し離しています');
assert.equal(advanceToward({ ...crossedActor, x: 64 }, jumpTarget, 5.2), 58.8, '交差後の前進方向が不正です');
assert.equal(retreatFrom(crossedActor, jumpTarget, 6.5), 60.5, '交差後の後退方向が不正です');
assert.equal(knockbackPosition(crossedActor, jumpTarget, 8), 62, '交差後のノックバック方向が不正です');

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

const jumpTeam = [createInventoryUnit('volt', 'jump-volt')];
jumpTeam[0].program = [{ conditionId: 'enemyInRange', actionId: 'vault-over' }];
const jumpFighters = createBattleFighters(jumpTeam).map((fighter) => ({
  ...fighter,
  x: fighter.team === 'ally' ? 40 : fighter.id === 'relay' ? 48 : 72,
  cooldown: fighter.team === 'ally' ? 0 : 10,
}));
const jumpPlan = planBattleFrame({
  fighters: jumpFighters,
  team: jumpTeam,
  dt: BATTLE_CONFIG.tickSeconds,
  elapsed: BATTLE_CONFIG.tickSeconds,
  previousElapsed: 0,
});
const jumpStep = jumpPlan.steps.find((step) => step.flash.kind === 'jump');
assert.ok(jumpStep, 'ジャンプ指示が戦闘ステップを生成しません');
assert.equal(jumpStep.updates[0]?.values.x, 54, 'ジャンプ指示が固定距離を移動しません');

const throwTeam = [createInventoryUnit('volt', 'throw-volt')];
throwTeam[0].program = [{ conditionId: 'enemyInRange', actionId: 'shoulder-throw' }];
const throwFighters = createBattleFighters(throwTeam).map((fighter) => ({
  ...fighter,
  x: fighter.team === 'ally' ? 40 : fighter.id === 'relay' ? 48 : 72,
  cooldown: fighter.team === 'ally' ? 0 : 10,
}));
const throwPlan = planBattleFrame({
  fighters: throwFighters,
  team: throwTeam,
  dt: BATTLE_CONFIG.tickSeconds,
  elapsed: BATTLE_CONFIG.tickSeconds,
  previousElapsed: 0,
});
const throwStep = throwPlan.steps.find((step) => step.flash.kind === 'throw');
const throwMoveStep = throwPlan.steps.find((step) => step.flash.actionLabel === 'THROW');
assert.ok(throwStep, '背負い投げが攻撃ステップを生成しません');
assert.ok(throwMoveStep, '背負い投げが投擲移動ステップを生成しません');
assert.equal(throwMoveStep.flash.kind, 'thrown', '投げられた敵の専用ステップが生成されません');
assert.equal(throwMoveStep.updates[0]?.values.x, 34, '背負い投げが敵を使用者の背後へ移動しません');

const tauntTeam = [createInventoryUnit('volt', 'taunt-volt')];
tauntTeam[0].program = [{ conditionId: 'always', actionId: 'taunt' }];
const tauntFighters = createBattleFighters(tauntTeam).map((fighter) => ({
  ...fighter,
  x: fighter.team === 'ally' ? 40 : fighter.id === 'relay' ? 48 : 72,
  cooldown: fighter.team === 'ally' ? 0 : 10,
}));
const tauntPlan = planBattleFrame({
  fighters: tauntFighters,
  team: tauntTeam,
  dt: BATTLE_CONFIG.tickSeconds,
  elapsed: BATTLE_CONFIG.tickSeconds,
  previousElapsed: 0,
});
const tauntStep = tauntPlan.steps.find((step) => step.flash.kind === 'taunt');
assert.ok(tauntStep, '挑発が戦闘ステップを生成しません');
assert.equal(tauntStep.updates.length, 2, '挑発が生存中の敵全体へ適用されません');
assert.ok(
  tauntStep.updates.every(
    (update) =>
      update.values.tauntTargetId === 'taunt-volt' &&
      update.values.tauntSeconds === instructionById.get('taunt')?.params.durationSeconds,
  ),
  '挑発が敵の標的を使用者へ固定しません',
);

const forcedActor = {
  ...enemies[0],
  x: 58,
  tauntTargetId: volt.instanceId,
  tauntSeconds: 3,
};
const nearbyOpponent = { ...allies[1], x: 55 };
const farTaunter = { ...volt, x: 30 };
assert.equal(
  priorityEnemy(forcedActor, [nearbyOpponent, farTaunter]).instanceId,
  volt.instanceId,
  '挑発中に近い別ユニットへ標的が逸れます',
);
const expiredTaunt = tickCooldowns([{ ...forcedActor, tauntSeconds: 0.1 }], 0.2)[0];
assert.equal(expiredTaunt.tauntTargetId, null, '挑発時間の終了後に標的固定が解除されません');
assert.equal(expiredTaunt.tauntSeconds, 0, '挑発の残り時間が0未満になります');

const pullTeam = [createInventoryUnit('volt', 'pull-volt')];
pullTeam[0].program = [{ conditionId: 'enemyInRange', actionId: 'pull-in' }];
const pullInstruction = instructionById.get('pull-in');
assert.ok(pullInstruction);
assert.equal(actionRange(volt, pullInstruction), 20, '引き寄せの射程がユニットRNGの2倍になっていません');
const pullFighters = createBattleFighters(pullTeam).map((fighter) => ({
  ...fighter,
  x: fighter.team === 'ally' ? 40 : fighter.id === 'relay' ? 58 : 72,
  cooldown: fighter.team === 'ally' ? 0 : 10,
}));
const pullPlan = planBattleFrame({
  fighters: pullFighters,
  team: pullTeam,
  dt: BATTLE_CONFIG.tickSeconds,
  elapsed: BATTLE_CONFIG.tickSeconds,
  previousElapsed: 0,
});
const pullStep = pullPlan.steps.find((step) => step.flash.kind === 'pull');
const pulledStep = pullPlan.steps.find((step) => step.flash.kind === 'pulled');
assert.ok(pullStep, '引き寄せが発動ステップを生成しません');
assert.ok(pulledStep, '引き寄せが対象移動ステップを生成しません');
assert.equal(pulledStep.updates[0]?.values.x, 44, '引き寄せが対象を使用者から4mの位置へ移動しません');

const shop = createShop(0);
assert.ok(
  shop.some((item) => item.kind === 'unit' && item.id === 'wrath'),
  '初期ショップ定義が反映されていません',
);
assert.ok(
  shop.some((item) => item.kind === 'instruction' && item.id === 'shoulder-throw'),
  '背負い投げが初期ショップにありません',
);
assert.ok(
  shop.some((item) => item.kind === 'instruction' && item.id === 'taunt'),
  '挑発が初期ショップにありません',
);
assert.ok(
  shop.some((item) => item.kind === 'instruction' && item.id === 'pull-in'),
  '引き寄せが初期ショップにありません',
);
assert.ok(instructionById.get('berserker-mode')?.params.speedScale === 3, 'バーサーカー倍率がデータ定義から読めません');

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
