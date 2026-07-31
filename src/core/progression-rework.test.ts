import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { listBreedingCandidates } from './breeding';
import { createMonster } from './monster';
import { createShop } from './shop';

describe('special-recipe white-star progression', () => {
  it('opens five white-star ranks and allows breeding from level two', () => {
    const gridArchetypeIds = new Set(GAME_DATA.archetypes.map((archetype) => archetype.id));
    const gridMonsters = GAME_DATA.monsters.filter((monster) => gridArchetypeIds.has(monster.archetypeId));

    expect(GAME_DATA.rules.maxWhiteStars).toBe(5);
    expect(GAME_DATA.rules.breeding.minimumLevel).toBe(2);
    expect(gridMonsters).toHaveLength(45);
  });

  it('keeps generic children at the lower parent white-star rank', () => {
    const higher = createMonster(GAME_DATA, 'light-dragon-3', 'higher', { xp: 4 });
    const lower = createMonster(GAME_DATA, 'fire-demon-2', 'lower', { xp: 4 });

    const genericResults = listBreedingCandidates(GAME_DATA, higher, lower).filter(
      (candidate) => candidate.kind === 'generic',
    );

    expect(genericResults.length).toBeGreaterThan(0);
    expect(
      genericResults.every(
        (candidate) => GAME_DATA.monsters.find((monster) => monster.id === candidate.definitionId)?.whiteStars === 2,
      ),
    ).toBe(true);
  });

  it('does not turn color stars into a higher white-star generic child', () => {
    const first = createMonster(GAME_DATA, 'light-dragon-1', 'first', { colorStars: 2, xp: 4 });
    const second = createMonster(GAME_DATA, 'light-dragon-1', 'second', { colorStars: 2, xp: 4 });

    const candidates = listBreedingCandidates(GAME_DATA, first, second);

    expect(candidates.some((candidate) => candidate.kind === 'generic' && candidate.definitionId.endsWith('-2'))).toBe(
      false,
    );
  });

  it('gives every grid result four, three, two, and one rank-up recipes from white stars two through five', () => {
    const countsByResult = new Map<string, number>();
    const parentPairs = new Set<string>();
    for (const recipe of GAME_DATA.specialRecipes) {
      parentPairs.add([...recipe.parentDefinitionIds].sort().join('+'));
      countsByResult.set(recipe.resultDefinitionId, (countsByResult.get(recipe.resultDefinitionId) ?? 0) + 1);
      const result = GAME_DATA.monsters.find((monster) => monster.id === recipe.resultDefinitionId);
      const parents = recipe.parentDefinitionIds.map((id) => GAME_DATA.monsters.find((monster) => monster.id === id));
      expect(result, recipe.id).toBeTruthy();
      expect(parents.every(Boolean), recipe.id).toBe(true);
      expect(result?.whiteStars, recipe.id).toBeGreaterThan(
        Math.max(...parents.map((parent) => parent?.whiteStars ?? 0)),
      );
    }

    for (const monster of GAME_DATA.monsters.filter(
      (entry) => GAME_DATA.archetypes.some((archetype) => archetype.id === entry.archetypeId) && entry.whiteStars >= 2,
    )) {
      expect(countsByResult.get(monster.id), monster.id).toBe(6 - monster.whiteStars);
    }
    expect(GAME_DATA.specialRecipes).toHaveLength(90);
    expect(parentPairs.size).toBe(90);
  });

  it('never upgrades a shop monster even when every slot uses the rare-offer pool', () => {
    const shop = createShop(GAME_DATA, 42, 1);

    expect(
      shop.monsters.every((offer) => {
        const definition = offer && GAME_DATA.monsters.find((monster) => monster.id === offer.definitionId);
        return definition?.shopAvailability === 'rare' || definition?.whiteStars === 1;
      }),
    ).toBe(true);
    expect(shop.monsters.every((offer) => !offer || !('lucky' in offer))).toBe(true);
  });

  it('keeps both eggs at their own white-star rank when they hatch', () => {
    for (const definitionId of ['mystery-egg-1', 'prismatic-egg-1'] as const) {
      const definition = GAME_DATA.monsters.find((monster) => monster.id === definitionId);
      expect(definition?.hatch).toEqual({ afterHeldCycles: 1 });
    }
  });
});
