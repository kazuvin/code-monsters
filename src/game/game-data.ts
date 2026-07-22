import rawGameData from './game.json';
import { buffStatsForBlock } from '../core/skill-progress';
import type { CircuitBoard, GameData, Rarity } from '../core/types';
import { validateBuildDesign } from './build-design';

export const GAME_DATA = rawGameData as GameData;

const validateBoard = (name: string, board: CircuitBoard, data: GameData, errors: string[]) => {
  const blockIds = new Set(data.blocks.map((block) => block.id));
  if (board.length !== data.rules.boardSize) errors.push(`${name} must contain ${data.rules.boardSize} rows`);
  board.forEach((row, rowIndex) => {
    if (row.length !== data.rules.boardSize)
      errors.push(`${name}[${rowIndex}] must contain ${data.rules.boardSize} cells`);
    row.forEach((placed, columnIndex) => {
      if (placed && !blockIds.has(placed.blockId)) {
        errors.push(`${name}[${rowIndex}][${columnIndex}] references unknown block "${placed.blockId}"`);
      }
      if (placed && ![0, 1, 2, 3].includes(placed.rotation)) {
        errors.push(`${name}[${rowIndex}][${columnIndex}] has an invalid rotation`);
      }
      if (placed && ![0, 1].includes(placed.stars ?? 0)) {
        errors.push(`${name}[${rowIndex}][${columnIndex}] has an invalid star rank`);
      }
    });
  });
};

export function validateGameData(data: GameData): string[] {
  const errors: string[] = [];
  const directions = new Set(['north', 'east', 'south', 'west']);
  const rarities: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
  const unique = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${label} id "${id}" is duplicated`);
      seen.add(id);
    }
  };
  unique(
    'unit',
    data.units.map((unit) => unit.id),
  );
  unique(
    'block',
    data.blocks.map((block) => block.id),
  );

  const unitIds = new Set(data.units.map((unit) => unit.id));
  if (!unitIds.has(data.playerUnitId)) errors.push(`playerUnitId references unknown unit "${data.playerUnitId}"`);
  if (!unitIds.has(data.enemyUnitId)) errors.push(`enemyUnitId references unknown unit "${data.enemyUnitId}"`);
  if (data.rules.boardSize < 2) errors.push('boardSize must be at least 2');
  const heart = data.rules.heart;
  if (
    !Number.isInteger(heart.initialPosition.row) ||
    !Number.isInteger(heart.initialPosition.column) ||
    heart.initialPosition.row < 0 ||
    heart.initialPosition.row >= data.rules.boardSize ||
    heart.initialPosition.column < 0 ||
    heart.initialPosition.column >= data.rules.boardSize
  ) {
    errors.push('heart.initialPosition is outside the board');
  }
  if (
    heart.ports.length !== 4 ||
    new Set(heart.ports).size !== 4 ||
    !['north', 'east', 'south', 'west'].every((direction) =>
      heart.ports.includes(direction as (typeof heart.ports)[number]),
    )
  ) {
    errors.push('heart.ports must contain north, east, south, and west');
  }
  const bodyUpgrades = data.rules.bodyUpgrades;
  if (!Number.isInteger(bodyUpgrades.maxLevel) || bodyUpgrades.maxLevel < 1) {
    errors.push('bodyUpgrades.maxLevel must be positive');
  }
  if (!Number.isFinite(bodyUpgrades.hpPerLevel) || bodyUpgrades.hpPerLevel <= 0) {
    errors.push('bodyUpgrades.hpPerLevel must be positive');
  }
  if (
    bodyUpgrades.upgradeCosts.length !== bodyUpgrades.maxLevel - 1 ||
    bodyUpgrades.upgradeCosts.some((cost) => cost <= 0)
  ) {
    errors.push('bodyUpgrades.upgradeCosts must contain one positive cost per upgrade');
  }
  if (!Number.isInteger(bodyUpgrades.rivalRunsPerLevel) || bodyUpgrades.rivalRunsPerLevel < 1) {
    errors.push('bodyUpgrades.rivalRunsPerLevel must be positive');
  }
  if (data.rules.battleStepMs <= 0) errors.push('battleStepMs must be positive');
  if (data.rules.pulseAnimationMs < 300) errors.push('pulseAnimationMs must be at least 300');
  if (data.rules.suddenDeathSeconds <= 0) errors.push('suddenDeathSeconds must be positive');
  if (data.rules.suddenDeathBaseDamage <= 0) errors.push('suddenDeathBaseDamage must be positive');
  if (data.rules.suddenDeathGrowth <= 1) errors.push('suddenDeathGrowth must be greater than 1');
  const enemyGeneration = data.rules.enemyGeneration;
  const boardCellCount = data.rules.boardSize ** 2;
  if (enemyGeneration.startingNodes < 2) errors.push('enemyGeneration.startingNodes must be at least 2');
  if (enemyGeneration.nodesPerRun < 1) errors.push('enemyGeneration.nodesPerRun must be positive');
  if (enemyGeneration.maxNodes < enemyGeneration.startingNodes || enemyGeneration.maxNodes >= boardCellCount) {
    errors.push('enemyGeneration.maxNodes must fit the board and not be below startingNodes');
  }
  const levelProgression = data.rules.levelProgression;
  if (!Number.isInteger(levelProgression.runsPerLevel) || levelProgression.runsPerLevel < 1) {
    errors.push('levelProgression.runsPerLevel must be a positive integer');
  }
  if (!Number.isInteger(levelProgression.maxLevel) || levelProgression.maxLevel < 1) {
    errors.push('levelProgression.maxLevel must be a positive integer');
  }
  if (data.rules.poisonTickSeconds <= 0) errors.push('poisonTickSeconds must be positive');
  if (data.rules.poisonDecay < 0) errors.push('poisonDecay must not be negative');
  if (data.rules.mergeEffectMultiplier <= 1) errors.push('mergeEffectMultiplier must be greater than 1');
  if (data.rules.skillFusion.copiesRequired !== 3) errors.push('skillFusion.copiesRequired must be 3');
  if (data.rules.skillFusion.rewardChoices !== 3) errors.push('skillFusion.rewardChoices must be 3');
  if (data.rules.skillFusion.effectMultiplier <= 1) errors.push('skillFusion.effectMultiplier must be greater than 1');
  if (data.rules.skillFusion.cooldownReduction < 0) {
    errors.push('skillFusion.cooldownReduction must not be negative');
  }
  const magicSigils = data.rules.magicSigils;
  if (!Number.isInteger(magicSigils.maxLevel) || magicSigils.maxLevel < 1) {
    errors.push('magicSigils.maxLevel must be a positive integer');
  }
  if (!Number.isFinite(magicSigils.effectPowerPerLevel) || magicSigils.effectPowerPerLevel <= 0) {
    errors.push('magicSigils.effectPowerPerLevel must be positive');
  }
  if (
    !Number.isInteger(magicSigils.hasteLevel) ||
    magicSigils.hasteLevel < 1 ||
    magicSigils.hasteLevel > magicSigils.maxLevel
  ) {
    errors.push('magicSigils.hasteLevel must fit within maxLevel');
  }
  if (!Number.isInteger(magicSigils.cooldownReduction) || magicSigils.cooldownReduction < 0) {
    errors.push('magicSigils.cooldownReduction must not be negative');
  }
  const balanceFormula = data.rules.balanceFormula;
  const positiveFormulaValue = (label: string, value: number) => {
    if (!Number.isFinite(value) || value <= 0) errors.push(`balanceFormula.${label} must be positive`);
  };
  const probabilityFormulaValue = (label: string, value: number) => {
    if (!Number.isFinite(value) || value <= 0 || value > 1) {
      errors.push(`balanceFormula.${label} must be within (0, 1]`);
    }
  };
  if (!Number.isInteger(balanceFormula.version) || balanceFormula.version < 1) {
    errors.push('balanceFormula.version must be a positive integer');
  }
  Object.entries(balanceFormula.reference).forEach(([key, value]) => positiveFormulaValue(`reference.${key}`, value));
  probabilityFormulaValue('effectValue.shield', balanceFormula.effectValue.shield);
  probabilityFormulaValue('effectValue.repair', balanceFormula.effectValue.repair);
  positiveFormulaValue('effectValue.poisonTicks', balanceFormula.effectValue.poisonTicks);
  positiveFormulaValue('effectValue.supportPoint', balanceFormula.effectValue.supportPoint);
  positiveFormulaValue('effectValue.coin', balanceFormula.effectValue.coin);
  probabilityFormulaValue('conditionAvailability.minimum', balanceFormula.conditionAvailability.minimum);
  probabilityFormulaValue('conditionAvailability.enemyPoisoned', balanceFormula.conditionAvailability.enemyPoisoned);
  probabilityFormulaValue('conditionAvailability.inCycle', balanceFormula.conditionAvailability.inCycle);
  probabilityFormulaValue('conditionAvailability.pathLengthBase', balanceFormula.conditionAvailability.pathLengthBase);
  probabilityFormulaValue(
    'conditionAvailability.straightLineBase',
    balanceFormula.conditionAvailability.straightLineBase,
  );
  probabilityFormulaValue(
    'conditionAvailability.allPortsConnectedBase',
    balanceFormula.conditionAvailability.allPortsConnectedBase,
  );
  probabilityFormulaValue('conditionAvailability.magicSigilBase', balanceFormula.conditionAvailability.magicSigilBase);
  probabilityFormulaValue(
    'conditionAvailability.adjacentBuildBase',
    balanceFormula.conditionAvailability.adjacentBuildBase,
  );
  probabilityFormulaValue('conditionAvailability.branchBase', balanceFormula.conditionAvailability.branchBase);
  probabilityFormulaValue('conditionAvailability.mergeBase', balanceFormula.conditionAvailability.mergeBase);
  const conditionPenalties: Array<[string, number]> = [
    ['pathLengthPenaltyPerRequiredNode', balanceFormula.conditionAvailability.pathLengthPenaltyPerRequiredNode],
    ['straightLinePenaltyPerRequiredNode', balanceFormula.conditionAvailability.straightLinePenaltyPerRequiredNode],
    ['allPortsConnectedPenaltyPerPort', balanceFormula.conditionAvailability.allPortsConnectedPenaltyPerPort],
    ['magicSigilPenaltyPerRequiredLevel', balanceFormula.conditionAvailability.magicSigilPenaltyPerRequiredLevel],
    ['adjacentBuildPenaltyPerRequiredNode', balanceFormula.conditionAvailability.adjacentBuildPenaltyPerRequiredNode],
    ['branchPenaltyPerRequiredRoute', balanceFormula.conditionAvailability.branchPenaltyPerRequiredRoute],
    ['mergePenaltyPerRequiredRoute', balanceFormula.conditionAvailability.mergePenaltyPerRequiredRoute],
  ];
  conditionPenalties.forEach(([key, value]) => {
    if (!Number.isFinite(value) || value < 0) {
      errors.push(`balanceFormula.conditionAvailability.${key} must not be negative`);
    }
  });
  probabilityFormulaValue('resourceAvailability.charge', balanceFormula.resourceAvailability.charge);
  probabilityFormulaValue('resourceAvailability.rupturePoison', balanceFormula.resourceAvailability.rupturePoison);
  probabilityFormulaValue('resourceAvailability.magicSigil', balanceFormula.resourceAvailability.magicSigil);
  probabilityFormulaValue('resourceAvailability.poweredAxis', balanceFormula.resourceAvailability.poweredAxis);
  probabilityFormulaValue('chargeAttribution.producer', balanceFormula.chargeAttribution.producer);
  probabilityFormulaValue('chargeAttribution.consumer', balanceFormula.chargeAttribution.consumer);
  if (Math.abs(balanceFormula.chargeAttribution.producer + balanceFormula.chargeAttribution.consumer - 1) > 1e-9) {
    errors.push('balanceFormula.chargeAttribution producer and consumer must sum to 1');
  }
  if (balanceFormula.topologyUtility.perAdditionalPort < 0 || balanceFormula.topologyUtility.rotatable < 0) {
    errors.push('balanceFormula.topologyUtility values must not be negative');
  }
  rarities.forEach((rarity) => {
    positiveFormulaValue(`targetCvpsByRarity.${rarity}`, balanceFormula.targetCvpsByRarity[rarity]);
    positiveFormulaValue(`referencePriceByRarity.${rarity}`, balanceFormula.referencePriceByRarity[rarity]);
  });
  rarities.slice(1).forEach((rarity, index) => {
    if (balanceFormula.targetCvpsByRarity[rarity] <= balanceFormula.targetCvpsByRarity[rarities[index]]) {
      errors.push(`balanceFormula.targetCvpsByRarity.${rarity} must exceed ${rarities[index]}`);
    }
  });
  positiveFormulaValue('acceptableBudgetRatio.minimum', balanceFormula.acceptableBudgetRatio.minimum);
  positiveFormulaValue('acceptableBudgetRatio.maximum', balanceFormula.acceptableBudgetRatio.maximum);
  if (balanceFormula.acceptableBudgetRatio.maximum <= balanceFormula.acceptableBudgetRatio.minimum) {
    errors.push('balanceFormula.acceptableBudgetRatio.maximum must exceed minimum');
  }
  rarities.forEach((rarity) => {
    if (!Number.isFinite(data.rules.rarityWeights[rarity]) || data.rules.rarityWeights[rarity] <= 0) {
      errors.push(`rarityWeights.${rarity} must be positive`);
    }
    const multiplier = levelProgression.rarityWeightMultiplierPerLevel[rarity];
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      errors.push(`levelProgression.rarityWeightMultiplierPerLevel.${rarity} must be positive`);
    }
  });
  rarities.slice(1).forEach((rarity, index) => {
    const previous = rarities[index];
    if (data.rules.rarityWeights[previous] <= data.rules.rarityWeights[rarity]) {
      errors.push(`rarityWeights.${rarity} must be lower than rarityWeights.${previous}`);
    }
  });

  validateBoard('playerBoard', data.playerBoard, data, errors);
  if (data.playerBoard[heart.initialPosition.row]?.[heart.initialPosition.column]) {
    errors.push('playerBoard must keep heart.initialPosition empty');
  }
  const blockIds = new Set(data.blocks.map((block) => block.id));
  data.startingRack.forEach((blockId, index) => {
    if (!blockIds.has(blockId)) errors.push(`startingRack[${index}] references unknown block "${blockId}"`);
  });
  const buildIds = new Set(data.buildDesign.builds.map((build) => build.id));
  const chargeBlockIds = new Set(
    data.buildDesign.skills
      .filter((skill) => skill.axisLinks.find((link) => link.axisId === 'trait')?.valueIds.includes('charge'))
      .flatMap((skill) => (skill.blockId ? [skill.blockId] : [])),
  );
  const traitAxis = data.buildDesign.axes.find((axis) => axis.id === 'trait');
  const axisValues = new Map(
    data.buildDesign.axes.map((axis) => [axis.id, new Set(axis.values.map((value) => value.id))]),
  );
  const neutralBlockIds = new Set(
    data.buildDesign.skills
      .filter((skill) => skill.axisLinks.some((link) => link.axisId === 'trait' && link.valueIds.includes('neutral')))
      .flatMap((skill) => (skill.blockId ? [skill.blockId] : [])),
  );
  traitAxis?.values.forEach((value) => {
    if (!value.color || !/^#[0-9a-f]{6}$/i.test(value.color)) {
      errors.push(`trait axis value "${value.id}" needs a six-digit hex color`);
    }
  });
  data.blocks.forEach((block) => {
    if (!block.description.trim().endsWith('。'))
      errors.push(`block "${block.id}" description must be a complete sentence`);
    if (!rarities.includes(block.rarity)) errors.push(`block "${block.id}" has invalid rarity "${block.rarity}"`);
    if (!Number.isFinite(block.shopWeight ?? 1) || (block.shopWeight ?? 1) <= 0) {
      errors.push(`block "${block.id}" shopWeight must be positive`);
    }
    if (block.ports.length === 0) errors.push(`block "${block.id}" must have a port`);
    if (new Set(block.ports).size !== block.ports.length) errors.push(`block "${block.id}" has duplicate ports`);
    block.ports.forEach((port) => {
      if (!directions.has(port)) errors.push(`block "${block.id}" has invalid port "${port}"`);
    });
    if (block.effects.length === 0) errors.push(`block "${block.id}" must have an effect`);
    if (neutralBlockIds.has(block.id) && !block.fusion) {
      errors.push(`neutral block "${block.id}" needs an explicit fusion transformation`);
    }
    if (block.fusion) {
      if (!block.fusion.title.trim()) errors.push(`block "${block.id}" fusion needs a title`);
      if (!block.fusion.description.trim().endsWith('。')) {
        errors.push(`block "${block.id}" fusion description must be a complete sentence`);
      }
      if (block.fusion.effects.length === 0) errors.push(`block "${block.id}" fusion must have an effect`);
      const fusedCooldown = block.fusion.cooldown === null ? undefined : (block.fusion.cooldown ?? block.cooldown);
      const fusedActive = block.fusion.effects.some(
        (effect) => !['amplify', 'haste', 'charge', 'inscribe-magic-sigil'].includes(effect.kind),
      );
      if (fusedActive && !fusedCooldown) errors.push(`active fusion "${block.id}" must have a cooldown`);
    }
    if (
      chargeBlockIds.has(block.id) &&
      !block.effects.some((effect) => effect.kind === 'charge' || effect.kind === 'release-charge')
    ) {
      errors.push(`block "${block.id}" is tagged with charge but has no charge or release effect`);
    }
    const active = block.effects.some(
      (effect) => !['amplify', 'haste', 'charge', 'inscribe-magic-sigil'].includes(effect.kind),
    );
    if (active && !block.cooldown) errors.push(`active block "${block.id}" must have a cooldown`);
    block.effects.forEach((effect) => {
      if ('amount' in effect && effect.amount <= 0) {
        errors.push(`block "${block.id}" effect "${effect.kind}" amount must be positive`);
      }
      if ('scaling' in effect && effect.scaling && effect.scaling.every <= 0) {
        errors.push(`block "${block.id}" effect "${effect.kind}" scaling every must be positive`);
      }
      if (
        'scaling' in effect &&
        effect.scaling?.maxStacks !== undefined &&
        (!Number.isInteger(effect.scaling.maxStacks) || effect.scaling.maxStacks < 1)
      ) {
        errors.push(`block "${block.id}" effect "${effect.kind}" scaling maxStacks must be a positive integer`);
      }
      if ('scaling' in effect && effect.scaling?.kind === 'powered-axis') {
        const values = axisValues.get(effect.scaling.axisId);
        if (!values?.has(effect.scaling.valueId)) {
          errors.push(
            `block "${block.id}" effect "${effect.kind}" references unknown powered axis "${effect.scaling.axisId}/${effect.scaling.valueId}"`,
          );
        }
      }
      if (effect.kind === 'coin' && !Number.isInteger(effect.amount)) {
        errors.push(`block "${block.id}" coin amount must be an integer`);
      }
      if (effect.kind === 'release-charge' && effect.perCharge <= 0) {
        errors.push(`block "${block.id}" charge release must gain power from charge`);
      }
      if ('trigger' in effect && effect.trigger?.kind === 'path-length-at-least' && effect.trigger.amount < 1) {
        errors.push(`block "${block.id}" effect "${effect.kind}" path length must be positive`);
      }
      if ('trigger' in effect && effect.trigger?.kind === 'straight-line-at-least' && effect.trigger.amount < 2) {
        errors.push(`block "${block.id}" effect "${effect.kind}" straight line must be at least 2`);
      }
      if (
        'trigger' in effect &&
        effect.trigger?.kind === 'magic-sigil-level-at-least' &&
        (effect.trigger.amount < 1 || effect.trigger.amount > magicSigils.maxLevel)
      ) {
        errors.push(`block "${block.id}" effect "${effect.kind}" magic sigil level is invalid`);
      }
      if (
        'trigger' in effect &&
        effect.trigger?.kind === 'adjacent-build-at-least' &&
        (effect.trigger.amount < 1 || effect.trigger.amount > 8)
      ) {
        errors.push(`block "${block.id}" effect "${effect.kind}" adjacent build count must be between 1 and 8`);
      }
      if (
        'trigger' in effect &&
        effect.trigger?.kind === 'adjacent-build-at-least' &&
        !buildIds.has(effect.trigger.buildId)
      ) {
        errors.push(
          `block "${block.id}" effect "${effect.kind}" references unknown adjacent build "${effect.trigger.buildId}"`,
        );
      }
      if (
        'trigger' in effect &&
        (effect.trigger?.kind === 'branch-at-least' || effect.trigger?.kind === 'merge-at-least') &&
        (effect.trigger.amount < 2 || effect.trigger.amount > 3)
      ) {
        errors.push(`block "${block.id}" effect "${effect.kind}" light route count must be between 2 and 3`);
      }
      if ('scaling' in effect && effect.scaling?.kind === 'adjacent-build' && !buildIds.has(effect.scaling.buildId)) {
        errors.push(
          `block "${block.id}" effect "${effect.kind}" references unknown adjacent build "${effect.scaling.buildId}"`,
        );
      }
      if (effect.kind === 'inscribe-magic-sigil') {
        if (effect.offsets.length === 0) errors.push(`block "${block.id}" must inscribe at least one cell`);
        const offsetKeys = new Set<string>();
        effect.offsets.forEach((offset) => {
          const key = `${offset.row}:${offset.column}`;
          if (!Number.isInteger(offset.row) || !Number.isInteger(offset.column)) {
            errors.push(`block "${block.id}" magic sigil offsets must be integers`);
          }
          if (offset.row === 0 && offset.column === 0) {
            errors.push(`block "${block.id}" cannot inscribe its own cell`);
          }
          if (Math.abs(offset.row) >= data.rules.boardSize || Math.abs(offset.column) >= data.rules.boardSize) {
            errors.push(`block "${block.id}" magic sigil offset must fit the board`);
          }
          if (offsetKeys.has(key)) errors.push(`block "${block.id}" has duplicate magic sigil offsets`);
          offsetKeys.add(key);
        });
      }
      if (
        effect.kind === 'growth' &&
        !['all', 'damage', 'poison', 'shield', 'repair', 'rupture'].includes(effect.stat)
      ) {
        errors.push(`block "${block.id}" growth stat is invalid`);
      }
      if (
        effect.kind === 'growth' &&
        effect.target === 'self' &&
        effect.stat !== 'all' &&
        !buffStatsForBlock(block).includes(effect.stat)
      ) {
        errors.push(`block "${block.id}" cannot grow its missing "${effect.stat}" effect`);
      }
      if (effect.kind === 'rupture-poison') {
        if (effect.fraction <= 0 || effect.fraction > 1) {
          errors.push(`block "${block.id}" rupture fraction must be between 0 and 1`);
        }
        if (effect.damagePerStack <= 0) errors.push(`block "${block.id}" rupture damage must be positive`);
      }
    });
    block.fusion?.effects.forEach((effect) => {
      if ('amount' in effect && effect.amount <= 0) {
        errors.push(`block "${block.id}" fusion effect "${effect.kind}" amount must be positive`);
      }
      if ('scaling' in effect && effect.scaling && effect.scaling.every <= 0) {
        errors.push(`block "${block.id}" fusion effect "${effect.kind}" scaling every must be positive`);
      }
      if (
        'scaling' in effect &&
        effect.scaling?.maxStacks !== undefined &&
        (!Number.isInteger(effect.scaling.maxStacks) || effect.scaling.maxStacks < 1)
      ) {
        errors.push(`block "${block.id}" fusion effect "${effect.kind}" scaling maxStacks must be a positive integer`);
      }
      if ('scaling' in effect && effect.scaling?.kind === 'powered-axis') {
        const values = axisValues.get(effect.scaling.axisId);
        if (!values?.has(effect.scaling.valueId)) {
          errors.push(
            `block "${block.id}" fusion effect "${effect.kind}" references unknown powered axis "${effect.scaling.axisId}/${effect.scaling.valueId}"`,
          );
        }
      }
      if (effect.kind === 'coin' && !Number.isInteger(effect.amount)) {
        errors.push(`block "${block.id}" fusion coin amount must be an integer`);
      }
      if (effect.kind === 'rupture-poison' && (effect.fraction <= 0 || effect.fraction > 1)) {
        errors.push(`block "${block.id}" fusion rupture fraction must be between 0 and 1`);
      }
    });
    block.buildIds?.forEach((buildId) => {
      if (!buildIds.has(buildId)) errors.push(`block "${block.id}" references unknown build "${buildId}"`);
    });
  });
  rarities.slice(1).forEach((rarity, index) => {
    const previous = rarities[index];
    const previousWeights = data.blocks
      .filter((block) => block.rarity === previous)
      .map((block) => data.rules.rarityWeights[previous] * (block.shopWeight ?? 1));
    const rarityWeights = data.blocks
      .filter((block) => block.rarity === rarity)
      .map((block) => data.rules.rarityWeights[rarity] * (block.shopWeight ?? 1));
    if (
      previousWeights.length > 0 &&
      rarityWeights.length > 0 &&
      Math.max(...rarityWeights) >= Math.min(...previousWeights)
    ) {
      errors.push(`${rarity} nodes must be harder to roll than every ${previous} node`);
    }
  });
  rarities.slice(1).forEach((rarity, index) => {
    const previous = rarities[index];
    const previousPrices = data.blocks.filter((block) => block.rarity === previous).map((block) => block.price);
    const rarityPrices = data.blocks.filter((block) => block.rarity === rarity).map((block) => block.price);
    if (
      previousPrices.length > 0 &&
      rarityPrices.length > 0 &&
      Math.min(...rarityPrices) <= Math.max(...previousPrices)
    ) {
      errors.push(`${rarity} nodes must cost more than every ${previous} node`);
    }
  });
  (['rare', 'epic', 'legendary'] as Rarity[]).forEach((rarity) => {
    const releaseCount = data.blocks.filter(
      (block) => block.rarity === rarity && block.effects.some((effect) => effect.kind === 'release-charge'),
    ).length;
    if (releaseCount < 1 || releaseCount > 2) {
      errors.push(`${rarity} rarity needs one or two charge release nodes`);
    }
  });
  rarities.forEach((rarity) => {
    if (
      data.blocks.filter((block) => block.rarity === rarity && block.price > 0).length <
      data.rules.skillFusion.rewardChoices
    ) {
      errors.push(`${rarity} rarity needs at least ${data.rules.skillFusion.rewardChoices} fusion reward skills`);
    }
  });
  errors.push(...validateBuildDesign(data.buildDesign, [...blockIds]));
  return errors;
}

const errors = validateGameData(GAME_DATA);
if (errors.length > 0) throw new Error(`Invalid game data:\n${errors.join('\n')}`);
