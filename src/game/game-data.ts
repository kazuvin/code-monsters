import rawGameData from './game.json';
import { rotatePorts } from '../core/circuit';
import type { CircuitBoard, GameData } from '../core/types';

export const GAME_DATA = rawGameData as GameData;

const validateBoard = (name: string, board: CircuitBoard, data: GameData, errors: string[]) => {
  const blockIds = new Set(data.blocks.map((block) => block.id));
  if (board.length !== data.rules.boardSize) errors.push(`${name} must contain ${data.rules.boardSize} rows`);
  board.forEach((row, rowIndex) => {
    if (row.length !== data.rules.boardSize)
      errors.push(`${name}[${rowIndex}] must contain ${data.rules.boardSize} cells`);
    row.forEach((placed, columnIndex) => {
      if (placed && !blockIds.has(placed.blockId)) {
        errors.push(`${name}[${rowIndex}][${columnIndex}] references unknown block "${placed.blockId}"`);
      }
      if (placed && ![0, 1, 2, 3].includes(placed.rotation)) {
        errors.push(`${name}[${rowIndex}][${columnIndex}] has an invalid rotation`);
      }
    });
  });

  const source = board[data.rules.sourceRow]?.[0];
  const sourceDefinition = source ? data.blocks.find((block) => block.id === source.blockId) : undefined;
  if (!source?.fixed || !sourceDefinition || !rotatePorts(sourceDefinition.ports, source.rotation).includes('west')) {
    errors.push(`${name} must connect a fixed block to the source`);
  }
};

export function validateGameData(data: GameData): string[] {
  const errors: string[] = [];
  const unique = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${label} id "${id}" is duplicated`);
      seen.add(id);
    }
  };
  unique(
    'unit',
    data.units.map((unit) => unit.id),
  );
  unique(
    'block',
    data.blocks.map((block) => block.id),
  );

  const unitIds = new Set(data.units.map((unit) => unit.id));
  if (!unitIds.has(data.playerUnitId)) errors.push(`playerUnitId references unknown unit "${data.playerUnitId}"`);
  if (!unitIds.has(data.enemyUnitId)) errors.push(`enemyUnitId references unknown unit "${data.enemyUnitId}"`);
  if (data.rules.boardSize < 2) errors.push('boardSize must be at least 2');
  if (data.rules.sourceRow < 0 || data.rules.sourceRow >= data.rules.boardSize)
    errors.push('sourceRow is outside the board');

  validateBoard('playerBoard', data.playerBoard, data, errors);
  validateBoard('enemyBoard', data.enemyBoard, data, errors);
  const blockIds = new Set(data.blocks.map((block) => block.id));
  data.startingRack.forEach((blockId, index) => {
    if (!blockIds.has(blockId)) errors.push(`startingRack[${index}] references unknown block "${blockId}"`);
  });
  data.blocks.forEach((block) => {
    if (block.ports.length === 0) errors.push(`block "${block.id}" must have a port`);
    if (
      (block.effect.kind === 'damage' || block.effect.kind === 'shield' || block.effect.kind === 'repair') &&
      !block.cooldown
    ) {
      errors.push(`active block "${block.id}" must have a cooldown`);
    }
  });
  return errors;
}

const errors = validateGameData(GAME_DATA);
if (errors.length > 0) throw new Error(`Invalid game data:\n${errors.join('\n')}`);
