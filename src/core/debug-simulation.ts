import { BATTLE_CONFIG, CONDITIONS, INSTRUCTIONS, TARGET_SELECTORS, UNITS } from '../data.ts';
import type {
  ConditionId,
  Fighter,
  Instruction,
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
  distance: number;
  targetMaxHp: number;
  targetHpRatio: number;
  targetDefense: number;
  targetWeight: number;
  targetPoison: number;
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
  dps: number;
  totalHealing: number;
  healingPerSecond: number;
  costSpent: number;
  effectPerCost: number | null;
  usesPerMinute: number;
  timeToKill: number | null;
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
  skipped: Record<DecisionReason, number>;
  events: DebugEffectEvent[];
  verdict: 'damage' | 'healing' | 'effect' | 'blocked';
};

const unitById = new Map(UNITS.map((unit) => [unit.id, unit]));
const instructionById = new Map(INSTRUCTIONS.map((instruction) => [instruction.id, instruction]));
const targetById = new Map(TARGET_SELECTORS.map((target) => [target.id, target]));
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

function inertFighter(
  definition: UnitDefinition,
  overrides: Pick<Fighter, 'instanceId' | 'team' | 'hp' | 'maxHp' | 'x' | 'cooldown'> & Partial<Fighter>,
): Fighter {
  return {
    ...definition,
    ...baseFighterState,
    ...overrides,
  };
}

function makeDebugSetup(input: DebugSimulationInput): {
  fighters: Fighter[];
  team: UnitInventoryItem[];
  actorId: string;
  targetId: string;
  instruction: Instruction;
  targetDomain: TargetDomain;
} {
  const actorDefinition = requireUnit(input.actorUnitId);
  const targetDefinition = requireUnit(input.targetUnitId);
  const instruction = requireInstruction(input.instructionId);
  const selector = targetById.get(input.targetSelectorId);
  if (!selector) throw new Error(`Unknown debug target selector: ${input.targetSelectorId}`);
  if (!conditionIds.has(input.conditionId)) throw new Error(`Unknown debug condition: ${input.conditionId}`);

  const actorId = 'debug-actor';
  const actorX = 18;
  const targetX = clamp(actorX + input.distance, BATTLE_CONFIG.wallLeft, BATTLE_CONFIG.wallRight);
  const runDuration = input.mode === 'single' ? 12 : input.durationSeconds;
  const inertCooldown = runDuration + BATTLE_CONFIG.overheatStartSeconds + 10;
  const targetMaxHp = Math.max(1, Math.round(input.targetMaxHp));
  const targetHp = Math.max(1, Math.round(targetMaxHp * clamp(input.targetHpRatio, 0.01, 1)));

  const actorInventory: UnitInventoryItem = {
    ...actorDefinition,
    inventoryId: actorId,
    program: [
      {
        actionId: instruction.id,
        conditionId: input.conditionId,
        targetId: input.targetSelectorId,
      },
    ],
    reaction: null,
  };
  const actor: Fighter = {
    ...actorInventory,
    ...baseFighterState,
    instanceId: actorId,
    team: 'ally',
    hp:
      selector.domain === 'self'
        ? Math.max(1, Math.round(actorDefinition.maxHp * clamp(input.targetHpRatio, 0.01, 1)))
        : actorDefinition.maxHp,
    abilityGauge: clamp(input.initialGauge, 0, BATTLE_CONFIG.abilityGaugeMax),
    x: actorX,
    cooldown: 0,
  };

  if (selector.domain === 'enemy') {
    const targetId = 'debug-target';
    const target = inertFighter(targetDefinition, {
      instanceId: targetId,
      team: 'enemy',
      name: `DUMMY / ${targetDefinition.name}`,
      maxHp: targetMaxHp,
      hp: targetHp,
      defense: Math.max(0, Math.round(input.targetDefense)),
      weight: Math.max(0, input.targetWeight),
      poison: Math.max(0, Math.round(input.targetPoison)),
      attack: 0,
      x: targetX,
      cooldown: inertCooldown,
    });
    return { fighters: [actor, target], team: [actorInventory], actorId, targetId, instruction, targetDomain: 'enemy' };
  }

  const anchor = inertFighter(targetDefinition, {
    instanceId: 'debug-anchor',
    team: 'enemy',
    name: 'SAFETY ANCHOR',
    maxHp: 999_999,
    hp: 999_999,
    defense: 999,
    weight: 999,
    attack: 0,
    x: BATTLE_CONFIG.wallRight,
    cooldown: inertCooldown,
  });
  if (selector.domain === 'self') {
    return {
      fighters: [actor, anchor],
      team: [actorInventory],
      actorId,
      targetId: actorId,
      instruction,
      targetDomain: 'self',
    };
  }

  const targetId = 'debug-target';
  const allyTarget = inertFighter(targetDefinition, {
    instanceId: targetId,
    team: 'ally',
    name: `ALLY RIG / ${targetDefinition.name}`,
    maxHp: targetMaxHp,
    hp: targetHp,
    defense: Math.max(0, Math.round(input.targetDefense)),
    weight: Math.max(0, input.targetWeight),
    poison: Math.max(0, Math.round(input.targetPoison)),
    attack: 0,
    x: targetX,
    cooldown: inertCooldown,
  });
  return {
    fighters: [actor, allyTarget, anchor],
    team: [actorInventory],
    actorId,
    targetId,
    instruction,
    targetDomain: 'ally',
  };
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
  let timeToKill: number | null = null;
  let minimumGauge = clamp(input.initialGauge, 0, BATTLE_CONFIG.abilityGaugeMax);
  let emptyGaugeSeconds = 0;
  let totalDamage = 0;
  let totalHealing = 0;
  let hits = 0;
  const decisions: DecisionTrace[] = [];
  const events: DebugEffectEvent[] = [];
  const initialActorX = fighters.find((fighter) => fighter.instanceId === setup.actorId)?.x ?? 0;
  const initialActorAttack = fighters.find((fighter) => fighter.instanceId === setup.actorId)?.attack ?? 0;
  const initialActorSpeed = fighters.find((fighter) => fighter.instanceId === setup.actorId)?.speed ?? 0;
  const initialTargetX = fighters.find((fighter) => fighter.instanceId === setup.targetId)?.x ?? 0;

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
          events.push({ elapsed: round(elapsed), amount: step.damage.amount, kind: 'damage' });
        }
        const beforeTargetHp = before.find((fighter) => fighter.instanceId === setup.targetId)?.hp ?? 0;
        const afterTargetHp = fighters.find((fighter) => fighter.instanceId === setup.targetId)?.hp ?? beforeTargetHp;
        const healing = Math.max(0, afterTargetHp - beforeTargetHp);
        if (healing > 0) {
          totalHealing += healing;
          events.push({ elapsed: round(elapsed), amount: healing, kind: 'healing' });
        }
        if (setup.targetDomain === 'enemy' && afterTargetHp <= 0 && timeToKill === null) timeToKill = elapsed;
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
    const target = fighters.find((fighter) => fighter.instanceId === setup.targetId);
    if (setup.targetDomain === 'enemy' && target && target.hp <= 0 && queue.length === 0) break;
    if (input.mode === 'single' && singleAttempted && queue.length === 0) break;
  }

  const actionDecisions = decisions.filter(
    (decision) => decision.actorId === setup.actorId && decision.actionId === setup.instruction.id,
  );
  const executions = actionDecisions.filter((decision) => decision.outcome === 'executed').length;
  const finalActor = fighters.find((fighter) => fighter.instanceId === setup.actorId);
  const finalTarget = fighters.find((fighter) => fighter.instanceId === setup.targetId);
  const effectTotal = totalDamage + totalHealing;
  const costSpent = executions * setup.instruction.abilityCost;
  const hasStateEffect =
    (finalTarget?.poison ?? 0) !== input.targetPoison ||
    Math.abs((finalTarget?.x ?? initialTargetX) - initialTargetX) > Number.EPSILON ||
    Math.abs((finalActor?.x ?? initialActorX) - initialActorX) > Number.EPSILON ||
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
    dps: elapsed > 0 ? round(totalDamage / elapsed, 1) : 0,
    totalHealing,
    healingPerSecond: elapsed > 0 ? round(totalHealing / elapsed, 1) : 0,
    costSpent,
    effectPerCost: costSpent > 0 ? round(effectTotal / costSpent, 1) : null,
    usesPerMinute: elapsed > 0 ? round((executions / elapsed) * 60, 1) : 0,
    timeToKill: timeToKill === null ? null : round(timeToKill),
    finalTargetHp: Math.max(0, round(finalTarget?.hp ?? 0, 1)),
    finalTargetHpRatio: finalTarget ? round(finalTarget.hp / finalTarget.maxHp, 3) : 0,
    finalPoison: finalTarget?.poison ?? 0,
    targetDisplacement: round(Math.abs((finalTarget?.x ?? initialTargetX) - initialTargetX), 1),
    actorDisplacement: round(Math.abs((finalActor?.x ?? initialActorX) - initialActorX), 1),
    attackDelta: round((finalActor?.attack ?? initialActorAttack) - initialActorAttack, 1),
    speedDelta: round((finalActor?.speed ?? initialActorSpeed) - initialActorSpeed, 2),
    effectState: finalActor?.berserk ? 'BERSERK' : finalActor?.guarded ? 'GUARD' : 'ACTIVE',
    minimumGauge: round(minimumGauge, 1),
    emptyGaugeRate: elapsed > 0 ? round(emptyGaugeSeconds / elapsed, 3) : 0,
    skipped: countSkips(decisions, setup.instruction.id),
    events: events.slice(0, 160),
    verdict,
  };
}
