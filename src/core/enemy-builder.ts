import { rotatePorts } from './circuit';
import type {
  BlockDefinition,
  CircuitBoard,
  Direction,
  GameData,
  Rarity,
  Rotation,
  SkillDesignDefinition,
} from './types';

export type EnemyBuild = {
  board: CircuitBoard;
  traitId: 'poison' | 'charge';
  nodeCount: number;
  maxHpBonus: number;
};

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
  [2, 4],
  [3, 5],
  [4, 5],
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

const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
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

const traitValues = (skill: SkillDesignDefinition) =>
  skill.axisLinks.find((link) => link.axisId === 'trait')?.valueIds ?? [];

const supportsTrait = (skill: SkillDesignDefinition, traitId: EnemyBuild['traitId']) =>
  traitValues(skill).some((trait) => trait === 'neutral' || trait === traitId);

const rarityLimitFor = (data: GameData, run: number) => {
  if (run >= data.rules.enemyGeneration.legendaryUnlockRun) return RARITY_RANK.legendary;
  if (run >= data.rules.enemyGeneration.epicUnlockRun) return RARITY_RANK.epic;
  return RARITY_RANK.rare;
};

const weightedPick = (candidates: PlacementCandidate[], data: GameData, run: number, seed: number) => {
  const weightFor = ({ block }: PlacementCandidate) => {
    const rank = RARITY_RANK[block.rarity];
    const progressionBoost = 1 + Math.max(0, run - rank * 2) * rank * 0.18;
    return data.rules.rarityWeights[block.rarity] * (block.shopWeight ?? 1) * progressionBoost;
  };
  const total = candidates.reduce((sum, candidate) => sum + weightFor(candidate), 0);
  let cursor = randomUnit(seed) * total;
  for (const candidate of candidates) {
    cursor -= weightFor(candidate);
    if (cursor <= 0) return candidate;
  }
  return candidates[candidates.length - 1];
};

export function generateEnemyBuild(data: GameData, run: number, seed: number): EnemyBuild {
  if (data.rules.boardSize !== 5) throw new Error('Enemy generator currently requires a 5x5 board');
  const safeRun = Math.max(1, Math.floor(run));
  const rules = data.rules.enemyGeneration;
  const nodeCount = Math.min(rules.maxNodes, rules.startingNodes + (safeRun - 1) * rules.nodesPerRun);
  const traitId: EnemyBuild['traitId'] = randomUnit(seed * 17 + safeRun * 31) < 0.5 ? 'poison' : 'charge';
  const activeNodes = LAYOUT.slice(0, nodeCount);
  const blocksById = new Map(data.blocks.map((block) => [block.id, block]));
  const designs = data.buildDesign.skills.filter(
    (skill) => skill.status === 'playable' && skill.blockId && supportsTrait(skill, traitId),
  );
  const used = new Map<string, number>();
  const board: CircuitBoard = Array.from({ length: data.rules.boardSize }, () =>
    Array.from({ length: data.rules.boardSize }, () => null),
  );

  activeNodes.forEach((position, index) => {
    const neighborIndexes = LAYOUT_EDGES.flatMap(([left, right]) => {
      if (left === index && right < nodeCount) return [right];
      if (right === index && left < nodeCount) return [left];
      return [];
    });
    const requiredPorts = [
      ...(index === 0 ? (['west'] as Direction[]) : []),
      ...neighborIndexes.map((neighborIndex) => directionBetween(position, activeNodes[neighborIndex])),
    ];
    const isLeaf = index !== 0 && neighborIndexes.length === 1;
    const desiredRole = index === 0 ? 'starter' : isLeaf ? 'payoff' : null;
    const createCandidates = (respectRarity: boolean, respectCopies: boolean) =>
      designs.flatMap((design) => {
        const block = design.blockId ? blocksById.get(design.blockId) : undefined;
        const buildLink = design.buildLinks.find((link) => link.buildId === traitId);
        if (!block || !buildLink) return [];
        if (desiredRole && !buildLink.roles.includes(desiredRole)) return [];
        if (!desiredRole && buildLink.roles.includes('payoff')) return [];
        if (index === 0 && !traitValues(design).includes(traitId)) return [];
        if (respectRarity && !isLeaf && RARITY_RANK[block.rarity] > rarityLimitFor(data, safeRun)) return [];
        if (respectCopies && (used.get(block.id) ?? 0) >= 2) return [];
        const rotations = ROTATIONS.filter((rotation) => {
          const ports = rotatePorts(block.ports, rotation);
          return requiredPorts.every((required) => ports.includes(required));
        });
        return rotations.length > 0 ? [{ block, design, rotations }] : [];
      });
    const candidates =
      createCandidates(true, true).length > 0
        ? createCandidates(true, true)
        : createCandidates(false, true).length > 0
          ? createCandidates(false, true)
          : createCandidates(false, false);
    if (candidates.length === 0) {
      throw new Error(`No ${traitId} enemy node can connect at ${position.row}:${position.column}`);
    }
    const picked = weightedPick(candidates, data, safeRun, seed * 97 + safeRun * 53 + index * 29);
    const rotation =
      picked.rotations[Math.floor(randomUnit(seed * 43 + safeRun * 31 + index * 71) * picked.rotations.length)];
    board[position.row][position.column] = { blockId: picked.block.id, rotation };
    used.set(picked.block.id, (used.get(picked.block.id) ?? 0) + 1);
  });

  return { board, traitId, nodeCount, maxHpBonus: (safeRun - 1) * rules.hpGrowthPerRun };
}
