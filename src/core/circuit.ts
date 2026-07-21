import type { BlockDefinition, CellPosition, CircuitBoard, Direction, PlacedBlock, Rotation } from './types';

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

const edgeKey = (left: string, right: string) => [left, right].sort().join('|');

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
  upstreamCells: Map<string, CellPosition[]>;
  downstreamCells: Map<string, CellPosition[]>;
};

const emptyAnalysis = (): CircuitAnalysis => ({
  poweredCells: new Set(),
  routeLength: new Map(),
  cyclicCells: new Set(),
  waveStep: new Map(),
  mergeCells: new Set(),
  branchCells: new Set(),
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

  const definitions = new Map(blocks.map((block) => [block.id, block]));
  const junctions = new Set(
    [...poweredCells].filter((key) => {
      if (key === sourceKey) return true;
      const placed = blockAt(board, positionForKey(key));
      const portCount = placed ? (definitions.get(placed.blockId)?.ports.length ?? 0) : 0;
      return portCount >= 3 || (neighborsByKey.get(key)?.length ?? 0) !== 2;
    }),
  );

  const corridors: string[][] = [];
  const visitedEdges = new Set<string>();
  [...junctions].sort().forEach((junction) => {
    for (const firstNeighbor of neighborsByKey.get(junction) ?? []) {
      if (visitedEdges.has(edgeKey(junction, firstNeighbor))) continue;
      const path = [junction, firstNeighbor];
      visitedEdges.add(edgeKey(junction, firstNeighbor));
      let previous = junction;
      let current = firstNeighbor;
      while (!junctions.has(current)) {
        const next = (neighborsByKey.get(current) ?? []).filter((candidate) => candidate !== previous).sort()[0];
        if (!next || path.length > poweredCells.size) break;
        visitedEdges.add(edgeKey(current, next));
        path.push(next);
        previous = current;
        current = next;
      }
      corridors.push(path);
    }
  });

  const junctionDistance = new Map<string, number>([[sourceKey, 0]]);
  for (let pass = 0; pass < junctions.size; pass += 1) {
    let changed = false;
    corridors.forEach((path) => {
      const start = path[0];
      const end = path.at(-1)!;
      if (start === end) return;
      const length = path.length - 1;
      const startDistance = junctionDistance.get(start);
      const endDistance = junctionDistance.get(end);
      if (startDistance !== undefined && (endDistance === undefined || startDistance + length < endDistance)) {
        junctionDistance.set(end, startDistance + length);
        changed = true;
      }
      if (endDistance !== undefined && (startDistance === undefined || endDistance + length < startDistance)) {
        junctionDistance.set(start, endDistance + length);
        changed = true;
      }
    });
    if (!changed) break;
  }

  const orientedEdges = new Map<string, [string, string]>();
  corridors.forEach((originalPath) => {
    const firstKey = originalPath[0];
    const lastKey = originalPath.at(-1)!;
    if (firstKey === lastKey) return;
    const firstRank = [junctionDistance.get(firstKey) ?? Number.MAX_SAFE_INTEGER, firstKey] as const;
    const lastRank = [junctionDistance.get(lastKey) ?? Number.MAX_SAFE_INTEGER, lastKey] as const;
    const forward = firstRank[0] < lastRank[0] || (firstRank[0] === lastRank[0] && firstRank[1] < lastRank[1]);
    const path = forward ? originalPath : [...originalPath].reverse();
    for (let index = 0; index < path.length - 1; index += 1) {
      orientedEdges.set(edgeKey(path[index], path[index + 1]), [path[index], path[index + 1]]);
    }
  });

  for (const [key, neighbors] of neighborsByKey) {
    neighbors.forEach((neighbor) => {
      const edge = edgeKey(key, neighbor);
      if (orientedEdges.has(edge)) return;
      const keyRank = [routeLength.get(key) ?? Number.MAX_SAFE_INTEGER, key] as const;
      const neighborRank = [routeLength.get(neighbor) ?? Number.MAX_SAFE_INTEGER, neighbor] as const;
      const forward = keyRank[0] < neighborRank[0] || (keyRank[0] === neighborRank[0] && keyRank[1] < neighborRank[1]);
      orientedEdges.set(edge, forward ? [key, neighbor] : [neighbor, key]);
    });
  }

  const upstreamKeys = new Map([...poweredCells].map((key) => [key, [] as string[]]));
  const downstreamKeys = new Map([...poweredCells].map((key) => [key, [] as string[]]));
  orientedEdges.forEach(([from, to]) => {
    downstreamKeys.get(from)?.push(to);
    upstreamKeys.get(to)?.push(from);
  });
  upstreamKeys.forEach((keys) => keys.sort());
  downstreamKeys.forEach((keys) => keys.sort());

  const waveStep = new Map(routeLength);
  for (let pass = 0; pass < poweredCells.size; pass += 1) {
    let changed = false;
    orientedEdges.forEach(([from, to]) => {
      const nextStep = (waveStep.get(from) ?? 1) + 1;
      if (nextStep > (waveStep.get(to) ?? 1)) {
        waveStep.set(to, nextStep);
        changed = true;
      }
    });
    if (!changed) break;
  }

  const upstreamCells = new Map([...upstreamKeys].map(([key, inputs]) => [key, inputs.map(positionForKey)]));
  const downstreamCells = new Map([...downstreamKeys].map(([key, outputs]) => [key, outputs.map(positionForKey)]));
  const mergeCells = new Set([...poweredCells].filter((key) => (upstreamKeys.get(key)?.length ?? 0) >= 2));
  const branchCells = new Set([...poweredCells].filter((key) => (downstreamKeys.get(key)?.length ?? 0) >= 2));

  return {
    poweredCells,
    routeLength,
    cyclicCells,
    waveStep,
    mergeCells,
    branchCells,
    upstreamCells,
    downstreamCells,
  };
}

export function findPoweredCells(board: CircuitBoard, blocks: ConnectionBlock[], sourceRow: number): Set<string> {
  return analyzeCircuit(board, blocks, sourceRow).poweredCells;
}

export function cloneBoard(board: CircuitBoard): CircuitBoard {
  return board.map((row) => row.map((block) => (block ? { ...block } : null)));
}
