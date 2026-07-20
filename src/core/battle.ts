import type {
  BattleState,
  BattleTraceEvent,
  CommandDefinition,
  FighterState,
  GameData,
  ProgramBoard,
  Team,
  Winner,
} from './types';

type PlannedCommand = {
  actorId: string;
  command: CommandDefinition;
  depth: number;
};

const otherTeam = (team: Team): Team => (team === 'player' ? 'enemy' : 'player');
const cloneBoard = (board: ProgramBoard): ProgramBoard => board.map((row) => [...row]);

const winnerOf = (fighters: FighterState[]): Winner => {
  const playerAlive = fighters.some((fighter) => fighter.team === 'player' && fighter.hp > 0);
  const enemyAlive = fighters.some((fighter) => fighter.team === 'enemy' && fighter.hp > 0);
  if (!playerAlive && !enemyAlive) return 'draw';
  if (!playerAlive) return 'enemy';
  if (!enemyAlive) return 'player';
  return null;
};

const fighterId = (team: Team, unitId: string) => `${team}-${unitId}`;

export function createBattle(data: GameData, playerProgram: ProgramBoard, enemyProgram: ProgramBoard): BattleState {
  const fighters = (['player', 'enemy'] as const).flatMap((team) =>
    data.units.map(
      (unit, lane): FighterState => ({
        instanceId: fighterId(team, unit.id),
        unitId: unit.id,
        name: unit.name,
        code: unit.code,
        color: unit.color,
        team,
        lane,
        hp: unit.maxHp,
        maxHp: unit.maxHp,
        shield: 0,
        power: 0,
      }),
    ),
  );
  return {
    round: 1,
    currentSlot: -1,
    fighters,
    playerProgram: cloneBoard(playerProgram),
    enemyProgram: cloneBoard(enemyProgram),
    trace: [],
    winner: null,
  };
}

const commandMap = (data: GameData) => new Map(data.commands.map((command) => [command.id, command]));

const selectOpponent = (fighters: FighterState[], actor: FighterState) =>
  fighters
    .filter((fighter) => fighter.team === otherTeam(actor.team) && fighter.hp > 0)
    .sort(
      (left, right) => Math.abs(left.lane - actor.lane) - Math.abs(right.lane - actor.lane) || left.lane - right.lane,
    )[0];

const lowestAlly = (fighters: FighterState[], actor: FighterState) =>
  fighters
    .filter((fighter) => fighter.team === actor.team && fighter.hp > 0)
    .sort((left, right) => left.hp / left.maxHp - right.hp / right.maxHp || left.lane - right.lane)[0];

const nextAlly = (fighters: FighterState[], actor: FighterState) => {
  const allies = fighters
    .filter((fighter) => fighter.team === actor.team && fighter.hp > 0 && fighter.instanceId !== actor.instanceId)
    .sort((left, right) => ((left.lane - actor.lane + 3) % 3) - ((right.lane - actor.lane + 3) % 3));
  return allies[0];
};

const traceEvent = (
  state: BattleState,
  actor: FighterState,
  slot: number,
  kind: BattleTraceEvent['kind'],
  commandId: string,
  depth: number,
  extras: Pick<BattleTraceEvent, 'value' | 'targetId'> = {},
): BattleTraceEvent => ({
  id: `${state.round}-${slot}-${actor.instanceId}-${kind}-${state.trace.length}`,
  round: state.round,
  slot,
  team: actor.team,
  lane: actor.lane,
  actorId: actor.instanceId,
  kind,
  commandId,
  depth,
  ...extras,
});

function expandCommand(
  data: GameData,
  state: BattleState,
  actor: FighterState,
  board: ProgramBoard,
  slot: number,
  depth: number,
  commands: Map<string, CommandDefinition>,
  trace: BattleTraceEvent[],
): PlannedCommand | null {
  const commandId = board[actor.lane]?.[slot];
  if (!commandId) return null;
  const command = commands.get(commandId);
  if (!command) return null;
  if (command.effect.kind !== 'repeatPrevious') return { actorId: actor.instanceId, command, depth };

  trace.push(traceEvent(state, actor, slot, 'repeat', command.id, depth));
  if (slot <= 0) return null;
  if (depth >= data.rules.stackLimit) {
    trace.push(traceEvent(state, actor, slot, 'stackOverflow', command.id, depth));
    return null;
  }
  return expandCommand(data, state, actor, board, slot - 1, depth + 1, commands, trace);
}

export function resolveBeat(data: GameData, state: BattleState, slot: number): BattleState {
  if (state.winner) return state;
  const fighters = state.fighters.map((fighter) => ({ ...fighter }));
  const snapshot = state.fighters.map((fighter) => ({ ...fighter }));
  const commands = commandMap(data);
  const trace = [...state.trace];
  const planned: PlannedCommand[] = [];

  for (const actor of snapshot.filter((fighter) => fighter.hp > 0)) {
    const board = actor.team === 'player' ? state.playerProgram : state.enemyProgram;
    const command = expandCommand(data, state, actor, board, slot, 0, commands, trace);
    if (command) planned.push(command);
  }

  const findLive = (id: string) => fighters.find((fighter) => fighter.instanceId === id);
  const findSnapshot = (id: string) => snapshot.find((fighter) => fighter.instanceId === id);

  for (const plan of planned) {
    const actor = findLive(plan.actorId);
    const before = findSnapshot(plan.actorId);
    if (!actor || !before || actor.hp <= 0) continue;
    trace.push(traceEvent(state, before, slot, 'execute', plan.command.id, plan.depth));
    const effect = plan.command.effect;
    if (effect.kind === 'shield') {
      actor.shield += effect.amount;
      trace.push(traceEvent(state, before, slot, 'shield', plan.command.id, plan.depth, { value: effect.amount }));
    } else if (effect.kind === 'charge') {
      actor.power += effect.amount;
      trace.push(traceEvent(state, before, slot, 'charge', plan.command.id, plan.depth, { value: effect.amount }));
    } else if (effect.kind === 'sharePower') {
      const targetBefore = nextAlly(snapshot, before);
      const target = targetBefore ? findLive(targetBefore.instanceId) : undefined;
      const amount = Math.min(effect.amount, before.power);
      if (target && amount > 0) {
        actor.power = Math.max(0, actor.power - amount);
        target.power += amount;
        trace.push(
          traceEvent(state, before, slot, 'share', plan.command.id, plan.depth, {
            value: amount,
            targetId: target.instanceId,
          }),
        );
      }
    } else if (effect.kind === 'healLowest') {
      const targetBefore = lowestAlly(snapshot, before);
      const target = targetBefore ? findLive(targetBefore.instanceId) : undefined;
      if (target) {
        const amount = Math.min(effect.amount, target.maxHp - target.hp);
        target.hp += amount;
        trace.push(
          traceEvent(state, before, slot, 'heal', plan.command.id, plan.depth, {
            value: amount,
            targetId: target.instanceId,
          }),
        );
      }
    }
  }

  const damageByTarget = new Map<string, number>();
  const damageEvents: Array<{
    actor: FighterState;
    target: FighterState;
    command: CommandDefinition;
    depth: number;
    amount: number;
  }> = [];
  for (const plan of planned) {
    const actor = findSnapshot(plan.actorId);
    if (!actor || actor.hp <= 0) continue;
    const effect = plan.command.effect;
    if (effect.kind !== 'damage' && effect.kind !== 'burst') continue;
    const target = selectOpponent(snapshot, actor);
    if (!target) continue;
    const amount = effect.kind === 'damage' ? effect.amount : effect.baseDamage + actor.power * effect.damagePerPower;
    damageByTarget.set(target.instanceId, (damageByTarget.get(target.instanceId) ?? 0) + amount);
    damageEvents.push({ actor, target, command: plan.command, depth: plan.depth, amount });
    if (effect.kind === 'burst') {
      const liveActor = findLive(actor.instanceId);
      if (liveActor) liveActor.power = 0;
    }
  }

  for (const [targetId, amount] of damageByTarget) {
    const target = findLive(targetId);
    if (!target) continue;
    const blocked = Math.min(target.shield, amount);
    target.shield -= blocked;
    target.hp = Math.max(0, target.hp - (amount - blocked));
  }
  for (const event of damageEvents) {
    trace.push(
      traceEvent(state, event.actor, slot, 'damage', event.command.id, event.depth, {
        value: event.amount,
        targetId: event.target.instanceId,
      }),
    );
  }

  return {
    ...state,
    currentSlot: slot,
    fighters,
    trace,
    winner: winnerOf(fighters),
  };
}

export function createPlayback(data: GameData, playerProgram: ProgramBoard, enemyProgram: ProgramBoard): BattleState[] {
  let state = createBattle(data, playerProgram, enemyProgram);
  const frames = [state];
  for (let round = 1; round <= data.rules.maxRounds && !state.winner; round += 1) {
    state = { ...state, round };
    for (let slot = 0; slot < data.rules.programSlots && !state.winner; slot += 1) {
      state = resolveBeat(data, state, slot);
      frames.push(state);
    }
  }
  if (!state.winner) {
    const playerHp = state.fighters
      .filter((fighter) => fighter.team === 'player')
      .reduce((sum, fighter) => sum + fighter.hp, 0);
    const enemyHp = state.fighters
      .filter((fighter) => fighter.team === 'enemy')
      .reduce((sum, fighter) => sum + fighter.hp, 0);
    const winner: Winner = playerHp === enemyHp ? 'draw' : playerHp > enemyHp ? 'player' : 'enemy';
    state = { ...state, winner };
    frames[frames.length - 1] = state;
  }
  return frames;
}

export function runBattle(data: GameData, playerProgram: ProgramBoard, enemyProgram: ProgramBoard): BattleState {
  return createPlayback(data, playerProgram, enemyProgram).at(-1)!;
}
