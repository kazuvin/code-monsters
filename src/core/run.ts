import { breedMonsters, listBreedingCandidates } from './breeding';
import { gainMonsterXp, setMonsterGambit } from './monster';
import { deriveSeed, createSeededRandom } from './rng';
import { createShop } from './shop';
import type { BattleResult, BreedingCandidate, CasualRunState, CommandResult, GameData, GambitRule } from './types';
import { createMonster } from './monster';

const draftChoicesFor = (data: GameData, seed: number, round: number) => {
  const random = createSeededRandom(deriveSeed(seed, round + 1));
  return random
    .shuffle(data.monsters.filter((monster) => monster.whiteStars === 1))
    .slice(0, 3)
    .map((monster) => monster.id);
};

const nextShopSeed = (run: CasualRunState) => deriveSeed(run.seed, 1000 + run.commandIndex + run.cycle * 31);

export function createCasualRun(data: GameData, seed: number): CasualRunState {
  return {
    schemaVersion: 1,
    mode: 'casual',
    seed,
    commandIndex: 0,
    phase: 'draft',
    cycle: 1,
    completedCycles: 0,
    wins: 0,
    losses: 0,
    coins: 0,
    roster: [],
    activeIds: [],
    equipmentInventory: [],
    shop: null,
    draftRound: 1,
    draftChoices: draftChoicesFor(data, seed, 1),
    eventChoices: [],
  };
}

export function chooseDraftMonster(data: GameData, run: CasualRunState, definitionId: string): CasualRunState {
  if (run.phase !== 'draft' || !run.draftChoices.includes(definitionId)) return run;
  const commandIndex = run.commandIndex + 1;
  const monster = createMonster(data, definitionId, `monster-${commandIndex}`);
  const roster = [...run.roster, monster];
  const activeIds = [...run.activeIds, monster.id];
  if (run.draftRound < data.rules.activeLimit) {
    const draftRound = run.draftRound + 1;
    return {
      ...run,
      commandIndex,
      roster,
      activeIds,
      draftRound,
      draftChoices: draftChoicesFor(data, run.seed, draftRound),
    };
  }
  const prepared = {
    ...run,
    commandIndex,
    roster,
    activeIds,
    draftRound: data.rules.activeLimit,
    draftChoices: [],
    phase: 'prepare' as const,
    coins: data.rules.initialCoins,
  };
  return { ...prepared, shop: createShop(data, nextShopSeed(prepared)) };
}

const failure = <T>(state: T, error: string): CommandResult<T> => ({ ok: false, state, error });
const success = <T>(state: T): CommandResult<T> => ({ ok: true, state });

export function rerollShop(data: GameData, run: CasualRunState): CommandResult<CasualRunState> {
  if (run.phase !== 'prepare' || !run.shop) return failure(run, '今はショップを更新できません');
  if (run.coins < data.rules.shop.rerollCost) return failure(run, 'コインが足りません');
  const updated = {
    ...run,
    commandIndex: run.commandIndex + 1,
    coins: run.coins - data.rules.shop.rerollCost,
  };
  return success({ ...updated, shop: createShop(data, nextShopSeed(updated)) });
}

export function toggleShopFreeze(run: CasualRunState): CasualRunState {
  if (run.phase !== 'prepare' || !run.shop) return run;
  return {
    ...run,
    commandIndex: run.commandIndex + 1,
    shop: { ...run.shop, frozen: !run.shop.frozen },
  };
}

export function buyMonster(data: GameData, run: CasualRunState, offerId: string): CommandResult<CasualRunState> {
  if (run.phase !== 'prepare' || !run.shop) return failure(run, '今は購入できません');
  if (run.roster.length >= data.rules.rosterLimit) return failure(run, '仲間枠が満杯です');
  const offerIndex = run.shop.monsters.findIndex((offer) => offer?.id === offerId);
  const offer = run.shop.monsters[offerIndex];
  if (!offer) return failure(run, 'その商品はありません');
  const definition = data.monsters.find((monster) => monster.id === offer.definitionId);
  if (!definition) return failure(run, 'モンスターデータが見つかりません');
  if (run.coins < definition.price) return failure(run, 'コインが足りません');
  const commandIndex = run.commandIndex + 1;
  const monster = createMonster(data, definition.id, `monster-${commandIndex}`);
  const monsters = [...run.shop.monsters];
  monsters[offerIndex] = null;
  return success({
    ...run,
    commandIndex,
    coins: run.coins - definition.price,
    roster: [...run.roster, monster],
    activeIds: run.activeIds.length < data.rules.activeLimit ? [...run.activeIds, monster.id] : run.activeIds,
    shop: { ...run.shop, monsters },
  });
}

export function buyEquipment(data: GameData, run: CasualRunState, offerId: string): CommandResult<CasualRunState> {
  if (run.phase !== 'prepare' || !run.shop) return failure(run, '今は購入できません');
  if (run.equipmentInventory.length >= 6) return failure(run, '装備庫が満杯です');
  const offerIndex = run.shop.equipment.findIndex((offer) => offer?.id === offerId);
  const offer = run.shop.equipment[offerIndex];
  if (!offer) return failure(run, 'その商品はありません');
  const equipment = data.equipment.find((entry) => entry.id === offer.equipmentId);
  if (!equipment) return failure(run, '装備データが見つかりません');
  if (run.coins < equipment.price) return failure(run, 'コインが足りません');
  const offers = [...run.shop.equipment];
  offers[offerIndex] = null;
  return success({
    ...run,
    commandIndex: run.commandIndex + 1,
    coins: run.coins - equipment.price,
    equipmentInventory: [...run.equipmentInventory, equipment.id],
    shop: { ...run.shop, equipment: offers },
  });
}

export function sellMonster(data: GameData, run: CasualRunState, monsterId: string): CommandResult<CasualRunState> {
  if (run.phase !== 'prepare') return failure(run, '今は別れられません');
  if (run.roster.length <= data.rules.activeLimit) return failure(run, '3体より少なくはできません');
  const monster = run.roster.find((entry) => entry.id === monsterId);
  if (!monster) return failure(run, '仲間が見つかりません');
  const definition = data.monsters.find((entry) => entry.id === monster.definitionId);
  if (!definition) return failure(run, 'モンスターデータが見つかりません');
  return success({
    ...run,
    commandIndex: run.commandIndex + 1,
    coins: run.coins + definition.sellPrice + monster.colorStars,
    roster: run.roster.filter((entry) => entry.id !== monsterId),
    activeIds: run.activeIds.filter((id) => id !== monsterId),
    equipmentInventory: monster.equipmentId ? [...run.equipmentInventory, monster.equipmentId] : run.equipmentInventory,
  });
}

export function toggleActiveMonster(
  data: GameData,
  run: CasualRunState,
  monsterId: string,
): CommandResult<CasualRunState> {
  if (!run.roster.some((monster) => monster.id === monsterId)) return failure(run, '仲間が見つかりません');
  if (run.activeIds.includes(monsterId)) {
    return success({
      ...run,
      commandIndex: run.commandIndex + 1,
      activeIds: run.activeIds.filter((id) => id !== monsterId),
    });
  }
  if (run.activeIds.length >= data.rules.activeLimit) return failure(run, '先に主力から1体外してください');
  return success({
    ...run,
    commandIndex: run.commandIndex + 1,
    activeIds: [...run.activeIds, monsterId],
  });
}

export type PartyZone = 'active' | 'bench';

export function moveMonsterToPartySlot(
  data: GameData,
  run: CasualRunState,
  monsterId: string,
  targetZone: PartyZone,
  targetIndex: number,
): CommandResult<CasualRunState> {
  if (!run.roster.some((monster) => monster.id === monsterId)) return failure(run, '仲間が見つかりません');
  const activeIds = [...run.activeIds];
  const benchIds = run.roster.filter((monster) => !activeIds.includes(monster.id)).map((monster) => monster.id);
  const sourceZone: PartyZone = activeIds.includes(monsterId) ? 'active' : 'bench';
  const source = sourceZone === 'active' ? activeIds : benchIds;
  const target = targetZone === 'active' ? activeIds : benchIds;
  const sourceIndex = source.indexOf(monsterId);
  if (sourceIndex < 0) return failure(run, '移動元が見つかりません');

  if (sourceZone === targetZone) {
    source.splice(sourceIndex, 1);
    source.splice(Math.max(0, Math.min(targetIndex, source.length)), 0, monsterId);
  } else {
    const targetLimit = targetZone === 'active' ? data.rules.activeLimit : data.rules.benchLimit;
    const boundedTargetIndex = Math.max(0, Math.min(targetIndex, Math.max(0, target.length - 1)));
    if (target.length >= targetLimit) {
      const displacedId = target[boundedTargetIndex];
      if (!displacedId) return failure(run, '交換先が見つかりません');
      target[boundedTargetIndex] = monsterId;
      source[sourceIndex] = displacedId;
    } else {
      source.splice(sourceIndex, 1);
      target.splice(Math.max(0, Math.min(targetIndex, target.length)), 0, monsterId);
    }
  }

  const monsterById = new Map(run.roster.map((monster) => [monster.id, monster]));
  const orderedRoster = [...activeIds, ...benchIds].flatMap((id) => {
    const monster = monsterById.get(id);
    return monster ? [monster] : [];
  });
  return success({
    ...run,
    commandIndex: run.commandIndex + 1,
    roster: orderedRoster,
    activeIds,
  });
}

export function equipItem(
  data: GameData,
  run: CasualRunState,
  monsterId: string,
  equipmentId?: string,
): CommandResult<CasualRunState> {
  const monster = run.roster.find((entry) => entry.id === monsterId);
  if (!monster) return failure(run, '仲間が見つかりません');
  if (equipmentId && !run.equipmentInventory.includes(equipmentId)) {
    return failure(run, '装備庫にありません');
  }
  const inventory = [...run.equipmentInventory];
  if (equipmentId) inventory.splice(inventory.indexOf(equipmentId), 1);
  if (monster.equipmentId) inventory.push(monster.equipmentId);
  return success({
    ...run,
    commandIndex: run.commandIndex + 1,
    equipmentInventory: inventory,
    roster: run.roster.map((entry) => (entry.id === monsterId ? { ...entry, equipmentId } : entry)),
  });
}

export function updateGambit(
  run: CasualRunState,
  monsterId: string,
  index: 0 | 1 | 2,
  gambit: GambitRule,
): CasualRunState {
  return {
    ...run,
    commandIndex: run.commandIndex + 1,
    roster: run.roster.map((monster) =>
      monster.id === monsterId ? setMonsterGambit(monster, index, gambit) : monster,
    ),
  };
}

export function breedInRun(
  data: GameData,
  run: CasualRunState,
  firstId: string,
  secondId: string,
  candidateId: string,
  inheritedSkillId?: string,
): CommandResult<CasualRunState> {
  if (run.phase !== 'prepare') return failure(run, '今は配合できません');
  if (firstId === secondId) return failure(run, '異なる2体を選んでください');
  const first = run.roster.find((monster) => monster.id === firstId);
  const second = run.roster.find((monster) => monster.id === secondId);
  if (!first || !second) return failure(run, '親モンスターが見つかりません');
  if (first.level < data.rules.breeding.minimumLevel || second.level < data.rules.breeding.minimumLevel) {
    return failure(run, `配合にはレベル${data.rules.breeding.minimumLevel}が必要です`);
  }
  const candidate = listBreedingCandidates(data, first, second).find((entry) => entry.id === candidateId);
  if (!candidate) return failure(run, '配合先候補が見つかりません');
  const commandIndex = run.commandIndex + 1;
  let child;
  try {
    child = breedMonsters(data, first, second, candidate, inheritedSkillId, `monster-${commandIndex}`);
  } catch (error) {
    return failure(run, error instanceof Error ? error.message : '配合に失敗しました');
  }
  const parentIds = new Set([firstId, secondId]);
  const parentWasActive = run.activeIds.some((id) => parentIds.has(id));
  const equipmentInventory = [
    ...run.equipmentInventory,
    ...[first.equipmentId, second.equipmentId].filter((id): id is string => Boolean(id)),
  ];
  const activeIds = run.activeIds.filter((id) => !parentIds.has(id));
  if (parentWasActive && activeIds.length < data.rules.activeLimit) activeIds.push(child.id);
  return success({
    ...run,
    commandIndex,
    coins: run.coins + data.rules.breedingCoinBonus,
    roster: [...run.roster.filter((monster) => !parentIds.has(monster.id)), child],
    activeIds,
    equipmentInventory,
  });
}

const xpForCycle = (data: GameData, cycle: number, won: boolean) => {
  const band = Math.min(3, Math.floor((cycle - 1) / 3));
  return (data.rules.activeXpByCycleBand[band] ?? 4) + (won ? data.rules.battleWinXp : 0);
};

export function applyBattleResult(data: GameData, run: CasualRunState, result: BattleResult): CasualRunState {
  if (run.phase !== 'prepare') return run;
  const won = result.winner === 'player';
  const activeXp = xpForCycle(data, run.cycle, won);
  const benchXp = Math.floor(activeXp * data.rules.benchXpRate);
  return {
    ...run,
    commandIndex: run.commandIndex + 1,
    phase: 'result',
    completedCycles: run.completedCycles + 1,
    wins: run.wins + (won ? 1 : 0),
    losses: run.losses + (result.winner === 'enemy' ? 1 : 0),
    roster: run.roster.map((monster) =>
      gainMonsterXp(data, monster, run.activeIds.includes(monster.id) ? activeXp : benchXp),
    ),
    lastBattle: result,
  };
}

const newCycleState = (data: GameData, run: CasualRunState): CasualRunState => {
  const commandIndex = run.commandIndex + 1;
  const retainedShop = run.shop?.frozen
    ? { ...run.shop, frozen: false }
    : createShop(data, deriveSeed(run.seed, 1000 + commandIndex + (run.cycle + 1) * 31));
  const nextCycle = run.cycle + 1;
  const eventCycle = data.rules.eventCycles.includes(nextCycle);
  const eventChoices = eventCycle
    ? createSeededRandom(deriveSeed(run.seed, nextCycle))
        .shuffle(data.events)
        .map((event) => event.id)
    : [];
  return {
    ...run,
    commandIndex,
    phase: eventCycle ? 'event' : 'prepare',
    cycle: nextCycle,
    coins: run.coins + data.rules.cycleIncome,
    shop: retainedShop,
    eventChoices,
  };
};

export function continueRun(data: GameData, run: CasualRunState): CasualRunState {
  if (run.phase !== 'result') return run;
  if (run.losses >= data.rules.maxLosses || run.completedCycles >= data.rules.maxCycles) {
    return { ...run, commandIndex: run.commandIndex + 1, phase: 'finished' };
  }
  return newCycleState(data, run);
}

export function chooseEvent(data: GameData, run: CasualRunState, eventId: string): CasualRunState {
  if (run.phase !== 'event' || !run.eventChoices.includes(eventId)) return run;
  const event = data.events.find((entry) => entry.id === eventId);
  if (!event) return run;
  if (event.effect.kind === 'coins') {
    return {
      ...run,
      commandIndex: run.commandIndex + 1,
      phase: 'prepare',
      coins: run.coins + event.effect.amount,
      eventChoices: [],
    };
  }
  return {
    ...run,
    commandIndex: run.commandIndex + 1,
    phase: 'prepare',
    roster: run.roster.map((monster) => gainMonsterXp(data, monster, event.effect.amount)),
    eventChoices: [],
  };
}

export function skipEvent(_data: GameData, run: CasualRunState): CasualRunState {
  if (run.phase !== 'event') return run;
  return { ...run, commandIndex: run.commandIndex + 1, phase: 'prepare', eventChoices: [] };
}

export const breedingCandidatesForRun = (
  data: GameData,
  run: CasualRunState,
  firstId: string,
  secondId: string,
): BreedingCandidate[] => {
  const first = run.roster.find((monster) => monster.id === firstId);
  const second = run.roster.find((monster) => monster.id === secondId);
  return first && second ? listBreedingCandidates(data, first, second) : [];
};
