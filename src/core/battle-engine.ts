import { BATTLE_CONFIG, DEFAULT_PROGRAMS, DEFAULT_REACTIONS } from '../data.ts';
import type { BattleFlash, Fighter, LogItem, ReactionBlock, ReactionTrigger, UnitInventoryItem } from '../types.ts';
import {
  actionCooldown,
  actionRange,
  activateBerserker,
  advanceToward,
  distanceTo,
  instructionById,
  jumpToward,
  matchCondition,
  knockbackPosition,
  priorityEnemy,
  pullToward,
  resolveActionImpact,
  retreatFrom,
  selectConditionTargets,
  selectInstructionTarget,
  throwBehind,
  tickCooldowns,
} from './rules.ts';
import { applyInstructionStatusEffects, effectByKind, requireEffect } from './instruction-effects.ts';
import {
  applyZoneEntries,
  battleZoneById,
  createBattleZone,
  tickBattleZones,
  type BattleZoneChange,
  type ZoneTrigger,
} from './battle-zones.ts';
import { clearActionStatuses, hasStatus } from './statuses.ts';

type MutableFighterFields = Pick<
  Fighter,
  'hp' | 'x' | 'cooldown' | 'abilityGauge' | 'reactionCooldown' | 'statuses' | 'attack' | 'speed'
>;
export type FighterUpdate = { id: string; values: Partial<MutableFighterFields> };
export type BattleLogPayload = { actor: string; text: string; type: LogItem['type'] };
export type BattleDamagePayload = {
  actorId: string;
  actorName: string;
  team: Fighter['team'];
  actionId: string;
  amount: number;
  source: 'normal' | 'reaction';
};
export type BattleStep = {
  flash: BattleFlash;
  log?: BattleLogPayload;
  damage?: BattleDamagePayload;
  updates: FighterUpdate[];
  zoneChanges?: BattleZoneChange[];
  zoneTriggers?: ZoneTrigger[];
};
export type DecisionReason = 'condition' | 'range' | 'cost' | 'state';
export type DecisionTrace = {
  actorId: string;
  actorName: string;
  team: Fighter['team'];
  blockIndex: number;
  actionId: string;
  outcome: 'executed' | 'skipped';
  reason?: DecisionReason;
};
export type BattlePlan = {
  fighters: Fighter[];
  zones: import('../types.ts').BattleZoneInstance[];
  steps: BattleStep[];
  logs: BattleLogPayload[];
  decisions: DecisionTrace[];
  complete: boolean;
};

const attackTypeLabels: Record<Fighter['attackType'], string> = { melee: '近距離', blunt: '打撃', sniper: '狙撃' };

export function applyFighterUpdates(fighters: Fighter[], updates: FighterUpdate[]): Fighter[] {
  return fighters.map((fighter) => {
    const matching = updates.filter((update) => update.id === fighter.instanceId);
    return matching.reduce((current, update) => ({ ...current, ...update.values }), fighter);
  });
}

export function applyBattleStep(fighters: Fighter[], step: BattleStep): Fighter[] {
  return applyFighterUpdates(fighters, step.updates);
}

export function isBattleComplete(fighters: Fighter[]): boolean {
  return (
    !fighters.some((fighter) => fighter.team === 'ally' && fighter.hp > 0) ||
    !fighters.some((fighter) => fighter.team === 'enemy' && fighter.hp > 0)
  );
}

export function planBattleFrame({
  fighters,
  zones = [],
  team,
  dt,
  elapsed,
  previousElapsed,
}: {
  fighters: Fighter[];
  zones?: import('../types.ts').BattleZoneInstance[];
  team: UnitInventoryItem[];
  dt: number;
  elapsed: number;
  previousElapsed: number;
}): BattlePlan {
  let displayNext = tickCooldowns(fighters, dt);
  let next = displayNext.map((fighter) => ({ ...fighter }));
  const displayZones = tickBattleZones(zones, dt);
  let nextZones = displayZones.map((zone) => ({ ...zone }));
  const steps: BattleStep[] = [];
  const logs: BattleLogPayload[] = [];
  const decisions: DecisionTrace[] = [];

  const setNext = (fighterId: string, values: Partial<MutableFighterFields>) => {
    const index = next.findIndex((fighter) => fighter.instanceId === fighterId);
    if (index >= 0) next[index] = { ...next[index], ...values };
  };
  const canAffordAbility = (fighter: Fighter, abilityCost: number) =>
    fighter.abilityGauge + Number.EPSILON >= abilityCost;
  const spendAbility = (fighterId: string, abilityCost: number) => {
    if (abilityCost <= 0) return;
    const fighter = next.find((candidate) => candidate.instanceId === fighterId);
    if (!fighter) return;
    const abilityGauge = Math.max(0, fighter.abilityGauge - abilityCost);
    setNext(fighterId, { abilityGauge });
    displayNext = applyFighterUpdates(displayNext, [{ id: fighterId, values: { abilityGauge } }]);
  };
  const queueStep = (step: BattleStep) => steps.push(step);
  const moveThroughZones = (fighter: Fighter, x: number) => {
    const entry = applyZoneEntries(fighter, fighter.x, x, nextZones);
    return {
      values: { x, statuses: entry.fighter.statuses, attack: entry.fighter.attack, speed: entry.fighter.speed },
      triggers: entry.triggers,
    };
  };
  const reactionFor = (fighter: Fighter): ReactionBlock | null =>
    fighter.team === 'ally'
      ? (team.find((unit) => unit.inventoryId === fighter.instanceId)?.reaction ?? null)
      : (DEFAULT_REACTIONS[fighter.id] ?? null);

  const queueReaction = (reactorId: string, trigger: ReactionTrigger, sourceId: string, targetId: string) => {
    const reactor = next.find((fighter) => fighter.instanceId === reactorId);
    if (!reactor) return;
    const reaction = reactionFor(reactor);
    if (!reaction || reaction.trigger !== trigger || reactor.hp <= 0 || reactor.reactionCooldown > 0) return;
    const source = next.find((fighter) => fighter.instanceId === sourceId);
    const eventTarget = next.find((fighter) => fighter.instanceId === targetId);
    const target =
      trigger === 'selfHit'
        ? source
        : trigger === 'selfHpLow'
          ? priorityEnemy(
              reactor,
              next.filter((fighter) => fighter.team !== reactor.team && fighter.hp > 0),
            )
          : eventTarget;
    const instruction = instructionById.get(reaction.actionId);
    if (!instruction) return;
    const actionLabel = `⚡ ${instruction.short}`;

    if (instruction.action === 'guard') {
      if (!canAffordAbility(reactor, instruction.abilityCost)) return;
      spendAbility(reactor.instanceId, instruction.abilityCost);
      const guarded = applyInstructionStatusEffects(reactor, instruction, reactor.instanceId, 'actor');
      const values = {
        statuses: guarded.statuses,
        reactionCooldown: BATTLE_CONFIG.reactionCooldownSeconds,
      };
      setNext(reactor.instanceId, values);
      queueStep({
        flash: { id: reactor.instanceId, kind: 'guard', actionLabel, reaction: true, n: 0 },
        log: { actor: reactor.name, text: `REACTION｜${instruction.short}`, type: 'reaction' },
        updates: [{ id: reactor.instanceId, values }],
      });
      return;
    }
    if (instruction.action === 'berserk') {
      const application = requireEffect(instruction, 'applyStatus');
      if (hasStatus(reactor, application.statusId)) return;
      if (!canAffordAbility(reactor, instruction.abilityCost)) return;
      spendAbility(reactor.instanceId, instruction.abilityCost);
      const boost = activateBerserker(reactor, instruction);
      const values = { ...boost, reactionCooldown: BATTLE_CONFIG.reactionCooldownSeconds };
      setNext(reactor.instanceId, values);
      queueStep({
        flash: { id: reactor.instanceId, kind: 'berserk', actionLabel, reaction: true, n: 0 },
        log: {
          actor: reactor.name,
          text: `REACTION｜バーサーカーモード｜ATK ${reactor.attack}→${boost.attack} / SPD ${reactor.speed.toFixed(2)}→${boost.speed.toFixed(2)}`,
          type: 'reaction',
        },
        updates: [{ id: reactor.instanceId, values }],
      });
      return;
    }
    if (instruction.action === 'taunt') {
      if (!canAffordAbility(reactor, instruction.abilityCost)) return;
      spendAbility(reactor.instanceId, instruction.abilityCost);
      const application = requireEffect(instruction, 'applyStatus');
      const duration = application.durationSeconds ?? 0;
      const enemyUpdates = next
        .filter((fighter) => fighter.team !== reactor.team && fighter.hp > 0)
        .map((fighter) => {
          const taunted = applyInstructionStatusEffects(fighter, instruction, reactor.instanceId, 'allEnemies');
          return { id: fighter.instanceId, values: { statuses: taunted.statuses } };
        });
      const reactorUpdate = {
        id: reactor.instanceId,
        values: { reactionCooldown: BATTLE_CONFIG.reactionCooldownSeconds },
      };
      setNext(reactor.instanceId, reactorUpdate.values);
      for (const update of enemyUpdates) setNext(update.id, update.values);
      queueStep({
        flash: { id: reactor.instanceId, kind: 'taunt', actionLabel, reaction: true, n: 0 },
        log: {
          actor: reactor.name,
          text: `REACTION｜${instruction.short}｜敵全体の標的を ${duration.toFixed(1)}秒固定`,
          type: 'reaction',
        },
        updates: [reactorUpdate, ...enemyUpdates],
      });
      return;
    }
    if (instruction.action === 'retreat') {
      if (!target || target.hp <= 0) return;
      if (!canAffordAbility(reactor, instruction.abilityCost)) return;
      spendAbility(reactor.instanceId, instruction.abilityCost);
      const x = retreatFrom(reactor, target, requireEffect(instruction, 'move').distance);
      const movement = moveThroughZones(reactor, x);
      const values = { ...movement.values, reactionCooldown: BATTLE_CONFIG.reactionCooldownSeconds };
      setNext(reactor.instanceId, values);
      queueStep({
        flash: { id: reactor.instanceId, kind: instruction.visualKind ?? 'move', actionLabel, reaction: true, n: 0 },
        log: { actor: reactor.name, text: `REACTION｜${instruction.short}｜戦線 ${Math.round(x)}`, type: 'reaction' },
        updates: [{ id: reactor.instanceId, values }],
        zoneTriggers: movement.triggers,
      });
      return;
    }
    if (instruction.action === 'jump') {
      if (!target || target.hp <= 0) return;
      if (!canAffordAbility(reactor, instruction.abilityCost)) return;
      spendAbility(reactor.instanceId, instruction.abilityCost);
      const x = jumpToward(reactor, target, requireEffect(instruction, 'move').distance);
      const movement = moveThroughZones(reactor, x);
      const values = { ...movement.values, reactionCooldown: BATTLE_CONFIG.reactionCooldownSeconds };
      setNext(reactor.instanceId, values);
      queueStep({
        flash: { id: reactor.instanceId, kind: instruction.visualKind ?? 'jump', actionLabel, reaction: true, n: 0 },
        log: { actor: reactor.name, text: `REACTION｜${instruction.short}｜戦線 ${Math.round(x)}`, type: 'reaction' },
        updates: [{ id: reactor.instanceId, values }],
        zoneTriggers: movement.triggers,
      });
      return;
    }
    if (instruction.action === 'move') {
      if (!target || target.hp <= 0 || distanceTo(reactor, target) <= actionRange(reactor, instruction)) return;
      if (!canAffordAbility(reactor, instruction.abilityCost)) return;
      spendAbility(reactor.instanceId, instruction.abilityCost);
      const x = advanceToward(reactor, target, requireEffect(instruction, 'move').distance);
      const movement = moveThroughZones(reactor, x);
      const values = { ...movement.values, reactionCooldown: BATTLE_CONFIG.reactionCooldownSeconds };
      setNext(reactor.instanceId, values);
      queueStep({
        flash: { id: reactor.instanceId, kind: instruction.visualKind ?? 'move', actionLabel, reaction: true, n: 0 },
        log: { actor: reactor.name, text: `REACTION｜${instruction.short}｜戦線 ${Math.round(x)}`, type: 'reaction' },
        updates: [{ id: reactor.instanceId, values }],
        zoneTriggers: movement.triggers,
      });
      return;
    }
    if (!target || target.hp <= 0) return;
    if (!canAffordAbility(reactor, instruction.abilityCost)) return;
    spendAbility(reactor.instanceId, instruction.abilityCost);
    if (instruction.action === 'pull') {
      const reactionCooldown = BATTLE_CONFIG.reactionCooldownSeconds;
      if (distanceTo(reactor, target) > actionRange(reactor, instruction)) {
        const values = { reactionCooldown };
        setNext(reactor.instanceId, values);
        queueStep({
          flash: {
            id: reactor.instanceId,
            kind: 'miss',
            targetId: target.instanceId,
            attackType: reactor.attackType,
            actionLabel: `${actionLabel}｜MISS`,
            reaction: true,
            n: 0,
          },
          log: {
            actor: reactor.name,
            text: `REACTION｜${instruction.short} → ${target.name}｜空振り（射程外）`,
            type: 'miss',
          },
          updates: [{ id: reactor.instanceId, values }],
        });
        return;
      }
      const x = pullToward(reactor, target, requireEffect(instruction, 'move').distance);
      const movement = moveThroughZones(target, x);
      setNext(reactor.instanceId, { reactionCooldown });
      setNext(target.instanceId, movement.values);
      queueStep({
        flash: {
          id: reactor.instanceId,
          kind: 'pull',
          targetId: target.instanceId,
          actionLabel,
          reaction: true,
          n: 0,
        },
        log: {
          actor: reactor.name,
          text: `REACTION｜${instruction.short} → ${target.name}｜間合い ${Math.round(x)}`,
          type: 'reaction',
        },
        updates: [{ id: reactor.instanceId, values: { reactionCooldown } }],
      });
      queueStep({
        flash: { id: target.instanceId, kind: 'pulled', actionLabel: 'PULL', n: 0 },
        updates: [{ id: target.instanceId, values: movement.values }],
        zoneTriggers: movement.triggers,
      });
      return;
    }
    const isFollow = instruction.action === 'follow';
    if (!isFollow && distanceTo(reactor, target) > actionRange(reactor, instruction)) {
      const values = { reactionCooldown: BATTLE_CONFIG.reactionCooldownSeconds };
      setNext(reactor.instanceId, values);
      queueStep({
        flash: {
          id: reactor.instanceId,
          kind: 'miss',
          targetId: target.instanceId,
          attackType: reactor.attackType,
          actionLabel: `${actionLabel}｜MISS`,
          reaction: true,
          n: 0,
        },
        log: {
          actor: reactor.name,
          text: `REACTION｜${instruction.short} → ${target.name}｜空振り（射程外）`,
          type: 'miss',
        },
        updates: [{ id: reactor.instanceId, values }],
      });
      return;
    }
    const impact = resolveActionImpact(reactor, target, instruction);
    const hp = Math.max(0, target.hp - impact.damage);
    const affectedTarget = applyInstructionStatusEffects(target, instruction, reactor.instanceId, 'selected');
    const affectedReactor = applyInstructionStatusEffects(reactor, instruction, reactor.instanceId, 'actor');
    const x =
      hp > 0 && instruction.action === 'throw'
        ? throwBehind(reactor, target, requireEffect(instruction, 'move').distance)
        : hp > 0 && impact.knockbackDistance > 0
          ? knockbackPosition(target, reactor, impact.knockbackDistance)
          : target.x;
    const movedTarget = applyZoneEntries(affectedTarget, target.x, x, nextZones);
    const statuses = movedTarget.fighter.statuses;
    const reactorValues = {
      reactionCooldown: BATTLE_CONFIG.reactionCooldownSeconds,
      statuses: affectedReactor.statuses,
      attack: affectedReactor.attack,
      speed: affectedReactor.speed,
    };
    setNext(reactor.instanceId, reactorValues);
    setNext(target.instanceId, {
      hp,
      statuses,
      attack: movedTarget.fighter.attack,
      speed: movedTarget.fighter.speed,
      x,
    });
    const attackKind =
      instruction.action === 'heavy' ||
      instruction.action === 'throw' ||
      instruction.action === 'poison' ||
      instruction.action === 'burn' ||
      instruction.action === 'follow'
        ? instruction.action
        : 'attack';
    queueStep({
      flash: {
        id: reactor.instanceId,
        kind: attackKind,
        targetId: target.instanceId,
        attackType: reactor.attackType,
        actionLabel,
        reaction: true,
        n: 0,
      },
      log: {
        actor: reactor.name,
        text: `REACTION｜${instruction.short} → ${target.name}｜${impact.damage} dmg`,
        type: 'reaction',
      },
      damage: {
        actorId: reactor.instanceId,
        actorName: reactor.name,
        team: reactor.team,
        actionId: instruction.id,
        amount: Math.min(impact.damage, target.hp),
        source: 'reaction',
      },
      updates: [
        { id: reactor.instanceId, values: reactorValues },
        {
          id: target.instanceId,
          values: { hp, statuses, attack: movedTarget.fighter.attack, speed: movedTarget.fighter.speed },
        },
      ],
    });
    if (hp > 0 && x !== target.x)
      queueStep({
        flash: {
          id: target.instanceId,
          kind: instruction.action === 'throw' ? 'thrown' : 'hit',
          actionLabel: instruction.action === 'throw' ? 'THROW' : 'KNOCKBACK',
          n: 0,
        },
        updates: [{ id: target.instanceId, values: { x } }],
        zoneTriggers: movedTarget.triggers,
      });
    if (hp <= 0 && target.hp > 0)
      queueStep({ flash: { id: target.instanceId, kind: 'death', actionLabel: 'DOWN', n: 0 }, updates: [] });
  };

  const triggerHitReactions = (attackerId: string, targetId: string) => {
    const attacker = next.find((fighter) => fighter.instanceId === attackerId);
    const target = next.find((fighter) => fighter.instanceId === targetId);
    if (!attacker || !target) return;
    if (target.hp > 0) {
      queueReaction(target.instanceId, 'selfHit', attacker.instanceId, target.instanceId);
      if (target.hp / target.maxHp <= BATTLE_CONFIG.lowHpThreshold)
        queueReaction(target.instanceId, 'selfHpLow', attacker.instanceId, target.instanceId);
    }
    queueReaction(attacker.instanceId, 'selfAttackHit', attacker.instanceId, target.instanceId);
    for (const ally of next.filter(
      (fighter) => fighter.team === attacker.team && fighter.instanceId !== attacker.instanceId && fighter.hp > 0,
    )) {
      queueReaction(ally.instanceId, 'partnerAttackHit', attacker.instanceId, target.instanceId);
    }
  };

  if (elapsed >= BATTLE_CONFIG.overheatStartSeconds) {
    const overtimeStep = Math.floor((elapsed - BATTLE_CONFIG.overheatStartSeconds) / BATTLE_CONFIG.overheatStepSeconds);
    const rate = BATTLE_CONFIG.overheatBaseDamageRate * Math.pow(2, overtimeStep);
    displayNext = displayNext.map((fighter) => {
      if (fighter.hp <= 0) return fighter;
      const hp = Math.max(0, fighter.hp - fighter.maxHp * rate * dt);
      if (hp <= 0 && fighter.hp > 0)
        queueStep({ flash: { id: fighter.instanceId, kind: 'death', actionLabel: 'DOWN', n: 0 }, updates: [] });
      return { ...fighter, hp };
    });
    next = displayNext.map((fighter) => ({ ...fighter }));
    if (Math.floor(elapsed) !== Math.floor(previousElapsed))
      logs.push({ actor: 'SYSTEM', text: `OVERHEAT｜最大HPの ${(rate * 100).toFixed(0)}% ダメージ`, type: 'hit' });
  }

  for (const fighter of next.filter(
    (candidate) => candidate.hp > 0 && candidate.hp / candidate.maxHp <= BATTLE_CONFIG.lowHpThreshold,
  )) {
    queueReaction(fighter.instanceId, 'selfHpLow', fighter.instanceId, fighter.instanceId);
  }

  for (const ready of [...next]
    .filter((fighter) => fighter.hp > 0 && fighter.cooldown <= 0)
    .sort((a, b) => b.speed - a.speed)) {
    const actorIndex = next.findIndex((fighter) => fighter.instanceId === ready.instanceId && fighter.hp > 0);
    if (actorIndex < 0) continue;
    const actor = next[actorIndex];
    const enemies = next.filter((fighter) => fighter.team !== actor.team && fighter.hp > 0);
    const allies = next.filter((fighter) => fighter.team === actor.team && fighter.hp > 0);
    if (enemies.length === 0 || allies.length === 0) break;
    const enemyProgram = (DEFAULT_PROGRAMS[actor.id] ?? []).map((actionId) => ({
      actionId,
      conditionId: instructionById.get(actionId)?.condition ?? 'always',
      targetId: instructionById.get(actionId)?.defaultTarget ?? 'nearestEnemy',
    }));
    const program =
      actor.team === 'ally'
        ? (team.find((unit) => unit.inventoryId === actor.instanceId)?.program ?? [])
        : enemyProgram;
    const cooldown = actionCooldown(actor.speed);
    const actionReady = clearActionStatuses(actor);
    const readyValues = {
      cooldown,
      statuses: actionReady.statuses,
      attack: actionReady.attack,
      speed: actionReady.speed,
    };
    setNext(actor.instanceId, readyValues);
    displayNext = applyFighterUpdates(displayNext, [{ id: actor.instanceId, values: readyValues }]);
    let acted = false;
    let blockedByCost = false;

    for (const [blockIndex, block] of program.slice(0, actor.programLimit).entries()) {
      const current = next.find((fighter) => fighter.instanceId === actor.instanceId);
      if (!current || current.hp <= 0) break;
      const currentEnemies = next.filter((fighter) => fighter.team !== current.team && fighter.hp > 0);
      const currentAllies = next.filter((fighter) => fighter.team === current.team && fighter.hp > 0);
      if (currentEnemies.length === 0 || currentAllies.length === 0) break;
      const instruction = instructionById.get(block.actionId);
      if (!instruction) continue;
      const traceDecision = (outcome: DecisionTrace['outcome'], reason?: DecisionReason) =>
        decisions.push({
          actorId: current.instanceId,
          actorName: current.name,
          team: current.team,
          blockIndex,
          actionId: instruction.id,
          outcome,
          reason,
        });
      const conditionTargets = selectConditionTargets(block.targetId, current, currentEnemies, currentAllies);
      const matchedTargets = matchCondition(block.conditionId, current, conditionTargets);
      if (matchedTargets.length === 0) {
        traceDecision('skipped', 'condition');
        continue;
      }
      const nearest = priorityEnemy(current, currentEnemies);
      const target =
        instruction.targetMode === 'selected'
          ? matchedTargets[0]
          : (selectInstructionTarget(instruction, current, currentEnemies, currentAllies) ?? nearest);
      const isMultiTargetAttack =
        instruction.targetMode === 'allEnemies' && ['attack', 'heavy', 'poison', 'burn'].includes(instruction.action);
      const multiTargets = isMultiTargetAttack
        ? matchedTargets.filter(
            (candidate) =>
              candidate.team !== current.team && distanceTo(current, candidate) <= actionRange(current, instruction),
          )
        : [];
      if (isMultiTargetAttack && multiTargets.length === 0) {
        traceDecision('skipped', 'range');
        continue;
      }
      if (instruction.action === 'pull' && distanceTo(current, target) > actionRange(current, instruction)) {
        traceDecision('skipped', 'range');
        continue;
      }
      if (
        ['heavy', 'jump', 'throw', 'retreat', 'heal', 'buff'].includes(instruction.action) &&
        distanceTo(current, target) > actionRange(current, instruction)
      ) {
        traceDecision('skipped', 'range');
        continue;
      }
      const application = effectByKind(instruction, 'applyStatus');
      if (instruction.action === 'berserk' && application && hasStatus(current, application.statusId)) {
        traceDecision('skipped', 'state');
        continue;
      }
      if (!canAffordAbility(current, instruction.abilityCost)) {
        blockedByCost = true;
        traceDecision('skipped', 'cost');
        continue;
      }
      traceDecision('executed');
      spendAbility(current.instanceId, instruction.abilityCost);
      acted = true;

      if (instruction.action === 'field') {
        const effect = requireEffect(instruction, 'placeZone');
        const zone = createBattleZone(effect, current, target, elapsed);
        nextZones = [...nextZones, zone];
        const updates: FighterUpdate[] = [];
        const zoneTriggers: ZoneTrigger[] = [];
        for (const fighter of next.filter((candidate) => candidate.hp > 0)) {
          const entry = applyZoneEntries(fighter, fighter.x, fighter.x, [zone], true);
          if (entry.triggers.length === 0) continue;
          const values = {
            statuses: entry.fighter.statuses,
            attack: entry.fighter.attack,
            speed: entry.fighter.speed,
          };
          setNext(fighter.instanceId, values);
          updates.push({ id: fighter.instanceId, values });
          zoneTriggers.push(...entry.triggers);
        }
        const definition = battleZoneById.get(zone.zoneId);
        queueStep({
          flash: { id: current.instanceId, kind: 'field', zoneX: zone.x, actionLabel: instruction.short, n: 0 },
          log: {
            actor: current.name,
            text: `${instruction.short}｜${definition?.label ?? zone.zoneId}を戦線 ${Math.round(zone.x)} に設置`,
            type: 'info',
          },
          updates,
          zoneChanges: [{ kind: 'add', zone }],
          zoneTriggers,
        });
      } else if (instruction.action === 'taunt') {
        const statusApplication = requireEffect(instruction, 'applyStatus');
        const duration = statusApplication.durationSeconds ?? 0;
        const updates = currentEnemies.map((enemy) => {
          const taunted = applyInstructionStatusEffects(enemy, instruction, current.instanceId, 'allEnemies');
          return { id: enemy.instanceId, values: { statuses: taunted.statuses } };
        });
        for (const update of updates) setNext(update.id, update.values);
        queueStep({
          flash: { id: current.instanceId, kind: 'taunt', actionLabel: instruction.short, n: 0 },
          log: {
            actor: current.name,
            text: `${instruction.short}｜敵全体の標的を ${duration.toFixed(1)}秒固定`,
            type: 'info',
          },
          updates,
        });
      } else if (instruction.action === 'move') {
        if (distanceTo(current, target) <= actionRange(current, instruction)) {
          queueStep({
            flash: { id: current.instanceId, kind: 'wait', actionLabel: '待機', n: 0 },
            log: { actor: current.name, text: `${target.name}と対峙｜前線を維持`, type: 'info' },
            updates: [],
          });
        } else {
          const x = advanceToward(current, target, requireEffect(instruction, 'move').distance);
          const movement = moveThroughZones(current, x);
          setNext(current.instanceId, movement.values);
          queueStep({
            flash: {
              id: current.instanceId,
              kind: instruction.visualKind ?? 'move',
              targetId: target.instanceId,
              actionLabel: instruction.short,
              n: 0,
            },
            log: {
              actor: current.name,
              text: `${target.name}へ${instruction.short}｜戦線 ${Math.round(x)}`,
              type: 'info',
            },
            updates: [{ id: current.instanceId, values: movement.values }],
            zoneTriggers: movement.triggers,
          });
        }
      } else if (instruction.action === 'jump') {
        const x = jumpToward(current, target, requireEffect(instruction, 'move').distance);
        const movement = moveThroughZones(current, x);
        setNext(current.instanceId, movement.values);
        queueStep({
          flash: {
            id: current.instanceId,
            kind: instruction.visualKind ?? 'jump',
            targetId: target.instanceId,
            actionLabel: instruction.short,
            n: 0,
          },
          log: {
            actor: current.name,
            text: `${target.name}へ${instruction.short}｜戦線 ${Math.round(x)}`,
            type: 'info',
          },
          updates: [{ id: current.instanceId, values: movement.values }],
          zoneTriggers: movement.triggers,
        });
      } else if (instruction.action === 'pull') {
        const x = pullToward(current, target, requireEffect(instruction, 'move').distance);
        const movement = moveThroughZones(target, x);
        setNext(target.instanceId, movement.values);
        queueStep({
          flash: {
            id: current.instanceId,
            kind: 'pull',
            targetId: target.instanceId,
            actionLabel: instruction.short,
            n: 0,
          },
          log: {
            actor: current.name,
            text: `${instruction.short} → ${target.name}｜間合い ${Math.round(x)}`,
            type: 'info',
          },
          updates: [],
        });
        queueStep({
          flash: { id: target.instanceId, kind: 'pulled', actionLabel: 'PULL', n: 0 },
          updates: [{ id: target.instanceId, values: movement.values }],
          zoneTriggers: movement.triggers,
        });
      } else if (instruction.action === 'heal') {
        const heal = requireEffect(instruction, 'heal');
        const amount = Math.round(current.role === 'SUPPORT' ? (heal.supportAmount ?? heal.amount) : heal.amount);
        const hp = Math.min(target.maxHp, target.hp + amount);
        setNext(target.instanceId, { hp });
        queueStep({
          flash: {
            id: target.instanceId,
            actorId: current.instanceId,
            kind: 'heal',
            targetId: target.instanceId,
            actionLabel: instruction.short,
            n: 0,
          },
          log: { actor: current.name, text: `${target.name}を ${amount} 修復`, type: 'heal' },
          updates: [{ id: target.instanceId, values: { hp } }],
        });
      } else if (instruction.action === 'retreat') {
        const x = retreatFrom(current, target, requireEffect(instruction, 'move').distance);
        const movement = moveThroughZones(current, x);
        setNext(current.instanceId, movement.values);
        queueStep({
          flash: {
            id: current.instanceId,
            kind: instruction.visualKind ?? 'move',
            targetId: target.instanceId,
            actionLabel: instruction.short,
            n: 0,
          },
          log: {
            actor: current.name,
            text: `${target.name}から${instruction.short}｜戦線 ${Math.round(x)}`,
            type: 'info',
          },
          updates: [{ id: current.instanceId, values: movement.values }],
          zoneTriggers: movement.triggers,
        });
      } else if (instruction.action === 'guard') {
        const guarded = applyInstructionStatusEffects(current, instruction, current.instanceId, 'actor');
        const values = { statuses: guarded.statuses };
        setNext(current.instanceId, values);
        queueStep({
          flash: { id: current.instanceId, kind: 'guard', actionLabel: instruction.short, n: 0 },
          log: { actor: current.name, text: '防御姿勢へ移行', type: 'info' },
          updates: [{ id: current.instanceId, values }],
        });
      } else if (instruction.action === 'berserk') {
        const statusApplication = requireEffect(instruction, 'applyStatus');
        if (hasStatus(current, statusApplication.statusId)) {
          queueStep({
            flash: { id: current.instanceId, kind: 'wait', actionLabel: '暴走継続', n: 0 },
            log: { actor: current.name, text: 'バーサーカーモードはすでに稼働中', type: 'info' },
            updates: [],
          });
        } else {
          const boost = activateBerserker(current, instruction);
          setNext(current.instanceId, boost);
          queueStep({
            flash: { id: current.instanceId, kind: 'berserk', actionLabel: instruction.short, n: 0 },
            log: {
              actor: current.name,
              text: `バーサーカーモード｜ATK ${current.attack}→${boost.attack} / SPD ${current.speed.toFixed(2)}→${boost.speed.toFixed(2)}`,
              type: 'info',
            },
            updates: [{ id: current.instanceId, values: boost }],
          });
        }
      } else if (instruction.action === 'buff') {
        const modifier = effectByKind(instruction, 'modifyStat');
        if (modifier) {
          const attack = current.attack + modifier.amount;
          setNext(current.instanceId, { attack });
          queueStep({
            flash: { id: current.instanceId, kind: 'heal', actionLabel: '強化', n: 0 },
            log: { actor: current.name, text: `攻撃出力を +${modifier.amount} 強化`, type: 'heal' },
            updates: [{ id: current.instanceId, values: { attack } }],
          });
        } else {
          const application = requireEffect(instruction, 'applyStatus');
          const affectedTarget = applyInstructionStatusEffects(target, instruction, current.instanceId, 'selected');
          const values = {
            statuses: affectedTarget.statuses,
            attack: affectedTarget.attack,
            speed: affectedTarget.speed,
          };
          setNext(target.instanceId, values);
          queueStep({
            flash: {
              id: target.instanceId,
              actorId: current.instanceId,
              kind: 'heal',
              targetId: target.instanceId,
              actionLabel: instruction.short,
              n: 0,
            },
            log: {
              actor: current.name,
              text: `${instruction.short} → ${target.name}｜${application.durationSeconds ?? 0}秒`,
              type: 'heal',
            },
            updates: [{ id: target.instanceId, values }],
          });
        }
      } else if (instruction.action === 'wait') {
        const waitCooldown = requireEffect(instruction, 'wait').durationSeconds;
        setNext(current.instanceId, { cooldown: waitCooldown });
        queueStep({
          flash: { id: current.instanceId, kind: 'wait', actionLabel: '待機', n: 0 },
          log: { actor: current.name, text: '同期タイミングを待機', type: 'info' },
          updates: [{ id: current.instanceId, values: { cooldown: waitCooldown } }],
        });
      } else if (isMultiTargetAttack) {
        let actorStatusUpdatePending = true;
        for (const matchedTarget of multiTargets) {
          const liveTarget = next.find((fighter) => fighter.instanceId === matchedTarget.instanceId);
          if (!liveTarget || liveTarget.hp <= 0) continue;
          const impact = resolveActionImpact(current, liveTarget, instruction);
          const hp = Math.max(0, liveTarget.hp - impact.damage);
          const affectedTarget = applyInstructionStatusEffects(liveTarget, instruction, current.instanceId, 'selected');
          const affectedActor = actorStatusUpdatePending
            ? applyInstructionStatusEffects(current, instruction, current.instanceId, 'actor')
            : current;
          const actorUpdate =
            actorStatusUpdatePending && affectedActor !== current
              ? {
                  id: current.instanceId,
                  values: {
                    statuses: affectedActor.statuses,
                    attack: affectedActor.attack,
                    speed: affectedActor.speed,
                  },
                }
              : null;
          actorStatusUpdatePending = false;
          const statuses = affectedTarget.statuses;
          const x =
            hp > 0 && impact.knockbackDistance > 0
              ? knockbackPosition(liveTarget, current, impact.knockbackDistance)
              : liveTarget.x;
          const movedTarget = applyZoneEntries(affectedTarget, liveTarget.x, x, nextZones);
          setNext(liveTarget.instanceId, {
            x,
            hp,
            statuses: movedTarget.fighter.statuses,
            attack: movedTarget.fighter.attack,
            speed: movedTarget.fighter.speed,
          });
          if (actorUpdate) setNext(actorUpdate.id, actorUpdate.values);
          const attackKind =
            instruction.action === 'heavy' || instruction.action === 'poison' || instruction.action === 'burn'
              ? instruction.action
              : 'attack';
          queueStep({
            flash: {
              id: current.instanceId,
              kind: attackKind,
              targetId: liveTarget.instanceId,
              attackType: current.attackType,
              actionLabel: instruction.short,
              n: 0,
            },
            log: {
              actor: current.name,
              text: `${instruction.short} → ${liveTarget.name}｜${impact.damage} dmg`,
              type: 'hit',
            },
            damage: {
              actorId: current.instanceId,
              actorName: current.name,
              team: current.team,
              actionId: instruction.id,
              amount: Math.min(impact.damage, liveTarget.hp),
              source: 'normal',
            },
            updates: [
              {
                id: liveTarget.instanceId,
                values: { hp, statuses, attack: affectedTarget.attack, speed: affectedTarget.speed },
              },
              ...(actorUpdate ? [actorUpdate] : []),
            ],
          });
          if (hp > 0 && x !== liveTarget.x)
            queueStep({
              flash: { id: liveTarget.instanceId, kind: 'hit', actionLabel: 'KNOCKBACK', n: 0 },
              updates: [
                {
                  id: liveTarget.instanceId,
                  values: {
                    x,
                    statuses: movedTarget.fighter.statuses,
                    attack: movedTarget.fighter.attack,
                    speed: movedTarget.fighter.speed,
                  },
                },
              ],
              zoneTriggers: movedTarget.triggers,
            });
          if (hp <= 0 && liveTarget.hp > 0)
            queueStep({ flash: { id: liveTarget.instanceId, kind: 'death', actionLabel: 'DOWN', n: 0 }, updates: [] });
          triggerHitReactions(current.instanceId, liveTarget.instanceId);
        }
      } else if (distanceTo(current, target) > actionRange(current, instruction) && instruction.action !== 'follow') {
        queueStep({
          flash: {
            id: current.instanceId,
            kind: 'miss',
            targetId: target.instanceId,
            attackType: current.attackType,
            actionLabel: `${instruction.short}｜MISS`,
            n: 0,
          },
          log: { actor: current.name, text: `${instruction.short} → ${target.name}｜空振り（射程外）`, type: 'miss' },
          updates: [],
        });
      } else {
        const impact = resolveActionImpact(current, target, instruction);
        const hp = Math.max(0, target.hp - impact.damage);
        const affectedTarget = applyInstructionStatusEffects(target, instruction, current.instanceId, 'selected');
        const affectedActor = applyInstructionStatusEffects(current, instruction, current.instanceId, 'actor');
        const statuses = affectedTarget.statuses;
        const x =
          hp > 0 && instruction.action === 'throw'
            ? throwBehind(current, target, requireEffect(instruction, 'move').distance)
            : hp > 0 && impact.knockbackDistance > 0
              ? knockbackPosition(target, current, impact.knockbackDistance)
              : target.x;
        const movedTarget = applyZoneEntries(affectedTarget, target.x, x, nextZones);
        setNext(target.instanceId, {
          x,
          hp,
          statuses: movedTarget.fighter.statuses,
          attack: movedTarget.fighter.attack,
          speed: movedTarget.fighter.speed,
        });
        const actorUpdate =
          affectedActor !== current
            ? {
                id: current.instanceId,
                values: {
                  statuses: affectedActor.statuses,
                  attack: affectedActor.attack,
                  speed: affectedActor.speed,
                },
              }
            : null;
        if (actorUpdate) setNext(actorUpdate.id, actorUpdate.values);
        const attackKind =
          instruction.action === 'heavy' ||
          instruction.action === 'throw' ||
          instruction.action === 'poison' ||
          instruction.action === 'burn' ||
          instruction.action === 'follow'
            ? instruction.action
            : 'attack';
        queueStep({
          flash: {
            id: current.instanceId,
            kind: attackKind,
            targetId: target.instanceId,
            attackType: current.attackType,
            actionLabel: instruction.showAttackTypeLabel ? attackTypeLabels[current.attackType] : instruction.short,
            n: 0,
          },
          log: {
            actor: current.name,
            text: `${instruction.short} / ${current.attackType} → ${target.name}｜${impact.damage} dmg`,
            type: 'hit',
          },
          damage: {
            actorId: current.instanceId,
            actorName: current.name,
            team: current.team,
            actionId: instruction.id,
            amount: Math.min(impact.damage, target.hp),
            source: 'normal',
          },
          updates: [
            {
              id: target.instanceId,
              values: { hp, statuses, attack: affectedTarget.attack, speed: affectedTarget.speed },
            },
            ...(actorUpdate ? [actorUpdate] : []),
          ],
        });
        if (hp > 0 && x !== target.x)
          queueStep({
            flash: {
              id: target.instanceId,
              kind: instruction.action === 'throw' ? 'thrown' : 'hit',
              actionLabel: instruction.action === 'throw' ? 'THROW' : 'KNOCKBACK',
              n: 0,
            },
            updates: [
              {
                id: target.instanceId,
                values: {
                  x,
                  statuses: movedTarget.fighter.statuses,
                  attack: movedTarget.fighter.attack,
                  speed: movedTarget.fighter.speed,
                },
              },
            ],
            zoneTriggers: movedTarget.triggers,
          });
        if (hp <= 0 && target.hp > 0)
          queueStep({ flash: { id: target.instanceId, kind: 'death', actionLabel: 'DOWN', n: 0 }, updates: [] });
        if (instruction.action !== 'follow') triggerHitReactions(current.instanceId, target.instanceId);
      }
    }
    if (!acted)
      logs.push({
        actor: actor.name,
        text: blockedByCost ? 'COST不足｜ゲージ回復待ち' : '実行できる指示なし',
        type: 'skip',
      });
  }

  return {
    fighters: displayNext,
    zones: displayZones,
    steps,
    logs,
    decisions,
    complete: isBattleComplete(next) && steps.length === 0,
  };
}
