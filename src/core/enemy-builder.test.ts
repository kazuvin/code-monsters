import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../game/game-data';
import { createBattle } from './battle';
import { adjacentPoweredNeighbors, analyzeCircuit, analyzeMagicSigils, countActiveMagicSigils } from './circuit';
import { generateEnemyBuild } from './enemy-builder';
import { maxHpBonusForBodyLevel, totalBodyUpgradeCost } from './progression';

describe('enemy build generator', () => {
  it('is deterministic for a seed while producing different mechanical builds for other seeds', () => {
    const first = generateEnemyBuild(GAME_DATA, 1, 73);

    expect(generateEnemyBuild(GAME_DATA, 1, 73)).toEqual(first);
    expect(generateEnemyBuild(GAME_DATA, 1, 74)).not.toEqual(first);
  });

  it('adds only nodes that fit the same cumulative budget available to the player', () => {
    const builds = Array.from({ length: 11 }, (_, index) => generateEnemyBuild(GAME_DATA, index + 1, 73));

    expect(builds[0].nodeCount).toBe(5);
    expect(builds.map((build) => build.maxHpBonus)).toEqual([
      0, 2500, 5000, 7500, 10_000, 12_500, 12_500, 12_500, 12_500, 12_500, 12_500,
    ]);
    builds.forEach((build, index) => {
      const targetNodes = Math.min(15, 7 + index);
      const analysis = analyzeCircuit(build.board, GAME_DATA.blocks, build.heartPosition, GAME_DATA.rules.heart.ports);
      expect(analysis.poweredCells.size).toBe(build.nodeCount);
      expect(build.nodeCount).toBeLessThanOrEqual(targetNodes);
      expect(build.totalCost).toBeLessThanOrEqual(build.budget);
      expect(build.budget).toBe(32 + index * 14);
    });
  });

  it('matches the player body level, health, shop tier, and paid upgrade cost', () => {
    const playerBodyLevel = 2;
    const build = generateEnemyBuild(GAME_DATA, 4, 73, { bodyLevel: playerBodyLevel });
    const playerMaxHpBonus = maxHpBonusForBodyLevel(GAME_DATA, playerBodyLevel);
    const battle = createBattle(GAME_DATA, GAME_DATA.playerBoard, build.board, {
      playerMaxHpBonus,
      enemyMaxHpBonus: build.maxHpBonus,
      enemyHeartPosition: build.heartPosition,
    });
    const player = battle.fighters.find((fighter) => fighter.team === 'player')!;
    const enemy = battle.fighters.find((fighter) => fighter.team === 'enemy')!;

    expect(build.level).toBe(playerBodyLevel);
    expect(build.bodyLevel).toBe(playerBodyLevel);
    expect(build.bodyUpgradeCost).toBe(6);
    expect(build.totalCost).toBe(build.skillCost + build.bodyUpgradeCost);
    expect(build.totalCost).toBeLessThanOrEqual(build.budget);
    expect(build.maxHpBonus).toBe(playerMaxHpBonus);
    expect(player.maxHp).toBe(7_500);
    expect(player.hp).toBe(7_500);
    expect(enemy.maxHp).toBe(player.maxHp);
    expect(enemy.hp).toBe(player.hp);
  });

  it('does not grant run-based body or rarity levels when the player has not upgraded', () => {
    const build = generateEnemyBuild(GAME_DATA, 6, 73, { budget: 72, bodyLevel: 1 });

    expect(build.level).toBe(1);
    expect(build.bodyLevel).toBe(1);
    expect(build.bodyUpgradeCost).toBe(0);
    expect(build.maxHpBonus).toBe(0);
    expect(build.totalCost).toBeLessThanOrEqual(72);
  });

  it('reprices every generated board inside player-reachable coin and body states', () => {
    const prices = new Map(GAME_DATA.blocks.map((block) => [block.id, block.price]));

    for (let run = 1; run <= 9; run += 1) {
      const budget = GAME_DATA.rules.startingCoins + (run - 1) * GAME_DATA.rules.retryReward;
      const bodyLevel = Math.min(run, GAME_DATA.rules.bodyUpgrades.maxLevel);
      for (let seed = 71; seed <= 75; seed += 1) {
        const build = generateEnemyBuild(GAME_DATA, run, seed, { budget, bodyLevel });
        const boardCost = build.board
          .flat()
          .reduce((total, placed) => total + (placed ? (prices.get(placed.blockId) ?? 0) : 0), 0);

        expect(build.skillCost, `run ${run}, seed ${seed}`).toBe(boardCost);
        expect(build.bodyUpgradeCost, `run ${run}, seed ${seed}`).toBe(totalBodyUpgradeCost(GAME_DATA, bodyLevel));
        expect(build.totalCost, `run ${run}, seed ${seed}`).toBe(boardCost + build.bodyUpgradeCost);
        expect(build.totalCost, `run ${run}, seed ${seed}`).toBeLessThanOrEqual(budget);
        expect(build.maxHpBonus, `run ${run}, seed ${seed}`).toBe(maxHpBonusForBodyLevel(GAME_DATA, bodyLevel));
      }
    }
  });

  it('never spends more than an explicitly supplied player budget', () => {
    const build = generateEnemyBuild(GAME_DATA, 2, 73, { budget: 40 });

    expect(build.budget).toBe(40);
    expect(build.totalCost).toBeLessThanOrEqual(40);
    expect(build.nodeCount).toBeLessThanOrEqual(8);
  });

  it('uses a required non-core skill as the finisher when an early budget cannot afford two cores', () => {
    const build = generateEnemyBuild(GAME_DATA, 1, 218, {
      budget: 32,
      bodyLevel: 1,
      buildId: 'charge',
      circuitCoreId: 'resonance',
      requiredBlockId: 'overcharge-cannon',
    });

    expect(build.circuitCoreId).toBe('resonance');
    expect(build.totalCost).toBeLessThanOrEqual(32);
    expect(build.board.flat().some((cell) => cell?.blockId === 'overcharge-cannon')).toBe(true);
    expect(
      build.board.flat().some((cell) => {
        const design = GAME_DATA.buildDesign.skills.find((skill) => skill.blockId === cell?.blockId);
        return design?.placementPatternId === 'resonance' && design.circuitCoreRoles?.includes('starter');
      }),
    ).toBe(true);
  });

  it('fills the most affordable nodes after reserving the paid heart upgrade', () => {
    const build = generateEnemyBuild(GAME_DATA, 2, 221, { budget: 40 });

    expect(build.nodeCount).toBe(8);
    expect(build.bodyUpgradeCost).toBe(6);
    expect(build.totalCost).toBeLessThanOrEqual(40);
  });

  it('combines one real trait with a circuit core starter and payoff', () => {
    [73, 74, 75, 76].forEach((seed) => {
      const build = generateEnemyBuild(GAME_DATA, 5, seed);
      const placedIds = new Set(
        build.board.flatMap((row) => row.flatMap((placed) => (placed ? [placed.blockId] : []))),
      );
      const designs = GAME_DATA.buildDesign.skills.filter((skill) => skill.blockId && placedIds.has(skill.blockId));
      const coreRoles = designs.flatMap((skill) => skill.circuitCoreRoles ?? []);

      designs.forEach((skill) => {
        const traits = skill.axisLinks.find((link) => link.axisId === 'trait')?.valueIds ?? [];
        expect(
          traits.some((trait) => trait === 'neutral' || trait === build.buildId),
          skill.id,
        ).toBe(true);
      });
      expect(coreRoles).toContain('starter');
      expect(coreRoles).toContain('payoff');
    });
  });

  it('aims magic-sigil inscriptions at powered skills and places its payoff on a mark', () => {
    [11, 12, 13, 14].forEach((seed) => {
      const build = generateEnemyBuild(GAME_DATA, 6, seed, { buildId: 'poison', circuitCoreId: 'magic-sigil' });
      expect(build.circuitCoreId).toBe('magic-sigil');
      const analysis = analyzeCircuit(build.board, GAME_DATA.blocks, build.heartPosition, GAME_DATA.rules.heart.ports);
      const magicSigils = analyzeMagicSigils(
        build.board,
        GAME_DATA.blocks,
        analysis,
        GAME_DATA.rules.skillFusion,
        GAME_DATA.rules.magicSigils,
      );
      const payoffCells = build.board.flatMap((row, rowIndex) =>
        row.flatMap((placed, columnIndex) => {
          const roles = GAME_DATA.buildDesign.skills.find(
            (skill) => skill.blockId === placed?.blockId,
          )?.circuitCoreRoles;
          return roles?.includes('payoff') ? [`${rowIndex}:${columnIndex}`] : [];
        }),
      );

      expect(countActiveMagicSigils(build.board, analysis, magicSigils), `seed ${seed}`).toBeGreaterThan(0);
      expect(
        payoffCells.some((key) => (magicSigils.levels.get(key) ?? 0) > 0),
        `seed ${seed}`,
      ).toBe(true);
    });
  });

  it('surrounds a resonance payoff with enough powered resonance nodes, including diagonals', () => {
    [11, 12, 13, 14].forEach((seed) => {
      const build = generateEnemyBuild(GAME_DATA, 6, seed, { buildId: 'charge', circuitCoreId: 'resonance' });
      expect(build.circuitCoreId).toBe('resonance');
      const analysis = analyzeCircuit(build.board, GAME_DATA.blocks, build.heartPosition, GAME_DATA.rules.heart.ports);
      const payoffCells = build.board.flatMap((row, rowIndex) =>
        row.flatMap((placed, columnIndex) => {
          const design = GAME_DATA.buildDesign.skills.find((skill) => skill.blockId === placed?.blockId);
          const roles = design?.circuitCoreRoles;
          return roles?.includes('payoff') && placed
            ? [{ placed, position: { row: rowIndex, column: columnIndex } }]
            : [];
        }),
      );

      expect(payoffCells.length, `seed ${seed}`).toBeGreaterThan(0);
      payoffCells.forEach(({ placed, position }) => {
        const block = GAME_DATA.blocks.find((candidate) => candidate.id === placed.blockId)!;
        const required = Math.max(
          ...block.effects.flatMap((effect) =>
            'trigger' in effect && effect.trigger?.kind === 'adjacent-powered-at-least' ? [effect.trigger.amount] : [],
          ),
        );
        const neighbors = adjacentPoweredNeighbors(build.board, GAME_DATA.blocks, analysis, position);

        expect(neighbors.length, `${placed.blockId}, seed ${seed}`).toBeGreaterThanOrEqual(required);
        expect(
          neighbors.some((neighbor) => neighbor.row !== position.row && neighbor.column !== position.column),
          `${placed.blockId}, seed ${seed}`,
        ).toBe(true);
      });
    });
  });

  it('builds powered light-vein branches and three-route convergence for their required payoffs', () => {
    const fixtures = [
      { blockId: 'branchlight-barrage', topology: 'branch' },
      { blockId: 'solar-convergence', topology: 'merge' },
    ] as const;

    fixtures.forEach(({ blockId, topology }) => {
      [11, 12, 13].forEach((seed) => {
        const build = generateEnemyBuild(GAME_DATA, 9, seed, {
          buildId: 'charge',
          circuitCoreId: 'light-vein',
          requiredBlockId: blockId,
        });
        const analysis = analyzeCircuit(
          build.board,
          GAME_DATA.blocks,
          build.heartPosition,
          GAME_DATA.rules.heart.ports,
        );
        const key = build.board.flatMap((row, rowIndex) =>
          row.flatMap((placed, columnIndex) => (placed?.blockId === blockId ? [`${rowIndex}:${columnIndex}`] : [])),
        )[0];

        expect(key, `${blockId}, seed ${seed}`).toBeTruthy();
        expect(analysis.poweredCells.has(key), `${blockId}, seed ${seed}`).toBe(true);
        if (topology === 'branch') {
          expect(analysis.downstreamCells.get(key)?.length, `${blockId}, seed ${seed}`).toBeGreaterThanOrEqual(2);
        } else {
          expect(analysis.upstreamCells.get(key)?.length, `${blockId}, seed ${seed}`).toBe(3);
          expect(analysis.mergeCells.has(key), `${blockId}, seed ${seed}`).toBe(true);
        }
      });
    });
  });

  it('discovers a newly declared build and can require one of its playable skills', () => {
    const data = structuredClone(GAME_DATA);
    const charge = data.buildDesign.builds.find((build) => build.id === 'charge')!;
    data.buildDesign.axes
      .find((axis) => axis.id === charge.axisId)!
      .values.push({ id: 'spark', title: '火花', description: '自動検出テスト用', color: '#ff9f43' });
    data.buildDesign.builds.push({ ...charge, id: 'spark', title: '火花' });
    data.buildDesign.skills.forEach((skill) => {
      const chargeLink = skill.buildLinks.find((link) => link.buildId === 'charge');
      if (!chargeLink) return;
      skill.buildLinks.push({ ...chargeLink, buildId: 'spark' });
      const trait = skill.axisLinks.find((link) => link.axisId === charge.axisId);
      if (trait?.valueIds.includes('charge')) trait.valueIds.push('spark');
    });

    const build = generateEnemyBuild(data, 9, 73, {
      buildId: 'spark',
      requiredBlockId: 'overcharge-cannon',
    });

    expect(build.buildId).toBe('spark');
    expect(build.board.flat().some((cell) => cell?.blockId === 'overcharge-cannon')).toBe(true);
    expect(build.totalCost).toBeLessThanOrEqual(build.budget);
  });
});
