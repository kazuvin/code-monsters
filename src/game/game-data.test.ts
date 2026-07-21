import { describe, expect, it } from 'vitest';
import { GAME_DATA, validateGameData } from './game-data';

describe('game data', () => {
  it('contains complete 5x5 circuits and valid stable references', () => {
    expect(validateGameData(GAME_DATA)).toEqual([]);
    expect(GAME_DATA.playerBoard).toHaveLength(5);
    expect(GAME_DATA.playerBoard.every((row) => row.length === 5)).toBe(true);
    expect(GAME_DATA.enemyBoard.every((row) => row.length === 5)).toBe(true);
  });

  it('starts the player empty and offers only skills with gameplay effects', () => {
    expect(GAME_DATA.startingRack).toEqual([]);
    expect(GAME_DATA.playerBoard.flat().every((cell) => cell === null)).toBe(true);
    expect(GAME_DATA.blocks.flatMap((block) => block.effects.map((effect) => effect.kind))).not.toContain('wire');
  });

  it('implements all ten poison designs as fixed-direction playable skills', () => {
    const poisonDesigns = GAME_DATA.buildDesign.skills.filter((skill) =>
      skill.buildLinks.some((link) => link.buildId === 'poison'),
    );
    const poisonBlocks = GAME_DATA.blocks.filter((block) => block.buildIds?.includes('poison'));

    expect(poisonDesigns).toHaveLength(10);
    expect(poisonBlocks).toHaveLength(10);
    expect(poisonDesigns.every((skill) => skill.status === 'playable' && skill.blockId)).toBe(true);
    expect(poisonBlocks.every((block) => block.rotatable === false)).toBe(true);
    expect(new Set(poisonDesigns.map((skill) => skill.blockId))).toEqual(
      new Set(poisonBlocks.map((block) => block.id)),
    );
  });

  it('has at least one playable receiver for every output direction', () => {
    const opposite = { north: 'south', east: 'west', south: 'north', west: 'east' } as const;
    const inputDirections = new Set(GAME_DATA.blocks.flatMap((block) => block.inputPorts));

    GAME_DATA.blocks.forEach((block) => {
      block.outputPorts.forEach((output) => {
        expect(inputDirections.has(opposite[output]), `${block.id} output ${output} has no receiver`).toBe(true);
      });
    });
  });

  it('describes every skill as readable sentences instead of vague parameter fragments', () => {
    const vagueFragments = ['自身が育つ', '戦闘中強化', '強くなる', '効果を2増やし'];

    GAME_DATA.blocks.forEach((block) => {
      expect(block.description.endsWith('。'), `${block.id} needs a complete sentence`).toBe(true);
      vagueFragments.forEach((fragment) => expect(block.description).not.toContain(fragment));
    });
  });

  it('rejects an unknown block in a circuit', () => {
    const invalid = structuredClone(GAME_DATA);
    invalid.enemyBoard[0][0] = { blockId: 'missing-block', rotation: 0 };

    expect(validateGameData(invalid)).toContain('enemyBoard[0][0] references unknown block "missing-block"');
  });

  it('rejects an overload rule that cannot escalate', () => {
    const invalid = structuredClone(GAME_DATA);
    invalid.rules.suddenDeathGrowth = 1;

    expect(validateGameData(invalid)).toContain('suddenDeathGrowth must be greater than 1');
  });

  it('rejects an effect scaling interval that cannot progress', () => {
    const invalid = structuredClone(GAME_DATA);
    const film = invalid.blocks.find((block) => block.id === 'corrosion-film')!;
    const shield = film.effects.find((effect) => effect.kind === 'shield');
    if (!shield || shield.kind !== 'shield' || !shield.scaling) throw new Error('missing shield scaling fixture');
    shield.scaling.every = 0;

    expect(validateGameData(invalid)).toContain(
      'block "corrosion-film" effect "shield" scaling every must be positive',
    );
  });

  it('rejects self growth that cannot improve one of the skill effects', () => {
    const invalid = structuredClone(GAME_DATA);
    const needle = invalid.blocks.find((block) => block.id === 'poison-needle')!;
    const growth = needle.effects.find((effect) => effect.kind === 'growth');
    if (!growth || growth.kind !== 'growth') throw new Error('missing growth fixture');
    growth.stat = 'shield';

    expect(validateGameData(invalid)).toContain('block "poison-needle" cannot grow its missing "shield" effect');
  });
});
