import type { BattleTraceEvent, GameData, Team, Winner } from './types';

export function battleReward(data: GameData, winner: Winner): number {
  if (winner === 'player') return data.rules.winReward;
  if (winner === 'enemy' || winner === 'draw') return data.rules.retryReward;
  return 0;
}

export function battleCoinsEarned(trace: BattleTraceEvent[], team: Team): number {
  return trace.reduce((total, event) => total + (event.kind === 'coin' && event.team === team ? event.value : 0), 0);
}
