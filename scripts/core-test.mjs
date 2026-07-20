import assert from 'node:assert/strict';
import { applyBattleStep, applyBattleSteps, isBattleComplete, planBattleFrame } from '../src/core/battle-engine.ts';
import { applyBattleZoneChanges } from '../src/core/battle-zones.ts';
import { analyzeBalance } from '../src/core/balance.ts';
import { applyInstructionFighterEffects, applyInstructionStatusEffects } from '../src/core/instruction-effects.ts';
import {
  applyEquipment,
  createBattleFighters,
  createInventoryUnit,
  equipmentActionIds,
  equipmentById,
  equipInventoryUnit,
  unitById,
} from '../src/core/roster.ts';
import {
  actionRange,
  conditionById,
  instructionById,
  instructionAltitudeReady,
  isConditionCompatibleWithTarget,
  isInstructionCompatibleWithTarget,
  matchCondition,
  resolveActionImpact,
  selectConditionTargets,
  targetSelectorById,
  tickCooldowns,
} from '../src/core/rules.ts';
import { createShop } from '../src/core/shop.ts';
import { applyStatus, consumeStatus, hasStatus, statusStacks, tickStatusDurations } from '../src/core/statuses.ts';
import {
  BATTLE_CONFIG,
  CONDITIONS,
  ENCOUNTERS,
  EQUIPMENT,
  GAME_DATA,
  INSTRUCTIONS,
  REACTION_TRIGGERS,
  ROSTER_CONFIG,
  SHOP_CONFIG,
  STATUSES,
  TARGET_SELECTORS,
  UNITS,
} from '../src/data.ts';

const plan = (fighters, team, overrides = {}) =>
  planBattleFrame({
    fighters,
    zones: [],
    team,
    dt: BATTLE_CONFIG.tickSeconds,
    elapsed: 1,
    previousElapsed: 1 - BATTLE_CONFIG.tickSeconds,
    ...overrides,
  });

const resolvePending = (battlePlan, team, previousElapsed = 1) => {
  const resolvesAt = Math.max(
    ...battlePlan.fighters.flatMap((fighter) => (fighter.pendingAction ? [fighter.pendingAction.resolvesAt] : [])),
  );
  assert.ok(Number.isFinite(resolvesAt), '解決対象の保留アクションがありません');
  return planBattleFrame({
    fighters: battlePlan.fighters,
    zones: battlePlan.zones,
    team,
    dt: resolvesAt - previousElapsed,
    elapsed: resolvesAt,
    previousElapsed,
  });
};

assert.equal(GAME_DATA.schemaVersion, 18, '空中戦スキーマがv18ではありません');
assert.equal(BATTLE_CONFIG.teamSize, 1, '標準戦闘が1vs1ではありません');
assert.equal(UNITS.length, 3, '手作業アニメーション対象が3体に絞られていません');
assert.deepEqual(UNITS.map((unit) => unit.id).sort(), ['bastion', 'relay', 'volt'], '1vs1で使用する3機体が不正です');
assert.deepEqual(ROSTER_CONFIG.startingUnitIds, ['volt'], '操作ユニットがヴォルト1体に固定されていません');
assert.equal(TARGET_SELECTORS.length, 2, '1vs1に不要な対象セレクタが残っています');
assert.deepEqual(
  TARGET_SELECTORS.map((target) => target.id).sort(),
  ['nearestEnemy', 'self'],
  '対象が「対戦相手」と「自分」に限定されていません',
);
assert.ok(!REACTION_TRIGGERS.some((trigger) => trigger.id === 'partnerAttackHit'), '相棒リアクションが残っています');
assert.ok(!CONDITIONS.some((condition) => condition.id.includes('partner')), '相棒条件が残っています');
assert.ok(!STATUSES.some((status) => status.id === 'taunted'), '1vs1で意味のない挑発状態が残っています');

for (const encounter of ENCOUNTERS) {
  assert.equal(encounter.enemyUnitIds.length, 1, `${encounter.id} が敵1体ではありません`);
  assert.equal(encounter.enemyEquipmentIds.length, 3, `${encounter.id} の敵装備が3枠ではありません`);
  assert.ok(encounter.enemyProgramActionIds.length > 0, `${encounter.id} に敵プログラムがありません`);
  for (const actionId of encounter.enemyProgramActionIds)
    assert.ok(instructionById.has(actionId), `${encounter.id} が未定義行動 ${actionId} を参照しています`);
}

const equipmentSlots = ['frame', 'weapon', 'chip'];
assert.deepEqual(
  ROSTER_CONFIG.startingEquipmentIds.map((id) => equipmentById.get(id)?.slot).sort(),
  [...equipmentSlots].sort(),
  '初期装備がframe・weapon・chipの3枠ではありません',
);
for (const equipment of EQUIPMENT) {
  assert.ok(equipmentSlots.includes(equipment.slot), `${equipment.id} の装備枠が不正です`);
  for (const actionId of equipment.grantsActionIds)
    assert.ok(instructionById.has(actionId), `${equipment.id} の解放行動 ${actionId} が未定義です`);
  if (equipment.defaultReaction)
    assert.ok(
      equipment.grantsActionIds.includes(equipment.defaultReaction.actionId),
      `${equipment.id} のリアクションが同じ装備から解放されません`,
    );
}

const baseVolt = unitById.get('volt');
assert.ok(baseVolt, 'ヴォルト定義がありません');
const heavyVolt = applyEquipment(baseVolt, ['bulwark-frame', 'pulse-edge', 'reactive-servo']);
const lightVolt = applyEquipment(baseVolt, ['vector-frame', 'pulse-edge', 'reactive-servo']);
assert.ok(heavyVolt.maxHp > baseVolt.maxHp && heavyVolt.defense > baseVolt.defense, '重装フレームが耐久を上げません');
assert.ok(heavyVolt.speed < baseVolt.speed && heavyVolt.weight > baseVolt.weight, '重装フレームに代償がありません');
assert.ok(lightVolt.speed > baseVolt.speed, '軽量フレームが速度を上げません');
assert.ok(lightVolt.maxHp < baseVolt.maxHp && lightVolt.defense < baseVolt.defense, '軽量フレームに代償がありません');
assert.ok(lightVolt.range < baseVolt.range, '軽量フレームに射程の代償がありません');
assert.ok(lightVolt.knockbackPower < baseVolt.knockbackPower, '軽量フレームにノックバックの代償がありません');

const volt = createInventoryUnit('volt', 'player-volt');
assert.equal(volt.equipmentIds.length, 3, '作戦ユニットへ初期装備が保存されません');
assert.ok(equipmentActionIds(volt.equipmentIds).includes('volt-follow'), '追撃サーボが追撃を解放しません');
assert.deepEqual(
  volt.reaction,
  { trigger: 'selfAttackHit', actionId: 'volt-follow' },
  '初期装備のリアクションが不正です',
);

const corrosionVolt = equipInventoryUnit(volt, 'corrosion-core');
assert.ok(corrosionVolt.range > volt.range, 'コロージョンコアが射程を伸ばしません');
assert.ok(corrosionVolt.attack < volt.attack, 'コロージョンコアに攻撃力の代償がありません');
assert.ok(
  equipmentActionIds(corrosionVolt.equipmentIds).includes('corrosion-burst'),
  'コロージョンコアが毒コンボを解放しません',
);
const repairedVolt = equipInventoryUnit(corrosionVolt, 'repair-chip');
assert.equal(repairedVolt.programLimit, volt.programLimit - 1, '自己修復チップの容量ペナルティが反映されません');
assert.ok(equipmentActionIds(repairedVolt.equipmentIds).includes('field-repair'), '自己修復が解放されません');

const fighters = createBattleFighters([volt], ENCOUNTERS[0]);
assert.equal(fighters.length, 2, '1vs1の戦闘状態が2体ではありません');
assert.equal(fighters.filter((fighter) => fighter.team === 'ally').length, 1, '自機が1体ではありません');
assert.equal(fighters.filter((fighter) => fighter.team === 'enemy').length, 1, '敵機が1体ではありません');
const enemy = fighters.find((fighter) => fighter.team === 'enemy');
assert.deepEqual(
  enemy?.program?.map((block) => block.actionId),
  ENCOUNTERS[0].enemyProgramActionIds,
  '遭遇ごとの敵プログラムが戦闘状態へ渡りません',
);
assert.deepEqual(enemy?.reaction, ENCOUNTERS[0].enemyReaction, '遭遇ごとの敵リアクションが戦闘状態へ渡りません');

const ally = fighters.find((fighter) => fighter.team === 'ally');
assert.ok(ally && enemy, '空中戦テスト用の戦闘機がありません');
const boostJump = instructionById.get('boost-jump');
const antiAirShot = instructionById.get('anti-air-shot');
const diveStrike = instructionById.get('dive-strike');
const launchUppercut = instructionById.get('launch-uppercut');
const groundAttack = instructionById.get('attack-low');
assert.ok(boostJump && antiAirShot && diveStrike && launchUppercut && groundAttack, '空中戦スキルが不足しています');

const airborneAlly = applyInstructionFighterEffects(ally, boostJump, ally.instanceId, 'actor');
assert.equal(airborneAlly.airborne?.remainingSeconds, 2.8, 'ブーストジャンプが滞空状態を開始しません');
const airborneApex = tickCooldowns([airborneAlly], 1.4)[0];
assert.equal(airborneApex.z, 18, '滞空軌道が中間点で設定高度へ達しません');
const landedAlly = tickCooldowns([airborneApex], 1.4)[0];
assert.equal(landedAlly.airborne, null, '滞空時間後に着地しません');
assert.equal(landedAlly.z, 0, '着地後の高さが0へ戻りません');

const airborneEnemy = { ...enemy, airborne: { remainingSeconds: 0.7, durationSeconds: 1.8, maxHeight: 14 }, z: 8 };
assert.equal(
  instructionAltitudeReady(groundAttack, ally, airborneEnemy),
  false,
  '通常の地上攻撃が空中の相手を狙えます',
);
assert.equal(instructionAltitudeReady(antiAirShot, ally, airborneEnemy), true, '対空射撃が空中の相手を狙えません');
assert.equal(
  matchCondition('targetLandingSoon', ally, [airborneEnemy])[0]?.instanceId,
  airborneEnemy.instanceId,
  '着地間際条件が残り滞空時間を判定しません',
);
const launchedEnemy = applyInstructionFighterEffects(enemy, launchUppercut, ally.instanceId, 'selected');
assert.equal(launchedEnemy.airborne?.remainingSeconds, 1.8, '打ち上げが相手を滞空状態にしません');
const landedDive = applyInstructionFighterEffects(airborneAlly, diveStrike, ally.instanceId, 'actor');
assert.equal(landedDive.airborne, null, '急降下攻撃が自機を着地させません');

const altitudeTeam = [createInventoryUnit('volt', 'altitude-volt')];
altitudeTeam[0].program = [{ targetId: 'nearestEnemy', conditionId: 'targetInRange', actionId: 'attack-low' }];
const altitudeFighters = createBattleFighters(altitudeTeam, ENCOUNTERS[0]).map((fighter) => ({
  ...fighter,
  x: fighter.team === 'ally' ? 45 : 50,
  actionLock: fighter.team === 'ally' ? 0 : 99,
  abilityGauge: BATTLE_CONFIG.abilityGaugeMax,
}));
const committedGroundAttack = plan(altitudeFighters, altitudeTeam);
const groundAttackActor = committedGroundAttack.fighters.find((fighter) => fighter.team === 'ally');
const groundAttackResolvesAt = groundAttackActor?.pendingAction?.resolvesAt;
assert.ok(groundAttackResolvesAt, '高度回避テストで通常攻撃がコミットされません');
const evasiveFighters = committedGroundAttack.fighters.map((fighter) =>
  fighter.team === 'enemy'
    ? {
        ...fighter,
        airborne: { remainingSeconds: 2, durationSeconds: 2, maxHeight: 14 },
        z: 1,
      }
    : fighter,
);
const evadedGroundAttack = planBattleFrame({
  fighters: evasiveFighters,
  zones: committedGroundAttack.zones,
  team: altitudeTeam,
  dt: groundAttackResolvesAt - 1,
  elapsed: groundAttackResolvesAt,
  previousElapsed: 1,
});
assert.ok(
  evadedGroundAttack.steps.some((step) => step.log?.text.includes('空振り（高度条件）')),
  '構えた後に離陸した相手へ地上攻撃が命中します',
);
assert.ok(!evadedGroundAttack.steps.some((step) => step.damage), '高度回避した相手へダメージが発生します');

altitudeTeam[0].program = [{ targetId: 'nearestEnemy', conditionId: 'targetAirborne', actionId: 'anti-air-shot' }];
const antiAirFighters = altitudeFighters.map((fighter) =>
  fighter.team === 'enemy'
    ? { ...fighter, airborne: { remainingSeconds: 3, durationSeconds: 3, maxHeight: 14 }, z: 8 }
    : { ...fighter, program: altitudeTeam[0].program },
);
const antiAirPlan = resolvePending(plan(antiAirFighters, altitudeTeam), altitudeTeam);
assert.ok(
  antiAirPlan.steps.some((step) => step.damage?.actionId === 'anti-air-shot'),
  '対空射撃が空中の相手へ命中しません',
);

const openingPlan = plan(
  fighters.map((fighter) => ({ ...fighter, actionLock: 0 })),
  [volt],
);
assert.deepEqual(
  openingPlan.decisions
    .filter((decision) => decision.actorId === volt.inventoryId && decision.outcome === 'executed')
    .map((decision) => decision.actionId),
  ['approach'],
  '同一ターンに複数の通常作戦を実行しています',
);
const asynchronousTeam = [createInventoryUnit('volt', 'async-volt')];
asynchronousTeam[0].program = [
  { targetId: 'nearestEnemy', conditionId: 'targetInRange', actionId: 'attack-low' },
  { targetId: 'nearestEnemy', conditionId: 'targetInRange', actionId: 'retreat' },
];
const asynchronousFighters = createBattleFighters(asynchronousTeam, ENCOUNTERS[0]).map((fighter) => ({
  ...fighter,
  x: fighter.team === 'ally' ? 45 : 50,
  actionLock: fighter.team === 'ally' ? 0 : 99,
}));
const firstAsynchronousPlan = plan(asynchronousFighters, asynchronousTeam);
const firstAsynchronousActor = firstAsynchronousPlan.fighters.find((fighter) => fighter.team === 'ally');
assert.ok((firstAsynchronousActor?.instructionCooldowns['attack-low'] ?? 0) > 0, '実行した通常攻撃のCDが始まりません');
assert.equal(firstAsynchronousActor?.instructionCooldowns.retreat ?? 0, 0, '未実行の後退CDまで始まっています');
assert.ok(firstAsynchronousActor?.pendingAction, '通常攻撃が発動待ち状態になりません');
const resolvedAsynchronousPlan = resolvePending(firstAsynchronousPlan, asynchronousTeam);
const resolvedAt = firstAsynchronousActor.pendingAction.resolvesAt;
const secondAsynchronousPlan = plan(resolvedAsynchronousPlan.fighters, asynchronousTeam, {
  dt: BATTLE_CONFIG.tickSeconds,
  elapsed: resolvedAt + BATTLE_CONFIG.tickSeconds,
  previousElapsed: resolvedAt,
});
assert.deepEqual(
  secondAsynchronousPlan.decisions
    .filter((decision) => decision.actorId === asynchronousTeam[0].inventoryId && decision.outcome === 'executed')
    .map((decision) => decision.actionId),
  ['retreat'],
  '先行指示のCD中に別の準備済み指示を実行できません',
);
assert.ok(
  (secondAsynchronousPlan.fighters.find((fighter) => fighter.team === 'ally')?.instructionCooldowns['attack-low'] ??
    0) > 0,
  '別指示の実行中に通常攻撃CDが並行して進みません',
);

const simultaneousTeam = [createInventoryUnit('volt', 'simultaneous-volt')];
simultaneousTeam[0].program = [{ targetId: 'nearestEnemy', conditionId: 'targetInRange', actionId: 'attack-low' }];
simultaneousTeam[0].reaction = null;
const simultaneousFighters = createBattleFighters(simultaneousTeam, ENCOUNTERS[0]).map((fighter) => ({
  ...fighter,
  hp: 1,
  x: fighter.team === 'ally' ? 45 : 50,
  speed: 1,
  actionLock: 0,
  program: [{ targetId: 'nearestEnemy', conditionId: 'targetInRange', actionId: 'attack-low' }],
  reaction: null,
}));
const simultaneousStart = plan(simultaneousFighters, simultaneousTeam);
const pendingActions = simultaneousStart.fighters.map((fighter) => fighter.pendingAction);
assert.ok(pendingActions.every(Boolean), '自機と敵機が同じフレームで発動を開始できません');
assert.equal(pendingActions[0]?.resolvesAt, pendingActions[1]?.resolvesAt, '同速の行動が同時着弾になりません');
const simultaneousImpact = resolvePending(simultaneousStart, simultaneousTeam);
const simultaneousDamage = simultaneousImpact.steps.filter((step) => step.damage?.source === 'normal');
assert.equal(simultaneousDamage.length, 2, '同時着弾した通常攻撃の片方が失われています');
assert.ok(
  simultaneousDamage[0]?.simultaneousGroup &&
    simultaneousDamage.every((step) => step.simultaneousGroup === simultaneousDamage[0].simultaneousGroup),
  '同時着弾が同一解決グループになっていません',
);
const mutualKnockout = applyBattleSteps(simultaneousImpact.fighters, simultaneousImpact.steps);
assert.ok(
  mutualKnockout.every((fighter) => fighter.hp === 0),
  '同時攻撃で相打ちが成立しません',
);

const actor = fighters.find((fighter) => fighter.team === 'ally');
assert.ok(actor && enemy, '1vs1ファイターを取得できません');
const enemies = [enemy];
const allies = [actor];
assert.equal(selectConditionTargets('nearestEnemy', actor, enemies, allies)[0]?.instanceId, enemy.instanceId);
assert.equal(selectConditionTargets('self', actor, enemies, allies)[0]?.instanceId, actor.instanceId);
assert.equal(targetSelectorById.get('nearestEnemy')?.label, '対戦相手');
assert.equal(isConditionCompatibleWithTarget('targetInRange', 'nearestEnemy'), true);
assert.equal(isConditionCompatibleWithTarget('targetInRange', 'self'), false);
assert.equal(isConditionCompatibleWithTarget('selfHpBelow50', 'self'), true);
assert.equal(isInstructionCompatibleWithTarget(instructionById.get('field-repair'), 'self'), true);
assert.equal(isInstructionCompatibleWithTarget(instructionById.get('field-repair'), 'nearestEnemy'), false);

const repairTeam = [equipInventoryUnit(createInventoryUnit('volt', 'repair-volt'), 'repair-chip')];
repairTeam[0].program = [{ targetId: 'self', conditionId: 'selfHpBelow50', actionId: 'field-repair' }];
const repairFighters = createBattleFighters(repairTeam, ENCOUNTERS[0]).map((fighter) => ({
  ...fighter,
  hp: fighter.team === 'ally' ? fighter.maxHp * 0.4 : fighter.hp,
  actionLock: fighter.team === 'ally' ? 0 : 99,
}));
const repairActor = repairFighters.find((fighter) => fighter.team === 'ally');
const repairPlan = resolvePending(plan(repairFighters, repairTeam), repairTeam);
const repairStep = repairPlan.steps.find((step) => step.flash.kind === 'heal');
assert.ok(repairStep && repairActor, '自己修復が回復ステップを生成しません');
assert.equal(repairStep.updates[0]?.id, repairActor.instanceId, '自己修復が自分を対象にしていません');
assert.ok(repairStep.updates[0]?.values.hp > repairActor.hp, '自己修復でHPが増えません');

const normalAttack = instructionById.get('attack-low');
const toxicMark = instructionById.get('toxic-mark');
const corrosionBurst = instructionById.get('corrosion-burst');
assert.ok(normalAttack && toxicMark && corrosionBurst, '毒コンボの行動定義がありません');
const poisonedOnce = applyInstructionStatusEffects(enemy, toxicMark, actor.instanceId, 'selected');
const poisonedTwice = applyInstructionStatusEffects(poisonedOnce, toxicMark, actor.instanceId, 'selected');
assert.equal(statusStacks(poisonedTwice, 'poison'), 2, '毒が2スタックしません');
assert.equal(matchCondition('enemyHasStatus', actor, [poisonedTwice]).length, 1, '毒2条件を検出できません');
assert.ok(
  resolveActionImpact(actor, poisonedTwice, corrosionBurst).damage >
    resolveActionImpact(actor, enemy, corrosionBurst).damage,
  '毒増幅にボーナスダメージがありません',
);
const consumedPoison = applyInstructionStatusEffects(poisonedTwice, corrosionBurst, actor.instanceId, 'selected');
assert.equal(statusStacks(consumedPoison, 'poison'), 0, '毒増幅が2スタックを消費しません');

const vulnerable = applyInstructionStatusEffects(
  enemy,
  instructionById.get('reveal-weakness'),
  actor.instanceId,
  'selected',
);
assert.ok(hasStatus(vulnerable, 'vulnerable'), '脆弱を付与できません');
assert.ok(
  resolveActionImpact(actor, vulnerable, normalAttack).damage > resolveActionImpact(actor, enemy, normalAttack).damage,
  '脆弱で被ダメージが増えません',
);
const slowed = applyInstructionStatusEffects(enemy, instructionById.get('coolant-shot'), actor.instanceId, 'selected');
assert.ok(hasStatus(slowed, 'slowed') && slowed.speed < enemy.speed, '冷却弾が鈍足を付与しません');
const expiredSlow = tickStatusDurations(slowed, 5.1);
assert.ok(!hasStatus(expiredSlow, 'slowed') && expiredSlow.speed === enemy.speed, '鈍足が期限後に戻りません');

const guarded = applyInstructionStatusEffects(actor, instructionById.get('tank-guard'), actor.instanceId, 'actor');
assert.ok(hasStatus(guarded, 'guarded'), 'ガード状態を付与できません');
assert.ok(
  resolveActionImpact(enemy, guarded, normalAttack).damage < resolveActionImpact(enemy, actor, normalAttack).damage,
  'ガードが被ダメージを軽減しません',
);
const berserk = applyStatus({ ...actor, hp: actor.maxHp * 0.25 }, 'berserk', { sourceId: actor.instanceId });
assert.ok(berserk.attack > actor.attack && berserk.speed > actor.speed, 'バーサークが攻撃力と速度を上げません');

const zoneTeam = [equipInventoryUnit(createInventoryUnit('volt', 'zone-volt'), 'corrosion-core')];
zoneTeam[0].program = [{ targetId: 'nearestEnemy', conditionId: 'always', actionId: 'throw-toxic-flask' }];
const zoneFighters = createBattleFighters(zoneTeam, ENCOUNTERS[0]).map((fighter) => ({
  ...fighter,
  actionLock: fighter.team === 'ally' ? 0 : 99,
}));
const zonePlan = resolvePending(plan(zoneFighters, zoneTeam), zoneTeam);
assert.ok(
  zonePlan.steps.some((step) => step.zoneChanges?.some((change) => change.kind === 'add')),
  '毒エリアを設置できません',
);
const zoneState = zonePlan.steps.reduce((zones, step) => applyBattleZoneChanges(zones, step.zoneChanges), []);
assert.equal(zoneState.length, 1, '設置エリアが戦闘状態へ反映されません');

const followTeam = [createInventoryUnit('volt', 'follow-volt')];
followTeam[0].program = [{ targetId: 'nearestEnemy', conditionId: 'targetInRange', actionId: 'attack-low' }];
const followFighters = createBattleFighters(followTeam, ENCOUNTERS[0]).map((fighter) => ({
  ...fighter,
  x: fighter.team === 'ally' ? 45 : 50,
  actionLock: fighter.team === 'ally' ? 0 : 99,
  abilityGauge: BATTLE_CONFIG.abilityGaugeMax,
}));
const followPlan = resolvePending(plan(followFighters, followTeam), followTeam);
assert.ok(
  followPlan.steps.some((step) => step.damage?.source === 'normal'),
  '通常攻撃が実行されません',
);
assert.ok(
  followPlan.steps.some((step) => step.damage?.source === 'reaction'),
  '追撃リアクションが実行されません',
);

const defeated = fighters.map((fighter) => (fighter.team === 'enemy' ? { ...fighter, hp: 0 } : fighter));
assert.equal(isBattleComplete(defeated), true, '敵1体の撃破で1vs1が完了しません');
const harmless = {
  flash: { id: actor.instanceId, kind: 'wait', n: 0 },
  updates: [{ id: actor.instanceId, values: { hp: 1 } }],
};
assert.equal(applyBattleStep(fighters, harmless).find((fighter) => fighter.instanceId === actor.instanceId)?.hp, 1);
const simultaneousHpBase = [{ ...actor, hp: 50 }];
const simultaneousHpSteps = [
  {
    flash: { id: actor.instanceId, kind: 'heal', n: 0 },
    simultaneousGroup: 'hp-test',
    updates: [{ id: actor.instanceId, values: { hp: 60 } }],
  },
  {
    flash: { id: enemy.instanceId, kind: 'attack', targetId: actor.instanceId, n: 0 },
    simultaneousGroup: 'hp-test',
    updates: [{ id: actor.instanceId, values: { hp: 43 } }],
  },
];
assert.equal(
  applyBattleSteps(simultaneousHpBase, simultaneousHpSteps)[0]?.hp,
  53,
  '同時回復と被ダメージが解決前HPへの差分合算になりません',
);

for (let seed = 1; seed <= 20; seed += 1) {
  const shop = createShop(seed, [], ROSTER_CONFIG.startingEquipmentIds);
  assert.equal(shop.length, SHOP_CONFIG.size, `seed ${seed} のショップが4枠ではありません`);
  assert.equal(new Set(shop.map((item) => item.id)).size, shop.length, `seed ${seed} のショップに重複があります`);
  assert.equal(shop.filter((item) => item.kind === 'equipment').length, 2, '装備が2枠ではありません');
  assert.equal(shop.filter((item) => item.kind === 'instruction').length, 2, 'スキルが2枠ではありません');
  assert.ok(!shop.some((item) => ROSTER_CONFIG.startingEquipmentIds.includes(item.id)), '初期装備が再排出されました');
}

const balance = analyzeBalance(GAME_DATA);
assert.equal(balance.errors, 0, `バランス検証エラー: ${balance.issues.map((issue) => issue.message).join(' / ')}`);
assert.doesNotThrow(
  () => JSON.stringify({ fighters, encounters: ENCOUNTERS, equipment: EQUIPMENT }),
  '1vs1データを直列化できません',
);

console.log(
  JSON.stringify({
    schemaVersion: GAME_DATA.schemaVersion,
    mode: `${BATTLE_CONFIG.teamSize}vs${BATTLE_CONFIG.teamSize}`,
    units: UNITS.length,
    equipment: EQUIPMENT.length,
    instructions: INSTRUCTIONS.length,
    encounters: ENCOUNTERS.length,
    balanceWarnings: balance.warnings,
  }),
);
