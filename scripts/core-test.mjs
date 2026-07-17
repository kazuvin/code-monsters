import assert from 'node:assert/strict';
import { applyBattleStep, planBattleFrame } from '../src/core/battle-engine.ts';
import { analyzeBalance } from '../src/core/balance.ts';
import { createDebugFighters, createDefaultDebugStatuses, runDebugSimulation } from '../src/core/debug-simulation.ts';
import { createBattleFighters, createInventoryUnit } from '../src/core/roster.ts';
import { summarizeDecisions } from '../src/core/replay.ts';
import {
  actionCooldown,
  actionRange,
  advanceToward,
  canRunCondition,
  instructionById,
  isConditionCompatibleWithTarget,
  isInstructionCompatibleWithTarget,
  jumpToward,
  matchCondition,
  knockbackPosition,
  priorityEnemy,
  pullToward,
  retreatFrom,
  resolveActionImpact,
  selectConditionTargets,
  throwBehind,
  tickCooldowns,
} from '../src/core/rules.ts';
import { createShop } from '../src/core/shop.ts';
import { BATTLE_CONFIG, DEBUG_TRAINING_CONFIG, ENCOUNTERS, GAME_DATA, ROSTER_CONFIG } from '../src/data.ts';

const team = ROSTER_CONFIG.startingUnitIds.map((id, index) => createInventoryUnit(id, `test-${id}-${index}`));
const fighters = createBattleFighters(team);
assert.equal(BATTLE_CONFIG.abilityGaugeMax, 10, 'アビリティゲージの最大値が10ではありません');
assert.equal(BATTLE_CONFIG.abilityGaugeInitial, 8, '技を連続使用できる初期ゲージ量ではありません');
assert.equal(BATTLE_CONFIG.abilityGaugeRegenPerSecond, 1.5, 'アビリティゲージの回復速度が不正です');
assert.equal(ENCOUNTERS.length, 5, '5ラウンドの遭遇定義がありません');
assert.equal(team.length, 3, 'デフォルト味方編成が3体ではありません');
assert.ok(
  ENCOUNTERS.every((encounter) => encounter.enemyUnitIds.length === 3),
  '全ラウンドの標準敵編成が3体ではありません',
);
const finalEncounterFighters = createBattleFighters(team, ENCOUNTERS.at(-1));
assert.equal(
  finalEncounterFighters.filter((fighter) => fighter.team === 'enemy').length,
  3,
  '最終ラウンドが3体編成になっていません',
);
assert.ok(
  finalEncounterFighters
    .filter((fighter) => fighter.team === 'enemy')
    .every((fighter) => fighter.maxHp > (GAME_DATA.units.find((unit) => unit.id === fighter.id)?.maxHp ?? 0)),
  '後半ラウンドの敵能力倍率が反映されていません',
);
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
assert.ok(
  fighters.every((fighter) => fighter.abilityGauge === BATTLE_CONFIG.abilityGaugeInitial),
  'アビリティゲージの初期値がデータ定義と一致しません',
);

const volt = fighters.find((fighter) => fighter.id === 'volt' && fighter.team === 'ally');
const enemies = fighters.filter((fighter) => fighter.team === 'enemy');
const allies = fighters.filter((fighter) => fighter.team === 'ally');
assert.ok(volt);
const nearestEnemyTargets = selectConditionTargets('nearestEnemy', volt, enemies, allies);
assert.equal(
  canRunCondition('targetOutOfRange', volt, nearestEnemyTargets),
  true,
  '一番近い敵に対する射程外条件を評価できません',
);
assert.equal(
  isConditionCompatibleWithTarget('targetOutOfRange', 'nearestEnemy'),
  true,
  '敵対象と射程条件が互換ではありません',
);
assert.equal(
  isConditionCompatibleWithTarget('targetInRange', 'nearestAlly'),
  true,
  '味方対象と射程条件が互換ではありません',
);
assert.equal(isConditionCompatibleWithTarget('always', 'nearestAlly'), false, '味方対象に「いつでも」が表示されます');
assert.equal(
  isConditionCompatibleWithTarget('selfHpBelow30', 'nearestEnemy'),
  false,
  '敵対象に自己HP条件が表示されます',
);
assert.equal(
  isInstructionCompatibleWithTarget(instructionById.get('pull-in'), 'nearestEnemy'),
  true,
  '敵単体に引き寄せを設定できません',
);
assert.equal(
  isInstructionCompatibleWithTarget(instructionById.get('pull-in'), 'allEnemies'),
  false,
  '単体引き寄せが敵全体と互換になっています',
);
assert.equal(
  isInstructionCompatibleWithTarget(instructionById.get('taunt'), 'allEnemies'),
  true,
  '固定対象アクションが条件対象で不正に制限されています',
);
assert.equal(
  selectConditionTargets('nearestAlly', volt, enemies, allies)[0]?.id,
  'bastion',
  '一番近い味方を選べません',
);
assert.equal(
  selectConditionTargets('lowestHpAlly', volt, enemies, allies)[0]?.id,
  'bastion',
  'HPが最も低い味方の選択に自分が混入しています',
);
assert.equal(
  selectConditionTargets('criticalAlly', volt, enemies, allies).length,
  0,
  'HP 30%を超える味方が危険域対象に含まれています',
);
assert.equal(
  selectConditionTargets(
    'criticalAlly',
    volt,
    enemies,
    allies.map((ally) => (ally.id === 'bastion' ? { ...ally, hp: ally.maxHp * 0.2 } : ally)),
  )[0]?.id,
  'bastion',
  'HP 30%以下の味方を選べません',
);
assert.equal(
  isInstructionCompatibleWithTarget(instructionById.get('field-repair'), 'nearestAlly'),
  true,
  '一番近い味方にヒールを設定できません',
);
assert.equal(
  isInstructionCompatibleWithTarget(instructionById.get('field-repair'), 'nearestEnemy'),
  false,
  '敵対象に回復アクションが表示されます',
);
assert.equal(
  isInstructionCompatibleWithTarget(instructionById.get('saturation-fire'), 'allEnemies'),
  true,
  '敵全体に一斉射撃を設定できません',
);
assert.equal(
  isInstructionCompatibleWithTarget(instructionById.get('saturation-fire'), 'nearestEnemy'),
  false,
  '敵全体固定スキルが単体対象へ表示されています',
);
assert.equal(
  actionCooldown(volt.speed),
  Math.max(BATTLE_CONFIG.minimumActionCooldownSeconds, BATTLE_CONFIG.baseActionCooldownSeconds / volt.speed),
);
const regeneratedGauge = tickCooldowns([{ ...volt, abilityGauge: BATTLE_CONFIG.abilityGaugeMax - 0.1 }], 1)[0]
  .abilityGauge;
assert.equal(regeneratedGauge, BATTLE_CONFIG.abilityGaugeMax, '時間回復したゲージが最大値を超えています');

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
assert.ok(plan.decisions.length > 0, '戦闘エンジンが指示判定のトレースを生成しません');
assert.doesNotThrow(() => JSON.stringify(plan.decisions), '指示判定トレースはシリアライズ可能である必要があります');
const applied = applyBattleStep(plan.fighters, plan.steps[0]);
assert.equal(applied.length, plan.fighters.length, '戦闘ステップ適用でユニット数が変化しました');

const repairTeam = [createInventoryUnit('relay', 'repair-relay'), createInventoryUnit('volt', 'repair-volt')];
repairTeam[0].program = [{ targetId: 'nearestAlly', conditionId: 'targetInRange', actionId: 'field-repair' }];
const repairFighters = createBattleFighters(repairTeam).map((fighter) => ({
  ...fighter,
  hp: fighter.instanceId === 'repair-volt' ? fighter.maxHp * 0.4 : fighter.hp,
  cooldown: fighter.instanceId === 'repair-relay' ? 0 : 10,
}));
const damagedAlly = repairFighters.find((fighter) => fighter.instanceId === 'repair-volt');
const repairPlan = planBattleFrame({
  fighters: repairFighters,
  team: repairTeam,
  dt: BATTLE_CONFIG.tickSeconds,
  elapsed: BATTLE_CONFIG.tickSeconds,
  previousElapsed: 0,
});
const repairStep = repairPlan.steps.find((step) => step.flash.kind === 'heal');
assert.ok(damagedAlly, '回復テストの対象味方を取得できません');
assert.ok(repairStep, 'ヒールが回復ステップを生成しません');
assert.equal(repairStep.updates[0]?.id, damagedAlly.instanceId, 'ヒールが一番近い味方を回復していません');
assert.equal(repairStep.updates[0]?.values.hp, damagedAlly.hp + 22, 'ヒール量がデータ定義と一致しません');

const farRepairTeam = [
  createInventoryUnit('relay', 'far-repair-relay'),
  createInventoryUnit('volt', 'far-repair-volt'),
];
farRepairTeam[0].program = [
  { targetId: 'nearestAlly', conditionId: 'targetInRange', actionId: 'field-repair' },
  { targetId: 'nearestAlly', conditionId: 'targetOutOfRange', actionId: 'approach' },
];
const farRepairFighters = createBattleFighters(farRepairTeam).map((fighter) => ({
  ...fighter,
  x: fighter.instanceId === 'far-repair-relay' ? 20 : fighter.instanceId === 'far-repair-volt' ? 60 : fighter.x,
  hp: fighter.instanceId === 'far-repair-volt' ? fighter.maxHp * 0.4 : fighter.hp,
  cooldown: fighter.instanceId === 'far-repair-relay' ? 0 : 10,
}));
const farRepairPlan = planBattleFrame({
  fighters: farRepairFighters,
  team: farRepairTeam,
  dt: BATTLE_CONFIG.tickSeconds,
  elapsed: BATTLE_CONFIG.tickSeconds,
  previousElapsed: 0,
});
assert.ok(!farRepairPlan.steps.some((step) => step.flash.kind === 'heal'), '射程範囲外の味方をヒールしています');
const repairApproachStep = farRepairPlan.steps.find((step) => step.flash.kind === 'move');
assert.ok(repairApproachStep, '射程範囲外の味方へ前進していません');
assert.equal(
  repairApproachStep.updates[0]?.id,
  'far-repair-relay',
  '味方ではなく行動ユニットを前進させる必要があります',
);
assert.equal(repairApproachStep.updates[0]?.values.x, 25.2, '味方へ向かう前進距離が不正です');

const lowestHpTeam = [createInventoryUnit('volt', 'lowest-hp-volt')];
lowestHpTeam[0].program = [{ targetId: 'lowestHpEnemy', conditionId: 'always', actionId: 'attack-low' }];
const lowestHpFighters = createBattleFighters(lowestHpTeam).map((fighter) => ({
  ...fighter,
  x: fighter.team === 'ally' ? 40 : fighter.id === 'relay' ? 46 : 48,
  hp: fighter.team === 'enemy' && fighter.id === 'bastion' ? fighter.maxHp * 0.2 : fighter.hp,
  cooldown: fighter.team === 'ally' ? 0 : 10,
}));
const lowestHpEnemy = lowestHpFighters.find((fighter) => fighter.team === 'enemy' && fighter.id === 'bastion');
const lowestHpPlan = planBattleFrame({
  fighters: lowestHpFighters,
  team: lowestHpTeam,
  dt: BATTLE_CONFIG.tickSeconds,
  elapsed: BATTLE_CONFIG.tickSeconds,
  previousElapsed: 0,
});
assert.ok(lowestHpEnemy, 'HP最低の敵をテスト用戦闘状態から取得できません');
assert.equal(
  lowestHpPlan.steps.find((step) => step.flash.kind === 'attack')?.flash.targetId,
  lowestHpEnemy.instanceId,
  '対象スロットで選んだHP最低の敵へ攻撃していません',
);

const jumpTeam = [createInventoryUnit('volt', 'jump-volt')];
jumpTeam[0].program = [{ targetId: 'nearestEnemy', conditionId: 'targetInRange', actionId: 'vault-over' }];
const jumpFighters = createBattleFighters(jumpTeam).map((fighter) => ({
  ...fighter,
  x: fighter.team === 'ally' ? 40 : fighter.id === 'relay' ? 48 : 72,
  abilityGauge: fighter.team === 'ally' ? BATTLE_CONFIG.abilityGaugeMax : fighter.abilityGauge,
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
assert.equal(
  jumpPlan.fighters.find((fighter) => fighter.instanceId === 'jump-volt')?.abilityGauge,
  BATTLE_CONFIG.abilityGaugeMax - (instructionById.get('vault-over')?.abilityCost ?? 0),
  'ジャンプ指示が設定コストを消費していません',
);

const throwTeam = [createInventoryUnit('volt', 'throw-volt')];
throwTeam[0].program = [{ targetId: 'nearestEnemy', conditionId: 'targetInRange', actionId: 'shoulder-throw' }];
const throwFighters = createBattleFighters(throwTeam).map((fighter) => ({
  ...fighter,
  x: fighter.team === 'ally' ? 40 : fighter.id === 'relay' ? 48 : 72,
  abilityGauge: fighter.team === 'ally' ? BATTLE_CONFIG.abilityGaugeMax : fighter.abilityGauge,
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
tauntTeam[0].program = [{ targetId: 'allEnemies', conditionId: 'always', actionId: 'taunt' }];
const tauntFighters = createBattleFighters(tauntTeam).map((fighter) => ({
  ...fighter,
  x: fighter.team === 'ally' ? 40 : fighter.id === 'relay' ? 48 : 72,
  abilityGauge: fighter.team === 'ally' ? BATTLE_CONFIG.abilityGaugeMax : fighter.abilityGauge,
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
assert.equal(
  tauntStep.updates.length,
  tauntFighters.filter((fighter) => fighter.team === 'enemy' && fighter.hp > 0).length,
  '挑発が生存中の敵全体へ適用されません',
);
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
pullTeam[0].program = [{ targetId: 'nearestEnemy', conditionId: 'targetOutOfRange', actionId: 'pull-in' }];
const pullInstruction = instructionById.get('pull-in');
assert.ok(pullInstruction);
assert.equal(actionRange(volt, pullInstruction), 40, '引き寄せの固定射程が40mになっていません');
const pullFighters = createBattleFighters(pullTeam).map((fighter) => ({
  ...fighter,
  x: fighter.team === 'ally' ? 40 : fighter.id === 'relay' ? 78 : 80,
  abilityGauge: fighter.team === 'ally' ? BATTLE_CONFIG.abilityGaugeMax : fighter.abilityGauge,
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

const farPullTeam = [createInventoryUnit('volt', 'far-pull-volt')];
farPullTeam[0].program = [
  { targetId: 'nearestEnemy', conditionId: 'targetOutOfRange', actionId: 'pull-in' },
  { targetId: 'nearestEnemy', conditionId: 'targetOutOfRange', actionId: 'approach' },
];
const farPullFighters = createBattleFighters(farPullTeam).map((fighter) => ({
  ...fighter,
  x: fighter.team === 'ally' ? 40 : fighter.id === 'relay' ? 82 : 84,
  cooldown: fighter.team === 'ally' ? 0 : 10,
}));
const farPullPlan = planBattleFrame({
  fighters: farPullFighters,
  team: farPullTeam,
  dt: BATTLE_CONFIG.tickSeconds,
  elapsed: BATTLE_CONFIG.tickSeconds,
  previousElapsed: 0,
});
assert.ok(!farPullPlan.steps.some((step) => step.flash.kind === 'pull'), '引き寄せが固有射程外の敵に発動しています');
assert.ok(
  !farPullPlan.steps.some((step) => step.flash.kind === 'miss'),
  '引き寄せの固有射程外で空振りが発生しています',
);
const fallbackMoveStep = farPullPlan.steps.find((step) => step.flash.kind === 'move');
assert.ok(fallbackMoveStep, '引き寄せの固有射程外で後続の前進が実行されません');
assert.equal(fallbackMoveStep.updates[0]?.values.x, 45.2, '後続の前進距離が不正です');

const costFallbackTeam = [createInventoryUnit('volt', 'cost-fallback-volt')];
costFallbackTeam[0].program = [
  { targetId: 'nearestEnemy', conditionId: 'targetInRange', actionId: 'knock-away' },
  { targetId: 'nearestEnemy', conditionId: 'targetInRange', actionId: 'attack-low' },
];
const costFallbackFighters = createBattleFighters(costFallbackTeam).map((fighter) => ({
  ...fighter,
  x: fighter.team === 'ally' ? 40 : fighter.id === 'relay' ? 48 : 72,
  abilityGauge: fighter.team === 'ally' ? 0 : fighter.abilityGauge,
  cooldown: fighter.team === 'ally' ? 0 : 10,
}));
const costFallbackPlan = planBattleFrame({
  fighters: costFallbackFighters,
  team: costFallbackTeam,
  dt: BATTLE_CONFIG.tickSeconds,
  elapsed: BATTLE_CONFIG.tickSeconds,
  previousElapsed: 0,
});
assert.ok(!costFallbackPlan.steps.some((step) => step.flash.kind === 'heavy'), 'コスト不足で大技を発動しています');
assert.ok(
  costFallbackPlan.steps.some((step) => step.flash.kind === 'attack'),
  'コスト不足時に後続の無料アクションへフォールバックしていません',
);
const costReport = summarizeDecisions(costFallbackPlan.decisions);
const knockAwayReport = costReport.find((row) => row.actionId === 'knock-away');
const attackReport = costReport.find((row) => row.actionId === 'attack-low');
assert.equal(knockAwayReport?.skipped.cost, 1, '戦闘レポートがコスト不足を集計できません');
assert.equal(attackReport?.executed, 1, '戦闘レポートが後続指示の実行を集計できません');

const rangedThrowTeam = [createInventoryUnit('arrow', 'ranged-throw-arrow')];
rangedThrowTeam[0].program = [
  { targetId: 'nearestEnemy', conditionId: 'targetInRange', actionId: 'shoulder-throw' },
  { targetId: 'nearestEnemy', conditionId: 'targetInRange', actionId: 'attack-low' },
];
const rangedThrowFighters = createBattleFighters(rangedThrowTeam).map((fighter) => ({
  ...fighter,
  x: fighter.team === 'ally' ? 40 : fighter.id === 'relay' ? 55 : 72,
  abilityGauge: fighter.team === 'ally' ? BATTLE_CONFIG.abilityGaugeMax : fighter.abilityGauge,
  cooldown: fighter.team === 'ally' ? 0 : 10,
}));
const rangedThrowActor = rangedThrowFighters.find((fighter) => fighter.instanceId === 'ranged-throw-arrow');
const shoulderThrowInstruction = instructionById.get('shoulder-throw');
assert.ok(rangedThrowActor && shoulderThrowInstruction);
assert.equal(
  actionRange(rangedThrowActor, shoulderThrowInstruction),
  9,
  '背負い投げの射程がアローの攻撃射程を継承しています',
);
const rangedThrowPlan = planBattleFrame({
  fighters: rangedThrowFighters,
  team: rangedThrowTeam,
  dt: BATTLE_CONFIG.tickSeconds,
  elapsed: BATTLE_CONFIG.tickSeconds,
  previousElapsed: 0,
});
assert.ok(
  !rangedThrowPlan.steps.some((step) => step.flash.kind === 'throw'),
  '遠距離攻撃射程内だけで背負い投げが発動しています',
);
assert.ok(
  rangedThrowPlan.steps.some((step) => step.flash.kind === 'attack'),
  '背負い投げの固定射程外で後続の通常攻撃へフォールバックしません',
);

const supportTeam = [createInventoryUnit('mender', 'support-mender'), createInventoryUnit('volt', 'support-volt')];
supportTeam[0].program = [{ targetId: 'lowestHpAlly', conditionId: 'targetInRange', actionId: 'field-repair' }];
const supportFighters = createBattleFighters(supportTeam).map((fighter) => ({
  ...fighter,
  x: fighter.instanceId === 'support-mender' ? 40 : fighter.instanceId === 'support-volt' ? 46 : fighter.x,
  hp: fighter.instanceId === 'support-volt' ? fighter.maxHp - 50 : fighter.hp,
  cooldown: fighter.instanceId === 'support-mender' ? 0 : 10,
}));
const supportPlan = planBattleFrame({
  fighters: supportFighters,
  team: supportTeam,
  dt: BATTLE_CONFIG.tickSeconds,
  elapsed: BATTLE_CONFIG.tickSeconds,
  previousElapsed: 0,
});
const supportHealStep = supportPlan.steps.find((step) => step.flash.kind === 'heal');
assert.equal(supportHealStep?.updates[0]?.values.hp, 100, 'サポート専用の34HP回復量が適用されていません');

const toxinTeam = [createInventoryUnit('toxin', 'status-toxin')];
const toxinFighters = createBattleFighters(toxinTeam).map((fighter) => ({
  ...fighter,
  x: fighter.team === 'ally' ? 40 : fighter.id === 'relay' ? 50 : 70,
}));
const toxinActor = toxinFighters.find((fighter) => fighter.instanceId === 'status-toxin');
const cleanStatusTarget = toxinFighters.find((fighter) => fighter.team === 'enemy' && fighter.id === 'relay');
const poisonAmplify = instructionById.get('corrosion-burst');
assert.ok(toxinActor && cleanStatusTarget && poisonAmplify);
const poisonedStatusTarget = { ...cleanStatusTarget, poison: 1 };
assert.equal(
  matchCondition('enemyHasStatus', toxinActor, [cleanStatusTarget]).length,
  0,
  '未付与の敵が状態条件に一致します',
);
assert.equal(matchCondition('enemyHasStatus', toxinActor, [poisonedStatusTarget]).length, 1, '毒状態を検出できません');
assert.ok(
  resolveActionImpact(toxinActor, poisonedStatusTarget, poisonAmplify).damage >
    resolveActionImpact(toxinActor, cleanStatusTarget, poisonAmplify).damage,
  '毒増幅の状態特効ダメージが適用されていません',
);

const multiTeam = [createInventoryUnit('arrow', 'multi-arrow')];
multiTeam[0].program = [{ targetId: 'allEnemies', conditionId: 'targetInRange', actionId: 'saturation-fire' }];
const multiFighters = createBattleFighters(multiTeam).map((fighter) => ({
  ...fighter,
  x: fighter.team === 'ally' ? 40 : fighter.id === 'relay' ? 50 : 58,
  abilityGauge: fighter.team === 'ally' ? BATTLE_CONFIG.abilityGaugeMax : fighter.abilityGauge,
  cooldown: fighter.team === 'ally' ? 0 : 10,
}));
const multiPlan = planBattleFrame({
  fighters: multiFighters,
  team: multiTeam,
  dt: BATTLE_CONFIG.tickSeconds,
  elapsed: BATTLE_CONFIG.tickSeconds,
  previousElapsed: 0,
});
const multiAttackSteps = multiPlan.steps.filter((step) => step.flash.actionLabel === '一斉射撃');
const expectedMultiTargets = multiFighters.filter((fighter) => fighter.team === 'enemy' && fighter.hp > 0).length;
assert.equal(multiAttackSteps.length, expectedMultiTargets, '一斉射撃が射程内の敵全体へ命中していません');
assert.equal(
  new Set(multiAttackSteps.map((step) => step.flash.targetId)).size,
  expectedMultiTargets,
  '複数対象が同じ敵へ重複しています',
);
assert.equal(
  multiPlan.fighters.find((fighter) => fighter.instanceId === 'multi-arrow')?.abilityGauge,
  BATTLE_CONFIG.abilityGaugeMax - (instructionById.get('saturation-fire')?.abilityCost ?? 0),
  '複数対象スキルが対象数分のコストを消費しています',
);
const multiDamageEvents = multiAttackSteps.flatMap((step) => (step.damage ? [step.damage] : []));
assert.equal(
  multiDamageEvents.length,
  expectedMultiTargets,
  '複数対象攻撃の実ダメージイベントが対象ごとに生成されません',
);
const multiDamageReport = summarizeDecisions(multiPlan.decisions, multiDamageEvents).find(
  (row) => row.actionId === 'saturation-fire',
);
assert.equal(
  multiDamageReport?.totalDamage,
  multiDamageEvents.reduce((total, event) => total + event.amount, 0),
  '戦闘レポートが技ごとの実ダメージを集計できません',
);
assert.ok((multiDamageReport?.totalDamage ?? 0) > 0, '戦闘レポートのダメージが0になっています');

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
assert.ok(
  shop.some((item) => item.kind === 'instruction' && item.id === 'field-repair'),
  'ヒールが初期ショップにありません',
);
assert.ok(
  shop.some((item) => item.kind === 'unit' && item.id === 'mender'),
  'サポートユニットが初期ショップにありません',
);
assert.ok(
  shop.some((item) => item.kind === 'unit' && item.id === 'toxin'),
  '状態異常ユニットが初期ショップにありません',
);
assert.ok(
  shop.some((item) => item.kind === 'instruction' && item.id === 'saturation-fire'),
  '複数対象スキルが初期ショップにありません',
);
assert.ok(!instructionById.has('emergency-repair'), '回復スキルが複数残っています');
assert.ok(instructionById.get('berserker-mode')?.params.speedScale === 3, 'バーサーカー倍率がデータ定義から読めません');
assert.deepEqual(
  Object.fromEntries(
    ['knock-away', 'vault-over', 'pull-in', 'field-repair', 'berserker-mode', 'volt-follow', 'tank-guard'].map((id) => [
      id,
      instructionById.get(id)?.abilityCost,
    ]),
  ),
  {
    'knock-away': 6,
    'vault-over': 4,
    'pull-in': 3,
    'field-repair': 2,
    'berserker-mode': 10,
    'volt-follow': 4,
    'tank-guard': 1,
  },
  '軽技・強技・奥義のコスト階層が不正です',
);

const debugBase = {
  actorUnitId: 'volt',
  instructionId: 'attack-low',
  conditionId: 'always',
  targetSelectorId: 'nearestEnemy',
  targetUnitId: 'bastion',
  mode: 'single',
  durationSeconds: 10,
  initialGauge: 8,
  actorHpRatio: 1,
  targetMaxHp: 1_000,
  targetDefense: 15,
  targetWeight: 14,
  targetRole: 'TANK',
  positionPresetId: DEBUG_TRAINING_CONFIG.defaultPositionPresetId,
  actorStatuses: createDefaultDebugStatuses(),
  targetStatuses: createDefaultDebugStatuses(),
};
const debugFighters = createDebugFighters(debugBase);
assert.equal(debugFighters.length, 2, 'デバッグルームが1対1の戦闘状態を作れていません');
const debugActor = debugFighters.find((fighter) => fighter.team === 'ally');
const debugTarget = debugFighters.find((fighter) => fighter.team === 'enemy');
assert.ok(debugActor && debugTarget, 'デバッグルームの攻撃側または敵側がありません');
assert.ok(
  Math.abs(debugActor.x - debugTarget.x) <= Math.min(debugActor.range, debugTarget.range),
  'デバッグルームの2体が相互の攻撃射程内に配置されていません',
);
const debugOutsideFighters = createDebugFighters({ ...debugBase, positionPresetId: 'actor-out-of-range' });
const debugOutsideActor = debugOutsideFighters.find((fighter) => fighter.team === 'ally');
const debugOutsideTarget = debugOutsideFighters.find((fighter) => fighter.team === 'enemy');
assert.ok(debugOutsideActor && debugOutsideTarget, '射程外プリセットの戦闘状態を作れません');
assert.ok(
  Math.abs(debugOutsideActor.x - debugOutsideTarget.x) > debugOutsideActor.range,
  '射程外プリセットが攻撃側の通常射程より外に配置されていません',
);
const debugSingle = runDebugSimulation(debugBase);
assert.equal(debugSingle.executions, 1, 'デバッグルームの単発テストが技を1回実行していません');
assert.equal(debugSingle.hits, 1, 'デバッグルームが実ダメージイベントを記録していません');
assert.ok(
  debugSingle.totalDamage > 0 && debugSingle.damagePerHit > 0,
  'デバッグルームが単発ダメージを集計していません',
);
const debugRecovery = runDebugSimulation({ ...debugBase, targetMaxHp: 10 });
assert.equal(
  debugRecovery.finalTargetHp,
  DEBUG_TRAINING_CONFIG.minimumDummyHp,
  '被弾した敵ユニットが最低HPで耐えていません',
);
assert.equal(debugRecovery.targetRecoveryCount, 1, '敵ユニットの自動回復回数を記録できていません');
assert.equal(debugRecovery.timeToKill, null, '自動回復する敵ユニットに撃破時間が記録されています');
assert.equal(
  debugRecovery.playback.at(-1)?.fighters.find((fighter) => fighter.team === 'enemy')?.hp,
  DEBUG_TRAINING_CONFIG.minimumDummyHp,
  'デバッグ再生で敵ユニットが最低HPを下回っています',
);

const debugMovement = runDebugSimulation({
  ...debugBase,
  instructionId: 'retreat',
  conditionId: 'targetInRange',
});
assert.ok(debugMovement.actorDisplacement > 0, 'デバッグルームが実行ユニットの移動量を計測していません');
assert.notEqual(
  debugMovement.playback.at(-1)?.fighters.find((fighter) => fighter.team === 'ally')?.x,
  debugActor.x,
  'デバッグ再生で実行ユニットの移動位置を保持していません',
);

const debugThrow = runDebugSimulation({
  ...debugBase,
  instructionId: 'shoulder-throw',
  conditionId: 'targetInRange',
  targetMaxHp: 10,
});
assert.ok(debugThrow.targetDisplacement > 0, '最低HPで耐えた敵に背負い投げの移動が反映されていません');
assert.ok(
  debugThrow.playback.some((frame) => frame.flash.kind === 'thrown'),
  'デバッグ再生に背負い投げの移動フレームがありません',
);

const debugTimeline = runDebugSimulation({
  ...debugBase,
  instructionId: 'toxic-mark',
  mode: 'timeline',
  durationSeconds: 30,
  targetMaxHp: 99_999,
});
assert.ok(debugTimeline.executions > 1, 'デバッグルームの継続テストが複数回の技を計測していません');
assert.equal(
  debugTimeline.costSpent,
  debugTimeline.executions * instructionById.get('toxic-mark').abilityCost,
  'デバッグルームの消費コスト集計が実行回数と一致しません',
);
assert.ok(
  debugTimeline.effectPerCost > 0 && debugTimeline.dps > 0,
  'デバッグルームがDPSとコスト効率を算出していません',
);
assert.ok(debugTimeline.finalTargetHp >= DEBUG_TRAINING_CONFIG.minimumDummyHp, '継続計測中に敵が撃破されています');
assert.ok(debugTimeline.targetRecoveryCount > 1, '継続計測中に3秒ごとのHP復元が予約されていません');

const debugGuarded = runDebugSimulation({
  ...debugBase,
  targetStatuses: { ...debugBase.targetStatuses, guarded: 1 },
});
assert.ok(debugGuarded.totalDamage < debugSingle.totalDamage, '敵に設定したガード状態が実ダメージへ反映されていません');

const debugActorStatuses = createDebugFighters({
  ...debugBase,
  actorStatuses: { ...debugBase.actorStatuses, poison: 2, guarded: 1, berserk: 1, taunted: 1 },
});
const configuredDebugActor = debugActorStatuses.find((fighter) => fighter.team === 'ally');
assert.ok(configuredDebugActor, '状態設定済みの攻撃側を作れません');
assert.equal(configuredDebugActor.poison, 2, '攻撃側の毒状態が反映されていません');
assert.equal(configuredDebugActor.guarded, true, '攻撃側のガード状態が反映されていません');
assert.equal(configuredDebugActor.berserk, true, '攻撃側のバーサーク状態が反映されていません');
assert.equal(configuredDebugActor.tauntTargetId, 'debug-target', '攻撃側の挑発状態が反映されていません');
assert.ok(configuredDebugActor.attack > debugActor.attack, '攻撃側のバーサーク強化が能力値へ反映されていません');

const debugPoison = runDebugSimulation({
  ...debugBase,
  actorUnitId: 'toxin',
  instructionId: 'toxic-mark',
});
assert.ok(debugPoison.finalPoison > 0, 'デバッグルームが毒スタックを計測していません');
assert.ok(
  (debugPoison.playback.at(-1)?.fighters.find((fighter) => fighter.team === 'enemy')?.poison ?? 0) > 0,
  'デバッグ再生が付与された毒状態を保持していません',
);

const debugHealingInput = {
  ...debugBase,
  actorUnitId: 'mender',
  instructionId: 'field-repair',
  conditionId: 'targetInRange',
  targetSelectorId: 'lowestHpAlly',
  targetMaxHp: 200,
  actorHpRatio: 0.3,
  targetDefense: 5,
  targetWeight: 5,
};
const debugHealing = runDebugSimulation(debugHealingInput);
assert.ok(debugHealing.totalHealing > 0, 'デバッグルームが味方への実回復量を計測していません');
assert.equal(debugHealing.verdict, 'healing', '回復テストの判定が回復になっていません');
assert.equal(createDebugFighters(debugHealingInput).length, 2, '回復技の計測が1対1ではありません');

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
assert.equal(balance.abilityMetrics.length, GAME_DATA.instructions.length, '全スキルのコスト効率を算出できません');
assert.ok(
  balance.abilityMetrics.find((metric) => metric.id === 'knock-away')?.costLimited,
  '大技がコスト回復速度で制限されていません',
);
const invalidData = structuredClone(GAME_DATA);
invalidData.defaultPrograms[0].actionIds = ['missing-action'];
const invalidReport = analyzeBalance(invalidData);
assert.ok(
  invalidReport.issues.some((issue) => issue.code === 'UNKNOWN_INSTRUCTION'),
  '壊れたスキル参照を静的検査で検出できません',
);
const invalidDebugTraining = structuredClone(GAME_DATA);
invalidDebugTraining.debugTraining.recoveryDelaySeconds = 0;
assert.ok(
  analyzeBalance(invalidDebugTraining).issues.some((issue) => issue.code === 'INVALID_DEBUG_TRAINING_CONFIG'),
  'デバッグ訓練の不正な回復待ち時間を検出できません',
);
const invalidCostData = structuredClone(GAME_DATA);
invalidCostData.instructions.find((instruction) => instruction.id === 'knock-away').abilityCost = 0;
const invalidCostReport = analyzeBalance(invalidCostData);
assert.ok(
  invalidCostReport.issues.some((issue) => issue.code === 'MISSING_ABILITY_COST'),
  '強力なスキルの無料化を静的検査で検出できません',
);
const invalidRangeData = structuredClone(GAME_DATA);
invalidRangeData.instructions.find((instruction) => instruction.id === 'shoulder-throw').params.fixedRange = 0;
const invalidRangeReport = analyzeBalance(invalidRangeData);
assert.ok(
  invalidRangeReport.issues.some((issue) => issue.code === 'INVALID_PARAMETER' || issue.code === 'MISSING_PARAMETER'),
  '接触スキルの不正な固定射程を静的検査で検出できません',
);

console.log(
  JSON.stringify({ fighters: fighters.length, steps: plan.steps.length, balanceWarnings: balance.warnings }, null, 2),
);
