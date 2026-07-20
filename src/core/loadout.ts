import type { ProgramBoard } from './types';

type SlotPosition = { lane: number; slot: number };

const count = (values: string[], id: string) => values.filter((value) => value === id).length;
const usedCount = (program: ProgramBoard, id: string) => program.flat().filter((value) => value === id).length;

export function availableCopies(inventory: string[], program: ProgramBoard, commandId: string): number {
  return Math.max(0, count(inventory, commandId) - usedCount(program, commandId));
}

export function equipCommand(
  inventory: string[],
  program: ProgramBoard,
  position: { lane: number; slot: number },
  commandId: string,
): ProgramBoard {
  const current = program[position.lane]?.[position.slot];
  if (current === commandId) return program;
  if (availableCopies(inventory, program, commandId) <= 0) return program;
  return program.map((row, lane) =>
    lane === position.lane ? row.map((value, slot) => (slot === position.slot ? commandId : value)) : [...row],
  );
}

export function swapCommands(program: ProgramBoard, from: SlotPosition, to: SlotPosition): ProgramBoard {
  if (from.lane === to.lane && from.slot === to.slot) return program;
  const fromCommand = program[from.lane]?.[from.slot];
  const toCommand = program[to.lane]?.[to.slot];
  if (fromCommand === undefined || toCommand === undefined) return program;

  return program.map((row, lane) =>
    row.map((commandId, slot) => {
      if (lane === from.lane && slot === from.slot) return toCommand;
      if (lane === to.lane && slot === to.slot) return fromCommand;
      return commandId;
    }),
  );
}
