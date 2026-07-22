import { cloneBoard, rotateBlock } from './circuit';
import type { BlockDefinition, CellPosition, CircuitBoard, PlacedBlock } from './types';

const samePosition = (left: CellPosition, right: CellPosition) =>
  left.row === right.row && left.column === right.column;

export function placeBlockFromRack(
  rack: PlacedBlock[],
  board: CircuitBoard,
  block: PlacedBlock,
  position: CellPosition,
  heartPosition?: CellPosition,
): { board: CircuitBoard; rack: PlacedBlock[] } {
  const rackIndex = rack.findIndex(
    (candidate) =>
      candidate.blockId === block.blockId &&
      candidate.rotation === block.rotation &&
      (candidate.stars ?? 0) === (block.stars ?? 0),
  );
  const current = board[position.row]?.[position.column];
  if (
    rackIndex < 0 ||
    !board[position.row] ||
    position.column < 0 ||
    position.column >= board.length ||
    (heartPosition && samePosition(position, heartPosition))
  ) {
    return { board, rack };
  }

  const nextBoard = cloneBoard(board);
  nextBoard[position.row][position.column] = { ...block };
  const nextRack = rack.filter((_, index) => index !== rackIndex);
  if (current) nextRack.push({ ...current });
  return { board: nextBoard, rack: nextRack };
}

export function moveBlock(
  board: CircuitBoard,
  from: CellPosition,
  to: CellPosition,
  heartPosition?: CellPosition,
): CircuitBoard {
  if (samePosition(from, to)) return board;
  if (heartPosition && (samePosition(from, heartPosition) || samePosition(to, heartPosition))) return board;
  const source = board[from.row]?.[from.column];
  const destination = board[to.row]?.[to.column];
  if (!source || !board[to.row] || to.column < 0 || to.column >= board.length) {
    return board;
  }

  const next = cloneBoard(board);
  next[from.row][from.column] = destination ? { ...destination } : null;
  next[to.row][to.column] = { ...source };
  return next;
}

export function moveHeart(
  board: CircuitBoard,
  heartPosition: CellPosition,
  destination: CellPosition,
): { board: CircuitBoard; heartPosition: CellPosition } {
  if (
    samePosition(heartPosition, destination) ||
    !board[heartPosition.row] ||
    !board[destination.row] ||
    destination.column < 0 ||
    destination.column >= board.length
  ) {
    return { board, heartPosition };
  }
  const next = cloneBoard(board);
  const displaced = next[destination.row][destination.column];
  next[heartPosition.row][heartPosition.column] = displaced ? { ...displaced } : null;
  next[destination.row][destination.column] = null;
  return { board: next, heartPosition: { ...destination } };
}

export function rotateBoardBlock(
  board: CircuitBoard,
  position: CellPosition,
  blocks: Array<Pick<BlockDefinition, 'id' | 'rotatable'>> = [],
): CircuitBoard {
  const current = board[position.row]?.[position.column];
  if (!current) return board;
  if (blocks.find((block) => block.id === current.blockId)?.rotatable === false) return board;
  const next = cloneBoard(board);
  next[position.row][position.column] = rotateBlock(current);
  return next;
}

export function removeBlockToRack(
  rack: PlacedBlock[],
  board: CircuitBoard,
  position: CellPosition,
): { board: CircuitBoard; rack: PlacedBlock[] } {
  const current = board[position.row]?.[position.column];
  if (!current) return { board, rack };
  const next = cloneBoard(board);
  next[position.row][position.column] = null;
  return { board: next, rack: [...rack, { ...current }] };
}
