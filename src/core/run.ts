import { breedMonsters, listBreedingCandidates } from './breeding';
import {
  definitionFor,
  farewellCoinsFor,
  gainMonsterXp,
  MAX_GAMBIT_RULES,
  MIN_GAMBIT_RULES,
  replaceMonsterGambits,
  setMonsterGambit,
  skillIdsFor,
} from './monster';
import { deriveSeed, createSeededRandom } from './rng';
import { createShop, pickEquipmentByRarity } from './shop';
import type {
  BattleResult,
  BattleRunRewards,
  BreedingCandidate,
  CasualRunState,
  CommandResult,
  EggHatchResult,
  GameData,
  GambitRule,
  MonsterInstance,
  RunCommandPayload,
  WhiteStars,
} from './types';
import { createMonster } from './monster';

const draftChoicesFor = (data: GameData, seed: number, round: number) => {
  const random = createSeededRandom(deriveSeed(seed, round + 1));
  return random
    .shuffle(data.monsters.filter((monster) => monster.shopAvailability === 'common' && monster.whiteStars === 1))
    .slice(0, 3)
    .map((monster) => monster.id);
};

const nextShopSeed = (run: CasualRunState) => deriveSeed(run.seed, 1000 + run.commandIndex + run.cycle * 31);
const shopChanceFor = (data: GameData, run: CasualRunState) => data.rules.shop.luckyUpgradeChance + run.shopLuckBonus;
const commandUpdate = (run: CasualRunState, index: number, command: RunCommandPayload) => ({
  commandIndex: index,
  commandLog: [
    ...run.commandLog,
    {
      schemaVersion: 1 as const,
      index,
      cycle: run.cycle,
      phase: run.phase,
      ...command,
    },
  ],
});

export function createCasualRun(data: GameData, seed: number): CasualRunState {
  return {
    schemaVersion: 4,
    mode: 'casual',
    contentVersion: data.rules.contentVersion,
    commandLogVersion: 1,
    commandLog: [],
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
    shopLuckBonus: 0,
    freeRerolls: 0,
  };
}

export function createOnlineRun(data: GameData, seed: number): CasualRunState {
  return { ...createCasualRun(data, seed), mode: 'online' };
}

export function chooseDraftMonster(data: GameData, run: CasualRunState, definitionId: string): CasualRunState {
  if (run.phase !== 'draft' || !run.draftChoices.includes(definitionId)) return run;
  const commandIndex = run.commandIndex + 1;
  const monster = createMonster(data, definitionId, `monster-${commandIndex}`);
  const roster = [...run.roster, monster];
  const activeIds = [...run.activeIds, monster.id];
  const command = commandUpdate(run, commandIndex, {
    kind: 'draft-monster',
    definitionId,
    monsterId: monster.id,
  });
  if (run.draftRound < data.rules.activeLimit) {
    const draftRound = run.draftRound + 1;
    return {
      ...run,
      ...command,
      roster,
      activeIds,
      draftRound,
      draftChoices: draftChoicesFor(data, run.seed, draftRound),
    };
  }
  const prepared = {
    ...run,
    ...command,
    roster,
    activeIds,
    draftRound: data.rules.activeLimit,
    draftChoices: [],
    phase: 'prepare' as const,
    coins: data.rules.initialCoins,
  };
  return { ...prepared, shop: createShop(data, nextShopSeed(prepared), shopChanceFor(data, prepared)) };
}

const failure = <T>(state: T, error: string): CommandResult<T> => ({ ok: false, state, error });
const success = <T>(state: T): CommandResult<T> => ({ ok: true, state });

export function rerollShop(data: GameData, run: CasualRunState): CommandResult<CasualRunState> {
  if (run.phase !== 'prepare' || !run.shop) return failure(run, '今はショップを更新できません');
  const usesFreeReroll = run.freeRerolls > 0;
  if (!usesFreeReroll && run.coins < data.rules.shop.rerollCost) return failure(run, 'コインが足りません');
  const cost = usesFreeReroll ? 0 : data.rules.shop.rerollCost;
  const commandIndex = run.commandIndex + 1;
  const updated = {
    ...run,
    ...commandUpdate(run, commandIndex, { kind: 'reroll-shop', cost, usedFreeReroll: usesFreeReroll }),
    coins: run.coins - cost,
    freeRerolls: Math.max(0, run.freeRerolls - (usesFreeReroll ? 1 : 0)),
  };
  return success({
    ...updated,
    shop: createShop(data, nextShopSeed(updated), shopChanceFor(data, updated)),
  });
}

export function toggleShopFreeze(run: CasualRunState): CasualRunState {
  if (run.phase !== 'prepare' || !run.shop) return run;
  const frozen = !run.shop.frozen;
  const commandIndex = run.commandIndex + 1;
  return {
    ...run,
    ...commandUpdate(run, commandIndex, { kind: 'freeze-shop', frozen }),
    shop: { ...run.shop, frozen },
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
  const monster = createMonster(data, definition.id, `monster-${commandIndex}`, {
    journeySeed: deriveSeed(run.seed, run.cycle * 10_000 + commandIndex),
  });
  const monsters = [...run.shop.monsters];
  monsters[offerIndex] = null;
  return success({
    ...run,
    ...commandUpdate(run, commandIndex, {
      kind: 'buy-monster',
      offerId,
      definitionId: definition.id,
      monsterId: monster.id,
      price: definition.price,
    }),
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
  const commandIndex = run.commandIndex + 1;
  return success({
    ...run,
    ...commandUpdate(run, commandIndex, {
      kind: 'buy-equipment',
      offerId,
      equipmentId: equipment.id,
      price: equipment.price,
    }),
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
  const commandIndex = run.commandIndex + 1;
  const coinsGained = farewellCoinsFor(data, monster);
  return success({
    ...run,
    ...commandUpdate(run, commandIndex, {
      kind: 'sell-monster',
      monsterId,
      definitionId: definition.id,
      coinsGained,
    }),
    coins: run.coins + coinsGained,
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
    const commandIndex = run.commandIndex + 1;
    return success({
      ...run,
      ...commandUpdate(run, commandIndex, { kind: 'toggle-active', monsterId, active: false }),
      activeIds: run.activeIds.filter((id) => id !== monsterId),
    });
  }
  if (run.activeIds.length >= data.rules.activeLimit) return failure(run, '先に主力から1体外してください');
  const commandIndex = run.commandIndex + 1;
  return success({
    ...run,
    ...commandUpdate(run, commandIndex, { kind: 'toggle-active', monsterId, active: true }),
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
  const commandIndex = run.commandIndex + 1;
  return success({
    ...run,
    ...commandUpdate(run, commandIndex, {
      kind: 'move-monster',
      monsterId,
      sourceZone,
      targetZone,
      targetIndex,
    }),
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
  const commandIndex = run.commandIndex + 1;
  return success({
    ...run,
    ...commandUpdate(run, commandIndex, {
      kind: 'change-equipment',
      monsterId,
      fromEquipmentId: monster.equipmentId,
      toEquipmentId: equipmentId,
    }),
    equipmentInventory: inventory,
    roster: run.roster.map((entry) => (entry.id === monsterId ? { ...entry, equipmentId } : entry)),
  });
}

export function updateGambit(
  run: CasualRunState,
  monsterId: string,
  index: number,
  gambit: GambitRule,
): CasualRunState {
  const monster = run.roster.find((entry) => entry.id === monsterId);
  if (!monster || index < 0 || index >= monster.gambits.length) return run;
  const commandIndex = run.commandIndex + 1;
  return {
    ...run,
    ...commandUpdate(run, commandIndex, { kind: 'change-gambit', monsterId, slot: index, gambit }),
    roster: run.roster.map((monster) =>
      monster.id === monsterId ? setMonsterGambit(monster, index, gambit) : monster,
    ),
  };
}

const replaceGambitsInRun = (run: CasualRunState, monsterId: string, gambits: GambitRule[]): CasualRunState => {
  const monster = run.roster.find((entry) => entry.id === monsterId);
  if (!monster) return run;
  const updated = replaceMonsterGambits(monster, gambits);
  if (updated === monster) return run;
  const commandIndex = run.commandIndex + 1;
  return {
    ...run,
    ...commandUpdate(run, commandIndex, {
      kind: 'replace-gambits',
      monsterId,
      gambits: updated.gambits,
    }),
    roster: run.roster.map((entry) => (entry.id === monsterId ? updated : entry)),
  };
};

export const addGambit = (
  run: CasualRunState,
  monsterId: string,
  gambit: GambitRule,
  index?: number,
): CasualRunState => {
  const monster = run.roster.find((entry) => entry.id === monsterId);
  if (!monster || monster.gambits.length >= MAX_GAMBIT_RULES) return run;
  const insertionIndex = Math.max(0, Math.min(monster.gambits.length, index ?? monster.gambits.length));
  const gambits = [...monster.gambits];
  gambits.splice(insertionIndex, 0, gambit);
  return replaceGambitsInRun(run, monsterId, gambits);
};

export const removeGambit = (run: CasualRunState, monsterId: string, index: number): CasualRunState => {
  const monster = run.roster.find((entry) => entry.id === monsterId);
  if (!monster || monster.gambits.length <= MIN_GAMBIT_RULES || index < 0 || index >= monster.gambits.length) {
    return run;
  }
  return replaceGambitsInRun(
    run,
    monsterId,
    monster.gambits.filter((_, ruleIndex) => ruleIndex !== index),
  );
};

export const moveGambit = (
  run: CasualRunState,
  monsterId: string,
  fromIndex: number,
  toIndex: number,
): CasualRunState => {
  const monster = run.roster.find((entry) => entry.id === monsterId);
  if (
    !monster ||
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= monster.gambits.length ||
    toIndex < 0 ||
    toIndex >= monster.gambits.length
  ) {
    return run;
  }
  const gambits = [...monster.gambits];
  const [moved] = gambits.splice(fromIndex, 1);
  if (!moved) return run;
  gambits.splice(toIndex, 0, moved);
  return replaceGambitsInRun(run, monsterId, gambits);
};

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
  const candidate = listBreedingCandidates(data, first, second).find((entry) => entry.id === candidateId);
  if (!candidate) return failure(run, '配合先候補が見つかりません');
  if (first.level < data.rules.breeding.minimumLevel || second.level < data.rules.breeding.minimumLevel) {
    return failure(run, `配合にはレベル${data.rules.breeding.minimumLevel}が必要です`);
  }
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
    ...commandUpdate(run, commandIndex, {
      kind: 'breed',
      firstParentId: firstId,
      secondParentId: secondId,
      candidateId,
      resultDefinitionId: child.definitionId,
      childId: child.id,
      inheritedSkillId,
    }),
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

const battleRunRewardsFor = (
  data: GameData,
  run: CasualRunState,
  result: BattleResult,
  activeXp: number,
  benchXp: number,
): BattleRunRewards => {
  let coins = 0;
  const rawXpByMonsterId: Record<string, number> = {};
  const damagingSkillIds = new Set([
    'normal-attack',
    ...data.skills.filter((skill) => skill.effects.some((effect) => effect.kind === 'damage')).map((skill) => skill.id),
  ]);
  for (const monster of run.roster) {
    const active = run.activeIds.includes(monster.id);
    const report = result.monsterReports.find((entry) => entry.id === monster.id && entry.team === 'player');
    const damageActions = report
      ? Object.entries(report.skillUses).reduce(
          (total, [usedSkillId, uses]) => total + (damagingSkillIds.has(usedSkillId) ? uses : 0),
          0,
        )
      : 1;
    for (const skillId of new Set(skillIdsFor(data, monster))) {
      const reward = data.skills.find((skill) => skill.id === skillId)?.runReward;
      if (!reward) continue;
      if (reward.kind === 'coins-per-damage-action' && active) {
        const triggers = Math.min(reward.maximumTriggersPerBattle, damageActions);
        coins += triggers * (reward.amountsByColorStars[monster.colorStars] ?? 0);
      }
      if (reward.kind === 'xp-per-damage-action' && active) {
        const triggers = Math.min(reward.maximumTriggersPerBattle, damageActions);
        const amount = triggers * (reward.amountsByColorStars[monster.colorStars] ?? 0);
        rawXpByMonsterId[monster.id] = (rawXpByMonsterId[monster.id] ?? 0) + amount;
      }
    }
    const definition = definitionFor(data, monster);
    const trait = data.traits.find((entry) => entry.id === definition.traitId);
    const aura = trait?.stages[monster.colorStars].postBattleXpAura;
    if (aura && (active || aura.activatesFromBench)) {
      const targetIds = aura.targets === 'roster' ? run.roster.map((entry) => entry.id) : run.activeIds;
      for (const targetId of targetIds) {
        rawXpByMonsterId[targetId] = (rawXpByMonsterId[targetId] ?? 0) + aura.amount;
      }
    }
  }
  return {
    coins,
    xpByMonsterId: Object.fromEntries(
      Object.entries(rawXpByMonsterId).flatMap(([monsterId, amount]) => {
        const baseXp = run.activeIds.includes(monsterId) ? activeXp : benchXp;
        const applied = Math.min(baseXp, amount);
        return applied > 0 ? [[monsterId, applied]] : [];
      }),
    ),
  };
};

export function applyBattleResult(data: GameData, run: CasualRunState, result: BattleResult): CasualRunState {
  if (run.phase !== 'prepare') return run;
  const won = result.winner === 'player';
  const activeXp = xpForCycle(data, run.cycle, won);
  const benchXp = Math.floor(activeXp * data.rules.benchXpRate);
  const rewards = battleRunRewardsFor(data, run, result, activeXp, benchXp);
  const rewardXp = Object.values(rewards.xpByMonsterId).reduce((total, amount) => total + amount, 0);
  const commandIndex = run.commandIndex + 1;
  return {
    ...run,
    ...commandUpdate(run, commandIndex, {
      kind: 'battle-complete',
      winner: result.winner,
      durationSeconds: result.durationSeconds,
      playerDamage: result.damageByTeam.player,
      enemyDamage: result.damageByTeam.enemy,
      rewardCoins: rewards.coins,
      rewardXp,
    }),
    phase: 'result',
    completedCycles: run.completedCycles + 1,
    wins: run.wins + (won ? 1 : 0),
    losses: run.losses + (result.winner === 'enemy' ? 1 : 0),
    coins: run.coins + rewards.coins,
    roster: run.roster.map((monster) =>
      gainMonsterXp(
        data,
        { ...monster, cyclesHeld: monster.cyclesHeld + 1 },
        (run.activeIds.includes(monster.id) ? activeXp : benchXp) + (rewards.xpByMonsterId[monster.id] ?? 0),
      ),
    ),
    lastBattle: result,
    lastBattleRewards: rewards,
    lastHatches: undefined,
  };
}

const hatchMonster = (
  data: GameData,
  egg: MonsterInstance,
): { monster: MonsterInstance; hatch: EggHatchResult } | undefined => {
  const eggDefinition = definitionFor(data, egg);
  const hatchRule = eggDefinition.hatch;
  if (!hatchRule || egg.cyclesHeld < hatchRule.afterHeldCycles) return undefined;
  const random = createSeededRandom(egg.journeySeed);
  const upgraded = random.next() < hatchRule.upgradeChance;
  const targetWhiteStars = Math.min(
    hatchRule.maximumWhiteStars,
    eggDefinition.whiteStars + (upgraded ? 1 : 0),
  ) as WhiteStars;
  const lineageGridIds = new Set(data.archetypes.map((archetype) => archetype.id));
  const candidates = data.monsters.filter(
    (monster) => lineageGridIds.has(monster.archetypeId) && monster.whiteStars === targetWhiteStars,
  );
  const resultDefinition = random.pick(candidates);
  return {
    monster: createMonster(data, resultDefinition.id, egg.id, {
      xp: egg.xp,
      equipmentId: egg.equipmentId,
      journeySeed: egg.journeySeed,
    }),
    hatch: {
      eggId: egg.id,
      eggDefinitionId: eggDefinition.id,
      resultDefinitionId: resultDefinition.id,
      fromWhiteStars: eggDefinition.whiteStars,
      toWhiteStars: resultDefinition.whiteStars,
    },
  };
};

const newCycleState = (data: GameData, run: CasualRunState): CasualRunState => {
  const commandIndex = run.commandIndex + 1;
  const retainedShop = run.shop?.frozen
    ? { ...run.shop, frozen: false }
    : createShop(data, deriveSeed(run.seed, 1000 + commandIndex + (run.cycle + 1) * 31), shopChanceFor(data, run));
  const nextCycle = run.cycle + 1;
  const eventCycle = data.rules.eventCycles.includes(nextCycle);
  const eventChoices = eventCycle
    ? createSeededRandom(deriveSeed(run.seed, nextCycle))
        .shuffle(data.events)
        .slice(0, 3)
        .map((event) => event.id)
    : [];
  const hatches: EggHatchResult[] = [];
  const roster = run.roster.map((monster) => {
    const result = hatchMonster(data, monster);
    if (!result) return monster;
    hatches.push(result.hatch);
    return result.monster;
  });
  return {
    ...run,
    ...commandUpdate(run, commandIndex, { kind: 'continue-cycle', nextCycle, hatches }),
    phase: eventCycle ? 'event' : 'prepare',
    cycle: nextCycle,
    coins: run.coins + data.rules.cycleIncome,
    roster,
    shop: retainedShop,
    eventChoices,
    eventResolution: undefined,
    lastBattleRewards: undefined,
    lastHatches: hatches,
  };
};

export function continueRun(data: GameData, run: CasualRunState): CasualRunState {
  if (run.phase !== 'result') return run;
  const reachedLossLimit = run.mode === 'casual' && run.losses >= data.rules.maxLosses;
  if (reachedLossLimit || run.completedCycles >= data.rules.maxCycles) {
    const commandIndex = run.commandIndex + 1;
    return {
      ...run,
      ...commandUpdate(run, commandIndex, {
        kind: 'finish-run',
        reason: reachedLossLimit ? 'max-losses' : 'max-cycles',
      }),
      phase: 'finished',
    };
  }
  return newCycleState(data, run);
}

export const eventRequiresTarget = (event: GameData['events'][number]) =>
  event.effect.kind === 'monster-xp' || event.effect.kind === 'gamble-monster-xp';

export const eventIsAvailable = (event: GameData['events'][number], run: CasualRunState) =>
  event.effect.kind !== 'gamble-coins' || run.coins >= event.effect.stake;

export function chooseEvent(
  data: GameData,
  run: CasualRunState,
  eventId: string,
  targetMonsterId?: string,
): CasualRunState {
  if (run.phase !== 'event' || !run.eventChoices.includes(eventId)) return run;
  const event = data.events.find((entry) => entry.id === eventId);
  if (!event) return run;
  if (!eventIsAvailable(event, run)) return run;
  const target =
    eventRequiresTarget(event) && targetMonsterId
      ? run.roster.find((monster) => monster.id === targetMonsterId)
      : undefined;
  if (eventRequiresTarget(event) && !target) return run;
  const finish = (
    next: CasualRunState,
    text: string,
    tone: NonNullable<CasualRunState['eventResolution']>['tone'] = 'gain',
  ): CasualRunState => {
    const commandIndex = run.commandIndex + 1;
    return {
      ...next,
      ...commandUpdate(run, commandIndex, {
        kind: 'choose-event',
        eventId,
        targetMonsterId: target?.id,
        tone,
      }),
      phase: 'event-result',
      eventChoices: [],
      eventResolution: {
        eventId,
        title: event.name,
        text,
        tone,
        targetMonsterId: target?.id,
      },
    };
  };

  switch (event.effect.kind) {
    case 'coins':
      return finish({ ...run, coins: run.coins + event.effect.amount }, `${event.effect.amount}コインを獲得した。`);
    case 'roster-xp': {
      const amount = event.effect.amount;
      return finish(
        { ...run, roster: run.roster.map((monster) => gainMonsterXp(data, monster, amount)) },
        `仲間全員が経験値を${amount}獲得した。`,
      );
    }
    case 'active-xp': {
      const amount = event.effect.amount;
      return finish(
        {
          ...run,
          roster: run.roster.map((monster) =>
            run.activeIds.includes(monster.id) ? gainMonsterXp(data, monster, amount) : monster,
          ),
        },
        `主力3体が経験値を${amount}獲得した。`,
      );
    }
    case 'monster-xp': {
      const amount = event.effect.amount;
      return finish(
        {
          ...run,
          roster: run.roster.map((monster) =>
            monster.id === target?.id ? gainMonsterXp(data, monster, amount) : monster,
          ),
        },
        `${target ? definitionFor(data, target).name : '選んだ仲間'}が経験値を${amount}獲得した。`,
      );
    }
    case 'shop-luck': {
      const shopLuckBonus = Math.min(0.48, run.shopLuckBonus + event.effect.amount);
      const next = {
        ...run,
        shopLuckBonus,
        shop: run.shop ? createShop(data, run.shop.seed, data.rules.shop.luckyUpgradeChance + shopLuckBonus) : run.shop,
      };
      return finish(next, `このランの⭐2出現率が${Math.round(event.effect.amount * 100)}ポイント上昇した。`);
    }
    case 'free-rerolls':
      return finish(
        { ...run, freeRerolls: run.freeRerolls + event.effect.amount },
        `ショップの無料更新を${event.effect.amount}回獲得した。`,
      );
    case 'equipment-gift': {
      const random = createSeededRandom(
        deriveSeed(run.seed, run.commandIndex * 109 + run.cycle * 1019 + data.events.indexOf(event)),
      );
      const available = data.equipment.filter((equipment) => !run.equipmentInventory.includes(equipment.id));
      const equipment = pickEquipmentByRarity(data, random, available.length > 0 ? available : data.equipment);
      if (run.equipmentInventory.length >= 6) {
        return finish({ ...run, coins: run.coins + 3 }, '装備庫が満杯だったため、代わりに3コインを受け取った。');
      }
      return finish(
        { ...run, equipmentInventory: [...run.equipmentInventory, equipment.id] },
        `${equipment.name}を装備庫へ加えた。`,
      );
    }
    case 'gamble-coins': {
      const random = createSeededRandom(
        deriveSeed(run.seed, run.commandIndex * 101 + run.cycle * 1009 + data.events.indexOf(event)),
      );
      const won = random.next() < event.effect.winChance;
      const coins = run.coins - event.effect.stake + (won ? event.effect.reward : 0);
      return finish(
        { ...run, coins },
        won
          ? `${event.effect.stake}コインを賭け、${event.effect.reward}コインを獲得した。`
          : `${event.effect.stake}コインを賭けたが、今回は戻らなかった。`,
        won ? 'gain' : 'loss',
      );
    }
    case 'gamble-monster-xp': {
      const random = createSeededRandom(
        deriveSeed(run.seed, run.commandIndex * 107 + run.cycle * 1013 + data.events.indexOf(event)),
      );
      const won = random.next() < event.effect.winChance;
      const amount = won ? event.effect.successAmount : event.effect.consolationAmount;
      return finish(
        {
          ...run,
          roster: run.roster.map((monster) =>
            monster.id === target?.id ? gainMonsterXp(data, monster, amount) : monster,
          ),
        },
        `${target ? definitionFor(data, target).name : '選んだ仲間'}は経験値を${amount}獲得した。`,
        won ? 'gain' : 'risk',
      );
    }
  }
}

export function skipEvent(_data: GameData, run: CasualRunState): CasualRunState {
  if (run.phase !== 'event') return run;
  const commandIndex = run.commandIndex + 1;
  return {
    ...run,
    ...commandUpdate(run, commandIndex, { kind: 'skip-event' }),
    phase: 'prepare',
    eventChoices: [],
  };
}

export function continueEvent(run: CasualRunState): CasualRunState {
  if (run.phase !== 'event-result') return run;
  const commandIndex = run.commandIndex + 1;
  return {
    ...run,
    ...commandUpdate(run, commandIndex, {
      kind: 'continue-event',
      eventId: run.eventResolution?.eventId ?? 'unknown-event',
    }),
    phase: 'prepare',
    eventResolution: undefined,
  };
}

export const breedingCandidatesForRun = (
  data: GameData,
  run: CasualRunState,
  firstId: string,
  secondId: string,
): BreedingCandidate[] => {
  const first = run.roster.find((monster) => monster.id === firstId);
  const second = run.roster.find((monster) => monster.id === secondId);
  if (!first || !second) return [];
  const candidates = listBreedingCandidates(data, first, second);
  const bothMeetMinimum =
    first.level >= data.rules.breeding.minimumLevel && second.level >= data.rules.breeding.minimumLevel;
  return bothMeetMinimum ? candidates : [];
};
