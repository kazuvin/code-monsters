import { simulateBattle } from './battle';
import { MAX_GAMBIT_RULES, MIN_GAMBIT_RULES } from './monster';
import type { BattleResult, GameData, MonsterInstance, Team } from './types';

export type OnlineSeat = 'a' | 'b';
export type OnlineMatchPhase = 'preparing' | 'battle' | 'finished';

export type OnlineBuild = {
  contentVersion: string;
  active: MonsterInstance[];
};

export type OnlineMatchScore = {
  a: number;
  b: number;
  draws: number;
};

export type OnlineMatchState = {
  schemaVersion: 1;
  contentVersion: string;
  phase: OnlineMatchPhase;
  cycle: number;
  battleNumber: number;
  suddenDeathRound: number;
  score: OnlineMatchScore;
  builds: Partial<Record<OnlineSeat, OnlineBuild>>;
  submittedSeats: OnlineSeat[];
  continuedSeats: OnlineSeat[];
  lastBattle?: BattleResult;
};

export type OnlineMatchCommand = {
  ok: boolean;
  state: OnlineMatchState;
  error?: string;
  battle?: BattleResult;
};

const seats: OnlineSeat[] = ['a', 'b'];
const opponentFor = (seat: OnlineSeat): OnlineSeat => (seat === 'a' ? 'b' : 'a');
const swapTeam = (team: Team): Team => (team === 'player' ? 'enemy' : 'player');
const swapWinner = (winner: BattleResult['winner']): BattleResult['winner'] =>
  winner === 'draw' ? 'draw' : swapTeam(winner);

const cloneBuild = (build: OnlineBuild): OnlineBuild => ({
  contentVersion: build.contentVersion,
  active: build.active.map((monster) => ({
    ...monster,
    inheritedStats: { ...monster.inheritedStats },
    gambits: monster.gambits.map((gambit) => ({
      condition: { ...gambit.condition },
      action: { ...gambit.action },
    })),
  })),
});

const targetRules = new Set([
  'self',
  'lowest-hp-ally',
  'highest-hp-ally',
  'lowest-hp-enemy',
  'highest-hp-enemy',
  'highest-attack-enemy',
  'random-enemy',
]);
const conditionKinds = new Set([
  'always',
  'self-hp-below',
  'self-hp-above',
  'self-mp-below',
  'self-mp-above',
  'self-shield-below',
  'self-shield-above',
  'ally-hp-below',
  'ally-hp-above',
  'ally-mp-below',
  'ally-mp-above',
  'ally-shield-below',
  'ally-shield-above',
  'enemy-hp-below',
  'enemy-hp-above',
  'enemy-mp-below',
  'enemy-mp-above',
  'enemy-shield-below',
  'enemy-shield-above',
  'self-has-status',
  'self-lacks-status',
  'ally-has-status',
  'ally-lacks-status',
  'enemy-has-status',
  'enemy-lacks-status',
  'living-count-at-most',
  'living-count-at-least',
]);
const statIds = ['maxHp', 'maxMp', 'attack', 'defense', 'speed', 'wisdom', 'crit'] as const;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const monsterShapeIsValid = (data: GameData, value: unknown): value is MonsterInstance => {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 80) return false;
  if (
    typeof value.definitionId !== 'string' ||
    !data.monsters.some((definition) => definition.id === value.definitionId)
  ) {
    return false;
  }
  if (!Number.isInteger(value.colorStars) || Number(value.colorStars) < 0 || Number(value.colorStars) > 2) return false;
  if (!Number.isInteger(value.level) || Number(value.level) < 1 || Number(value.level) > data.rules.maxLevel)
    return false;
  for (const field of ['xp', 'cyclesHeld', 'journeySeed'] as const) {
    if (!Number.isInteger(value[field]) || Number(value[field]) < 0 || Number(value[field]) > 0xffff_ffff) {
      return false;
    }
  }
  if (!isRecord(value.inheritedStats)) return false;
  const inheritedStats = value.inheritedStats;
  if (
    statIds.some(
      (statId) =>
        typeof inheritedStats[statId] !== 'number' ||
        !Number.isFinite(inheritedStats[statId]) ||
        Math.abs(inheritedStats[statId]) > 100_000,
    )
  ) {
    return false;
  }
  if (
    value.inheritedSkillId !== undefined &&
    (typeof value.inheritedSkillId !== 'string' || !data.skills.some((skill) => skill.id === value.inheritedSkillId))
  ) {
    return false;
  }
  if (
    value.equipmentId !== undefined &&
    (typeof value.equipmentId !== 'string' || !data.equipment.some((equipment) => equipment.id === value.equipmentId))
  ) {
    return false;
  }
  if (
    !Array.isArray(value.gambits) ||
    value.gambits.length < MIN_GAMBIT_RULES ||
    value.gambits.length > MAX_GAMBIT_RULES
  ) {
    return false;
  }
  return value.gambits.every((gambit) => {
    if (!isRecord(gambit) || !isRecord(gambit.condition) || !isRecord(gambit.action)) return false;
    const { skillId, target } = gambit.action;
    return (
      typeof gambit.condition.kind === 'string' &&
      conditionKinds.has(gambit.condition.kind) &&
      typeof skillId === 'string' &&
      (skillId === 'normal-attack' || data.skills.some((skill) => skill.id === skillId)) &&
      typeof target === 'string' &&
      targetRules.has(target)
    );
  });
};

const validateBuild = (data: GameData, state: OnlineMatchState, build: OnlineBuild): string | undefined => {
  if (build.contentVersion !== state.contentVersion || build.contentVersion !== data.rules.contentVersion) {
    return 'ゲームデータが更新されています。ページを再読み込みしてください';
  }
  if (
    !Array.isArray(build.active) ||
    build.active.length !== data.rules.activeLimit ||
    !build.active.every((monster) => monsterShapeIsValid(data, monster)) ||
    new Set(build.active.map((monster) => monster.id)).size !== 3
  ) {
    return '重複のない主力3体を提出してください';
  }
  return undefined;
};

const namespaceTeam = (seat: OnlineSeat, build: OnlineBuild) =>
  build.active.map((monster) => ({ ...monster, id: `${seat}:${monster.id}` }));

const addBattleToScore = (score: OnlineMatchScore, battle: BattleResult): OnlineMatchScore => ({
  a: score.a + (battle.winner === 'player' ? 1 : 0),
  b: score.b + (battle.winner === 'enemy' ? 1 : 0),
  draws: score.draws + (battle.winner === 'draw' ? 1 : 0),
});

const resolveBuilds = (
  data: GameData,
  state: OnlineMatchState,
  builds: Record<OnlineSeat, OnlineBuild>,
  seed: number,
  suddenDeathRound = state.suddenDeathRound,
): OnlineMatchCommand => {
  const battle = simulateBattle(data, {
    player: namespaceTeam('a', builds.a),
    enemy: namespaceTeam('b', builds.b),
    seed,
  });
  return {
    ok: true,
    battle,
    state: {
      ...state,
      phase: 'battle',
      battleNumber: state.battleNumber + 1,
      suddenDeathRound,
      score: addBattleToScore(state.score, battle),
      builds,
      submittedSeats: seats,
      continuedSeats: [],
      lastBattle: battle,
    },
  };
};

export function createOnlineMatch(contentVersion: string): OnlineMatchState {
  return {
    schemaVersion: 1,
    contentVersion,
    phase: 'preparing',
    cycle: 1,
    battleNumber: 0,
    suddenDeathRound: 0,
    score: { a: 0, b: 0, draws: 0 },
    builds: {},
    submittedSeats: [],
    continuedSeats: [],
  };
}

export function submitOnlineBuild(
  data: GameData,
  state: OnlineMatchState,
  seat: OnlineSeat,
  build: OnlineBuild,
  seed: number,
): OnlineMatchCommand {
  if (state.phase !== 'preparing') return { ok: false, state, error: '現在は編成を提出できません' };
  const error = validateBuild(data, state, build);
  if (error) return { ok: false, state, error };

  const builds = { ...state.builds, [seat]: cloneBuild(build) };
  const submittedSeats = seats.filter((candidate) => builds[candidate]);
  const next = { ...state, builds, submittedSeats };
  if (!builds.a || !builds.b) return { ok: true, state: next };
  return resolveBuilds(data, next, builds as Record<OnlineSeat, OnlineBuild>, seed);
}

const localIdFor = (id: string, seat: OnlineSeat) => {
  const ownPrefix = `${seat}:`;
  const opponentPrefix = `${opponentFor(seat)}:`;
  if (id.startsWith(ownPrefix)) return id.slice(ownPrefix.length);
  if (id.startsWith(opponentPrefix)) return `opponent:${id.slice(opponentPrefix.length)}`;
  return id;
};

export function battleForSeat(
  battle: BattleResult,
  builds: OnlineMatchState['builds'],
  seat: OnlineSeat,
): { result: BattleResult; opponent: MonsterInstance[] } {
  const ownIsPlayer = seat === 'a';
  const mapTeam = (team: Team) => (ownIsPlayer ? team : swapTeam(team));
  const mapId = (id: string) => localIdFor(id, seat);
  const opponentBuild = builds[opponentFor(seat)];
  if (!opponentBuild) throw new Error('Opponent build is missing');

  return {
    result: {
      winner: ownIsPlayer ? battle.winner : swapWinner(battle.winner),
      durationSeconds: battle.durationSeconds,
      damageByTeam: ownIsPlayer
        ? { ...battle.damageByTeam }
        : { player: battle.damageByTeam.enemy, enemy: battle.damageByTeam.player },
      frames: battle.frames.map((frame) => ({
        ...frame,
        actorId: frame.actorId ? mapId(frame.actorId) : undefined,
        targetIds: frame.targetIds.map(mapId),
        criticalTargetIds: frame.criticalTargetIds.map(mapId),
        fighters: frame.fighters.map((fighter) => ({
          ...fighter,
          id: mapId(fighter.id),
          team: mapTeam(fighter.team),
          statuses: [...fighter.statuses],
        })),
      })),
      monsterReports: battle.monsterReports.map((report) => ({
        ...report,
        id: mapId(report.id),
        team: mapTeam(report.team),
        skillUses: { ...report.skillUses },
        statusApplications: { ...report.statusApplications },
        skillBreakdown: Object.fromEntries(
          Object.entries(report.skillBreakdown).map(([skillId, contribution]) => [skillId, { ...contribution }]),
        ),
      })),
    },
    opponent: opponentBuild.active.map((monster) => ({
      ...monster,
      id: `opponent:${monster.id}`,
    })),
  };
}

export function continueOnlineMatch(
  data: GameData,
  state: OnlineMatchState,
  seat: OnlineSeat,
  seed: number,
): OnlineMatchCommand {
  if (state.phase !== 'battle') return { ok: false, state, error: '現在は戦闘結果を進められません' };
  if (state.continuedSeats.includes(seat)) return { ok: true, state };

  const continuedSeats = [...state.continuedSeats, seat];
  const waiting = { ...state, continuedSeats };
  if (continuedSeats.length < 2) return { ok: true, state: waiting };

  if (state.cycle < data.rules.maxCycles) {
    return {
      ok: true,
      state: {
        ...waiting,
        phase: 'preparing',
        cycle: state.cycle + 1,
        builds: {},
        submittedSeats: [],
        continuedSeats: [],
        lastBattle: undefined,
      },
    };
  }

  if (state.score.a !== state.score.b) {
    return { ok: true, state: { ...waiting, phase: 'finished', continuedSeats: [] } };
  }

  if (!state.builds.a || !state.builds.b) {
    return { ok: false, state, error: 'サドンデス用の最終編成が見つかりません' };
  }
  return resolveBuilds(
    data,
    waiting,
    state.builds as Record<OnlineSeat, OnlineBuild>,
    seed,
    state.suddenDeathRound + 1,
  );
}
