import rawGameData from './game.json';
import type { GameData, ProgramBoard } from '../core/types';

export const GAME_DATA = rawGameData as GameData;

const validateBoard = (name: string, board: ProgramBoard, data: GameData, errors: string[]) => {
  const commandIds = new Set(data.commands.map((command) => command.id));
  if (board.length !== data.rules.lanes) errors.push(`${name} must contain ${data.rules.lanes} lanes`);
  board.forEach((row, lane) => {
    if (row.length !== data.rules.programSlots)
      errors.push(`${name}[${lane}] must contain ${data.rules.programSlots} slots`);
    row.forEach((commandId, slot) => {
      if (commandId && !commandIds.has(commandId))
        errors.push(`${name}[${lane}][${slot}] references unknown command "${commandId}"`);
    });
  });
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
    'command',
    data.commands.map((command) => command.id),
  );
  if (data.units.length !== data.rules.lanes) errors.push('units must match lane count');
  if (data.rules.stackLimit < 1) errors.push('stackLimit must be positive');
  validateBoard('playerProgram', data.playerProgram, data, errors);
  validateBoard('enemyProgram', data.enemyProgram, data, errors);
  const commandIds = new Set(data.commands.map((command) => command.id));
  data.startingInventory.forEach((commandId, index) => {
    if (!commandIds.has(commandId))
      errors.push(`startingInventory[${index}] references unknown command "${commandId}"`);
  });
  return errors;
}

const errors = validateGameData(GAME_DATA);
if (errors.length > 0) throw new Error(`Invalid game data:\n${errors.join('\n')}`);
