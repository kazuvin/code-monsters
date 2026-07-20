import assert from 'node:assert/strict';
import { applyBattleStep, applyBattleSteps, isBattleComplete, planBattleFrame } from '../src/core/battle-engine.ts';
import { analyzeBalance } from '../src/core/balance.ts';
import { pathEntersZone } from '../src/core/battle-zones.ts';
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
  conditionById,
  instructionById,
  isConditionCompatibleWithTarget,
  isInstructionCompatibleWithTarget,
  matchCondition,
  resolveActionImpact,
  selectConditionTargets,
  targetSelectorById,
  tickCooldowns,
} from '../src/core/rules.ts';
import { createShop } from '../src/core/shop.ts';
import {
  advanceProjectile,
  createProjectile,
  projectileInBounds,
  projectileIntersectsFighter,
  resolveAttackShape,
  shapeIntersectsFighter,
} from '../src/core/spatial-combat.ts';
import { applyStatus, hasStatus, statusStacks, tickStatusDurations } from '../src/core/statuses.ts';
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
    projectiles: [],
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
    projectiles: battlePlan.projectiles,
    team,
    dt: resolvesAt - previousElapsed,
    elapsed: resolvesAt,
    previousElapsed,
  });
};

const makeDuel = ({ actionId, actorX = 40, targetX = 50, actorY = 0, targetY = 0 }) => {
  const team = [createInventoryUnit('volt', `test-${actionId}`)];
  team[0].program = [{ targetId: 'nearestEnemy', conditionId: 'always', actionId }];
  team[0].reaction = null;
  const fighters = createBattleFighters(team, ENCOUNTERS[0]).map((fighter) => ({
    ...fighter,
    x: fighter.team === 'ally' ? actorX : targetX,
    y: fighter.team === 'ally' ? actorY : targetY,
    vx: 0,
    vy: 0,
    actionLock: fighter.team === 'ally' ? 0 : 99,
    abilityGauge: BATTLE_CONFIG.abilityGaugeMax,
    reaction: null,
  }));
  return { team, fighters };
};

assert.equal(GAME_DATA.schemaVersion, 20, '放物投擲を含む戦闘スキーマがv20ではありません');
assert.equal(BATTLE_CONFIG.teamSize, 1, '標準戦闘が1vs1ではありません');
assert.ok(BATTLE_CONFIG.gravityPerSecond > 0 && BATTLE_CONFIG.ceilingY > BATTLE_CONFIG.floorY, '物理定数が不正です');
assert.equal(UNITS.length, 3, '手作業アニメーション対象が3体に絞られていません');
assert.deepEqual(UNITS.map((unit) => unit.id).sort(), ['bastion', 'relay', 'volt']);
assert.deepEqual(ROSTER_CONFIG.startingUnitIds, ['volt']);
assert.deepEqual(TARGET_SELECTORS.map((target) => target.id).sort(), ['nearestEnemy', 'self']);
assert.ok(!REACTION_TRIGGERS.some((trigger) => trigger.id === 'partnerAttackHit'));
assert.ok(!CONDITIONS.some((condition) => condition.id.includes('partner')));
assert.ok(!STATUSES.some((status) => status.id === 'taunted'));
assert.ok(
  INSTRUCTIONS.every((instruction) => instruction.tone !== 'gray'),
  '旧グレー系スキルが残っています',
);
assert.ok(
  INSTRUCTIONS.every((instruction) => !('altitude' in instruction) && !('range' in instruction)),
  'スキルに地上・空中または固定射程の判定が残っています',
);
assert.ok(
  !INSTRUCTIONS.some((instruction) =>
    instruction.effects.some((effect) => ['airborne', 'land', 'move'].includes(effect.kind)),
  ),
  '旧高度・移動効果が残っています',
);

for (const encounter of ENCOUNTERS) {
  assert.equal(encounter.enemyUnitIds.length, 1, `${encounter.id} が敵1体ではありません`);
  assert.equal(encounter.enemyEquipmentIds.length, 3, `${encounter.id} の敵装備が3枠ではありません`);
  for (const actionId of encounter.enemyProgramActionIds)
    assert.ok(instructionById.has(actionId), `${encounter.id} が未定義行動 ${actionId} を参照しています`);
}

const equipmentSlots = ['frame', 'weapon', 'chip'];
assert.deepEqual(
  ROSTER_CONFIG.startingEquipmentIds.map((id) => equipmentById.get(id)?.slot).sort(),
  [...equipmentSlots].sort(),
);
for (const equipment of EQUIPMENT) {
  for (const actionId of equipment.grantsActionIds)
    assert.ok(instructionById.has(actionId), `${equipment.id} の解放行動 ${actionId} が未定義です`);
}

const baseVolt = unitById.get('volt');
assert.ok(baseVolt, 'ヴォルト定義がありません');
const heavyVolt = applyEquipment(baseVolt, ['bulwark-frame', 'pulse-edge', 'reactive-servo']);
const lightVolt = applyEquipment(baseVolt, ['vector-frame', 'pulse-edge', 'reactive-servo']);
assert.ok(heavyVolt.maxHp > baseVolt.maxHp && heavyVolt.defense > baseVolt.defense);
assert.ok(heavyVolt.speed < baseVolt.speed && heavyVolt.weight > baseVolt.weight);
assert.ok(lightVolt.speed > baseVolt.speed && lightVolt.maxHp < baseVolt.maxHp);

const volt = createInventoryUnit('volt', 'player-volt');
assert.equal(volt.equipmentIds.length, 3);
assert.ok(equipmentActionIds(volt.equipmentIds).includes('counter-orb'));
assert.deepEqual(volt.reaction, { trigger: 'selfAttackHit', actionId: 'counter-orb' });
const corrosionVolt = equipInventoryUnit(volt, 'corrosion-core');
assert.ok(equipmentActionIds(corrosionVolt.equipmentIds).includes('corrosion-column'));
const repairedVolt = equipInventoryUnit(corrosionVolt, 'repair-chip');
assert.equal(repairedVolt.programLimit, volt.programLimit - 1);
assert.ok(equipmentActionIds(repairedVolt.equipmentIds).includes('field-repair'));

const fighters = createBattleFighters([volt], ENCOUNTERS[0]);
const actor = fighters.find((fighter) => fighter.team === 'ally');
const enemy = fighters.find((fighter) => fighter.team === 'enemy');
assert.ok(actor && enemy, '1vs1ファイターを取得できません');
assert.equal(fighters.length, 2);
assert.ok('y' in actor && 'vx' in actor && 'vy' in actor && !('airborne' in actor) && !('z' in actor));

const jumpJet = instructionById.get('jump-jet');
const hoverDrive = instructionById.get('hover-drive');
const airDash = instructionById.get('air-dash');
const vectorThrust = instructionById.get('vector-thrust');
assert.ok(jumpJet && hoverDrive && airDash && vectorThrust, '座標ベースの移動スキルが不足しています');
const launched = applyInstructionFighterEffects(actor, jumpJet, actor.instanceId, 'actor', { direction: 1 });
assert.deepEqual([launched.vx, launched.vy], [12, 54], 'ジャンプが現在速度へ大跳躍の推進を加えません');
const groundThrust = applyInstructionFighterEffects(actor, vectorThrust, actor.instanceId, 'actor', {
  direction: 1,
});
assert.equal(groundThrust.vy, actor.vy + 20, '地上付近の接近推力が小さな上向き弧を作りません');
const rising = tickCooldowns([launched], 0.5)[0];
assert.ok(rising.x > actor.x && rising.y > actor.y && rising.vy < launched.vy, '重力軌道で前進・上昇しません');
const thrustWhileRising = applyInstructionFighterEffects(rising, vectorThrust, actor.instanceId, 'actor', {
  direction: 1,
});
assert.equal(thrustWhileRising.vy, rising.vy, '高所の接近推力が現在の上下軌道を不自然に変えます');
assert.ok(thrustWhileRising.vx > rising.vx, '接近推力が現在の水平軌道へ加速を合成しません');
let landed = launched;
let peakHeight = launched.y;
for (let index = 0; index < 100; index += 1) {
  [landed] = tickCooldowns([landed], BATTLE_CONFIG.tickSeconds);
  peakHeight = Math.max(peakHeight, landed.y);
  if (index > 0 && landed.y <= BATTLE_CONFIG.floorY && landed.vy === 0) break;
}
assert.ok(peakHeight >= 39, 'ジャンプが地上弾を越える十分な高さへ到達しません');
assert.equal(landed.y, BATTLE_CONFIG.floorY, '重力で床へ戻りません');
assert.equal(landed.vy, 0, '床との衝突で垂直速度が止まりません');
const hovering = applyInstructionFighterEffects(actor, hoverDrive, actor.instanceId, 'actor');
assert.equal(hovering.vy, actor.vy + 18);
assert.equal(hovering.gravityScale, 0.28);
assert.equal(hovering.gravityScaleRemaining, 2.2);
const airborneDash = applyInstructionFighterEffects({ ...rising, y: 12 }, airDash, actor.instanceId, 'actor', {
  direction: 1,
});
assert.equal(airborneDash.y, 12, '空中ダッシュが現在Y座標を上書きします');
assert.ok(airborneDash.vx > 0, '空中ダッシュが水平速度を作りません');
assert.equal(airborneDash.vy, rising.vy + 4, '空中ダッシュが現在の上下軌道へ推進を合成しません');

assert.equal(matchCondition('selfHeightAbove8', { ...actor, y: 9 }, [enemy]).length, 1);
assert.equal(matchCondition('selfHeightBelow3', { ...actor, y: 2 }, [enemy]).length, 1);
assert.equal(matchCondition('targetHeightAbove8', actor, [{ ...enemy, y: 9 }]).length, 1);
assert.equal(matchCondition('selfDescending', { ...actor, vy: -5 }, [enemy]).length, 1);
assert.equal(matchCondition('targetNear12', actor, [{ ...enemy, x: actor.x + 6, y: actor.y + 8 }]).length, 1);
assert.equal(matchCondition('targetNear12', actor, [{ ...enemy, x: actor.x + 12, y: actor.y + 12 }]).length, 0);

const verticalLance = instructionById.get('vertical-lance');
const impactRing = instructionById.get('impact-ring');
assert.ok(verticalLance && impactRing);
const lance = resolveAttackShape(verticalLance, { ...actor, x: 40 }, { ...enemy, x: 70 });
assert.deepEqual(lance, { kind: 'box', x: 50, y: actor.y, width: 20, height: null });
assert.equal(shapeIntersectsFighter(lance, { ...enemy, x: 55, y: 42 }), true, '無限高の矩形が高所へ届きません');
assert.equal(shapeIntersectsFighter(lance, { ...enemy, x: 70, y: 0 }), false, '矩形の外側へ命中します');
const ring = resolveAttackShape(impactRing, { ...actor, x: 40, y: 0 }, { ...enemy, x: 50 });
assert.ok(ring?.kind === 'circle');
assert.equal(shapeIntersectsFighter(ring, { ...enemy, x: 46, y: 4 }), true);
assert.equal(shapeIntersectsFighter(ring, { ...enemy, x: 60, y: 20 }), false);
assert.equal(pathEntersZone({ x: 20, y: 0 }, { x: 80, y: 20 }, { x: 50, y: 10 }, 4), true);
assert.equal(pathEntersZone({ x: 20, y: 0 }, { x: 80, y: 0 }, { x: 50, y: 10 }, 4), false);

const pulseBolt = instructionById.get('pulse-bolt');
const seekerOrb = instructionById.get('seeker-orb');
assert.ok(pulseBolt?.delivery?.kind === 'projectile' && seekerOrb?.delivery?.kind === 'projectile');
const direct = createProjectile(pulseBolt, pulseBolt.delivery, { ...actor, x: 20, y: 0 }, { ...enemy, x: 80 }, 1, 0);
const advancedDirect = advanceProjectile(direct, enemy, 0.5);
assert.ok(advancedDirect.x > direct.x && Math.abs(advancedDirect.vy - direct.vy) < 0.0001);
let groundShot = createProjectile(
  pulseBolt,
  pulseBolt.delivery,
  { ...enemy, x: 20, y: BATTLE_CONFIG.floorY },
  { ...actor, x: 80, y: BATTLE_CONFIG.floorY },
  1,
  1,
);
let jumpingTarget = applyInstructionFighterEffects(
  { ...actor, x: 80, y: BATTLE_CONFIG.floorY },
  jumpJet,
  actor.instanceId,
  'actor',
  { direction: -1 },
);
let groundShotHit = false;
for (let index = 0; index < 30 && projectileInBounds(groundShot); index += 1) {
  const previous = groundShot;
  groundShot = advanceProjectile(previous, jumpingTarget, BATTLE_CONFIG.tickSeconds);
  [jumpingTarget] = tickCooldowns([jumpingTarget], BATTLE_CONFIG.tickSeconds);
  groundShotHit ||= projectileIntersectsFighter(previous, groundShot, jumpingTarget);
}
assert.equal(groundShotHit, false, '大跳躍中の対象へ発射済み地上直進弾が命中します');
assert.equal(
  projectileIntersectsFighter({ ...direct, x: 40, y: 0 }, { ...direct, x: 60, y: 0 }, { ...enemy, x: 50, y: 0 }),
  true,
  '高速弾の掃引衝突を検出できません',
);
const homing = createProjectile(seekerOrb, seekerOrb.delivery, { ...actor, x: 20 }, { ...enemy, x: 60 }, 1, 0);
const curved = advanceProjectile(homing, { ...enemy, x: 35, y: 30 }, 0.25);
assert.ok(curved.vy > homing.vy, '追尾弾が有限旋回で目標方向へ曲がりません');

const shapeHitDuel = makeDuel({ actionId: 'vertical-lance', actorX: 40, targetX: 55, targetY: 35 });
const shapeHit = resolvePending(plan(shapeHitDuel.fighters, shapeHitDuel.team), shapeHitDuel.team);
assert.ok(shapeHit.steps.some((step) => step.damage?.actionId === 'vertical-lance'));
assert.ok(shapeHit.steps.some((step) => step.flash.shape?.kind === 'box'));
const shapeMissDuel = makeDuel({ actionId: 'vertical-lance', actorX: 30, targetX: 70 });
const shapeMiss = resolvePending(plan(shapeMissDuel.fighters, shapeMissDuel.team), shapeMissDuel.team);
assert.ok(shapeMiss.steps.some((step) => step.flash.kind === 'miss'));
assert.ok(!shapeMiss.steps.some((step) => step.damage));

const projectileDuel = makeDuel({ actionId: 'pulse-bolt', actorX: 25, targetX: 70 });
const projectileLaunch = resolvePending(plan(projectileDuel.fighters, projectileDuel.team), projectileDuel.team);
assert.equal(projectileLaunch.projectiles.length, 1, '直進弾が独立オブジェクトとして生成されません');
assert.ok(!projectileLaunch.steps.some((step) => step.damage), '発射時点で即時ダメージが発生します');
let projectilePlan = {
  ...projectileLaunch,
  fighters: projectileLaunch.fighters.map((fighter) => ({ ...fighter, actionLock: 99 })),
};
let projectileHit = false;
let projectileMoved = false;
let projectileElapsed = Math.max(...projectileLaunch.fighters.map((fighter) => fighter.pendingAction?.resolvesAt ?? 1));
for (let index = 0; index < 60 && !projectileHit; index += 1) {
  const previousX = projectilePlan.projectiles[0]?.x;
  const previousElapsed = projectileElapsed;
  projectileElapsed += BATTLE_CONFIG.tickSeconds;
  projectilePlan = planBattleFrame({
    fighters: projectilePlan.fighters,
    zones: projectilePlan.zones,
    projectiles: projectilePlan.projectiles,
    team: projectileDuel.team,
    dt: BATTLE_CONFIG.tickSeconds,
    elapsed: projectileElapsed,
    previousElapsed,
  });
  if (previousX !== undefined && projectilePlan.projectiles[0]?.x !== previousX) projectileMoved = true;
  projectileHit ||= projectilePlan.steps.some((step) => step.damage?.source === 'projectile');
}
assert.equal(projectileMoved, true, '演出ステップを適用しなくても弾の時間が進みません');
assert.equal(projectileHit, true, '直進弾が時間経過後に接触しません');

const fieldDuel = makeDuel({ actionId: 'corrosion-field', actorX: 25, targetX: 70, targetY: 30 });
const fieldLaunch = resolvePending(plan(fieldDuel.fighters, fieldDuel.team), fieldDuel.team);
assert.equal(fieldLaunch.zones.length, 0, '腐食弾の投擲時点で空中に毒床が生成されます');
assert.equal(fieldLaunch.projectiles.length, 1, '腐食弾が独立した投擲物として生成されません');
assert.equal(fieldLaunch.projectiles[0].trajectory, 'ballistic');
assert.equal(fieldLaunch.projectiles[0].impact, 'floor');
let fieldPlan = {
  ...fieldLaunch,
  fighters: fieldLaunch.fighters.map((fighter) => ({ ...fighter, actionLock: 99 })),
};
let fieldElapsed = Math.max(...fieldLaunch.fighters.map((fighter) => fighter.pendingAction?.resolvesAt ?? 1));
let lobPeak = fieldLaunch.projectiles[0].y;
let landingStepSeen = false;
for (let index = 0; index < 40 && fieldPlan.zones.length === 0; index += 1) {
  const previousElapsed = fieldElapsed;
  fieldElapsed += BATTLE_CONFIG.tickSeconds;
  fieldPlan = planBattleFrame({
    fighters: fieldPlan.fighters,
    zones: fieldPlan.zones,
    projectiles: fieldPlan.projectiles,
    team: fieldDuel.team,
    dt: BATTLE_CONFIG.tickSeconds,
    elapsed: fieldElapsed,
    previousElapsed,
  });
  lobPeak = Math.max(lobPeak, ...fieldPlan.projectiles.map((projectile) => projectile.y));
  landingStepSeen ||= fieldPlan.steps.some((step) => step.flash.actionLabel?.includes('着地'));
}
assert.ok(lobPeak > 8, '腐食弾が放物線の高さを作りません');
assert.equal(fieldPlan.projectiles.length, 0, '着地した腐食弾が投擲物として残っています');
assert.equal(fieldPlan.zones.length, 1, '腐食弾の着地時に毒床が生成されません');
assert.equal(fieldPlan.zones[0].y, BATTLE_CONFIG.floorY, '毒床が地面以外のY座標へ生成されます');
assert.ok(Math.abs(fieldPlan.zones[0].x - 70) <= 2, '毒床が投擲時に狙ったX座標へ着地しません');
assert.equal(landingStepSeen, true, '腐食弾の着地イベントが演出ストリームへ出力されません');

const simultaneousTeam = [createInventoryUnit('volt', 'simultaneous-volt')];
simultaneousTeam[0].program = [{ targetId: 'nearestEnemy', conditionId: 'always', actionId: 'pulse-swipe' }];
simultaneousTeam[0].reaction = null;
const simultaneousFighters = createBattleFighters(simultaneousTeam, ENCOUNTERS[0]).map((fighter) => ({
  ...fighter,
  hp: 1,
  x: fighter.team === 'ally' ? 45 : 50,
  y: 0,
  speed: 1,
  actionLock: 0,
  program: [{ targetId: 'nearestEnemy', conditionId: 'always', actionId: 'pulse-swipe' }],
  reaction: null,
}));
const simultaneousStart = plan(simultaneousFighters, simultaneousTeam);
assert.ok(
  simultaneousStart.fighters.every((fighter) => fighter.pendingAction),
  '自機と敵機が同時に構えません',
);
assert.equal(
  simultaneousStart.fighters[0].pendingAction.resolvesAt,
  simultaneousStart.fighters[1].pendingAction.resolvesAt,
);
const simultaneousImpact = resolvePending(simultaneousStart, simultaneousTeam);
const simultaneousDamage = simultaneousImpact.steps.filter((step) => step.damage?.source === 'normal');
assert.equal(simultaneousDamage.length, 2, '同時解決で片方の攻撃が失われています');
assert.ok(simultaneousDamage.every((step) => step.simultaneousGroup === simultaneousDamage[0].simultaneousGroup));
assert.ok(
  simultaneousImpact.fighters.every((fighter) => fighter.hp === 0),
  '同時攻撃で相打ちが成立しません',
);

assert.equal(selectConditionTargets('nearestEnemy', actor, [enemy], [actor])[0]?.instanceId, enemy.instanceId);
assert.equal(selectConditionTargets('self', actor, [enemy], [actor])[0]?.instanceId, actor.instanceId);
assert.equal(targetSelectorById.get('nearestEnemy')?.label, '対戦相手');
assert.equal(isConditionCompatibleWithTarget('targetNear12', 'nearestEnemy'), true);
assert.equal(isConditionCompatibleWithTarget('targetNear12', 'self'), false);
assert.equal(isInstructionCompatibleWithTarget(instructionById.get('field-repair'), 'self'), true);

const poisoned = applyInstructionStatusEffects(enemy, instructionById.get('toxin-orb'), actor.instanceId, 'selected');
assert.equal(statusStacks(poisoned, 'poison'), 1);
const vulnerable = applyInstructionStatusEffects(enemy, pulseBolt, actor.instanceId, 'selected');
assert.ok(hasStatus(vulnerable, 'vulnerable'));
assert.ok(
  resolveActionImpact(actor, vulnerable, seekerOrb).damage > resolveActionImpact(actor, enemy, seekerOrb).damage,
);
const consumed = applyInstructionStatusEffects(vulnerable, seekerOrb, actor.instanceId, 'selected');
assert.equal(statusStacks(consumed, 'vulnerable'), 0);
const cryoBolt = instructionById.get('cryo-bolt');
const slowed = applyInstructionStatusEffects(enemy, cryoBolt, actor.instanceId, 'selected');
assert.ok(hasStatus(slowed, 'slowed') && slowed.speed < enemy.speed);
const expiredSlow = tickStatusDurations(slowed, 5.1);
assert.ok(!hasStatus(expiredSlow, 'slowed') && expiredSlow.speed === enemy.speed);
const guarded = applyInstructionStatusEffects(actor, instructionById.get('tank-guard'), actor.instanceId, 'actor');
assert.ok(
  resolveActionImpact(enemy, guarded, instructionById.get('pulse-swipe')).damage <
    resolveActionImpact(enemy, actor, instructionById.get('pulse-swipe')).damage,
);
const berserk = applyStatus({ ...actor, hp: actor.maxHp * 0.25 }, 'berserk', { sourceId: actor.instanceId });
assert.ok(berserk.attack > actor.attack && berserk.speed > actor.speed);

const defeated = fighters.map((fighter) => (fighter.team === 'enemy' ? { ...fighter, hp: 0 } : fighter));
assert.equal(isBattleComplete(defeated), true);
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
assert.equal(applyBattleSteps(simultaneousHpBase, simultaneousHpSteps)[0]?.hp, 53);

for (let seed = 1; seed <= 20; seed += 1) {
  const shop = createShop(seed, [], ROSTER_CONFIG.startingEquipmentIds);
  assert.equal(shop.length, SHOP_CONFIG.size);
  assert.equal(new Set(shop.map((item) => item.id)).size, shop.length);
  assert.equal(shop.filter((item) => item.kind === 'equipment').length, 2);
  assert.equal(shop.filter((item) => item.kind === 'instruction').length, 2);
}

const balance = analyzeBalance(GAME_DATA);
assert.equal(balance.errors, 0, `バランス検証エラー: ${balance.issues.map((issue) => issue.message).join(' / ')}`);
assert.doesNotThrow(() =>
  JSON.stringify({ fighters, projectiles: projectilePlan.projectiles, encounters: ENCOUNTERS }),
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
