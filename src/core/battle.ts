import { chooseGambitDecision, type GambitFighterView } from './gambit';
import { battleStatsFor, definitionFor } from './monster';
import { createSeededRandom } from './rng';
import type {
  BattleFrame,
  BattleContribution,
  BattleInput,
  BattleResult,
  EffectDefinition,
  FighterSnapshot,
  GameData,
  MonsterBattleReport,
  MonsterInstance,
  StatBlock,
  StatId,
  StatusId,
  Team,
  TimedStatus,
} from './types';

type BattleFighter = {
  id: string;
  team: Team;
  monster: MonsterInstance;
  name: string;
  stats: StatBlock;
  hp: number;
  mp: number;
  gauge: number;
  shield: number;
  statuses: TimedStatus[];
  tieOrder: number;
  report: MonsterBattleReport;
};

const ROUND_PRECISION = 1000;
const round = (value: number) => Math.round(value * ROUND_PRECISION) / ROUND_PRECISION;
const alive = (fighter: BattleFighter) => fighter.hp > 0;
const relation = (fighter: BattleFighter, candidate: BattleFighter) =>
  fighter.team === candidate.team ? 'ally' : 'enemy';
const positiveStatus = (statusId: StatusId) => statusId.endsWith('-up') || statusId === 'regeneration';
const contributionFor = (fighter: BattleFighter, sourceId: string): BattleContribution => {
  fighter.report.skillBreakdown[sourceId] ??= {
    uses: 0,
    damage: 0,
    healing: 0,
    shielding: 0,
    buffs: 0,
    debuffs: 0,
    criticalHits: 0,
    atb: 0,
    mp: 0,
  };
  return fighter.report.skillBreakdown[sourceId];
};

const statusModifier = (fighter: BattleFighter, statId: StatId) => {
  const pairs: Partial<Record<StatId, [StatusId, StatusId]>> = {
    attack: ['attack-up', 'attack-down'],
    defense: ['defense-up', 'defense-down'],
    speed: ['speed-up', 'speed-down'],
    wisdom: ['wisdom-up', 'wisdom-down'],
    crit: ['crit-up', 'crit-down'],
  };
  const pair = pairs[statId];
  if (!pair) return 0;
  const increase = fighter.statuses.find((status) => status.id === pair[0])?.amount ?? 0;
  const decrease = fighter.statuses.find((status) => status.id === pair[1])?.amount ?? 0;
  return Math.max(-50, Math.min(50, increase - decrease));
};

const effectiveStat = (fighter: BattleFighter, statId: StatId, criticalCap: number) => {
  const base = fighter.stats[statId];
  const modifier = statusModifier(fighter, statId);
  if (statId === 'crit') return Math.max(0, Math.min(criticalCap, base + modifier));
  return Math.max(1, Math.floor(base * (1 + modifier / 100)));
};

const snapshots = (data: GameData, fighters: BattleFighter[]): FighterSnapshot[] =>
  fighters.map((fighter) => {
    const definition = definitionFor(data, fighter.monster);
    return {
      id: fighter.id,
      team: fighter.team,
      name: fighter.name,
      definitionId: definition.id,
      colorStars: fighter.monster.colorStars,
      whiteStars: definition.whiteStars,
      hp: Math.max(0, fighter.hp),
      maxHp: fighter.stats.maxHp,
      mp: Math.max(0, fighter.mp),
      maxMp: fighter.stats.maxMp,
      gauge: round(fighter.gauge),
      shield: fighter.shield,
      statuses: fighter.statuses.map((status) => status.id),
      alive: alive(fighter),
    };
  });

const makeFrame = (
  data: GameData,
  fighters: BattleFighter[],
  atSeconds: number,
  kind: BattleFrame['kind'],
  text: string,
  actorId?: string,
  targetIds: string[] = [],
  skillId?: BattleFrame['skillId'],
  criticalTargetIds: string[] = [],
  battleStartSource?: BattleFrame['battleStartSource'],
): BattleFrame => ({
  atSeconds: round(atSeconds),
  kind,
  actorId,
  skillId,
  battleStartSource,
  targetIds,
  criticalTargetIds,
  text,
  fighters: snapshots(data, fighters),
});

const addStatus = (fighter: BattleFighter, status: TimedStatus) => {
  const current = fighter.statuses.find((entry) => entry.id === status.id);
  if (!current) {
    fighter.statuses.push(status);
    return;
  }
  current.amount = Math.abs(status.amount) > Math.abs(current.amount) ? status.amount : current.amount;
  current.remainingSeconds = Math.max(current.remainingSeconds, status.remainingSeconds);
};

const applyDamage = (fighter: BattleFighter, damage: number) => {
  const wholeDamage = Math.max(0, Math.floor(damage));
  const absorbed = Math.min(fighter.shield, wholeDamage);
  fighter.shield -= absorbed;
  const hpDamage = Math.min(fighter.hp, wholeDamage - absorbed);
  fighter.hp -= hpDamage;
  return { total: absorbed + hpDamage, hp: hpDamage, absorbed };
};

const targetsForEffect = (
  effect: EffectDefinition,
  actor: BattleFighter,
  actionTargets: BattleFighter[],
  fighters: BattleFighter[],
) => {
  switch (effect.target) {
    case 'self':
      return [actor];
    case 'all-allies':
      return fighters.filter((fighter) => alive(fighter) && relation(actor, fighter) === 'ally');
    case 'all-enemies':
      return fighters.filter((fighter) => alive(fighter) && relation(actor, fighter) === 'enemy');
    case 'action-target':
      return actionTargets.filter(alive);
  }
};

const applyEffect = (
  data: GameData,
  effect: EffectDefinition,
  actor: BattleFighter,
  actionTargets: BattleFighter[],
  fighters: BattleFighter[],
  random: ReturnType<typeof createSeededRandom>,
  sourceSkillId = 'passive',
) => {
  const targets = targetsForEffect(effect, actor, actionTargets, fighters);
  const notes: string[] = [];
  const criticalTargetIds: string[] = [];
  for (const target of targets) {
    switch (effect.kind) {
      case 'damage': {
        const offense = effectiveStat(
          actor,
          effect.scaling === 'physical' ? 'attack' : 'wisdom',
          data.rules.battle.criticalCap,
        );
        const defense = effectiveStat(
          target,
          effect.scaling === 'physical' ? 'defense' : 'wisdom',
          data.rules.battle.criticalCap,
        );
        const reduction = effect.scaling === 'physical' ? 0.42 : 0.25;
        let damage = Math.max(1, offense * (effect.power / 100) - defense * reduction);
        const critical =
          effect.canCrit && random.next() * 100 < effectiveStat(actor, 'crit', data.rules.battle.criticalCap);
        if (critical) damage *= data.rules.battle.criticalMultiplier;
        const applied = applyDamage(target, damage);
        actor.report.damageDealt += applied.total;
        actor.report.hpDamageDealt += applied.hp;
        contributionFor(actor, sourceSkillId).damage += applied.total;
        target.report.damageTaken += applied.total;
        target.report.shieldAbsorbed += applied.absorbed;
        if (critical) {
          actor.report.criticalHits += 1;
          contributionFor(actor, sourceSkillId).criticalHits += 1;
          criticalTargetIds.push(target.id);
        }
        notes.push(`${target.name}に${applied.total}${critical ? ' 会心' : ''}`);
        break;
      }
      case 'heal': {
        const amount = Math.max(
          1,
          Math.floor(effectiveStat(actor, 'wisdom', data.rules.battle.criticalCap) * (effect.power / 100)),
        );
        const restored = Math.min(amount, target.stats.maxHp - target.hp);
        target.hp += restored;
        actor.report.healingDone += restored;
        contributionFor(actor, sourceSkillId).healing += restored;
        target.report.healingReceived += restored;
        notes.push(`${target.name}を${restored}回復`);
        break;
      }
      case 'shield': {
        const amount = Math.max(1, Math.floor(target.stats.maxHp * (effect.maxHpPercent / 100)));
        const cap = Math.floor(target.stats.maxHp * data.rules.battle.shieldCapPercent);
        const gained = Math.max(0, Math.min(amount, cap - target.shield));
        target.shield += gained;
        actor.report.shieldingDone += gained;
        contributionFor(actor, sourceSkillId).shielding += gained;
        target.report.shieldingReceived += gained;
        notes.push(`${target.name}に盾${gained}`);
        break;
      }
      case 'status':
        addStatus(target, {
          id: effect.statusId,
          amount: effect.amount,
          remainingSeconds: effect.durationSeconds,
          sourceId: actor.id,
          sourceSkillId,
        });
        actor.report.statusApplications[effect.statusId] = (actor.report.statusApplications[effect.statusId] ?? 0) + 1;
        if (positiveStatus(effect.statusId)) {
          actor.report.buffApplications += 1;
          contributionFor(actor, sourceSkillId).buffs += 1;
        } else {
          actor.report.debuffApplications += 1;
          contributionFor(actor, sourceSkillId).debuffs += 1;
        }
        notes.push(`${target.name}に${effect.statusId}`);
        break;
      case 'atb': {
        const before = target.gauge;
        target.gauge = Math.max(0, Math.min(data.rules.battle.gaugeMaximum - 0.001, target.gauge + effect.amount));
        const granted = Math.max(0, target.gauge - before);
        actor.report.atbGranted += granted;
        contributionFor(actor, sourceSkillId).atb += granted;
        notes.push(`${target.name}のATB${effect.amount >= 0 ? '+' : ''}${effect.amount}`);
        break;
      }
      case 'mp': {
        const before = target.mp;
        target.mp = Math.max(0, Math.min(target.stats.maxMp, target.mp + effect.amount));
        const granted = Math.max(0, target.mp - before);
        actor.report.mpGranted += granted;
        contributionFor(actor, sourceSkillId).mp += granted;
        notes.push(`${target.name}のMP${target.mp - before >= 0 ? '+' : ''}${target.mp - before}`);
        break;
      }
    }
  }
  return { targets, notes, criticalTargetIds };
};

const chooseTarget = (
  data: GameData,
  actor: BattleFighter,
  targetRule: string,
  fighters: BattleFighter[],
  random: ReturnType<typeof createSeededRandom>,
) => {
  const allies = fighters.filter((fighter) => alive(fighter) && relation(actor, fighter) === 'ally');
  const enemies = fighters.filter((fighter) => alive(fighter) && relation(actor, fighter) === 'enemy');
  if (targetRule === 'self') return actor;
  if (targetRule === 'lowest-hp-ally') {
    return [...allies].sort((left, right) => left.hp / left.stats.maxHp - right.hp / right.stats.maxHp)[0];
  }
  if (targetRule === 'highest-hp-ally') {
    return [...allies].sort((left, right) => right.hp / right.stats.maxHp - left.hp / left.stats.maxHp)[0];
  }
  if (targetRule === 'lowest-hp-enemy') {
    return [...enemies].sort((left, right) => left.hp / left.stats.maxHp - right.hp / right.stats.maxHp)[0];
  }
  if (targetRule === 'highest-hp-enemy') {
    return [...enemies].sort((left, right) => right.hp / right.stats.maxHp - left.hp / left.stats.maxHp)[0];
  }
  if (targetRule === 'highest-attack-enemy') {
    return [...enemies].sort(
      (left, right) =>
        effectiveStat(right, 'attack', data.rules.battle.criticalCap) -
        effectiveStat(left, 'attack', data.rules.battle.criticalCap),
    )[0];
  }
  return enemies.length > 0 ? random.pick(enemies) : undefined;
};

const toGambitView = (fighter: BattleFighter): GambitFighterView => ({
  id: fighter.id,
  team: fighter.team,
  monster: fighter.monster,
  hp: fighter.hp,
  maxHp: fighter.stats.maxHp,
  mp: fighter.mp,
  maxMp: fighter.stats.maxMp,
  attack: fighter.stats.attack,
  alive: alive(fighter),
  statuses: fighter.statuses.map((status) => status.id),
});

const winnerFor = (fighters: BattleFighter[]) => {
  const playerAlive = fighters.some((fighter) => fighter.team === 'player' && alive(fighter));
  const enemyAlive = fighters.some((fighter) => fighter.team === 'enemy' && alive(fighter));
  if (playerAlive && enemyAlive) return null;
  if (playerAlive) return 'player' as const;
  if (enemyAlive) return 'enemy' as const;
  return 'draw' as const;
};

const teamHpRatio = (fighters: BattleFighter[], team: Team) => {
  const teamFighters = fighters.filter((fighter) => fighter.team === team);
  const maximum = teamFighters.reduce((total, fighter) => total + fighter.stats.maxHp, 0);
  return maximum === 0 ? 0 : teamFighters.reduce((total, fighter) => total + fighter.hp, 0) / maximum;
};

const determineTimeoutWinner = (fighters: BattleFighter[]) => {
  const playerRatio = teamHpRatio(fighters, 'player');
  const enemyRatio = teamHpRatio(fighters, 'enemy');
  if (Math.abs(playerRatio - enemyRatio) > 0.0001) return playerRatio > enemyRatio ? 'player' : 'enemy';
  const playerDamage = fighters
    .filter((fighter) => fighter.team === 'player')
    .reduce((total, fighter) => total + fighter.report.hpDamageDealt, 0);
  const enemyDamage = fighters
    .filter((fighter) => fighter.team === 'enemy')
    .reduce((total, fighter) => total + fighter.report.hpDamageDealt, 0);
  if (playerDamage !== enemyDamage) return playerDamage > enemyDamage ? 'player' : 'enemy';
  return 'draw';
};

const startActivationsFor = (data: GameData, fighter: BattleFighter) => {
  const definition = definitionFor(data, fighter.monster);
  const trait = data.traits.find((entry) => entry.id === definition.traitId);
  const equipment = data.equipment.find((entry) => entry.id === fighter.monster.equipmentId);
  return [
    ...(trait && trait.stages[fighter.monster.colorStars].battleStartEffects.length > 0
      ? [
          {
            source: { kind: 'trait' as const, id: trait.id, name: trait.name, speed: fighter.stats.speed },
            effects: trait.stages[fighter.monster.colorStars].battleStartEffects,
          },
        ]
      : []),
    ...(equipment && equipment.battleStartEffects.length > 0
      ? [
          {
            source: { kind: 'equipment' as const, id: equipment.id, name: equipment.name, speed: fighter.stats.speed },
            effects: equipment.battleStartEffects,
          },
        ]
      : []),
  ];
};

const applyBattleStart = (
  data: GameData,
  fighters: BattleFighter[],
  random: ReturnType<typeof createSeededRandom>,
  frames: BattleFrame[],
) => {
  const orderedFighters = [...fighters].sort(
    (left, right) => right.stats.speed - left.stats.speed || left.tieOrder - right.tieOrder,
  );
  for (const fighter of orderedFighters) {
    for (const activation of startActivationsFor(data, fighter)) {
      const notes: string[] = [];
      const targetIds = new Set<string>();
      const criticalTargetIds = new Set<string>();
      for (const effect of activation.effects) {
        const positiveStatus =
          effect.kind === 'status' && (effect.statusId.endsWith('-up') || effect.statusId === 'regeneration');
        const defaultTarget =
          effect.kind === 'heal' ||
          effect.kind === 'shield' ||
          effect.kind === 'mp' ||
          effect.kind === 'atb' ||
          positiveStatus
            ? fighter
            : chooseTarget(data, fighter, 'random-enemy', fighters, random);
        const applied = applyEffect(
          data,
          effect,
          fighter,
          defaultTarget ? [defaultTarget] : [],
          fighters,
          random,
          activation.source.id,
        );
        applied.notes.forEach((note) => notes.push(note));
        applied.targets.forEach((target) => targetIds.add(target.id));
        applied.criticalTargetIds.forEach((targetId) => criticalTargetIds.add(targetId));
      }
      frames.push(
        makeFrame(
          data,
          fighters,
          0,
          'battle-start-effect',
          `${fighter.name}の${activation.source.name}発動｜${notes.join(' / ')}`,
          fighter.id,
          [...targetIds],
          undefined,
          [...criticalTargetIds],
          activation.source,
        ),
      );
    }
  }
};

const processPeriodicStatuses = (fighters: BattleFighter[]) => {
  for (const fighter of fighters.filter(alive)) {
    for (const status of fighter.statuses) {
      const source = fighters.find((candidate) => candidate.id === status.sourceId);
      const sourceContribution = source ? contributionFor(source, status.sourceSkillId ?? 'passive') : undefined;
      if (status.id === 'regeneration') {
        const amount = Math.max(1, Math.floor(fighter.stats.maxHp * (status.amount / 100)));
        const restored = Math.min(amount, fighter.stats.maxHp - fighter.hp);
        fighter.hp += restored;
        fighter.report.healingReceived += restored;
        if (source) source.report.healingDone += restored;
        if (sourceContribution) sourceContribution.healing += restored;
      }
      if (status.id === 'damage-over-time') {
        const applied = applyDamage(fighter, Math.max(1, Math.floor(fighter.stats.maxHp * (status.amount / 100))));
        fighter.report.damageTaken += applied.total;
        fighter.report.shieldAbsorbed += applied.absorbed;
        if (source) {
          source.report.damageDealt += applied.total;
          source.report.hpDamageDealt += applied.hp;
        }
        if (sourceContribution) sourceContribution.damage += applied.total;
      }
    }
  }
};

const decayStatuses = (fighters: BattleFighter[], seconds: number) => {
  for (const fighter of fighters) {
    for (const status of fighter.statuses) status.remainingSeconds = round(status.remainingSeconds - seconds);
    fighter.statuses = fighter.statuses.filter((status) => status.remainingSeconds > 0);
  }
};

const createFighter = (data: GameData, monster: MonsterInstance, team: Team, tieOrder: number): BattleFighter => {
  const stats = battleStatsFor(data, monster);
  const definition = definitionFor(data, monster);
  return {
    id: monster.id,
    team,
    monster,
    name: definition.name,
    stats,
    hp: stats.maxHp,
    mp: stats.maxMp,
    gauge: 0,
    shield: 0,
    statuses: [],
    tieOrder,
    report: {
      id: monster.id,
      definitionId: definition.id,
      name: definition.name,
      team,
      actions: 0,
      normalAttacks: 0,
      fallbackActions: 0,
      criticalHits: 0,
      damageDealt: 0,
      hpDamageDealt: 0,
      damageTaken: 0,
      shieldAbsorbed: 0,
      healingDone: 0,
      healingReceived: 0,
      shieldingDone: 0,
      shieldingReceived: 0,
      buffApplications: 0,
      debuffApplications: 0,
      atbGranted: 0,
      mpGranted: 0,
      skillUses: {},
      statusApplications: {},
      skillBreakdown: {},
    },
  };
};

export function simulateBattle(data: GameData, input: BattleInput): BattleResult {
  if (input.player.length !== data.rules.activeLimit || input.enemy.length !== data.rules.activeLimit) {
    throw new Error(`Battle requires ${data.rules.activeLimit} monsters on each team`);
  }
  const random = createSeededRandom(input.seed);
  const fighters = [
    ...input.player.map((monster) => createFighter(data, monster, 'player', random.next())),
    ...input.enemy.map((monster) => createFighter(data, monster, 'enemy', random.next())),
  ];
  const frames: BattleFrame[] = [];
  frames.push(makeFrame(data, fighters, 0, 'start', '両チーム、戦闘開始'));
  applyBattleStart(data, fighters, random, frames);

  let time = 0;
  let nextPeriodicSecond = 1;
  let nextEnvironment = data.rules.battle.environmentStartSeconds;
  let environmentCount = 0;
  let winner = winnerFor(fighters);

  while (!winner && time < data.rules.battle.maximumSeconds) {
    time = round(time + data.rules.battle.tickSeconds);
    decayStatuses(fighters, data.rules.battle.tickSeconds);

    if (time + 0.0001 >= nextPeriodicSecond) {
      processPeriodicStatuses(fighters);
      nextPeriodicSecond += 1;
      winner = winnerFor(fighters);
      if (winner) break;
    }

    if (time + 0.0001 >= nextEnvironment) {
      const prePlayerRatio = teamHpRatio(fighters, 'player');
      const preEnemyRatio = teamHpRatio(fighters, 'enemy');
      const percent =
        data.rules.battle.environmentInitialPercent * data.rules.battle.environmentGrowth ** environmentCount;
      const affected = fighters.filter(alive);
      for (const fighter of affected) {
        const applied = applyDamage(fighter, fighter.stats.maxHp * percent);
        fighter.report.damageTaken += applied.total;
        fighter.report.shieldAbsorbed += applied.absorbed;
      }
      frames.push(
        makeFrame(
          data,
          fighters,
          time,
          'environment',
          `環境崩壊 ${Math.round(percent * 100)}%`,
          undefined,
          affected.map((fighter) => fighter.id),
        ),
      );
      winner = winnerFor(fighters);
      if (winner === 'draw') {
        if (Math.abs(prePlayerRatio - preEnemyRatio) > 0.0001) {
          winner = prePlayerRatio > preEnemyRatio ? 'player' : 'enemy';
        } else {
          winner = determineTimeoutWinner(fighters);
        }
      }
      environmentCount += 1;
      nextEnvironment += data.rules.battle.environmentIntervalSeconds;
      if (winner) break;
    }

    for (const fighter of fighters.filter(alive)) {
      const speed = effectiveStat(fighter, 'speed', data.rules.battle.criticalCap);
      fighter.gauge +=
        (data.rules.battle.gaugeMaximum / data.rules.battle.baseActionSeconds) *
        Math.sqrt(speed / 25) *
        data.rules.battle.tickSeconds;
    }

    while (!winner) {
      const actor = fighters
        .filter((fighter) => alive(fighter) && fighter.gauge >= data.rules.battle.gaugeMaximum)
        .sort((left, right) => right.gauge - left.gauge || left.tieOrder - right.tieOrder)[0];
      if (!actor) break;
      actor.gauge = 0;
      const views = fighters.map(toGambitView);
      const decision = chooseGambitDecision(data, toGambitView(actor), views);
      const action = decision.action;
      const chosenTarget = chooseTarget(data, actor, action.target, fighters, random);
      if (!chosenTarget) break;
      const skill =
        action.skillId === 'normal-attack' ? undefined : data.skills.find((entry) => entry.id === action.skillId);
      const effects: EffectDefinition[] = skill
        ? skill.effects
        : [
            {
              kind: 'damage',
              scaling: 'physical',
              power: 92,
              target: 'action-target',
              canCrit: true,
            },
          ];
      if (skill) actor.mp -= skill.mpCost;
      actor.report.actions += 1;
      actor.report.skillUses[action.skillId] = (actor.report.skillUses[action.skillId] ?? 0) + 1;
      contributionFor(actor, action.skillId).uses += 1;
      if (action.skillId === 'normal-attack') actor.report.normalAttacks += 1;
      if (decision.fallback) actor.report.fallbackActions += 1;
      const notes: string[] = [];
      const targetIds = new Set<string>();
      const criticalTargetIds = new Set<string>();
      for (const effect of effects) {
        const applied = applyEffect(data, effect, actor, [chosenTarget], fighters, random, action.skillId);
        applied.notes.forEach((note) => notes.push(note));
        applied.targets.forEach((target) => targetIds.add(target.id));
        applied.criticalTargetIds.forEach((targetId) => criticalTargetIds.add(targetId));
      }
      const actionName = skill?.name ?? '通常攻撃';
      frames.push(
        makeFrame(
          data,
          fighters,
          time,
          'action',
          `${actor.name}の${actionName}｜${notes.join(' / ')}`,
          actor.id,
          [...targetIds],
          action.skillId,
          [...criticalTargetIds],
        ),
      );
      winner = winnerFor(fighters);
    }
  }

  winner ??= determineTimeoutWinner(fighters);
  frames.push(
    makeFrame(
      data,
      fighters,
      Math.min(time, data.rules.battle.maximumSeconds),
      'finish',
      winner === 'draw' ? '引き分け' : `${winner === 'player' ? '自軍' : '相手'}の勝利`,
    ),
  );
  return {
    winner,
    durationSeconds: Math.min(round(time), data.rules.battle.maximumSeconds),
    frames,
    damageByTeam: {
      player: fighters
        .filter((fighter) => fighter.team === 'player')
        .reduce((total, fighter) => total + fighter.report.hpDamageDealt, 0),
      enemy: fighters
        .filter((fighter) => fighter.team === 'enemy')
        .reduce((total, fighter) => total + fighter.report.hpDamageDealt, 0),
    },
    monsterReports: fighters.map((fighter) => ({
      ...fighter.report,
      damageDealt: Math.floor(fighter.report.damageDealt),
      hpDamageDealt: Math.floor(fighter.report.hpDamageDealt),
      damageTaken: Math.floor(fighter.report.damageTaken),
      shieldAbsorbed: Math.floor(fighter.report.shieldAbsorbed),
      healingDone: Math.floor(fighter.report.healingDone),
      healingReceived: Math.floor(fighter.report.healingReceived),
      shieldingDone: Math.floor(fighter.report.shieldingDone),
      shieldingReceived: Math.floor(fighter.report.shieldingReceived),
      atbGranted: Math.floor(fighter.report.atbGranted),
      mpGranted: Math.floor(fighter.report.mpGranted),
      skillUses: { ...fighter.report.skillUses },
      statusApplications: { ...fighter.report.statusApplications },
      skillBreakdown: Object.fromEntries(
        Object.entries(fighter.report.skillBreakdown).map(([skillId, contribution]) => [
          skillId,
          {
            ...contribution,
            damage: Math.floor(contribution.damage),
            healing: Math.floor(contribution.healing),
            shielding: Math.floor(contribution.shielding),
            atb: Math.floor(contribution.atb),
            mp: Math.floor(contribution.mp),
          },
        ]),
      ),
    })),
  };
}
