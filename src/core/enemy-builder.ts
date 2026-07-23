import { rotateCellOffset, rotatePorts } from './circuit';
import {
  bodyLevelForRun,
  totalBodyUpgradeCost,
  cumulativeBudgetForRun,
  levelForRun,
  maxHpBonusForBodyLevel,
  rarityWeightsForLevel,
} from './progression';
import type {
  BlockDefinition,
  BuildDefinition,
  CellPosition,
  CircuitBoard,
  Direction,
  GameData,
  PlacementPatternId,
  RarityWeights,
  Rotation,
  SkillDesignDefinition,
} from './types';

export type EnemyBuild = {
  board: CircuitBoard;
  heartPosition: CellPosition;
  buildId: string;
  circuitCoreId: PlacementPatternId;
  nodeCount: number;
  level: number;
  bodyLevel: number;
  budget: number;
  skillCost: number;
  bodyUpgradeCost: number;
  totalCost: number;
  maxHpBonus: number;
};

export type EnemyBuildOptions = {
  budget?: number;
  bodyLevel?: number;
  buildId?: string;
  circuitCoreId?: PlacementPatternId;
  requiredBlockId?: string;
  excludedBlockIds?: string[];
};

type LayoutNode = { row: number; column: number };
type PlacementCandidate = { block: BlockDefinition; design: SkillDesignDefinition; rotations: Rotation[] };

type EnemyLayout = {
  heartPosition: CellPosition;
  nodes: LayoutNode[];
  edges: Array<[number, number]>;
  heartNodeIndexes: number[];
};

type FlowEdge = { to: number; reverse: number; capacity: number; cost: number };

const minimumAssignmentCost = (
  candidateSets: PlacementCandidate[][],
  blockCapacities?: ReadonlyMap<string, number>,
): number | null => {
  const blockIds = [...new Set(candidateSets.flatMap((candidates) => candidates.map(({ block }) => block.id)))];
  const blockIndex = new Map(blockIds.map((id, index) => [id, index]));
  const source = 0;
  const slotOffset = 1;
  const blockOffset = slotOffset + candidateSets.length;
  const sink = blockOffset + blockIds.length;
  const graph: FlowEdge[][] = Array.from({ length: sink + 1 }, () => []);
  const addEdge = (from: number, to: number, capacity: number, cost: number) => {
    const forward: FlowEdge = { to, reverse: graph[to].length, capacity, cost };
    const reverse: FlowEdge = { to: from, reverse: graph[from].length, capacity: 0, cost: -cost };
    graph[from].push(forward);
    graph[to].push(reverse);
  };

  candidateSets.forEach((candidates, slotIndex) => {
    addEdge(source, slotOffset + slotIndex, 1, 0);
    candidates.forEach(({ block }) => {
      addEdge(slotOffset + slotIndex, blockOffset + blockIndex.get(block.id)!, 1, block.price);
    });
  });
  blockIds.forEach((id, index) => addEdge(blockOffset + index, sink, blockCapacities?.get(id) ?? 2, 0));

  let totalCost = 0;
  for (let flow = 0; flow < candidateSets.length; flow += 1) {
    const distance = Array.from({ length: graph.length }, () => Number.POSITIVE_INFINITY);
    const previousNode = Array.from({ length: graph.length }, () => -1);
    const previousEdge = Array.from({ length: graph.length }, () => -1);
    distance[source] = 0;
    for (let pass = 0; pass < graph.length - 1; pass += 1) {
      let changed = false;
      graph.forEach((edges, from) => {
        if (!Number.isFinite(distance[from])) return;
        edges.forEach((edge, edgeIndex) => {
          if (edge.capacity <= 0 || distance[from] + edge.cost >= distance[edge.to]) return;
          distance[edge.to] = distance[from] + edge.cost;
          previousNode[edge.to] = from;
          previousEdge[edge.to] = edgeIndex;
          changed = true;
        });
      });
      if (!changed) break;
    }
    if (!Number.isFinite(distance[sink])) return null;
    totalCost += distance[sink];
    for (let node = sink; node !== source; node = previousNode[node]) {
      const edge = graph[previousNode[node]][previousEdge[node]];
      edge.capacity -= 1;
      graph[node][edge.reverse].capacity += 1;
    }
  }
  return totalCost;
};

const rotateLayoutPosition = (position: CellPosition, rotation: Rotation): CellPosition => {
  let result = { ...position };
  for (let step = 0; step < rotation; step += 1) {
    result = { row: result.column, column: 4 - result.row };
  }
  return result;
};

const EDGE_LAYOUT: EnemyLayout = {
  heartPosition: { row: 2, column: 0 },
  nodes: [
    { row: 2, column: 1 },
    { row: 1, column: 1 },
    { row: 1, column: 0 },
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
    { row: 3, column: 0 },
  ],
  edges: [
    [0, 1],
    [2, 1],
    [0, 3],
    [1, 4],
    [4, 5],
    [5, 6],
    [3, 7],
    [7, 8],
    [2, 9],
    [9, 10],
    [10, 11],
    [11, 12],
    [12, 13],
  ],
  heartNodeIndexes: [0, 2, 14],
};

const CENTER_LAYOUT: EnemyLayout = {
  heartPosition: { row: 2, column: 2 },
  nodes: [
    { row: 2, column: 1 },
    { row: 1, column: 1 },
    { row: 1, column: 2 },
    { row: 0, column: 2 },
    { row: 0, column: 1 },
    { row: 0, column: 0 },
    { row: 1, column: 0 },
    { row: 2, column: 0 },
    { row: 3, column: 0 },
    { row: 3, column: 1 },
    { row: 4, column: 1 },
    { row: 4, column: 2 },
    { row: 4, column: 3 },
    { row: 3, column: 3 },
    { row: 2, column: 3 },
  ],
  edges: [
    [0, 1],
    [2, 1],
    [2, 3],
    [1, 4],
    [4, 5],
    [5, 6],
    [0, 7],
    [7, 8],
    [8, 9],
    [9, 10],
    [10, 11],
    [11, 12],
    [12, 13],
    [13, 14],
  ],
  heartNodeIndexes: [0, 2, 14],
};

const LIGHT_VEIN_LAYOUT: EnemyLayout = {
  heartPosition: { row: 2, column: 0 },
  nodes: [
    { row: 2, column: 1 },
    { row: 1, column: 1 },
    { row: 1, column: 2 },
    { row: 1, column: 3 },
    { row: 2, column: 2 },
    { row: 3, column: 1 },
    { row: 3, column: 2 },
    { row: 3, column: 3 },
    { row: 2, column: 3 },
    { row: 2, column: 4 },
    { row: 1, column: 4 },
    { row: 0, column: 4 },
    { row: 0, column: 3 },
    { row: 3, column: 4 },
    { row: 4, column: 4 },
  ],
  edges: [
    [0, 1],
    [0, 5],
    [1, 2],
    [2, 3],
    [2, 4],
    [5, 6],
    [6, 7],
    [3, 8],
    [4, 8],
    [7, 8],
    [8, 9],
    [3, 10],
    [10, 11],
    [11, 12],
    [7, 13],
    [13, 14],
  ],
  heartNodeIndexes: [0],
};

const COMPACT_LAYOUT: EnemyLayout = {
  heartPosition: { row: 2, column: 0 },
  nodes: [
    { row: 2, column: 1 },
    { row: 2, column: 2 },
    { row: 2, column: 3 },
    { row: 2, column: 4 },
    { row: 1, column: 4 },
    { row: 1, column: 3 },
    { row: 1, column: 2 },
    { row: 1, column: 1 },
    { row: 1, column: 0 },
    { row: 0, column: 0 },
    { row: 0, column: 1 },
    { row: 0, column: 2 },
    { row: 0, column: 3 },
    { row: 0, column: 4 },
    { row: 3, column: 4 },
  ],
  edges: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 8],
    [8, 9],
    [9, 10],
    [10, 11],
    [11, 12],
    [12, 13],
    [3, 14],
  ],
  heartNodeIndexes: [0],
};

const LAYOUTS: EnemyLayout[] = [
  CENTER_LAYOUT,
  ...([0, 1, 2, 3] as Rotation[]).map((rotation) => ({
    heartPosition: rotateLayoutPosition(EDGE_LAYOUT.heartPosition, rotation),
    nodes: EDGE_LAYOUT.nodes.map((position) => rotateLayoutPosition(position, rotation)),
    edges: EDGE_LAYOUT.edges,
    heartNodeIndexes: EDGE_LAYOUT.heartNodeIndexes,
  })),
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
  const isCircuitCoreOnlySharedSkill =
    build.axisId === 'trait' &&
    skill.scope === 'shared' &&
    Boolean(skill.circuitCoreRoles?.length) &&
    values.includes(skill.placementPatternId) &&
    !skill.buildLinks.some((link) => values.includes(link.buildId));
  return (
    values.includes(build.id) ||
    (build.axisId === 'trait' && values.includes('neutral')) ||
    isCircuitCoreOnlySharedSkill
  );
};

const adjacentPoweredRequirement = (block: BlockDefinition) =>
  Math.max(
    0,
    ...block.effects.flatMap((effect) =>
      'trigger' in effect && effect.trigger?.kind === 'adjacent-powered-at-least' ? [effect.trigger.amount] : [],
    ),
  );

const topologyRequirement = (block: BlockDefinition, kind: 'branch-at-least' | 'merge-at-least') =>
  Math.max(
    0,
    ...block.effects.flatMap((effect) =>
      'trigger' in effect && effect.trigger?.kind === kind ? [effect.trigger.amount] : [],
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

const rotationWithPorts = (block: BlockDefinition, requiredPorts: Direction[]): Rotation | null =>
  ROTATIONS.find((rotation) => {
    const ports = rotatePorts(block.ports, rotation);
    return requiredPorts.every((port) => ports.includes(port));
  }) ?? null;

const generatePacketEnemyBuild = (
  data: GameData,
  safeRun: number,
  seed: number,
  options: EnemyBuildOptions,
): EnemyBuild => {
  const bodyLevel =
    options.bodyLevel === undefined
      ? bodyLevelForRun(data, safeRun)
      : Math.min(data.rules.bodyUpgrades.maxLevel, Math.max(1, Math.floor(options.bodyLevel)));
  const level = options.bodyLevel === undefined ? levelForRun(data, safeRun) : bodyLevel;
  const budget = Math.max(0, Math.floor(options.budget ?? cumulativeBudgetForRun(data, safeRun)));
  const bodyUpgradeCost = totalBodyUpgradeCost(data, bodyLevel);
  const skillBudget = Math.max(0, budget - bodyUpgradeCost);
  const builds = data.buildDesign.builds;
  const build = options.buildId
    ? builds.find((candidate) => candidate.id === options.buildId)
    : builds[Math.floor(randomUnit(seed * 17 + safeRun * 31) * builds.length)];
  if (!build) throw new Error(`Unknown enemy build "${options.buildId}"`);

  const corePatterns = data.buildDesign.placementPatterns.filter((pattern) => pattern.category === 'core');
  const requiredDesign = options.requiredBlockId
    ? data.buildDesign.skills.find((skill) => skill.blockId === options.requiredBlockId)
    : undefined;
  const requiredCore =
    requiredDesign && corePatterns.some((pattern) => pattern.id === requiredDesign.placementPatternId);
  const circuitCoreId =
    options.circuitCoreId ??
    (requiredCore
      ? requiredDesign.placementPatternId
      : corePatterns[Math.floor(randomUnit(seed * 29 + safeRun * 43) * corePatterns.length)]?.id);
  if (!circuitCoreId || !corePatterns.some((pattern) => pattern.id === circuitCoreId)) {
    throw new Error(`Unknown circuit core "${circuitCoreId}"`);
  }
  if (options.circuitCoreId && requiredCore && options.circuitCoreId !== requiredDesign.placementPatternId) {
    throw new Error(
      `Playable skill "${options.requiredBlockId}" belongs to circuit core "${requiredDesign.placementPatternId}", not "${options.circuitCoreId}"`,
    );
  }

  const excluded = new Set(options.excludedBlockIds ?? []);
  const designByBlockId = new Map(
    data.buildDesign.skills.flatMap((skill) => (skill.blockId ? [[skill.blockId, skill] as const] : [])),
  );
  const candidates = data.blocks.filter((block) => {
    const design = designByBlockId.get(block.id);
    return (
      block.packet &&
      !excluded.has(block.id) &&
      design?.status === 'playable' &&
      design.buildLinks.some((link) => link.buildId === build.id)
    );
  });
  const required = options.requiredBlockId
    ? candidates.find((block) => block.id === options.requiredBlockId)
    : undefined;
  if (options.requiredBlockId && !required) {
    throw new Error(`Playable skill "${options.requiredBlockId}" is not linked to build "${build.id}"`);
  }

  const sourceStates = new Set<string>(
    candidates.flatMap(
      (block) =>
        block.packet?.effects.flatMap((effect) => (effect.kind === 'generate-packet' ? [effect.payload] : [])) ?? [],
    ),
  );
  const sinkStates = new Set<string>(
    candidates.flatMap(
      (block) =>
        block.packet?.effects.flatMap((effect) => (effect.kind === 'convert-packet' ? [effect.input] : [])) ?? [],
    ),
  );
  const carriedState =
    [build.id, 'charge', 'poison'].find((state) => sourceStates.has(state) && sinkStates.has(state)) ??
    [...sourceStates].find((state) => sinkStates.has(state));
  if (!carriedState) throw new Error(`Build "${build.id}" needs a packet source and converter for one shared state`);

  const sourceCandidates = candidates.filter(
    (block) =>
      block.packet?.effects.some((effect) => effect.kind === 'generate-packet' && effect.payload === carriedState) &&
      rotationWithPorts(block, ['west', 'east']) !== null,
  );
  const operatorCandidates = candidates.filter(
    (block) =>
      designByBlockId.get(block.id)?.placementPatternId === circuitCoreId &&
      block.packet?.effects.some((effect) => effect.kind !== 'generate-packet' && effect.kind !== 'convert-packet') &&
      rotationWithPorts(block, ['west', 'east']) !== null,
  );
  const sinkCandidates = candidates.filter(
    (block) =>
      block.packet?.effects.some((effect) => effect.kind === 'convert-packet' && effect.input === carriedState) &&
      rotationWithPorts(block, ['west']) !== null,
  );
  if (sourceCandidates.length === 0 || operatorCandidates.length === 0 || sinkCandidates.length === 0) {
    throw new Error(`Build "${build.id}" + "${circuitCoreId}" lacks a source, operator, or converter`);
  }

  const combinations = sourceCandidates.flatMap((source) =>
    operatorCandidates.flatMap((operator) =>
      sinkCandidates.flatMap((sink) => {
        const blocks = [...new Map([source, operator, sink].map((block) => [block.id, block])).values()];
        if (blocks.length < 3) return [];
        if (required && !blocks.some((block) => block.id === required.id)) {
          if (required.packet?.effects.some((effect) => effect.kind === 'convert-packet')) {
            blocks[2] = required;
          } else if (required.packet?.effects.some((effect) => effect.kind === 'generate-packet')) {
            blocks[0] = required;
          } else {
            blocks[1] = required;
          }
        }
        if (new Set(blocks.map((block) => block.id)).size < 3) return [];
        const rotations = blocks.map((block, index) =>
          rotationWithPorts(block, index === blocks.length - 1 ? ['west'] : ['west', 'east']),
        );
        if (rotations.some((rotation) => rotation === null)) return [];
        const skillCost = blocks.reduce((total, block) => total + block.price, 0);
        return skillCost <= skillBudget ? [{ blocks, rotations: rotations as Rotation[], skillCost }] : [];
      }),
    ),
  );
  if (combinations.length === 0) {
    const requiredLabel = required ? ` containing ${required.id}` : '';
    throw new Error(
      `No ${build.id} + ${circuitCoreId} packet build${requiredLabel} fits budget ${budget} on run ${safeRun}`,
    );
  }
  combinations.sort(
    (left, right) =>
      left.skillCost - right.skillCost ||
      left.blocks
        .map((block) => block.id)
        .join(':')
        .localeCompare(right.blocks.map((block) => block.id).join(':')),
  );
  const affordable = combinations.slice(0, Math.min(6, combinations.length));
  const selected = affordable[Math.floor(randomUnit(seed * 97 + safeRun * 53) * affordable.length)];
  const board: CircuitBoard = Array.from({ length: data.rules.boardSize }, () =>
    Array.from({ length: data.rules.boardSize }, () => null),
  );
  selected.blocks.forEach((block, index) => {
    board[2][index + 1] = { blockId: block.id, rotation: selected.rotations[index] };
  });

  return {
    board,
    heartPosition: { row: 2, column: 0 },
    buildId: build.id,
    circuitCoreId,
    nodeCount: selected.blocks.length,
    level,
    bodyLevel,
    budget,
    skillCost: selected.skillCost,
    bodyUpgradeCost,
    totalCost: selected.skillCost + bodyUpgradeCost,
    maxHpBonus: maxHpBonusForBodyLevel(data, bodyLevel),
  };
};

export function generateEnemyBuild(
  data: GameData,
  run: number,
  seed: number,
  options: EnemyBuildOptions = {},
): EnemyBuild {
  if (data.rules.boardSize !== 5) throw new Error('Enemy generator currently requires a 5x5 board');
  const safeRun = Math.max(1, Math.floor(run));
  if (data.blocks.some((block) => block.packet)) {
    return generatePacketEnemyBuild(data, safeRun, seed, options);
  }
  const rules = data.rules.enemyGeneration;
  const targetNodeCount = Math.min(rules.maxNodes, rules.startingNodes + (safeRun - 1) * rules.nodesPerRun);
  const bodyLevel =
    options.bodyLevel === undefined
      ? bodyLevelForRun(data, safeRun)
      : Math.min(data.rules.bodyUpgrades.maxLevel, Math.max(1, Math.floor(options.bodyLevel)));
  const level = options.bodyLevel === undefined ? levelForRun(data, safeRun) : bodyLevel;
  const budget = Math.max(0, Math.floor(options.budget ?? cumulativeBudgetForRun(data, safeRun)));
  const bodyUpgradeCost = totalBodyUpgradeCost(data, bodyLevel);
  const skillBudget = Math.max(0, budget - bodyUpgradeCost);
  const rarityWeights = rarityWeightsForLevel(data, level);
  const corePatterns = data.buildDesign.placementPatterns.filter((pattern) => pattern.category === 'core');
  if (corePatterns.length === 0) throw new Error('Enemy generator requires at least one circuit core');
  const corePatternIds = new Set(corePatterns.map((pattern) => pattern.id));
  const requiredDesign = options.requiredBlockId
    ? data.buildDesign.skills.find((skill) => skill.blockId === options.requiredBlockId)
    : undefined;
  const requiredCoreId =
    requiredDesign && corePatternIds.has(requiredDesign.placementPatternId)
      ? requiredDesign.placementPatternId
      : undefined;
  if (options.circuitCoreId && requiredCoreId && options.circuitCoreId !== requiredCoreId) {
    throw new Error(
      `Playable skill "${options.requiredBlockId}" belongs to circuit core "${requiredCoreId}", not "${options.circuitCoreId}"`,
    );
  }
  const selectedCoreId = options.circuitCoreId ?? requiredCoreId;
  const selectedCoreIndex = selectedCoreId
    ? corePatterns.findIndex((pattern) => pattern.id === selectedCoreId)
    : Math.floor(randomUnit(seed * 29 + safeRun * 43) * corePatterns.length);
  const circuitCore = corePatterns[selectedCoreIndex];
  if (!circuitCore) throw new Error(`Unknown circuit core "${selectedCoreId}"`);
  const requiredNeedsTerminalRoute = options.requiredBlockId
    ? data.blocks
        .find((block) => block.id === options.requiredBlockId)
        ?.effects.some((effect) => effect.kind === 'release-charge')
    : false;
  const layout =
    circuitCore.id === 'light-vein'
      ? LIGHT_VEIN_LAYOUT
      : skillBudget < data.rules.startingCoins || requiredNeedsTerminalRoute
        ? COMPACT_LAYOUT
        : LAYOUTS[Math.floor(randomUnit(seed * 47 + safeRun * 13) * LAYOUTS.length)];
  const builds = data.buildDesign.builds;
  if (builds.length === 0) throw new Error('Enemy generator requires at least one build');
  const selectedBuildIndex = options.buildId
    ? builds.findIndex((candidate) => candidate.id === options.buildId)
    : Math.floor(randomUnit(seed * 17 + safeRun * 31) * builds.length);
  const firstBuild = builds[selectedBuildIndex];
  if (!firstBuild) throw new Error(`Unknown enemy build "${options.buildId}"`);
  const buildCandidates = options.buildId
    ? [firstBuild]
    : builds.map((_, offset) => builds[(selectedBuildIndex + offset) % builds.length]);
  const blocksById = new Map(data.blocks.map((block) => [block.id, block]));

  const tryBuild = (
    build: BuildDefinition,
    designs: SkillDesignDefinition[],
    nodeCount: number,
    reservationAttempt: number,
  ) => {
    const activeNodes = layout.nodes.slice(0, nodeCount);
    const neighborIndexesByNode = activeNodes.map((_, index) =>
      layout.edges.flatMap(([left, right]) => {
        if (left === index && right < activeNodes.length) return [right];
        if (right === index && left < activeNodes.length) return [left];
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
    const distanceByIndex = new Map<number, number>(
      layout.heartNodeIndexes.filter((index) => index < activeNodes.length).map((index) => [index, 1]),
    );
    const distanceQueue = [...distanceByIndex.keys()];
    while (distanceQueue.length > 0) {
      const index = distanceQueue.shift()!;
      const nextDistance = (distanceByIndex.get(index) ?? 0) + 1;
      neighborIndexesByNode[index].forEach((neighborIndex) => {
        if ((distanceByIndex.get(neighborIndex) ?? Number.POSITIVE_INFINITY) <= nextDistance) return;
        distanceByIndex.set(neighborIndex, nextDistance);
        distanceQueue.push(neighborIndex);
      });
    }
    const upstreamIndexesByNode = neighborIndexesByNode.map((neighbors, index) =>
      neighbors.filter((neighborIndex) => distanceByIndex.get(neighborIndex) === (distanceByIndex.get(index) ?? 0) - 1),
    );
    const downstreamIndexesByNode = neighborIndexesByNode.map((neighbors, index) =>
      neighbors.filter((neighborIndex) => distanceByIndex.get(neighborIndex) === (distanceByIndex.get(index) ?? 0) + 1),
    );
    const realTraitRoles = (design: SkillDesignDefinition) => {
      if (!axisValues(design, build.axisId).includes(build.id)) return [];
      return design.buildLinks.find((link) => link.buildId === build.id)?.roles ?? [];
    };
    const requiredUsesCorePayoff = requiredDesign?.circuitCoreRoles?.includes('payoff') ?? false;
    const payoffDesigns = designs.filter((design) => {
      if (options.requiredBlockId) return design.blockId === options.requiredBlockId;
      return realTraitRoles(design).includes('payoff');
    });
    const topologyPayoffIndexes = activeNodes.flatMap((_, index) => {
      if (index === 0) return [];
      const fits = payoffDesigns.some((design) => {
        const block = design.blockId ? blocksById.get(design.blockId) : undefined;
        if (!block) return false;
        const branch = topologyRequirement(block, 'branch-at-least');
        const merge = topologyRequirement(block, 'merge-at-least');
        return (
          (branch > 0 && branch <= downstreamIndexesByNode[index].length) ||
          (merge > 0 && merge <= upstreamIndexesByNode[index].length)
        );
      });
      return fits ? [index] : [];
    });
    const hasAdjacentPayoff = payoffDesigns.some((design) => {
      const block = design.blockId ? blocksById.get(design.blockId) : undefined;
      return block && adjacentPoweredRequirement(block) > 0;
    });
    const payoffIndex =
      topologyPayoffIndexes.length > 0
        ? topologyPayoffIndexes[Math.floor(randomUnit(seed * 83 + safeRun * 37) * topologyPayoffIndexes.length)]
        : hasAdjacentPayoff
          ? surroundingIndexesByNode.reduce(
              (best, neighbors, index) =>
                index !== 0 && (best < 0 || neighbors.length >= surroundingIndexesByNode[best].length) ? index : best,
              -1,
            )
          : activeNodes.reduce(
              (farthest, _, index) =>
                index !== 0 &&
                (farthest < 0 || (distanceByIndex.get(index) ?? 0) > (distanceByIndex.get(farthest) ?? 0))
                  ? index
                  : farthest,
              -1,
            );
    if (payoffIndex < 0) return null;
    const activeNodeKeys = new Set(activeNodes.map((position) => `${position.row}:${position.column}`));
    const payoffPosition = activeNodes[payoffIndex];
    const payoffKey = `${payoffPosition.row}:${payoffPosition.column}`;
    const candidateSets = activeNodes.map((position, index) => {
      const requiredPorts = [
        ...(layout.heartNodeIndexes.includes(index) ? [directionBetween(position, layout.heartPosition)] : []),
        ...neighborIndexesByNode[index].map((neighborIndex) => directionBetween(position, activeNodes[neighborIndex])),
      ];
      const desiredRole = index === 0 ? 'starter' : index === payoffIndex ? 'payoff' : null;
      return designs.flatMap((design) => {
        const block = design.blockId ? blocksById.get(design.blockId) : undefined;
        const buildLink = design.buildLinks.find((link) => link.buildId === build.id);
        if (!block || !buildLink) return [];
        const isRequiredFallbackPayoff =
          desiredRole === 'payoff' && !requiredUsesCorePayoff && design.blockId === options.requiredBlockId;
        if (desiredRole === 'starter' && !design.circuitCoreRoles?.includes('starter')) return [];
        if (desiredRole === 'payoff' && !payoffDesigns.includes(design) && !isRequiredFallbackPayoff) {
          return [];
        }
        if (desiredRole === 'payoff' && requiredUsesCorePayoff && design.placementPatternId !== circuitCore.id) {
          return [];
        }
        if (desiredRole === 'starter' && design.placementPatternId !== circuitCore.id) return [];
        if (!desiredRole && design.circuitCoreRoles?.includes('payoff')) return [];
        if (index === payoffIndex && adjacentPoweredRequirement(block) > surroundingIndexesByNode[index].length) {
          return [];
        }
        if (
          index === payoffIndex &&
          topologyRequirement(block, 'branch-at-least') > downstreamIndexesByNode[index].length
        ) {
          return [];
        }
        if (
          index === payoffIndex &&
          topologyRequirement(block, 'merge-at-least') > upstreamIndexesByNode[index].length
        ) {
          return [];
        }
        const rotations = ROTATIONS.filter((rotation) => {
          const ports = rotatePorts(block.ports, rotation);
          return requiredPorts.every((required) => ports.includes(required));
        });
        return rotations.length > 0 ? [{ block, design, rotations }] : [];
      });
    });
    if (candidateSets.some((candidates) => candidates.length === 0)) return null;

    const requiredIndex = options.requiredBlockId
      ? candidateSets.findIndex((candidates) => candidates.some(({ block }) => block.id === options.requiredBlockId))
      : -1;
    if (options.requiredBlockId && requiredIndex < 0) return null;
    if (requiredIndex >= 0) {
      candidateSets[requiredIndex] = candidateSets[requiredIndex].filter(
        ({ block }) => block.id === options.requiredBlockId,
      );
    }

    const forcedPayoff =
      requiredIndex === payoffIndex
        ? candidateSets[payoffIndex].find(({ block }) => block.id === options.requiredBlockId)
        : undefined;
    const selectedPayoff =
      forcedPayoff ??
      weightedPick(candidateSets[payoffIndex], rarityWeights, seed * 101 + safeRun * 59 + reservationAttempt * 173);
    const payoffAdjacentPoweredRequirement = adjacentPoweredRequirement(selectedPayoff.block);
    if (payoffAdjacentPoweredRequirement > 0) {
      candidateSets[payoffIndex] = candidateSets[payoffIndex].filter(
        ({ block }) =>
          adjacentPoweredRequirement(block) === payoffAdjacentPoweredRequirement &&
          (!forcedPayoff || block.id === forcedPayoff.block.id),
      );
      if (candidateSets.some((candidates) => candidates.length === 0)) return null;
    }

    const payoffNeedsMagicSigil = candidateSets[payoffIndex].every(({ block }) =>
      block.effects.some(
        (effect) =>
          ('trigger' in effect && effect.trigger?.kind === 'magic-sigil-level-at-least') ||
          ('scaling' in effect &&
            (effect.scaling?.kind === 'magic-sigil-level' || effect.scaling?.kind === 'magic-sigil-count')),
      ),
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
    const ancestorIndexesFor = (targetIndex: number) => {
      const ancestors = new Set<number>();
      const queue = [...upstreamIndexesByNode[targetIndex]];
      while (queue.length > 0) {
        const index = queue.shift()!;
        if (ancestors.has(index)) continue;
        ancestors.add(index);
        queue.push(...upstreamIndexesByNode[index]);
      }
      return ancestors;
    };
    const reservedTraitRoleIndexes = new Set<number>();
    let traitPayoffIndex: number | null = null;
    let traitStarterIndex: number | null = null;
    let payoffAncestorIndexes = new Set<number>();
    for (const role of ['payoff', 'starter'] as const) {
      if (build.id === 'charge' && role === 'starter' && traitPayoffIndex !== null) {
        payoffAncestorIndexes = ancestorIndexesFor(traitPayoffIndex);
      }
      let placements = candidateSets.flatMap((candidates, index) =>
        reservedTraitRoleIndexes.has(index)
          ? []
          : candidates.flatMap((candidate) =>
              realTraitRoles(candidate.design).includes(role) ? [{ index, candidate }] : [],
            ),
      );
      if (role === 'payoff' && requiredDesign && realTraitRoles(requiredDesign).includes('payoff')) {
        placements = placements.filter(({ candidate }) => candidate.block.id === options.requiredBlockId);
      }
      if (build.id === 'charge' && role === 'starter') {
        placements = placements.filter(({ index }) => payoffAncestorIndexes.has(index));
      }
      placements.sort(
        (left, right) =>
          left.candidate.block.price - right.candidate.block.price ||
          candidateSets[left.index].length - candidateSets[right.index].length ||
          left.index - right.index ||
          left.candidate.block.id.localeCompare(right.candidate.block.id),
      );
      const uniqueCandidates = [
        ...new Map(placements.map(({ candidate }) => [candidate.block.id, candidate])).values(),
      ];
      if (uniqueCandidates.length === 0) return null;
      const preferredBlock = weightedPick(
        uniqueCandidates,
        rarityWeights,
        seed * 149 + safeRun * 67 + (role === 'payoff' ? 1 : 2) + reservationAttempt * 179,
      ).block.id;
      const selected = placements.find(({ candidate }) => candidate.block.id === preferredBlock) ?? placements[0];
      if (!selected) return null;
      if (role === 'payoff') traitPayoffIndex = selected.index;
      if (role === 'starter') traitStarterIndex = selected.index;
      reservedTraitRoleIndexes.add(selected.index);
      candidateSets[selected.index] = candidateSets[selected.index].filter((candidate) =>
        realTraitRoles(candidate.design).includes(role),
      );
    }
    if (build.id === 'charge') {
      const chargeSourceIndexes = [traitStarterIndex].filter((index): index is number => index !== null);
      candidateSets.forEach((candidates, index) => {
        if (index === traitPayoffIndex) return;
        const ancestors = ancestorIndexesFor(index);
        if (chargeSourceIndexes.every((sourceIndex) => ancestors.has(sourceIndex))) return;
        candidateSets[index] = candidates.filter(
          ({ block }) => !block.effects.some((effect) => effect.kind === 'release-charge'),
        );
      });
      if (candidateSets.some((candidates) => candidates.length === 0)) return null;
    }
    const minimumCost = minimumAssignmentCost(candidateSets);
    if (minimumCost === null || minimumCost > skillBudget) return null;

    const placementOrder = candidateSets
      .map((_, index) => index)
      .sort((left, right) => {
        const roleScore = (index: number, role: 'starter' | 'payoff') =>
          candidateSets[index].filter((candidate) => realTraitRoles(candidate.design).includes(role)).length;
        const leftPayoffs = roleScore(left, 'payoff');
        const rightPayoffs = roleScore(right, 'payoff');
        if (Number(leftPayoffs === 0) !== Number(rightPayoffs === 0)) {
          return Number(leftPayoffs === 0) - Number(rightPayoffs === 0);
        }
        if (leftPayoffs !== rightPayoffs) return leftPayoffs - rightPayoffs;
        return candidateSets[left].length - candidateSets[right].length || left - right;
      });
    const used = new Map<string, number>();
    const board: CircuitBoard = Array.from({ length: data.rules.boardSize }, () =>
      Array.from({ length: data.rules.boardSize }, () => null),
    );
    const rotationFor = (index: number, picked: PlacementCandidate, salt: number) => {
      const position = activeNodes[index];
      const rotationSeed = seed * 43 + safeRun * 31 + index * 71 + salt * 13;
      return [...picked.rotations].sort((left, right) => {
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
      })[0];
    };
    const placeNode = (
      step: number,
      totalCost: number,
      placedRequired: boolean,
      placedTraitStarter: boolean,
      placedTraitPayoff: boolean,
    ): number | null => {
      if (step >= placementOrder.length) {
        if (options.requiredBlockId && !placedRequired) return null;
        if (!placedTraitStarter || !placedTraitPayoff) return null;
        return totalCost;
      }
      const remainingIndexes = placementOrder.slice(step);
      if (
        (!placedTraitStarter &&
          !remainingIndexes.some((index) =>
            candidateSets[index].some((candidate) => realTraitRoles(candidate.design).includes('starter')),
          )) ||
        (!placedTraitPayoff &&
          !remainingIndexes.some((index) =>
            candidateSets[index].some((candidate) => realTraitRoles(candidate.design).includes('payoff')),
          ))
      ) {
        return null;
      }
      const index = placementOrder[step];
      const candidates = candidateSets[index].filter(
        ({ block }) => (used.get(block.id) ?? 0) < 2 && totalCost + block.price <= skillBudget,
      );
      if (candidates.length === 0) return null;
      const preferred = weightedPick(candidates, rarityWeights, seed * 97 + safeRun * 53 + index * 29);
      const ordered = [preferred, ...candidates.filter((candidate) => candidate !== preferred)].sort(
        (left, right) =>
          Number(right.block.id === options.requiredBlockId) - Number(left.block.id === options.requiredBlockId) ||
          Number(!placedTraitPayoff && realTraitRoles(right.design).includes('payoff')) -
            Number(!placedTraitPayoff && realTraitRoles(left.design).includes('payoff')) ||
          Number(!placedTraitStarter && realTraitRoles(right.design).includes('starter')) -
            Number(!placedTraitStarter && realTraitRoles(left.design).includes('starter')) ||
          Number(right === preferred) - Number(left === preferred),
      );
      for (const [candidateIndex, picked] of ordered.entries()) {
        const position = activeNodes[index];
        board[position.row][position.column] = {
          blockId: picked.block.id,
          rotation: rotationFor(index, picked, candidateIndex),
        };
        used.set(picked.block.id, (used.get(picked.block.id) ?? 0) + 1);
        const remainingCandidateSets = placementOrder
          .slice(step + 1)
          .map((remainingIndex) => candidateSets[remainingIndex]);
        const remainingCapacities = new Map(
          data.blocks.map((block) => [block.id, Math.max(0, 2 - (used.get(block.id) ?? 0))]),
        );
        const remainingCost = minimumAssignmentCost(remainingCandidateSets, remainingCapacities);
        const result =
          remainingCost !== null && totalCost + picked.block.price + remainingCost <= skillBudget
            ? placeNode(
                step + 1,
                totalCost + picked.block.price,
                placedRequired || picked.block.id === options.requiredBlockId,
                placedTraitStarter || realTraitRoles(picked.design).includes('starter'),
                placedTraitPayoff || realTraitRoles(picked.design).includes('payoff'),
              )
            : null;
        if (result !== null) return result;
        const remainingCopies = (used.get(picked.block.id) ?? 1) - 1;
        if (remainingCopies === 0) used.delete(picked.block.id);
        else used.set(picked.block.id, remainingCopies);
        board[position.row][position.column] = null;
      }
      return null;
    };

    const totalCost = placeNode(0, 0, false, false, false);
    if (totalCost === null) return null;
    return { board, skillCost: totalCost };
  };

  for (const build of buildCandidates) {
    const designs = data.buildDesign.skills.filter(
      (skill) =>
        skill.status === 'playable' &&
        skill.blockId &&
        !options.excludedBlockIds?.includes(skill.blockId) &&
        supportsBuild(skill, build) &&
        (!corePatternIds.has(skill.placementPatternId) || skill.placementPatternId === circuitCore.id),
    );
    if (options.requiredBlockId && !designs.some((skill) => skill.blockId === options.requiredBlockId)) {
      if (options.buildId) {
        throw new Error(`Playable skill "${options.requiredBlockId}" is not linked to build "${build.id}"`);
      }
      continue;
    }

    for (let nodeCount = targetNodeCount; nodeCount >= 2; nodeCount -= 1) {
      for (let reservationAttempt = 0; reservationAttempt < 8; reservationAttempt += 1) {
        const result = tryBuild(build, designs, nodeCount, reservationAttempt);
        if (!result) continue;
        return {
          ...result,
          heartPosition: { ...layout.heartPosition },
          buildId: build.id,
          circuitCoreId: circuitCore.id,
          nodeCount,
          level,
          bodyLevel,
          budget,
          bodyUpgradeCost,
          totalCost: result.skillCost + bodyUpgradeCost,
          maxHpBonus: maxHpBonusForBodyLevel(data, bodyLevel),
        };
      }
    }
  }

  const required = options.requiredBlockId ? ` containing ${options.requiredBlockId}` : '';
  const requestedBuild = options.buildId ?? 'configured';
  throw new Error(
    `No ${requestedBuild} + ${circuitCore.id} enemy build${required} fits budget ${budget} on run ${safeRun}`,
  );
}
