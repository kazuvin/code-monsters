import type { GameData, Winner } from './types';

export function battleReward(data: GameData, winner: Winner): number {
  if (winner === 'player') return data.rules.winReward;
  if (winner === 'enemy' || winner === 'draw') return data.rules.retryReward;
  return 0;
}
