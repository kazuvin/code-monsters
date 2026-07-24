import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { simulateBattle } from './core/battle';
import { breedMonsters, inheritanceSkillChoices, listBreedingCandidates } from './core/breeding';
import { createGhostTeam } from './core/ghost';
import {
  createMonster,
  definitionFor,
  effectiveStarsFor,
  permanentStatsFor,
  skillIdsFor,
  statBreakdownFor,
  targetRulesForSkill,
} from './core/monster';
import { deriveSeed } from './core/rng';
import {
  applyBattleResult,
  breedInRun,
  breedingCandidatesForRun,
  buyEquipment,
  buyMonster,
  chooseDraftMonster,
  chooseEvent,
  continueRun,
  createCasualRun,
  equipItem,
  moveMonsterToPartySlot,
  rerollShop,
  sellMonster,
  toggleActiveMonster,
  toggleShopFreeze,
  updateGambit,
} from './core/run';
import type {
  BattleResult,
  CasualRunState,
  ColorStars,
  CommandResult,
  FighterSnapshot,
  GameData,
  GambitCondition,
  GambitRule,
  MonsterDefinition,
  MonsterInstance,
  StatBlock,
  StatusId,
  TargetRule,
} from './core/types';
import { GAME_DATA } from './game/game-data';

type WorkshopTab = 'shop' | 'breed';
type InspectorTab = 'profile' | 'gambit';
type ReplaySpeed = 1 | 2 | 4;
type BattleFeedback = {
  label: string;
  tone: 'buff' | 'debuff' | 'shield';
};
type BattleViewState = {
  result: BattleResult;
  enemy: MonsterInstance[];
  beforeRoster: MonsterInstance[];
  frameIndex: number;
  playing: boolean;
  speed: ReplaySpeed;
};

const REPLAY_STEP_MS = 920;
const query = new URLSearchParams(window.location.search);
const requestedSeed = Number(query.get('seed'));
const INITIAL_SEED = Number.isInteger(requestedSeed) && requestedSeed > 0 ? requestedSeed : 7261;
const RECIPE_DISCOVERY_STORAGE_KEY = `code-monsters:recipe-discovery:v${GAME_DATA.schemaVersion}`;

const loadDiscoveredMonsterIds = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(RECIPE_DISCOVERY_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(saved)) return [];
    const monsterIds = new Set(GAME_DATA.monsters.map((monster) => monster.id));
    return saved.filter((id): id is string => typeof id === 'string' && monsterIds.has(id));
  } catch {
    return [];
  }
};

const saveDiscoveredMonsterIds = (ids: ReadonlySet<string>) => {
  try {
    window.localStorage.setItem(RECIPE_DISCOVERY_STORAGE_KEY, JSON.stringify([...ids].sort()));
  } catch {
    // Discovery still works for the current run when storage is unavailable.
  }
};

const STATUS_LABELS: Record<StatusId, string> = {
  'attack-up': '攻撃上昇',
  'attack-down': '攻撃低下',
  'defense-up': '防御上昇',
  'defense-down': '防御低下',
  'speed-up': '素早さ上昇',
  'speed-down': '素早さ低下',
  'wisdom-up': '知恵上昇',
  'wisdom-down': '知恵低下',
  'crit-up': '会心上昇',
  'crit-down': '会心低下',
  regeneration: '再生',
  'damage-over-time': '継続ダメージ',
  silence: '沈黙',
};

const TARGET_LABELS: Record<TargetRule, string> = {
  self: '自分',
  'lowest-hp-ally': 'HP割合が最も低い味方',
  'highest-hp-ally': 'HP割合が最も高い味方',
  'lowest-hp-enemy': 'HP割合が最も低い敵',
  'highest-hp-enemy': 'HP割合が最も高い敵',
  'highest-attack-enemy': '攻撃力が最も高い敵',
  'random-enemy': 'ランダムな敵',
};

const CONDITION_LABELS: Record<GambitCondition['kind'], string> = {
  always: '常に',
  'self-hp-below': '自分のHPが以下',
  'self-mp-above': '自分のMPが以上',
  'ally-hp-below': '味方のHPが以下',
  'enemy-hp-below': '敵のHPが以下',
  'ally-has-status': '味方に状態がある',
  'enemy-has-status': '敵に状態がある',
  'living-count-at-most': '生存数が以下',
};

const STAT_LABELS: Array<[keyof StatBlock, string]> = [
  ['maxHp', 'HP'],
  ['maxMp', 'MP'],
  ['attack', '攻'],
  ['defense', '守'],
  ['speed', '速'],
  ['wisdom', '賢'],
  ['crit', '会'],
];

const MONSTER_EMOJI: Record<string, string> = {
  'dragon-light': '🐲',
  'dragon-dark': '🐉',
  'dragon-fire': '🦎',
  'demon-light': '🧞',
  'demon-dark': '😈',
  'demon-fire': '👹',
  'spirit-light': '🧚',
  'spirit-dark': '👻',
  'spirit-fire': '🔥',
};

const emptyCondition = (kind: GambitCondition['kind']): GambitCondition => {
  if (kind === 'always') return { kind };
  if (kind === 'self-hp-below' || kind === 'ally-hp-below' || kind === 'enemy-hp-below') {
    return { kind, threshold: 50 };
  }
  if (kind === 'self-mp-above') return { kind, threshold: 25 };
  if (kind === 'ally-has-status' || kind === 'enemy-has-status') {
    return { kind, statusId: 'silence' };
  }
  return { kind, team: 'enemy', count: 1 };
};

const definitionById = (data: GameData, id: string) => {
  const definition = data.monsters.find((monster) => monster.id === id);
  if (!definition) throw new Error(`Unknown monster definition: ${id}`);
  return definition;
};

const starText = (whiteStars: number, colorStars: ColorStars = 0) => (
  <span className="stars" aria-label={`白星${whiteStars}${colorStars > 0 ? `、色星${colorStars}` : ''}`}>
    <span className="white-stars" aria-hidden="true">
      {'★'.repeat(whiteStars)}
    </span>
    {colorStars > 0 && (
      <span className="color-stars" aria-hidden="true">
        {'★'.repeat(colorStars)}
      </span>
    )}
  </span>
);

const monsterStyle = (data: GameData, definition: MonsterDefinition) => {
  const attribute = data.attributes.find((entry) => entry.id === definition.attributeId);
  return {
    '--monster-color': attribute?.color ?? '#f2d98b',
    '--monster-accent': attribute?.accent ?? '#fff1ba',
  } as CSSProperties;
};

const lineageName = (data: GameData, definition: MonsterDefinition) =>
  data.lineages.find((lineage) => lineage.id === definition.lineageId)?.name ?? definition.lineageId;

const attributeName = (data: GameData, definition: MonsterDefinition) =>
  data.attributes.find((attribute) => attribute.id === definition.attributeId)?.name ?? definition.attributeId;

const xpProgressFor = (monster: MonsterInstance) => {
  const currentThreshold = GAME_DATA.rules.levelThresholds[monster.level - 1] ?? 0;
  const nextThreshold = GAME_DATA.rules.levelThresholds[monster.level];
  if (nextThreshold === undefined) {
    return {
      currentThreshold,
      nextThreshold: currentThreshold,
      remaining: 0,
      percent: 100,
      maximum: true,
    };
  }
  const earnedInLevel = monster.xp - currentThreshold;
  const levelSpan = Math.max(1, nextThreshold - currentThreshold);
  return {
    currentThreshold,
    nextThreshold,
    remaining: Math.max(0, nextThreshold - monster.xp),
    percent: Math.max(0, Math.min(100, (earnedInLevel / levelSpan) * 100)),
    maximum: false,
  };
};

function MonsterSigil({
  data,
  definition,
  colorStars = 0,
  size = 'regular',
}: {
  data: GameData;
  definition: MonsterDefinition;
  colorStars?: ColorStars;
  size?: 'small' | 'regular' | 'large';
}) {
  const emoji = MONSTER_EMOJI[`${definition.lineageId}-${definition.attributeId}`] ?? '👾';
  return (
    <div className={`monster-sigil is-${size}`} style={monsterStyle(data, definition)} aria-hidden="true">
      <span>{emoji}</span>
      <b>{data.lineages.find((lineage) => lineage.id === definition.lineageId)?.mark}</b>
      {colorStars > 0 && <i>{colorStars}</i>}
    </div>
  );
}

function DefinitionCard({
  data,
  definition,
  colorStars = 0,
  eyebrow,
  footer,
  onClick,
  selected = false,
}: {
  data: GameData;
  definition: MonsterDefinition;
  colorStars?: ColorStars;
  eyebrow?: string;
  footer?: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
}) {
  const content = (
    <>
      <MonsterSigil data={data} definition={definition} colorStars={colorStars} />
      <div className="monster-card-copy">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <strong>{definition.name}</strong>
        <span className="star-row">{starText(definition.whiteStars, colorStars)}</span>
        <small>
          {lineageName(data, definition)} × {attributeName(data, definition)}
        </small>
      </div>
    </>
  );
  return (
    <article
      className={`definition-card${selected ? ' is-selected' : ''}${onClick ? ' is-interactive' : ''}`}
      style={monsterStyle(data, definition)}
    >
      {onClick ? (
        <button className="definition-card-main" type="button" onClick={onClick}>
          {content}
        </button>
      ) : (
        <div className="definition-card-main">{content}</div>
      )}
      {footer && <div className="monster-card-footer">{footer}</div>}
    </article>
  );
}

function MonsterDetailCard({
  monster,
  showExperience = false,
}: {
  monster: MonsterInstance;
  showExperience?: boolean;
}) {
  const definition = definitionFor(GAME_DATA, monster);
  const trait = GAME_DATA.traits.find((entry) => entry.id === definition.traitId);
  const progress = xpProgressFor(monster);
  return (
    <div className="monster-detail-card">
      {showExperience && (
        <>
          <div className="xp-track">
            <span style={{ width: `${progress.percent}%` }} />
          </div>
          <small className="xp-label">
            EXP {monster.xp}
            {progress.maximum ? ' · MAX LEVEL' : ` · 次のLvまで ${progress.remaining}`}
          </small>
        </>
      )}
      <div className="stat-grid-heading">
        <span>STATUS TOTAL</span>
        <small>最終値 / 成長・個体値・装備</small>
      </div>
      <StatBreakdownGrid monster={monster} />
      <section className="trait-block detail-card">
        <span>TRAIT / COLOR STAGE {monster.colorStars}</span>
        <h3>{trait?.name}</h3>
        <p>{trait?.stages[monster.colorStars].description}</p>
      </section>
      <section className="skill-list">
        <span>SKILL CARDS</span>
        <div className="skill-card-grid">
          {skillIdsFor(GAME_DATA, monster).map((skillId, index) => {
            const skill = GAME_DATA.skills.find((entry) => entry.id === skillId);
            return (
              <article className="skill-card" key={`${skillId}-${index}`}>
                <b>{index === 2 && monster.inheritedSkillId ? '継' : index + 1}</b>
                <span>
                  <strong>{skill?.name}</strong>
                  <small>MP {skill?.mpCost}</small>
                </span>
                <p>{skill?.description}</p>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatBreakdownGrid({ monster, compact = false }: { monster: MonsterInstance; compact?: boolean }) {
  const breakdown = statBreakdownFor(GAME_DATA, monster);
  return (
    <div
      className={compact ? 'breeding-preview-stats is-breakdown' : 'stat-grid is-breakdown'}
      aria-label={compact ? '配合後の能力と個体値' : '能力の最終値と上昇内訳'}
    >
      {STAT_LABELS.map(([id, label]) => {
        const stat = breakdown[id];
        const bonuses = [
          ['growth', compact ? '成' : '成長', stat.growth],
          ['individual', compact ? '個' : '個体値', stat.individual],
          ['equipment', compact ? '装' : '装備', stat.equipment],
        ] as const;
        const visibleBonuses = bonuses.filter(([, , value]) => value > 0);
        return (
          <span className={compact ? 'preview-stat' : 'stat-cell'} data-stat-id={id} key={id}>
            <small className="stat-label">{label}</small>
            <b data-stat-total={stat.total}>
              {stat.total}
              {id === 'crit' ? '%' : ''}
            </b>
            <div className="stat-bonus-list">
              {visibleBonuses.length === 0 && <i className="stat-bonus is-base">基礎値</i>}
              {visibleBonuses.map(([source, sourceLabel, value]) => (
                <i className={`stat-bonus is-${source}`} data-bonus-source={source} key={source}>
                  <em>{sourceLabel}</em> +{value}
                </i>
              ))}
              {stat.capped && <i className="stat-bonus is-cap">上限 {GAME_DATA.rules.battle.criticalCap}%</i>}
            </div>
          </span>
        );
      })}
    </div>
  );
}

function MonsterProspectDialog({
  monster,
  eyebrow,
  summary,
  onClose,
}: {
  monster?: MonsterInstance;
  eyebrow: string;
  summary: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const monsterId = monster?.id;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !monster) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [monsterId]);
  if (!monster) return null;
  const definition = definitionFor(GAME_DATA, monster);
  return (
    <dialog
      ref={dialogRef}
      className="prospect-dialog"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      aria-label={`${definition.name}の能力詳細`}
    >
      <section className="prospect-panel panel" style={monsterStyle(GAME_DATA, definition)}>
        <button type="button" className="dialog-close" onClick={() => dialogRef.current?.close()} aria-label="閉じる">
          ×
        </button>
        <header className="prospect-identity">
          <MonsterSigil data={GAME_DATA} definition={definition} colorStars={monster.colorStars} size="large" />
          <div>
            <span>{eyebrow}</span>
            <h2>{definition.name}</h2>
            <p>
              {starText(definition.whiteStars, monster.colorStars)} · Lv.{monster.level}
            </p>
          </div>
        </header>
        <p className="prospect-summary">{summary}</p>
        <MonsterDetailCard monster={monster} />
      </section>
    </dialog>
  );
}

function RunHeader({ run }: { run: CasualRunState }) {
  return (
    <>
      <header className="run-header">
        <div className="brand-lockup">
          <span>CODE MONSTERS // FIELD LAB</span>
          <h1>血統航路</h1>
        </div>
        <div className="run-metrics" aria-label="ラン状況">
          <span>
            CYCLE <b>{String(run.cycle).padStart(2, '0')}</b>
          </span>
          <span>
            WIN <b>{run.wins}</b>
          </span>
          <span>
            LOSS <b>{run.losses}/5</b>
          </span>
          <span className="coin-metric">
            COIN <b>{run.coins}</b>
          </span>
        </div>
      </header>
      <div className="cycle-rail" aria-label={`全12サイクル中${run.cycle}サイクル`}>
        {Array.from({ length: GAME_DATA.rules.maxCycles }, (_, index) => {
          const cycle = index + 1;
          const complete = cycle <= run.completedCycles;
          const current = cycle === run.cycle && run.phase !== 'finished';
          return (
            <span
              key={cycle}
              className={`${complete ? 'is-complete' : ''}${current ? ' is-current' : ''}`}
              title={`サイクル${cycle}`}
            >
              {String(cycle).padStart(2, '0')}
            </span>
          );
        })}
      </div>
    </>
  );
}

function DraftScreen({ run, onChoose }: { run: CasualRunState; onChoose: (definitionId: string) => void }) {
  const [previewDefinitionId, setPreviewDefinitionId] = useState<string>();
  const previewMonster = previewDefinitionId
    ? createMonster(GAME_DATA, previewDefinitionId, `draft-prospect-${run.draftRound}`)
    : undefined;
  return (
    <main className="draft-screen">
      <div className="draft-mast">
        <div className="brand-lockup">
          <span>CODE MONSTERS // CASUAL PROTOTYPE</span>
          <h1>血統航路</h1>
        </div>
        <div className="bloodline-weave" aria-hidden="true">
          <span>竜</span>
          <span>悪魔</span>
          <span>精霊</span>
        </div>
      </div>
      <section className="draft-copy">
        <span className="section-index">ENTRY {run.draftRound}/3</span>
        <h2>旅のはじまりを選ぶ</h2>
        <p>候補をタップして能力を確かめ、「迎える」で旅の仲間に。3回選ぶと最初のチームが完成します。</p>
        <div className="draft-party-rail" aria-label={`選択済み ${run.roster.length}/3体`}>
          {Array.from({ length: 3 }, (_, index) => {
            const monster = run.roster[index];
            return monster ? (
              <span key={monster.id} style={monsterStyle(GAME_DATA, definitionFor(GAME_DATA, monster))}>
                <MonsterSigil
                  data={GAME_DATA}
                  definition={definitionFor(GAME_DATA, monster)}
                  colorStars={monster.colorStars}
                  size="small"
                />
                <b>{definitionFor(GAME_DATA, monster).name}</b>
              </span>
            ) : (
              <i key={`draft-slot-${index}`}>{index + 1}</i>
            );
          })}
        </div>
      </section>
      <div className="draft-grid" key={run.draftRound}>
        {run.draftChoices.map((definitionId, index) => {
          const definition = definitionById(GAME_DATA, definitionId);
          const trait = GAME_DATA.traits.find((entry) => entry.id === definition.traitId);
          return (
            <div className="draft-choice" key={definitionId} style={{ '--draft-index': index } as CSSProperties}>
              <DefinitionCard
                data={GAME_DATA}
                definition={definition}
                eyebrow={`${lineageName(GAME_DATA, definition)} / ${attributeName(GAME_DATA, definition)}`}
                onClick={() => setPreviewDefinitionId(definitionId)}
                footer={
                  <>
                    <span>{trait?.name} · タップで詳細</span>
                    <button type="button" onClick={() => onChoose(definitionId)}>
                      この仲間を迎える →
                    </button>
                  </>
                }
              />
            </div>
          );
        })}
      </div>
      <p className="prototype-note">PROTOTYPE RULESET · 12 CYCLES · ASYNC GHOST</p>
      <MonsterProspectDialog
        monster={previewMonster}
        eyebrow={`ENTRY ${run.draftRound} / LEVEL 1`}
        summary="旅立ち時の能力です。属性は血統の分類で、戦闘上の有利不利はありません。"
        onClose={() => setPreviewDefinitionId(undefined)}
      />
    </main>
  );
}

function RosterCard({
  monster,
  active,
  selected,
  zone,
  slotIndex,
  dropTarget,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  monster: MonsterInstance;
  active: boolean;
  selected: boolean;
  zone: 'active' | 'bench';
  slotIndex: number;
  dropTarget: boolean;
  onSelect: () => void;
  onDragStart: (monster: MonsterInstance, x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
}) {
  const definition = definitionFor(GAME_DATA, monster);
  const holdTimer = useRef<number | undefined>(undefined);
  const dragging = useRef(false);
  const pointerIsDown = useRef(false);
  const suppressClick = useRef(false);
  const origin = useRef({ x: 0, y: 0 });

  const clearHold = () => {
    if (holdTimer.current !== undefined) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = undefined;
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerIsDown.current = true;
    origin.current = { x: event.clientX, y: event.clientY };
    dragging.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    holdTimer.current = window.setTimeout(() => {
      dragging.current = true;
      suppressClick.current = true;
      onDragStart(monster, event.clientX, event.clientY);
      if ('vibrate' in navigator) navigator.vibrate(20);
    }, 420);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pointerIsDown.current) return;
    if (dragging.current) {
      onDragMove(event.clientX, event.clientY);
      return;
    }
    const distance = Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y);
    if (event.pointerType === 'mouse' && distance > 5) {
      clearHold();
      dragging.current = true;
      suppressClick.current = true;
      onDragStart(monster, event.clientX, event.clientY);
      return;
    }
    if (distance > 10) clearHold();
  };

  const finishPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    pointerIsDown.current = false;
    clearHold();
    if (dragging.current) {
      dragging.current = false;
      onDragEnd(event.clientX, event.clientY);
    }
  };

  return (
    <button
      type="button"
      className={`roster-card${selected ? ' is-selected' : ''}${active ? ' is-active' : ''}${dropTarget ? ' is-drop-target' : ''}`}
      style={monsterStyle(GAME_DATA, definition)}
      data-party-slot
      data-team-zone={zone}
      data-slot-index={slotIndex}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onSelect();
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      aria-pressed={selected}
      aria-label={`${definition.name}、${active ? '主力' : '控え'}。タップで詳細、長押しで移動`}
    >
      <MonsterSigil data={GAME_DATA} definition={definition} colorStars={monster.colorStars} size="small" />
      <span>
        <small>{active ? 'ACTIVE' : 'BENCH'}</small>
        <strong>{definition.name}</strong>
        <i>
          Lv.{monster.level} · {starText(definition.whiteStars, monster.colorStars)}
        </i>
      </span>
    </button>
  );
}

function TeamPanel({
  run,
  selectedId,
  onSelect,
  onMove,
}: {
  run: CasualRunState;
  selectedId?: string;
  onSelect: (id: string) => void;
  onMove: (monster: MonsterInstance, zone: 'active' | 'bench', index: number) => void;
}) {
  const [dragState, setDragState] = useState<{ monster: MonsterInstance; x: number; y: number }>();
  const [dropSlot, setDropSlot] = useState<{ zone: 'active' | 'bench'; index: number }>();
  const active = run.activeIds
    .map((id) => run.roster.find((monster) => monster.id === id))
    .filter((monster): monster is MonsterInstance => Boolean(monster));
  const bench = run.roster.filter((monster) => !run.activeIds.includes(monster.id));
  const dropSlotAt = (
    x: number,
    y: number,
  ):
    | {
        zone: 'active' | 'bench';
        index: number;
      }
    | undefined => {
    const target = document.elementFromPoint(x, y);
    const slot = target?.closest<HTMLElement>('[data-party-slot]');
    const zoneElement = slot ?? target?.closest<HTMLElement>('[data-team-zone]');
    const zone = zoneElement?.dataset.teamZone;
    if (zone !== 'active' && zone !== 'bench') return undefined;
    const fallbackIndex = zone === 'active' ? active.length : bench.length;
    const parsedIndex = Number(slot?.dataset.slotIndex);
    return { zone, index: Number.isInteger(parsedIndex) ? parsedIndex : fallbackIndex };
  };
  const updateDropSlot = (x: number, y: number) => {
    setDropSlot(dropSlotAt(x, y));
  };
  const cardProps = (monster: MonsterInstance, isActive: boolean, index: number) => ({
    monster,
    active: isActive,
    selected: selectedId === monster.id,
    zone: isActive ? ('active' as const) : ('bench' as const),
    slotIndex: index,
    dropTarget: dropSlot?.zone === (isActive ? 'active' : 'bench') && dropSlot.index === index,
    onSelect: () => onSelect(monster.id),
    onDragStart: (dragged: MonsterInstance, x: number, y: number) => {
      setDragState({ monster: dragged, x, y });
      updateDropSlot(x, y);
    },
    onDragMove: (x: number, y: number) => {
      setDragState((current) => (current ? { ...current, x, y } : current));
      updateDropSlot(x, y);
    },
    onDragEnd: (x: number, y: number) => {
      const target = dropSlotAt(x, y);
      if (target) onMove(monster, target.zone, target.index);
      setDragState(undefined);
      setDropSlot(undefined);
    },
  });
  return (
    <aside className="team-panel panel">
      <div className="panel-heading">
        <span>PARTY DECK</span>
        <strong>長押しで編成</strong>
      </div>
      <section
        className={`team-zone is-active${dropSlot?.zone === 'active' ? ' is-drop-target' : ''}`}
        data-team-zone="active"
        aria-label="主力"
      >
        <div className="team-zone-label">
          <h2>主力</h2>
          <span>{run.activeIds.length}/3</span>
        </div>
        <div className="roster-list">
          {active.map((monster, index) => (
            <RosterCard key={monster.id} {...cardProps(monster, true, index)} />
          ))}
          {Array.from({ length: Math.max(0, 3 - active.length) }, (_, index) => (
            <div
              className={`empty-roster-slot${dropSlot?.zone === 'active' && dropSlot.index === active.length + index ? ' is-drop-target' : ''}`}
              key={`active-empty-${index}`}
              data-party-slot
              data-team-zone="active"
              data-slot-index={active.length + index}
            >
              ＋
            </div>
          ))}
        </div>
      </section>
      <section
        className={`team-zone is-bench${dropSlot?.zone === 'bench' ? ' is-drop-target' : ''}`}
        data-team-zone="bench"
        aria-label="控え"
      >
        <div className="team-zone-label">
          <h3>控え</h3>
          <span>{bench.length}/4</span>
        </div>
        <div className="roster-list is-bench">
          {bench.map((monster, index) => (
            <RosterCard key={monster.id} {...cardProps(monster, false, index)} />
          ))}
          {Array.from({ length: Math.max(0, 4 - bench.length) }, (_, index) => (
            <div
              className={`empty-roster-slot is-bench${dropSlot?.zone === 'bench' && dropSlot.index === bench.length + index ? ' is-drop-target' : ''}`}
              key={`bench-empty-${index}`}
              data-party-slot
              data-team-zone="bench"
              data-slot-index={bench.length + index}
            >
              ·
            </div>
          ))}
        </div>
      </section>
      {dragState && (
        <div
          className="drag-chip"
          style={{
            left: dragState.x,
            top: dragState.y,
            ...monsterStyle(GAME_DATA, definitionFor(GAME_DATA, dragState.monster)),
          }}
          aria-hidden="true"
        >
          <MonsterSigil
            data={GAME_DATA}
            definition={definitionFor(GAME_DATA, dragState.monster)}
            colorStars={dragState.monster.colorStars}
            size="small"
          />
        </div>
      )}
      <span className="drag-announcement" aria-live="polite">
        {dragState
          ? `${dropSlot?.zone === 'active' ? '主力' : dropSlot?.zone === 'bench' ? '控え' : '移動先'} ${dropSlot ? dropSlot.index + 1 : ''}へドロップ`
          : ''}
      </span>
    </aside>
  );
}

function ShopView({
  run,
  onCommand,
  onFreeze,
}: {
  run: CasualRunState;
  onCommand: (result: CommandResult<CasualRunState>, successMessage: string) => void;
  onFreeze: () => void;
}) {
  const [previewDefinitionId, setPreviewDefinitionId] = useState<string>();
  const previewMonster = previewDefinitionId
    ? createMonster(GAME_DATA, previewDefinitionId, 'shop-prospect')
    : undefined;
  if (!run.shop) return null;
  return (
    <section className="workshop-view shop-view" aria-label="ショップ">
      <div className="workshop-title">
        <div>
          <span className="section-index">MONSTER EXCHANGE</span>
          <h2>旅商人の棚</h2>
        </div>
        <div className="shop-actions">
          <button type="button" className="secondary-button" onClick={onFreeze}>
            {run.shop.frozen ? '◆ 固定中' : '◇ 棚を固定'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => onCommand(rerollShop(GAME_DATA, run), '棚を更新しました')}
          >
            ↻ 更新 1
          </button>
        </div>
      </div>
      <div className="shop-monsters">
        {run.shop.monsters.map((offer, index) => {
          if (!offer)
            return (
              <div className="sold-slot" key={`sold-monster-${index}`}>
                SOLD
              </div>
            );
          const definition = definitionById(GAME_DATA, offer.definitionId);
          const trait = GAME_DATA.traits.find((entry) => entry.id === definition.traitId);
          return (
            <DefinitionCard
              key={offer.id}
              data={GAME_DATA}
              definition={definition}
              eyebrow={offer.lucky ? 'LUCKY RANK UP' : `${attributeName(GAME_DATA, definition)}の気配`}
              onClick={() => setPreviewDefinitionId(definition.id)}
              footer={
                <div className="shop-card-footer">
                  <span>{trait?.name}</span>
                  <div className="shop-card-actions">
                    <button
                      type="button"
                      className="card-detail-button"
                      onClick={() => setPreviewDefinitionId(definition.id)}
                    >
                      能力を見る
                    </button>
                    <button
                      type="button"
                      className="buy-button"
                      onClick={() =>
                        onCommand(buyMonster(GAME_DATA, run, offer.id), `${definition.name}が仲間になりました`)
                      }
                    >
                      迎える <b>{definition.price}</b>
                    </button>
                  </div>
                </div>
              }
            />
          );
        })}
      </div>
      <div className="equipment-shelf">
        <div>
          <span className="section-index">EQUIPMENT</span>
          <h3>装備棚</h3>
        </div>
        <div className="equipment-offers">
          {run.shop.equipment.map((offer, index) => {
            if (!offer)
              return (
                <div className="sold-slot is-equipment" key={`sold-equipment-${index}`}>
                  SOLD
                </div>
              );
            const equipment = GAME_DATA.equipment.find((entry) => entry.id === offer.equipmentId);
            if (!equipment) return null;
            return (
              <article className="equipment-offer" key={offer.id}>
                <header>
                  <span className="equipment-glyph">{equipment.glyph}</span>
                  <small>EQUIPMENT</small>
                </header>
                <div className="equipment-copy">
                  <strong>{equipment.name}</strong>
                  <small>{equipment.description}</small>
                </div>
                <footer>
                  <span>COIN {equipment.price}</span>
                  <button
                    type="button"
                    onClick={() => onCommand(buyEquipment(GAME_DATA, run, offer.id), `${equipment.name}を購入しました`)}
                  >
                    購入
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      </div>
      <MonsterProspectDialog
        monster={previewMonster}
        eyebrow="SHOP PROSPECT / LEVEL 1"
        summary="購入時の初期能力です。属性は血統の分類で、戦闘上の有利不利はありません。"
        onClose={() => setPreviewDefinitionId(undefined)}
      />
    </section>
  );
}

function BreedingConfirmationDialog({
  child,
  parents,
  open,
  onConfirm,
  onClose,
}: {
  child?: MonsterInstance;
  parents: [MonsterInstance, MonsterInstance] | [];
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !child) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [child, open]);
  if (!child || parents.length !== 2) return null;
  const childDefinition = definitionFor(GAME_DATA, child);
  const parentNames = parents.map((parent) => definitionFor(GAME_DATA, parent).name);
  return (
    <dialog ref={dialogRef} className="breeding-confirm-dialog" onClose={onClose} aria-label="配合内容の最終確認">
      <section className="breeding-confirm-panel panel" style={monsterStyle(GAME_DATA, childDefinition)}>
        <button type="button" className="dialog-close" onClick={() => dialogRef.current?.close()} aria-label="閉じる">
          ×
        </button>
        <span className="section-index">FINAL CHECK / LINEAGE LOOM</span>
        <h2>この血統で誕生させますか？</h2>
        <div className="breeding-equation">
          <span>{parentNames[0]}</span>
          <b>×</b>
          <span>{parentNames[1]}</span>
          <b>→</b>
          <strong>{childDefinition.name}</strong>
        </div>
        <ul>
          <li>両親は配合後にいなくなります</li>
          <li>親の装備は保管枠へ戻ります</li>
          <li>子はLv.1で誕生し、ガンビットは初期設定になります</li>
          <li>配合ボーナスとして{GAME_DATA.rules.breedingCoinBonus}コイン獲得します</li>
        </ul>
        <div className="breeding-confirm-actions">
          <button type="button" className="secondary-button" onClick={() => dialogRef.current?.close()}>
            戻って調整
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              dialogRef.current?.close();
              onConfirm();
            }}
          >
            この内容で配合する
          </button>
        </div>
      </section>
    </dialog>
  );
}

function BreedingRevealDialog({ child, onComplete }: { child?: MonsterInstance; onComplete: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [stage, setStage] = useState(0);
  const childId = child?.id;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !child) return;
    setStage(0);
    dialog.showModal();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers = reducedMotion
      ? [window.setTimeout(() => setStage(2), 0)]
      : [window.setTimeout(() => setStage(1), 180), window.setTimeout(() => setStage(2), 980)];
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      if (dialog.open) dialog.close();
    };
  }, [childId]);
  if (!child) return null;
  const definition = definitionFor(GAME_DATA, child);
  return (
    <dialog
      ref={dialogRef}
      className={`breeding-reveal-dialog reveal-stage-${stage}`}
      onCancel={(event) => event.preventDefault()}
      onClose={onComplete}
      aria-label={`${definition.name}の誕生`}
    >
      <section className="breeding-reveal-stage" style={monsterStyle(GAME_DATA, definition)}>
        <div className="gene-orbit" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span className="section-index">LINEAGE REWRITTEN</span>
        <div className="newborn-sigil">
          <MonsterSigil data={GAME_DATA} definition={definition} colorStars={child.colorStars} size="large" />
        </div>
        <p>新しい血統が誕生しました</p>
        <h2>{definition.name}</h2>
        <strong>{starText(definition.whiteStars, child.colorStars)} · Lv.1</strong>
        <button
          type="button"
          className="primary-button"
          disabled={stage < 2}
          onClick={() => dialogRef.current?.close()}
        >
          この仲間を見る →
        </button>
      </section>
    </dialog>
  );
}

function BreedingView({
  run,
  discoveredMonsterIds,
  parentIds,
  setParentIds,
  onCommand,
  onInspect,
}: {
  run: CasualRunState;
  discoveredMonsterIds: ReadonlySet<string>;
  parentIds: string[];
  setParentIds: (ids: string[]) => void;
  onCommand: (result: CommandResult<CasualRunState>, successMessage: string) => void;
  onInspect: (monsterId: string) => void;
}) {
  const candidates = useMemo(
    () =>
      parentIds.length === 2
        ? breedingCandidatesForRun(GAME_DATA, run, parentIds[0] as string, parentIds[1] as string)
        : [],
    [parentIds, run],
  );
  const [candidateId, setCandidateId] = useState('');
  const [skillId, setSkillId] = useState('');
  const [recipeArchiveOpen, setRecipeArchiveOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [revealedChild, setRevealedChild] = useState<MonsterInstance>();
  useEffect(() => {
    setCandidateId(candidates[0]?.id ?? '');
    setSkillId('');
  }, [candidates]);
  const first = run.roster.find((monster) => monster.id === parentIds[0]);
  const second = run.roster.find((monster) => monster.id === parentIds[1]);
  const candidate = candidates.find((entry) => entry.id === candidateId);
  const skillChoices = first && second && candidate ? inheritanceSkillChoices(GAME_DATA, first, second, candidate) : [];
  const previewChild =
    first && second && candidate
      ? breedMonsters(GAME_DATA, first, second, candidate, skillId || undefined, 'breeding-prospect')
      : undefined;
  const previewDefinition = previewChild ? definitionFor(GAME_DATA, previewChild) : undefined;
  const parentWhiteStars =
    first && second
      ? Math.max(definitionFor(GAME_DATA, first).whiteStars, definitionFor(GAME_DATA, second).whiteStars)
      : 0;
  const rankUp = Boolean(previewDefinition && previewDefinition.whiteStars > parentWhiteStars);

  const toggleParent = (id: string) => {
    if (parentIds.includes(id)) {
      setParentIds(parentIds.filter((entry) => entry !== id));
      return;
    }
    setParentIds(parentIds.length >= 2 ? [parentIds[1] as string, id] : [...parentIds, id]);
  };

  return (
    <section className="workshop-view breeding-view" aria-label="配合">
      <div className="workshop-title">
        <div>
          <span className="section-index">LINEAGE LOOM</span>
          <h2>血統を編み直す</h2>
        </div>
        <button type="button" className="recipe-archive-button" onClick={() => setRecipeArchiveOpen(true)}>
          <span>SPECIAL</span>
          特殊配合図鑑 <b>{GAME_DATA.specialRecipes.length}</b>
        </button>
      </div>
      <div className="breeding-loom">
        <div className="parent-pool">
          <h3>親を2体選択</h3>
          {run.roster.map((monster) => {
            const definition = definitionFor(GAME_DATA, monster);
            const eligible = monster.level >= GAME_DATA.rules.breeding.minimumLevel;
            return (
              <button
                type="button"
                key={monster.id}
                className={`parent-choice${parentIds.includes(monster.id) ? ' is-selected' : ''}${
                  rankUp && parentIds.includes(monster.id) ? ' is-rank-catalyst' : ''
                }`}
                disabled={!eligible}
                onClick={() => toggleParent(monster.id)}
                style={monsterStyle(GAME_DATA, definition)}
              >
                <MonsterSigil data={GAME_DATA} definition={definition} colorStars={monster.colorStars} size="small" />
                <span>
                  <strong>{definition.name}</strong>
                  <small>
                    Lv.{monster.level} · 実効★{effectiveStarsFor(GAME_DATA, monster)}
                  </small>
                </span>
                <b>
                  {eligible
                    ? rankUp && parentIds.includes(monster.id)
                      ? '位階上昇の核'
                      : parentIds.includes(monster.id)
                        ? '選択中'
                        : '選ぶ'
                    : 'Lv.3必要'}
                </b>
              </button>
            );
          })}
        </div>
        <div className="gene-stitch" aria-hidden="true">
          <span>×</span>
          <i />
          <b>↓</b>
        </div>
        <div className="candidate-pool">
          <h3>配合先候補</h3>
          <div className="candidate-scroll">
            {candidates.length === 0 && (
              <div className="loom-placeholder">
                <span>?</span>
                <p>レベル3以上の親を2体選ぶと、系統×属性×実効星から候補を算出します。</p>
              </div>
            )}
            {candidates.map((entry) => {
              const definition = definitionById(GAME_DATA, entry.definitionId);
              return (
                <div className="breeding-candidate" key={entry.id}>
                  <DefinitionCard
                    data={GAME_DATA}
                    definition={definition}
                    colorStars={entry.colorStars}
                    eyebrow={
                      entry.kind === 'special'
                        ? 'SPECIAL RECIPE'
                        : entry.kind === 'same-name'
                          ? 'COLOR STAR'
                          : 'RANK BREED'
                    }
                    selected={candidateId === entry.id}
                    onClick={() => setCandidateId(entry.id)}
                    footer={<span>{entry.label}</span>}
                  />
                </div>
              );
            })}
          </div>
          {candidate && previewChild && previewDefinition && (
            <div className="inheritance-control">
              {rankUp && (
                <div className="rank-up-signal" aria-live="polite">
                  <span>RANK UP ROUTE</span>
                  <b>
                    ★{parentWhiteStars} → ★{previewDefinition.whiteStars}
                  </b>
                  <small>選んだ2体の実効星が、次の位階へ届いています</small>
                </div>
              )}
              <div className="breeding-preview" style={monsterStyle(GAME_DATA, previewDefinition)}>
                <header>
                  <span>配合プレビュー</span>
                  <strong>{previewDefinition.name}</strong>
                  <b>Lv.1</b>
                </header>
                <StatBreakdownGrid monster={previewChild} compact />
                <button type="button" className="card-detail-button" onClick={() => setPreviewOpen(true)}>
                  能力を詳しく見る
                </button>
              </div>
              <label htmlFor="inherit-skill">継承スキル（1つ）</label>
              <select id="inherit-skill" value={skillId} onChange={(event) => setSkillId(event.target.value)}>
                <option value="">継承しない</option>
                {skillChoices.map((id) => (
                  <option key={id} value={id}>
                    {GAME_DATA.skills.find((skill) => skill.id === id)?.name ?? id}
                  </option>
                ))}
              </select>
              <button type="button" className="primary-button" onClick={() => setConfirmationOpen(true)}>
                配合内容を確認 <span>両親を消費</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <RecipeArchiveDialog
        open={recipeArchiveOpen}
        discoveredMonsterIds={discoveredMonsterIds}
        onClose={() => setRecipeArchiveOpen(false)}
      />
      <MonsterProspectDialog
        monster={previewOpen ? previewChild : undefined}
        eyebrow="BREEDING RESULT / LEVEL 1"
        summary="現在選んでいる親・配合先・継承スキルを反映した、誕生直後の能力です。"
        onClose={() => setPreviewOpen(false)}
      />
      <BreedingConfirmationDialog
        child={previewChild}
        parents={first && second ? [first, second] : []}
        open={confirmationOpen}
        onClose={() => setConfirmationOpen(false)}
        onConfirm={() => {
          if (!first || !second || !candidate || !previewChild) return;
          const result = breedInRun(GAME_DATA, run, first.id, second.id, candidate.id, skillId || undefined);
          onCommand(
            result,
            `配合成功。${definitionFor(GAME_DATA, previewChild).name}が誕生し、${GAME_DATA.rules.breedingCoinBonus}コイン獲得しました`,
          );
          if (result.ok) {
            setParentIds([]);
            const child = result.state.roster.find(
              (monster) => !run.roster.some((current) => current.id === monster.id),
            );
            if (child) setRevealedChild(child);
          }
        }}
      />
      <BreedingRevealDialog
        child={revealedChild}
        onComplete={() => {
          const childId = revealedChild?.id;
          setRevealedChild(undefined);
          if (childId) window.setTimeout(() => onInspect(childId), 0);
        }}
      />
    </section>
  );
}

function ConditionEditor({
  condition,
  onChange,
}: {
  condition: GambitCondition;
  onChange: (condition: GambitCondition) => void;
}) {
  return (
    <div className="condition-editor">
      <select
        aria-label="条件"
        value={condition.kind}
        onChange={(event) => onChange(emptyCondition(event.target.value as GambitCondition['kind']))}
      >
        {Object.entries(CONDITION_LABELS).map(([kind, label]) => (
          <option key={kind} value={kind}>
            {label}
          </option>
        ))}
      </select>
      {'threshold' in condition && (
        <select
          aria-label="しきい値"
          value={condition.threshold}
          onChange={(event) => onChange({ ...condition, threshold: Number(event.target.value) as 25 | 50 | 75 })}
        >
          {[25, 50, 75].map((threshold) => (
            <option key={threshold} value={threshold}>
              {threshold}%
            </option>
          ))}
        </select>
      )}
      {'statusId' in condition && (
        <select
          aria-label="状態"
          value={condition.statusId}
          onChange={(event) => onChange({ ...condition, statusId: event.target.value as StatusId })}
        >
          {Object.entries(STATUS_LABELS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      )}
      {condition.kind === 'living-count-at-most' && (
        <>
          <select
            aria-label="生存チーム"
            value={condition.team}
            onChange={(event) => onChange({ ...condition, team: event.target.value as 'ally' | 'enemy' })}
          >
            <option value="ally">味方</option>
            <option value="enemy">敵</option>
          </select>
          <select
            aria-label="生存数"
            value={condition.count}
            onChange={(event) => onChange({ ...condition, count: Number(event.target.value) as 1 | 2 })}
          >
            <option value={1}>1体</option>
            <option value={2}>2体</option>
          </select>
        </>
      )}
    </div>
  );
}

function TacticsView({
  run,
  monster,
  onChange,
}: {
  run: CasualRunState;
  monster?: MonsterInstance;
  onChange: (run: CasualRunState) => void;
}) {
  if (!monster) {
    return (
      <section className="empty-view">
        <p>モンスターを選んでください。</p>
      </section>
    );
  }
  const definition = definitionFor(GAME_DATA, monster);
  const skills = ['normal-attack', ...skillIdsFor(GAME_DATA, monster)];
  const changeRule = (index: 0 | 1 | 2, rule: GambitRule) => onChange(updateGambit(run, monster.id, index, rule));
  return (
    <section className="tactics-view" aria-label={`${definition.name}のガンビット`}>
      <div className="gambit-guide">
        <span>GAMBIT ORDER</span>
        <p>上から判定し、最初に成立した行動を実行します。</p>
      </div>
      <div className="gambit-stack">
        {monster.gambits.map((rule, index) => {
          const targets = targetRulesForSkill(GAME_DATA, rule.action.skillId);
          const selectedSkill =
            rule.action.skillId === 'normal-attack'
              ? undefined
              : GAME_DATA.skills.find((skill) => skill.id === rule.action.skillId);
          return (
            <article className="gambit-row" key={`${monster.id}-gambit-${index}`}>
              <b className="priority-number">{String(index + 1).padStart(2, '0')}</b>
              <div>
                <label>条件</label>
                <ConditionEditor
                  condition={rule.condition}
                  onChange={(condition) => changeRule(index as 0 | 1 | 2, { ...rule, condition })}
                />
              </div>
              <span className="gambit-arrow" aria-hidden="true">
                →
              </span>
              <div>
                <label>行動</label>
                <div className="action-editor">
                  <select
                    aria-label="スキル"
                    value={rule.action.skillId}
                    onChange={(event) => {
                      const skillId = event.target.value;
                      const validTargets = targetRulesForSkill(GAME_DATA, skillId);
                      changeRule(index as 0 | 1 | 2, {
                        ...rule,
                        action: {
                          skillId,
                          target: validTargets[0] ?? 'random-enemy',
                        },
                      });
                    }}
                  >
                    {skills.map((skillId) => (
                      <option key={skillId} value={skillId}>
                        {skillId === 'normal-attack'
                          ? '通常攻撃'
                          : (GAME_DATA.skills.find((skill) => skill.id === skillId)?.name ?? skillId)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="対象"
                    value={targets.includes(rule.action.target) ? rule.action.target : (targets[0] ?? '')}
                    onChange={(event) =>
                      changeRule(index as 0 | 1 | 2, {
                        ...rule,
                        action: { ...rule.action, target: event.target.value as TargetRule },
                      })
                    }
                  >
                    {targets.map((target) => (
                      <option key={target} value={target}>
                        {TARGET_LABELS[target]}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="gambit-skill-note">
                  <b>{rule.action.skillId === 'normal-attack' ? 'MP 0' : `MP ${selectedSkill?.mpCost ?? 0}`}</b>
                  {selectedSkill?.description ?? '攻撃力を使って敵1体へ物理ダメージ。MPがなくても実行します。'}
                </p>
              </div>
            </article>
          );
        })}
      </div>
      <p className="gambit-fallback">すべて不成立なら「通常攻撃 → ランダムな敵」へフォールバック</p>
    </section>
  );
}

function RecipeToken({
  definition,
  colorStars = 0,
  label,
  locked = false,
  slot,
}: {
  definition: MonsterDefinition;
  colorStars?: ColorStars;
  label: string;
  locked?: boolean;
  slot: 'parent' | 'result';
}) {
  return (
    <div
      className={`recipe-token${locked ? ' is-locked' : ''}`}
      style={monsterStyle(GAME_DATA, definition)}
      data-recipe-slot={slot}
      aria-label={locked ? `${label}は未解放` : `${label}: ${definition.name}`}
    >
      <MonsterSigil data={GAME_DATA} definition={definition} colorStars={colorStars} size="small" />
      <span>
        <small>{label}</small>
        <strong>{locked ? '???' : definition.name}</strong>
        <i>{locked ? '未解放' : starText(definition.whiteStars, colorStars)}</i>
      </span>
    </div>
  );
}

function RecipeView({ discoveredMonsterIds }: { discoveredMonsterIds: ReadonlySet<string> }) {
  return (
    <section className="recipe-view" aria-label="特殊配合レシピ">
      <div className="recipe-guide">
        <span>SPECIAL BREEDING ARCHIVE</span>
        <p>
          特殊配合は全{GAME_DATA.specialRecipes.length}種。仲間にした種から輪郭が解け、結果種を仲間にすると完全解放。
        </p>
      </div>
      <div className="recipe-list">
        {GAME_DATA.specialRecipes.map((recipe, index) => {
          const parents = [
            definitionById(GAME_DATA, recipe.parentDefinitionIds[0]),
            definitionById(GAME_DATA, recipe.parentDefinitionIds[1]),
          ] as const;
          const result = definitionById(GAME_DATA, recipe.resultDefinitionId);
          const resultUnlocked = discoveredMonsterIds.has(result.id);
          return (
            <article className="recipe-card is-special" key={recipe.id} data-recipe-id={recipe.id}>
              <span className="recipe-kind is-special">SPECIAL #{String(index + 1).padStart(2, '0')}</span>
              <span className={`recipe-state${resultUnlocked ? ' is-unlocked' : ''}`}>
                {resultUnlocked ? '解放済み' : '未解放'}
              </span>
              <div className="recipe-equation">
                <RecipeToken
                  definition={parents[0]}
                  label="親 A"
                  locked={!resultUnlocked && !discoveredMonsterIds.has(parents[0].id)}
                  slot="parent"
                />
                <b>＋</b>
                <RecipeToken
                  definition={parents[1]}
                  label="親 B"
                  locked={!resultUnlocked && !discoveredMonsterIds.has(parents[1].id)}
                  slot="parent"
                />
                <b>＝</b>
                <RecipeToken definition={result} label="特殊種" locked={!resultUnlocked} slot="result" />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RecipeArchiveDialog({
  open,
  discoveredMonsterIds,
  onClose,
}: {
  open: boolean;
  discoveredMonsterIds: ReadonlySet<string>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="recipe-dialog"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      aria-label="特殊配合図鑑"
    >
      <section className="recipe-archive panel">
        <button type="button" className="dialog-close" onClick={() => dialogRef.current?.close()} aria-label="閉じる">
          ×
        </button>
        <header className="recipe-archive-heading">
          <span>LINEAGE ARCHIVE</span>
          <h2>特殊配合図鑑</h2>
          <p>発見したモンスターに応じて、親と結果の輪郭が解放されます。</p>
        </header>
        <RecipeView discoveredMonsterIds={discoveredMonsterIds} />
      </section>
    </dialog>
  );
}

function Inspector({
  run,
  monster,
  onCommand,
  onChange,
  onClose,
}: {
  run: CasualRunState;
  monster?: MonsterInstance;
  onCommand: (result: CommandResult<CasualRunState>, successMessage: string) => void;
  onChange: (run: CasualRunState) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<InspectorTab>('profile');
  const monsterId = monster?.id;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !monster) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [monsterId]);
  useEffect(() => setTab('profile'), [monster?.id]);
  if (!monster) return null;
  const definition = definitionFor(GAME_DATA, monster);
  const equipped = GAME_DATA.equipment.find((entry) => entry.id === monster.equipmentId);
  const active = run.activeIds.includes(monster.id);
  return (
    <dialog
      ref={dialogRef}
      className="monster-dialog"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      aria-label={`${definition.name}の詳細`}
    >
      <aside className="inspector panel" style={monsterStyle(GAME_DATA, definition)}>
        <button type="button" className="dialog-close" onClick={() => dialogRef.current?.close()} aria-label="閉じる">
          ×
        </button>
        <div className="inspector-identity">
          <MonsterSigil data={GAME_DATA} definition={definition} colorStars={monster.colorStars} size="large" />
          <div>
            <span>
              {lineageName(GAME_DATA, definition)} × {attributeName(GAME_DATA, definition)}
            </span>
            <h2>{definition.name}</h2>
            <p>
              {starText(definition.whiteStars, monster.colorStars)} · Lv.{monster.level}
            </p>
          </div>
        </div>
        <nav className="inspector-tabs" aria-label="モンスター詳細メニュー">
          <button type="button" className={tab === 'profile' ? 'is-active' : ''} onClick={() => setTab('profile')}>
            個体情報
          </button>
          <button type="button" className={tab === 'gambit' ? 'is-active' : ''} onClick={() => setTab('gambit')}>
            ガンビット
          </button>
        </nav>
        <div className="inspector-tab-panel">
          {tab === 'profile' && (
            <div className="profile-panel">
              <MonsterDetailCard monster={monster} showExperience />
              <section className="equipment-block">
                <span>EQUIPMENT CARDS</span>
                <article className={`equipped-row equipment-card${equipped ? '' : ' is-empty'}`}>
                  <b>{equipped?.glyph ?? '—'}</b>
                  <span>
                    <strong>{equipped?.name ?? '装備なし'}</strong>
                    <small>{equipped?.description ?? '装備カードを選ぶと能力を追加できます。'}</small>
                  </span>
                  {equipped && (
                    <button
                      type="button"
                      onClick={() => onCommand(equipItem(GAME_DATA, run, monster.id), '装備を外しました')}
                    >
                      外す
                    </button>
                  )}
                </article>
                {run.equipmentInventory.length > 0 && (
                  <div className="inventory-list">
                    {run.equipmentInventory.map((equipmentId, index) => {
                      const equipment = GAME_DATA.equipment.find((entry) => entry.id === equipmentId);
                      if (!equipment) return null;
                      return (
                        <button
                          type="button"
                          className="equipment-card"
                          key={`${equipmentId}-${index}`}
                          onClick={() =>
                            onCommand(
                              equipItem(GAME_DATA, run, monster.id, equipmentId),
                              `${equipment.name}を装備しました`,
                            )
                          }
                        >
                          <b>{equipment.glyph}</b>
                          <span>
                            <strong>{equipment.name}</strong>
                            <small>{equipment.description}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
              <div className="inspector-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    onCommand(
                      toggleActiveMonster(GAME_DATA, run, monster.id),
                      active ? '控えへ移しました' : '主力へ移しました',
                    )
                  }
                >
                  {active ? '控えへ移す' : '主力へ出す'}
                </button>
                <button
                  type="button"
                  className="text-button is-danger"
                  onClick={() => onCommand(sellMonster(GAME_DATA, run, monster.id), `${definition.name}と別れました`)}
                >
                  別れる
                </button>
              </div>
            </div>
          )}
          {tab === 'gambit' && <TacticsView run={run} monster={monster} onChange={onChange} />}
        </div>
      </aside>
    </dialog>
  );
}

function WorkshopScreen({
  run,
  discoveredMonsterIds,
  setRun,
  onStartBattle,
}: {
  run: CasualRunState;
  discoveredMonsterIds: ReadonlySet<string>;
  setRun: (run: CasualRunState) => void;
  onStartBattle: () => void;
}) {
  const [tab, setTab] = useState<WorkshopTab>('shop');
  const [selectedId, setSelectedId] = useState(run.activeIds[0]);
  const [inspectedId, setInspectedId] = useState<string>();
  const [parentIds, setParentIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const selected = run.roster.find((monster) => monster.id === selectedId);
  const inspected = run.roster.find((monster) => monster.id === inspectedId);

  useEffect(() => {
    if (!selected && run.roster[0]) setSelectedId(run.roster[0].id);
  }, [run.roster, selected]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const onCommand = (result: CommandResult<CasualRunState>, successMessage: string) => {
    setRun(result.state);
    setNotice(result.ok ? successMessage : result.error);
  };

  return (
    <main className="run-screen">
      <RunHeader run={run} />
      {notice && (
        <button type="button" className="notice-strip" onClick={() => setNotice('')}>
          {notice} <span>×</span>
        </button>
      )}
      <div className="workbench-layout">
        <TeamPanel
          run={run}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setInspectedId(id);
          }}
          onMove={(monster, zone, index) => {
            onCommand(
              moveMonsterToPartySlot(GAME_DATA, run, monster.id, zone, index),
              `${zone === 'active' ? '主力' : '控え'}の${index + 1}番へ編成しました`,
            );
          }}
        />
        <section className="workbench panel">
          <nav className="workshop-tabs" aria-label="育成メニュー">
            <button type="button" className={tab === 'shop' ? 'is-active' : ''} onClick={() => setTab('shop')}>
              <span>01</span> ショップ
            </button>
            <button type="button" className={tab === 'breed' ? 'is-active' : ''} onClick={() => setTab('breed')}>
              <span>02</span> 配合
            </button>
          </nav>
          {tab === 'shop' && (
            <ShopView run={run} onCommand={onCommand} onFreeze={() => setRun(toggleShopFreeze(run))} />
          )}
          {tab === 'breed' && (
            <BreedingView
              run={run}
              discoveredMonsterIds={discoveredMonsterIds}
              parentIds={parentIds}
              setParentIds={setParentIds}
              onCommand={onCommand}
              onInspect={setInspectedId}
            />
          )}
        </section>
      </div>
      <Inspector
        run={run}
        monster={inspected}
        onCommand={onCommand}
        onChange={setRun}
        onClose={() => setInspectedId(undefined)}
      />
      <footer className="battle-launcher">
        <div>
          <span>NEXT / ASYNC GHOST #{run.cycle.toString().padStart(2, '0')}</span>
          <strong>{run.activeIds.length === 3 ? '編成準備完了' : `主力をあと${3 - run.activeIds.length}体選択`}</strong>
        </div>
        <button type="button" className="launch-button" disabled={run.activeIds.length !== 3} onClick={onStartBattle}>
          <span>ATB 3 × 3</span>
          戦闘を開始する
        </button>
      </footer>
    </main>
  );
}

function EventScreen({ run, onChoose }: { run: CasualRunState; onChoose: (eventId: string) => void }) {
  return (
    <main className="event-screen">
      <RunHeader run={run} />
      <section className="event-stage">
        <span className="section-index">ROUTE EVENT / CYCLE {run.cycle}</span>
        <h2>旅路が枝分かれした</h2>
        <p>このサイクルで受ける支援をひとつ選びます。</p>
        <div className="event-grid">
          {run.eventChoices.map((eventId) => {
            const event = GAME_DATA.events.find((entry) => entry.id === eventId);
            if (!event) return null;
            return (
              <button type="button" key={event.id} onClick={() => onChoose(event.id)}>
                <span>{event.glyph}</span>
                <small>ROUTE {event.id.toUpperCase()}</small>
                <strong>{event.name}</strong>
                <p>{event.description}</p>
                <b>この道を選ぶ →</b>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function BattleMonster({
  fighter,
  side,
  acting,
  targeted,
  hpDelta,
  actionLabel,
  feedback,
  skillFx,
  pulseKey,
}: {
  fighter: FighterSnapshot;
  side: 'player' | 'enemy';
  acting: boolean;
  targeted: boolean;
  hpDelta: number;
  actionLabel?: string;
  feedback: BattleFeedback[];
  skillFx: string;
  pulseKey: number;
}) {
  const definition = definitionById(GAME_DATA, fighter.definitionId);
  const hpPercent = Math.max(0, (fighter.hp / fighter.maxHp) * 100);
  const mpPercent = Math.max(0, (fighter.mp / fighter.maxMp) * 100);
  const hit =
    targeted &&
    !acting &&
    (hpDelta > 0 ||
      feedback.some((entry) => entry.tone === 'debuff' || (entry.tone === 'shield' && entry.label.includes('-'))));
  return (
    <article
      className={`battle-sprite is-${side}${fighter.alive ? '' : ' is-defeated'}${acting ? ' is-acting' : ''}${targeted ? ' is-targeted' : ''}${hit ? ' is-hit' : ''}${hpDelta < 0 ? ' is-healed' : ''}`}
      style={monsterStyle(GAME_DATA, definition)}
    >
      {(acting || hpDelta !== 0 || feedback.length > 0) && (
        <div className="battle-feedback" key={pulseKey}>
          {acting && actionLabel && (
            <span className="skill-callout">
              <small>{fighter.name}</small>
              <strong>{actionLabel}</strong>
            </span>
          )}
          {hpDelta !== 0 && (
            <b className={`battle-number${hpDelta < 0 ? ' is-heal' : ''}`}>
              {hpDelta < 0 ? `HP +${Math.abs(hpDelta)}` : `-${hpDelta}`}
            </b>
          )}
          {feedback.map((entry, index) => (
            <span
              className={`status-callout is-${entry.tone}`}
              data-feedback-tone={entry.tone}
              key={`${entry.label}-${index}`}
            >
              {entry.label}
            </span>
          ))}
        </div>
      )}
      {targeted && <span className={`battle-target-fx is-${skillFx}`} key={`target-${pulseKey}`} aria-hidden="true" />}
      <MonsterSigil data={GAME_DATA} definition={definition} colorStars={fighter.colorStars} size="large" />
      <div className="battle-monster-copy">
        <span>{side === 'player' ? 'YOUR LINE' : 'GHOST LINE'}</span>
        <strong>{fighter.name}</strong>
        <small>{starText(fighter.whiteStars, fighter.colorStars)}</small>
      </div>
      <div className="battle-bars">
        <div className="hp-bar">
          <span style={{ width: `${hpPercent}%` }} />
          <b>{fighter.hp}</b>
        </div>
        <div className="mp-bar">
          <span style={{ width: `${mpPercent}%` }} />
          <b>{fighter.mp} MP</b>
        </div>
        <div className="atb-bar">
          <span style={{ width: `${fighter.gauge}%` }} />
        </div>
      </div>
      {fighter.shield > 0 && <i className="shield-badge">盾 {fighter.shield}</i>}
    </article>
  );
}

function BattleScreen({
  battle,
  onChange,
  onFinish,
}: {
  battle: BattleViewState;
  onChange: (battle: BattleViewState) => void;
  onFinish: () => void;
}) {
  const frame = battle.result.frames[battle.frameIndex] ?? battle.result.frames[0];
  const lastIndex = battle.result.frames.length - 1;
  useEffect(() => {
    if (!battle.playing || battle.frameIndex >= lastIndex) return;
    const timer = window.setTimeout(
      () => onChange({ ...battle, frameIndex: Math.min(lastIndex, battle.frameIndex + 1) }),
      REPLAY_STEP_MS / battle.speed,
    );
    return () => window.clearTimeout(timer);
  }, [battle, lastIndex, onChange]);
  if (!frame) return null;
  const previousFrame = battle.result.frames[Math.max(0, battle.frameIndex - 1)] ?? frame;
  const previousFighters = new Map(previousFrame.fighters.map((fighter) => [fighter.id, fighter]));
  const hpDeltaFor = (fighter: FighterSnapshot) => (previousFighters.get(fighter.id)?.hp ?? fighter.hp) - fighter.hp;
  const feedbackFor = (fighter: FighterSnapshot): BattleFeedback[] => {
    const previous = previousFighters.get(fighter.id);
    if (!previous) return [];
    const statuses = fighter.statuses
      .filter((status) => !previous.statuses.includes(status))
      .map((status) => ({
        label: STATUS_LABELS[status],
        tone: (status.endsWith('-down') || status === 'damage-over-time' || status === 'silence'
          ? 'debuff'
          : 'buff') as BattleFeedback['tone'],
      }));
    const shieldDelta = fighter.shield - previous.shield;
    return shieldDelta === 0
      ? statuses
      : [
          ...statuses,
          {
            label: `盾 ${shieldDelta > 0 ? '+' : ''}${shieldDelta}`,
            tone: 'shield' as const,
          },
        ];
  };
  const players = frame.fighters.filter((fighter) => fighter.team === 'player');
  const enemies = frame.fighters.filter((fighter) => fighter.team === 'enemy');
  const complete = battle.frameIndex >= lastIndex;
  const activeSkill =
    frame.skillId && frame.skillId !== 'normal-attack'
      ? GAME_DATA.skills.find((skill) => skill.id === frame.skillId)
      : undefined;
  const actionLabel = frame.skillId === 'normal-attack' ? '通常攻撃' : activeSkill?.name;
  const skillFx = activeSkill?.effects.some((effect) => effect.kind === 'heal')
    ? 'heal'
    : activeSkill?.effects.some((effect) => effect.kind === 'status' || effect.kind === 'atb' || effect.kind === 'mp')
      ? 'status'
      : activeSkill?.effects.some((effect) => effect.kind === 'shield')
        ? 'shield'
        : activeSkill?.effects.some((effect) => effect.kind === 'damage' && effect.scaling === 'magic')
          ? 'magic'
          : frame.kind === 'action'
            ? 'physical'
            : 'none';
  const impact = frame.targetIds.some((id) => {
    const current = frame.fighters.find((fighter) => fighter.id === id);
    return current ? hpDeltaFor(current) > 0 : false;
  });
  const effectLabel =
    frame.kind === 'environment'
      ? 'COLLAPSE!'
      : frame.kind === 'finish'
        ? battle.result.winner === 'player'
          ? 'VICTORY!'
          : battle.result.winner === 'enemy'
            ? 'DEFEAT'
            : 'DRAW'
        : frame.kind === 'action'
          ? (actionLabel ?? 'SKILL!')
          : 'BATTLE START';
  return (
    <main
      className={`battle-screen${impact ? ' is-impact' : ''} is-frame-${frame.kind} is-skill-${skillFx}`}
      data-skill-id={frame.skillId}
      data-replay-delay-ms={Math.round(REPLAY_STEP_MS / battle.speed)}
      style={
        {
          '--battle-pulse-duration': `${Math.max(200, Math.round(760 / battle.speed))}ms`,
        } as CSSProperties
      }
    >
      <header className="battle-header">
        <div className="brand-lockup">
          <span>COMBAT REPLAY / SEED LOCKED</span>
          <h1>非同期ゴースト戦</h1>
        </div>
        <div className="battle-clock">
          <small>SIM TIME</small>
          <b>{frame.atSeconds.toFixed(1)}s</b>
        </div>
      </header>
      <div className="environment-warning">
        <span style={{ width: `${Math.min(100, (frame.atSeconds / 45) * 100)}%` }} />
        <b>{frame.atSeconds < 45 ? `環境崩壊まで ${(45 - frame.atSeconds).toFixed(1)}s` : '環境崩壊 発動中'}</b>
      </div>
      <section className="battlefield battle-arena">
        <div className="arena-scanlines" aria-hidden="true" />
        <div className="arena-core" aria-hidden="true">
          <span>ATB</span>
          <b>VS</b>
          <small>3 × 3</small>
        </div>
        <div className="battle-team is-player">
          <span className="team-label">YOUR PARTY</span>
          <div className="battle-formation">
            {players.map((fighter) => (
              <BattleMonster
                key={fighter.id}
                fighter={fighter}
                side="player"
                acting={frame.actorId === fighter.id}
                targeted={frame.targetIds.includes(fighter.id)}
                hpDelta={hpDeltaFor(fighter)}
                actionLabel={frame.actorId === fighter.id ? actionLabel : undefined}
                feedback={feedbackFor(fighter)}
                skillFx={skillFx}
                pulseKey={battle.frameIndex}
              />
            ))}
          </div>
        </div>
        <div className="arena-divider" aria-hidden="true">
          <i />
          <span>COMBAT ZONE</span>
          <i />
        </div>
        <div className="battle-team is-enemy">
          <span className="team-label">GHOST #{battle.enemy[0]?.id.split('-')[1] ?? '00'}</span>
          <div className="battle-formation">
            {enemies.map((fighter) => (
              <BattleMonster
                key={fighter.id}
                fighter={fighter}
                side="enemy"
                acting={frame.actorId === fighter.id}
                targeted={frame.targetIds.includes(fighter.id)}
                hpDelta={hpDeltaFor(fighter)}
                actionLabel={frame.actorId === fighter.id ? actionLabel : undefined}
                feedback={feedbackFor(fighter)}
                skillFx={skillFx}
                pulseKey={battle.frameIndex}
              />
            ))}
          </div>
        </div>
        <div
          className={`battle-fx is-${frame.kind}${impact ? ' is-impact' : ''}`}
          key={battle.frameIndex}
          aria-hidden="true"
        >
          {frame.kind !== 'action' && (
            <>
              <div className="fx-burst" />
              {Array.from({ length: 10 }, (_, index) => (
                <i key={index} style={{ '--particle-index': index } as CSSProperties} />
              ))}
              <strong>{effectLabel}</strong>
            </>
          )}
        </div>
      </section>
      <section className="battle-console">
        <div>
          <span>
            {frame.kind.toUpperCase()}
            {actionLabel ? ` / ${actionLabel}` : ''}
          </span>
          <strong>{frame.text}</strong>
        </div>
        <div className="replay-controls">
          {!complete && (
            <>
              <button type="button" onClick={() => onChange({ ...battle, playing: !battle.playing })}>
                {battle.playing ? 'Ⅱ 一時停止' : '▶ 再生'}
              </button>
              <div className="speed-controls" aria-label="再生速度">
                {([1, 2, 4] as ReplaySpeed[]).map((speed) => (
                  <button
                    type="button"
                    className={battle.speed === speed ? 'is-active' : ''}
                    key={speed}
                    onClick={() => onChange({ ...battle, speed })}
                    aria-label={`再生速度 ${speed}倍`}
                  >
                    ×{speed}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => onChange({ ...battle, frameIndex: lastIndex, playing: false })}>
                最後まで送る
              </button>
            </>
          )}
          {complete && (
            <button type="button" className="primary-button" onClick={onFinish}>
              結果を見る →
            </button>
          )}
        </div>
      </section>
      <div className="replay-pips" aria-hidden="true">
        {battle.result.frames.map((event, index) => (
          <span key={`${event.atSeconds}-${index}`} className={index <= battle.frameIndex ? 'is-active' : ''} />
        ))}
      </div>
    </main>
  );
}

function ResultScreen({
  run,
  beforeRoster,
  onContinue,
}: {
  run: CasualRunState;
  beforeRoster: MonsterInstance[];
  onContinue: () => void;
}) {
  const result = run.lastBattle;
  const won = result?.winner === 'player';
  const [revealStage, setRevealStage] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealStage(3);
      return;
    }
    const timers = [
      window.setTimeout(() => setRevealStage((current) => Math.max(current, 1)), 180),
      window.setTimeout(() => setRevealStage((current) => Math.max(current, 2)), 850),
      window.setTimeout(() => setRevealStage(3), 1650),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);
  const beforeById = new Map(beforeRoster.map((monster) => [monster.id, monster]));
  const finalFrame = result?.frames[result.frames.length - 1];
  const survivors =
    finalFrame?.fighters.filter((fighter) => fighter.team === 'player' && fighter.alive).length ?? run.activeIds.length;
  const levelUps = run.roster.filter((monster) => {
    const before = beforeById.get(monster.id);
    return before ? monster.level > before.level : false;
  }).length;
  const reportMetrics = [
    ['TIME', `${result?.durationSeconds.toFixed(1) ?? '0.0'}s`, '戦闘時間'],
    ['DAMAGE', String(result?.damageByTeam.player ?? 0), '与ダメージ'],
    ['RECEIVED', String(result?.damageByTeam.enemy ?? 0), '被ダメージ'],
    ['SURVIVORS', `${survivors}/3`, '生存'],
  ] as const;
  return (
    <main
      className={`result-screen${won ? ' is-win' : ''} reveal-stage-${revealStage}`}
      data-reveal-complete={revealStage >= 3}
    >
      <RunHeader run={run} />
      <section className="result-stage panel" aria-live="polite">
        {won && (
          <div className="reward-particles" aria-hidden="true">
            {Array.from({ length: 18 }, (_, index) => (
              <i key={index} style={{ '--reward-particle': index } as CSSProperties} />
            ))}
          </div>
        )}
        <header className="result-hero">
          <div>
            <span className="section-index">CYCLE {run.cycle} / BATTLE REPORT</span>
            <h2>{result?.winner === 'draw' ? '引き分け' : won ? '勝利' : '敗北'}</h2>
            <p>
              {result?.winner === 'draw'
                ? '互いの血統が拮抗しました。経験値を記録し、次の配合と編成へつなげます。'
                : won
                  ? '戦果を解析。勝利ボーナスを含む経験値が血統へ流れ込みます。'
                  : '戦果を解析。敗北しても経験値は残り、次の配合と編成へつながります。'}
            </p>
          </div>
          <div className="result-seal" aria-hidden="true">
            <span>{won ? 'CLEAR' : result?.winner === 'draw' ? 'DRAW' : 'RETRY'}</span>
            <b>{String(run.cycle).padStart(2, '0')}</b>
          </div>
        </header>
        <section className="battle-report">
          <div className="result-section-heading">
            <div>
              <span>01 / COMBAT DATA</span>
              <h3>戦闘報告</h3>
            </div>
            <small>{levelUps > 0 ? `${levelUps}体がレベルアップ` : '全員の経験値を更新'}</small>
          </div>
          <div className="battle-report-grid">
            {reportMetrics.map(([id, value, label]) => (
              <div className="battle-report-metric" key={id}>
                <span>{id}</span>
                <b>{value}</b>
                <small>{label}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="reward-report">
          <div className="result-section-heading">
            <div>
              <span>02 / EXPERIENCE PULSE</span>
              <h3>成長レポート</h3>
            </div>
            {revealStage < 3 && (
              <button type="button" className="text-button reveal-all-button" onClick={() => setRevealStage(3)}>
                報酬をすべて表示
              </button>
            )}
          </div>
          <div className="result-roster">
            {run.roster.map((monster, index) => {
              const definition = definitionFor(GAME_DATA, monster);
              const before = beforeById.get(monster.id) ?? monster;
              const xpGain = Math.max(0, monster.xp - before.xp);
              const leveledUp = monster.level > before.level;
              const progress = xpProgressFor(monster);
              const beforeStats = permanentStatsFor(GAME_DATA, before);
              const afterStats = permanentStatsFor(GAME_DATA, monster);
              const statGains = STAT_LABELS.flatMap(([id, label]) => {
                const gain = afterStats[id] - beforeStats[id];
                return gain > 0 ? [`${label}+${gain}`] : [];
              });
              return (
                <article
                  className={`result-monster-card${leveledUp ? ' is-level-up' : ''}`}
                  key={monster.id}
                  style={{ ...monsterStyle(GAME_DATA, definition), '--reveal-index': index } as CSSProperties}
                >
                  <div className="result-monster-identity">
                    <MonsterSigil
                      data={GAME_DATA}
                      definition={definition}
                      colorStars={monster.colorStars}
                      size="small"
                    />
                    <span>
                      <small>{run.activeIds.includes(monster.id) ? 'ACTIVE / 100%' : 'BENCH / 50%'}</small>
                      <strong>{definition.name}</strong>
                      <i>{starText(definition.whiteStars, monster.colorStars)}</i>
                    </span>
                    <b className="xp-gain" data-xp-gain={xpGain}>
                      +{xpGain} EXP
                    </b>
                  </div>
                  <div className="result-level-line">
                    <span>
                      LV. {before.level}
                      {leveledUp ? ` → ${monster.level}` : ''}
                    </span>
                    <b>{leveledUp ? 'LEVEL UP!' : progress.maximum ? 'MAX LEVEL' : `次まで ${progress.remaining}`}</b>
                  </div>
                  <div className="result-progress" aria-label={`EXP ${monster.xp}`}>
                    <span style={{ width: `${progress.percent}%` }} />
                  </div>
                  <div className="result-growth">
                    <small>累計EXP {monster.xp}</small>
                    <span>{statGains.length > 0 ? statGains.join(' / ') : '能力値を維持'}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        <footer className="result-actions">
          <p>{revealStage >= 3 ? '戦果の記録が完了しました。' : '戦果を記録しています…'}</p>
          <button type="button" className="launch-button" disabled={revealStage < 3} onClick={onContinue}>
            <span>{run.completedCycles >= 12 || run.losses >= 5 ? 'RUN COMPLETE' : `NEXT CYCLE ${run.cycle + 1}`}</span>
            {run.completedCycles >= 12 || run.losses >= 5 ? '最終結果へ' : '旅を続ける'}
          </button>
        </footer>
      </section>
    </main>
  );
}

function FinishedScreen({ run, onRestart }: { run: CasualRunState; onRestart: () => void }) {
  const completion = run.completedCycles >= GAME_DATA.rules.maxCycles;
  return (
    <main className="finished-screen">
      <div className="finish-sigil" aria-hidden="true">
        <span>竜</span>
        <span>魔</span>
        <span>精</span>
      </div>
      <span className="section-index">CASUAL RUN / COMPLETE</span>
      <h1>{completion ? '十二の航路を完走' : '血統の旅はここまで'}</h1>
      <p>
        {run.wins}勝 {run.losses}敗 · {run.completedCycles}サイクル
      </p>
      <div className="final-lineage">
        {run.activeIds.map((id) => {
          const monster = run.roster.find((entry) => entry.id === id);
          if (!monster) return null;
          const definition = definitionFor(GAME_DATA, monster);
          return (
            <div key={id}>
              <MonsterSigil data={GAME_DATA} definition={definition} colorStars={monster.colorStars} size="large" />
              <strong>{definition.name}</strong>
              <span>
                {starText(definition.whiteStars, monster.colorStars)} · Lv.{monster.level}
              </span>
            </div>
          );
        })}
      </div>
      <button type="button" className="launch-button" onClick={onRestart}>
        <span>NEW SEED</span>新しい旅を始める
      </button>
      <small>ランクポイントはランクモード実装時に追加予定</small>
    </main>
  );
}

export function App() {
  const [run, setRun] = useState(() => createCasualRun(GAME_DATA, INITIAL_SEED));
  const [battle, setBattle] = useState<BattleViewState>();
  const [lastBattleRoster, setLastBattleRoster] = useState<MonsterInstance[]>([]);
  const [discoveredMonsterIds, setDiscoveredMonsterIds] = useState(() => new Set<string>(loadDiscoveredMonsterIds()));

  useEffect(() => {
    setDiscoveredMonsterIds((current) => {
      const next = new Set(current);
      for (const monster of run.roster) next.add(monster.definitionId);
      if (next.size === current.size) return current;
      saveDiscoveredMonsterIds(next);
      return next;
    });
  }, [run.roster]);

  const startBattle = () => {
    const player = run.activeIds
      .map((id) => run.roster.find((monster) => monster.id === id))
      .filter((monster): monster is MonsterInstance => Boolean(monster));
    if (player.length !== GAME_DATA.rules.activeLimit) return;
    const battleSeed = deriveSeed(run.seed, run.cycle * 10_000 + run.commandIndex);
    const enemy = createGhostTeam(GAME_DATA, run.cycle, battleSeed);
    const result = simulateBattle(GAME_DATA, { player, enemy, seed: battleSeed });
    setRun(applyBattleResult(GAME_DATA, run, result));
    setBattle({ result, enemy, beforeRoster: run.roster, frameIndex: 0, playing: true, speed: 1 });
  };

  if (battle) {
    return (
      <BattleScreen
        battle={battle}
        onChange={setBattle}
        onFinish={() => {
          setLastBattleRoster(battle.beforeRoster);
          setBattle(undefined);
        }}
      />
    );
  }
  if (run.phase === 'draft') {
    return <DraftScreen run={run} onChoose={(id) => setRun(chooseDraftMonster(GAME_DATA, run, id))} />;
  }
  if (run.phase === 'event') {
    return <EventScreen run={run} onChoose={(id) => setRun(chooseEvent(GAME_DATA, run, id))} />;
  }
  if (run.phase === 'prepare') {
    return (
      <WorkshopScreen
        run={run}
        discoveredMonsterIds={discoveredMonsterIds}
        setRun={setRun}
        onStartBattle={startBattle}
      />
    );
  }
  if (run.phase === 'result') {
    return (
      <ResultScreen run={run} beforeRoster={lastBattleRoster} onContinue={() => setRun(continueRun(GAME_DATA, run))} />
    );
  }
  return (
    <FinishedScreen
      run={run}
      onRestart={() => setRun(createCasualRun(GAME_DATA, deriveSeed(run.seed, run.commandIndex + 71)))}
    />
  );
}
