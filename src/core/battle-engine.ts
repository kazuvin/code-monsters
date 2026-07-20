import { BATTLE_CONFIG, DEFAULT_PROGRAMS, DEFAULT_REACTIONS } from '../data.ts';
import type {
  BattleFlash,
  BattleZoneInstance,
  Fighter,
  Instruction,
  LogItem,
  ReactionTrigger,
  SpatialProjectile,
  UnitInventoryItem,
} from '../types.ts';
import {
  actionLockDuration,
  actionWindupDuration,
  directionToward,
  instructionById,
  instructionCooldown,
  matchCondition,
  priorityEnemy,
  resolveActionImpact,
  selectConditionTargets,
  selectInstructionTarget,
  tickCooldowns,
} from './rules.ts';
import { applyInstructionFighterEffects, effectByKind } from './instruction-effects.ts';
import {
  applyZoneActionTriggers,
  battleZoneById,
  createBattleZone,
  tickBattleZones,
  type BattleZoneChange,
  type ZoneTrigger,
} from './battle-zones.ts';
import {
  advanceProjectile,
  createProjectile,
  projectileInBounds,
  projectileIntersectsFighter,
  resolveAttackShape,
  shapeIntersectsFighter,
} from './spatial-combat.ts';
import { clearActionStatuses, getStatus, hasStatus, statusById, statusDamagePerSecond } from './statuses.ts';

type MutableFighterFields = Pick<
  Fighter,
  | 'hp'
  | 'x'
  | 'y'
  | 'vx'
  | 'vy'
  | 'gravityScale'
  | 'gravityScaleRemaining'
  | 'actionLock'
  | 'instructionCooldowns'
  | 'pendingAction'
  | 'abilityGauge'
  | 'reactionCooldown'
  | 'statuses'
  | 'attack'
  | 'speed'
>;

export type FighterUpdate = { id: string; values: Partial<MutableFighterFields> };
export type BattleLogPayload = { actor: string; text: string; type: LogItem['type'] };
export type BattleDamagePayload = {
  actorId: string;
  actorName: string;
  team: Fighter['team'];
  actionId: string;
  amount: number;
  source: 'normal' | 'reaction' | 'projectile' | 'status';
  statusId?: string;
};
export type BattleStep = {
  flash: BattleFlash;
  simultaneousGroup?: string;
  log?: BattleLogPayload;
  damage?: BattleDamagePayload;
  updates: FighterUpdate[];
  zoneChanges?: BattleZoneChange[];
  zoneTriggers?: ZoneTrigger[];
};
export type DecisionReason = 'condition' | 'cost' | 'state';
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
  zones: BattleZoneInstance[];
  projectiles: SpatialProjectile[];
  steps: BattleStep[];
  logs: BattleLogPayload[];
  decisions: DecisionTrace[];
  complete: boolean;
};

const fighterEffectValues = (fighter: Fighter) => ({
  statuses: fighter.statuses,
  attack: fighter.attack,
  speed: fighter.speed,
  x: fighter.x,
  y: fighter.y,
  vx: fighter.vx,
  vy: fighter.vy,
  gravityScale: fighter.gravityScale,
  gravityScaleRemaining: fighter.gravityScaleRemaining,
});

export function applyFighterUpdates(fighters: Fighter[], updates: FighterUpdate[]): Fighter[] {
  return fighters.map((fighter) => {
    const matching = updates.filter((update) => update.id === fighter.instanceId);
    return matching.reduce((current, update) => ({ ...current, ...update.values }), fighter);
  });
}

export function applyBattleStep(fighters: Fighter[], step: BattleStep): Fighter[] {
  return applyFighterUpdates(fighters, step.updates);
}

export function applyBattleSteps(fighters: Fighter[], steps: BattleStep[]): Fighter[] {
  const applied = steps.reduce((state, step) => applyBattleStep(state, step), fighters);
  const simultaneousGroup = steps[0]?.simultaneousGroup;
  if (!simultaneousGroup || steps.some((step) => step.simultaneousGroup !== simultaneousGroup)) return applied;

  return applied.map((fighter) => {
    const before = fighters.find((candidate) => candidate.instanceId === fighter.instanceId);
    if (!before) return fighter;
    const hpDeltas = steps.flatMap((step) =>
      step.updates.flatMap((update) =>
        update.id === fighter.instanceId && typeof update.values.hp === 'number' ? [update.values.hp - before.hp] : [],
      ),
    );
    if (hpDeltas.length === 0) return fighter;
    const hp = Math.max(0, Math.min(fighter.maxHp, before.hp + hpDeltas.reduce((total, delta) => total + delta, 0)));
    return { ...fighter, hp };
  });
}

export function isBattleComplete(fighters: Fighter[]): boolean {
  return (
    !fighters.some((fighter) => fighter.team === 'ally' && fighter.hp > 0) ||
    !fighters.some((fighter) => fighter.team === 'enemy' && fighter.hp > 0)
  );
}

const compareStableId = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

export function compareReadyFighters(left: Fighter, right: Fighter): number {
  return (
    right.speed - left.speed ||
    left.actionLock - right.actionLock ||
    compareStableId(left.id, right.id) ||
    compareStableId(left.instanceId, right.instanceId)
  );
}

const visualKind = (instruction: Instruction): BattleFlash['kind'] => {
  if (instruction.visualKind) return instruction.visualKind === 'jump' ? 'flight' : instruction.visualKind;
  if (instruction.action === 'heavy') return 'heavy';
  if (instruction.action === 'poison') return 'poison';
  if (instruction.action === 'follow') return 'follow';
  if (instruction.action === 'guard') return 'guard';
  if (instruction.action === 'heal') return 'heal';
  if (instruction.action === 'buff') return 'heal';
  if (instruction.action === 'berserk') return 'berserk';
  if (instruction.action === 'field') return 'field';
  if (instruction.action === 'wait') return 'wait';
  return instruction.action === 'attack' ? 'attack' : 'move';
};

export function planBattleFrame({
  fighters,
  zones = [],
  projectiles = [],
  team,
  dt,
  elapsed,
  previousElapsed,
}: {
  fighters: Fighter[];
  zones?: BattleZoneInstance[];
  projectiles?: SpatialProjectile[];
  team: UnitInventoryItem[];
  dt: number;
  elapsed: number;
  previousElapsed: number;
}): BattlePlan {
  let next = tickCooldowns(fighters, dt);
  let nextZones = tickBattleZones(zones, dt);
  let nextProjectiles: SpatialProjectile[] = [];
  const steps: BattleStep[] = [];
  const logs: BattleLogPayload[] = [];
  const decisions: DecisionTrace[] = [];
  let activeSimultaneousGroup: string | null = null;
  let projectileSequence = 0;

  const setNext = (fighterId: string, values: Partial<MutableFighterFields>) => {
    next = applyFighterUpdates(next, [{ id: fighterId, values }]);
  };
  const queueStep = (step: BattleStep) => {
    steps.push(activeSimultaneousGroup ? { ...step, simultaneousGroup: activeSimultaneousGroup } : step);
  };
  const canAffordAbility = (fighter: Fighter, cost: number) => fighter.abilityGauge >= cost;
  const spendAbility = (fighterId: string, cost: number) => {
    const fighter = next.find((candidate) => candidate.instanceId === fighterId);
    if (!fighter) return;
    setNext(fighterId, { abilityGauge: Math.max(0, fighter.abilityGauge - cost) });
  };
  const pendingHitReactions: { attackerId: string; targetId: string; allowAttackReaction: boolean }[] = [];

  const applyHit = ({
    actor,
    target,
    instruction,
    reaction,
    projectileId,
  }: {
    actor: Fighter;
    target: Fighter;
    instruction: Instruction;
    reaction: boolean;
    projectileId?: string;
  }) => {
    const impact = resolveActionImpact(actor, target, instruction);
    const hp = Math.max(0, target.hp - impact.damage);
    const direction = directionToward(actor, target);
    const affectedTarget = applyInstructionFighterEffects(target, instruction, actor.instanceId, 'selected', {
      direction,
    });
    const vx = affectedTarget.vx + direction * impact.knockbackDistance * BATTLE_CONFIG.knockbackVelocityScale;
    const values = { hp, ...fighterEffectValues({ ...affectedTarget, vx }) };
    setNext(target.instanceId, values);
    queueStep({
      flash: {
        id: actor.instanceId,
        kind: visualKind(instruction),
        targetId: target.instanceId,
        projectileId,
        attackType: actor.attackType,
        actionLabel: instruction.short,
        reaction,
        n: 0,
      },
      log: {
        actor: actor.name,
        text: `${instruction.short} → ${target.name}｜${impact.damage} dmg｜座標 (${target.x.toFixed(1)}, ${target.y.toFixed(1)})`,
        type: reaction ? 'reaction' : 'hit',
      },
      damage: {
        actorId: actor.instanceId,
        actorName: actor.name,
        team: actor.team,
        actionId: instruction.id,
        amount: Math.min(impact.damage, target.hp),
        source: reaction ? 'reaction' : projectileId ? 'projectile' : 'normal',
      },
      updates: [{ id: target.instanceId, values }],
    });
    if (hp <= 0 && target.hp > 0)
      queueStep({ flash: { id: target.instanceId, kind: 'death', actionLabel: 'DOWN', n: 0 }, updates: [] });
    pendingHitReactions.push({
      attackerId: actor.instanceId,
      targetId: target.instanceId,
      allowAttackReaction: !reaction,
    });
  };

  const applyActorEffects = (actor: Fighter, target: Fighter, instruction: Instruction) => {
    const direction = directionToward(actor, target);
    const affected = applyInstructionFighterEffects(actor, instruction, actor.instanceId, 'actor', { direction });
    const values = fighterEffectValues(affected);
    setNext(actor.instanceId, values);
    return values;
  };

  const resolveInstruction = (
    actor: Fighter,
    instruction: Instruction,
    targetIds: string[],
    snapshot: Fighter[],
    reaction = false,
  ) => {
    const enemies = snapshot.filter((fighter) => fighter.team !== actor.team && fighter.hp > 0);
    const fallbackTarget = instruction.targetMode === 'self' ? actor : priorityEnemy(actor, enemies);
    const target = snapshot.find((fighter) => fighter.instanceId === targetIds[0]) ?? fallbackTarget;
    if (!target) return;
    const actorValues = applyActorEffects(actor, target, instruction);

    if (instruction.delivery?.kind === 'projectile') {
      const projectile = createProjectile(
        instruction,
        instruction.delivery,
        actor,
        target,
        elapsed,
        projectileSequence++,
        reaction,
      );
      nextProjectiles.push(projectile);
      queueStep({
        flash: {
          id: actor.instanceId,
          kind: visualKind(instruction),
          targetId: target.instanceId,
          projectileId: projectile.instanceId,
          actionLabel: `${instruction.short}｜発射`,
          reaction,
          n: 0,
        },
        log: {
          actor: actor.name,
          text: `${instruction.short}を発射｜弾速 ${instruction.delivery.speed}m/s`,
          type: reaction ? 'reaction' : 'info',
        },
        updates: [{ id: actor.instanceId, values: actorValues }],
      });
      return;
    }

    if (instruction.delivery?.kind === 'shape') {
      const resolvedShape = resolveAttackShape(instruction, actor, target);
      const hitTargets = resolvedShape
        ? enemies.filter((candidate) => shapeIntersectsFighter(resolvedShape, candidate))
        : [];
      if (hitTargets.length === 0) {
        queueStep({
          flash: {
            id: actor.instanceId,
            kind: 'miss',
            targetId: target.instanceId,
            shape: resolvedShape ?? undefined,
            actionLabel: `${instruction.short}｜MISS`,
            reaction,
            n: 0,
          },
          log: {
            actor: actor.name,
            text: `${instruction.short}｜攻撃形状と相手座標が交差せず`,
            type: 'miss',
          },
          updates: [{ id: actor.instanceId, values: actorValues }],
        });
        return;
      }
      const firstStepIndex = steps.length;
      for (const hitTarget of hitTargets) applyHit({ actor, target: hitTarget, instruction, reaction });
      if (steps[firstStepIndex]) steps[firstStepIndex].updates.push({ id: actor.instanceId, values: actorValues });
      for (const step of steps.slice(firstStepIndex)) step.flash.shape = resolvedShape ?? undefined;
      return;
    }

    const heal = effectByKind(instruction, 'heal');
    if (heal) {
      const healTarget = instruction.targetMode === 'self' ? actor : target;
      const amount = Math.round(actor.role === 'SUPPORT' ? (heal.supportAmount ?? heal.amount) : heal.amount);
      const hp = Math.min(healTarget.maxHp, healTarget.hp + amount);
      setNext(healTarget.instanceId, { hp });
      queueStep({
        flash: {
          id: healTarget.instanceId,
          actorId: actor.instanceId,
          kind: 'heal',
          targetId: healTarget.instanceId,
          actionLabel: instruction.short,
          reaction,
          n: 0,
        },
        log: { actor: actor.name, text: `${healTarget.name}を ${amount} 修復`, type: 'heal' },
        updates: [{ id: healTarget.instanceId, values: { hp } }],
      });
      return;
    }

    const zoneEffect = effectByKind(instruction, 'placeZone');
    if (zoneEffect) {
      const zone = createBattleZone(zoneEffect, actor, target, elapsed);
      nextZones = [...nextZones, zone];
      const definition = battleZoneById.get(zone.zoneId);
      queueStep({
        flash: {
          id: actor.instanceId,
          kind: 'field',
          zoneX: zone.x,
          zoneY: zone.y,
          actionLabel: instruction.short,
          reaction,
          n: 0,
        },
        log: {
          actor: actor.name,
          text: `${definition?.label ?? zone.zoneId}を座標 (${zone.x.toFixed(1)}, ${zone.y.toFixed(1)}) に設置`,
          type: reaction ? 'reaction' : 'info',
        },
        updates: [{ id: actor.instanceId, values: actorValues }],
        zoneChanges: [{ kind: 'add', zone }],
      });
      return;
    }

    const wait = effectByKind(instruction, 'wait');
    const actionLock = wait?.durationSeconds;
    if (actionLock !== undefined) setNext(actor.instanceId, { actionLock });
    queueStep({
      flash: {
        id: actor.instanceId,
        kind: visualKind(instruction),
        targetId: target.instanceId,
        actionLabel: instruction.short,
        reaction,
        n: 0,
      },
      log: {
        actor: actor.name,
        text: `${instruction.short}｜速度 (${actorValues.vx.toFixed(1)}, ${actorValues.vy.toFixed(1)})`,
        type: reaction ? 'reaction' : 'info',
      },
      updates: [
        {
          id: actor.instanceId,
          values: { ...actorValues, ...(actionLock === undefined ? {} : { actionLock }) },
        },
      ],
    });
  };

  const queueReaction = (reactorId: string, trigger: ReactionTrigger, opponentId: string) => {
    const reactor = next.find((fighter) => fighter.instanceId === reactorId);
    if (!reactor || reactor.hp <= 0 || reactor.reactionCooldown > 0) return;
    const reaction = reactor.reaction ?? DEFAULT_REACTIONS[reactor.id];
    if (!reaction || reaction.trigger !== trigger) return;
    const instruction = instructionById.get(reaction.actionId);
    if (!instruction || !canAffordAbility(reactor, instruction.abilityCost)) return;
    const opponent = next.find((fighter) => fighter.instanceId === opponentId && fighter.hp > 0);
    const targetId = instruction.targetMode === 'self' ? reactor.instanceId : opponent?.instanceId;
    if (!targetId) return;
    spendAbility(reactor.instanceId, instruction.abilityCost);
    setNext(reactor.instanceId, { reactionCooldown: BATTLE_CONFIG.reactionCooldownSeconds });
    const refreshed = next.find((fighter) => fighter.instanceId === reactor.instanceId) ?? reactor;
    resolveInstruction(
      refreshed,
      instruction,
      [targetId],
      next.map((fighter) => ({ ...fighter })),
      true,
    );
  };

  const flushHitReactions = () => {
    for (const { attackerId, targetId, allowAttackReaction } of pendingHitReactions.splice(0)) {
      const attacker = next.find((fighter) => fighter.instanceId === attackerId);
      const target = next.find((fighter) => fighter.instanceId === targetId);
      if (target?.hp && target.hp > 0) {
        queueReaction(target.instanceId, 'selfHit', attackerId);
        if (target.hp / target.maxHp <= BATTLE_CONFIG.lowHpThreshold)
          queueReaction(target.instanceId, 'selfHpLow', attackerId);
      }
      if (allowAttackReaction && attacker?.hp && attacker.hp > 0)
        queueReaction(attacker.instanceId, 'selfAttackHit', targetId);
    }
  };

  if (projectiles.length > 0) {
    const projectileSnapshot = next.map((fighter) => ({ ...fighter }));
    const groupStart = steps.length;
    activeSimultaneousGroup = `projectile:${elapsed.toFixed(6)}`;
    for (const projectile of projectiles) {
      const target = projectile.targetId
        ? projectileSnapshot.find((fighter) => fighter.instanceId === projectile.targetId)
        : undefined;
      const advanced = advanceProjectile(projectile, target, dt);
      const hit = projectileSnapshot
        .filter((fighter) => fighter.team !== projectile.sourceTeam && fighter.hp > 0)
        .sort(compareReadyFighters)
        .find((fighter) => projectileIntersectsFighter(projectile, advanced, fighter));
      const actor = projectileSnapshot.find((fighter) => fighter.instanceId === projectile.sourceId);
      const instruction = instructionById.get(projectile.actionId);
      if (hit && actor && instruction) {
        applyHit({
          actor,
          target: hit,
          instruction,
          reaction: projectile.reaction,
          projectileId: projectile.instanceId,
        });
      } else if (projectileInBounds(advanced)) {
        nextProjectiles.push(advanced);
      } else if (actor && instruction) {
        queueStep({
          flash: {
            id: actor.instanceId,
            kind: 'miss',
            targetId: projectile.targetId ?? undefined,
            projectileId: projectile.instanceId,
            actionLabel: `${instruction.short}｜消滅`,
            n: 0,
          },
          log: { actor: actor.name, text: `${instruction.short}｜弾道寿命内に接触せず`, type: 'miss' },
          updates: [],
        });
      }
    }
    activeSimultaneousGroup = null;
    if (steps.length > groupStart)
      next = applyBattleSteps(projectileSnapshot, steps.slice(groupStart)).map((fighter) => ({ ...fighter }));
    flushHitReactions();
  }

  if (elapsed >= BATTLE_CONFIG.overheatStartSeconds) {
    const overtimeStep = Math.floor((elapsed - BATTLE_CONFIG.overheatStartSeconds) / BATTLE_CONFIG.overheatStepSeconds);
    const rate = BATTLE_CONFIG.overheatBaseDamageRate * Math.pow(2, overtimeStep);
    next = next.map((fighter) => {
      if (fighter.hp <= 0) return fighter;
      const hp = Math.max(0, fighter.hp - fighter.maxHp * rate * dt);
      if (hp <= 0)
        queueStep({ flash: { id: fighter.instanceId, kind: 'death', actionLabel: 'DOWN', n: 0 }, updates: [] });
      return { ...fighter, hp };
    });
    if (Math.floor(elapsed) !== Math.floor(previousElapsed))
      logs.push({ actor: 'SYSTEM', text: `OVERHEAT｜最大HPの ${(rate * 100).toFixed(0)}% ダメージ`, type: 'hit' });
  }

  for (const target of [...next].filter((fighter) => fighter.hp > 0)) {
    for (const status of target.statuses) {
      const definition = statusById.get(status.statusId);
      const damagePerSecond = statusDamagePerSecond(status.statusId);
      const accumulatedSeconds = status.tickAccumulatorSeconds ?? 0;
      const tickCount = Math.floor((accumulatedSeconds + Number.EPSILON) / BATTLE_CONFIG.statusDamageTickSeconds);
      if (!definition || damagePerSecond <= 0 || tickCount <= 0) continue;
      const liveTarget = next.find((fighter) => fighter.instanceId === target.instanceId);
      if (!liveTarget || liveTarget.hp <= 0) continue;
      const liveStatus = getStatus(liveTarget, status.statusId);
      if (!liveStatus) continue;
      const damage = Number(
        (damagePerSecond * BATTLE_CONFIG.statusDamageTickSeconds * liveStatus.stacks * tickCount).toFixed(4),
      );
      const amount = Math.min(liveTarget.hp, damage);
      const hp = Math.max(0, liveTarget.hp - amount);
      const statuses = liveTarget.statuses.map((candidate) =>
        candidate.statusId === status.statusId
          ? {
              ...candidate,
              tickAccumulatorSeconds: Math.max(
                0,
                (candidate.tickAccumulatorSeconds ?? 0) - BATTLE_CONFIG.statusDamageTickSeconds * tickCount,
              ),
            }
          : candidate,
      );
      setNext(liveTarget.instanceId, { hp, statuses });
      const source = next.find((fighter) => fighter.instanceId === status.sourceId);
      queueStep({
        flash: {
          id: liveTarget.instanceId,
          actorId: source?.instanceId,
          kind: 'status',
          targetId: liveTarget.instanceId,
          actionLabel: `${definition.label}ダメージ ${Math.round(amount)}`,
          n: 0,
        },
        log: {
          actor: liveTarget.name,
          text: `${definition.label} ×${liveStatus.stacks}｜${Math.round(amount)} 継続ダメージ`,
          type: 'hit',
        },
        damage: {
          actorId: source?.instanceId ?? `status:${status.statusId}`,
          actorName: source?.name ?? definition.label,
          team: source?.team ?? liveTarget.team,
          actionId: `status:${status.statusId}`,
          amount,
          source: 'status',
          statusId: status.statusId,
        },
        updates: [{ id: liveTarget.instanceId, values: { hp, statuses } }],
      });
      if (hp <= 0)
        queueStep({ flash: { id: liveTarget.instanceId, kind: 'death', actionLabel: 'DOWN', n: 0 }, updates: [] });
    }
  }

  for (const fighter of next.filter(
    (candidate) => candidate.hp > 0 && candidate.hp / candidate.maxHp <= BATTLE_CONFIG.lowHpThreshold,
  ))
    queueReaction(
      fighter.instanceId,
      'selfHpLow',
      priorityEnemy(
        fighter,
        next.filter((other) => other.team !== fighter.team),
      )?.instanceId ?? '',
    );

  const resolvedActorIds = new Set<string>();
  const dueTimes = [
    ...new Set(
      next
        .filter(
          (fighter) =>
            fighter.hp > 0 &&
            fighter.pendingAction !== null &&
            fighter.pendingAction.resolvesAt <= elapsed + Number.EPSILON,
        )
        .map((fighter) => fighter.pendingAction!.resolvesAt),
    ),
  ].sort((left, right) => left - right);

  for (const resolvesAt of dueTimes) {
    const resolutionSnapshot = next.map((fighter) => ({ ...fighter }));
    const dueActors = resolutionSnapshot
      .filter(
        (fighter) =>
          fighter.hp > 0 &&
          fighter.pendingAction !== null &&
          Math.abs(fighter.pendingAction.resolvesAt - resolvesAt) <= Number.EPSILON,
      )
      .sort(compareReadyFighters);
    if (dueActors.length === 0) continue;
    const groupStart = steps.length;
    activeSimultaneousGroup = `impact:${resolvesAt.toFixed(6)}`;
    for (const actor of dueActors) {
      const pendingAction = actor.pendingAction;
      if (!pendingAction) continue;
      resolvedActorIds.add(actor.instanceId);
      const instruction = instructionById.get(pendingAction.actionId);
      if (instruction)
        resolveInstruction({ ...actor, pendingAction: null }, instruction, pendingAction.targetIds, resolutionSnapshot);
    }
    activeSimultaneousGroup = null;
    next = applyBattleSteps(resolutionSnapshot, steps.slice(groupStart)).map((fighter) =>
      dueActors.some((actor) => actor.instanceId === fighter.instanceId)
        ? { ...fighter, pendingAction: null }
        : fighter,
    );
    flushHitReactions();
  }

  for (const ready of [...next]
    .filter(
      (fighter) =>
        fighter.hp > 0 &&
        fighter.actionLock <= 0 &&
        fighter.pendingAction === null &&
        !resolvedActorIds.has(fighter.instanceId),
    )
    .sort(compareReadyFighters)) {
    const current = next.find((fighter) => fighter.instanceId === ready.instanceId && fighter.hp > 0);
    if (!current) continue;
    const enemies = next.filter((fighter) => fighter.team !== current.team && fighter.hp > 0);
    const allies = next.filter((fighter) => fighter.team === current.team && fighter.hp > 0);
    if (enemies.length === 0 || allies.length === 0) break;
    const fallbackProgram = (DEFAULT_PROGRAMS[current.id] ?? []).map((actionId) => ({
      actionId,
      conditionId: instructionById.get(actionId)?.condition ?? 'always',
      targetId: instructionById.get(actionId)?.defaultTarget ?? 'nearestEnemy',
    }));
    const program =
      current.program ??
      (current.team === 'ally'
        ? (team.find((unit) => unit.inventoryId === current.instanceId)?.program ?? [])
        : fallbackProgram);
    if (
      !program.slice(0, current.programLimit).some((block) => (current.instructionCooldowns[block.actionId] ?? 0) <= 0)
    )
      continue;
    let acted = false;
    let blockedByCost = false;
    for (const [blockIndex, block] of program.slice(0, current.programLimit).entries()) {
      const instruction = instructionById.get(block.actionId);
      if (!instruction || (current.instructionCooldowns[instruction.id] ?? 0) > 0) continue;
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
      const conditionTargets = selectConditionTargets(block.targetId, current, enemies, allies);
      const matchedTargets = matchCondition(block.conditionId, current, conditionTargets);
      if (matchedTargets.length === 0) {
        traceDecision('skipped', 'condition');
        continue;
      }
      const target =
        instruction.targetMode === 'selected'
          ? matchedTargets[0]
          : (selectInstructionTarget(instruction, current, enemies, allies) ?? current);
      if (
        instruction.action === 'berserk' &&
        effectByKind(instruction, 'applyStatus') &&
        hasStatus(current, 'berserk')
      ) {
        traceDecision('skipped', 'state');
        continue;
      }
      if (!canAffordAbility(current, instruction.abilityCost)) {
        blockedByCost = true;
        traceDecision('skipped', 'cost');
        continue;
      }
      traceDecision('executed');
      const windupSeconds = actionWindupDuration(current.speed);
      const zoneTriggered = applyZoneActionTriggers(clearActionStatuses(current), nextZones);
      const pendingAction = {
        actionId: instruction.id,
        targetIds:
          instruction.targetMode === 'allEnemies'
            ? matchedTargets.map((fighter) => fighter.instanceId)
            : [target.instanceId],
        startedAt: elapsed,
        resolvesAt: elapsed + windupSeconds,
      };
      setNext(current.instanceId, {
        actionLock: Math.max(actionLockDuration(zoneTriggered.fighter.speed), windupSeconds),
        instructionCooldowns: {
          ...zoneTriggered.fighter.instructionCooldowns,
          [instruction.id]: instructionCooldown(instruction, zoneTriggered.fighter.speed),
        },
        pendingAction,
        abilityGauge: Math.max(0, zoneTriggered.fighter.abilityGauge - instruction.abilityCost),
        statuses: zoneTriggered.fighter.statuses,
        attack: zoneTriggered.fighter.attack,
        speed: zoneTriggered.fighter.speed,
      });
      acted = true;
      break;
    }
    if (!acted)
      logs.push({
        actor: current.name,
        text: blockedByCost ? 'COST不足｜ゲージ回復待ち' : '実行できる指示なし',
        type: 'skip',
      });
  }

  return {
    fighters: next,
    zones: nextZones,
    projectiles: nextProjectiles,
    steps,
    logs,
    decisions,
    complete: isBattleComplete(next),
  };
}
