import { BATTLE_CONFIG, CONDITIONS, DEBUG_TRAINING_CONFIG, INSTRUCTIONS, STATUSES, UNITS } from '../data.ts';
import type {
  BattleFlash,
  ConditionId,
  Fighter,
  Instruction,
  Role,
  TargetDomain,
  TargetSelectorId,
  UnitDefinition,
  UnitInventoryItem,
} from '../types.ts';
import {
  applyBattleStep,
  planBattleFrame,
  type BattleStep,
  type DecisionReason,
  type DecisionTrace,
} from './battle-engine.ts';
import { knockbackPosition, resolveActionImpact, throwBehind, tickCooldowns } from './rules.ts';
import { applyStatus, hasStatus, statusStacks } from './statuses.ts';

export type DebugRunMode = 'single' | 'timeline';
export type DebugStatusValues = Record<string, number>;

export type DebugSimulationInput = {
  actorUnitId: string;
  instructionId: string;
  conditionId: ConditionId;
  targetSelectorId: TargetSelectorId;
  targetUnitId: string;
  mode: DebugRunMode;
  durationSeconds: number;
  initialGauge: number;
  actorHpRatio: number;
  targetMaxHp: number;
  targetDefense: number;
  targetWeight: number;
  targetRole: Role;
  positionPresetId: string;
  actorStatuses: DebugStatusValues;
  targetStatuses: DebugStatusValues;
};

export type DebugEffectEvent = {
  elapsed: number;
  amount: number;
  kind: 'damage' | 'healing';
};

export type DebugPlaybackFrame = {
  elapsed: number;
  fighters: Fighter[];
  flash: BattleFlash;
  effect: DebugEffectEvent | null;
};

export type DebugSimulationResult = {
  elapsed: number;
  attempts: number;
  executions: number;
  hits: number;
  totalDamage: number;
  damagePerHit: number;
  lastDamage: number;
  dps: number;
  totalHealing: number;
  healingPerSecond: number;
  costSpent: number;
  effectPerCost: number | null;
  usesPerMinute: number;
  timeToKill: null;
  finalTargetHp: number;
  finalTargetHpRatio: number;
  finalPoison: number;
  finalActorStatuses: DebugStatusValues;
  finalTargetStatuses: DebugStatusValues;
  targetDisplacement: number;
  actorDisplacement: number;
  attackDelta: number;
  speedDelta: number;
  effectState: 'BERSERK' | 'GUARD' | 'ACTIVE';
  minimumGauge: number;
  emptyGaugeRate: number;
  mutualDistance: number;
  startingDistance: number;
  targetRecoveryCount: number;
  skipped: Record<DecisionReason, number>;
  events: DebugEffectEvent[];
  playback: DebugPlaybackFrame[];
  verdict: 'damage' | 'healing' | 'effect' | 'blocked';
};

type DebugSetup = {
  fighters: Fighter[];
  team: UnitInventoryItem[];
  actorId: string;
  dummyId: string;
  effectTargetId: string;
  instruction: Instruction;
  targetDomain: TargetDomain;
  actorX: number;
  targetX: number;
  startingDistance: number;
};

const unitById = new Map(UNITS.map((unit) => [unit.id, unit]));
const instructionById = new Map(INSTRUCTIONS.map((instruction) => [instruction.id, instruction]));
const conditionIds = new Set(CONDITIONS.map((condition) => condition.id));

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

const baseFighterState = {
  z: 0,
  abilityGauge: BATTLE_CONFIG.abilityGaugeInitial,
  reactionCooldown: 0,
  statuses: [],
};

function requireUnit(id: string): UnitDefinition {
  const unit = unitById.get(id);
  if (!unit) throw new Error(`Unknown debug unit: ${id}`);
  return unit;
}

function requireInstruction(id: string): Instruction {
  const instruction = instructionById.get(id);
  if (!instruction) throw new Error(`Unknown debug instruction: ${id}`);
  return instruction;
}

export function createDefaultDebugStatuses(): DebugStatusValues {
  return Object.fromEntries(STATUSES.map((status) => [status.id, 0]));
}

function requirePositionPreset(id: string) {
  const preset = DEBUG_TRAINING_CONFIG.positionPresets.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown debug position preset: ${id}`);
  return preset;
}

function startingDistance(actor: UnitDefinition, target: UnitDefinition, presetId: string): number {
  const preset = requirePositionPreset(presetId);
  const referenceRange =
    preset.rangeReference === 'mutual'
      ? Math.min(actor.range, target.range)
      : preset.rangeReference === 'actor'
        ? actor.range
        : target.range;
  const distance =
    preset.relation === 'inside'
      ? Math.max(2, referenceRange * BATTLE_CONFIG.rangeStopRatio)
      : referenceRange + DEBUG_TRAINING_CONFIG.outsideRangeGap;
  return round(Math.min(BATTLE_CONFIG.wallRight - BATTLE_CONFIG.wallLeft, distance), 1);
}

function statusControlValue(statusId: string, values: DebugStatusValues): number {
  const definition = STATUSES.find((status) => status.id === statusId);
  if (!definition) throw new Error(`Unknown debug status: ${statusId}`);
  const value = Number.isFinite(values[statusId]) ? values[statusId] : 0;
  return clamp(
    value,
    definition.debug.min ?? 0,
    definition.debug.max ?? (definition.debug.control === 'toggle' ? 1 : value),
  );
}

export function applyDebugStatuses(
  fighter: Fighter,
  values: DebugStatusValues,
  opponentId: string,
  sessionDuration = 1,
): Fighter {
  let next = fighter;
  for (const definition of STATUSES) {
    const controlValue = statusControlValue(definition.id, values);
    if (controlValue <= 0) continue;
    const locksTarget = definition.effects.some((effect) => effect.kind === 'targetLock');
    next = applyStatus(next, definition.id, {
      stacks: definition.debug.control === 'stacks' ? controlValue : 1,
      sourceId: 'debug-room',
      targetId: locksTarget ? opponentId : null,
      remainingSeconds: definition.duration.mode === 'persistent' ? null : sessionDuration,
    });
  }
  return next;
}

export function readDebugStatusValues(fighter: Fighter): DebugStatusValues {
  return Object.fromEntries(
    STATUSES.map((definition) => [
      definition.id,
      definition.debug.control === 'stacks'
        ? statusStacks(fighter, definition.id)
        : hasStatus(fighter, definition.id)
          ? 1
          : 0,
    ]),
  );
}

function debugTargetSelector(instruction: Instruction, requested: TargetSelectorId): TargetSelectorId {
  if (instruction.action === 'heal') return 'self';
  if (instruction.targetMode === 'self') return 'self';
  return instruction.targetMode === 'selected' ? requested : instruction.defaultTarget;
}

function makeDebugSetup(input: DebugSimulationInput): DebugSetup {
  const actorDefinition = requireUnit(input.actorUnitId);
  const targetDefinition = requireUnit(input.targetUnitId);
  const instruction = requireInstruction(input.instructionId);
  if (!conditionIds.has(input.conditionId)) throw new Error(`Unknown debug condition: ${input.conditionId}`);

  const actorId = 'debug-actor';
  const dummyId = 'debug-target';
  const distance = startingDistance(actorDefinition, targetDefinition, input.positionPresetId);
  const actorX = round(50 - distance / 2, 1);
  const targetX = round(50 + distance / 2, 1);
  const runDuration = input.mode === 'single' ? 12 : input.durationSeconds;
  const inertCooldown = runDuration + BATTLE_CONFIG.overheatStartSeconds + 10;
  const targetMaxHp = Math.max(1, Math.round(input.targetMaxHp));
  const targetSelectorId = debugTargetSelector(instruction, input.targetSelectorId);
  const targetDomain: TargetDomain = targetSelectorId === 'self' ? 'self' : 'enemy';

  const actorInventory: UnitInventoryItem = {
    ...actorDefinition,
    inventoryId: actorId,
    program: [{ actionId: instruction.id, conditionId: input.conditionId, targetId: targetSelectorId }],
    reaction: null,
  };
  const actor = applyDebugStatuses(
    {
      ...actorInventory,
      ...baseFighterState,
      instanceId: actorId,
      team: 'ally',
      hp: Math.max(1, Math.round(actorDefinition.maxHp * clamp(input.actorHpRatio, 0.01, 1))),
      abilityGauge: clamp(input.initialGauge, 0, BATTLE_CONFIG.abilityGaugeMax),
      x: actorX,
      cooldown: 0,
    },
    input.actorStatuses,
    dummyId,
    inertCooldown,
  );
  const target = applyDebugStatuses(
    {
      ...targetDefinition,
      ...baseFighterState,
      instanceId: dummyId,
      team: 'enemy',
      name: `DUMMY / ${targetDefinition.name}`,
      role: input.targetRole,
      maxHp: targetMaxHp,
      hp: targetMaxHp,
      defense: Math.max(0, Math.round(input.targetDefense)),
      weight: Math.max(0, input.targetWeight),
      attack: 0,
      x: targetX,
      cooldown: inertCooldown,
    },
    input.targetStatuses,
    actorId,
    inertCooldown,
  );

  return {
    fighters: [actor, target],
    team: [actorInventory],
    actorId,
    dummyId,
    effectTargetId: targetDomain === 'self' ? actorId : dummyId,
    instruction,
    targetDomain,
    actorX,
    targetX,
    startingDistance: distance,
  };
}

export function createDebugFighters(input: DebugSimulationInput): Fighter[] {
  return makeDebugSetup(input).fighters;
}

function countSkips(decisions: DecisionTrace[], actionId: string): Record<DecisionReason, number> {
  const skipped: Record<DecisionReason, number> = { condition: 0, range: 0, cost: 0, state: 0 };
  for (const decision of decisions) {
    if (decision.actionId === actionId && decision.outcome === 'skipped' && decision.reason) {
      skipped[decision.reason] += 1;
    }
  }
  return skipped;
}

const snapshotFighters = (fighters: Fighter[]) => fighters.map((fighter) => ({ ...fighter }));

function keepDummyAlive(fighters: Fighter[], dummyId: string): Fighter[] {
  return fighters.map((fighter) =>
    fighter.instanceId === dummyId
      ? { ...fighter, hp: Math.max(DEBUG_TRAINING_CONFIG.minimumDummyHp, fighter.hp) }
      : fighter,
  );
}

function recoverDummyHp(fighters: Fighter[], dummyId: string): Fighter[] {
  return fighters.map((fighter) =>
    fighter.instanceId === dummyId && fighter.hp < fighter.maxHp ? { ...fighter, hp: fighter.maxHp } : fighter,
  );
}

export function runDebugSimulation(input: DebugSimulationInput): DebugSimulationResult {
  const setup = makeDebugSetup(input);
  const limit = input.mode === 'single' ? 12 : clamp(input.durationSeconds, 1, 60);
  const dt = BATTLE_CONFIG.tickSeconds;
  const stepInterval = BATTLE_CONFIG.actionStepMs / 1000;
  let fighters = setup.fighters;
  let queue: BattleStep[] = [];
  let stepClock = 0;
  let elapsed = 0;
  let previousElapsed = 0;
  let singleAttempted = false;
  let minimumGauge = clamp(input.initialGauge, 0, BATTLE_CONFIG.abilityGaugeMax);
  let emptyGaugeSeconds = 0;
  let totalDamage = 0;
  let totalHealing = 0;
  let hits = 0;
  let targetRecoveryCount = 0;
  let targetRecoveryAt: number | null = null;
  let maximumTargetDisplacement = 0;
  let maximumActorDisplacement = 0;
  const decisions: DecisionTrace[] = [];
  const events: DebugEffectEvent[] = [];
  const playback: DebugPlaybackFrame[] = [];
  const initialActor = fighters.find((fighter) => fighter.instanceId === setup.actorId)!;
  const initialEffectTarget = fighters.find((fighter) => fighter.instanceId === setup.effectTargetId)!;

  while (elapsed < limit - Number.EPSILON) {
    previousElapsed = elapsed;
    elapsed = Math.min(limit, elapsed + dt);
    const tick = elapsed - previousElapsed;
    stepClock += tick;

    if (targetRecoveryAt !== null && elapsed + Number.EPSILON >= targetRecoveryAt) {
      fighters = recoverDummyHp(fighters, setup.dummyId);
      targetRecoveryAt = null;
    }

    if (queue.length > 0) {
      if (stepClock + Number.EPSILON >= stepInterval) {
        const step = queue.shift()!;
        stepClock = 0;
        const before = tickCooldowns(fighters, tick);
        fighters = keepDummyAlive(applyBattleStep(before, step), setup.dummyId);
        let effect: DebugEffectEvent | null = null;
        let trainingMovementStep: BattleStep | null = null;
        if (step.damage?.actionId === setup.instruction.id && step.damage.actorId === setup.actorId) {
          const damageActor = before.find((fighter) => fighter.instanceId === step.damage?.actorId);
          const damageTarget = before.find((fighter) => fighter.instanceId === step.flash.targetId);
          const impact =
            damageActor && damageTarget ? resolveActionImpact(damageActor, damageTarget, setup.instruction) : null;
          const measuredDamage = impact?.damage ?? step.damage.amount;
          totalDamage += measuredDamage;
          hits += 1;
          if (targetRecoveryAt === null) {
            targetRecoveryAt = elapsed + DEBUG_TRAINING_CONFIG.recoveryDelaySeconds;
            targetRecoveryCount += 1;
          }
          effect = { elapsed: round(elapsed), amount: measuredDamage, kind: 'damage' };
          events.push(effect);
          const movementAlreadyQueued = queue.some((queuedStep) =>
            queuedStep.updates.some((update) => update.id === setup.dummyId && typeof update.values.x === 'number'),
          );
          if (damageActor && damageTarget?.instanceId === setup.dummyId && impact && !movementAlreadyQueued) {
            const x =
              setup.instruction.action === 'throw'
                ? throwBehind(damageActor, damageTarget, setup.instruction.params.throwDistance ?? 0)
                : impact.knockbackDistance > 0
                  ? knockbackPosition(damageTarget, damageActor, impact.knockbackDistance)
                  : damageTarget.x;
            if (x !== damageTarget.x) {
              trainingMovementStep = {
                flash: {
                  id: setup.dummyId,
                  kind: setup.instruction.action === 'throw' ? 'thrown' : 'hit',
                  actionLabel: setup.instruction.action === 'throw' ? 'THROW' : 'KNOCKBACK',
                  n: 0,
                },
                updates: [{ id: setup.dummyId, values: { x } }],
              };
            }
          }
        }
        const beforeTargetHp = before.find((fighter) => fighter.instanceId === setup.effectTargetId)?.hp ?? 0;
        const afterTargetHp =
          fighters.find((fighter) => fighter.instanceId === setup.effectTargetId)?.hp ?? beforeTargetHp;
        const healing = Math.max(0, afterTargetHp - beforeTargetHp);
        if (healing > 0) {
          totalHealing += healing;
          effect = { elapsed: round(elapsed), amount: healing, kind: 'healing' };
          events.push(effect);
        }
        const actor = fighters.find((fighter) => fighter.instanceId === setup.actorId);
        const dummy = fighters.find((fighter) => fighter.instanceId === setup.dummyId);
        maximumActorDisplacement = Math.max(
          maximumActorDisplacement,
          Math.abs((actor?.x ?? setup.actorX) - setup.actorX),
        );
        maximumTargetDisplacement = Math.max(
          maximumTargetDisplacement,
          Math.abs((dummy?.x ?? setup.targetX) - setup.targetX),
        );
        if (!(step.flash.kind === 'death' && step.flash.id === setup.dummyId)) {
          playback.push({
            elapsed: round(elapsed),
            fighters: snapshotFighters(fighters),
            flash: { ...step.flash },
            effect,
          });
        }
        if (trainingMovementStep) queue.unshift(trainingMovementStep);
      } else {
        fighters = tickCooldowns(fighters, tick);
      }
    } else {
      const plan = planBattleFrame({ fighters, team: setup.team, dt: tick, elapsed, previousElapsed });
      fighters = plan.fighters;
      queue = plan.steps;
      decisions.push(...plan.decisions);
      if (
        plan.decisions.some(
          (decision) => decision.actorId === setup.actorId && decision.actionId === setup.instruction.id,
        )
      ) {
        singleAttempted = true;
      }
    }

    const actor = fighters.find((fighter) => fighter.instanceId === setup.actorId);
    if (actor) {
      minimumGauge = Math.min(minimumGauge, actor.abilityGauge);
      if (actor.abilityGauge <= Number.EPSILON) emptyGaugeSeconds += tick;
    }
    if (input.mode === 'single' && singleAttempted && queue.length === 0) break;
  }

  const actionDecisions = decisions.filter(
    (decision) => decision.actorId === setup.actorId && decision.actionId === setup.instruction.id,
  );
  const executions = actionDecisions.filter((decision) => decision.outcome === 'executed').length;
  const finalActor = fighters.find((fighter) => fighter.instanceId === setup.actorId);
  const finalTarget = fighters.find((fighter) => fighter.instanceId === setup.effectTargetId);
  const finalDummy = fighters.find((fighter) => fighter.instanceId === setup.dummyId);
  const effectTotal = totalDamage + totalHealing;
  const costSpent = executions * setup.instruction.abilityCost;
  const initialTargetStatuses = setup.fighters.find((fighter) => fighter.instanceId === setup.effectTargetId)?.statuses;
  const hasStateEffect =
    JSON.stringify(finalTarget?.statuses ?? []) !== JSON.stringify(initialTargetStatuses ?? []) ||
    maximumTargetDisplacement > Number.EPSILON ||
    maximumActorDisplacement > Number.EPSILON ||
    Boolean(finalActor && finalActor.statuses.length > 0);
  const verdict =
    totalDamage > 0 ? 'damage' : totalHealing > 0 ? 'healing' : executions > 0 || hasStateEffect ? 'effect' : 'blocked';

  return {
    elapsed: round(elapsed),
    attempts: actionDecisions.length,
    executions,
    hits,
    totalDamage,
    damagePerHit: hits > 0 ? round(totalDamage / hits, 1) : 0,
    lastDamage: [...events].reverse().find((event) => event.kind === 'damage')?.amount ?? 0,
    dps: elapsed > 0 ? round(totalDamage / elapsed, 1) : 0,
    totalHealing,
    healingPerSecond: elapsed > 0 ? round(totalHealing / elapsed, 1) : 0,
    costSpent,
    effectPerCost: costSpent > 0 ? round(effectTotal / costSpent, 1) : null,
    usesPerMinute: elapsed > 0 ? round((executions / elapsed) * 60, 1) : 0,
    timeToKill: null,
    finalTargetHp: Math.max(0, round(finalTarget?.hp ?? 0, 1)),
    finalTargetHpRatio: finalTarget ? round(finalTarget.hp / finalTarget.maxHp, 3) : 0,
    finalPoison: finalTarget ? statusStacks(finalTarget, 'poison') : 0,
    finalActorStatuses: finalActor ? readDebugStatusValues(finalActor) : createDefaultDebugStatuses(),
    finalTargetStatuses: finalDummy ? readDebugStatusValues(finalDummy) : createDefaultDebugStatuses(),
    targetDisplacement: round(maximumTargetDisplacement, 1),
    actorDisplacement: round(maximumActorDisplacement, 1),
    attackDelta: round((finalActor?.attack ?? initialActor.attack) - initialActor.attack, 1),
    speedDelta: round((finalActor?.speed ?? initialActor.speed) - initialActor.speed, 2),
    effectState:
      finalActor && hasStatus(finalActor, 'berserk')
        ? 'BERSERK'
        : finalActor && hasStatus(finalActor, 'guarded')
          ? 'GUARD'
          : 'ACTIVE',
    minimumGauge: round(minimumGauge, 1),
    emptyGaugeRate: elapsed > 0 ? round(emptyGaugeSeconds / elapsed, 3) : 0,
    mutualDistance: setup.startingDistance,
    startingDistance: setup.startingDistance,
    targetRecoveryCount: targetRecoveryCount,
    skipped: countSkips(decisions, setup.instruction.id),
    events: events.slice(0, 160),
    playback: playback.slice(0, 160),
    verdict,
  };
}
