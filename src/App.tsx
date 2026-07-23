import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createBattle, createPlayback } from './core/battle';
import { createBattleReport, type BattleReport, type TeamBattleReport } from './core/battle-report';
import {
  adjacentPoweredNeighbors,
  analyzeCircuit,
  analyzeMagicSigils,
  axisValueCountKey,
  calculateChargeByCell,
  circuitConditionsForBlock,
  countActiveMagicSigils,
  countPoweredAxisValue,
  rotatePorts,
  type CircuitAnalysis,
  type CircuitConditionStatus,
} from './core/circuit';
import { damageTierFor, type DamageTier } from './core/combat-presentation';
import { circuitDiagramForBlock } from './core/circuit-diagram';
import { battleCoinsEarned, battleReward } from './core/economy';
import { generateEnemyBuild } from './core/enemy-builder';
import { fuseSkillCopies, pickFusionRewardIds, upgradeBlockDefinition } from './core/fusion';
import { moveBlock, moveHeart, placeBlockFromRack, removeBlockToRack, rotateBoardBlock } from './core/loadout';
import { BATTLE_SPEEDS, playbackFrameMs, type BattleSpeed } from './core/playback';
import {
  bodyUpgradeCostForLevel,
  levelForRun,
  maxHpBonusForBodyLevel,
  rarityWeightsForLevel,
} from './core/progression';
import { advanceShop, createShop, randomShopSeed, rarityRatesForPool, rerollShop } from './core/shop';
import {
  incomingSkillModifiers,
  combineSkillModifiers,
  magicSigilModifiers,
  summarizeSkillProgress,
  type SkillModifiers,
  type SkillProgress,
} from './core/skill-progress';
import type {
  BattleState,
  BattleTraceEvent,
  BlockDefinition,
  BuffStat,
  CellPosition,
  CircuitBoard,
  Direction,
  FighterState,
  PlacementPatternId,
  PlacedBlock,
  Rotation,
  Rarity,
  ShopOffer,
  SkillBuffState,
  SkillStars,
  Team,
} from './core/types';
import { GAME_DATA } from './game/game-data';

type Phase = 'build' | 'battle' | 'result';
type WorkshopView = 'circuit' | 'catalog';
type DetailTarget = {
  blockId: string;
  position?: CellPosition;
  rotation?: Rotation;
  location: 'board' | 'rack' | 'shop' | 'catalog' | 'battle';
  team?: Team;
  stars?: SkillStars;
};
type DragOrigin =
  | { kind: 'board'; position: CellPosition }
  | { kind: 'rack'; block: PlacedBlock }
  | { kind: 'heart'; position: CellPosition };
type DragState = {
  origin: DragOrigin;
  blockId?: string;
  rotation: Rotation;
  stars: SkillStars;
  x: number;
  y: number;
};

type PortFlow = 'in' | 'out';

type FighterFeedback = {
  damage: number;
  poison: number;
  shield: number;
  repair: number;
};
type FeedbackKind = keyof FighterFeedback;
type FusionRewardState = {
  fusedBlockId: string;
  stage: 'fusing' | 'choose';
  choiceIds: string[];
  seed: number;
};

const directionBetween = (from: CellPosition, to: CellPosition): Direction => {
  if (to.row < from.row) return 'north';
  if (to.row > from.row) return 'south';
  if (to.column < from.column) return 'west';
  return 'east';
};
type PendingDrag = DragState & { pointerId: number; startX: number; startY: number; started: boolean };

const query = new URLSearchParams(window.location.search);
const fixtureSeed = Number(query.get('shopSeed'));
const hasFixtureSeed = Number.isInteger(fixtureSeed) && fixtureSeed > 0;
const initialSeed = hasFixtureSeed ? fixtureSeed : randomShopSeed();
const nextShopSeed = (current: number, step = 1) => (hasFixtureSeed ? current + step : randomShopSeed());
const fusionFixtureBlockId = query.get('fusionFixture');
const topologyFixture = query.get('topologyFixture');
const magicSigilFixture = query.get('magicSigilFixture');
const resonanceFixture = query.get('resonanceFixture');
const lightVeinFixture = query.get('lightVeinFixture');
const enemyBuildFixture = query.get('enemyBuildFixture');
const requestedEnemyCoreFixture = query.get('enemyCoreFixture');
const enemyCoreFixture = GAME_DATA.buildDesign.placementPatterns.some(
  (pattern) => pattern.category === 'core' && pattern.id === requestedEnemyCoreFixture,
)
  ? (requestedEnemyCoreFixture as PlacementPatternId)
  : null;
const enemyRequiredBlockFixture = query.get('enemyRequiredBlockFixture');
const HOLD_DELAY = 320;
const blockById = new Map(GAME_DATA.blocks.map((block) => [block.id, block]));
const shopBlocks = GAME_DATA.blocks.filter((block) => block.price > 0);
const PACKET_MODEL = GAME_DATA.blocks.every((block) => Boolean(block.packet));
const ownedBlockIdsFor = (board: CircuitBoard, rack: PlacedBlock[]) =>
  new Set([
    ...rack.map((placed) => placed.blockId),
    ...board.flatMap((row) => row.flatMap((placed) => (placed ? [placed.blockId] : []))),
  ]);
const skillDesignByBlockId = new Map(
  GAME_DATA.buildDesign.skills.flatMap((skill) => (skill.blockId ? [[skill.blockId, skill] as const] : [])),
);
const axisById = new Map(GAME_DATA.buildDesign.axes.map((axis) => [axis.id, axis]));
const BUFF_COPY: Record<BuffStat, { label: string; short: string }> = {
  damage: { label: 'ダメージ量', short: '攻' },
  poison: { label: '毒の付与量', short: '毒' },
  shield: { label: 'シールド量', short: '盾' },
  repair: { label: '回復量', short: '癒' },
  rupture: { label: '破裂威力', short: '裂' },
};
const RARITY_COPY: Record<Rarity, { label: string; code: string; color: string; aura: string }> = {
  common: { label: 'コモン', code: 'C', color: '#f4fbff', aura: '7px' },
  rare: { label: 'レア', code: 'R', color: '#69dcff', aura: '9px' },
  epic: { label: 'エピック', code: 'E', color: '#bd7cff', aura: '12px' },
  legendary: { label: 'レジェンダリー', code: 'L', color: '#ff9b42', aura: '16px' },
};
const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
const formatRarityRate = (rate: number) => `${(rate * 100).toFixed(1)}%`;
const WEAPON_MARK: Record<string, string> = {
  attack: '攻',
  guard: '盾',
  repair: '癒',
  economy: '金',
  operator: '算',
};
const FEEDBACK_COPY: Record<FeedbackKind, string> = {
  damage: 'ダメージ',
  poison: '毒付与',
  shield: '防護',
  repair: '回復',
};
const FEEDBACK_TIER_ORDER: DamageTier[] = ['small', 'medium', 'large'];

const conditionLabel = (condition: CircuitConditionStatus) => {
  if (condition.trigger.kind === 'path-length-at-least') return `経路 ${condition.current}/${condition.required}`;
  if (condition.trigger.kind === 'in-cycle') return `循環 ${condition.current}/${condition.required}`;
  if (condition.trigger.kind === 'all-ports-connected') return `全接続 ${condition.current}/${condition.required}`;
  if (condition.trigger.kind === 'magic-sigil-level-at-least') return `魔紋 ${condition.current}/${condition.required}`;
  if (condition.trigger.kind === 'adjacent-powered-at-least') return `共鳴 ${condition.current}/${condition.required}`;
  if (condition.trigger.kind === 'branch-at-least') return `分岐 ${condition.current}/${condition.required}`;
  if (condition.trigger.kind === 'merge-at-least') return `合流 ${condition.current}/${condition.required}`;
  return `直線 ${condition.current}/${condition.required}`;
};

const usesAdjacentPoweredCount = (block: BlockDefinition) =>
  block.effects.some(
    (effect) =>
      ('trigger' in effect && effect.trigger?.kind === 'adjacent-powered-at-least') ||
      ('scaling' in effect && effect.scaling?.kind === 'adjacent-powered'),
  );

const adjacentPoweredCountForBlock = (
  board: CircuitBoard,
  analysis: CircuitAnalysis,
  position: CellPosition,
  block: BlockDefinition,
) =>
  usesAdjacentPoweredCount(block) ? adjacentPoweredNeighbors(board, GAME_DATA.blocks, analysis, position).length : 0;

const poweredAxisCountsForBlock = (board: CircuitBoard, poweredCells: ReadonlySet<string>, block: BlockDefinition) =>
  Object.fromEntries(
    [
      ...new Map(
        block.effects.flatMap((effect) =>
          'scaling' in effect && effect.scaling?.kind === 'powered-axis'
            ? [[axisValueCountKey(effect.scaling.axisId, effect.scaling.valueId), effect.scaling] as const]
            : [],
        ),
      ).values(),
    ].map((scaling) => [
      axisValueCountKey(scaling.axisId, scaling.valueId),
      countPoweredAxisValue(board, poweredCells, GAME_DATA.buildDesign, scaling.axisId, scaling.valueId),
    ]),
  );

const CircuitConditionChips = ({ conditions }: { conditions: CircuitConditionStatus[] }) =>
  conditions.length > 0 ? (
    <span className="condition-chip-list" aria-hidden="true">
      {conditions.map((condition) => (
        <b
          className={`condition-chip ${condition.met ? 'is-ready' : 'is-pending'}`}
          data-condition-kind={condition.trigger.kind}
          data-condition-state={condition.met ? 'ready' : 'pending'}
          key={JSON.stringify(condition.trigger)}
        >
          {condition.met ? '✓ ' : ''}
          {conditionLabel(condition)}
        </b>
      ))}
    </span>
  ) : null;

const SIGIL_LEVEL_LABELS = ['', 'I', 'II', 'III'];

const MagicSigilMark = ({ level, active = false }: { level: number; active?: boolean }) =>
  level > 0 ? (
    <span
      className={`magic-sigil-mark level-${level} ${active ? 'is-active' : ''}`}
      data-magic-sigil-mark
      aria-hidden="true"
    >
      <i />
      <b>{SIGIL_LEVEL_LABELS[level] ?? level}</b>
    </span>
  ) : null;

const HeartVisual = ({ compact = false, conducting = false }: { compact?: boolean; conducting?: boolean }) => (
  <span className={`heart-core ${compact ? 'is-compact' : ''} ${conducting ? 'is-conducting' : ''}`}>
    <em className="heart-port port-north" />
    <em className="heart-port port-east" />
    <em className="heart-port port-south" />
    <em className="heart-port port-west" />
    <i aria-hidden="true" />
    <b>♥</b>
    <small>CORE</small>
  </span>
);

const createInitialHeartPosition = (): CellPosition => {
  if (magicSigilFixture === 'focus') return { row: 2, column: 0 };
  if (resonanceFixture === 'surround') return { row: 2, column: 3 };
  if (lightVeinFixture === 'converge') return { row: 2, column: 0 };
  return { ...GAME_DATA.rules.heart.initialPosition };
};

const createInitialPlayerBoard = () => {
  const initial = GAME_DATA.playerBoard.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
  if (magicSigilFixture === 'focus') {
    initial[2][1] = { blockId: 'guiding-bolt', rotation: 0 };
    initial[1][2] = { blockId: 'amplifier', rotation: 1 };
    initial[2][2] = { blockId: 'rupture-stake', rotation: 0 };
    return initial;
  }
  if (resonanceFixture === 'surround') {
    const fixture: Array<[number, number, string, SkillStars?]> = [
      [1, 0, 'amplifier'],
      [1, 1, 'repair-dividend'],
      [1, 2, 'guiding-bolt'],
      [2, 0, 'guiding-bolt'],
      [2, 1, 'amplifier', 1],
      [2, 2, 'guiding-bolt'],
      [3, 0, 'guiding-bolt'],
      [3, 1, 'repair-dividend'],
      [3, 2, 'repair-dividend'],
    ];
    fixture.forEach(([row, column, blockId, stars]) => {
      initial[row][column] = { blockId, rotation: 0, ...(stars ? { stars } : {}) };
    });
    return initial;
  }
  if (lightVeinFixture === 'converge') {
    const fixture: Array<[number, number, string, Rotation, SkillStars?]> = [
      [2, 1, 'prism-arrow', 0],
      [1, 1, 'guiding-bolt', 3],
      [1, 2, 'prism-arrow', 2],
      [1, 3, 'guiding-bolt', 0],
      [2, 2, 'accelerator', 2],
      [3, 1, 'guiding-bolt', 2],
      [3, 2, 'strike', 0],
      [3, 3, 'guiding-bolt', 1],
      [2, 3, 'accelerator', 0, 1],
    ];
    fixture.forEach(([row, column, blockId, rotation, stars]) => {
      initial[row][column] = { blockId, rotation, ...(stars ? { stars } : {}) };
    });
    return initial;
  }
  if (topologyFixture !== 'straight') return initial;
  ['charge-blade', 'amplifier', 'guiding-bolt', 'strike', 'overcharge-cannon'].forEach((blockId, column) => {
    initial[1][column] = { blockId, rotation: 0 };
  });
  return initial;
};

const axisValuesForBlock = (blockId: string, axisId: string) => {
  const valueIds = skillDesignByBlockId.get(blockId)?.axisLinks.find((link) => link.axisId === axisId)?.valueIds ?? [];
  const axis = axisById.get(axisId);
  return valueIds.flatMap((valueId) => {
    const value = axis?.values.find((candidate) => candidate.id === valueId);
    return value ? [value] : [];
  });
};

const blockVisualStyle = (block: BlockDefinition) => {
  const traits = axisValuesForBlock(block.id, 'trait');
  const rarity = RARITY_COPY[block.rarity];
  return {
    '--rarity-color': rarity.color,
    '--rarity-aura': rarity.aura,
    '--trait-primary': traits[0]?.color ?? '#486977',
    '--trait-secondary': traits[1]?.color ?? traits[0]?.color ?? '#486977',
  } as CSSProperties;
};

const BlockAxisBadges = ({ blockId, compact = false }: { blockId: string; compact?: boolean }) => {
  const traits = axisValuesForBlock(blockId, 'trait');
  const weapons = axisValuesForBlock(blockId, 'weapon');
  return (
    <span className={`axis-badges ${compact ? 'is-compact' : ''}`}>
      {traits.map((trait) => (
        <span
          className="axis-badge is-trait"
          style={{ '--axis-color': trait.color ?? '#486977' } as CSSProperties}
          key={trait.id}
        >
          <i />
          {trait.title}
        </span>
      ))}
      {weapons.map((weapon) => (
        <span className="axis-badge is-weapon" key={weapon.id}>
          <b>{WEAPON_MARK[weapon.id] ?? '技'}</b>
          {weapon.title}
        </span>
      ))}
    </span>
  );
};

const CircuitScopeDiagram = ({ block, rotation }: { block: BlockDefinition; rotation: Rotation }) => {
  const diagram = circuitDiagramForBlock(block, rotation);
  if (!diagram) return null;

  const nodes = new Map(diagram.nodes.map((item) => [`${item.row}:${item.column}`, item]));
  const arrowId = `circuit-scope-arrow-${diagram.kind}`;

  return (
    <figure className={`circuit-scope-diagram kind-${diagram.kind}`} data-diagram-kind={diagram.kind}>
      <svg viewBox="0 0 100 100" role="img" aria-label={`${block.title}: ${diagram.title}`}>
        <defs>
          <marker id={arrowId} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" />
          </marker>
        </defs>
        {Array.from({ length: 25 }, (_, index) => {
          const row = Math.floor(index / 5);
          const column = index % 5;
          return (
            <rect
              className="circuit-diagram-cell"
              x={column * 20 + 1}
              y={row * 20 + 1}
              width="18"
              height="18"
              key={`cell-${row}-${column}`}
            />
          );
        })}
        <g className="circuit-diagram-links">
          {diagram.links.map((item, index) => (
            <line
              className={`is-${item.role}`}
              x1={item.from[1] * 20 + 10}
              y1={item.from[0] * 20 + 10}
              x2={item.to[1] * 20 + 10}
              y2={item.to[0] * 20 + 10}
              markerEnd={`url(#${arrowId})`}
              key={`${item.from.join('-')}-${item.to.join('-')}-${index}`}
            />
          ))}
        </g>
        {[...nodes.values()].map((item) => (
          <g className={`circuit-diagram-node is-${item.role}`} key={`node-${item.row}-${item.column}`}>
            <rect x={item.column * 20 + 2} y={item.row * 20 + 2} width="16" height="16" />
            <text x={item.column * 20 + 10} y={item.row * 20 + 12.5} textAnchor="middle">
              {item.role === 'target' ? block.glyph : (item.glyph ?? '•')}
            </text>
          </g>
        ))}
      </svg>
      <figcaption>
        <small>CIRCUIT SCOPE</small>
        <b>{diagram.title}</b>
        <p>{diagram.caption}</p>
        <span className="circuit-scope-legend" aria-hidden="true">
          <i className="is-target" /> 中央: このノード
          <i className="is-source" /> 紫: 影響元
          <i className="is-affected" /> 黄: 影響先
          <i className="is-route" /> 水色: 通電経路
        </span>
      </figcaption>
    </figure>
  );
};

const effectLabel = (block: BlockDefinition, progress?: SkillProgress, multiplier = 1, charge = 0) => {
  if (block.packet) {
    const payloadLabels = {
      damage: '攻撃',
      poison: '毒',
      charge: 'チャージ',
      shield: '防御',
      repair: '回復',
      coin: 'コイン',
    };
    const imprintLabels = { assault: '攻撃', guard: '防御', renew: '回復' };
    return block.packet.effects
      .map((effect) => {
        if (effect.kind === 'generate-packet') return `${payloadLabels[effect.payload]} +${effect.amount}`;
        if (effect.kind === 'split-packet') return 'パケットを等分';
        if (effect.kind === 'merge-packet') return '別経路を合流';
        if (effect.kind === 'echo-packet') return '最後の状態を1回複製';
        if (effect.kind === 'imprint-packet') return `出力先 → ${imprintLabels[effect.imprint]}`;
        if (effect.kind === 'recirculate-packet') return '輪の中で全状態を1回再循環';
        const output = effect.output === 'rupture' ? '毒破裂' : payloadLabels[effect.output];
        return `${payloadLabels[effect.input]}を${output} ${effect.amount}＋1あたり${effect.perUnit}へ変換`;
      })
      .join(' / ');
  }
  const progressByEffect = new Map(progress?.effects.map((effect) => [effect.effectIndex, effect]));
  return block.effects
    .map((effect, effectIndex) => {
      const progress = progressByEffect.get(effectIndex);
      if (effect.kind === 'inscribe-magic-sigil') {
        return `${effect.offsets.length}マスへ魔紋 +${effect.amount}`;
      }
      if (effect.kind === 'charge') return `通電するチャージ +${effect.amount}`;
      if (effect.kind === 'release-charge') {
        const output = effect.output === 'damage' ? 'ダメージ' : 'シールド';
        const currentAmount = ((progress?.currentAmount ?? effect.amount) + charge * effect.perCharge) * multiplier;
        return `チャージ ${charge}を解放・${output} ${currentAmount}`;
      }
      const amount = 'amount' in effect ? effect.amount : effect.kind === 'rupture-poison' ? effect.damagePerStack : 0;
      const currentAmount = (progress?.currentAmount ?? amount) * multiplier;
      const amountLabel = (label: string) =>
        progress && currentAmount !== amount ? `${label} ${amount} → ${currentAmount}` : `${label} ${amount}`;
      if (effect.kind === 'damage') return amountLabel('ダメージ');
      if (effect.kind === 'shield') return amountLabel('シールド');
      if (effect.kind === 'repair') return amountLabel('回復');
      if (effect.kind === 'poison') return amountLabel('毒');
      if (effect.kind === 'coin') return `コイン +${effect.amount}`;
      if (effect.kind === 'rupture-poison') return `毒を半分消費・1毒につき${currentAmount}ダメージ`;
      if (effect.kind === 'growth') {
        const target = effect.target === 'self' ? '自身' : effect.target === 'upstream' ? '前の技' : '次の技';
        const stat = effect.stat === 'all' ? '発動効果' : BUFF_COPY[effect.stat].label;
        return `${target}の${stat}を戦闘中 +${effect.amount * multiplier}`;
      }
      if (effect.kind === 'amplify') return `接続先の発動効果を +${effect.amount}`;
      return `接続先の発動間隔を ${effect.amount}拍短縮`;
    })
    .join(' / ');
};

const visibleBuffs = (block: BlockDefinition, progress: SkillProgress, modifiers: SkillModifiers) => {
  const stats = new Map<BuffStat, { battle: number; circuit: number }>();
  progress.effects.forEach((effect) => {
    const current = stats.get(effect.stat) ?? { battle: 0, circuit: 0 };
    stats.set(effect.stat, {
      battle: Math.max(current.battle, effect.battleBuff),
      circuit: Math.max(current.circuit, effect.circuitBoost),
    });
  });
  return {
    stats: [...stats.entries()].filter(([, value]) => value.battle + value.circuit > 0),
    cooldownReduction: block.cooldown ? block.cooldown - Math.max(1, block.cooldown - modifiers.cooldownReduction) : 0,
  };
};

const cooldownLabel = (block: BlockDefinition) => {
  if (!block.cooldown) return '常時';
  return block.cooldown === 1 ? '毎拍' : `${block.cooldown}拍ごと`;
};

const BlockVisual = ({
  block,
  rotation = 0,
  stars = 0,
  powered = false,
  compact = false,
  portFlows,
  resonanceCount,
}: {
  block: BlockDefinition;
  rotation?: Rotation;
  stars?: SkillStars;
  powered?: boolean;
  compact?: boolean;
  portFlows?: Partial<Record<Direction, PortFlow>>;
  resonanceCount?: number;
}) => {
  const ports = rotatePorts(block.ports, rotation);
  const traits = axisValuesForBlock(block.id, 'trait');
  const [weapon] = axisValuesForBlock(block.id, 'weapon');
  const placementPatternId = skillDesignByBlockId.get(block.id)?.placementPatternId;
  const packetEffects = block.packet?.effects ?? [];
  const visualEffect = packetEffects.some((effect) => effect.kind === 'split-packet' || effect.kind === 'merge-packet')
    ? 'light-vein'
    : packetEffects.some((effect) => effect.kind === 'echo-packet')
      ? 'resonance'
      : packetEffects.some((effect) => effect.kind === 'imprint-packet')
        ? 'magic-sigil'
        : packetEffects.some(
              (effect) =>
                (effect.kind === 'generate-packet' && effect.payload === 'charge') ||
                (effect.kind === 'convert-packet' && effect.input === 'charge'),
            )
          ? 'charge'
          : packetEffects.some(
                (effect) =>
                  (effect.kind === 'generate-packet' && effect.payload === 'poison') ||
                  (effect.kind === 'convert-packet' && effect.input === 'poison'),
              )
            ? 'poison'
            : placementPatternId === 'light-vein'
              ? 'light-vein'
              : placementPatternId === 'resonance'
                ? 'resonance'
                : placementPatternId === 'magic-sigil'
                  ? 'magic-sigil'
                  : block.effects.some((effect) => effect.kind === 'charge' || effect.kind === 'release-charge')
                    ? 'charge'
                    : block.effects.some((effect) => effect.kind === 'poison' || effect.kind === 'rupture-poison')
                      ? 'poison'
                      : block.effects[0]?.kind;
  return (
    <span
      className={`block-visual effect-${visualEffect} rarity-${block.rarity} ${traits.length > 1 ? 'is-hybrid-trait' : ''} ${powered ? 'is-powered' : ''} ${compact ? 'is-compact' : ''}`}
      style={blockVisualStyle(block)}
      aria-hidden="true"
    >
      {ports.map((port) => (
        <i
          className={`block-port port-${port} ${portFlows?.[port] ? `is-conducting flow-${portFlows[port]}` : ''}`}
          key={port}
        />
      ))}
      <span className="block-core">
        <b>{block.glyph}</b>
        {!compact && <small>{block.code}</small>}
      </span>
      {stars > 0 && <strong className="skill-star">★</strong>}
      {resonanceCount !== undefined && (
        <strong className="resonance-count" data-resonance-count={resonanceCount}>
          響{resonanceCount}
        </strong>
      )}
      {weapon && <span className="block-weapon-mark">{WEAPON_MARK[weapon.id] ?? '技'}</span>}
      {powered && <em className="power-pip" />}
    </span>
  );
};

const CatalogScreen = ({
  blocks,
  filter,
  onFilter,
  onSelect,
}: {
  blocks: BlockDefinition[];
  filter: string;
  onFilter: (filter: string) => void;
  onSelect: (target: DetailTarget) => void;
}) => (
  <section className="catalog-screen" aria-label="カードカタログ">
    <header className="catalog-hero">
      <div>
        <small>NODE ARCHIVE / {String(GAME_DATA.blocks.length).padStart(2, '0')}</small>
        <h2>カードカタログ</h2>
        <p>状態を作り、汎用パケットを回路で加工し、終端で攻撃・防御・回復へ変換します。</p>
      </div>
      <div className="rarity-legend" aria-label="レアリティの色">
        {RARITY_ORDER.map((rarity) => (
          <span style={{ '--rarity-color': RARITY_COPY[rarity].color } as CSSProperties} key={rarity}>
            <i />
            {RARITY_COPY[rarity].label}
          </span>
        ))}
      </div>
    </header>

    <nav className="catalog-filters" aria-label="カード絞り込み">
      <button aria-pressed={filter === 'all'} onClick={() => onFilter('all')}>
        すべて <b>{GAME_DATA.blocks.length}</b>
      </button>
      {GAME_DATA.buildDesign.axes.flatMap((axis) =>
        axis.values.map((value) => (
          <button
            className={`filter-${axis.id}`}
            aria-pressed={filter === value.id}
            onClick={() => onFilter(value.id)}
            style={{ '--axis-color': value.color ?? '#79bac8' } as CSSProperties}
            key={`${axis.id}-${value.id}`}
          >
            <i>{axis.id === 'weapon' ? (WEAPON_MARK[value.id] ?? '技') : ''}</i>
            {value.title}
            <b>
              {
                GAME_DATA.blocks.filter((block) =>
                  axisValuesForBlock(block.id, axis.id).some((item) => item.id === value.id),
                ).length
              }
            </b>
          </button>
        )),
      )}
    </nav>

    <div className="catalog-grid">
      {blocks.map((block, index) => (
        <button
          className={`catalog-card rarity-${block.rarity}`}
          style={blockVisualStyle(block)}
          onClick={() => onSelect({ blockId: block.id, rotation: 0, location: 'catalog' })}
          aria-label={`${block.title}の詳細を見る`}
          key={block.id}
        >
          <span className="catalog-card-index">#{String(index + 1).padStart(2, '0')}</span>
          <span className="catalog-card-rarity">
            <i /> {RARITY_COPY[block.rarity].label}
          </span>
          <span className="catalog-card-art">
            <BlockVisual block={block} />
          </span>
          <span className="catalog-card-copy">
            <small>{block.code}</small>
            <strong>{block.title}</strong>
          </span>
          <BlockAxisBadges blockId={block.id} />
          <span className="catalog-card-description">{block.description}</span>
          <span className="catalog-card-spec">
            <b>{block.ports.length} EDGE</b>
            <i>{cooldownLabel(block)}</i>
          </span>
        </button>
      ))}
    </div>
    <footer className="catalog-note">
      <b>CONNECTOR RULE</b>
      エッジ本数はカード固有。生える向きはショップ入荷時に決まり、購入後も保持されます。
    </footer>
  </section>
);

const RobotSprite = ({ fighter }: { fighter: FighterState }) => (
  <span
    className={`robot-sprite ${fighter.hp <= 0 ? 'is-down' : ''}`}
    aria-hidden="true"
    style={{ '--robot-color': fighter.color } as CSSProperties}
  >
    <i className="robot-antenna" />
    <i className="robot-head">
      <b />
    </i>
    <i className="robot-body" />
    <i className="robot-feet" />
  </span>
);

const ArenaFighter = ({
  fighter,
  acting,
  hit,
  overloaded,
  feedback,
  feedbackKey,
}: {
  fighter: FighterState;
  acting: boolean;
  hit: boolean;
  overloaded: boolean;
  feedback: FighterFeedback;
  feedbackKey: string;
}) => {
  const damageTier = feedback.damage > 0 ? damageTierFor(feedback.damage, fighter.maxHp) : null;
  const feedbackItems = (Object.entries(feedback) as Array<[FeedbackKind, number]>).flatMap(([kind, value]) =>
    value > 0 ? [{ kind, value, tier: damageTierFor(value, fighter.maxHp) }] : [],
  );
  const feedbackTier = feedbackItems.reduce<DamageTier>(
    (strongest, item) =>
      FEEDBACK_TIER_ORDER.indexOf(item.tier) > FEEDBACK_TIER_ORDER.indexOf(strongest) ? item.tier : strongest,
    'small',
  );
  return (
    <article
      className={`arena-fighter team-${fighter.team} ${fighter.hp <= 0 ? 'is-down' : ''} ${acting ? 'is-acting' : ''} ${hit ? 'is-hit' : ''} ${damageTier ? `damage-${damageTier}` : ''} ${feedback.poison > 0 ? 'is-poisoned-now' : ''} ${feedback.shield > 0 ? 'is-shielded-now' : ''} ${feedback.repair > 0 ? 'is-repaired-now' : ''}`}
      style={{ '--robot-color': fighter.color } as CSSProperties}
      data-damage-tier={damageTier ?? undefined}
    >
      <div className="arena-unit-visual">
        <RobotSprite fighter={fighter} />
        {feedback.poison > 0 && (
          <span className="poison-impact" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
      </div>
      {feedbackItems.length > 0 && (
        <div className={`combat-feedback tier-${feedbackTier}`} key={feedbackKey} aria-live="polite">
          {feedbackItems.map(({ kind, value, tier }) => (
            <b
              className={`feedback-number feedback-${kind} tier-${tier}`}
              data-feedback-kind={kind}
              data-feedback-tier={tier}
              aria-label={`${FEEDBACK_COPY[kind]} ${value}`}
              key={kind}
            >
              <strong>
                {kind === 'damage' ? '-' : '+'}
                {value}
              </strong>
            </b>
          ))}
        </div>
      )}
      <div className="arena-unit-copy">
        <small>{fighter.code}</small>
        <strong>{fighter.name}</strong>
      </div>
      <div className="unit-health" aria-label={`${fighter.name} HP ${fighter.hp} / ${fighter.maxHp}`}>
        <span>
          <i style={{ width: `${Math.max(0, (fighter.hp / fighter.maxHp) * 100)}%` }} />
        </span>
        <b>{fighter.hp}</b>
      </div>
      <div className="unit-status-list" aria-label={`${fighter.name}の状態`}>
        {fighter.shield > 0 && (
          <span className="unit-status status-shield">
            <i>▣</i>防護 {fighter.shield}
          </span>
        )}
        {fighter.poison > 0 && (
          <span className="unit-status status-poison">
            <i>◆</i>毒 {fighter.poison}
          </span>
        )}
        {fighter.hp / fighter.maxHp <= 0.5 && fighter.hp > 0 && (
          <span className="unit-status status-damage">
            <i>!</i>損傷
          </span>
        )}
        {hit && (
          <span className="unit-status status-hit">
            <i>×</i>被弾
          </span>
        )}
        {acting && !hit && (
          <span className="unit-status status-active">
            <i>▶</i>起動
          </span>
        )}
        {overloaded && (
          <span className="unit-status status-overload">
            <i>⚠</i>過負荷
          </span>
        )}
      </div>
    </article>
  );
};

const metricValue = (value: number) => (value > 0 ? value.toLocaleString('ja-JP') : '—');

const BattleReportDialog = ({
  report,
  team,
  run,
  player,
  enemy,
  onTeam,
  onClose,
}: {
  report: BattleReport;
  team: Team;
  run: number;
  player: FighterState;
  enemy: FighterState;
  onTeam: (team: Team) => void;
  onClose: () => void;
}) => {
  const selected: TeamBattleReport = report[team];
  const labels: Record<Team, { side: string; fighter: FighterState }> = {
    player: { side: '自分', fighter: player },
    enemy: { side: '相手', fighter: enemy },
  };
  return (
    <div className="report-backdrop">
      <section className="battle-report-dialog" role="dialog" aria-modal="true" aria-labelledby="battle-report-title">
        <button className="report-close" type="button" aria-label="戦闘レポートを閉じる" onClick={onClose}>
          ×
        </button>
        <header className="report-head">
          <small>AFTER ACTION / RUN {String(run).padStart(2, '0')}</small>
          <h2 id="battle-report-title">戦闘レポート</h2>
          <p>技の出力、毒による継続ダメージ、回収コインを記録。</p>
        </header>
        <nav className="report-tabs" role="tablist" aria-label="レポート対象">
          {(['player', 'enemy'] as Team[]).map((candidate) => (
            <button
              type="button"
              role="tab"
              aria-selected={team === candidate}
              key={candidate}
              onClick={() => onTeam(candidate)}
            >
              <small>{labels[candidate].side}</small>
              <b>{labels[candidate].fighter.name}</b>
            </button>
          ))}
        </nav>
        <section className="report-summary" aria-label={`${labels[team].side}の戦闘集計`}>
          <article className="is-total">
            <small>総ダメージ</small>
            <b>{selected.totals.totalDamage.toLocaleString('ja-JP')}</b>
          </article>
          <article>
            <small>技ダメージ</small>
            <b>{metricValue(selected.totals.skillDamage)}</b>
          </article>
          <article className="is-poison">
            <small>毒ダメージ</small>
            <b>{metricValue(selected.totals.poisonDamage)}</b>
          </article>
          <article className="is-poison">
            <small>毒付与</small>
            <b>{metricValue(selected.totals.poisonApplied)}</b>
          </article>
          <article>
            <small>防護</small>
            <b>{metricValue(selected.totals.shield)}</b>
          </article>
          <article>
            <small>回復</small>
            <b>{metricValue(selected.totals.repair)}</b>
          </article>
          <article className="is-coin">
            <small>回収コイン</small>
            <b>{metricValue(selected.totals.coinsEarned)}</b>
          </article>
        </section>
        <section className="report-ledger" aria-label={`${labels[team].side}の技別記録`}>
          <header>
            <span>技別記録</span>
            <small>{selected.skills.length} SKILLS</small>
          </header>
          {selected.skills.length === 0 ? (
            <p className="report-empty">発動した技はありません。</p>
          ) : (
            selected.skills.map((skill) => (
              <article
                className="report-skill-row"
                key={skill.blockId}
                style={{ '--rarity-color': RARITY_COPY[skill.rarity].color } as CSSProperties}
              >
                <div className="report-skill-name">
                  <i>{skill.glyph}</i>
                  <span>
                    <small>{skill.code}</small>
                    <strong>{skill.title}</strong>
                  </span>
                </div>
                <div className="report-skill-metrics">
                  <span>
                    <small>発動</small>
                    <b>{skill.activations}</b>
                  </span>
                  <span>
                    <small>技DMG</small>
                    <b>{metricValue(skill.damage)}</b>
                  </span>
                  <span>
                    <small>毒付与</small>
                    <b>{metricValue(skill.poisonApplied)}</b>
                  </span>
                  <span>
                    <small>防護</small>
                    <b>{metricValue(skill.shield)}</b>
                  </span>
                  <span>
                    <small>回復</small>
                    <b>{metricValue(skill.repair)}</b>
                  </span>
                  <span>
                    <small>COIN</small>
                    <b>{metricValue(skill.coinsEarned)}</b>
                  </span>
                </div>
              </article>
            ))
          )}
        </section>
        <footer className="report-note">
          <b>COIN</b> 回収コインは戦闘終了後、通常報酬に加算されます。
        </footer>
      </section>
    </div>
  );
};

const BattleCircuitSummary = ({
  team,
  label,
  board,
  heartPosition,
  powered,
  events,
  tick,
  pulseStep,
  pulseStepCount,
  pulseCells,
  buffs,
  enemyPoison,
  onSelect,
}: {
  team: 'player' | 'enemy';
  label: string;
  board: CircuitBoard;
  heartPosition: CellPosition;
  powered: string[];
  events: BattleTraceEvent[];
  tick: number;
  pulseStep: number;
  pulseStepCount: number;
  pulseCells: string[];
  buffs: Record<string, SkillBuffState>;
  enemyPoison: number;
  onSelect: (target: DetailTarget) => void;
}) => {
  const [conditionPreviewKey, setConditionPreviewKey] = useState<string | null>(null);
  const poweredCells = new Set(powered);
  const analysis = analyzeCircuit(board, GAME_DATA.blocks, heartPosition, GAME_DATA.rules.heart.ports);
  const magicSigils = analyzeMagicSigils(
    board,
    GAME_DATA.blocks,
    analysis,
    GAME_DATA.rules.skillFusion,
    GAME_DATA.rules.magicSigils,
  );
  const activeMagicSigilCount = countActiveMagicSigils(board, analysis, magicSigils);
  const chargeByCell = calculateChargeByCell(board, GAME_DATA.blocks, analysis, GAME_DATA.rules.skillFusion);
  const conditionStatusesByCell = new Map<string, CircuitConditionStatus[]>();
  board.forEach((row, rowIndex) =>
    row.forEach((placed, columnIndex) => {
      const baseBlock = placed ? blockById.get(placed.blockId) : undefined;
      if (!baseBlock || !placed) return;
      const block = upgradeBlockDefinition(baseBlock, placed.stars ?? 0, GAME_DATA.rules.skillFusion);
      const position = { row: rowIndex, column: columnIndex };
      const conditions = block.packet
        ? []
        : circuitConditionsForBlock(board, GAME_DATA.blocks, analysis, position, block, magicSigils);
      if (conditions.length > 0) conditionStatusesByCell.set(`${rowIndex}:${columnIndex}`, conditions);
    }),
  );
  const conditionPreviewCells = new Set(
    conditionPreviewKey
      ? (conditionStatusesByCell.get(conditionPreviewKey) ?? []).flatMap((condition) => condition.contributingCells)
      : [],
  );
  const skillEvents = events.filter(
    (event): event is Extract<BattleTraceEvent, { blockId: string }> =>
      event.kind !== 'overload' && event.kind !== 'poison-tick' && event.team === team,
  );
  const conductingCells = new Set(pulseCells);
  const activatedCells = new Set(skillEvents.map((event) => `${event.row}:${event.column}`));
  const mergingCells = new Set([...analysis.mergeCells].filter((key) => activatedCells.has(key)));
  const coinEarnedByCell = new Map<string, number>();
  skillEvents.forEach((event) => {
    if (event.kind !== 'coin') return;
    const key = `${event.row}:${event.column}`;
    coinEarnedByCell.set(key, (coinEarnedByCell.get(key) ?? 0) + event.value);
  });
  const portFlowsByCell = new Map<string, Partial<Record<Direction, PortFlow>>>();
  const setPortFlow = (key: string, direction: Direction, flow: PortFlow) => {
    const current = portFlowsByCell.get(key) ?? {};
    portFlowsByCell.set(key, { ...current, [direction]: flow });
  };
  for (const targetKey of conductingCells) {
    const [row, column] = targetKey.split(':').map(Number);
    const target = { row, column };
    if (analysis.heartConnections.has(targetKey)) {
      setPortFlow(targetKey, directionBetween(target, heartPosition), 'in');
    }
    for (const upstream of analysis.upstreamCells.get(targetKey) ?? []) {
      const upstreamKey = `${upstream.row}:${upstream.column}`;
      setPortFlow(targetKey, directionBetween(target, upstream), 'in');
      setPortFlow(upstreamKey, directionBetween(upstream, target), 'out');
    }
  }
  const firingLabels = skillEvents
    .map((event) => {
      const block = blockById.get(event.blockId);
      return block ? upgradeBlockDefinition(block, event.stars ?? 0, GAME_DATA.rules.skillFusion).title : undefined;
    })
    .filter((title): title is string => Boolean(title));

  return (
    <section className={`battle-circuit-summary team-${team}`} aria-label={`${label}の回路サマリー`}>
      <header>
        <span>
          <small>{team === 'player' ? 'YOUR CIRCUIT' : 'RIVAL CIRCUIT'}</small>
          <strong>
            {label}
            {!PACKET_MODEL && activeMagicSigilCount > 0 && (
              <i className="battle-sigil-count">魔紋 {activeMagicSigilCount}</i>
            )}
          </strong>
        </span>
        <em>
          {mergingCells.size > 0
            ? PACKET_MODEL
              ? 'PACKET MERGE'
              : `MERGE ×${GAME_DATA.rules.mergeEffectMultiplier}`
            : firingLabels.length > 0
              ? firingLabels.slice(0, 2).join('・')
              : pulseStep > 0
                ? `PULSE ${pulseStep}/${pulseStepCount}`
                : `通電 ${poweredCells.size}`}
        </em>
      </header>
      <div className="battle-circuit-map">
        <div className="battle-circuit-grid" key={`${team}-${tick}`}>
          {board.flatMap((row, rowIndex) =>
            row.map((placed, columnIndex) => {
              const key = `${rowIndex}:${columnIndex}`;
              const isHeart = rowIndex === heartPosition.row && columnIndex === heartPosition.column;
              if (isHeart) {
                const heartConducting = [...analysis.heartConnections].some((cell) => conductingCells.has(cell));
                return (
                  <span
                    className={`battle-circuit-cell battle-heart-cell ${heartConducting ? 'is-conducting' : ''}`}
                    key={key}
                    aria-label={`${label}の心臓`}
                  >
                    <HeartVisual compact conducting={heartConducting} />
                  </span>
                );
              }
              const magicSigilLevel = magicSigils.levels.get(key) ?? 0;
              const coinEarned = coinEarnedByCell.get(key) ?? 0;
              const baseBlock = placed ? blockById.get(placed.blockId) : undefined;
              const block = baseBlock
                ? upgradeBlockDefinition(baseBlock, placed?.stars ?? 0, GAME_DATA.rules.skillFusion)
                : undefined;
              const position = { row: rowIndex, column: columnIndex };
              const adjacentPoweredCount = block ? adjacentPoweredCountForBlock(board, analysis, position, block) : 0;
              const resonanceCount = block && usesAdjacentPoweredCount(block) ? adjacentPoweredCount : undefined;
              const stateLabel = mergingCells.has(key)
                ? PACKET_MODEL
                  ? 'パケット合流'
                  : `合流 効果${GAME_DATA.rules.mergeEffectMultiplier}倍`
                : activatedCells.has(key)
                  ? '発動'
                  : conductingCells.has(key)
                    ? '通電中・待機'
                    : poweredCells.has(key)
                      ? '接続済み'
                      : '未通電';
              const magicSigilLabel = magicSigilLevel > 0 ? ` 魔紋位階${SIGIL_LEVEL_LABELS[magicSigilLevel]}` : '';
              const conditions = conditionStatusesByCell.get(key) ?? [];
              const conditionSummary = conditions.map(conditionLabel).join('、');
              if (block && placed) {
                const modifiers = combineSkillModifiers(
                  incomingSkillModifiers(board, GAME_DATA.blocks, analysis, position, GAME_DATA.rules.skillFusion),
                  magicSigilModifiers(magicSigilLevel, GAME_DATA.rules.magicSigils),
                );
                const progress = summarizeSkillProgress(block, buffs[key], modifiers, {
                  enemyPoison,
                  pathLength: analysis.routeLength.get(key) ?? 0,
                  straightLineLength: analysis.straightLineLength.get(key) ?? 0,
                  magicSigilLevel,
                  magicSigilCount: activeMagicSigilCount,
                  adjacentPoweredCount,
                  downstreamCount: analysis.downstreamCells.get(key)?.length ?? 0,
                  upstreamCount: analysis.upstreamCells.get(key)?.length ?? 0,
                  poweredAxisCounts: poweredAxisCountsForBlock(board, poweredCells, block),
                });
                const skillBuffs = visibleBuffs(block, progress, modifiers);
                const badgeLabels = [
                  ...skillBuffs.stats.map(
                    ([stat, value]) => `${BUFF_COPY[stat].label} +${value.battle + value.circuit}`,
                  ),
                  ...(skillBuffs.cooldownReduction > 0 ? [`発動間隔 -${skillBuffs.cooldownReduction}拍`] : []),
                ];
                return (
                  <button
                    type="button"
                    className={`battle-circuit-cell battle-circuit-skill ${poweredCells.has(key) ? 'is-powered' : ''} ${portFlowsByCell.has(key) ? 'is-conducting' : ''} ${activatedCells.has(key) ? 'is-activated' : ''} ${mergingCells.has(key) ? 'is-merging' : ''} ${magicSigilLevel > 0 ? 'is-magic-sigil' : ''} ${conditions.some((condition) => condition.met) ? 'is-condition-ready' : ''} ${conditionPreviewCells.has(key) ? 'is-condition-path' : ''}`}
                    key={key}
                    data-cell-key={key}
                    data-pulse-step={conductingCells.has(key) ? pulseStep : undefined}
                    data-conducting={portFlowsByCell.has(key) ? 'true' : undefined}
                    data-activated={activatedCells.has(key) ? 'true' : undefined}
                    data-merge={analysis.mergeCells.has(key) ? 'true' : undefined}
                    data-magic-sigil-level={magicSigilLevel || undefined}
                    data-resonance-count={resonanceCount}
                    aria-label={`${label}の${block.title} ${stateLabel}${magicSigilLabel}${coinEarned > 0 ? ` コイン +${coinEarned}` : ''}${conditionSummary ? ` 条件 ${conditionSummary}` : ''}${badgeLabels.length ? ` ${badgeLabels.join('、')}` : ''}`}
                    aria-haspopup="dialog"
                    onPointerEnter={() => conditions.length > 0 && setConditionPreviewKey(key)}
                    onPointerLeave={() => setConditionPreviewKey((current) => (current === key ? null : current))}
                    onFocus={() => conditions.length > 0 && setConditionPreviewKey(key)}
                    onBlur={() => setConditionPreviewKey((current) => (current === key ? null : current))}
                    onClick={() =>
                      onSelect({
                        blockId: block.id,
                        position: { row: rowIndex, column: columnIndex },
                        location: 'battle',
                        team,
                      })
                    }
                  >
                    {!block.packet && (
                      <MagicSigilMark
                        level={magicSigilLevel}
                        active={conductingCells.has(key) || activatedCells.has(key)}
                      />
                    )}
                    <BlockVisual
                      block={block}
                      rotation={placed.rotation}
                      stars={placed.stars ?? 0}
                      powered={poweredCells.has(key)}
                      compact
                      portFlows={portFlowsByCell.get(key)}
                      resonanceCount={resonanceCount}
                    />
                    {mergingCells.has(key) && (
                      <b className="block-merge-chip">×{GAME_DATA.rules.mergeEffectMultiplier}</b>
                    )}
                    {coinEarned > 0 && (
                      <b className="block-coin-chip" aria-hidden="true">
                        +{coinEarned}
                      </b>
                    )}
                    {conductingCells.has(key) && (chargeByCell.get(key) ?? 0) > 0 && (
                      <b className="block-charge-chip">CHG {chargeByCell.get(key)}</b>
                    )}
                    <CircuitConditionChips conditions={conditions} />
                    {badgeLabels.length > 0 && (
                      <span className="block-buff-list" aria-hidden="true">
                        {skillBuffs.stats.slice(0, 2).map(([stat, value]) => (
                          <b className={`block-buff-chip stat-${stat}`} key={stat}>
                            {BUFF_COPY[stat].short}+{value.battle + value.circuit}
                          </b>
                        ))}
                        {skillBuffs.cooldownReduction > 0 && (
                          <b className="block-buff-chip stat-haste">速-{skillBuffs.cooldownReduction}</b>
                        )}
                      </span>
                    )}
                  </button>
                );
              }
              return (
                <span
                  className={`battle-circuit-cell ${poweredCells.has(key) ? 'is-powered' : ''} ${magicSigilLevel > 0 ? 'is-magic-sigil' : ''}`}
                  key={key}
                  data-magic-sigil-level={magicSigilLevel || undefined}
                  aria-label={magicSigilLevel > 0 ? `空き・魔紋位階${SIGIL_LEVEL_LABELS[magicSigilLevel]}` : '空き'}
                >
                  {!PACKET_MODEL && <MagicSigilMark level={magicSigilLevel} />}
                </span>
              );
            }),
          )}
        </div>
      </div>
    </section>
  );
};

export function App() {
  const [phase, setPhase] = useState<Phase>('build');
  const [workshopView, setWorkshopView] = useState<WorkshopView>('circuit');
  const [catalogFilter, setCatalogFilter] = useState('all');
  const [coins, setCoins] = useState(GAME_DATA.rules.startingCoins);
  const [earnedCoins, setEarnedCoins] = useState(GAME_DATA.rules.startingCoins);
  const [run, setRun] = useState(1);
  const [bodyLevel, setBodyLevel] = useState(1);
  const [heartPosition, setHeartPosition] = useState<CellPosition>(createInitialHeartPosition);
  const [seed, setSeed] = useState(initialSeed);
  const [enemySeed, setEnemySeed] = useState(initialSeed + 101);
  const [rack, setRack] = useState<PlacedBlock[]>(() =>
    [
      ...GAME_DATA.startingRack,
      ...(fusionFixtureBlockId && blockById.has(fusionFixtureBlockId)
        ? Array.from({ length: GAME_DATA.rules.skillFusion.copiesRequired }, () => fusionFixtureBlockId)
        : []),
    ].map((blockId) => ({ blockId, rotation: 0 })),
  );
  const [board, setBoard] = useState<CircuitBoard>(createInitialPlayerBoard);
  const [shop, setShop] = useState(() =>
    createShop(
      shopBlocks,
      rarityWeightsForLevel(GAME_DATA, 1),
      initialSeed,
      GAME_DATA.rules.shopSize,
      ownedBlockIdsFor(board, rack),
    ),
  );
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [playback, setPlayback] = useState<BattleState[]>([]);
  const [frame, setFrame] = useState(0);
  const [battleSpeed, setBattleSpeed] = useState<BattleSpeed>(1);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTeam, setReportTeam] = useState<Team>('player');
  const [fusionReward, setFusionReward] = useState<FusionRewardState | null>(null);
  const [message, setMessage] = useState('ショップで技を選ぶ');
  const [conditionPreviewKey, setConditionPreviewKey] = useState<string | null>(null);
  const holdTimer = useRef<number | null>(null);
  const pendingDrag = useRef<PendingDrag | null>(null);
  const suppressClick = useRef(false);
  const fusionTimer = useRef<number | null>(null);

  const ownedBlockIds = useMemo(() => ownedBlockIdsFor(board, rack), [board, rack]);
  const circuitAnalysis = useMemo(
    () => analyzeCircuit(board, GAME_DATA.blocks, heartPosition, GAME_DATA.rules.heart.ports),
    [board, heartPosition],
  );
  const powered = circuitAnalysis.poweredCells;
  const magicSigils = useMemo(
    () =>
      analyzeMagicSigils(
        board,
        GAME_DATA.blocks,
        circuitAnalysis,
        GAME_DATA.rules.skillFusion,
        GAME_DATA.rules.magicSigils,
      ),
    [board, circuitAnalysis],
  );
  const activeMagicSigilCount = useMemo(
    () => countActiveMagicSigils(board, circuitAnalysis, magicSigils),
    [board, circuitAnalysis, magicSigils],
  );
  const conditionStatusesByCell = useMemo(() => {
    const statuses = new Map<string, CircuitConditionStatus[]>();
    board.forEach((row, rowIndex) =>
      row.forEach((placed, columnIndex) => {
        const baseBlock = placed ? blockById.get(placed.blockId) : undefined;
        if (!baseBlock || !placed) return;
        const block = upgradeBlockDefinition(baseBlock, placed.stars ?? 0, GAME_DATA.rules.skillFusion);
        const position = { row: rowIndex, column: columnIndex };
        const conditions = block.packet
          ? []
          : circuitConditionsForBlock(board, GAME_DATA.blocks, circuitAnalysis, position, block, magicSigils);
        if (conditions.length > 0) statuses.set(`${rowIndex}:${columnIndex}`, conditions);
      }),
    );
    return statuses;
  }, [board, circuitAnalysis, magicSigils]);
  const selectedConditionKey =
    detail?.location === 'board' && detail.position ? `${detail.position.row}:${detail.position.column}` : null;
  const activeConditionKey = conditionPreviewKey ?? selectedConditionKey;
  const conditionPreviewCells = new Set(
    activeConditionKey
      ? (conditionStatusesByCell.get(activeConditionKey) ?? []).flatMap((condition) => condition.contributingCells)
      : [],
  );
  const level = levelForRun(GAME_DATA, run);
  const maxHpBonus = maxHpBonusForBodyLevel(GAME_DATA, bodyLevel);
  const nextBodyUpgradeCost = bodyUpgradeCostForLevel(GAME_DATA, bodyLevel);
  const shopRarityWeights = useMemo(() => rarityWeightsForLevel(GAME_DATA, bodyLevel), [bodyLevel]);
  const shopRarityRates = useMemo(() => rarityRatesForPool(shopBlocks, shopRarityWeights), [shopRarityWeights]);
  const nextBodyRarityRates = useMemo(
    () =>
      nextBodyUpgradeCost === null
        ? null
        : rarityRatesForPool(shopBlocks, rarityWeightsForLevel(GAME_DATA, bodyLevel + 1)),
    [bodyLevel, nextBodyUpgradeCost],
  );
  const enemyBuild = useMemo(
    () =>
      generateEnemyBuild(GAME_DATA, run, enemySeed, {
        budget: earnedCoins,
        bodyLevel,
        ...(enemyBuildFixture ? { buildId: enemyBuildFixture } : {}),
        ...(enemyCoreFixture ? { circuitCoreId: enemyCoreFixture } : {}),
        ...(enemyRequiredBlockFixture ? { requiredBlockId: enemyRequiredBlockFixture } : {}),
      }),
    [bodyLevel, earnedCoins, run, enemySeed],
  );
  const enemyBuildDesign = GAME_DATA.buildDesign.builds.find((build) => build.id === enemyBuild.buildId);
  const enemyCoreDesign = GAME_DATA.buildDesign.placementPatterns.find(
    (pattern) => pattern.id === enemyBuild.circuitCoreId,
  );
  const preview = useMemo(
    () =>
      createBattle(GAME_DATA, board, enemyBuild.board, {
        playerMaxHpBonus: maxHpBonus,
        enemyMaxHpBonus: enemyBuild.maxHpBonus,
        playerHeartPosition: heartPosition,
        enemyHeartPosition: enemyBuild.heartPosition,
      }),
    [board, enemyBuild, heartPosition, maxHpBonus],
  );
  const battle = playback[frame] ?? preview;
  const fighters = battle.fighters;
  const player = fighters.find((fighter) => fighter.team === 'player')!;
  const enemy = fighters.find((fighter) => fighter.team === 'enemy')!;
  const battleReport = useMemo(() => createBattleReport(GAME_DATA, battle.trace), [battle.trace]);
  const baseBattleReward = battleReward(GAME_DATA, battle.winner);
  const skillCoinReward = battleCoinsEarned(battle.trace, 'player');
  const totalBattleReward = baseBattleReward + skillCoinReward;
  const rackGroups = useMemo(() => {
    const groups = new Map<string, { block: BlockDefinition; placed: PlacedBlock; count: number }>();
    rack.forEach((placed) => {
      const key = `${placed.blockId}:${placed.rotation}:${placed.stars ?? 0}`;
      const current = groups.get(key);
      if (current) current.count += 1;
      else groups.set(key, { block: blockById.get(placed.blockId)!, placed, count: 1 });
    });
    return [...groups.values()];
  }, [rack]);
  const fusibleBlocks = useMemo(() => {
    const counts = new Map<string, number>();
    [...rack, ...board.flat().filter((placed): placed is PlacedBlock => Boolean(placed))].forEach((placed) => {
      if ((placed.stars ?? 0) > 0) return;
      counts.set(placed.blockId, (counts.get(placed.blockId) ?? 0) + 1);
    });
    return [...counts]
      .filter(([, count]) => count >= GAME_DATA.rules.skillFusion.copiesRequired)
      .flatMap(([blockId]) => {
        const block = blockById.get(blockId);
        return block ? [block] : [];
      });
  }, [board, rack]);
  const catalogBlocks = useMemo(
    () =>
      [...GAME_DATA.blocks]
        .filter(
          (block) =>
            catalogFilter === 'all' ||
            axisValuesForBlock(block.id, 'trait').some((value) => value.id === catalogFilter) ||
            axisValuesForBlock(block.id, 'weapon').some((value) => value.id === catalogFilter),
        )
        .sort(
          (left, right) =>
            RARITY_ORDER.indexOf(left.rarity) - RARITY_ORDER.indexOf(right.rarity) ||
            left.title.localeCompare(right.title, 'ja'),
        ),
    [catalogFilter],
  );
  const frameEvents = useMemo(() => {
    const previousCount = frame > 0 ? (playback[frame - 1]?.trace.length ?? 0) : 0;
    return battle.trace.slice(previousCount);
  }, [battle.trace, frame, playback]);
  const actingTeams = useMemo(
    () =>
      new Set(
        frameEvents
          .filter((event) => event.kind === 'damage' || event.kind === 'poison' || event.kind === 'rupture')
          .map((event) => event.team),
      ),
    [frameEvents],
  );
  const hitTeams = useMemo(
    () =>
      new Set(
        frameEvents
          .filter(
            (event) =>
              event.kind === 'damage' ||
              event.kind === 'rupture' ||
              event.kind === 'poison-tick' ||
              event.kind === 'overload',
          )
          .map((event) =>
            event.kind === 'overload' || event.kind === 'poison-tick'
              ? event.team
              : event.team === 'player'
                ? 'enemy'
                : 'player',
          ),
      ),
    [frameEvents],
  );
  const fighterFeedback = useMemo(() => {
    const feedback: Record<Team, FighterFeedback> = {
      player: { damage: 0, poison: 0, shield: 0, repair: 0 },
      enemy: { damage: 0, poison: 0, shield: 0, repair: 0 },
    };
    for (const event of frameEvents) {
      if (event.kind === 'overload' || event.kind === 'poison-tick') {
        feedback[event.team].damage += event.value;
        continue;
      }
      const targetTeam = event.team === 'player' ? 'enemy' : 'player';
      if (event.kind === 'damage' || event.kind === 'rupture') feedback[targetTeam].damage += event.value;
      if (event.kind === 'poison') feedback[targetTeam].poison += event.value;
      if (event.kind === 'shield') feedback[event.team].shield += event.value;
      if (event.kind === 'repair') feedback[event.team].repair += event.value;
    }
    return feedback;
  }, [frameEvents]);
  const projectileEvents = frameEvents.filter(
    (event): event is Extract<BattleTraceEvent, { blockId: string }> =>
      event.kind === 'damage' || event.kind === 'poison' || event.kind === 'rupture',
  );
  const feedbackKey = frameEvents.map((event) => event.id).join('|');
  const elapsedWaves = battle.tick === 0 ? 0 : battle.tick - 1 + battle.pulseStep / Math.max(1, battle.pulseStepCount);
  const elapsedSeconds = (elapsedWaves * GAME_DATA.rules.battleStepMs) / 1000;
  const battleProgress = Math.min(100, (elapsedSeconds / GAME_DATA.rules.suddenDeathSeconds) * 100);
  const overloaded = battle.overloadLevel > 0;
  const pulseFrameMs = playbackFrameMs(GAME_DATA, battleSpeed);

  useEffect(() => {
    if (phase !== 'battle') return;
    if (frame >= playback.length - 1) {
      const timer = window.setTimeout(() => {
        setDetail(null);
        setPhase('result');
      }, 720 / battleSpeed);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setFrame((current) => current + 1), pulseFrameMs);
    return () => window.clearTimeout(timer);
  }, [battleSpeed, frame, phase, playback.length, pulseFrameMs]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 1800);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!reportOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReportOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [reportOpen]);

  useEffect(() => {
    document.body.classList.toggle('is-dragging', Boolean(dragging));
    return () => document.body.classList.remove('is-dragging');
  }, [dragging]);

  useEffect(() => {
    if (!detail) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetail(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [detail]);

  useEffect(
    () => () => {
      if (holdTimer.current) window.clearTimeout(holdTimer.current);
      if (fusionTimer.current) window.clearTimeout(fusionTimer.current);
    },
    [],
  );

  const clearHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const beginHold = (
    event: ReactPointerEvent<HTMLButtonElement>,
    origin: DragOrigin,
    blockId?: string,
    rotation: Rotation = 0,
    stars: SkillStars = 0,
  ) => {
    if (event.button !== 0) return;
    clearHold();
    event.currentTarget.setPointerCapture(event.pointerId);
    pendingDrag.current = {
      origin,
      blockId,
      rotation,
      stars,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
    };
    holdTimer.current = window.setTimeout(() => {
      const pending = pendingDrag.current;
      if (!pending) return;
      pending.started = true;
      suppressClick.current = true;
      setDragging({
        origin: pending.origin,
        blockId: pending.blockId,
        rotation: pending.rotation,
        stars: pending.stars,
        x: pending.x,
        y: pending.y,
      });
      if ('vibrate' in navigator) navigator.vibrate(18);
    }, HOLD_DELAY);
  };

  const moveHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pending = pendingDrag.current;
    if (!pending || pending.pointerId !== event.pointerId) return;
    pending.x = event.clientX;
    pending.y = event.clientY;
    if (!pending.started) {
      const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
      if (distance > 10) clearHold();
      return;
    }
    event.preventDefault();
    setDragging({
      origin: pending.origin,
      blockId: pending.blockId,
      rotation: pending.rotation,
      stars: pending.stars,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const dropAt = (drag: DragState, x: number, y: number) => {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-circuit-cell]');
    if (!target) {
      setMessage('回路盤へ置く');
      return;
    }
    const position = { row: Number(target.dataset.row), column: Number(target.dataset.column) };
    if (drag.origin.kind === 'heart') {
      const result = moveHeart(board, heartPosition, position);
      if (result.board === board) {
        setMessage('心臓はそこへ移動できません');
        return;
      }
      setBoard(result.board);
      setHeartPosition(result.heartPosition);
      setMessage('心臓を移動');
      return;
    }
    if (drag.origin.kind === 'rack') {
      const result = placeBlockFromRack(rack, board, drag.origin.block, position, heartPosition);
      if (result.board === board) {
        setMessage('そこには置けません');
        return;
      }
      setBoard(result.board);
      setRack(result.rack);
      setMessage(`${(drag.blockId ? blockById.get(drag.blockId)?.title : undefined) ?? '技'}を配置`);
      return;
    }
    const next = moveBlock(board, drag.origin.position, position, heartPosition);
    if (next === board) {
      setMessage('そこへは移動できません');
      return;
    }
    setBoard(next);
    setMessage('技を移動');
  };

  const endHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pending = pendingDrag.current;
    clearHold();
    if (!pending || pending.pointerId !== event.pointerId) return;
    if (pending.started) {
      dropAt(pending, event.clientX, event.clientY);
      setDragging(null);
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
    pendingDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const cancelHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    clearHold();
    pendingDrag.current = null;
    setDragging(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const openDetail = (target: DetailTarget) => {
    if (suppressClick.current) return;
    setDetail(target);
  };

  const rotateDetailBlock = () => {
    if (!detail?.position) return;
    const next = rotateBoardBlock(board, detail.position, GAME_DATA.blocks);
    if (next === board) {
      setMessage(detailBlock?.rotatable === false ? 'この技は形が固定' : '回せる技がありません');
      return;
    }
    setBoard(next);
    setMessage('技を回転');
  };

  const removeDetailBlock = () => {
    if (!detail?.position) return;
    const result = removeBlockToRack(rack, board, detail.position);
    if (result.board === board) {
      setMessage('外せる技がありません');
      return;
    }
    setBoard(result.board);
    setRack(result.rack);
    setDetail(null);
    setMessage('ラックへ戻しました');
  };

  const buy = (offer: ShopOffer) => {
    const block = blockById.get(offer.blockId);
    if (!block) return;
    if (coins < block.price) {
      setMessage('コインが足りません');
      return;
    }
    setCoins((current) => current - block.price);
    setRack((current) => [...current, { blockId: block.id, rotation: offer.rotation }]);
    setShop((current) => current.filter((item) => item.id !== offer.id));
    setMessage(`${block.title}を入手`);
  };

  const startFusion = (blockId: string) => {
    const block = blockById.get(blockId);
    const result = fuseSkillCopies(board, rack, blockId, GAME_DATA.rules.skillFusion.copiesRequired);
    if (!block || !result) {
      setMessage('合成には通常版が3個必要');
      return;
    }
    const rewardSeed = nextShopSeed(seed, 503);
    setBoard(result.board);
    setRack(result.rack);
    setDetail(null);
    setFusionReward({
      fusedBlockId: blockId,
      stage: 'fusing',
      choiceIds: pickFusionRewardIds(shopBlocks, block.rarity, rewardSeed, GAME_DATA.rules.skillFusion.rewardChoices),
      seed: rewardSeed,
    });
    if (fusionTimer.current) window.clearTimeout(fusionTimer.current);
    fusionTimer.current = window.setTimeout(() => {
      setFusionReward((current) => (current ? { ...current, stage: 'choose' } : null));
      fusionTimer.current = null;
    }, 900);
  };

  const chooseFusionReward = (blockId: string) => {
    if (!fusionReward) return;
    const block = blockById.get(blockId);
    if (!block) return;
    const choiceIndex = Math.max(0, fusionReward.choiceIds.indexOf(blockId));
    const reward = createShop([block], shopRarityWeights, fusionReward.seed + choiceIndex * 17, 1)[0];
    setRack((current) => [...current, { blockId, rotation: reward.rotation }]);
    setFusionReward(null);
    setMessage(`${block.title}を獲得`);
  };

  const reroll = () => {
    if (coins < GAME_DATA.rules.rerollCost) {
      setMessage('コインが足りません');
      return;
    }
    const nextSeed = nextShopSeed(seed);
    setCoins((current) => current - GAME_DATA.rules.rerollCost);
    setSeed(nextSeed);
    setShop((current) =>
      rerollShop(shopBlocks, shopRarityWeights, current, nextSeed, GAME_DATA.rules.shopSize, ownedBlockIds),
    );
    setMessage('ショップを更新');
  };

  const toggleLock = (id: string) =>
    setShop((current) => current.map((offer) => (offer.id === id ? { ...offer, locked: !offer.locked } : offer)));

  const upgradeBody = () => {
    if (nextBodyUpgradeCost === null) {
      setMessage('機体強化は最大です');
      return;
    }
    if (coins < nextBodyUpgradeCost) {
      setMessage('コインが足りません');
      return;
    }
    setCoins((current) => current - nextBodyUpgradeCost);
    setBodyLevel((current) => current + 1);
    setMessage(`機体LV.${bodyLevel + 1}へ強化`);
  };

  const startBattle = () => {
    const next = createPlayback(GAME_DATA, board, enemyBuild.board, {
      playerMaxHpBonus: maxHpBonus,
      enemyMaxHpBonus: enemyBuild.maxHpBonus,
      playerHeartPosition: heartPosition,
      enemyHeartPosition: enemyBuild.heartPosition,
    });
    setDetail(null);
    setReportOpen(false);
    setPlayback(next);
    setFrame(0);
    setPhase('battle');
    setMessage('');
  };

  const returnToWorkshop = () => {
    const reward = totalBattleReward;
    const nextSeed = nextShopSeed(seed, 11);
    setCoins((current) => current + reward);
    setEarnedCoins((current) => current + reward);
    setSeed(nextSeed);
    setShop(advanceShop(shopBlocks, shopRarityWeights, shop, nextSeed, GAME_DATA.rules.shopSize, ownedBlockIds));
    setRun((current) => current + 1);
    setEnemySeed((current) => (hasFixtureSeed ? current + 47 : randomShopSeed()));
    setPlayback([]);
    setReportOpen(false);
    setFrame(0);
    setPhase('build');
    setMessage(`コイン +${reward}`);
  };

  const detailBaseBlock = detail ? blockById.get(detail.blockId) : undefined;
  const detailBattleTeam = detail?.location === 'battle' ? detail.team : undefined;
  const detailBoard =
    detailBattleTeam === 'player' ? battle.playerBoard : detailBattleTeam === 'enemy' ? battle.enemyBoard : board;
  const detailPoweredCells =
    detailBattleTeam === 'player'
      ? new Set(battle.playerPowered)
      : detailBattleTeam === 'enemy'
        ? new Set(battle.enemyPowered)
        : powered;
  const detailPlaced = detail?.position ? detailBoard[detail.position.row]?.[detail.position.column] : undefined;
  const detailStars = detailPlaced?.stars ?? detail?.stars ?? 0;
  const detailBlock = detailBaseBlock
    ? upgradeBlockDefinition(detailBaseBlock, detailStars, GAME_DATA.rules.skillFusion)
    : undefined;
  const detailRotation = detailPlaced?.rotation ?? detail?.rotation ?? 0;
  const detailCellKey = detail?.position ? `${detail.position.row}:${detail.position.column}` : undefined;
  const detailOwner = detailBattleTeam === 'player' ? player : detailBattleTeam === 'enemy' ? enemy : undefined;
  const detailOpponent = detailBattleTeam === 'player' ? enemy : detailBattleTeam === 'enemy' ? player : undefined;
  const detailHeartPosition =
    detailBattleTeam === 'player'
      ? battle.playerHeartPosition
      : detailBattleTeam === 'enemy'
        ? battle.enemyHeartPosition
        : heartPosition;
  const detailAnalysis = analyzeCircuit(
    detailBoard,
    GAME_DATA.blocks,
    detailHeartPosition,
    GAME_DATA.rules.heart.ports,
  );
  const detailMagicSigils = analyzeMagicSigils(
    detailBoard,
    GAME_DATA.blocks,
    detailAnalysis,
    GAME_DATA.rules.skillFusion,
    GAME_DATA.rules.magicSigils,
  );
  const detailMagicSigilCount = countActiveMagicSigils(detailBoard, detailAnalysis, detailMagicSigils);
  const detailMagicSigilLevel = detailCellKey ? (detailMagicSigils.levels.get(detailCellKey) ?? 0) : 0;
  const detailAdjacentPoweredCount =
    detailBlock && detail?.position
      ? adjacentPoweredCountForBlock(detailBoard, detailAnalysis, detail.position, detailBlock)
      : 0;
  const detailResonanceCount =
    detailBlock && !detailBlock.packet && usesAdjacentPoweredCount(detailBlock)
      ? detailAdjacentPoweredCount
      : undefined;
  const detailIsLightVein = detailBlock
    ? skillDesignByBlockId.get(detailBlock.id)?.placementPatternId === 'light-vein'
    : false;
  const detailDownstreamCount = detailCellKey ? (detailAnalysis.downstreamCells.get(detailCellKey)?.length ?? 0) : 0;
  const detailUpstreamCount = detailCellKey ? (detailAnalysis.upstreamCells.get(detailCellKey)?.length ?? 0) : 0;
  const detailChargeByCell = calculateChargeByCell(
    detailBoard,
    GAME_DATA.blocks,
    detailAnalysis,
    GAME_DATA.rules.skillFusion,
  );
  const detailModifiers =
    detail?.position && detailCellKey && detailPoweredCells.has(detailCellKey)
      ? combineSkillModifiers(
          incomingSkillModifiers(
            detailBoard,
            GAME_DATA.blocks,
            detailAnalysis,
            detail.position,
            GAME_DATA.rules.skillFusion,
          ),
          magicSigilModifiers(detailMagicSigilLevel, GAME_DATA.rules.magicSigils),
        )
      : { effectPower: 0, cooldownReduction: 0 };
  const detailBuffs =
    detailBattleTeam && detailCellKey ? (battle.skillBuffs[detailBattleTeam][detailCellKey] ?? {}) : {};
  const detailProgress = detailBlock
    ? summarizeSkillProgress(detailBlock, detailBuffs, detailModifiers, {
        enemyPoison: detailOpponent?.poison ?? 0,
        pathLength: detailCellKey ? (detailAnalysis.routeLength.get(detailCellKey) ?? 0) : 0,
        straightLineLength: detailCellKey ? (detailAnalysis.straightLineLength.get(detailCellKey) ?? 0) : 0,
        magicSigilLevel: detailMagicSigilLevel,
        magicSigilCount: detailMagicSigilCount,
        adjacentPoweredCount: detailAdjacentPoweredCount,
        downstreamCount: detailDownstreamCount,
        upstreamCount: detailUpstreamCount,
        poweredAxisCounts: poweredAxisCountsForBlock(detailBoard, detailPoweredCells, detailBlock),
      })
    : undefined;
  const detailVisibleBuffs =
    detailBlock && detailProgress ? visibleBuffs(detailBlock, detailProgress, detailModifiers) : undefined;
  const detailCooldown = detailBlock?.cooldown
    ? Math.max(1, detailBlock.cooldown - detailModifiers.cooldownReduction)
    : undefined;
  const detailMergeMultiplier =
    detailCellKey && detailAnalysis.mergeCells.has(detailCellKey) ? GAME_DATA.rules.mergeEffectMultiplier : 1;
  const detailPacketOperations =
    detailBlock?.packet?.effects.flatMap((effect) => {
      if (effect.kind === 'split-packet') return ['等分'];
      if (effect.kind === 'merge-packet') return ['合流'];
      if (effect.kind === 'echo-packet') return ['複製'];
      if (effect.kind === 'imprint-packet') return ['刻印'];
      if (effect.kind === 'recirculate-packet') return ['再循環'];
      if (effect.kind === 'convert-packet') return ['変換'];
      return [];
    }) ?? [];
  const detailTopology = detailBlock?.packet
    ? detailPacketOperations.length > 0
      ? detailPacketOperations.join('・')
      : '状態生成'
    : detailCellKey
      ? [
          detailAnalysis.branchCells.has(detailCellKey) ? '自動分岐' : '',
          detailAnalysis.mergeCells.has(detailCellKey) ? '合流' : '',
          detailAnalysis.cyclicCells.has(detailCellKey) ? '循環' : '',
          detailAnalysis.fullyConnectedCells.has(detailCellKey) ? '全接続' : '',
          detailMagicSigilLevel > 0 ? `魔紋${SIGIL_LEVEL_LABELS[detailMagicSigilLevel]}` : '',
          detailResonanceCount !== undefined ? `共鳴${detailResonanceCount}` : '',
          (detailAnalysis.straightLineLength.get(detailCellKey) ?? 0) >= 4
            ? `直線${detailAnalysis.straightLineLength.get(detailCellKey)}`
            : '',
        ]
          .filter(Boolean)
          .join('・')
      : detailBlock && detailBlock.ports.length >= 3
        ? '3方向'
        : '';

  return (
    <main className={`app-shell phase-${phase}`}>
      {phase === 'build' ? (
        <>
          <header className="topbar">
            <div className="brand-block">
              <span className="brand-prompt">CM://</span>
              <div>
                <h1>CODE MONSTERS</h1>
                <small>CIRCUIT BAY</small>
              </div>
            </div>
            <nav className="workshop-tabs" aria-label="工房メニュー">
              <button
                aria-pressed={workshopView === 'circuit'}
                onClick={() => {
                  setWorkshopView('circuit');
                  setDetail(null);
                }}
              >
                <span>01</span> 回路
              </button>
              <button
                aria-pressed={workshopView === 'catalog'}
                onClick={() => {
                  setWorkshopView('catalog');
                  setDetail(null);
                }}
              >
                <span>02</span> カード一覧
              </button>
            </nav>
            <div className="run-stats">
              <span>
                RUN <b>{String(run).padStart(2, '0')}</b>
              </span>
              <span>
                TIER <b>{String(level).padStart(2, '0')}</b>
              </span>
              <span className="coin-readout">
                COIN <b>{coins}</b>
              </span>
            </div>
          </header>

          {workshopView === 'circuit' ? (
            <div className="workspace-layout">
              <section className="console-panel circuit-panel">
                <header className="panel-head">
                  <div>
                    <small>YOUR CIRCUIT</small>
                    <h2>技回路</h2>
                  </div>
                  <span className="power-count">
                    通電技 <b>{powered.size}</b>
                    {activeMagicSigilCount > 0 && <i>魔紋 {activeMagicSigilCount}</i>}
                  </span>
                </header>

                <div className="circuit-workbench">
                  <div className="circuit-stage">
                    <div className="circuit-board" role="grid" aria-label="5×5 回路ボード">
                      {board.flatMap((row, rowIndex) =>
                        row.map((placed, columnIndex) => {
                          const baseBlock = placed ? blockById.get(placed.blockId) : undefined;
                          const block =
                            baseBlock && placed
                              ? upgradeBlockDefinition(baseBlock, placed.stars ?? 0, GAME_DATA.rules.skillFusion)
                              : undefined;
                          const key = `${rowIndex}:${columnIndex}`;
                          const isHeart = rowIndex === heartPosition.row && columnIndex === heartPosition.column;
                          const magicSigilLevel = magicSigils.levels.get(key) ?? 0;
                          const conditions = conditionStatusesByCell.get(key) ?? [];
                          const conditionSummary = conditions.map(conditionLabel).join('、');
                          const resonanceCount =
                            block && usesAdjacentPoweredCount(block)
                              ? adjacentPoweredCountForBlock(
                                  board,
                                  circuitAnalysis,
                                  { row: rowIndex, column: columnIndex },
                                  block,
                                )
                              : undefined;
                          return (
                            <div
                              className={`circuit-cell ${isHeart ? 'is-heart' : ''} ${powered.has(key) ? 'is-powered' : ''} ${circuitAnalysis.mergeCells.has(key) ? 'is-merge' : ''} ${magicSigilLevel > 0 ? 'is-magic-sigil' : ''} ${conditions.some((condition) => condition.met) ? 'is-condition-ready' : ''} ${conditionPreviewCells.has(key) ? 'is-condition-path' : ''}`}
                              data-circuit-cell
                              data-magic-sigil-level={magicSigilLevel || undefined}
                              data-resonance-count={resonanceCount}
                              data-condition-state={
                                conditions.length > 0
                                  ? conditions.some((condition) => condition.met)
                                    ? 'ready'
                                    : 'pending'
                                  : undefined
                              }
                              data-row={rowIndex}
                              data-column={columnIndex}
                              role="gridcell"
                              key={key}
                            >
                              {!PACKET_MODEL && !isHeart && (
                                <MagicSigilMark level={magicSigilLevel} active={powered.has(key)} />
                              )}
                              {isHeart ? (
                                <button
                                  type="button"
                                  className="heart-button"
                                  aria-label="心臓。長押しで移動"
                                  onPointerDown={(event) =>
                                    beginHold(event, { kind: 'heart', position: heartPosition })
                                  }
                                  onPointerMove={moveHold}
                                  onPointerUp={endHold}
                                  onPointerCancel={cancelHold}
                                >
                                  <HeartVisual />
                                </button>
                              ) : block && placed ? (
                                <button
                                  className="block-button"
                                  aria-label={`${block.title}${powered.has(key) ? ' 通電中' : ' 未通電'}${magicSigilLevel > 0 ? `。魔紋位階${SIGIL_LEVEL_LABELS[magicSigilLevel]}` : ''}${conditionSummary ? `。条件 ${conditionSummary}` : ''}。クリックで詳細、長押しで移動`}
                                  onPointerEnter={() => conditions.length > 0 && setConditionPreviewKey(key)}
                                  onPointerLeave={() =>
                                    setConditionPreviewKey((current) => (current === key ? null : current))
                                  }
                                  onFocus={() => conditions.length > 0 && setConditionPreviewKey(key)}
                                  onBlur={() => setConditionPreviewKey((current) => (current === key ? null : current))}
                                  onClick={() =>
                                    openDetail({
                                      blockId: block.id,
                                      position: { row: rowIndex, column: columnIndex },
                                      location: 'board',
                                    })
                                  }
                                  onPointerDown={(event) =>
                                    beginHold(
                                      event,
                                      { kind: 'board', position: { row: rowIndex, column: columnIndex } },
                                      block.id,
                                      placed.rotation,
                                      placed.stars ?? 0,
                                    )
                                  }
                                  onPointerMove={moveHold}
                                  onPointerUp={endHold}
                                  onPointerCancel={cancelHold}
                                >
                                  <BlockVisual
                                    block={block}
                                    rotation={placed.rotation}
                                    stars={placed.stars ?? 0}
                                    powered={powered.has(key)}
                                    resonanceCount={resonanceCount}
                                  />
                                  {!block.packet && circuitAnalysis.mergeCells.has(key) && (
                                    <b className="merge-preview">×{GAME_DATA.rules.mergeEffectMultiplier}</b>
                                  )}
                                  <CircuitConditionChips conditions={conditions} />
                                </button>
                              ) : (
                                <span
                                  className="empty-cell"
                                  aria-label={
                                    magicSigilLevel > 0
                                      ? `空きマス、魔紋位階${SIGIL_LEVEL_LABELS[magicSigilLevel]}`
                                      : '空きマス'
                                  }
                                />
                              )}
                            </div>
                          );
                        }),
                      )}
                    </div>
                  </div>
                  <div className="board-legend" aria-hidden="true">
                    <span>
                      <i className="legend-live" /> 通電
                    </span>
                    <span>
                      <i className="legend-off" /> 未接続
                    </span>
                    <span>
                      <i className="legend-condition" /> 条件成立
                    </span>
                    <span>
                      <i className="legend-sigil" /> 魔紋
                    </span>
                    <b>長押しで移動</b>
                  </div>
                </div>

                <div className="rack">
                  <div className="rack-label">
                    <small>SKILL RACK</small>
                    <b>予備の技</b>
                  </div>
                  <div className="rack-list">
                    {rackGroups.length === 0 ? (
                      <span className="rack-empty">ショップで補充</span>
                    ) : (
                      rackGroups.map(({ block, placed, count }) => {
                        const displayBlock = upgradeBlockDefinition(
                          block,
                          placed.stars ?? 0,
                          GAME_DATA.rules.skillFusion,
                        );
                        return (
                          <button
                            className="rack-block"
                            key={`${block.id}-${placed.rotation}-${placed.stars ?? 0}`}
                            aria-label={`${displayBlock.title}${(placed.stars ?? 0) > 0 ? ' 星1' : ''} ${count}個。クリックで詳細、長押しで配置`}
                            onClick={() =>
                              openDetail({
                                blockId: block.id,
                                rotation: placed.rotation,
                                stars: placed.stars ?? 0,
                                location: 'rack',
                              })
                            }
                            onPointerDown={(event) =>
                              beginHold(
                                event,
                                { kind: 'rack', block: placed },
                                block.id,
                                placed.rotation,
                                placed.stars ?? 0,
                              )
                            }
                            onPointerMove={moveHold}
                            onPointerUp={endHold}
                            onPointerCancel={cancelHold}
                          >
                            <BlockVisual
                              block={displayBlock}
                              rotation={placed.rotation}
                              stars={placed.stars ?? 0}
                              compact
                            />
                            <span>
                              {displayBlock.title}
                              {(placed.stars ?? 0) > 0 ? ' ★' : ''}
                            </span>
                            <em>×{count}</em>
                          </button>
                        );
                      })
                    )}
                  </div>
                  {fusibleBlocks.length > 0 && (
                    <div className="fusion-ready-list" aria-label="合成可能な技">
                      {fusibleBlocks.map((block) => (
                        <button type="button" key={block.id} onClick={() => startFusion(block.id)}>
                          <span>3 → ★</span>
                          <b>{block.title}を合成</b>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <aside className="console-panel shop-panel">
                <header className="panel-head">
                  <div>
                    <small>SKILL SHOP</small>
                    <h2>技ショップ</h2>
                  </div>
                  <button className="reroll-button" onClick={reroll} aria-label="ショップを更新">
                    更新 <b>{GAME_DATA.rules.rerollCost}</b>
                  </button>
                </header>
                <section className="shop-rarity-rates" aria-label={`機体LV.${bodyLevel}のレアリティ排出率`}>
                  <span className="shop-rarity-rates-label">DROP RATE</span>
                  {RARITY_ORDER.map((rarity) => (
                    <span
                      className={`rarity-rate rarity-${rarity}`}
                      data-rarity-rate={rarity}
                      data-rate={shopRarityRates[rarity]}
                      style={{ '--rarity-color': RARITY_COPY[rarity].color } as CSSProperties}
                      key={rarity}
                    >
                      <i />
                      <small>{RARITY_COPY[rarity].code}</small>
                      <b>{formatRarityRate(shopRarityRates[rarity])}</b>
                    </span>
                  ))}
                </section>
                <section className="body-upgrade" aria-label="機体強化">
                  <div className="body-upgrade-mark" aria-hidden="true">
                    <HeartVisual compact />
                  </div>
                  <div className="body-upgrade-copy">
                    <small>BODY TUNE</small>
                    <strong>機体強化 LV.{bodyLevel}</strong>
                    <span>
                      最大HP <b>{player.maxHp}</b>
                      {nextBodyUpgradeCost !== null && <em>+{GAME_DATA.rules.bodyUpgrades.hpPerLevel}</em>}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={upgradeBody}
                    disabled={nextBodyUpgradeCost === null}
                    aria-label={
                      nextBodyUpgradeCost === null
                        ? '機体強化は最大'
                        : `コイン${nextBodyUpgradeCost}で最大HPを${GAME_DATA.rules.bodyUpgrades.hpPerLevel}増やす`
                    }
                  >
                    {nextBodyUpgradeCost === null ? (
                      <b>MAX</b>
                    ) : (
                      <>
                        強化 <b>{nextBodyUpgradeCost}</b>
                      </>
                    )}
                  </button>
                  {nextBodyRarityRates && (
                    <div className="body-upgrade-rates" aria-label={`機体LV.${bodyLevel + 1}の排出率`}>
                      <small>NEXT DROP</small>
                      {RARITY_ORDER.map((rarity) => {
                        const delta = nextBodyRarityRates[rarity] - shopRarityRates[rarity];
                        return (
                          <span
                            data-rarity-delta={rarity}
                            className={`rarity-${rarity} ${delta >= 0 ? 'is-up' : 'is-down'}`}
                            style={{ '--rarity-color': RARITY_COPY[rarity].color } as CSSProperties}
                            key={rarity}
                          >
                            <b>{RARITY_COPY[rarity].code}</b>
                            <strong>{formatRarityRate(nextBodyRarityRates[rarity])}</strong>
                            <em>
                              {delta >= 0 ? '+' : ''}
                              {(delta * 100).toFixed(1)}pt
                            </em>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </section>
                <div className="shop-list">
                  {Array.from({ length: GAME_DATA.rules.shopSize }, (_, slot) => {
                    const offer = shop.find((item) => item.slot === slot);
                    if (!offer)
                      return (
                        <div className="shop-empty" key={`empty-${slot}`}>
                          SOLD
                        </div>
                      );
                    const block = blockById.get(offer.blockId)!;
                    return (
                      <article
                        className={`shop-card rarity-${block.rarity} ${offer.locked ? 'is-locked' : ''}`}
                        key={offer.id}
                      >
                        <button
                          className={`lock-button ${offer.locked ? 'is-locked' : ''}`}
                          onClick={() => toggleLock(offer.id)}
                          aria-label={`${block.title}を${offer.locked ? 'ロック解除' : 'ロック'}`}
                          aria-pressed={offer.locked}
                        >
                          {offer.locked ? 'LOCKED' : 'LOCK'}
                        </button>
                        <button
                          className="shop-block-button"
                          onClick={() => openDetail({ blockId: block.id, rotation: offer.rotation, location: 'shop' })}
                          aria-label={`${block.title}の詳細を見る`}
                        >
                          <BlockVisual block={block} rotation={offer.rotation} compact />
                          <span>
                            <small>
                              {RARITY_COPY[block.rarity].code} · {block.code}
                            </small>
                            <strong>{block.title}</strong>
                            <BlockAxisBadges blockId={block.id} compact />
                          </span>
                        </button>
                        <button className="buy-button" onClick={() => buy(offer)}>
                          買う <b>{block.price}</b>
                        </button>
                      </article>
                    );
                  })}
                </div>
                <button className="run-button" onClick={startBattle}>
                  <span>戦闘開始</span>
                  <small>POWER ON ▶</small>
                </button>
              </aside>
            </div>
          ) : (
            <CatalogScreen
              blocks={catalogBlocks}
              filter={catalogFilter}
              onFilter={setCatalogFilter}
              onSelect={openDetail}
            />
          )}
        </>
      ) : (
        <section
          className="battle-screen"
          aria-label="1対1バトル画面"
          data-battle-speed={battleSpeed}
          style={{ '--battle-motion-scale': 1 / battleSpeed } as CSSProperties}
        >
          <header className="battle-hud">
            <div>
              <small>CODE MONSTERS</small>
              <h1>BATTLE RUN {String(run).padStart(2, '0')}</h1>
            </div>
            <div className="battle-hud-tools">
              <div className="rival-readout">
                <small>RIVAL BODY LV.{String(enemyBuild.bodyLevel).padStart(2, '0')}</small>
                <b>
                  {enemyBuildDesign?.title ?? enemyBuild.buildId} × {enemyCoreDesign?.title ?? enemyBuild.circuitCoreId}
                </b>
                <i>
                  {enemyBuild.nodeCount} NODE · {enemyBuild.totalCost}/{enemyBuild.budget} COIN
                </i>
              </div>
              <div className="battle-speed" role="group" aria-label="戦闘速度">
                {BATTLE_SPEEDS.map((speed) => (
                  <button
                    type="button"
                    key={speed}
                    aria-label={`${speed}倍`}
                    aria-pressed={battleSpeed === speed}
                    onClick={() => setBattleSpeed(speed)}
                  >
                    {speed}×
                  </button>
                ))}
              </div>
              <div className={`battle-counter ${overloaded ? 'is-overload' : ''}`}>
                <span>{overloaded ? 'OVERLOAD' : 'TIME'}</span>
                <b>{elapsedSeconds.toFixed(1)}</b>
                <i>{overloaded ? `DMG ${battle.overloadDamage}` : `/ ${GAME_DATA.rules.suddenDeathSeconds}s`}</i>
              </div>
            </div>
          </header>

          <div className="battle-stage">
            <div className="arena-team-label is-player">YOUR UNIT</div>
            <div className="arena-team-label is-enemy">RIVAL</div>
            {projectileEvents.map((event) => {
              const targetMaxHp = event.team === 'player' ? enemy.maxHp : player.maxHp;
              const damageTier =
                event.kind === 'damage' || event.kind === 'rupture' ? damageTierFor(event.value, targetMaxHp) : null;
              return (
                <i
                  className={`battle-projectile team-${event.team} effect-${event.kind === 'poison' ? 'poison' : event.charge !== undefined ? 'charge' : 'damage'} ${damageTier ? `damage-${damageTier}` : ''}`}
                  data-damage-tier={damageTier ?? undefined}
                  key={event.id}
                  aria-hidden="true"
                />
              );
            })}
            <ArenaFighter
              fighter={player}
              acting={actingTeams.has('player')}
              hit={hitTeams.has('player')}
              overloaded={overloaded}
              feedback={fighterFeedback.player}
              feedbackKey={`player:${feedbackKey}`}
            />
            <ArenaFighter
              fighter={enemy}
              acting={actingTeams.has('enemy')}
              hit={hitTeams.has('enemy')}
              overloaded={overloaded}
              feedback={fighterFeedback.enemy}
              feedbackKey={`enemy:${feedbackKey}`}
            />
          </div>

          <div className="battle-circuit-deck" aria-live="polite">
            <BattleCircuitSummary
              team="player"
              label={player.name}
              board={battle.playerBoard}
              heartPosition={battle.playerHeartPosition}
              powered={battle.playerPowered}
              events={frameEvents}
              tick={battle.tick}
              pulseStep={battle.pulseStep}
              pulseStepCount={battle.pulseStepCount}
              pulseCells={battle.activePulse.player}
              buffs={battle.skillBuffs.player}
              enemyPoison={enemy.poison}
              onSelect={openDetail}
            />
            <BattleCircuitSummary
              team="enemy"
              label={enemy.name}
              board={battle.enemyBoard}
              heartPosition={battle.enemyHeartPosition}
              powered={battle.enemyPowered}
              events={frameEvents}
              tick={battle.tick}
              pulseStep={battle.pulseStep}
              pulseStepCount={battle.pulseStepCount}
              pulseCells={battle.activePulse.enemy}
              buffs={battle.skillBuffs.enemy}
              enemyPoison={player.poison}
              onSelect={openDetail}
            />
          </div>

          <footer className={`battle-time-rail ${overloaded ? 'is-overload' : ''}`} aria-label="戦闘時間">
            <div>
              <i style={{ width: `${overloaded ? 100 : battleProgress}%` }} />
            </div>
            <small>
              {overloaded ? `過負荷 Lv.${battle.overloadLevel}` : `${GAME_DATA.rules.suddenDeathSeconds}秒後 過負荷`}
            </small>
          </footer>
        </section>
      )}

      <div className={`toast ${message ? 'is-visible' : ''}`} role="status">
        {message}
      </div>

      {fusionReward && (
        <div className="fusion-backdrop">
          <section
            className={`fusion-dialog is-${fusionReward.stage}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="fusion-dialog-title"
          >
            <header>
              <small>SKILL FUSION</small>
              <h2 id="fusion-dialog-title">
                {blockById.get(fusionReward.fusedBlockId)?.title}
                {blockById.get(fusionReward.fusedBlockId)?.fusion && (
                  <small>
                    {' → '}
                    {
                      upgradeBlockDefinition(blockById.get(fusionReward.fusedBlockId)!, 1, GAME_DATA.rules.skillFusion)
                        .title
                    }
                  </small>
                )}{' '}
                <b>★</b>
              </h2>
            </header>
            {fusionReward.stage === 'fusing' ? (
              <div className="fusion-converge" aria-label="3つの技を合成中">
                <div className="fusion-copies" aria-hidden="true">
                  {Array.from({ length: GAME_DATA.rules.skillFusion.copiesRequired }, (_, index) => (
                    <BlockVisual
                      block={blockById.get(fusionReward.fusedBlockId)!}
                      compact
                      key={`${fusionReward.fusedBlockId}-${index}`}
                    />
                  ))}
                </div>
                <strong>★</strong>
                <span>3 NODE SYNC</span>
              </div>
            ) : (
              <div className="fusion-reward">
                <p>同じレアリティから1つ獲得</p>
                <div className="fusion-choices">
                  {fusionReward.choiceIds.map((blockId) => {
                    const block = blockById.get(blockId)!;
                    return (
                      <button
                        type="button"
                        className={`fusion-choice rarity-${block.rarity}`}
                        style={blockVisualStyle(block)}
                        onClick={() => chooseFusionReward(blockId)}
                        key={blockId}
                      >
                        <BlockVisual block={block} compact />
                        <span>
                          <small>{RARITY_COPY[block.rarity].label}</small>
                          <b>{block.title}</b>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {detailBlock && detail && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => event.target === event.currentTarget && setDetail(null)}
        >
          <section className="block-dialog" role="dialog" aria-modal="true" aria-labelledby="block-dialog-title">
            <button className="dialog-close" onClick={() => setDetail(null)} aria-label="詳細を閉じる">
              ×
            </button>
            <div className="dialog-block-preview">
              <BlockVisual
                block={detailBlock}
                rotation={detailRotation}
                stars={detailStars}
                powered={Boolean(detailCellKey && detailPoweredCells.has(detailCellKey))}
                resonanceCount={detailResonanceCount}
              />
            </div>
            <div className="dialog-copy">
              <small>{detail.location === 'battle' ? `${detailBlock.code} · LIVE` : detailBlock.code}</small>
              <h2 id="block-dialog-title">
                {detailBlock.title}
                {detailStars > 0 ? ' ★' : ''}
              </h2>
              <BlockAxisBadges blockId={detailBlock.id} />
              <p>{detailBlock.description}</p>
              <CircuitScopeDiagram block={detailBlock} rotation={detailRotation} />
              {detailStars > 0 && (
                <div className="dialog-star-rule">
                  <span>STAR UPGRADE</span>
                  {detailBaseBlock?.fusion
                    ? `「${detailBaseBlock.title}」から「${detailBlock.title}」へ効果変化`
                    : `全効果 ×${GAME_DATA.rules.skillFusion.effectMultiplier}・発動間隔 -${GAME_DATA.rules.skillFusion.cooldownReduction}拍`}
                </div>
              )}
              {!detailBlock.packet && detailResonanceCount !== undefined && (
                <div className="dialog-resonance-rule">
                  <span>SPIRIT RESONANCE · {detailResonanceCount}/8</span>
                  周囲8マスにある、特性を問わないすべての通電ノードを数える。
                </div>
              )}
              {!detailBlock.packet && detailIsLightVein && detail?.position && (
                <div className="dialog-light-vein-rule">
                  <span>
                    LIGHT VEIN · 分岐 {detailDownstreamCount} / 合流 {detailUpstreamCount}
                  </span>
                  通電した下流を枝光として数え、同じ波で届いた上流を収光として数える。
                </div>
              )}
              {!detailBlock.packet && detailMergeMultiplier > 1 && (
                <div className="dialog-merge-rule">
                  <span>MERGE</span>
                  合流時、発動効果 ×{detailMergeMultiplier}
                </div>
              )}
              {!detailBlock.packet && detailMagicSigilLevel > 0 && (
                <div className="dialog-magic-sigil-rule">
                  <span>MAGIC SIGIL · {SIGIL_LEVEL_LABELS[detailMagicSigilLevel]}</span>
                  発動効果 +{detailMagicSigilLevel * GAME_DATA.rules.magicSigils.effectPowerPerLevel}
                  {detailMagicSigilLevel >= GAME_DATA.rules.magicSigils.hasteLevel
                    ? `・発動間隔 -${GAME_DATA.rules.magicSigils.cooldownReduction}拍`
                    : ''}
                </div>
              )}
              {detailBattleTeam && detailProgress && detailVisibleBuffs && detailOwner && (
                <div
                  className={`battle-buff-panel team-${detailBattleTeam}`}
                  data-buff-team={detailBattleTeam}
                  aria-label={`${detailBlock.title}の戦闘中の強化`}
                >
                  <header>
                    <span>
                      <small>{detailBattleTeam === 'player' ? 'YOUR SKILL' : 'RIVAL SKILL'}</small>
                      <b>{detailBattleTeam === 'player' ? '自分の技' : '相手の技'}</b>
                    </span>
                    <strong>戦闘中の強化</strong>
                  </header>
                  {detailVisibleBuffs.stats.length > 0 || detailVisibleBuffs.cooldownReduction > 0 ? (
                    <ul className="battle-buff-values">
                      {detailVisibleBuffs.stats.map(([stat, value]) => (
                        <li key={stat}>
                          <span>{BUFF_COPY[stat].label}</span>
                          <b>+{value.battle + value.circuit}</b>
                          <small>
                            {[
                              value.battle > 0 ? `成長 +${value.battle}` : '',
                              value.circuit > 0 ? `回路 +${value.circuit}` : '',
                            ]
                              .filter(Boolean)
                              .join(' / ')}
                          </small>
                        </li>
                      ))}
                      {detailVisibleBuffs.cooldownReduction > 0 && (
                        <li>
                          <span>発動間隔</span>
                          <b>-{detailVisibleBuffs.cooldownReduction}拍</b>
                          <small>加速回路</small>
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="battle-buff-empty">この技への強化はまだありません。</p>
                  )}
                  <footer>
                    <span>{detailOwner.name}</span>
                    <em>{detailCooldown ? `${detailCooldown}拍ごとに発動` : '通電中ずっと作用'}</em>
                  </footer>
                </div>
              )}
              <dl>
                <div>
                  <dt>レアリティ</dt>
                  <dd className="rarity-value" style={blockVisualStyle(detailBlock)}>
                    <i /> {RARITY_COPY[detailBlock.rarity].label}
                  </dd>
                </div>
                <div>
                  <dt>状態軸</dt>
                  <dd>
                    {axisValuesForBlock(detailBlock.id, 'trait')
                      .map((value) => value.title)
                      .join('・')}
                  </dd>
                </div>
                <div>
                  <dt>出力軸</dt>
                  <dd>
                    {axisValuesForBlock(detailBlock.id, 'weapon')
                      .map((value) => value.title)
                      .join('・')}
                  </dd>
                </div>
                {!detailBlock.packet && detailCellKey && detailPoweredCells.has(detailCellKey) && (
                  <div>
                    <dt>チャージ</dt>
                    <dd>{detailChargeByCell.get(detailCellKey) ?? 0}</dd>
                  </div>
                )}
                {!detailBlock.packet && detailMagicSigilLevel > 0 && (
                  <div>
                    <dt>魔紋</dt>
                    <dd>
                      位階{SIGIL_LEVEL_LABELS[detailMagicSigilLevel]}・通電中 {detailMagicSigilCount}マス
                    </dd>
                  </div>
                )}
                {!detailBlock.packet && detailResonanceCount !== undefined && (
                  <div>
                    <dt>共鳴度</dt>
                    <dd>{detailResonanceCount} / 8</dd>
                  </div>
                )}
                {detailBattleTeam && detailProgress && (
                  <div>
                    <dt>現在</dt>
                    <dd>
                      {effectLabel(
                        detailBlock,
                        detailProgress,
                        detailMergeMultiplier,
                        detailCellKey ? (detailChargeByCell.get(detailCellKey) ?? 0) : 0,
                      )}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>動作</dt>
                  <dd>
                    {detailCooldown
                      ? detailCooldown === 1
                        ? '毎拍'
                        : `${detailCooldown}拍ごと`
                      : cooldownLabel(detailBlock)}
                  </dd>
                </div>
                <div>
                  <dt>接続</dt>
                  <dd>
                    {rotatePorts(detailBlock.ports, detailRotation)
                      .map((port) => ({ north: '上', east: '右', south: '下', west: '左' })[port as Direction])
                      .join('・')}
                    {detailTopology ? ` · ${detailTopology}` : ''}
                  </dd>
                </div>
              </dl>
            </div>
            {detail.location === 'board' && (
              <div className="dialog-actions">
                {detailBlock.rotatable === false ? (
                  <span className="fixed-direction">形は固定</span>
                ) : (
                  <button onClick={rotateDetailBlock}>回す ↻</button>
                )}
                <button className="is-danger" onClick={removeDetailBlock}>
                  外す
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {dragging && (
        <div className="drag-ghost" style={{ left: dragging.x, top: dragging.y } as CSSProperties} aria-hidden="true">
          {dragging.origin.kind === 'heart' ? (
            <HeartVisual />
          ) : (
            <BlockVisual
              block={upgradeBlockDefinition(
                blockById.get(dragging.blockId!)!,
                dragging.stars,
                GAME_DATA.rules.skillFusion,
              )}
              rotation={dragging.rotation}
              stars={dragging.stars}
              powered
            />
          )}
        </div>
      )}

      {phase === 'result' && (
        <div className="result-backdrop">
          <section className="result-panel" role="dialog" aria-modal="true" aria-labelledby="result-title">
            <small>CIRCUIT HALTED</small>
            <h2 id="result-title">
              {battle.winner === 'player' ? '勝利' : battle.winner === 'draw' ? '引き分け' : '再配線'}
            </h2>
            <div className="result-score">
              <span>
                自機 <b>{player.hp}</b>
              </span>
              <span>
                相手 機体LV.{enemyBuild.bodyLevel} <b>{enemy.hp}</b>
              </span>
            </div>
            <div className="result-reward">
              <b>報酬 COIN +{totalBattleReward}</b>
              {skillCoinReward > 0 && (
                <small>
                  戦闘報酬 +{baseBattleReward} / スキル回収 +{skillCoinReward}
                </small>
              )}
            </div>
            <div className="result-actions">
              <button
                className="is-report"
                onClick={() => {
                  setReportTeam('player');
                  setReportOpen(true);
                }}
              >
                戦闘レポート
              </button>
              <button onClick={returnToWorkshop}>工房へ戻る</button>
            </div>
          </section>
        </div>
      )}

      {phase === 'result' && reportOpen && (
        <BattleReportDialog
          report={battleReport}
          team={reportTeam}
          run={run}
          player={player}
          enemy={enemy}
          onTeam={setReportTeam}
          onClose={() => setReportOpen(false)}
        />
      )}
    </main>
  );
}
