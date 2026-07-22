import type {
  BlockDefinition,
  CellPosition,
  CircuitEffectTrigger,
  CircuitBoard,
  Direction,
  PlacedBlock,
  Rotation,
  SkillFusionRules,
} from './types';

type ConnectionBlock = Pick<BlockDefinition, 'id' | 'ports'>;

const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];
const VECTORS: Record<Direction, CellPosition> = {
  north: { row: -1, column: 0 },
  east: { row: 0, column: 1 },
  south: { row: 1, column: 0 },
  west: { row: 0, column: -1 },
};
const OPPOSITE: Record<Direction, Direction> = {
  north: 'south',
  east: 'west',
  south: 'north',
  west: 'east',
};

export const cellKey = ({ row, column }: CellPosition) => `${row}:${column}`;

const positionForKey = (key: string): CellPosition => {
  const [row, column] = key.split(':').map(Number);
  return { row, column };
};

export function rotateDirection(direction: Direction, rotation: Rotation): Direction {
  return DIRECTIONS[(DIRECTIONS.indexOf(direction) + rotation) % DIRECTIONS.length];
}

export function rotatePorts(ports: Direction[], rotation: Rotation): Direction[] {
  return ports.map((port) => rotateDirection(port, rotation));
}

export function rotateBlock(block: PlacedBlock): PlacedBlock {
  return { ...block, rotation: ((block.rotation + 1) % 4) as Rotation };
}

export function blockPorts(block: ConnectionBlock): Direction[] {
  return [...new Set(block.ports)];
}

export function blockAt(board: CircuitBoard, position: CellPosition): PlacedBlock | null {
  return board[position.row]?.[position.column] ?? null;
}

const definitionAt = (board: CircuitBoard, blocks: ConnectionBlock[], position: CellPosition) => {
  const placed = blockAt(board, position);
  if (!placed) return null;
  const definition = blocks.find((block) => block.id === placed.blockId);
  return definition ? { placed, definition } : null;
};

export function connectedNeighbors(
  board: CircuitBoard,
  blocks: ConnectionBlock[],
  position: CellPosition,
): CellPosition[] {
  const current = definitionAt(board, blocks, position);
  if (!current) return [];
  return rotatePorts(current.definition.ports, current.placed.rotation).flatMap((direction) => {
    const vector = VECTORS[direction];
    const neighborPosition = { row: position.row + vector.row, column: position.column + vector.column };
    const neighbor = definitionAt(board, blocks, neighborPosition);
    if (!neighbor) return [];
    return rotatePorts(neighbor.definition.ports, neighbor.placed.rotation).includes(OPPOSITE[direction])
      ? [neighborPosition]
      : [];
  });
}

export type CircuitAnalysis = {
  poweredCells: Set<string>;
  routeLength: Map<string, number>;
  cyclicCells: Set<string>;
  waveStep: Map<string, number>;
  mergeCells: Set<string>;
  branchCells: Set<string>;
  fullyConnectedCells: Set<string>;
  straightLineLength: Map<string, number>;
  straightLineCells: Map<string, string[]>;
  upstreamCells: Map<string, CellPosition[]>;
  downstreamCells: Map<string, CellPosition[]>;
};

export type CircuitConditionStatus = {
  trigger: CircuitEffectTrigger;
  met: boolean;
  current: number;
  required: number;
  contributingCells: string[];
};

export type CircuitTriggerContext = {
  pathLength: number;
  inCycle: boolean;
  allPortsConnected: boolean;
  straightLineLength: number;
};

const emptyAnalysis = (): CircuitAnalysis => ({
  poweredCells: new Set(),
  routeLength: new Map(),
  cyclicCells: new Set(),
  waveStep: new Map(),
  mergeCells: new Set(),
  branchCells: new Set(),
  fullyConnectedCells: new Set(),
  straightLineLength: new Map(),
  straightLineCells: new Map(),
  upstreamCells: new Map(),
  downstreamCells: new Map(),
});

const canReachWithout = (neighborsByKey: Map<string, string[]>, start: string, target: string, blocked: string) => {
  const visited = new Set([blocked]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const neighbor of neighborsByKey.get(current) ?? []) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }
  return false;
};

export function analyzeCircuit(board: CircuitBoard, blocks: ConnectionBlock[], sourceRow: number): CircuitAnalysis {
  const source = { row: sourceRow, column: 0 };
  const sourceKey = cellKey(source);
  const first = definitionAt(board, blocks, source);
  if (!first || !rotatePorts(first.definition.ports, first.placed.rotation).includes('west')) return emptyAnalysis();

  const poweredCells = new Set<string>();
  const routeLength = new Map<string, number>([[sourceKey, 1]]);
  const queue = [source];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = cellKey(current);
    if (poweredCells.has(key)) continue;
    poweredCells.add(key);
    for (const neighbor of connectedNeighbors(board, blocks, current)) {
      const neighborKey = cellKey(neighbor);
      if (!routeLength.has(neighborKey)) routeLength.set(neighborKey, (routeLength.get(key) ?? 0) + 1);
      if (!poweredCells.has(neighborKey)) queue.push(neighbor);
    }
  }

  const neighborsByKey = new Map(
    [...poweredCells].map((key) => [
      key,
      connectedNeighbors(board, blocks, positionForKey(key))
        .map(cellKey)
        .filter((neighbor) => poweredCells.has(neighbor))
        .sort(),
    ]),
  );

  const cyclicCells = new Set<string>();
  for (const key of poweredCells) {
    const neighbors = neighborsByKey.get(key) ?? [];
    if (
      neighbors.some((left, index) =>
        neighbors.slice(index + 1).some((right) => canReachWithout(neighborsByKey, left, right, key)),
      )
    ) {
      cyclicCells.add(key);
    }
  }

  const upstreamKeys = new Map([...poweredCells].map((key) => [key, [] as string[]]));
  const downstreamKeys = new Map([...poweredCells].map((key) => [key, [] as string[]]));
  neighborsByKey.forEach((neighbors, key) => {
    const step = routeLength.get(key) ?? 1;
    neighbors.forEach((neighbor) => {
      if ((routeLength.get(neighbor) ?? 1) !== step + 1) return;
      downstreamKeys.get(key)?.push(neighbor);
      upstreamKeys.get(neighbor)?.push(key);
    });
  });
  upstreamKeys.forEach((keys) => keys.sort());
  downstreamKeys.forEach((keys) => keys.sort());

  const waveStep = new Map(routeLength);
  const upstreamCells = new Map([...upstreamKeys].map(([key, inputs]) => [key, inputs.map(positionForKey)]));
  const downstreamCells = new Map([...downstreamKeys].map(([key, outputs]) => [key, outputs.map(positionForKey)]));
  const mergeCells = new Set([...poweredCells].filter((key) => (upstreamKeys.get(key)?.length ?? 0) >= 2));
  const branchCells = new Set([...poweredCells].filter((key) => (downstreamKeys.get(key)?.length ?? 0) >= 2));
  const fullyConnectedCells = new Set(
    [...poweredCells].filter((key) => {
      const position = positionForKey(key);
      const current = definitionAt(board, blocks, position);
      if (!current) return false;
      const connected = new Set(neighborsByKey.get(key) ?? []);
      return rotatePorts(current.definition.ports, current.placed.rotation).every((direction) => {
        if (position.row === sourceRow && position.column === 0 && direction === 'west') return true;
        const vector = VECTORS[direction];
        return connected.has(cellKey({ row: position.row + vector.row, column: position.column + vector.column }));
      });
    }),
  );
  const straightLineLength = new Map<string, number>();
  const straightLineCells = new Map<string, string[]>();
  const segmentCells = (key: string, direction: Direction) => {
    const cells: string[] = [];
    let position = positionForKey(key);
    while (true) {
      const vector = VECTORS[direction];
      const next = { row: position.row + vector.row, column: position.column + vector.column };
      const nextKey = cellKey(next);
      if (!(neighborsByKey.get(cellKey(position)) ?? []).includes(nextKey)) return cells;
      cells.push(nextKey);
      position = next;
    }
  };
  poweredCells.forEach((key) => {
    const horizontal = [...segmentCells(key, 'west').reverse(), key, ...segmentCells(key, 'east')];
    const vertical = [...segmentCells(key, 'north').reverse(), key, ...segmentCells(key, 'south')];
    const longest = horizontal.length >= vertical.length ? horizontal : vertical;
    straightLineLength.set(key, longest.length);
    straightLineCells.set(key, longest);
  });

  return {
    poweredCells,
    routeLength,
    cyclicCells,
    waveStep,
    mergeCells,
    branchCells,
    fullyConnectedCells,
    straightLineLength,
    straightLineCells,
    upstreamCells,
    downstreamCells,
  };
}

export function findPoweredCells(board: CircuitBoard, blocks: ConnectionBlock[], sourceRow: number): Set<string> {
  return analyzeCircuit(board, blocks, sourceRow).poweredCells;
}

export const matchesCircuitTrigger = (trigger: CircuitEffectTrigger, context: CircuitTriggerContext) => {
  if (trigger.kind === 'path-length-at-least') return context.pathLength >= trigger.amount;
  if (trigger.kind === 'in-cycle') return context.inCycle;
  if (trigger.kind === 'all-ports-connected') return context.allPortsConnected;
  return context.straightLineLength >= trigger.amount;
};

const pathCellsFor = (key: string, analysis: CircuitAnalysis) => {
  const path = [key];
  let current = key;
  while ((analysis.routeLength.get(current) ?? 0) > 1) {
    const upstream = (analysis.upstreamCells.get(current) ?? [])
      .map(cellKey)
      .sort(
        (left, right) =>
          (analysis.routeLength.get(right) ?? 0) - (analysis.routeLength.get(left) ?? 0) || left.localeCompare(right),
      )[0];
    if (!upstream) break;
    path.unshift(upstream);
    current = upstream;
  }
  return path;
};

export function evaluateCircuitCondition(
  board: CircuitBoard,
  blocks: ConnectionBlock[],
  analysis: CircuitAnalysis,
  position: CellPosition,
  trigger: CircuitEffectTrigger,
): CircuitConditionStatus {
  const key = cellKey(position);
  const currentBlock = definitionAt(board, blocks, position);
  const rotatedPorts = currentBlock ? rotatePorts(currentBlock.definition.ports, currentBlock.placed.rotation) : [];
  const connected = connectedNeighbors(board, blocks, position).map(cellKey);
  const connectedPortCount =
    connected.length +
    ((analysis.routeLength.get(key) ?? 0) === 1 && position.column === 0 && rotatedPorts.includes('west') ? 1 : 0);
  const pathLength = analysis.routeLength.get(key) ?? 0;
  const straightLength = analysis.straightLineLength.get(key) ?? 0;
  const context: CircuitTriggerContext = {
    pathLength,
    inCycle: analysis.cyclicCells.has(key),
    allPortsConnected: analysis.fullyConnectedCells.has(key),
    straightLineLength: straightLength,
  };
  const met = matchesCircuitTrigger(trigger, context);

  if (trigger.kind === 'path-length-at-least') {
    return {
      trigger,
      met,
      current: pathLength,
      required: trigger.amount,
      contributingCells: pathCellsFor(key, analysis),
    };
  }
  if (trigger.kind === 'in-cycle') {
    return {
      trigger,
      met,
      current: met ? 1 : 0,
      required: 1,
      contributingCells: met ? [...analysis.cyclicCells].sort() : [key],
    };
  }
  if (trigger.kind === 'all-ports-connected') {
    return {
      trigger,
      met,
      current: Math.min(connectedPortCount, rotatedPorts.length),
      required: rotatedPorts.length,
      contributingCells: [key, ...connected].sort(),
    };
  }
  return {
    trigger,
    met,
    current: straightLength,
    required: trigger.amount,
    contributingCells: analysis.straightLineCells.get(key) ?? [key],
  };
}

export function circuitConditionsForBlock(
  board: CircuitBoard,
  blocks: ConnectionBlock[],
  analysis: CircuitAnalysis,
  position: CellPosition,
  block: Pick<BlockDefinition, 'effects'>,
): CircuitConditionStatus[] {
  const uniqueTriggers = new Map<string, CircuitEffectTrigger>();
  block.effects.forEach((effect) => {
    const trigger = effect.trigger;
    if (!trigger || trigger.kind === 'enemy-poisoned') return;
    uniqueTriggers.set(JSON.stringify(trigger), trigger);
  });
  return [...uniqueTriggers.values()].map((trigger) =>
    evaluateCircuitCondition(board, blocks, analysis, position, trigger),
  );
}

export function calculateChargeByCell(
  board: CircuitBoard,
  blocks: BlockDefinition[],
  analysis: CircuitAnalysis,
  fusionRules?: SkillFusionRules,
): Map<string, number> {
  const definitions = new Map(blocks.map((block) => [block.id, block]));
  const incomingCharge = new Map<string, number>();
  const outgoingCharge = new Map<string, number>();
  const orderedCells = [...analysis.poweredCells].sort(
    (left, right) =>
      (analysis.waveStep.get(left) ?? 0) - (analysis.waveStep.get(right) ?? 0) || left.localeCompare(right),
  );

  orderedCells.forEach((key) => {
    const position = positionForKey(key);
    const upstreamCharges = (analysis.upstreamCells.get(key) ?? []).map(
      (upstream) => outgoingCharge.get(cellKey(upstream)) ?? 0,
    );
    const incoming = upstreamCharges.length > 0 ? Math.max(...upstreamCharges) : 0;
    const placed = blockAt(board, position);
    const block = placed ? definitions.get(placed.blockId) : undefined;
    const nodeBonus =
      block?.effects.reduce(
        (total, effect) =>
          total +
          (effect.kind === 'charge' &&
          (!effect.trigger || evaluateCircuitCondition(board, blocks, analysis, position, effect.trigger).met)
            ? (placed?.stars ?? 0) > 0 && fusionRules
              ? Math.round(effect.amount * fusionRules.effectMultiplier)
              : effect.amount
            : 0),
        0,
      ) ?? 0;

    incomingCharge.set(key, incoming);
    outgoingCharge.set(key, incoming + nodeBonus);
  });

  return incomingCharge;
}

export function cloneBoard(board: CircuitBoard): CircuitBoard {
  return board.map((row) => row.map((block) => (block ? { ...block } : null)));
}
