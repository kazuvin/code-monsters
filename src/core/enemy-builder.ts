import { rotateCellOffset, rotatePorts } from './circuit';
import { cumulativeBudgetForRun, levelForRun, maxHpBonusForLevel, rarityWeightsForLevel } from './progression';
import type {
  BlockDefinition,
  BuildDefinition,
  CircuitBoard,
  Direction,
  GameData,
  RarityWeights,
  Rotation,
  SkillDesignDefinition,
} from './types';

export type EnemyBuild = {
  board: CircuitBoard;
  buildId: string;
  nodeCount: number;
  level: number;
  budget: number;
  totalCost: number;
  maxHpBonus: number;
};

export type EnemyBuildOptions = { budget?: number; buildId?: string; requiredBlockId?: string };

type LayoutNode = { row: number; column: number };
type PlacementCandidate = { block: BlockDefinition; design: SkillDesignDefinition; rotations: Rotation[] };

const LAYOUT: LayoutNode[] = [
  { row: 2, column: 0 },
  { row: 1, column: 0 },
  { row: 2, column: 1 },
  { row: 1, column: 1 },
  { row: 2, column: 2 },
  { row: 1, column: 2 },
  { row: 1, column: 3 },
  { row: 1, column: 4 },
  { row: 2, column: 3 },
  { row: 2, column: 4 },
  { row: 0, column: 0 },
  { row: 0, column: 1 },
  { row: 0, column: 2 },
  { row: 0, column: 3 },
  { row: 0, column: 4 },
];

const LAYOUT_EDGES: Array<[number, number]> = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 3],
  [2, 4],
  [3, 5],
  [5, 6],
  [6, 7],
  [4, 8],
  [8, 9],
  [1, 10],
  [10, 11],
  [11, 12],
  [12, 13],
  [13, 14],
];

const ROTATIONS: Rotation[] = [0, 1, 2, 3];

const randomUnit = (seed: number) => {
  const value = Math.sin(seed * 9301 + 49297) * 233280;
  return value - Math.floor(value);
};

const directionBetween = (from: LayoutNode, to: LayoutNode): Direction => {
  if (to.row < from.row) return 'north';
  if (to.row > from.row) return 'south';
  if (to.column < from.column) return 'west';
  return 'east';
};

const axisValues = (skill: SkillDesignDefinition, axisId: string) =>
  skill.axisLinks.find((link) => link.axisId === axisId)?.valueIds ?? [];

const supportsBuild = (skill: SkillDesignDefinition, build: BuildDefinition) => {
  if (!skill.buildLinks.some((link) => link.buildId === build.id)) return false;
  const values = axisValues(skill, build.axisId);
  return values.includes(build.id) || (build.axisId === 'trait' && values.includes('neutral'));
};

const adjacentBuildRequirement = (block: BlockDefinition, buildId: string) =>
  Math.max(
    0,
    ...block.effects.flatMap((effect) =>
      'trigger' in effect && effect.trigger?.kind === 'adjacent-build-at-least' && effect.trigger.buildId === buildId
        ? [effect.trigger.amount]
        : [],
    ),
  );

const weightedPick = (candidates: PlacementCandidate[], rarityWeights: RarityWeights, seed: number) => {
  const weightFor = ({ block }: PlacementCandidate) => {
    return rarityWeights[block.rarity] * (block.shopWeight ?? 1);
  };
  const total = candidates.reduce((sum, candidate) => sum + weightFor(candidate), 0);
  let cursor = randomUnit(seed) * total;
  for (const candidate of candidates) {
    cursor -= weightFor(candidate);
    if (cursor <= 0) return candidate;
  }
  return candidates[candidates.length - 1];
};

export function generateEnemyBuild(
  data: GameData,
  run: number,
  seed: number,
  options: EnemyBuildOptions = {},
): EnemyBuild {
  if (data.rules.boardSize !== 5) throw new Error('Enemy generator currently requires a 5x5 board');
  const safeRun = Math.max(1, Math.floor(run));
  const rules = data.rules.enemyGeneration;
  const targetNodeCount = Math.min(rules.maxNodes, rules.startingNodes + (safeRun - 1) * rules.nodesPerRun);
  const level = levelForRun(data, safeRun);
  const budget = Math.max(0, Math.floor(options.budget ?? cumulativeBudgetForRun(data, safeRun)));
  const rarityWeights = rarityWeightsForLevel(data, level);
  const builds = data.buildDesign.builds;
  if (builds.length === 0) throw new Error('Enemy generator requires at least one build');
  const build = options.buildId
    ? builds.find((candidate) => candidate.id === options.buildId)
    : builds[Math.floor(randomUnit(seed * 17 + safeRun * 31) * builds.length)];
  if (!build) throw new Error(`Unknown enemy build "${options.buildId}"`);
  const blocksById = new Map(data.blocks.map((block) => [block.id, block]));
  const designs = data.buildDesign.skills.filter(
    (skill) => skill.status === 'playable' && skill.blockId && supportsBuild(skill, build),
  );
  if (options.requiredBlockId && !designs.some((skill) => skill.blockId === options.requiredBlockId)) {
    throw new Error(`Playable skill "${options.requiredBlockId}" is not linked to build "${build.id}"`);
  }

  const tryBuild = (nodeCount: number) => {
    const activeNodes = LAYOUT.slice(0, nodeCount);
    const neighborIndexesByNode = activeNodes.map((_, index) =>
      LAYOUT_EDGES.flatMap(([left, right]) => {
        if (left === index && right < nodeCount) return [right];
        if (right === index && left < nodeCount) return [left];
        return [];
      }),
    );
    const surroundingIndexesByNode = activeNodes.map((position, index) =>
      activeNodes.flatMap((candidate, candidateIndex) =>
        candidateIndex !== index &&
        Math.abs(candidate.row - position.row) <= 1 &&
        Math.abs(candidate.column - position.column) <= 1
          ? [candidateIndex]
          : [],
      ),
    );
    const hasAdjacentPayoff = designs.some((design) => {
      const block = design.blockId ? blocksById.get(design.blockId) : undefined;
      return (
        block &&
        design.buildLinks.some((link) => link.buildId === build.id && link.roles.includes('payoff')) &&
        adjacentBuildRequirement(block, build.id) > 0
      );
    });
    const payoffIndex = hasAdjacentPayoff
      ? surroundingIndexesByNode.reduce(
          (best, neighbors, index) =>
            index !== 0 && (best < 0 || neighbors.length >= surroundingIndexesByNode[best].length) ? index : best,
          -1,
        )
      : neighborIndexesByNode.reduce(
          (last, neighbors, index) => (index !== 0 && neighbors.length === 1 ? index : last),
          -1,
        );
    if (payoffIndex < 0) return null;
    const activeNodeKeys = new Set(activeNodes.map((position) => `${position.row}:${position.column}`));
    const payoffPosition = activeNodes[payoffIndex];
    const payoffKey = `${payoffPosition.row}:${payoffPosition.column}`;
    const candidateSets = activeNodes.map((position, index) => {
      const requiredPorts = [
        ...(index === 0 ? (['west'] as Direction[]) : []),
        ...neighborIndexesByNode[index].map((neighborIndex) => directionBetween(position, activeNodes[neighborIndex])),
      ];
      const desiredRole = index === 0 ? 'starter' : index === payoffIndex ? 'payoff' : null;
      return designs.flatMap((design) => {
        const block = design.blockId ? blocksById.get(design.blockId) : undefined;
        const buildLink = design.buildLinks.find((link) => link.buildId === build.id);
        if (!block || !buildLink) return [];
        if (desiredRole && !buildLink.roles.includes(desiredRole)) return [];
        if (!desiredRole && buildLink.roles.includes('payoff')) return [];
        if (
          index === payoffIndex &&
          adjacentBuildRequirement(block, build.id) > surroundingIndexesByNode[index].length
        ) {
          return [];
        }
        if (index === 0 && !axisValues(design, build.axisId).includes(build.id)) return [];
        const rotations = ROTATIONS.filter((rotation) => {
          const ports = rotatePorts(block.ports, rotation);
          return requiredPorts.every((required) => ports.includes(required));
        });
        return rotations.length > 0 ? [{ block, design, rotations }] : [];
      });
    });
    if (candidateSets.some((candidates) => candidates.length === 0)) return null;

    const forcedPayoff = options.requiredBlockId
      ? candidateSets[payoffIndex].find(({ block }) => block.id === options.requiredBlockId)
      : undefined;
    const selectedPayoff =
      forcedPayoff ?? weightedPick(candidateSets[payoffIndex], rarityWeights, seed * 101 + safeRun * 59);
    const payoffAdjacentBuildRequirement = adjacentBuildRequirement(selectedPayoff.block, build.id);
    if (payoffAdjacentBuildRequirement > 0) {
      candidateSets[payoffIndex] = candidateSets[payoffIndex].filter(
        ({ block }) =>
          adjacentBuildRequirement(block, build.id) === payoffAdjacentBuildRequirement &&
          (!forcedPayoff || block.id === forcedPayoff.block.id),
      );
      const requiredNeighborIndexes = new Set(
        surroundingIndexesByNode[payoffIndex].slice(0, payoffAdjacentBuildRequirement),
      );
      surroundingIndexesByNode[payoffIndex].forEach((index) => {
        candidateSets[index] = candidateSets[index].filter(({ block }) =>
          requiredNeighborIndexes.has(index) ? block.buildIds?.includes(build.id) : !block.buildIds?.includes(build.id),
        );
      });
      if (candidateSets.some((candidates) => candidates.length === 0)) return null;
    }

    const payoffNeedsMagicSigil = candidateSets[payoffIndex].every(({ block }) =>
      block.effects.some((effect) => 'trigger' in effect && effect.trigger?.kind === 'magic-sigil-level-at-least'),
    );
    if (payoffNeedsMagicSigil) {
      const sourceIndex = activeNodes.findIndex((position, index) => {
        if (index === payoffIndex) return false;
        return candidateSets[index].some(({ block, rotations }) =>
          rotations.some((rotation) =>
            block.effects
              .filter((effect) => effect.kind === 'inscribe-magic-sigil')
              .flatMap((effect) => effect.offsets)
              .some((authoredOffset) => {
                const offset = rotateCellOffset(authoredOffset, rotation);
                return (
                  position.row + offset.row === payoffPosition.row &&
                  position.column + offset.column === payoffPosition.column
                );
              }),
          ),
        );
      });
      if (sourceIndex < 0) return null;
      const sourcePosition = activeNodes[sourceIndex];
      candidateSets[sourceIndex] = candidateSets[sourceIndex].flatMap((candidate) => {
        const rotations = candidate.rotations.filter((rotation) =>
          candidate.block.effects
            .filter((effect) => effect.kind === 'inscribe-magic-sigil')
            .flatMap((effect) => effect.offsets)
            .some((authoredOffset) => {
              const offset = rotateCellOffset(authoredOffset, rotation);
              return (
                sourcePosition.row + offset.row === payoffPosition.row &&
                sourcePosition.column + offset.column === payoffPosition.column
              );
            }),
        );
        return rotations.length > 0 ? [{ ...candidate, rotations }] : [];
      });
    }

    const minimumRemainingCost = candidateSets.map((_, index) =>
      candidateSets
        .slice(index + 1)
        .reduce((total, candidates) => total + Math.min(...candidates.map(({ block }) => block.price)), 0),
    );
    const used = new Map<string, number>();
    const board: CircuitBoard = Array.from({ length: data.rules.boardSize }, () =>
      Array.from({ length: data.rules.boardSize }, () => null),
    );
    const placeNode = (index: number, totalCost: number, placedRequired: boolean): number | null => {
      if (index >= activeNodes.length) {
        if (options.requiredBlockId && !placedRequired) return null;
        return totalCost;
      }
      const candidates = candidateSets[index].filter(
        ({ block }) => (used.get(block.id) ?? 0) < 2 && totalCost + block.price + minimumRemainingCost[index] <= budget,
      );
      if (candidates.length === 0) return null;
      const preferred = weightedPick(candidates, rarityWeights, seed * 97 + safeRun * 53 + index * 29);
      const ordered = [preferred, ...candidates.filter((candidate) => candidate !== preferred)].sort(
        (left, right) =>
          Number(right.block.id === options.requiredBlockId) - Number(left.block.id === options.requiredBlockId),
      );
      for (const [candidateIndex, picked] of ordered.entries()) {
        const position = activeNodes[index];
        const rotationSeed = seed * 43 + safeRun * 31 + index * 71 + candidateIndex * 13;
        const orderedRotations = [...picked.rotations].sort((left, right) => {
          const score = (rotation: Rotation) =>
            picked.block.effects
              .filter((effect) => effect.kind === 'inscribe-magic-sigil')
              .flatMap((effect) => effect.offsets)
              .reduce((total, authoredOffset) => {
                const offset = rotateCellOffset(authoredOffset, rotation);
                const targetKey = `${position.row + offset.row}:${position.column + offset.column}`;
                return total + (targetKey === payoffKey ? 100 : activeNodeKeys.has(targetKey) ? 10 : 0);
              }, 0);
          const scoreDifference = score(right) - score(left);
          if (scoreDifference !== 0) return scoreDifference;
          return randomUnit(rotationSeed + left * 19) - randomUnit(rotationSeed + right * 19);
        });
        for (const rotation of orderedRotations.slice(0, 1)) {
          board[position.row][position.column] = { blockId: picked.block.id, rotation };
          used.set(picked.block.id, (used.get(picked.block.id) ?? 0) + 1);
          const result = placeNode(
            index + 1,
            totalCost + picked.block.price,
            placedRequired || picked.block.id === options.requiredBlockId,
          );
          if (result !== null) return result;
          const remainingCopies = (used.get(picked.block.id) ?? 1) - 1;
          if (remainingCopies === 0) used.delete(picked.block.id);
          else used.set(picked.block.id, remainingCopies);
          board[position.row][position.column] = null;
        }
      }
      return null;
    };

    const totalCost = placeNode(0, 0, false);
    return totalCost === null ? null : { board, totalCost };
  };

  for (let nodeCount = targetNodeCount; nodeCount >= 2; nodeCount -= 1) {
    const result = tryBuild(nodeCount);
    if (!result) continue;
    return {
      ...result,
      buildId: build.id,
      nodeCount,
      level,
      budget,
      maxHpBonus: maxHpBonusForLevel(data, level),
    };
  }

  const required = options.requiredBlockId ? ` containing ${options.requiredBlockId}` : '';
  throw new Error(`No ${build.id} enemy build${required} fits budget ${budget} on run ${safeRun}`);
}
