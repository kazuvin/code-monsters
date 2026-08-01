import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { breedingSkillChoices, listBreedingCandidates } from './breeding';
import { createMonster } from './monster';
import {
  applyBattleResult,
  breedInRun,
  buyMonster,
  chooseDraftMonster,
  chooseEvent,
  continueEvent,
  continueRun,
  createCasualRun,
  equipItem,
  eventRequiresTarget,
  moveMonsterToPartySlot,
  rerollShop,
} from './run';
import type { BattleResult, CasualRunState } from './types';

const preparedRun = (seed = 501) => {
  let run = createCasualRun(GAME_DATA, seed);
  while (run.phase === 'draft') {
    const choice = run.draftChoices[0];
    if (!choice) throw new Error('Expected a draft choice');
    run = chooseDraftMonster(GAME_DATA, run, choice);
  }
  return run;
};

const battleResult = (winner: BattleResult['winner'] = 'player'): BattleResult => ({
  winner,
  durationSeconds: 12,
  frames: [],
  damageByTeam: { player: 100, enemy: 70 },
  monsterReports: [],
});

describe('casual run', () => {
  it('drafts three immediately ready monsters and opens the shop', () => {
    const run = preparedRun();

    expect(run.phase).toBe('prepare');
    expect(run.roster).toHaveLength(3);
    expect(run.activeIds).toHaveLength(3);
    expect(run.roster.every((monster) => monster.skillIds.length === 3 && monster.gambits.length === 3)).toBe(true);
    expect(run.shop?.monsters).toHaveLength(GAME_DATA.rules.shop.monsterSlots);
  });

  it('buys and rerolls through serializable commands', () => {
    const run = preparedRun();
    const offer = run.shop?.monsters.find((entry) => entry);
    if (!offer) throw new Error('Expected a shop offer');
    const definition = GAME_DATA.monsters.find((entry) => entry.id === offer.definitionId);
    if (!definition) throw new Error('Expected an offered definition');
    const rich = { ...run, coins: 99 };
    const bought = buyMonster(GAME_DATA, rich, offer.id);
    if (!bought.ok) throw new Error(bought.error);
    const rerolled = rerollShop(GAME_DATA, bought.state);

    expect(bought.state.roster).toHaveLength(4);
    expect(bought.state.coins).toBe(99 - definition.price);
    expect(rerolled.ok).toBe(true);
    expect(() => JSON.stringify(rerolled.state.commandLog)).not.toThrow();
  });

  it('executes special breeding immediately with three selected skills and returns parent gear', () => {
    const recipe = GAME_DATA.specialRecipes[0];
    const equipment = GAME_DATA.equipment[0];
    if (!recipe || !equipment) throw new Error('Expected recipe and equipment data');
    const first = createMonster(GAME_DATA, recipe.parentDefinitionIds[0], 'first', { equipmentId: equipment.id });
    const second = createMonster(GAME_DATA, recipe.parentDefinitionIds[1], 'second');
    const base = preparedRun();
    const run: CasualRunState = {
      ...base,
      roster: [first, second, base.roster[0]!],
      activeIds: [first.id, second.id, base.roster[0]!.id],
    };
    const candidate = listBreedingCandidates(GAME_DATA, first, second)[0];
    if (!candidate) throw new Error('Expected a special candidate');
    const selected = breedingSkillChoices(GAME_DATA, first, second, candidate).slice(0, 3) as [string, string, string];
    const result = breedInRun(GAME_DATA, run, first.id, second.id, candidate.id, selected);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = result.state.roster.find((monster) => monster.definitionId === candidate.definitionId);
    expect(child?.skillIds).toEqual(selected);
    expect(result.state.roster.some((monster) => monster.id === first.id || monster.id === second.id)).toBe(false);
    expect(result.state.equipmentInventory).toContain(equipment.id);
    expect(result.state.coins).toBe(run.coins + GAME_DATA.rules.breedingCoinBonus);
    expect(result.state.commandLog.at(-1)).toMatchObject({ kind: 'breed', selectedSkillIds: selected });
  });

  it('keeps monster builds unchanged after battle and advances without growth or hatching', () => {
    const run = preparedRun();
    const before = structuredClone(run.roster);
    const resolved = applyBattleResult(GAME_DATA, run, battleResult('player'));
    const next = continueRun(GAME_DATA, resolved);

    expect(resolved.phase).toBe('result');
    expect(resolved.roster).toEqual(before);
    expect(next.cycle).toBe(2);
    expect(next.roster).toEqual(before);
    expect(next).not.toHaveProperty('lastBattleRewards');
    expect(next).not.toHaveProperty('lastHatches');
  });

  it('swaps active and bench slots and equips from inventory', () => {
    const base = preparedRun();
    const bench = createMonster(
      GAME_DATA,
      GAME_DATA.monsters.find((entry) => entry.shopAvailability === 'common')!.id,
      'bench',
    );
    const equipment = GAME_DATA.equipment[0];
    if (!equipment) throw new Error('Expected equipment');
    const run = { ...base, roster: [...base.roster, bench], equipmentInventory: [equipment.id] };
    const moved = moveMonsterToPartySlot(GAME_DATA, run, bench.id, 'active', 1);
    if (!moved.ok) throw new Error(moved.error);
    const equipped = equipItem(GAME_DATA, moved.state, bench.id, equipment.id);

    expect(moved.state.activeIds).toContain(bench.id);
    expect(equipped.ok).toBe(true);
    expect(equipped.ok && equipped.state.roster.find((monster) => monster.id === bench.id)?.equipmentId).toBe(
      equipment.id,
    );
  });

  it('resolves progression-free events without requiring a monster target', () => {
    const base = preparedRun();
    const event = GAME_DATA.events[0];
    if (!event) throw new Error('Expected an event');
    const run: CasualRunState = { ...base, phase: 'event', eventChoices: [event.id] };
    const resolved = chooseEvent(GAME_DATA, run, event.id);

    expect(eventRequiresTarget(event)).toBe(false);
    expect(resolved.phase).toBe('event-result');
    expect(continueEvent(resolved).phase).toBe('prepare');
  });
});
