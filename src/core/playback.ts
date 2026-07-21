import type { GameData } from './types';

export type BattleSpeed = 1 | 2 | 3;

export const BATTLE_SPEEDS: BattleSpeed[] = [1, 2, 3];

export function playbackFrameMs(data: GameData, speed: BattleSpeed): number {
  return data.rules.pulseAnimationMs / speed;
}
