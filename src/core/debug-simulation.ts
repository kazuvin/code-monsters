import { BATTLE_CONFIG, CONDITIONS, INSTRUCTIONS, UNITS } from '../data.ts';
import type {
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
import { tickCooldowns } from './rules.ts';

export type DebugRunMode = 'single' | 'timeline';

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
  targetPoison: number;
  targetGuarded: boolean;
  targetBerserk: boolean;
  targetTaunted: boolean;
};

export type DebugEffectEvent = {
  elapsed: number;
  amount: number;
  kind: 'damage' | 'healing';
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
  targetDisplacement: number;
  actorDisplacement: number;
  attackDelta: number;
  speedDelta: number;
  effectState: 'BERSERK' | 'GUARD' | 'ACTIVE';
  minimumGauge: number;
  emptyGaugeRate: number;
  mutualDistance: number;
  targetRecoveryCount: number;
  skipped: Record<DecisionReason, number>;
  events: DebugEffectEvent[];
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
  mutualDistance: number;
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
  guarded: false,
  guardDamageScale: 1,
  guardKnockbackScale: 1,
  berserk: false,
  poison: 0,
  tauntTargetId: null,
  tauntSeconds: 0,
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

function mutualRangeDistance(actor: UnitDefinition, target: UnitDefinition): number {
  return round(Math.max(2, Math.min(actor.range, target.range) * BATTLE_CONFIG.rangeStopRatio), 1);
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
  const distance = mutualRangeDistance(actorDefinition, targetDefinition);
  const actorX = round(50 - distance / 2, 1);
  const targetX = round(50 + distance / 2, 1);
  const runDuration = input.mode === 'single' ? 12 : input.durationSeconds;
  const inertCooldown = runDuration + BATTLE_CONFIG.overheatStartSeconds + 10;
  const targetMaxHp = Math.max(1, Math.round(input.targetMaxHp));
  const targetSelectorId = debugTargetSelector(instruction, input.targetSelectorId);
  const targetDomain: TargetDomain = targetSelectorId === 'self' ? 'self' : 'enemy';
  const guardInstruction = instructionById.get('tank-guard');

  const actorInventory: UnitInventoryItem = {
    ...actorDefinition,
    inventoryId: actorId,
    program: [{ actionId: instruction.id, conditionId: input.conditionId, targetId: targetSelectorId }],
    reaction: null,
  };
  const actor: Fighter = {
    ...actorInventory,
    ...baseFighterState,
    instanceId: actorId,
    team: 'ally',
    hp: Math.max(1, Math.round(actorDefinition.maxHp * clamp(input.actorHpRatio, 0.01, 1))),
    abilityGauge: clamp(input.initialGauge, 0, BATTLE_CONFIG.abilityGaugeMax),
    x: actorX,
    cooldown: 0,
  };
  const target: Fighter = {
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
    poison: Math.max(0, Math.round(input.targetPoison)),
    guarded: input.targetGuarded,
    guardDamageScale: input.targetGuarded ? (guardInstruction?.params.incomingDamageScale ?? 1) : 1,
    guardKnockbackScale: input.targetGuarded ? (guardInstruction?.params.incomingKnockbackScale ?? 1) : 1,
    berserk: input.targetBerserk,
    tauntTargetId: input.targetTaunted ? actorId : null,
    tauntSeconds: input.targetTaunted ? inertCooldown : 0,
    attack: 0,
    x: targetX,
    cooldown: inertCooldown,
  };

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
    mutualDistance: distance,
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

function restoreTrainingPositions(fighters: Fighter[], setup: DebugSetup): Fighter[] {
  return fighters.map((fighter) => {
    if (fighter.instanceId === setup.actorId) return { ...fighter, x: setup.actorX };
    if (fighter.instanceId === setup.dummyId) return { ...fighter, x: setup.targetX, hp: fighter.maxHp };
    return fighter;
  });
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
  let maximumTargetDisplacement = 0;
  let maximumActorDisplacement = 0;
  const decisions: DecisionTrace[] = [];
  const events: DebugEffectEvent[] = [];
  const initialActor = fighters.find((fighter) => fighter.instanceId === setup.actorId)!;
  const initialEffectTarget = fighters.find((fighter) => fighter.instanceId === setup.effectTargetId)!;

  while (elapsed < limit - Number.EPSILON) {
    previousElapsed = elapsed;
    elapsed = Math.min(limit, elapsed + dt);
    const tick = elapsed - previousElapsed;
    stepClock += tick;

    if (queue.length > 0) {
      const before = fighters;
      if (stepClock + Number.EPSILON >= stepInterval) {
        const step = queue.shift()!;
        stepClock = 0;
        fighters = applyBattleStep(tickCooldowns(fighters, tick), step);
        if (step.damage?.actionId === setup.instruction.id && step.damage.actorId === setup.actorId) {
          totalDamage += step.damage.amount;
          hits += 1;
          targetRecoveryCount += 1;
          events.push({ elapsed: round(elapsed), amount: step.damage.amount, kind: 'damage' });
        }
        const beforeTargetHp = before.find((fighter) => fighter.instanceId === setup.effectTargetId)?.hp ?? 0;
        const afterTargetHp =
          fighters.find((fighter) => fighter.instanceId === setup.effectTargetId)?.hp ?? beforeTargetHp;
        const healing = Math.max(0, afterTargetHp - beforeTargetHp);
        if (healing > 0) {
          totalHealing += healing;
          events.push({ elapsed: round(elapsed), amount: healing, kind: 'healing' });
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
        fighters = restoreTrainingPositions(fighters, setup);
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
  const effectTotal = totalDamage + totalHealing;
  const costSpent = executions * setup.instruction.abilityCost;
  const initialPoison = setup.fighters.find((fighter) => fighter.instanceId === setup.effectTargetId)?.poison ?? 0;
  const hasStateEffect =
    (finalTarget?.poison ?? 0) !== initialPoison ||
    maximumTargetDisplacement > Number.EPSILON ||
    maximumActorDisplacement > Number.EPSILON ||
    Boolean(finalActor?.berserk || finalActor?.guarded);
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
    finalPoison: finalTarget?.poison ?? 0,
    targetDisplacement: round(maximumTargetDisplacement, 1),
    actorDisplacement: round(maximumActorDisplacement, 1),
    attackDelta: round((finalActor?.attack ?? initialActor.attack) - initialActor.attack, 1),
    speedDelta: round((finalActor?.speed ?? initialActor.speed) - initialActor.speed, 2),
    effectState: finalActor?.berserk ? 'BERSERK' : finalActor?.guarded ? 'GUARD' : 'ACTIVE',
    minimumGauge: round(minimumGauge, 1),
    emptyGaugeRate: elapsed > 0 ? round(emptyGaugeSeconds / elapsed, 3) : 0,
    mutualDistance: setup.mutualDistance,
    targetRecoveryCount: targetRecoveryCount,
    skipped: countSkips(decisions, setup.instruction.id),
    events: events.slice(0, 160),
    verdict,
  };
}
