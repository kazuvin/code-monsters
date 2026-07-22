import { describe, expect, it } from 'vitest';
import { GAME_DATA, validateGameData } from './game-data';

describe('game data', () => {
  it('contains complete 5x5 circuits and valid stable references', () => {
    expect(validateGameData(GAME_DATA)).toEqual([]);
    expect(GAME_DATA.playerBoard).toHaveLength(5);
    expect(GAME_DATA.playerBoard.every((row) => row.length === 5)).toBe(true);
  });

  it('starts the player empty and offers only skills with gameplay effects', () => {
    expect(GAME_DATA.startingRack).toEqual([]);
    expect(GAME_DATA.playerBoard.flat().every((cell) => cell === null)).toBe(true);
    expect(GAME_DATA.blocks.flatMap((block) => block.effects.map((effect) => effect.kind))).not.toContain('wire');
  });

  it('gives both fighters enough health for long poison battles', () => {
    expect(GAME_DATA.units.map((unit) => unit.maxHp)).toEqual([5000, 5000]);
    expect(GAME_DATA.rules.retryReward).toBeGreaterThan(0);
  });

  it('keeps the base circuit pulse slow enough to read', () => {
    expect(GAME_DATA.rules.pulseAnimationMs).toBeGreaterThanOrEqual(300);
  });

  it('defines four progressively rarer shop tiers', () => {
    expect(GAME_DATA.rules.shopSize).toBe(6);
    expect(GAME_DATA.rules.rarityWeights).toEqual({ common: 100, rare: 50, epic: 30, legendary: 15 });
    expect(new Set(GAME_DATA.blocks.map((block) => block.rarity))).toEqual(
      new Set(['common', 'rare', 'epic', 'legendary']),
    );
  });

  it('defines automatic level health and rarity progression', () => {
    expect(GAME_DATA.rules.levelProgression).toEqual({
      runsPerLevel: 1,
      maxLevel: 9,
      hpPerLevel: 2500,
      rarityWeightMultiplierPerLevel: { common: 0.96, rare: 1.02, epic: 1.08, legendary: 1.14 },
    });
  });

  it('rejects incomplete or incoherent deterministic balance-formula coefficients', () => {
    const data = structuredClone(GAME_DATA);
    data.rules.balanceFormula.chargeAttribution = { producer: 0.8, consumer: 0.8 };
    data.rules.balanceFormula.conditionAvailability.inCycle = 1.2;

    expect(validateGameData(data)).toEqual(
      expect.arrayContaining([
        'balanceFormula.chargeAttribution producer and consumer must sum to 1',
        'balanceFormula.conditionAvailability.inCycle must be within (0, 1]',
      ]),
    );
  });

  it('defines three-copy fusion and enough same-rarity rewards for every tier', () => {
    expect(GAME_DATA.rules.skillFusion).toEqual({
      copiesRequired: 3,
      rewardChoices: 3,
      effectMultiplier: 1.5,
      cooldownReduction: 1,
    });
    (['common', 'rare', 'epic', 'legendary'] as const).forEach((rarity) => {
      expect(GAME_DATA.blocks.filter((block) => block.rarity === rarity).length, rarity).toBeGreaterThanOrEqual(3);
    });
  });

  it('uses difficult circuit conditions for stronger existing and new skills', () => {
    const skill = (blockId: string) => GAME_DATA.buildDesign.skills.find((candidate) => candidate.blockId === blockId)!;
    const block = (blockId: string) => GAME_DATA.blocks.find((candidate) => candidate.id === blockId)!;

    expect(skill('return-coil').placementPatternId).toBe('loop');
    expect(skill('long-route-fang').placementPatternId).toBe('straight-line');
    expect(skill('accelerator').placementPatternId).toBe('fully-connected');
    expect(block('venom-orbit').effects).toContainEqual(expect.objectContaining({ trigger: { kind: 'in-cycle' } }));
    expect(block('sealed-junction').effects).toContainEqual(
      expect.objectContaining({ trigger: { kind: 'all-ports-connected' } }),
    );
    expect(block('charge-line-lance').effects).toEqual([
      { kind: 'charge', amount: 6 },
      { kind: 'charge', amount: 5, trigger: { kind: 'straight-line-at-least', amount: 5 } },
    ]);
  });

  it('makes every higher rarity stronger and more expensive as a tier', () => {
    const ranges = Object.fromEntries(
      (['common', 'rare', 'epic', 'legendary'] as const).map((rarity) => {
        const prices = GAME_DATA.blocks.filter((block) => block.rarity === rarity).map((block) => block.price);
        return [rarity, { min: Math.min(...prices), max: Math.max(...prices) }];
      }),
    );

    expect(ranges).toEqual({
      common: { min: 4, max: 5 },
      rare: { min: 7, max: 9 },
      epic: { min: 13, max: 14 },
      legendary: { min: 20, max: 22 },
    });

    GAME_DATA.blocks.forEach((block) => {
      block.effects.forEach((effect) => {
        if ('amount' in effect && ['damage', 'shield', 'repair', 'poison'].includes(effect.kind)) {
          expect(effect.amount, `${block.id} ${effect.kind}`).toBeGreaterThan(0);
        }
        if (effect.kind === 'growth' || effect.kind === 'amplify') {
          expect(effect.amount, `${block.id} ${effect.kind}`).toBeGreaterThan(0);
        }
        if (effect.kind === 'release-charge') {
          expect(effect.amount, `${block.id} release base`).toBeGreaterThanOrEqual(100);
          expect(effect.perCharge, `${block.id} release ratio`).toBeGreaterThan(0);
        }
        if (effect.kind === 'rupture-poison') {
          expect(effect.damagePerStack, `${block.id} rupture ratio`).toBeGreaterThanOrEqual(6);
        }
      });
    });

    const effectAmount = (blockId: string, kind: 'damage' | 'poison' | 'shield' | 'charge') => {
      const effect = GAME_DATA.blocks.find((block) => block.id === blockId)?.effects.find((item) => item.kind === kind);
      if (!effect || !('amount' in effect)) throw new Error(`missing ${blockId} ${kind} fixture`);
      return effect.amount;
    };
    expect(effectAmount('arc-shot', 'damage')).toBeGreaterThan(effectAmount('strike', 'damage'));
    expect(effectAmount('charge-guard', 'shield')).toBeGreaterThan(effectAmount('barrier', 'shield'));
    expect(effectAmount('charge-coil', 'charge')).toBeGreaterThan(effectAmount('charge-blade', 'charge'));
    expect(effectAmount('toxic-reservoir', 'charge')).toBeGreaterThan(effectAmount('charge-coil', 'charge'));
    expect(effectAmount('charge-line-lance', 'charge')).toBeGreaterThan(effectAmount('toxic-reservoir', 'charge'));
    expect(effectAmount('venom-bloom', 'poison')).toBeGreaterThan(effectAmount('poison-needle', 'poison'));
  });

  it('keeps one or two charge release nodes in each high rarity', () => {
    const releaseCount = (rarity: 'common' | 'rare' | 'epic' | 'legendary') =>
      GAME_DATA.blocks.filter(
        (block) => block.rarity === rarity && block.effects.some((effect) => effect.kind === 'release-charge'),
      ).length;

    expect(releaseCount('common')).toBe(0);
    expect(releaseCount('rare')).toBe(1);
    expect(releaseCount('epic')).toBe(2);
    expect(releaseCount('legendary')).toBe(1);
  });

  it('gives every charge-trait node an explicit charge or release effect', () => {
    const chargeBlocks = GAME_DATA.buildDesign.skills
      .filter((skill) => skill.axisLinks.find((link) => link.axisId === 'trait')?.valueIds.includes('charge'))
      .map((skill) => GAME_DATA.blocks.find((block) => block.id === skill.blockId)!);

    expect(
      chargeBlocks
        .filter(
          (block) => !block.effects.some((effect) => effect.kind === 'charge' || effect.kind === 'release-charge'),
        )
        .map((block) => block.id),
    ).toEqual([]);
  });

  it('defines a presentation color for every trait axis value', () => {
    const trait = GAME_DATA.buildDesign.axes.find((axis) => axis.id === 'trait');

    expect(trait?.values.map((value) => [value.id, value.color])).toEqual([
      ['neutral', '#486977'],
      ['poison', '#8bd450'],
      ['charge', '#ffd36a'],
    ]);
  });

  it('defines a rival generator that attempts to add one affordable node per round', () => {
    expect(GAME_DATA.rules.enemyGeneration).toEqual({
      startingNodes: 7,
      nodesPerRun: 1,
      maxNodes: 15,
    });
  });

  it('uses neutral for generic nodes and reserves mixed traits for real mixed mechanics', () => {
    const traitIds = (blockId: string) =>
      GAME_DATA.buildDesign.skills
        .find((skill) => skill.blockId === blockId)
        ?.axisLinks.find((link) => link.axisId === 'trait')?.valueIds;
    const genericIds = [
      'strike',
      'breaker',
      'arc-shot',
      'barrier',
      'repair',
      'return-coil',
      'long-route-fang',
      'amplifier',
      'accelerator',
    ];

    genericIds.forEach((blockId) => {
      const block = GAME_DATA.blocks.find((candidate) => candidate.id === blockId)!;
      expect(traitIds(blockId), blockId).toEqual(['neutral']);
      expect(
        block.effects.some((effect) => effect.kind === 'charge' || effect.kind === 'release-charge'),
        blockId,
      ).toBe(false);
    });
    expect(traitIds('charge-guard')).toEqual(['charge']);
    expect(
      GAME_DATA.buildDesign.skills
        .filter((skill) => skill.axisLinks.find((link) => link.axisId === 'trait')?.valueIds.length === 2)
        .map((skill) => skill.id)
        .sort(),
    ).toEqual(['status-relay', 'toxic-reservoir']);
  });

  it('replaces poison-only nodes with weapon combinations and cross-trait nodes', () => {
    const poisonDesigns = GAME_DATA.buildDesign.skills.filter((skill) =>
      skill.buildLinks.some((link) => link.buildId === 'poison'),
    );
    const poisonBlocks = GAME_DATA.blocks.filter((block) => block.buildIds?.includes('poison'));
    const poisonOnly = poisonDesigns.filter((skill) => {
      const traits = skill.axisLinks.find((link) => link.axisId === 'trait')?.valueIds;
      return traits?.length === 1 && traits[0] === 'poison';
    });

    expect(poisonOnly).toHaveLength(5);
    expect(poisonDesigns.length).toBeGreaterThan(poisonOnly.length);
    expect(poisonBlocks).toHaveLength(poisonDesigns.length);
    expect(poisonDesigns.every((skill) => skill.status === 'playable' && skill.blockId)).toBe(true);
    expect(
      poisonOnly.every((skill) => GAME_DATA.blocks.find((block) => block.id === skill.blockId)?.rotatable === false),
    ).toBe(true);
    expect(new Set(poisonDesigns.map((skill) => skill.blockId))).toEqual(
      new Set(poisonBlocks.map((block) => block.id)),
    );
  });

  it('assigns every playable node to both design axes exactly once', () => {
    expect(GAME_DATA.buildDesign.skills.map((skill) => skill.blockId).sort()).toEqual(
      GAME_DATA.blocks.map((block) => block.id).sort(),
    );
    GAME_DATA.buildDesign.skills.forEach((skill) => {
      expect(skill.axisLinks.map((link) => link.axisId).sort(), skill.id).toEqual(['trait', 'weapon']);
    });
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
      ['accelerator', 'arc-shot', 'barrier', 'charge-arrow', 'poison-needle', 'sealed-junction', 'venom-orbit'].sort(),
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

  it('rejects an unknown block in the player circuit', () => {
    const invalid = structuredClone(GAME_DATA);
    invalid.playerBoard[0][0] = { blockId: 'missing-block', rotation: 0 };

    expect(validateGameData(invalid)).toContain('playerBoard[0][0] references unknown block "missing-block"');
  });

  it('rejects an overload rule that cannot escalate', () => {
    const invalid = structuredClone(GAME_DATA);
    invalid.rules.suddenDeathGrowth = 1;

    expect(validateGameData(invalid)).toContain('suddenDeathGrowth must be greater than 1');
  });

  it('rejects rarity weights that do not become progressively lower', () => {
    const invalid = structuredClone(GAME_DATA);
    invalid.rules.rarityWeights.epic = invalid.rules.rarityWeights.rare;

    expect(validateGameData(invalid)).toContain('rarityWeights.epic must be lower than rarityWeights.rare');
  });

  it('rejects a trait axis value without a display color', () => {
    const invalid = structuredClone(GAME_DATA);
    const poison = invalid.buildDesign.axes
      .find((axis) => axis.id === 'trait')
      ?.values.find((value) => value.id === 'poison');
    if (!poison) throw new Error('missing trait fixture');
    poison.color = '';

    expect(validateGameData(invalid)).toContain('trait axis value "poison" needs a six-digit hex color');
  });

  it('keeps per-node tuning from making a higher rarity easier to roll', () => {
    const invalid = structuredClone(GAME_DATA);
    invalid.blocks.find((block) => block.id === 'overcharge-cannon')!.shopWeight = 100;

    expect(validateGameData(invalid)).toContain('legendary nodes must be harder to roll than every epic node');
  });

  it('rejects overlapping node price tiers', () => {
    const invalid = structuredClone(GAME_DATA);
    invalid.blocks.find((block) => block.id === 'rail-cannon')!.price = 9;

    expect(validateGameData(invalid)).toContain('epic nodes must cost more than every rare node');
  });

  it('rejects a high rarity without one or two charge release nodes', () => {
    const invalid = structuredClone(GAME_DATA);
    invalid.blocks = invalid.blocks.filter((block) => block.id !== 'overcharge-cannon');
    invalid.buildDesign.skills = invalid.buildDesign.skills.filter((skill) => skill.blockId !== 'overcharge-cannon');

    expect(validateGameData(invalid)).toContain('legendary rarity needs one or two charge release nodes');
  });

  it('rejects a charge-trait node without a charge or release effect', () => {
    const invalid = structuredClone(GAME_DATA);
    const blade = invalid.blocks.find((block) => block.id === 'charge-blade')!;
    blade.effects = blade.effects.filter((effect) => effect.kind !== 'charge');

    expect(validateGameData(invalid)).toContain(
      'block "charge-blade" is tagged with charge but has no charge or release effect',
    );
  });

  it('rejects an effect scaling interval that cannot progress', () => {
    const invalid = structuredClone(GAME_DATA);
    const fang = invalid.blocks.find((block) => block.id === 'long-route-fang')!;
    const damage = fang.effects.find((effect) => effect.kind === 'damage');
    if (!damage || damage.kind !== 'damage' || !damage.scaling) throw new Error('missing damage scaling fixture');
    damage.scaling.every = 0;

    expect(validateGameData(invalid)).toContain(
      'block "long-route-fang" effect "damage" scaling every must be positive',
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
