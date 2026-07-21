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

export function rotateDirection(direction: Direction, rotation: Rotation): Direction {
  return DIRECTIONS[(DIRECTIONS.indexOf(direction) + rotation) % DIRECTIONS.length];
}

export function rotatePorts(ports: Direction[], rotation: Rotation): Direction[] {
  return ports.map((port) => rotateDirection(port, rotation));
}

export function rotateBlock(block: PlacedBlock): PlacedBlock {
  return { ...block, rotation: ((block.rotation + 1) % 4) as Rotation };
}

export function blockAt(board: CircuitBoard, position: CellPosition): PlacedBlock | null {
  return board[position.row]?.[position.column] ?? null;
}

export function connectedNeighbors(
  board: CircuitBoard,
  blocks: ConnectionBlock[],
  position: CellPosition,
): CellPosition[] {
  const placed = blockAt(board, position);
  if (!placed) return [];
  const definition = blocks.find((block) => block.id === placed.blockId);
  if (!definition) return [];
  const ports = rotatePorts(definition.ports, placed.rotation);

  return ports.flatMap((direction) => {
    const vector = VECTORS[direction];
    const neighborPosition = { row: position.row + vector.row, column: position.column + vector.column };
    const neighbor = blockAt(board, neighborPosition);
    if (!neighbor) return [];
    const neighborDefinition = blocks.find((block) => block.id === neighbor.blockId);
    if (!neighborDefinition) return [];
    const neighborPorts = rotatePorts(neighborDefinition.ports, neighbor.rotation);
    return neighborPorts.includes(OPPOSITE[direction]) ? [neighborPosition] : [];
  });
}

export function findPoweredCells(board: CircuitBoard, blocks: ConnectionBlock[], sourceRow: number): Set<string> {
  const source = { row: sourceRow, column: 0 };
  const first = blockAt(board, source);
  if (!first) return new Set();
  const firstDefinition = blocks.find((block) => block.id === first.blockId);
  if (!firstDefinition || !rotatePorts(firstDefinition.ports, first.rotation).includes('west')) return new Set();

  const powered = new Set<string>();
  const queue = [source];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = cellKey(current);
    if (powered.has(key)) continue;
    powered.add(key);
    for (const neighbor of connectedNeighbors(board, blocks, current)) {
      if (!powered.has(cellKey(neighbor))) queue.push(neighbor);
    }
  }
  return powered;
}

export function cloneBoard(board: CircuitBoard): CircuitBoard {
  return board.map((row) => row.map((block) => (block ? { ...block } : null)));
}
