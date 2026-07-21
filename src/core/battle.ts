import { analyzeCircuit, calculateChargeByCell, cellKey, cloneBoard } from './circuit';
import { buffStatForEffect, buffStatsForBlock, effectScalingBonus, incomingSkillModifiers } from './skill-progress';
import type {
  BattleState,
  BattleTraceEvent,
  BlockDefinition,
  BlockEffect,
  CellPosition,
  CircuitBoard,
  EffectTrigger,
  FighterState,
  GameData,
  SkillBuffState,
  Team,
  Winner,
} from './types';

type PlannedActivation = {
  team: Team;
  block: BlockDefinition;
  position: CellPosition;
  pathLength: number;
  inCycle: boolean;
  upstream: CellPosition[];
  downstream: CellPosition[];
  boost: number;
  waveStep: number;
  mergeMultiplier: number;
  charge: number;
};

export type BattleOptions = { enemyMaxHpBonus?: number };

const otherTeam = (team: Team): Team => (team === 'player' ? 'enemy' : 'player');

const winnerOf = (fighters: FighterState[]): Winner => {
  const player = fighters.find((fighter) => fighter.team === 'player');
  const enemy = fighters.find((fighter) => fighter.team === 'enemy');
  if (!player || !enemy) return null;
  if (player.hp <= 0 && enemy.hp <= 0) return 'draw';
  if (player.hp <= 0) return 'enemy';
  if (enemy.hp <= 0) return 'player';
  return null;
};

export const suddenDeathStartTick = (data: GameData) =>
  Math.ceil((data.rules.suddenDeathSeconds * 1000) / data.rules.battleStepMs);

export const overloadLevelAtTick = (data: GameData, tick: number) => Math.max(0, tick - suddenDeathStartTick(data) + 1);

export const overloadDamageAtTick = (data: GameData, tick: number) => {
  const level = overloadLevelAtTick(data, tick);
  if (level === 0) return 0;
  return Math.round(data.rules.suddenDeathBaseDamage * data.rules.suddenDeathGrowth ** (level - 1));
};

const fighterFor = (data: GameData, team: Team, options: BattleOptions): FighterState => {
  const unitId = team === 'player' ? data.playerUnitId : data.enemyUnitId;
  const unit = data.units.find((candidate) => candidate.id === unitId);
  if (!unit) throw new Error(`Missing ${team} unit "${unitId}"`);
  const maxHp = unit.maxHp + (team === 'enemy' ? (options.enemyMaxHpBonus ?? 0) : 0);
  return {
    instanceId: `${team}-${unit.id}`,
    unitId: unit.id,
    name: unit.name,
    code: unit.code,
    color: unit.color,
    team,
    hp: maxHp,
    maxHp,
    shield: 0,
    poison: 0,
  };
};

export function createBattle(
  data: GameData,
  playerBoard: CircuitBoard,
  enemyBoard: CircuitBoard,
  options: BattleOptions = {},
): BattleState {
  const playerAnalysis = analyzeCircuit(playerBoard, data.blocks, data.rules.sourceRow);
  const enemyAnalysis = analyzeCircuit(enemyBoard, data.blocks, data.rules.sourceRow);
  return {
    tick: 0,
    fighters: [fighterFor(data, 'player', options), fighterFor(data, 'enemy', options)],
    playerBoard: cloneBoard(playerBoard),
    enemyBoard: cloneBoard(enemyBoard),
    playerPowered: [...playerAnalysis.poweredCells],
    enemyPowered: [...enemyAnalysis.poweredCells],
    skillBuffs: { player: {}, enemy: {} },
    activePulse: { player: [], enemy: [] },
    pulseStep: 0,
    pulseStepCount: 0,
    trace: [],
    overloadLevel: 0,
    overloadDamage: 0,
    winner: null,
  };
}

const hasActivation = (block: BlockDefinition) =>
  block.effects.some((effect) => !['amplify', 'haste', 'charge'].includes(effect.kind));

function plannedActivations(data: GameData, board: CircuitBoard, team: Team, tick: number): PlannedActivation[] {
  const definitions = new Map(data.blocks.map((block) => [block.id, block]));
  const analysis = analyzeCircuit(board, data.blocks, data.rules.sourceRow);
  const chargeByCell = calculateChargeByCell(board, data.blocks, analysis);
  const plans: PlannedActivation[] = [];

  board.forEach((row, rowIndex) =>
    row.forEach((placed, columnIndex) => {
      const position = { row: rowIndex, column: columnIndex };
      const key = cellKey(position);
      if (!placed || !analysis.poweredCells.has(key)) return;
      const block = definitions.get(placed.blockId);
      if (!block || !hasActivation(block)) return;
      const upstream = analysis.upstreamCells.get(key) ?? [];
      const modifiers = incomingSkillModifiers(board, data.blocks, analysis, position);
      const cooldown = Math.max(1, (block.cooldown ?? 1) - modifiers.cooldownReduction);
      if ((tick - 1) % cooldown !== 0) return;
      plans.push({
        team,
        block,
        position,
        pathLength: analysis.routeLength.get(key) ?? 1,
        inCycle: analysis.cyclicCells.has(key),
        upstream,
        downstream: analysis.downstreamCells.get(key) ?? [],
        boost: modifiers.effectPower,
        waveStep: analysis.waveStep.get(key) ?? 1,
        mergeMultiplier: analysis.mergeCells.has(key) ? data.rules.mergeEffectMultiplier : 1,
        charge: chargeByCell.get(key) ?? 0,
      });
    }),
  );

  return plans.sort(
    (left, right) =>
      left.waveStep - right.waveStep ||
      left.position.row - right.position.row ||
      left.position.column - right.position.column,
  );
}

const triggerMatches = (
  trigger: EffectTrigger | undefined,
  context: { enemyPoison: number; pathLength: number; inCycle: boolean },
) => {
  if (!trigger) return true;
  if (trigger.kind === 'enemy-poisoned') return context.enemyPoison > 0;
  if (trigger.kind === 'path-length-at-least') return context.pathLength >= trigger.amount;
  return context.inCycle;
};

const traceEvent = (
  tick: number,
  action: PlannedActivation,
  kind: Extract<BattleTraceEvent, { blockId: string }>['kind'],
  value: number,
  targetId: string,
  sequence: number,
  buffStat?: Extract<BattleTraceEvent, { blockId: string }>['buffStat'],
  charge?: number,
): BattleTraceEvent => ({
  id: `${tick}-${action.team}-${action.position.row}-${action.position.column}-${sequence}`,
  tick,
  team: action.team,
  kind,
  blockId: action.block.id,
  row: action.position.row,
  column: action.position.column,
  value,
  targetId,
  ...(buffStat ? { buffStat } : {}),
  ...(action.mergeMultiplier > 1 ? { mergeMultiplier: action.mergeMultiplier } : {}),
  ...(charge === undefined ? {} : { charge }),
});

const systemTraceEvent = (
  tick: number,
  fighter: FighterState,
  kind: 'overload' | 'poison-tick',
  value: number,
): BattleTraceEvent => ({
  id: `${tick}-${kind}-${fighter.team}`,
  tick,
  team: fighter.team,
  kind,
  value,
  targetId: fighter.instanceId,
});

const numericAmount = (
  effect: Extract<BlockEffect, { amount: number }>,
  action: PlannedActivation,
  context: { selfBuffs: SkillBuffState; enemyPoison: number },
) => {
  const buffStat = buffStatForEffect(effect);
  const amount =
    effect.amount +
    ('scaling' in effect
      ? effectScalingBonus(effect.scaling, {
          enemyPoison: context.enemyPoison,
          pathLength: action.pathLength,
        })
      : 0) +
    (buffStat ? (context.selfBuffs[buffStat] ?? 0) + action.boost : 0);
  return amount * action.mergeMultiplier;
};

const cloneSkillBuffs = (buffs: BattleState['skillBuffs']): BattleState['skillBuffs'] => ({
  player: Object.fromEntries(Object.entries(buffs.player).map(([key, value]) => [key, { ...value }])),
  enemy: Object.fromEntries(Object.entries(buffs.enemy).map(([key, value]) => [key, { ...value }])),
});

export function resolveWave(data: GameData, state: BattleState, tick: number): BattleState[] {
  if (state.winner) return [state];
  const fighters = state.fighters.map((fighter) => ({ ...fighter }));
  const skillBuffs = cloneSkillBuffs(state.skillBuffs);
  const playerAnalysis = analyzeCircuit(state.playerBoard, data.blocks, data.rules.sourceRow);
  const enemyAnalysis = analyzeCircuit(state.enemyBoard, data.blocks, data.rules.sourceRow);
  const plans = [
    ...plannedActivations(data, state.playerBoard, 'player', tick),
    ...plannedActivations(data, state.enemyBoard, 'enemy', tick),
  ];
  const trace = [...state.trace];
  const fighter = (team: Team) => fighters.find((candidate) => candidate.team === team)!;
  const pulseStepCount = Math.max(1, ...playerAnalysis.waveStep.values(), ...enemyAnalysis.waveStep.values());
  const frames: BattleState[] = [];

  for (let pulseStep = 1; pulseStep <= pulseStepCount; pulseStep += 1) {
    const pendingDamage = new Map<Team, number>();
    const stagePlans = plans
      .filter((plan) => plan.waveStep === pulseStep)
      .sort(
        (left, right) =>
          left.team.localeCompare(right.team) ||
          left.position.row - right.position.row ||
          left.position.column - right.position.column,
      );

    for (const plan of stagePlans) {
      const actor = fighter(plan.team);
      const target = fighter(otherTeam(plan.team));
      const planKey = cellKey(plan.position);
      const context = {
        enemyPoison: target.poison,
        pathLength: plan.pathLength,
        inCycle: plan.inCycle,
        selfBuffs: skillBuffs[plan.team][planKey] ?? {},
      };

      for (const effect of plan.block.effects) {
        if (effect.kind === 'amplify' || effect.kind === 'haste' || effect.kind === 'charge') continue;
        if (!triggerMatches(effect.trigger, context)) continue;

        if (effect.kind === 'release-charge') {
          const value =
            (effect.amount + plan.charge * effect.perCharge + (context.selfBuffs[effect.output] ?? 0) + plan.boost) *
            plan.mergeMultiplier;
          if (effect.output === 'damage') {
            pendingDamage.set(target.team, (pendingDamage.get(target.team) ?? 0) + value);
            trace.push(
              traceEvent(tick, plan, 'damage', value, target.instanceId, trace.length, undefined, plan.charge),
            );
          } else {
            actor.shield += value;
            trace.push(traceEvent(tick, plan, 'shield', value, actor.instanceId, trace.length, undefined, plan.charge));
          }
          continue;
        }

        if (effect.kind === 'rupture-poison') {
          const consumed = Math.floor(target.poison * effect.fraction);
          if (consumed === 0) continue;
          target.poison -= consumed;
          const damagePerStack = effect.damagePerStack + (context.selfBuffs.rupture ?? 0) + plan.boost;
          const value = consumed * damagePerStack * plan.mergeMultiplier;
          pendingDamage.set(target.team, (pendingDamage.get(target.team) ?? 0) + value);
          trace.push(traceEvent(tick, plan, 'rupture', value, target.instanceId, trace.length));
          continue;
        }

        const amount = numericAmount(effect, plan, context);
        if (effect.kind === 'damage') {
          pendingDamage.set(target.team, (pendingDamage.get(target.team) ?? 0) + amount);
          trace.push(traceEvent(tick, plan, 'damage', amount, target.instanceId, trace.length));
        }
        if (effect.kind === 'shield') {
          actor.shield += amount;
          trace.push(traceEvent(tick, plan, 'shield', amount, actor.instanceId, trace.length));
        }
        if (effect.kind === 'repair') {
          const previousHp = actor.hp;
          actor.hp = Math.min(actor.maxHp, actor.hp + amount);
          trace.push(traceEvent(tick, plan, 'repair', actor.hp - previousHp, actor.instanceId, trace.length));
        }
        if (effect.kind === 'poison') {
          target.poison += amount;
          trace.push(traceEvent(tick, plan, 'poison', amount, target.instanceId, trace.length));
        }
        if (effect.kind === 'growth') {
          const targets =
            effect.target === 'self' ? [plan.position] : effect.target === 'upstream' ? plan.upstream : plan.downstream;
          targets.forEach((position) => {
            const targetKey = cellKey(position);
            const targetPlaced = (plan.team === 'player' ? state.playerBoard : state.enemyBoard)[position.row][
              position.column
            ];
            const targetBlock = targetPlaced
              ? data.blocks.find((block) => block.id === targetPlaced.blockId)
              : undefined;
            if (!targetBlock) return;
            const stats = effect.stat === 'all' ? buffStatsForBlock(targetBlock) : [effect.stat];
            stats.forEach((stat) => {
              const current = skillBuffs[plan.team][targetKey] ?? {};
              skillBuffs[plan.team][targetKey] = { ...current, [stat]: (current[stat] ?? 0) + amount };
              trace.push(traceEvent(tick, plan, 'growth', amount, `${plan.team}:${targetKey}`, trace.length, stat));
            });
          });
        }
      }
    }

    for (const [team, amount] of pendingDamage) {
      const target = fighter(team);
      const blocked = Math.min(target.shield, amount);
      target.shield -= blocked;
      target.hp = Math.max(0, target.hp - (amount - blocked));
    }

    const finalStep = pulseStep === pulseStepCount;
    let winner: Winner = null;
    let overloadLevel = state.overloadLevel;
    let overloadDamage = 0;
    if (finalStep) {
      winner = winnerOf(fighters);
      const poisonTickInterval = Math.max(
        1,
        Math.ceil((data.rules.poisonTickSeconds * 1000) / data.rules.battleStepMs),
      );
      if (!winner && tick % poisonTickInterval === 0) {
        fighters.forEach((target) => {
          if (target.poison <= 0 || target.hp <= 0) return;
          const applied = Math.min(target.hp, target.poison);
          target.hp = Math.max(0, target.hp - target.poison);
          trace.push(systemTraceEvent(tick, target, 'poison-tick', applied));
          target.poison = Math.max(0, target.poison - data.rules.poisonDecay);
        });
        winner = winnerOf(fighters);
      }

      overloadLevel = overloadLevelAtTick(data, tick);
      overloadDamage = winner ? 0 : overloadDamageAtTick(data, tick);
      if (!winner && overloadDamage > 0) {
        const healthBeforeOverload = new Map(fighters.map((target) => [target.team, target.hp]));
        for (const target of fighters) {
          const applied = Math.min(target.hp, overloadDamage);
          target.hp = Math.max(0, target.hp - overloadDamage);
          trace.push(systemTraceEvent(tick, target, 'overload', applied));
        }

        winner = winnerOf(fighters);
        if (winner === 'draw') {
          const playerHp = healthBeforeOverload.get('player') ?? 0;
          const enemyHp = healthBeforeOverload.get('enemy') ?? 0;
          if (playerHp !== enemyHp) winner = playerHp > enemyHp ? 'player' : 'enemy';
        }
      }
    }

    const activePulse = {
      player: [...playerAnalysis.waveStep]
        .filter(([, step]) => step === pulseStep)
        .map(([key]) => key)
        .sort(),
      enemy: [...enemyAnalysis.waveStep]
        .filter(([, step]) => step === pulseStep)
        .map(([key]) => key)
        .sort(),
    };
    frames.push({
      ...state,
      tick,
      fighters: fighters.map((target) => ({ ...target })),
      skillBuffs: cloneSkillBuffs(skillBuffs),
      activePulse,
      pulseStep,
      pulseStepCount,
      trace: [...trace],
      overloadLevel,
      overloadDamage,
      winner,
    });
  }

  return frames;
}

export function resolveTick(data: GameData, state: BattleState, tick: number): BattleState {
  return resolveWave(data, state, tick).at(-1)!;
}

export function createPlayback(
  data: GameData,
  playerBoard: CircuitBoard,
  enemyBoard: CircuitBoard,
  options: BattleOptions = {},
): BattleState[] {
  let state = createBattle(data, playerBoard, enemyBoard, options);
  const frames = [state];
  for (let tick = 1; !state.winner; tick += 1) {
    const waveFrames = resolveWave(data, state, tick);
    frames.push(...waveFrames);
    state = waveFrames.at(-1)!;
  }
  return frames;
}

export function runBattle(
  data: GameData,
  playerBoard: CircuitBoard,
  enemyBoard: CircuitBoard,
  options: BattleOptions = {},
): BattleState {
  return createPlayback(data, playerBoard, enemyBoard, options).at(-1)!;
}
