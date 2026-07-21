import { describe, expect, it } from 'vitest';
import { analyzeCircuit } from '../core/circuit';
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

  it('gives both fighters enough health for long poison battles', () => {
    expect(GAME_DATA.units.map((unit) => unit.maxHp)).toEqual([216, 216]);
    expect(GAME_DATA.rules.retryReward).toBeGreaterThan(0);
  });

  it('starts the rival with a readable split and merge circuit', () => {
    const analysis = analyzeCircuit(GAME_DATA.enemyBoard, GAME_DATA.blocks, GAME_DATA.rules.sourceRow);

    expect(analysis.waveStep.get('2:0')).toBe(1);
    expect(
      [...analysis.waveStep]
        .filter(([, step]) => step === 2)
        .map(([key]) => key)
        .sort(),
    ).toEqual(['1:0', '2:1']);
    expect(analysis.waveStep.get('2:2')).toBe(5);
    expect(analysis.mergeCells).toEqual(new Set(['2:2']));
  });

  it('implements all ten poison designs as fixed-shape playable skills', () => {
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

  it('uses one undirected set of unique connection ports for every skill', () => {
    GAME_DATA.blocks.forEach((block) => {
      expect(block.ports.length, `${block.id} needs a port`).toBeGreaterThan(0);
      expect(new Set(block.ports).size, `${block.id} has duplicate ports`).toBe(block.ports.length);
    });
  });

  it('makes three-port branching skills slower or more expensive than straight skills', () => {
    const branchingSkills = GAME_DATA.blocks.filter((block) => block.ports.length >= 3);

    expect(branchingSkills.map((block) => block.id).sort()).toEqual(
      ['accelerator', 'arc-shot', 'barrier', 'poison-needle', 'serpentine-venom'].sort(),
    );
    branchingSkills.forEach((block) => {
      if (block.cooldown) expect(block.cooldown, `${block.id} should pay a cooldown tax`).toBeGreaterThanOrEqual(2);
      else expect(block.price, `${block.id} should pay a price tax`).toBeGreaterThanOrEqual(4);
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
