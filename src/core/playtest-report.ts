import type { CasualRunState, GameData, MonsterInstance, RunCommand } from './types';

export type PlaytestReportTiming = {
  startedAt: string;
  completedAt: string;
};

export type PlaytestActivity = {
  drafted: number;
  shopRerolls: number;
  shopFreezes: number;
  monstersBought: number;
  equipmentBought: number;
  monstersSold: number;
  formationChanges: number;
  equipmentChanges: number;
  gambitChanges: number;
  breeds: number;
  eventsChosen: number;
  eventsSkipped: number;
  battles: number;
  battleWins: number;
  battleLosses: number;
  battleDraws: number;
};

export type PlaytestMonsterSnapshot = MonsterInstance & {
  active: boolean;
  partyIndex: number;
};

export type PlaytestReport = {
  schemaVersion: 1;
  contentVersion: string;
  runSchemaVersion: CasualRunState['schemaVersion'];
  commandLogVersion: CasualRunState['commandLogVersion'];
  generatedAt: string;
  run: {
    mode: CasualRunState['mode'];
    seed: number;
    outcome: 'completed' | 'defeated' | 'in-progress';
    startedAt: string;
    completedAt: string;
    durationSeconds: number;
    completedCycles: number;
    wins: number;
    losses: number;
    finalCoins: number;
    commandCount: number;
  };
  activity: PlaytestActivity;
  finalRoster: PlaytestMonsterSnapshot[];
  commandLog: RunCommand[];
};

const initialActivity = (): PlaytestActivity => ({
  drafted: 0,
  shopRerolls: 0,
  shopFreezes: 0,
  monstersBought: 0,
  equipmentBought: 0,
  monstersSold: 0,
  formationChanges: 0,
  equipmentChanges: 0,
  gambitChanges: 0,
  breeds: 0,
  eventsChosen: 0,
  eventsSkipped: 0,
  battles: 0,
  battleWins: 0,
  battleLosses: 0,
  battleDraws: 0,
});

const summarizeActivity = (commands: RunCommand[]) =>
  commands.reduce((activity, command) => {
    switch (command.kind) {
      case 'draft-monster':
        activity.drafted += 1;
        break;
      case 'reroll-shop':
        activity.shopRerolls += 1;
        break;
      case 'freeze-shop':
        activity.shopFreezes += 1;
        break;
      case 'buy-monster':
        activity.monstersBought += 1;
        break;
      case 'buy-equipment':
        activity.equipmentBought += 1;
        break;
      case 'sell-monster':
        activity.monstersSold += 1;
        break;
      case 'toggle-active':
      case 'move-monster':
        activity.formationChanges += 1;
        break;
      case 'change-equipment':
        activity.equipmentChanges += 1;
        break;
      case 'change-gambit':
        activity.gambitChanges += 1;
        break;
      case 'breed':
        activity.breeds += 1;
        break;
      case 'choose-event':
        activity.eventsChosen += 1;
        break;
      case 'skip-event':
        activity.eventsSkipped += 1;
        break;
      case 'battle-complete':
        activity.battles += 1;
        if (command.winner === 'player') activity.battleWins += 1;
        if (command.winner === 'enemy') activity.battleLosses += 1;
        if (command.winner === 'draw') activity.battleDraws += 1;
        break;
      case 'continue-cycle':
      case 'finish-run':
      case 'continue-event':
        break;
    }
    return activity;
  }, initialActivity());

const durationSeconds = ({ startedAt, completedAt }: PlaytestReportTiming) => {
  const duration = Date.parse(completedAt) - Date.parse(startedAt);
  return Number.isFinite(duration) ? Math.max(0, Math.round(duration / 1000)) : 0;
};

export function createPlaytestReport(
  data: GameData,
  run: CasualRunState,
  timing: PlaytestReportTiming,
): PlaytestReport {
  const activeIndex = new Map(run.activeIds.map((id, index) => [id, index]));
  const benchIds = run.roster.filter((monster) => !activeIndex.has(monster.id)).map((monster) => monster.id);
  const outcome =
    run.completedCycles >= data.rules.maxCycles
      ? 'completed'
      : run.losses >= data.rules.maxLosses
        ? 'defeated'
        : 'in-progress';
  return {
    schemaVersion: 1,
    contentVersion: run.contentVersion,
    runSchemaVersion: run.schemaVersion,
    commandLogVersion: run.commandLogVersion,
    generatedAt: timing.completedAt,
    run: {
      mode: run.mode,
      seed: run.seed,
      outcome,
      startedAt: timing.startedAt,
      completedAt: timing.completedAt,
      durationSeconds: durationSeconds(timing),
      completedCycles: run.completedCycles,
      wins: run.wins,
      losses: run.losses,
      finalCoins: run.coins,
      commandCount: run.commandLog.length,
    },
    activity: summarizeActivity(run.commandLog),
    finalRoster: run.roster.map((monster) => ({
      ...monster,
      active: activeIndex.has(monster.id),
      partyIndex: activeIndex.get(monster.id) ?? run.activeIds.length + benchIds.indexOf(monster.id),
    })),
    commandLog: [...run.commandLog],
  };
}

export const serializePlaytestReport = (report: PlaytestReport) => `${JSON.stringify(report, null, 2)}\n`;
