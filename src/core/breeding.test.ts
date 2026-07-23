import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { breedMonsters, listBreedingCandidates } from './breeding';
import { createMonster, permanentStatsFor } from './monster';

describe('breeding', () => {
  it('creates both lineage x attribute generic candidates', () => {
    const dragon = createMonster(GAME_DATA, 'light-dragon-1', 'dragon', { xp: 10 });
    const demon = createMonster(GAME_DATA, 'fire-demon-1', 'demon', { xp: 10 });

    const candidates = listBreedingCandidates(GAME_DATA, dragon, demon);

    expect(candidates.map((candidate) => candidate.definitionId)).toEqual(
      expect.arrayContaining(['fire-dragon-1', 'light-demon-1']),
    );
  });

  it('offers both color-star and white-star routes when effective stars allow them', () => {
    const colored = createMonster(GAME_DATA, 'light-dragon-1', 'colored', {
      colorStars: 1,
      xp: 10,
    });
    const plain = createMonster(GAME_DATA, 'light-dragon-1', 'plain', { xp: 10 });

    const candidates = listBreedingCandidates(GAME_DATA, colored, plain);

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ definitionId: 'light-dragon-1', colorStars: 2, kind: 'same-name' }),
        expect.objectContaining({ definitionId: 'light-dragon-2', colorStars: 0, kind: 'generic' }),
      ]),
    );
  });

  it('inherits permanent stats at the color-star rate and only one selected skill', () => {
    const first = createMonster(GAME_DATA, 'light-dragon-1', 'first', {
      colorStars: 1,
      inheritedStats: {
        maxHp: 10,
        maxMp: 2,
        attack: 3,
        defense: 1,
        speed: 2,
        wisdom: 0,
        crit: 1,
      },
      inheritedSkillId: 'mend',
      xp: 18,
    });
    const second = createMonster(GAME_DATA, 'fire-demon-1', 'second', { xp: 10 });
    const candidate = listBreedingCandidates(GAME_DATA, first, second).find(
      (entry) => entry.definitionId === 'fire-dragon-2',
    );
    if (!candidate) throw new Error('Expected generic breeding candidate');

    const child = breedMonsters(GAME_DATA, first, second, candidate, 'mend', 'child');
    const childDefinition = GAME_DATA.monsters.find((monster) => monster.id === candidate.definitionId);
    if (!childDefinition) throw new Error('Expected child definition');
    const firstStats = permanentStatsFor(GAME_DATA, first);
    const secondStats = permanentStatsFor(GAME_DATA, second);

    expect(child.inheritedSkillId).toBe('mend');
    expect(child.level).toBe(1);
    expect(child.xp).toBe(0);
    expect(child.inheritedStats.attack).toBe(Math.floor(((firstStats.attack + secondStats.attack) / 2) * 0.3));
    expect(permanentStatsFor(GAME_DATA, child).attack).toBe(
      childDefinition.baseStats.attack + child.inheritedStats.attack,
    );
  });
});
