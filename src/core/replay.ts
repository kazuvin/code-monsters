import type { EncounterDefinition } from '../data.ts';
import type { BattleZoneInstance, Fighter, UnitInventoryItem } from '../types.ts';
import type { BattleDamagePayload, BattleStep, DecisionReason, DecisionTrace } from './battle-engine.ts';

export type ReplayFrame = {
  elapsed: number;
  fighters: Fighter[];
  zones: BattleZoneInstance[];
  queuedSteps: BattleStep[];
  decisions: DecisionTrace[];
};

export type BattleReplay = {
  schemaVersion: number;
  round: number;
  encounter: EncounterDefinition;
  team: UnitInventoryItem[];
  initialFighters: Fighter[];
  initialZones: BattleZoneInstance[];
  frames: ReplayFrame[];
  result?: {
    winner: '勝利' | '敗北';
    elapsed: number;
    finalFighters: Fighter[];
    finalZones: BattleZoneInstance[];
  };
};

export type BattleReportRow = {
  actorId: string;
  actorName: string;
  actionId: string;
  executed: number;
  totalDamage: number;
  skipped: Record<DecisionReason, number>;
};

export function summarizeDecisions(
  decisions: DecisionTrace[],
  damageEvents: BattleDamagePayload[] = [],
): BattleReportRow[] {
  const rows = new Map<string, BattleReportRow>();
  const getRow = (actorId: string, actorName: string, actionId: string) => {
    const key = `${actorId}:${actionId}`;
    const row = rows.get(key) ?? {
      actorId,
      actorName,
      actionId,
      executed: 0,
      totalDamage: 0,
      skipped: { condition: 0, range: 0, cost: 0, state: 0 },
    };
    rows.set(key, row);
    return row;
  };
  for (const decision of decisions.filter((entry) => entry.team === 'ally')) {
    const row = getRow(decision.actorId, decision.actorName, decision.actionId);
    if (decision.outcome === 'executed') row.executed += 1;
    else if (decision.reason) row.skipped[decision.reason] += 1;
  }
  for (const event of damageEvents.filter((entry) => entry.team === 'ally')) {
    const row = getRow(event.actorId, event.actorName, event.actionId);
    row.totalDamage += event.amount;
    if (event.source === 'reaction' || event.source === 'status') row.executed += 1;
  }
  return [...rows.values()].sort((a, b) => a.actorName.localeCompare(b.actorName) || b.executed - a.executed);
}
