import { inheritanceSkillChoices } from './breeding';
import { battleStatsFor, definitionFor, targetRulesForSkill } from './monster';
import { createSeededRandom, deriveSeed } from './rng';
import {
  applyBattleResult,
  breedInRun,
  breedingCandidatesForRun,
  buyEquipment,
  buyMonster,
  chooseDraftMonster,
  chooseEvent,
  continueEvent,
  continueRun,
  createCasualRun,
  equipItem,
  eventIsAvailable,
  moveMonsterToPartySlot,
  rerollShop,
  sellMonster,
  updateGambit,
} from './run';
import type { BattleResult, CasualRunState, GameData, GambitCondition, MonsterInstance, TargetRule } from './types';

export type RivalAudit = {
  monsterPurchases: number;
  equipmentPurchases: number;
  rerolls: number;
  events: number;
  breeds: number;
  coinsSpent: number;
  breedKinds: Record<string, number>;
  eventSelections: Record<string, number>;
};

export type RivalBuild = {
  run: CasualRunState;
  team: MonsterInstance[];
  audit: RivalAudit;
};

const emptyAudit = (): RivalAudit => ({
  monsterPurchases: 0,
  equipmentPurchases: 0,
  rerolls: 0,
  events: 0,
  breeds: 0,
  coinsSpent: 0,
  breedKinds: {},
  eventSelections: {},
});

const monsterPower = (data: GameData, monster: MonsterInstance) => {
  const definition = definitionFor(data, monster);
  const stats = battleStatsFor(data, monster);
  return (
    stats.maxHp * 0.3 +
    stats.maxMp * 0.4 +
    stats.attack * 2 +
    stats.defense * 1.5 +
    stats.speed * 1.8 +
    stats.wisdom * 2 +
    stats.crit +
    definition.whiteStars * 35 +
    monster.colorStars * 25
  );
};

const chooseDraft = (data: GameData, run: CasualRunState, random: ReturnType<typeof createSeededRandom>) => {
  const anchor = run.roster[0] ? definitionFor(data, run.roster[0]) : undefined;
  const ranked = run.draftChoices
    .map((id) => data.monsters.find((monster) => monster.id === id))
    .filter((monster): monster is NonNullable<typeof monster> => Boolean(monster))
    .map((monster) => ({
      monster,
      score:
        random.next() * 5 +
        (anchor?.lineageId === monster.lineageId ? 18 : 0) +
        (anchor?.attributeId === monster.attributeId ? 12 : 0),
    }))
    .sort((left, right) => right.score - left.score);
  return ranked[0]?.monster.id ?? run.draftChoices[0];
};

const bestBreedingPlan = (data: GameData, run: CasualRunState) => {
  if (run.roster.length <= data.rules.activeLimit) return undefined;
  const plans = run.roster.flatMap((first, firstIndex) =>
    run.roster.slice(firstIndex + 1).flatMap((second) =>
      breedingCandidatesForRun(data, run, first.id, second.id).map((candidate) => ({
        first,
        second,
        candidate,
        score:
          ({ special: 400, 'egg-upgrade': 360, 'same-name': 320, generic: 200 }[candidate.kind] ?? 0) +
          (data.monsters.find((monster) => monster.id === candidate.definitionId)?.whiteStars ?? 1) * 45 +
          candidate.colorStars * 30,
      })),
    ),
  );
  return plans;
};

type BreedingPreference = 'rank' | 'color' | 'discovery';

const breedOnce = (data: GameData, run: CasualRunState, audit: RivalAudit, preference: BreedingPreference) => {
  const plans = bestBreedingPlan(data, run);
  const preferenceScore: Record<BreedingPreference, Record<string, number>> = {
    rank: { special: 650, 'egg-upgrade': 620, generic: 520, 'same-name': 180 },
    color: { special: 620, 'egg-upgrade': 180, generic: 240, 'same-name': 560 },
    discovery: { special: 800, 'egg-upgrade': 500, generic: 440, 'same-name': 300 },
  };
  const plan = plans?.sort(
    (left, right) =>
      right.score +
      (preferenceScore[preference][right.candidate.kind] ?? 0) -
      (left.score + (preferenceScore[preference][left.candidate.kind] ?? 0)),
  )[0];
  if (!plan) return run;
  const skillId = inheritanceSkillChoices(data, plan.first, plan.second, plan.candidate).sort((left, right) => {
    const leftSkill = data.skills.find((skill) => skill.id === left);
    const rightSkill = data.skills.find((skill) => skill.id === right);
    const value = (skill: typeof leftSkill) =>
      (skill?.effects.some((effect) => effect.kind === 'heal' || effect.kind === 'shield') ? 10 : 0) -
      (skill?.mpCost ?? 0) * 0.1;
    return value(rightSkill) - value(leftSkill);
  })[0];
  const result = breedInRun(data, run, plan.first.id, plan.second.id, plan.candidate.id, skillId);
  if (!result.ok) return run;
  audit.breeds += 1;
  audit.breedKinds[plan.candidate.kind] = (audit.breedKinds[plan.candidate.kind] ?? 0) + 1;
  return result.state;
};

const offerScore = (data: GameData, run: CasualRunState, definitionId: string) => {
  const definition = data.monsters.find((monster) => monster.id === definitionId);
  if (!definition) return -1;
  const ownedDefinitions = run.roster.map((monster) => definitionFor(data, monster));
  return (
    (ownedDefinitions.some((owned) => owned.id === definition.id) ? 90 : 0) +
    ownedDefinitions.filter((owned) => owned.archetypeId === definition.archetypeId).length * 22 +
    ownedDefinitions.filter((owned) => owned.lineageId === definition.lineageId).length * 7 +
    ownedDefinitions.filter((owned) => owned.attributeId === definition.attributeId).length * 5 +
    definition.whiteStars * 15
  );
};

const buyBestMonster = (
  data: GameData,
  run: CasualRunState,
  audit: RivalAudit,
  preference: BreedingPreference,
  allowBreed: boolean,
) => {
  if (!run.shop) return run;
  let prepared = run;
  if (allowBreed && prepared.roster.length >= data.rules.rosterLimit) {
    prepared = breedOnce(data, prepared, audit, preference);
  }
  if (prepared.roster.length >= data.rules.rosterLimit) {
    const bench = prepared.roster
      .filter((monster) => !prepared.activeIds.includes(monster.id))
      .sort((left, right) => monsterPower(data, left) - monsterPower(data, right))[0];
    if (bench) {
      const sold = sellMonster(data, prepared, bench.id);
      if (sold.ok) prepared = sold.state;
    }
  }
  if (!prepared.shop || prepared.roster.length >= data.rules.rosterLimit) return prepared;
  const offer = prepared.shop.monsters
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .map((entry) => ({
      entry,
      definition: data.monsters.find((monster) => monster.id === entry.definitionId),
      score: offerScore(data, prepared, entry.definitionId),
    }))
    .filter((entry) => entry.definition && entry.definition.price <= prepared.coins)
    .sort((left, right) => right.score - left.score)[0];
  if (!offer?.definition) return prepared;
  const beforeCoins = prepared.coins;
  const bought = buyMonster(data, prepared, offer.entry.id);
  if (!bought.ok) return prepared;
  audit.monsterPurchases += 1;
  audit.coinsSpent += beforeCoins - bought.state.coins;
  return bought.state;
};

const buyUsefulEquipment = (data: GameData, run: CasualRunState, audit: RivalAudit) => {
  if (!run.shop) return run;
  const ownedCount =
    run.equipmentInventory.length + run.roster.filter((monster) => Boolean(monster.equipmentId)).length;
  if (ownedCount >= data.rules.activeLimit) return run;
  const offer = run.shop.equipment
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .map((entry) => ({
      entry,
      equipment: data.equipment.find((equipment) => equipment.id === entry.equipmentId),
    }))
    .filter((entry) => entry.equipment && entry.equipment.price <= run.coins)
    .sort((left, right) => (right.equipment?.price ?? 0) - (left.equipment?.price ?? 0))[0];
  if (!offer?.equipment) return run;
  const beforeCoins = run.coins;
  const bought = buyEquipment(data, run, offer.entry.id);
  if (!bought.ok) return run;
  audit.equipmentPurchases += 1;
  audit.coinsSpent += beforeCoins - bought.state.coins;
  return bought.state;
};

const selectActiveTeam = (data: GameData, run: CasualRunState) => {
  const preferred = [...run.roster]
    .sort((left, right) => monsterPower(data, right) - monsterPower(data, left))
    .slice(0, data.rules.activeLimit)
    .map((monster) => monster.id);
  let next = { ...run, activeIds: [...preferred] };
  for (const [index, monsterId] of preferred.entries()) {
    const moved = moveMonsterToPartySlot(data, next, monsterId, 'active', index);
    if (moved.ok) next = moved.state;
  }
  return next;
};

const targetForSkill = (data: GameData, skillId: string): TargetRule => {
  const skill = data.skills.find((entry) => entry.id === skillId);
  if (!skill) return 'random-enemy';
  return (
    targetRulesForSkill(data, skillId)[0] ??
    (skill.targetScope.includes('allies') || skill.targetScope === 'single-ally' ? 'lowest-hp-ally' : 'random-enemy')
  );
};

const conditionForSkill = (data: GameData, skillId: string): GambitCondition => {
  const skill = data.skills.find((entry) => entry.id === skillId);
  return skill?.targetScope.includes('all') || skill?.targetScope === 'single-ally'
    ? { kind: 'ally-hp-below', threshold: 75 }
    : { kind: 'always' };
};

const equipAndProgram = (data: GameData, run: CasualRunState) => {
  let next = run;
  for (const monsterId of next.activeIds) {
    const monster = next.roster.find((entry) => entry.id === monsterId);
    if (!monster) continue;
    if (!monster.equipmentId && next.equipmentInventory[0]) {
      const equipped = equipItem(data, next, monster.id, next.equipmentInventory[0]);
      if (equipped.ok) next = equipped.state;
    }
    const current = next.roster.find((entry) => entry.id === monsterId);
    if (!current?.inheritedSkillId) continue;
    next = updateGambit(next, current.id, 2, {
      condition: conditionForSkill(data, current.inheritedSkillId),
      action: {
        skillId: current.inheritedSkillId,
        target: targetForSkill(data, current.inheritedSkillId),
      },
    });
  }
  return next;
};

const prepareRival = (
  data: GameData,
  run: CasualRunState,
  audit: RivalAudit,
  random: ReturnType<typeof createSeededRandom>,
  preference: BreedingPreference,
) => {
  const breedsBeforePreparation = audit.breeds;
  let next = breedOnce(data, run, audit, preference);
  next = buyBestMonster(data, next, audit, preference, audit.breeds === breedsBeforePreparation);
  if (next.cycle >= 2) next = buyUsefulEquipment(data, next, audit);
  if (next.shop && (next.freeRerolls > 0 || next.coins >= 8) && random.next() < 0.72) {
    const beforeCoins = next.coins;
    const rerolled = rerollShop(data, next);
    if (rerolled.ok) {
      next = rerolled.state;
      audit.rerolls += 1;
      audit.coinsSpent += beforeCoins - next.coins;
      next = buyBestMonster(data, next, audit, preference, audit.breeds === breedsBeforePreparation);
    }
  }
  next = selectActiveTeam(data, next);
  return equipAndProgram(data, next);
};

const priorBattleResult = (won: boolean): BattleResult => ({
  winner: won ? 'player' : 'enemy',
  durationSeconds: 0,
  frames: [],
  damageByTeam: { player: 0, enemy: 0 },
  monsterReports: [],
});

const resolveRivalEvent = (data: GameData, run: CasualRunState, audit: RivalAudit) => {
  if (run.phase !== 'event') return run;
  const targetId = run.activeIds[0] ?? run.roster[0]?.id;
  const event = run.eventChoices
    .map((eventId) => data.events.find((entry) => entry.id === eventId))
    .find((entry) => entry && eventIsAvailable(entry, run));
  if (!event) return { ...run, phase: 'prepare' as const, eventChoices: [] };
  audit.events += 1;
  audit.eventSelections[event.id] = (audit.eventSelections[event.id] ?? 0) + 1;
  return continueEvent(chooseEvent(data, run, event.id, targetId));
};

const namespaceRun = (run: CasualRunState, seed: number) => {
  const ids = new Map(run.roster.map((monster) => [monster.id, `rival-${seed}-${monster.id}`]));
  return {
    ...run,
    roster: run.roster.map((monster) => ({ ...monster, id: ids.get(monster.id) ?? monster.id })),
    activeIds: run.activeIds.map((id) => ids.get(id) ?? id),
    eventResolution: run.eventResolution?.targetMonsterId
      ? {
          ...run.eventResolution,
          targetMonsterId: ids.get(run.eventResolution.targetMonsterId) ?? run.eventResolution.targetMonsterId,
        }
      : run.eventResolution,
  };
};

const buildRivalJourney = (data: GameData, maximumCycle: number, seed: number) => {
  const random = createSeededRandom(deriveSeed(seed, 991));
  const preferenceRoll = createSeededRandom(deriveSeed(seed, 992)).next();
  const preference: BreedingPreference = preferenceRoll < 0.4 ? 'rank' : preferenceRoll < 0.75 ? 'color' : 'discovery';
  const audit = emptyAudit();
  let run = createCasualRun(data, deriveSeed(seed, 41));
  const builds: RivalBuild[] = [];
  while (run.phase === 'draft') {
    const choice = chooseDraft(data, run, random);
    if (!choice) throw new Error('Rival draft did not produce a legal choice');
    run = chooseDraftMonster(data, run, choice);
  }

  while (run.phase !== 'finished') {
    run = resolveRivalEvent(data, run, audit);
    if (run.phase !== 'prepare') break;
    run = prepareRival(data, run, audit, random, preference);
    const namespacedRun = namespaceRun(run, seed);
    const team = namespacedRun.activeIds.flatMap((id) => {
      const monster = namespacedRun.roster.find((entry) => entry.id === id);
      return monster ? [monster] : [];
    });
    if (team.length !== data.rules.activeLimit) {
      throw new Error(`Rival run produced ${team.length} active monsters at cycle ${run.cycle}`);
    }
    builds.push({
      run: namespacedRun,
      team,
      audit: {
        ...audit,
        breedKinds: { ...audit.breedKinds },
        eventSelections: { ...audit.eventSelections },
      },
    });
    if (run.cycle >= maximumCycle) break;
    const won = run.losses >= data.rules.maxLosses - 1 || random.next() >= 0.34;
    run = continueRun(data, applyBattleResult(data, run, priorBattleResult(won)));
  }
  return builds;
};

export const createRivalJourney = (data: GameData, seed: number): RivalBuild[] =>
  buildRivalJourney(data, data.rules.maxCycles, seed);

export function createRivalBuild(data: GameData, cycle: number, seed: number): RivalBuild {
  const targetCycle = Math.max(1, Math.min(data.rules.maxCycles, Math.floor(cycle)));
  const builds = buildRivalJourney(data, targetCycle, seed);
  const build = builds[targetCycle - 1];
  if (!build) throw new Error(`Rival journey did not reach cycle ${targetCycle}`);
  return build;
}
