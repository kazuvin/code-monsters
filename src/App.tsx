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
import { analyzeCircuit, calculateChargeByCell, rotatePorts } from './core/circuit';
import { damageTierFor, type DamageTier } from './core/combat-presentation';
import { battleReward } from './core/economy';
import { generateEnemyBuild } from './core/enemy-builder';
import { fuseSkillCopies, pickFusionRewardIds, upgradeBlockDefinition } from './core/fusion';
import { moveBlock, placeBlockFromRack, removeBlockToRack, rotateBoardBlock } from './core/loadout';
import { BATTLE_SPEEDS, playbackFrameMs, type BattleSpeed } from './core/playback';
import { advanceShop, createShop, randomShopSeed, rerollShop } from './core/shop';
import {
  incomingSkillModifiers,
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
type DragOrigin = { kind: 'board'; position: CellPosition } | { kind: 'rack'; block: PlacedBlock };
type DragState = {
  origin: DragOrigin;
  blockId: string;
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
const HOLD_DELAY = 320;
const blockById = new Map(GAME_DATA.blocks.map((block) => [block.id, block]));
const shopBlocks = GAME_DATA.blocks.filter((block) => block.price > 0);
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
const WEAPON_MARK: Record<string, string> = { blade: '剣', bow: '弓', cannon: '砲', device: '機', magic: '術' };
const FEEDBACK_COPY: Record<FeedbackKind, string> = {
  damage: 'ダメージ',
  poison: '毒付与',
  shield: '防護',
  repair: '回復',
};
const FEEDBACK_TIER_ORDER: DamageTier[] = ['small', 'medium', 'large'];

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

const effectLabel = (block: BlockDefinition, progress?: SkillProgress, multiplier = 1, charge = 0) => {
  const progressByEffect = new Map(progress?.effects.map((effect) => [effect.effectIndex, effect]));
  return block.effects
    .map((effect, effectIndex) => {
      const progress = progressByEffect.get(effectIndex);
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
}: {
  block: BlockDefinition;
  rotation?: Rotation;
  stars?: SkillStars;
  powered?: boolean;
  compact?: boolean;
  portFlows?: Partial<Record<Direction, PortFlow>>;
}) => {
  const ports = rotatePorts(block.ports, rotation);
  const traits = axisValuesForBlock(block.id, 'trait');
  const [weapon] = axisValuesForBlock(block.id, 'weapon');
  const visualEffect = block.effects.some((effect) => effect.kind === 'charge' || effect.kind === 'release-charge')
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
        <p>特性を選び、無特性でつなぎ、武器で届ける。すべての組み合わせと接続数を確認できます。</p>
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
          <p>技の出力と毒による継続ダメージを記録。</p>
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
                </div>
              </article>
            ))
          )}
        </section>
        <footer className="report-note">
          <b>POISON DMG</b> 毒ダメージは付与後に実際に発生した継続ダメージです。
        </footer>
      </section>
    </div>
  );
};

const BattleCircuitSummary = ({
  team,
  label,
  board,
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
  const poweredCells = new Set(powered);
  const analysis = analyzeCircuit(board, GAME_DATA.blocks, GAME_DATA.rules.sourceRow);
  const chargeByCell = calculateChargeByCell(board, GAME_DATA.blocks, analysis, GAME_DATA.rules.skillFusion);
  const skillEvents = events.filter(
    (event): event is Extract<BattleTraceEvent, { blockId: string }> =>
      event.kind !== 'overload' && event.kind !== 'poison-tick' && event.team === team,
  );
  const conductingCells = new Set(pulseCells);
  const activatedCells = new Set(skillEvents.map((event) => `${event.row}:${event.column}`));
  const mergingCells = new Set([...analysis.mergeCells].filter((key) => activatedCells.has(key)));
  const portFlowsByCell = new Map<string, Partial<Record<Direction, PortFlow>>>();
  const setPortFlow = (key: string, direction: Direction, flow: PortFlow) => {
    const current = portFlowsByCell.get(key) ?? {};
    portFlowsByCell.set(key, { ...current, [direction]: flow });
  };
  for (const targetKey of conductingCells) {
    const [row, column] = targetKey.split(':').map(Number);
    const target = { row, column };
    if (row === GAME_DATA.rules.sourceRow && column === 0) setPortFlow(targetKey, 'west', 'in');
    for (const upstream of analysis.upstreamCells.get(targetKey) ?? []) {
      const upstreamKey = `${upstream.row}:${upstream.column}`;
      setPortFlow(targetKey, directionBetween(target, upstream), 'in');
      setPortFlow(upstreamKey, directionBetween(upstream, target), 'out');
    }
  }
  const firingLabels = skillEvents
    .map((event) => blockById.get(event.blockId)?.title)
    .filter((title): title is string => Boolean(title));

  return (
    <section className={`battle-circuit-summary team-${team}`} aria-label={`${label}の回路サマリー`}>
      <header>
        <span>
          <small>{team === 'player' ? 'YOUR CIRCUIT' : 'RIVAL CIRCUIT'}</small>
          <strong>{label}</strong>
        </span>
        <em>
          {mergingCells.size > 0
            ? `MERGE ×${GAME_DATA.rules.mergeEffectMultiplier}`
            : firingLabels.length > 0
              ? firingLabels.slice(0, 2).join('・')
              : pulseStep > 0
                ? `PULSE ${pulseStep}/${pulseStepCount}`
                : `通電 ${poweredCells.size}`}
        </em>
      </header>
      <div className="battle-circuit-map">
        <div
          className={`battle-circuit-source ${conductingCells.has(`${GAME_DATA.rules.sourceRow}:0`) ? 'is-conducting' : ''}`}
          style={{ '--source-row': GAME_DATA.rules.sourceRow + 1 } as CSSProperties}
          aria-hidden="true"
        >
          <i>∞</i>
        </div>
        <div className="battle-circuit-grid" key={`${team}-${tick}`}>
          {board.flatMap((row, rowIndex) =>
            row.map((placed, columnIndex) => {
              const key = `${rowIndex}:${columnIndex}`;
              const baseBlock = placed ? blockById.get(placed.blockId) : undefined;
              const block = baseBlock
                ? upgradeBlockDefinition(baseBlock, placed?.stars ?? 0, GAME_DATA.rules.skillFusion)
                : undefined;
              const stateLabel = mergingCells.has(key)
                ? `合流 効果${GAME_DATA.rules.mergeEffectMultiplier}倍`
                : activatedCells.has(key)
                  ? '発動'
                  : conductingCells.has(key)
                    ? '通電中・待機'
                    : poweredCells.has(key)
                      ? '接続済み'
                      : '未通電';
              if (block && placed) {
                const position = { row: rowIndex, column: columnIndex };
                const modifiers = incomingSkillModifiers(
                  board,
                  GAME_DATA.blocks,
                  analysis,
                  position,
                  GAME_DATA.rules.skillFusion,
                );
                const progress = summarizeSkillProgress(block, buffs[key], modifiers, {
                  enemyPoison,
                  pathLength: analysis.routeLength.get(key) ?? 0,
                  straightLineLength: analysis.straightLineLength.get(key) ?? 0,
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
                    className={`battle-circuit-cell battle-circuit-skill ${poweredCells.has(key) ? 'is-powered' : ''} ${portFlowsByCell.has(key) ? 'is-conducting' : ''} ${activatedCells.has(key) ? 'is-activated' : ''} ${mergingCells.has(key) ? 'is-merging' : ''}`}
                    key={key}
                    data-cell-key={key}
                    data-pulse-step={conductingCells.has(key) ? pulseStep : undefined}
                    data-conducting={portFlowsByCell.has(key) ? 'true' : undefined}
                    data-activated={activatedCells.has(key) ? 'true' : undefined}
                    data-merge={analysis.mergeCells.has(key) ? 'true' : undefined}
                    aria-label={`${label}の${block.title} ${stateLabel}${badgeLabels.length ? ` ${badgeLabels.join('、')}` : ''}`}
                    aria-haspopup="dialog"
                    onClick={() =>
                      onSelect({
                        blockId: block.id,
                        position: { row: rowIndex, column: columnIndex },
                        location: 'battle',
                        team,
                      })
                    }
                  >
                    <BlockVisual
                      block={block}
                      rotation={placed.rotation}
                      stars={placed.stars ?? 0}
                      powered={poweredCells.has(key)}
                      compact
                      portFlows={portFlowsByCell.get(key)}
                    />
                    {mergingCells.has(key) && (
                      <b className="block-merge-chip">×{GAME_DATA.rules.mergeEffectMultiplier}</b>
                    )}
                    {conductingCells.has(key) && (chargeByCell.get(key) ?? 0) > 0 && (
                      <b className="block-charge-chip">CHG {chargeByCell.get(key)}</b>
                    )}
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
                  className={`battle-circuit-cell ${poweredCells.has(key) ? 'is-powered' : ''}`}
                  key={key}
                  aria-label="空き"
                />
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
  const [run, setRun] = useState(1);
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
  const [board, setBoard] = useState<CircuitBoard>(() =>
    GAME_DATA.playerBoard.map((row) => row.map((cell) => (cell ? { ...cell } : null))),
  );
  const [shop, setShop] = useState(() =>
    createShop(
      shopBlocks,
      GAME_DATA.rules.rarityWeights,
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
  const holdTimer = useRef<number | null>(null);
  const pendingDrag = useRef<PendingDrag | null>(null);
  const suppressClick = useRef(false);
  const fusionTimer = useRef<number | null>(null);

  const ownedBlockIds = useMemo(() => ownedBlockIdsFor(board, rack), [board, rack]);
  const circuitAnalysis = useMemo(() => analyzeCircuit(board, GAME_DATA.blocks, GAME_DATA.rules.sourceRow), [board]);
  const powered = circuitAnalysis.poweredCells;
  const enemyBuild = useMemo(() => generateEnemyBuild(GAME_DATA, run, enemySeed), [run, enemySeed]);
  const enemyTrait = axisById.get('trait')?.values.find((value) => value.id === enemyBuild.traitId);
  const preview = useMemo(
    () => createBattle(GAME_DATA, board, enemyBuild.board, { enemyMaxHpBonus: enemyBuild.maxHpBonus }),
    [board, enemyBuild.board, enemyBuild.maxHpBonus],
  );
  const battle = playback[frame] ?? preview;
  const fighters = battle.fighters;
  const player = fighters.find((fighter) => fighter.team === 'player')!;
  const enemy = fighters.find((fighter) => fighter.team === 'enemy')!;
  const battleReport = useMemo(() => createBattleReport(GAME_DATA, battle.trace), [battle.trace]);
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
    blockId: string,
    rotation: Rotation,
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
    if (drag.origin.kind === 'rack') {
      const result = placeBlockFromRack(rack, board, drag.origin.block, position);
      if (result.board === board) {
        setMessage('そこには置けません');
        return;
      }
      setBoard(result.board);
      setRack(result.rack);
      setMessage(`${blockById.get(drag.blockId)?.title ?? '技'}を配置`);
      return;
    }
    const next = moveBlock(board, drag.origin.position, position);
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
    const reward = createShop([block], GAME_DATA.rules.rarityWeights, fusionReward.seed + choiceIndex * 17, 1)[0];
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
      rerollShop(shopBlocks, GAME_DATA.rules.rarityWeights, current, nextSeed, GAME_DATA.rules.shopSize, ownedBlockIds),
    );
    setMessage('ショップを更新');
  };

  const toggleLock = (id: string) =>
    setShop((current) => current.map((offer) => (offer.id === id ? { ...offer, locked: !offer.locked } : offer)));

  const startBattle = () => {
    const next = createPlayback(GAME_DATA, board, enemyBuild.board, { enemyMaxHpBonus: enemyBuild.maxHpBonus });
    setDetail(null);
    setReportOpen(false);
    setPlayback(next);
    setFrame(0);
    setPhase('battle');
    setMessage('');
  };

  const returnToWorkshop = () => {
    const reward = battleReward(GAME_DATA, battle.winner);
    const nextSeed = nextShopSeed(seed, 11);
    setCoins((current) => current + reward);
    setSeed(nextSeed);
    setShop(
      advanceShop(shopBlocks, GAME_DATA.rules.rarityWeights, shop, nextSeed, GAME_DATA.rules.shopSize, ownedBlockIds),
    );
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
  const detailAnalysis = analyzeCircuit(detailBoard, GAME_DATA.blocks, GAME_DATA.rules.sourceRow);
  const detailChargeByCell = calculateChargeByCell(
    detailBoard,
    GAME_DATA.blocks,
    detailAnalysis,
    GAME_DATA.rules.skillFusion,
  );
  const detailModifiers =
    detail?.position && detailCellKey && detailPoweredCells.has(detailCellKey)
      ? incomingSkillModifiers(
          detailBoard,
          GAME_DATA.blocks,
          detailAnalysis,
          detail.position,
          GAME_DATA.rules.skillFusion,
        )
      : { effectPower: 0, cooldownReduction: 0 };
  const detailBuffs =
    detailBattleTeam && detailCellKey ? (battle.skillBuffs[detailBattleTeam][detailCellKey] ?? {}) : {};
  const detailProgress = detailBlock
    ? summarizeSkillProgress(detailBlock, detailBuffs, detailModifiers, {
        enemyPoison: detailOpponent?.poison ?? 0,
        pathLength: detailCellKey ? (detailAnalysis.routeLength.get(detailCellKey) ?? 0) : 0,
        straightLineLength: detailCellKey ? (detailAnalysis.straightLineLength.get(detailCellKey) ?? 0) : 0,
      })
    : undefined;
  const detailVisibleBuffs =
    detailBlock && detailProgress ? visibleBuffs(detailBlock, detailProgress, detailModifiers) : undefined;
  const detailCooldown = detailBlock?.cooldown
    ? Math.max(1, detailBlock.cooldown - detailModifiers.cooldownReduction)
    : undefined;
  const detailMergeMultiplier =
    detailCellKey && detailAnalysis.mergeCells.has(detailCellKey) ? GAME_DATA.rules.mergeEffectMultiplier : 1;
  const detailTopology = detailCellKey
    ? [
        detailAnalysis.branchCells.has(detailCellKey) ? '自動分岐' : '',
        detailAnalysis.mergeCells.has(detailCellKey) ? '合流' : '',
        detailAnalysis.cyclicCells.has(detailCellKey) ? '循環' : '',
        detailAnalysis.fullyConnectedCells.has(detailCellKey) ? '全接続' : '',
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
                  </span>
                </header>

                <div className="circuit-workbench">
                  <div className="circuit-stage">
                    <div
                      className="source-column"
                      style={{ '--source-row': GAME_DATA.rules.sourceRow + 1 } as CSSProperties}
                    >
                      <div className="power-source" aria-label="電源コア">
                        <small>CORE</small>
                        <b>∞</b>
                      </div>
                    </div>
                    <div className="circuit-board" role="grid" aria-label="5×5 回路ボード">
                      {board.flatMap((row, rowIndex) =>
                        row.map((placed, columnIndex) => {
                          const block = placed ? blockById.get(placed.blockId) : undefined;
                          const key = `${rowIndex}:${columnIndex}`;
                          return (
                            <div
                              className={`circuit-cell ${powered.has(key) ? 'is-powered' : ''} ${circuitAnalysis.mergeCells.has(key) ? 'is-merge' : ''}`}
                              data-circuit-cell
                              data-row={rowIndex}
                              data-column={columnIndex}
                              role="gridcell"
                              key={key}
                            >
                              {block && placed ? (
                                <button
                                  className="block-button"
                                  aria-label={`${block.title}${powered.has(key) ? ' 通電中' : ' 未通電'}。クリックで詳細、長押しで移動`}
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
                                  />
                                  {circuitAnalysis.mergeCells.has(key) && (
                                    <b className="merge-preview">×{GAME_DATA.rules.mergeEffectMultiplier}</b>
                                  )}
                                </button>
                              ) : (
                                <span className="empty-cell" aria-label="空きマス" />
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
                      rackGroups.map(({ block, placed, count }) => (
                        <button
                          className="rack-block"
                          key={`${block.id}-${placed.rotation}-${placed.stars ?? 0}`}
                          aria-label={`${block.title}${(placed.stars ?? 0) > 0 ? ' 星1' : ''} ${count}個。クリックで詳細、長押しで配置`}
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
                          <BlockVisual block={block} rotation={placed.rotation} stars={placed.stars ?? 0} compact />
                          <span>
                            {block.title}
                            {(placed.stars ?? 0) > 0 ? ' ★' : ''}
                          </span>
                          <em>×{count}</em>
                        </button>
                      ))
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
                <small>RIVAL LV.{String(run).padStart(2, '0')}</small>
                <b>{enemyTrait?.title ?? enemyBuild.traitId}</b>
                <i>{enemyBuild.nodeCount} NODE</i>
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
                {blockById.get(fusionReward.fusedBlockId)?.title} <b>★</b>
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
              {detailStars > 0 && (
                <div className="dialog-star-rule">
                  <span>STAR UPGRADE</span>
                  全効果 ×{GAME_DATA.rules.skillFusion.effectMultiplier}・発動間隔 -
                  {GAME_DATA.rules.skillFusion.cooldownReduction}拍
                </div>
              )}
              {detailMergeMultiplier > 1 && (
                <div className="dialog-merge-rule">
                  <span>MERGE</span>
                  合流時、発動効果 ×{detailMergeMultiplier}
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
                              value.circuit > 0 ? `増幅 +${value.circuit}` : '',
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
                  <dt>特性軸</dt>
                  <dd>
                    {axisValuesForBlock(detailBlock.id, 'trait')
                      .map((value) => value.title)
                      .join('・')}
                  </dd>
                </div>
                <div>
                  <dt>武器軸</dt>
                  <dd>
                    {axisValuesForBlock(detailBlock.id, 'weapon')
                      .map((value) => value.title)
                      .join('・')}
                  </dd>
                </div>
                {detailCellKey && detailPoweredCells.has(detailCellKey) && (
                  <div>
                    <dt>チャージ</dt>
                    <dd>{detailChargeByCell.get(detailCellKey) ?? 0}</dd>
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
          <BlockVisual
            block={blockById.get(dragging.blockId)!}
            rotation={dragging.rotation}
            stars={dragging.stars}
            powered
          />
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
                相手 LV.{run} <b>{enemy.hp}</b>
              </span>
            </div>
            <p className="result-reward">報酬 COIN +{battleReward(GAME_DATA, battle.winner)}</p>
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
