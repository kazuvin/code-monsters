import type {
  BlockDefinition,
  CellPosition,
  CircuitEffectTrigger,
  CircuitBoard,
  Direction,
  MagicSigilRules,
  PlacedBlock,
  Rotation,
  SkillFusionRules,
} from './types';

type ConnectionBlock = Pick<BlockDefinition, 'id' | 'ports' | 'buildIds'>;

const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];
const VECTORS: Record<Direction, CellPosition> = {
  north: { row: -1, column: 0 },
  east: { row: 0, column: 1 },
  south: { row: 1, column: 0 },
  west: { row: 0, column: -1 },
};
const SURROUNDING_VECTORS: CellPosition[] = [
  { row: -1, column: -1 },
  { row: -1, column: 0 },
  { row: -1, column: 1 },
  { row: 0, column: -1 },
  { row: 0, column: 1 },
  { row: 1, column: -1 },
  { row: 1, column: 0 },
  { row: 1, column: 1 },
];
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

export function adjacentPoweredBuildNeighbors(
  board: CircuitBoard,
  blocks: ConnectionBlock[],
  analysis: Pick<CircuitAnalysis, 'poweredCells'>,
  position: CellPosition,
  buildId: string,
): CellPosition[] {
  const current = definitionAt(board, blocks, position);
  const key = cellKey(position);
  if (!current || !analysis.poweredCells.has(key)) return [];
  const countsEveryBuild = (current.placed.stars ?? 0) > 0;
  return SURROUNDING_VECTORS.flatMap((vector) => {
    const neighborPosition = { row: position.row + vector.row, column: position.column + vector.column };
    const neighbor = definitionAt(board, blocks, neighborPosition);
    if (!neighbor || !analysis.poweredCells.has(cellKey(neighborPosition))) return [];
    return countsEveryBuild || neighbor.definition.buildIds?.includes(buildId) ? [neighborPosition] : [];
  }).sort((left, right) => cellKey(left).localeCompare(cellKey(right)));
}

export type CircuitAnalysis = {
  poweredCells: Set<string>;
  heartConnections: Set<string>;
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
  magicSigilLevel: number;
  adjacentBuildCounts: Readonly<Record<string, number>>;
};

export type MagicSigilAnalysis = {
  levels: Map<string, number>;
  sources: Map<string, string[]>;
  targets: Map<string, string[]>;
};

const emptyAnalysis = (): CircuitAnalysis => ({
  poweredCells: new Set(),
  heartConnections: new Set(),
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

const normalizeHeartPosition = (source: CellPosition | number): CellPosition =>
  typeof source === 'number' ? { row: source, column: -1 } : source;

export function analyzeCircuit(
  board: CircuitBoard,
  blocks: ConnectionBlock[],
  source: CellPosition | number,
  heartPorts: Direction[] = DIRECTIONS,
): CircuitAnalysis {
  const heartPosition = normalizeHeartPosition(source);
  const heartConnections = new Set<string>();
  const poweredCells = new Set<string>();
  const routeLength = new Map<string, number>();
  const queue = heartPorts.flatMap((direction) => {
    const vector = VECTORS[direction];
    const position = { row: heartPosition.row + vector.row, column: heartPosition.column + vector.column };
    const neighbor = definitionAt(board, blocks, position);
    if (!neighbor || !rotatePorts(neighbor.definition.ports, neighbor.placed.rotation).includes(OPPOSITE[direction])) {
      return [];
    }
    const key = cellKey(position);
    heartConnections.add(key);
    routeLength.set(key, 1);
    return [position];
  });
  if (queue.length === 0) return emptyAnalysis();
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
        const vector = VECTORS[direction];
        const neighborPosition = { row: position.row + vector.row, column: position.column + vector.column };
        if (
          heartConnections.has(key) &&
          neighborPosition.row === heartPosition.row &&
          neighborPosition.column === heartPosition.column
        ) {
          return true;
        }
        return connected.has(cellKey(neighborPosition));
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
    heartConnections,
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

export function findPoweredCells(
  board: CircuitBoard,
  blocks: ConnectionBlock[],
  source: CellPosition | number,
  heartPorts: Direction[] = DIRECTIONS,
): Set<string> {
  return analyzeCircuit(board, blocks, source, heartPorts).poweredCells;
}

export const rotateCellOffset = (offset: CellPosition, rotation: Rotation): CellPosition => {
  let rotated = { ...offset };
  for (let step = 0; step < rotation; step += 1) {
    rotated = { row: rotated.column, column: -rotated.row };
  }
  return rotated;
};

export function analyzeMagicSigils(
  board: CircuitBoard,
  blocks: BlockDefinition[],
  circuit: CircuitAnalysis,
  fusionRules: SkillFusionRules,
  rules: MagicSigilRules,
): MagicSigilAnalysis {
  const definitions = new Map(blocks.map((block) => [block.id, block]));
  const levels = new Map<string, number>();
  const sources = new Map<string, string[]>();
  const targets = new Map<string, string[]>();

  board.forEach((row, rowIndex) =>
    row.forEach((placed, columnIndex) => {
      if (!placed) return;
      const sourceKey = cellKey({ row: rowIndex, column: columnIndex });
      if (!circuit.poweredCells.has(sourceKey)) return;
      const block = definitions.get(placed.blockId);
      if (!block) return;
      block.effects.forEach((effect) => {
        if (effect.kind !== 'inscribe-magic-sigil') return;
        const amount =
          (placed.stars ?? 0) > 0 ? Math.round(effect.amount * fusionRules.effectMultiplier) : effect.amount;
        effect.offsets.forEach((authoredOffset) => {
          const offset = rotateCellOffset(authoredOffset, placed.rotation);
          const target = { row: rowIndex + offset.row, column: columnIndex + offset.column };
          if (target.row < 0 || target.row >= board.length || target.column < 0 || target.column >= row.length) return;
          const targetKey = cellKey(target);
          levels.set(targetKey, Math.min(rules.maxLevel, (levels.get(targetKey) ?? 0) + amount));
          sources.set(targetKey, [...new Set([...(sources.get(targetKey) ?? []), sourceKey])].sort());
          targets.set(sourceKey, [...new Set([...(targets.get(sourceKey) ?? []), targetKey])].sort());
        });
      });
    }),
  );

  return { levels, sources, targets };
}

export function countActiveMagicSigils(
  board: CircuitBoard,
  circuit: CircuitAnalysis,
  sigils: MagicSigilAnalysis,
): number {
  return [...sigils.levels].filter(([key, level]) => {
    const position = positionForKey(key);
    return level > 0 && circuit.poweredCells.has(key) && Boolean(board[position.row]?.[position.column]);
  }).length;
}

export const matchesCircuitTrigger = (trigger: CircuitEffectTrigger, context: CircuitTriggerContext) => {
  if (trigger.kind === 'path-length-at-least') return context.pathLength >= trigger.amount;
  if (trigger.kind === 'in-cycle') return context.inCycle;
  if (trigger.kind === 'all-ports-connected') return context.allPortsConnected;
  if (trigger.kind === 'magic-sigil-level-at-least') return context.magicSigilLevel >= trigger.amount;
  if (trigger.kind === 'adjacent-build-at-least') {
    return (context.adjacentBuildCounts[trigger.buildId] ?? 0) >= trigger.amount;
  }
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
  magicSigilLevel = 0,
  magicSigilSources: string[] = [],
): CircuitConditionStatus {
  const key = cellKey(position);
  const currentBlock = definitionAt(board, blocks, position);
  const rotatedPorts = currentBlock ? rotatePorts(currentBlock.definition.ports, currentBlock.placed.rotation) : [];
  const connected = connectedNeighbors(board, blocks, position).map(cellKey);
  const connectedPortCount = connected.length + (analysis.heartConnections.has(key) ? 1 : 0);
  const pathLength = analysis.routeLength.get(key) ?? 0;
  const straightLength = analysis.straightLineLength.get(key) ?? 0;
  const adjacentBuildNeighbors =
    trigger.kind === 'adjacent-build-at-least'
      ? adjacentPoweredBuildNeighbors(board, blocks, analysis, position, trigger.buildId)
      : [];
  const context: CircuitTriggerContext = {
    pathLength,
    inCycle: analysis.cyclicCells.has(key),
    allPortsConnected: analysis.fullyConnectedCells.has(key),
    straightLineLength: straightLength,
    magicSigilLevel,
    adjacentBuildCounts:
      trigger.kind === 'adjacent-build-at-least' ? { [trigger.buildId]: adjacentBuildNeighbors.length } : {},
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
  if (trigger.kind === 'magic-sigil-level-at-least') {
    return {
      trigger,
      met,
      current: magicSigilLevel,
      required: trigger.amount,
      contributingCells: [key, ...magicSigilSources].sort(),
    };
  }
  if (trigger.kind === 'adjacent-build-at-least') {
    return {
      trigger,
      met,
      current: adjacentBuildNeighbors.length,
      required: trigger.amount,
      contributingCells: [key, ...adjacentBuildNeighbors.map(cellKey)].sort(),
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
  magicSigils?: MagicSigilAnalysis,
): CircuitConditionStatus[] {
  const uniqueTriggers = new Map<string, CircuitEffectTrigger>();
  block.effects.forEach((effect) => {
    if (effect.kind === 'inscribe-magic-sigil') return;
    const trigger = effect.trigger;
    if (!trigger || trigger.kind === 'enemy-poisoned') return;
    uniqueTriggers.set(JSON.stringify(trigger), trigger);
  });
  const key = cellKey(position);
  return [...uniqueTriggers.values()].map((trigger) =>
    evaluateCircuitCondition(
      board,
      blocks,
      analysis,
      position,
      trigger,
      magicSigils?.levels.get(key) ?? 0,
      magicSigils?.sources.get(key) ?? [],
    ),
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
