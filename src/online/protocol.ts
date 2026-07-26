import type { BattleResult, MonsterInstance } from '../core/types';
import type { OnlineBuild, OnlineMatchPhase, OnlineMatchScore, OnlineSeat } from '../core/online-match';

export type RoomView = {
  roomId: string;
  contentVersion: string;
  phase: OnlineMatchPhase;
  cycle: number;
  battleNumber: number;
  suddenDeathRound: number;
  score: OnlineMatchScore;
  submittedSeats: OnlineSeat[];
  continuedSeats: OnlineSeat[];
  connectedSeats: OnlineSeat[];
};

export type ClientMessage =
  | { type: 'submit-build'; cycle: number; build: OnlineBuild }
  | { type: 'continue'; battleNumber: number };

export type ServerMessage =
  | {
      type: 'welcome';
      seat: OnlineSeat;
      seatToken: string;
      runSeed: number;
      room: RoomView;
    }
  | { type: 'room-state'; room: RoomView }
  | {
      type: 'battle-result';
      cycle: number;
      battleNumber: number;
      suddenDeathRound: number;
      result: BattleResult;
      opponent: MonsterInstance[];
    }
  | { type: 'error'; message: string; recoverable: boolean };

export const encodeMessage = (message: ClientMessage | ServerMessage) => JSON.stringify(message);

export const parseClientMessage = (value: string): ClientMessage | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) return undefined;
  if (
    parsed.type === 'submit-build' &&
    'cycle' in parsed &&
    typeof parsed.cycle === 'number' &&
    'build' in parsed &&
    parsed.build &&
    typeof parsed.build === 'object' &&
    'contentVersion' in parsed.build &&
    typeof parsed.build.contentVersion === 'string' &&
    'active' in parsed.build &&
    Array.isArray(parsed.build.active)
  ) {
    return parsed as ClientMessage;
  }
  if (parsed.type === 'continue' && 'battleNumber' in parsed && typeof parsed.battleNumber === 'number') {
    return parsed as ClientMessage;
  }
  return undefined;
};

export const parseServerMessage = (value: string): ServerMessage | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) return undefined;
  if (
    parsed.type === 'welcome' ||
    parsed.type === 'room-state' ||
    parsed.type === 'battle-result' ||
    parsed.type === 'error'
  ) {
    return parsed as ServerMessage;
  }
  return undefined;
};
