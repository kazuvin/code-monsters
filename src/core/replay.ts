import type { EncounterDefinition } from '../data.ts';
import type { Fighter, UnitInventoryItem } from '../types.ts';
import type { BattleStep, DecisionReason, DecisionTrace } from './battle-engine.ts';

export type ReplayFrame = {
  elapsed: number;
  fighters: Fighter[];
  queuedSteps: BattleStep[];
  decisions: DecisionTrace[];
};

export type BattleReplay = {
  schemaVersion: number;
  round: number;
  encounter: EncounterDefinition;
  team: UnitInventoryItem[];
  initialFighters: Fighter[];
  frames: ReplayFrame[];
  result?: {
    winner: '勝利' | '敗北';
    elapsed: number;
    finalFighters: Fighter[];
  };
};

export type BattleReportRow = {
  actorId: string;
  actorName: string;
  actionId: string;
  executed: number;
  skipped: Record<DecisionReason, number>;
};

export function summarizeDecisions(decisions: DecisionTrace[]): BattleReportRow[] {
  const rows = new Map<string, BattleReportRow>();
  for (const decision of decisions.filter((entry) => entry.team === 'ally')) {
    const key = `${decision.actorId}:${decision.actionId}`;
    const row = rows.get(key) ?? {
      actorId: decision.actorId,
      actorName: decision.actorName,
      actionId: decision.actionId,
      executed: 0,
      skipped: { condition: 0, range: 0, cost: 0, state: 0 },
    };
    if (decision.outcome === 'executed') row.executed += 1;
    else if (decision.reason) row.skipped[decision.reason] += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.actorName.localeCompare(b.actorName) || b.executed - a.executed);
}
