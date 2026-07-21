import { cellKey, cloneBoard, connectedNeighbors, findPoweredCells } from './circuit';
import type {
  ActiveEffect,
  BattleState,
  BattleTraceEvent,
  BlockDefinition,
  CellPosition,
  CircuitBoard,
  FighterState,
  GameData,
  Team,
  Winner,
} from './types';

type PlannedAction = {
  team: Team;
  block: BlockDefinition;
  position: CellPosition;
  effect: ActiveEffect;
  amount: number;
};

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

const timedWinner = (fighters: FighterState[]): Winner => {
  const player = fighters.find((fighter) => fighter.team === 'player');
  const enemy = fighters.find((fighter) => fighter.team === 'enemy');
  if (!player || !enemy || player.hp === enemy.hp) return 'draw';
  return player.hp > enemy.hp ? 'player' : 'enemy';
};

const fighterFor = (data: GameData, team: Team): FighterState => {
  const unitId = team === 'player' ? data.playerUnitId : data.enemyUnitId;
  const unit = data.units.find((candidate) => candidate.id === unitId);
  if (!unit) throw new Error(`Missing ${team} unit "${unitId}"`);
  return {
    instanceId: `${team}-${unit.id}`,
    unitId: unit.id,
    name: unit.name,
    code: unit.code,
    color: unit.color,
    team,
    hp: unit.maxHp,
    maxHp: unit.maxHp,
    shield: 0,
  };
};

export function createBattle(data: GameData, playerBoard: CircuitBoard, enemyBoard: CircuitBoard): BattleState {
  return {
    tick: 0,
    fighters: [fighterFor(data, 'player'), fighterFor(data, 'enemy')],
    playerBoard: cloneBoard(playerBoard),
    enemyBoard: cloneBoard(enemyBoard),
    playerPowered: [...findPoweredCells(playerBoard, data.blocks, data.rules.sourceRow)],
    enemyPowered: [...findPoweredCells(enemyBoard, data.blocks, data.rules.sourceRow)],
    trace: [],
    winner: null,
  };
}

const activeEffect = (block: BlockDefinition): ActiveEffect | null => {
  if (block.effect.kind === 'damage' || block.effect.kind === 'shield' || block.effect.kind === 'repair') {
    return block.effect;
  }
  return null;
};

function plannedActions(
  data: GameData,
  board: CircuitBoard,
  powered: Set<string>,
  team: Team,
  tick: number,
): PlannedAction[] {
  const definitions = new Map(data.blocks.map((block) => [block.id, block]));
  const plans: PlannedAction[] = [];

  board.forEach((row, rowIndex) =>
    row.forEach((placed, columnIndex) => {
      const position = { row: rowIndex, column: columnIndex };
      if (!placed || !powered.has(cellKey(position))) return;
      const block = definitions.get(placed.blockId);
      if (!block) return;
      const effect = activeEffect(block);
      if (!effect) return;

      const modifiers = connectedNeighbors(board, data.blocks, position)
        .filter((neighbor) => powered.has(cellKey(neighbor)))
        .map((neighbor) => board[neighbor.row][neighbor.column])
        .map((neighbor) => (neighbor ? definitions.get(neighbor.blockId) : undefined))
        .filter((neighbor): neighbor is BlockDefinition => Boolean(neighbor));
      const haste = modifiers.reduce(
        (sum, modifier) => sum + (modifier.effect.kind === 'haste' ? modifier.effect.amount : 0),
        0,
      );
      const boost = modifiers.reduce(
        (sum, modifier) => sum + (modifier.effect.kind === 'amplify' ? modifier.effect.amount : 0),
        0,
      );
      const cooldown = Math.max(1, (block.cooldown ?? 1) - haste);
      if ((tick - 1) % cooldown !== 0) return;
      plans.push({ team, block, position, effect, amount: effect.amount + boost });
    }),
  );
  return plans;
}

const traceEvent = (state: BattleState, action: PlannedAction, targetId: string): BattleTraceEvent => ({
  id: `${state.tick + 1}-${action.team}-${action.position.row}-${action.position.column}-${state.trace.length}`,
  tick: state.tick + 1,
  team: action.team,
  kind: action.effect.kind,
  blockId: action.block.id,
  row: action.position.row,
  column: action.position.column,
  value: action.amount,
  targetId,
});

export function resolveTick(data: GameData, state: BattleState, tick: number): BattleState {
  if (state.winner) return state;
  const fighters = state.fighters.map((fighter) => ({ ...fighter }));
  const poweredByTeam = {
    player: new Set(state.playerPowered),
    enemy: new Set(state.enemyPowered),
  };
  const plans = [
    ...plannedActions(data, state.playerBoard, poweredByTeam.player, 'player', tick),
    ...plannedActions(data, state.enemyBoard, poweredByTeam.enemy, 'enemy', tick),
  ];
  const trace = [...state.trace];
  const fighter = (team: Team) => fighters.find((candidate) => candidate.team === team)!;

  for (const plan of plans.filter((action) => action.effect.kind !== 'damage')) {
    const actor = fighter(plan.team);
    let appliedAmount = plan.amount;
    if (plan.effect.kind === 'shield') actor.shield += plan.amount;
    if (plan.effect.kind === 'repair') {
      const previousHp = actor.hp;
      actor.hp = Math.min(actor.maxHp, actor.hp + plan.amount);
      appliedAmount = actor.hp - previousHp;
    }
    trace.push(traceEvent({ ...state, tick: tick - 1 }, { ...plan, amount: appliedAmount }, actor.instanceId));
  }

  const damage = new Map<Team, number>();
  for (const plan of plans.filter((action) => action.effect.kind === 'damage')) {
    const targetTeam = otherTeam(plan.team);
    damage.set(targetTeam, (damage.get(targetTeam) ?? 0) + plan.amount);
    trace.push(traceEvent({ ...state, tick: tick - 1 }, plan, fighter(targetTeam).instanceId));
  }
  for (const [team, amount] of damage) {
    const target = fighter(team);
    const blocked = Math.min(target.shield, amount);
    target.shield -= blocked;
    target.hp = Math.max(0, target.hp - (amount - blocked));
  }

  return { ...state, tick, fighters, trace, winner: winnerOf(fighters) };
}

export function createPlayback(data: GameData, playerBoard: CircuitBoard, enemyBoard: CircuitBoard): BattleState[] {
  let state = createBattle(data, playerBoard, enemyBoard);
  const frames = [state];
  for (let tick = 1; tick <= data.rules.battleTicks && !state.winner; tick += 1) {
    state = resolveTick(data, state, tick);
    frames.push(state);
  }
  if (!state.winner) {
    state = { ...state, winner: timedWinner(state.fighters) };
    frames[frames.length - 1] = state;
  }
  return frames;
}

export function runBattle(data: GameData, playerBoard: CircuitBoard, enemyBoard: CircuitBoard): BattleState {
  return createPlayback(data, playerBoard, enemyBoard).at(-1)!;
}
