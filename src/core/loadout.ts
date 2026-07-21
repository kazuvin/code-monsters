import { cloneBoard, rotateBlock } from './circuit';
import type { CellPosition, CircuitBoard } from './types';

const samePosition = (left: CellPosition, right: CellPosition) =>
  left.row === right.row && left.column === right.column;

export function placeBlockFromRack(
  rack: string[],
  board: CircuitBoard,
  blockId: string,
  position: CellPosition,
): { board: CircuitBoard; rack: string[] } {
  const rackIndex = rack.indexOf(blockId);
  const current = board[position.row]?.[position.column];
  if (rackIndex < 0 || !board[position.row] || position.column < 0 || position.column >= board.length) {
    return { board, rack };
  }

  const nextBoard = cloneBoard(board);
  nextBoard[position.row][position.column] = { blockId, rotation: 0 };
  const nextRack = rack.filter((_, index) => index !== rackIndex);
  if (current) nextRack.push(current.blockId);
  return { board: nextBoard, rack: nextRack };
}

export function moveBlock(board: CircuitBoard, from: CellPosition, to: CellPosition): CircuitBoard {
  if (samePosition(from, to)) return board;
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

export function rotateBoardBlock(board: CircuitBoard, position: CellPosition): CircuitBoard {
  const current = board[position.row]?.[position.column];
  if (!current) return board;
  const next = cloneBoard(board);
  next[position.row][position.column] = rotateBlock(current);
  return next;
}

export function removeBlockToRack(
  rack: string[],
  board: CircuitBoard,
  position: CellPosition,
): { board: CircuitBoard; rack: string[] } {
  const current = board[position.row]?.[position.column];
  if (!current) return { board, rack };
  const next = cloneBoard(board);
  next[position.row][position.column] = null;
  return { board: next, rack: [...rack, current.blockId] };
}
