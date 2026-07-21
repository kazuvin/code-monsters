import type { BlockDefinition, CellPosition, CircuitBoard, Direction, PlacedBlock, Rotation } from './types';

type ConnectionBlock = Pick<BlockDefinition, 'id' | 'inputPorts' | 'outputPorts'>;

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
  return [...new Set([...block.inputPorts, ...block.outputPorts])];
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

const connectedInDirections = (
  board: CircuitBoard,
  blocks: ConnectionBlock[],
  position: CellPosition,
  directions: Direction[],
  neighborDirections: (block: ConnectionBlock, rotation: Rotation) => Direction[],
): CellPosition[] => {
  return directions.flatMap((direction) => {
    const vector = VECTORS[direction];
    const neighborPosition = { row: position.row + vector.row, column: position.column + vector.column };
    const neighbor = definitionAt(board, blocks, neighborPosition);
    if (!neighbor) return [];
    return neighborDirections(neighbor.definition, neighbor.placed.rotation).includes(OPPOSITE[direction])
      ? [neighborPosition]
      : [];
  });
};

export function connectedOutputs(
  board: CircuitBoard,
  blocks: ConnectionBlock[],
  position: CellPosition,
): CellPosition[] {
  const current = definitionAt(board, blocks, position);
  if (!current) return [];
  return connectedInDirections(
    board,
    blocks,
    position,
    rotatePorts(current.definition.outputPorts, current.placed.rotation),
    (block, rotation) => rotatePorts(block.inputPorts, rotation),
  );
}

export function connectedInputs(
  board: CircuitBoard,
  blocks: ConnectionBlock[],
  position: CellPosition,
): CellPosition[] {
  const current = definitionAt(board, blocks, position);
  if (!current) return [];
  return connectedInDirections(
    board,
    blocks,
    position,
    rotatePorts(current.definition.inputPorts, current.placed.rotation),
    (block, rotation) => rotatePorts(block.outputPorts, rotation),
  );
}

export function connectedNeighbors(
  board: CircuitBoard,
  blocks: ConnectionBlock[],
  position: CellPosition,
): CellPosition[] {
  const neighbors = [...connectedInputs(board, blocks, position), ...connectedOutputs(board, blocks, position)];
  return [...new Map(neighbors.map((neighbor) => [cellKey(neighbor), neighbor])).values()];
}

export type CircuitAnalysis = {
  poweredCells: Set<string>;
  routeLength: Map<string, number>;
  cyclicCells: Set<string>;
};

export function analyzeCircuit(board: CircuitBoard, blocks: ConnectionBlock[], sourceRow: number): CircuitAnalysis {
  const source = { row: sourceRow, column: 0 };
  const first = definitionAt(board, blocks, source);
  if (!first || !rotatePorts(first.definition.inputPorts, first.placed.rotation).includes('west')) {
    return { poweredCells: new Set(), routeLength: new Map(), cyclicCells: new Set() };
  }

  const poweredCells = new Set<string>();
  const routeLength = new Map<string, number>([[cellKey(source), 1]]);
  const queue = [source];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = cellKey(current);
    if (poweredCells.has(key)) continue;
    poweredCells.add(key);
    for (const neighbor of connectedOutputs(board, blocks, current)) {
      const neighborKey = cellKey(neighbor);
      if (!routeLength.has(neighborKey)) routeLength.set(neighborKey, (routeLength.get(key) ?? 0) + 1);
      if (!poweredCells.has(neighborKey)) queue.push(neighbor);
    }
  }

  const cyclicCells = new Set<string>();
  for (const key of poweredCells) {
    const [row, column] = key.split(':').map(Number);
    const visited = new Set<string>();
    const search = [...connectedOutputs(board, blocks, { row, column })];
    while (search.length > 0) {
      const current = search.shift()!;
      const currentKey = cellKey(current);
      if (currentKey === key) {
        cyclicCells.add(key);
        break;
      }
      if (visited.has(currentKey) || !poweredCells.has(currentKey)) continue;
      visited.add(currentKey);
      search.push(...connectedOutputs(board, blocks, current));
    }
  }

  return { poweredCells, routeLength, cyclicCells };
}

export function findPoweredCells(board: CircuitBoard, blocks: ConnectionBlock[], sourceRow: number): Set<string> {
  return analyzeCircuit(board, blocks, sourceRow).poweredCells;
}

export function cloneBoard(board: CircuitBoard): CircuitBoard {
  return board.map((row) => row.map((block) => (block ? { ...block } : null)));
}
