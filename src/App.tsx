import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEventHandler,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { simulateBattle } from './core/battle';
import { breedMonsters, inheritanceSkillChoices, listBreedingCandidates } from './core/breeding';
import {
  eventCatalogEntries,
  mergeDiscoveredEventIds,
  mergeDiscoveredMonsterIds,
  mergeDiscoveredSkillIds,
  mergeSkillsFromDiscoveredMonsters,
  monsterCatalogEntries,
  normalizeDiscoveredEventIds,
  normalizeDiscoveredMonsterIds,
  normalizeDiscoveredSkillIds,
  skillCatalogEntries,
  skillHolderRelationsFor,
  specialRecipeRelationsFor,
  type EventCatalogEntry,
  type MonsterCatalogEntry,
  type SkillCatalogEntry,
} from './core/catalog';
import { createGhostTeam } from './core/ghost';
import {
  createMonster,
  definitionFor,
  experienceProfileFor,
  experienceThresholdsFor,
  farewellCoinBreakdownFor,
  MAX_GAMBIT_RULES,
  MIN_GAMBIT_RULES,
  permanentStatsFor,
  skillIdsFor,
  statBreakdownFor,
  statGrowthProfileFor,
  targetRulesForSkill,
} from './core/monster';
import { createPlaytestReport, serializePlaytestReport } from './core/playtest-report';
import { deriveSeed } from './core/rng';
import type { OnlineSeat } from './core/online-match';
import {
  addGambit,
  applyBattleResult,
  breedInRun,
  breedingCandidatesForRun,
  buyEquipment,
  buyMonster,
  chooseDraftMonster,
  chooseEvent,
  continueEvent,
  continueRun,
  createCasualRun,
  createOnlineRun,
  equipItem,
  eventIsAvailable,
  eventRequiresTarget,
  moveGambit,
  moveMonsterToPartySlot,
  rerollShop,
  removeGambit,
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
  EffectDefinition,
  EggHatchResult,
  EquipmentDefinition,
  FighterSnapshot,
  GameData,
  GambitCondition,
  GambitRule,
  LineageId,
  MonsterDefinition,
  MonsterBattleReport,
  MonsterInstance,
  Rarity,
  SkillDefinition,
  StatBlock,
  StatId,
  StatusId,
  TargetRule,
} from './core/types';
import { GAME_DATA } from './game/game-data';
import type { RoomView } from './online/protocol';
import type { OnlineConnectionStatus } from './online/use-online-room';
import { useOnlineRoom } from './online/use-online-room';

const CATALOG_MONSTER_COUNT = GAME_DATA.monsters.length;
const CATALOG_SKILL_COUNT = GAME_DATA.skills.length;
const CATALOG_EVENT_COUNT = GAME_DATA.events.length;
const RARITY_LABELS: Record<Rarity, string> = {
  common: 'コモン',
  rare: 'レア',
  epic: 'エピック',
  legendary: 'レジェンダリー',
};

type InspectorTab = 'profile' | 'gambit' | 'recipes';
type CatalogDetailTab = 'profile' | 'recipes';
type CatalogSection = 'monsters' | 'skills' | 'events';
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
const BATTLE_PULSE_MS = 760;
const BATTLE_START_STEP_MS = 720;
const BATTLE_START_PULSE_MS = 680;
const HP_REVEAL_PROGRESS = 0.58;
const HP_TRANSITION_MS = 140;
const query = new URLSearchParams(window.location.search);
const requestedSeed = Number(query.get('seed'));
const INITIAL_SEED = Number.isInteger(requestedSeed) && requestedSeed > 0 ? requestedSeed : 7261;
type AppMode = 'select' | 'casual' | 'online';
const INITIAL_ROOM_ID = query.get('room') ?? undefined;
const INITIAL_MODE: AppMode = INITIAL_ROOM_ID ? 'online' : query.get('mode') === 'casual' ? 'casual' : 'select';
const RECIPE_DISCOVERY_STORAGE_KEY = `code-monsters:recipe-discovery:v${GAME_DATA.schemaVersion}`;
const SKILL_DISCOVERY_STORAGE_KEY = `code-monsters:skill-discovery:v${GAME_DATA.schemaVersion}`;
const EVENT_DISCOVERY_STORAGE_KEY = `code-monsters:event-discovery:v${GAME_DATA.schemaVersion}`;

const loadDiscoveredMonsterIds = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(RECIPE_DISCOVERY_STORAGE_KEY) ?? '[]');
    return normalizeDiscoveredMonsterIds(GAME_DATA, saved);
  } catch {
    return new Set<string>();
  }
};

const saveDiscoveredMonsterIds = (ids: ReadonlySet<string>) => {
  try {
    window.localStorage.setItem(RECIPE_DISCOVERY_STORAGE_KEY, JSON.stringify([...ids].sort()));
  } catch {
    // Discovery still works for the current run when storage is unavailable.
  }
};

const loadDiscoveredSkillIds = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SKILL_DISCOVERY_STORAGE_KEY) ?? '[]');
    return mergeSkillsFromDiscoveredMonsters(
      GAME_DATA,
      normalizeDiscoveredSkillIds(GAME_DATA, saved),
      loadDiscoveredMonsterIds(),
    );
  } catch {
    return new Set<string>();
  }
};

const loadDiscoveredEventIds = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(EVENT_DISCOVERY_STORAGE_KEY) ?? '[]');
    return normalizeDiscoveredEventIds(GAME_DATA, saved);
  } catch {
    return new Set<string>();
  }
};

const saveDiscoveryIds = (storageKey: string, ids: ReadonlySet<string>) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...ids].sort()));
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
  'self-hp-above': '自分のHPが以上',
  'self-mp-below': '自分のMPが以下',
  'self-mp-above': '自分のMPが以上',
  'self-shield-below': '自分の盾が以下',
  'self-shield-above': '自分の盾が以上',
  'ally-hp-below': '味方のHPが以下',
  'ally-hp-above': '味方のHPが以上',
  'ally-mp-below': '味方のMPが以下',
  'ally-mp-above': '味方のMPが以上',
  'ally-shield-below': '味方の盾が以下',
  'ally-shield-above': '味方の盾が以上',
  'enemy-hp-below': '敵のHPが以下',
  'enemy-hp-above': '敵のHPが以上',
  'enemy-mp-below': '敵のMPが以下',
  'enemy-mp-above': '敵のMPが以上',
  'enemy-shield-below': '敵の盾が以下',
  'enemy-shield-above': '敵の盾が以上',
  'self-has-status': '自分に状態がある',
  'self-lacks-status': '自分に状態がない',
  'ally-has-status': '味方に状態がある',
  'ally-lacks-status': '味方に状態がない',
  'enemy-has-status': '敵に状態がある',
  'enemy-lacks-status': '敵に状態がない',
  'living-count-at-most': '生存数が以下',
  'living-count-at-least': '生存数が以上',
};

const CONDITION_GROUPS: Array<{
  label: string;
  kinds: GambitCondition['kind'][];
}> = [
  { label: '基本', kinds: ['always'] },
  {
    label: '自分',
    kinds: [
      'self-hp-below',
      'self-hp-above',
      'self-mp-below',
      'self-mp-above',
      'self-shield-below',
      'self-shield-above',
      'self-has-status',
      'self-lacks-status',
    ],
  },
  {
    label: '味方',
    kinds: [
      'ally-hp-below',
      'ally-hp-above',
      'ally-mp-below',
      'ally-mp-above',
      'ally-shield-below',
      'ally-shield-above',
      'ally-has-status',
      'ally-lacks-status',
    ],
  },
  {
    label: '敵',
    kinds: [
      'enemy-hp-below',
      'enemy-hp-above',
      'enemy-mp-below',
      'enemy-mp-above',
      'enemy-shield-below',
      'enemy-shield-above',
      'enemy-has-status',
      'enemy-lacks-status',
    ],
  },
  { label: '生存数', kinds: ['living-count-at-most', 'living-count-at-least'] },
];

const STAT_LABELS: Array<[keyof StatBlock, string]> = [
  ['maxHp', 'HP'],
  ['maxMp', 'MP'],
  ['attack', '攻'],
  ['defense', '守'],
  ['speed', '速'],
  ['wisdom', '賢'],
  ['crit', '会'],
];

const STAT_NAMES: Record<StatId, string> = {
  maxHp: '最大HP',
  maxMp: '最大MP',
  attack: '攻撃力',
  defense: '防御力',
  speed: '素早さ',
  wisdom: '賢さ',
  crit: '会心率',
};

const STAT_SOURCE_LABELS = {
  base: '基礎',
  growth: '成長',
  individual: '個体値',
  equipment: '装備',
} as const;

type StatSourceId = keyof typeof STAT_SOURCE_LABELS;

type StatChartValue = {
  base: number;
  growth: number;
  individual: number;
  equipment: number;
  total: number;
  capped: boolean;
};

const STAT_CHART_MAXIMUMS = Object.fromEntries(
  STAT_LABELS.map(([statId]) => {
    if (statId === 'crit') return [statId, GAME_DATA.rules.battle.criticalCap];
    const maximumColorGrowth = Math.max(...GAME_DATA.rules.breeding.colorGrowthBonus);
    const maximumEquipmentBonus = Math.max(
      0,
      ...GAME_DATA.equipment.map((equipment) => equipment.statBonus[statId] ?? 0),
    );
    const contentMaximum = Math.max(
      ...GAME_DATA.monsters.map((definition) => {
        const growthUnits = statGrowthProfileFor(GAME_DATA, definition).incrementsByLevel.reduce(
          (total, increment) => total + increment,
          0,
        );
        return (
          definition.baseStats[statId] +
          Math.floor(definition.growthPerLevel[statId] * growthUnits * maximumColorGrowth)
        );
      }),
    );
    return [statId, Math.max(1, contentMaximum + maximumEquipmentBonus)];
  }),
) as Record<StatId, number>;

const SKILL_TARGET_LABELS: Record<SkillDefinition['targetScope'], string> = {
  'single-enemy': '敵単体',
  'single-ally': '味方単体',
  self: '自分',
  'all-enemies': '敵全体',
  'all-allies': '味方全体',
};

const LINEAGE_SILHOUETTE: Record<LineageId, string> = {
  dragon: '🐉',
  demon: '😈',
  spirit: '✦',
};

const emptyCondition = (kind: GambitCondition['kind']): GambitCondition => {
  switch (kind) {
    case 'always':
      return { kind };
    case 'self-hp-below':
    case 'self-hp-above':
    case 'self-mp-below':
    case 'self-mp-above':
    case 'self-shield-below':
    case 'self-shield-above':
    case 'ally-hp-below':
    case 'ally-hp-above':
    case 'ally-mp-below':
    case 'ally-mp-above':
    case 'ally-shield-below':
    case 'ally-shield-above':
    case 'enemy-hp-below':
    case 'enemy-hp-above':
    case 'enemy-mp-below':
    case 'enemy-mp-above':
    case 'enemy-shield-below':
    case 'enemy-shield-above':
      return { kind, threshold: 50 };
    case 'self-has-status':
    case 'self-lacks-status':
    case 'ally-has-status':
    case 'ally-lacks-status':
    case 'enemy-has-status':
    case 'enemy-lacks-status':
      return { kind, statusId: 'silence' };
    case 'living-count-at-most':
      return { kind, team: 'enemy', count: 1 };
    case 'living-count-at-least':
      return { kind, team: 'enemy', count: 2 };
  }
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
  const thresholds = experienceThresholdsFor(GAME_DATA, monster);
  const currentThreshold = thresholds[monster.level - 1] ?? 0;
  const nextThreshold = thresholds[monster.level];
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
  obscured = false,
}: {
  data: GameData;
  definition: MonsterDefinition;
  colorStars?: ColorStars;
  size?: 'small' | 'regular' | 'large';
  obscured?: boolean;
}) {
  const body = obscured ? LINEAGE_SILHOUETTE[definition.lineageId] : definition.appearance.body;
  return (
    <div
      className={`monster-sigil is-${size} is-form-${definition.appearance.form}${obscured ? ' is-obscured' : ''}`}
      style={monsterStyle(data, definition)}
      data-white-stars={definition.whiteStars}
      aria-hidden="true"
    >
      <span>{body}</span>
      {!obscured && <em>{definition.appearance.attire}</em>}
      {!obscured && <s>{definition.glyph}</s>}
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
  const experienceProfile = experienceProfileFor(data, definition);
  const roleLabels = definition.roleTagIds.flatMap((tagId) => {
    const tag = data.roleTags.find((entry) => entry.id === tagId);
    return tag ? [tag.label] : [];
  });
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
        <span className="performance-tag-row" aria-label={`${experienceProfile.name}型、${roleLabels.join('、')}`}>
          <i>{experienceProfile.name}</i>
          {roleLabels.slice(0, 2).map((label) => (
            <i key={label}>{label}</i>
          ))}
        </span>
      </div>
    </>
  );
  return (
    <article
      className={`definition-card${selected ? ' is-selected' : ''}${onClick ? ' is-interactive' : ''}`}
      style={monsterStyle(data, definition)}
    >
      {onClick ? (
        <button className="definition-card-main" type="button" aria-pressed={selected} onClick={onClick}>
          {content}
        </button>
      ) : (
        <div className="definition-card-main">{content}</div>
      )}
      {footer && <div className="monster-card-footer">{footer}</div>}
    </article>
  );
}

const EFFECT_TARGET_LABELS: Record<EffectDefinition['target'], string> = {
  'action-target': '対象',
  self: '自分',
  'all-allies': '味方全体',
  'all-enemies': '敵全体',
};

const effectFactFor = (effect: EffectDefinition) => {
  const target = EFFECT_TARGET_LABELS[effect.target];
  switch (effect.kind) {
    case 'damage':
      return `威力 ${effect.power}${effect.canCrit ? ' · 会心可能' : ''}`;
    case 'shield-burst':
      return `自分の盾を全消費 · 盾値×${effect.power}%のダメージ`;
    case 'recoil':
      return `自分に最大HP ${effect.maxHpPercent}%の反動`;
    case 'heal':
      return `${target}を回復 · 回復力 ${effect.power}`;
    case 'shield':
      return `${target}に最大HP ${effect.maxHpPercent}%の盾`;
    case 'status': {
      if (effect.statusId === 'silence') return `${target}を沈黙 · ${effect.durationSeconds}秒`;
      const direction = effect.statusId.endsWith('-down') ? '-' : '+';
      const unit = effect.statusId === 'regeneration' || effect.statusId === 'damage-over-time' ? '%' : '';
      return `${target}の${STATUS_LABELS[effect.statusId]} ${direction}${effect.amount}${unit} · ${effect.durationSeconds}秒`;
    }
    case 'atb':
      return `${target}の行動ゲージ ${effect.amount >= 0 ? '+' : ''}${effect.amount}`;
    case 'mp':
      return `${target}のMP ${effect.amount >= 0 ? '+' : ''}${effect.amount}`;
  }
};

const runRewardTextFor = (skill: SkillDefinition) => {
  const reward = skill.runReward;
  if (!reward) return undefined;
  if (reward.kind === 'coins-per-damage-action') {
    return `ダメージ行動ごとに色星0/1/2で${reward.amountsByColorStars.join('/')}コイン · 1戦${reward.maximumTriggersPerBattle}回まで`;
  }
  return `ダメージ行動ごとに本人が色星0/1/2でEXP +${reward.amountsByColorStars.join('/')} · 1戦${reward.maximumTriggersPerBattle}回まで`;
};

const skillTagsFor = (skill: SkillDefinition) => {
  const damage = skill.effects.find((effect) => effect.kind === 'damage');
  const shieldBurst = skill.effects.some((effect) => effect.kind === 'shield-burst');
  const healing = skill.effects.some((effect) => effect.kind === 'heal');
  const tags = [SKILL_TARGET_LABELS[skill.targetScope]];
  if (damage?.kind === 'damage') {
    const scalingLabels = {
      physical: ['物理', '攻撃力参照'],
      magic: ['魔法', '賢さ参照'],
      defense: ['防護', '守備力参照'],
      speed: ['先手', '素早さ参照'],
    } as const;
    const [category, scaling] = scalingLabels[damage.scaling];
    tags.unshift(category);
    tags.push(scaling);
  } else if (shieldBurst) {
    tags.unshift('盾撃');
    tags.push('盾値参照');
  } else if (healing) {
    tags.unshift('回復');
    tags.push('賢さ参照');
  } else if (skill.effects.some((effect) => effect.kind === 'shield')) {
    tags.unshift('防護');
  } else {
    tags.unshift('補助');
  }
  if (skill.runReward) tags.push('旅路報酬');
  return tags;
};

const skillSummaryText = (skill?: SkillDefinition) =>
  skill
    ? `${skillTagsFor(skill).join(' / ')}。${skill.effects.map(effectFactFor).join('。')}。${
        skill.runReward ? `${runRewardTextFor(skill)}。` : ''
      }`
    : '攻撃力を使って敵1体へ物理ダメージ。MPがなくても実行します。';

function SkillEffectCard({
  skill,
  badge,
  selected = false,
  onSelect,
  className = '',
  disabled = false,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  skill: SkillDefinition;
  badge: string;
  selected?: boolean;
  onSelect?: () => void;
  className?: string;
  disabled?: boolean;
  draggable?: boolean;
  onDragStart?: DragEventHandler<HTMLButtonElement>;
  onDragEnd?: DragEventHandler<HTMLButtonElement>;
}) {
  const content = (
    <>
      <header>
        <span>{badge}</span>
        <em className={`rarity-badge is-${skill.rarity}`}>{RARITY_LABELS[skill.rarity]}</em>
        <b>MP {skill.mpCost}</b>
      </header>
      <strong>{skill.name}</strong>
      <div className="skill-effect-tags">
        {skillTagsFor(skill).map((tag) => (
          <i key={tag}>{tag}</i>
        ))}
      </div>
      <ul>
        {skill.effects.map((effect, index) => (
          <li className="skill-effect-fact" key={`${skill.id}-effect-${index}`}>
            {effectFactFor(effect)}
          </li>
        ))}
        {skill.runReward && (
          <li className="skill-effect-fact is-journey-reward">旅路効果 · {runRewardTextFor(skill)}</li>
        )}
      </ul>
      <p>{skill.description}</p>
    </>
  );
  if (onSelect) {
    return (
      <button
        type="button"
        className={`effect-skill-card effect-skill-choice is-rarity-${skill.rarity}${selected ? ' is-selected' : ''}${className ? ` ${className}` : ''}`}
        aria-pressed={selected}
        disabled={disabled}
        draggable={draggable}
        onClick={onSelect}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        {content}
      </button>
    );
  }
  return <article className={`effect-skill-card is-rarity-${skill.rarity}`}>{content}</article>;
}

function BreedingStatLedger({ monster }: { monster: MonsterInstance }) {
  const definition = definitionFor(GAME_DATA, monster);
  const breakdown = statBreakdownFor(GAME_DATA, monster);
  const growthMultiplier = GAME_DATA.rules.breeding.colorGrowthBonus[monster.colorStars];
  const nextGrowthUnits = statGrowthProfileFor(GAME_DATA, definition).incrementsByLevel[0] ?? 1;
  return (
    <section className="breeding-stat-ledger" aria-label="誕生後の能力と配合継承値">
      <header>
        <div>
          <span>誕生時パラメーター</span>
          <strong>最終値と配合による上乗せ</strong>
        </div>
        <small>{monster.colorStars > 0 ? `色星成長 ×${growthMultiplier.toFixed(1)}` : 'Lv.1 / 装備なし'}</small>
      </header>
      <div className="breeding-stat-rows">
        {STAT_LABELS.map(([id]) => {
          const stat = breakdown[id];
          const nextGrowth = Math.floor(definition.growthPerLevel[id] * nextGrowthUnits * growthMultiplier);
          const suffix = id === 'crit' ? '%' : '';
          return (
            <div className="breeding-stat-row" data-stat-id={id} data-inherited-bonus={stat.individual} key={id}>
              <span>{STAT_NAMES[id]}</span>
              <strong>
                {stat.total}
                {suffix}
              </strong>
              <small>
                基礎 {stat.base}
                {suffix}
              </small>
              <b>
                配合 +{stat.individual}
                {suffix}
              </b>
              <i>
                次のLv +{nextGrowth}
                {suffix}
              </i>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function GrowthProfilePanel({ definition, currentLevel }: { definition: MonsterDefinition; currentLevel?: number }) {
  const experienceProfile = experienceProfileFor(GAME_DATA, definition);
  const statProfile = statGrowthProfileFor(GAME_DATA, definition);
  const [selectedLevel, setSelectedLevel] = useState(currentLevel && currentLevel > 1 ? currentLevel : 2);
  useEffect(() => setSelectedLevel(currentLevel && currentLevel > 1 ? currentLevel : 2), [currentLevel, definition.id]);
  const experienceDeltas = experienceProfile.thresholds
    .slice(1)
    .map((threshold, index) => threshold - (experienceProfile.thresholds[index] ?? 0));
  const maximumExperienceDelta = Math.max(
    ...GAME_DATA.experienceProfiles.flatMap((profile) =>
      profile.thresholds.slice(1).map((threshold, index) => threshold - (profile.thresholds[index] ?? 0)),
    ),
  );
  const maximumGrowthIncrement = Math.max(
    ...GAME_DATA.statGrowthProfiles.flatMap((profile) => profile.incrementsByLevel),
  );
  const selectedIndex = Math.max(0, selectedLevel - 2);
  const roleLabels = definition.roleTagIds.flatMap((tagId) => {
    const tag = GAME_DATA.roleTags.find((entry) => entry.id === tagId);
    return tag ? [tag.label] : [];
  });
  const rows = [
    {
      id: 'experience',
      label: '必要EXP',
      profileName: experienceProfile.name,
      values: experienceDeltas,
      maximum: maximumExperienceDelta,
      valueLabel: (value: number) => `${value} EXP`,
    },
    {
      id: 'stats',
      label: '能力成長',
      profileName: statProfile.name,
      values: statProfile.incrementsByLevel,
      maximum: maximumGrowthIncrement,
      valueLabel: (value: number) => `×${value.toFixed(2)}`,
    },
  ] as const;
  return (
    <section className="growth-profile-panel" data-growth-profile={experienceProfile.id}>
      <header>
        <div>
          <span>GROWTH SCAN</span>
          <strong>
            {experienceProfile.name}EXP / {statProfile.name}
          </strong>
        </div>
        <div className="performance-tag-row">
          {roleLabels.map((label) => (
            <i key={label}>{label}</i>
          ))}
        </div>
      </header>
      <div className="growth-scan">
        {rows.map((row) => (
          <div className={`growth-scan-row is-${row.id}`} key={row.id}>
            <span>
              <b>{row.label}</b>
              <small>{row.profileName}</small>
            </span>
            <div className="growth-scan-columns">
              {row.values.map((value, index) => {
                const level = index + 2;
                return (
                  <button
                    type="button"
                    className={`${selectedLevel === level ? 'is-selected' : ''}${
                      currentLevel === level ? ' is-current' : ''
                    }`}
                    style={{ '--scan-bar': `${Math.max(8, (value / row.maximum) * 100)}%` } as CSSProperties}
                    aria-label={`レベル${level}、${row.label}${row.valueLabel(value)}`}
                    aria-pressed={selectedLevel === level}
                    onClick={() => setSelectedLevel(level)}
                    key={`${row.id}-${level}`}
                  >
                    <i />
                    <small>Lv{level}</small>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="growth-scan-reading" aria-live="polite">
        <span>LV.{selectedLevel}</span>
        次まで {experienceDeltas[selectedIndex]} EXP
        <i>成長量 ×{(statProfile.incrementsByLevel[selectedIndex] ?? 0).toFixed(2)}</i>
        {currentLevel ? <b>現在 Lv.{currentLevel}</b> : null}
      </p>
    </section>
  );
}

function CombatIdentityPanel({ definition }: { definition: MonsterDefinition }) {
  const identity = definition.identity;
  if (!identity) return null;
  const signature = GAME_DATA.skills.find((skill) => skill.id === identity.signatureSkillId);
  return (
    <section className="combat-identity detail-card" data-signature-skill={identity.signatureSkillId}>
      <header>
        <span>COMBAT IDENTITY</span>
        <strong>{signature?.name ?? identity.signatureSkillId}</strong>
      </header>
      <div>
        <article>
          <span>勝ち筋</span>
          <p>{identity.winCondition}</p>
        </article>
        <article>
          <span>弱点</span>
          <p>{identity.weakness}</p>
        </article>
        <article>
          <span>推奨ガンビット</span>
          <p>{identity.gambitHint}</p>
        </article>
      </div>
    </section>
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
        <span>PARAMETER PROFILE</span>
        <small>能力別の図鑑基準 / 色は上昇内訳</small>
      </div>
      <StatBreakdownGrid monster={monster} />
      <GrowthProfilePanel definition={definition} currentLevel={monster.level} />
      <CombatIdentityPanel definition={definition} />
      <section className="trait-block detail-card">
        <span>TRAIT / COLOR STAGE {monster.colorStars}</span>
        <h3>{trait?.name}</h3>
        <p>{trait?.stages[monster.colorStars].description}</p>
      </section>
      {definition.hatch && (
        <section className="hatch-status detail-card">
          <span>HATCH STATUS</span>
          <h3>あと{Math.max(0, definition.hatch.afterHeldCycles - monster.cyclesHeld)}戦で孵化</h3>
          <small>孵化先は最大 {starText(definition.hatch.maximumWhiteStars)}</small>
        </section>
      )}
      <section className="skill-list">
        <span>SKILL CARDS</span>
        <div className="skill-card-grid">
          {skillIdsFor(GAME_DATA, monster).map((skillId, index) => {
            const skill = GAME_DATA.skills.find((entry) => entry.id === skillId);
            return skill ? (
              <SkillEffectCard
                skill={skill}
                badge={index === 2 && monster.inheritedSkillId ? '継承' : index === 2 ? '初期' : `固有${index + 1}`}
                key={`${skillId}-${index}`}
              />
            ) : null;
          })}
        </div>
      </section>
    </div>
  );
}

function StatBarChart({ values, ariaLabel }: { values: Record<StatId, StatChartValue>; ariaLabel: string }) {
  const sourceIds = (Object.keys(STAT_SOURCE_LABELS) as StatSourceId[]).filter((sourceId) =>
    STAT_LABELS.some(([statId]) => values[statId][sourceId] > 0),
  );
  return (
    <section className="stat-bar-chart" aria-label={ariaLabel}>
      <div className="stat-bar-legend" aria-label="棒グラフの色分け">
        {sourceIds.map((sourceId) => (
          <span className={`is-${sourceId}`} key={sourceId}>
            <i aria-hidden="true" />
            {STAT_SOURCE_LABELS[sourceId]}
          </span>
        ))}
      </div>
      <div className="stat-bar-rows">
        {STAT_LABELS.map(([id, shortLabel]) => {
          const stat = values[id];
          const suffix = id === 'crit' ? '%' : '';
          const referenceMaximum = STAT_CHART_MAXIMUMS[id];
          const segments = (Object.keys(STAT_SOURCE_LABELS) as StatSourceId[])
            .map((sourceId) => ({
              id: sourceId,
              label: STAT_SOURCE_LABELS[sourceId],
              value: stat[sourceId],
            }))
            .filter(({ value }) => value > 0);
          const valueDescription = segments
            .map(({ label, value }, index) => `${label}${index === 0 ? ' ' : 'プラス'}${value}${suffix}`)
            .join('、');
          return (
            <div
              className={`stat-bar-row${stat.total > referenceMaximum ? ' is-over-reference' : ''}`}
              data-stat-id={id}
              key={id}
            >
              <span className="stat-bar-label">
                <small aria-hidden="true">{shortLabel}</small>
                <b>{STAT_NAMES[id]}</b>
              </span>
              <div className="stat-bar-body">
                <div
                  className="stat-bar-track"
                  role="meter"
                  aria-label={`${STAT_NAMES[id]}の最終値`}
                  aria-valuemin={0}
                  aria-valuemax={Math.max(referenceMaximum, stat.total)}
                  aria-valuenow={stat.total}
                  aria-valuetext={`${stat.total}${suffix}。${valueDescription}${stat.capped ? `、上限${GAME_DATA.rules.battle.criticalCap}%` : ''}`}
                >
                  <div className="stat-bar-fill" aria-hidden="true">
                    {segments.map((segment) => (
                      <i
                        className={`stat-bar-segment is-${segment.id}`}
                        style={
                          {
                            '--stat-segment-width': `${(segment.value / referenceMaximum) * 100}%`,
                          } as CSSProperties
                        }
                        key={segment.id}
                      />
                    ))}
                  </div>
                </div>
                <div className="stat-bonus-list" aria-hidden="true">
                  {segments.map((segment) => (
                    <i className={`stat-bonus is-${segment.id}`} data-bonus-source={segment.id} key={segment.id}>
                      <em>{segment.label}</em>
                      {segment.id === 'base' ? ' ' : ' +'}
                      {segment.value}
                      {suffix}
                    </i>
                  ))}
                  {stat.capped && <i className="stat-bonus is-cap">上限 {GAME_DATA.rules.battle.criticalCap}%</i>}
                </div>
              </div>
              <strong data-stat-total={stat.total}>
                {stat.total}
                {suffix}
              </strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StatBreakdownGrid({ monster }: { monster: MonsterInstance }) {
  const breakdown = statBreakdownFor(GAME_DATA, monster);
  return <StatBarChart values={breakdown} ariaLabel="能力の最終値と上昇内訳" />;
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

function EquipmentDetailDialog({ equipment, onClose }: { equipment?: EquipmentDefinition; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const equipmentId = equipment?.id;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !equipment) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [equipmentId]);
  if (!equipment) return null;
  const statFacts = STAT_LABELS.flatMap(([id]) => {
    const value = equipment.statBonus[id];
    if (!value) return [];
    return [`${STAT_NAMES[id]} +${value}${id === 'crit' ? '%' : ''}`];
  });
  const effectFacts = equipment.battleStartEffects.map(effectFactFor);
  return (
    <dialog
      ref={dialogRef}
      className="equipment-detail-dialog"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      aria-label={`${equipment.name}の詳細`}
    >
      <section className={`equipment-detail-panel panel is-rarity-${equipment.rarity}`}>
        <button type="button" className="dialog-close" onClick={() => dialogRef.current?.close()} aria-label="閉じる">
          ×
        </button>
        <header className="equipment-detail-identity">
          <span className="equipment-glyph" aria-hidden="true">
            {equipment.icon}
          </span>
          <div>
            <small>{RARITY_LABELS[equipment.rarity]}装備</small>
            <h2>{equipment.name}</h2>
          </div>
        </header>
        <p className="equipment-detail-description">{equipment.description}</p>
        <section className="equipment-detail-effects" aria-label="装備効果">
          <span>EFFECT</span>
          <ul>
            {[...statFacts, ...effectFacts].map((fact, index) => (
              <li className="equipment-effect-fact" key={`${equipment.id}-effect-${index}`}>
                {fact}
              </li>
            ))}
          </ul>
        </section>
        <div className="equipment-detail-price">
          <span>価格</span>
          <strong>● {equipment.price}</strong>
        </div>
      </section>
    </dialog>
  );
}

function RunHeader({
  run,
  discoveredCount,
  onOpenCatalog,
}: {
  run: CasualRunState;
  discoveredCount?: number;
  onOpenCatalog?: () => void;
}) {
  return (
    <>
      <header className="run-header">
        <div className="brand-lockup">
          <span>CODE MONSTERS // FIELD LAB</span>
          <h1>血統航路</h1>
        </div>
        <div className="run-header-tools">
          {onOpenCatalog && (
            <button type="button" className="catalog-open-button" onClick={onOpenCatalog}>
              <span>FIELD NOTES</span>
              <i>図鑑</i>
              <b>
                {discoveredCount ?? 0}/{CATALOG_MONSTER_COUNT}
              </b>
            </button>
          )}
          <div className="run-metrics" aria-label="ラン状況">
            <span>
              CYCLE <b>{String(run.cycle).padStart(2, '0')}</b>
            </span>
            <span>
              WIN <b>{run.wins}</b>
            </span>
            <span>
              LOSS{' '}
              <b>
                {run.losses}
                {run.mode === 'casual' ? '/5' : ''}
              </b>
            </span>
            <span className="coin-metric">
              COIN <b>{run.coins}</b>
            </span>
          </div>
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

function DeveloperModeSwitch({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <label className={`developer-mode-switch${enabled ? ' is-enabled' : ''}`}>
      <input type="checkbox" checked={enabled} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span>DEV</span>
      <strong>{enabled ? '図鑑全開放' : '開発者モード'}</strong>
      <i aria-hidden="true" />
    </label>
  );
}

const roomIdFromInvite = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const invitation = new URL(trimmed);
    return invitation.searchParams.get('room') ?? undefined;
  } catch {
    return trimmed;
  }
};

function ModeSelectScreen({
  onCasual,
  onCreateOnline,
  onJoinOnline,
}: {
  onCasual: () => void;
  onCreateOnline: () => void;
  onJoinOnline: (roomId: string) => boolean;
}) {
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const join = () => {
    const roomId = roomIdFromInvite(invite);
    if (!roomId || !onJoinOnline(roomId)) {
      setError('招待URL、または8文字以上の対戦室IDを入力してください');
    }
  };
  return (
    <main className="mode-select-screen">
      <header className="mode-select-mast">
        <div className="brand-lockup">
          <span>CODE MONSTERS // FIELD LAB</span>
          <h1>血統航路</h1>
        </div>
        <span>USER TEST BUILD · {GAME_DATA.rules.contentVersion}</span>
      </header>
      <section className="mode-select-intro">
        <span className="section-index">EXPEDITION LEDGER / 00</span>
        <h2>検証する航路を選ぶ</h2>
        <p>育成と自動戦闘はどちらも同じです。2人対戦では編成だけを同期し、戦闘結果を同時に受け取ります。</p>
      </section>
      <div className="mode-ledger">
        <section className="mode-route panel is-solo">
          <header>
            <span>01 / LOCAL GHOST</span>
            <b>ひとり</b>
          </header>
          <div className="mode-route-mark" aria-hidden="true">
            <span>竜</span>
          </div>
          <h3>ひとりで検証</h3>
          <p>12サイクルの育成と非同期ゴースト戦を、今まで通りすぐに試せます。</p>
          <ul>
            <li>ログイン不要</li>
            <li>5敗で航路終了</li>
            <li>ローカルで戦闘計算</li>
          </ul>
          <button type="button" className="secondary-button" onClick={onCasual}>
            SOLO ROUTE / はじめる
          </button>
        </section>
        <section className="mode-route panel is-pair">
          <header>
            <span>02 / LINKED EXPEDITION</span>
            <b>ふたり</b>
          </header>
          <div className="paired-seals" aria-hidden="true">
            <span>竜</span>
            <i />
            <span>精</span>
          </div>
          <h3>ふたりで航海</h3>
          <p>招待URLを渡し、各サイクルの最終編成を提出。12戦の勝ち数で競います。</p>
          <ul>
            <li>WebSocketで待機</li>
            <li>12戦固定・5敗終了なし</li>
            <li>同点時はサドンデス</li>
          </ul>
          <button type="button" className="launch-button" onClick={onCreateOnline}>
            <span>CREATE 1V1 ROOM</span>
            対戦室を作る
          </button>
          <div className="invite-entry">
            <label htmlFor="invite-room">招待を受け取った場合</label>
            <div>
              <input
                id="invite-room"
                value={invite}
                placeholder="招待URL または ROOM ID"
                onChange={(event) => {
                  setInvite(event.currentTarget.value);
                  setError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') join();
                }}
              />
              <button type="button" className="secondary-button" onClick={join}>
                参加
              </button>
            </div>
            <small aria-live="polite">{error || 'URLを開くだけでも参加できます'}</small>
          </div>
        </section>
      </div>
    </main>
  );
}

function OnlineRoomBar({
  room,
  seat,
  connection,
  error,
  copied,
  onCopy,
  onLeave,
}: {
  room?: RoomView;
  seat?: OnlineSeat;
  connection: OnlineConnectionStatus;
  error?: string;
  copied: boolean;
  onCopy: () => void;
  onLeave: () => void;
}) {
  const ownReady = seat ? room?.submittedSeats.includes(seat) : false;
  const opponent = seat === 'a' ? 'b' : 'a';
  const opponentReady = room?.submittedSeats.includes(opponent);
  return (
    <aside className={`online-room-bar is-${connection}`} aria-live="polite">
      <div className="online-room-seals" aria-hidden="true">
        <span>{seat === 'b' ? 'B' : 'A'}</span>
        <i />
        <span>{seat === 'b' ? 'A' : 'B'}</span>
      </div>
      <div className="online-room-copy">
        <span>ONLINE 1V1 · {room?.roomId ? room.roomId.slice(0, 13).toUpperCase() : 'CONNECTING'}</span>
        <strong>
          {error ??
            (connection !== 'connected'
              ? '対戦室へ接続中…'
              : !room?.connectedSeats.includes(opponent)
                ? '相手の参加を待っています'
                : ownReady
                  ? opponentReady
                    ? '戦闘結果を同期中'
                    : '編成提出済み · 相手待ち'
                  : opponentReady
                    ? '相手は編成提出済み'
                    : '2人とも育成中')}
        </strong>
      </div>
      {room && (
        <div className="online-room-score" aria-label="オンライン対戦スコア">
          <span>
            YOU <b>{seat === 'b' ? room.score.b : room.score.a}</b>
          </span>
          <i>—</i>
          <span>
            RIVAL <b>{seat === 'b' ? room.score.a : room.score.b}</b>
          </span>
        </div>
      )}
      <div className="online-room-actions">
        <button type="button" onClick={onCopy}>
          {copied ? 'コピー済み' : '招待URL'}
        </button>
        <button type="button" onClick={onLeave}>
          退出
        </button>
      </div>
    </aside>
  );
}

function OnlineFinishedScreen({ room, seat, onLeave }: { room: RoomView; seat: OnlineSeat; onLeave: () => void }) {
  const own = seat === 'a' ? room.score.a : room.score.b;
  const rival = seat === 'a' ? room.score.b : room.score.a;
  const title = own === rival ? '航路は引き分け' : own > rival ? '対戦航路を制覇' : '再検証の記録を保存';
  return (
    <main className="online-finished-screen">
      <section className="online-finished-ledger panel">
        <span className="section-index">ONLINE 1V1 / COMPLETE</span>
        <div className="paired-seals is-finished" aria-hidden="true">
          <span>{seat.toUpperCase()}</span>
          <i />
          <span>{seat === 'a' ? 'B' : 'A'}</span>
        </div>
        <h1>{title}</h1>
        <p>
          {own}勝 — {rival}勝 <small>（引き分け {room.score.draws}）</small>
        </p>
        <dl>
          <div>
            <dt>通常戦</dt>
            <dd>{GAME_DATA.rules.maxCycles}</dd>
          </div>
          <div>
            <dt>サドンデス</dt>
            <dd>{room.suddenDeathRound}</dd>
          </div>
          <div>
            <dt>ROOM</dt>
            <dd>{room.roomId.slice(0, 13)}</dd>
          </div>
        </dl>
        <button type="button" className="launch-button" onClick={onLeave}>
          <span>RETURN TO LEDGER</span>
          航路選択へ戻る
        </button>
      </section>
    </main>
  );
}

function OnlineConnectionScreen({
  roomId,
  connection,
  error,
}: {
  roomId: string;
  connection: OnlineConnectionStatus;
  error?: string;
}) {
  return (
    <main className="online-connection-screen">
      <section className="online-connection-ledger panel">
        <div className="paired-seals" aria-hidden="true">
          <span>?</span>
          <i />
          <span>?</span>
        </div>
        <span className="section-index">ROOM / {roomId.slice(0, 13).toUpperCase()}</span>
        <h1>{error ? '対戦室を確認してください' : '航路を接続しています'}</h1>
        <p>
          {error ??
            (connection === 'disconnected'
              ? '通信が途切れました。自動で再接続しています。'
              : '席と育成seedを受け取り、2人だけの対戦室を準備しています。')}
        </p>
        <div className="connection-pulse" aria-label={connection}>
          <i />
          <i />
          <i />
        </div>
      </section>
    </main>
  );
}

function DraftScreen({ run, onChoose }: { run: CasualRunState; onChoose: (definitionId: string) => void }) {
  const [previewDefinitionId, setPreviewDefinitionId] = useState<string>();
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<string>();
  const [choosingDefinitionId, setChoosingDefinitionId] = useState<string>();
  const chooseTimer = useRef<number | undefined>(undefined);
  const previewMonster = previewDefinitionId
    ? createMonster(GAME_DATA, previewDefinitionId, `draft-prospect-${run.draftRound}`)
    : undefined;

  useEffect(() => {
    setSelectedDefinitionId(undefined);
    setChoosingDefinitionId(undefined);
  }, [run.draftRound]);

  useEffect(
    () => () => {
      if (chooseTimer.current !== undefined) window.clearTimeout(chooseTimer.current);
    },
    [],
  );

  const confirmStarter = (definitionId: string) => {
    if (choosingDefinitionId) return;
    if (selectedDefinitionId !== definitionId) {
      setSelectedDefinitionId(definitionId);
      return;
    }
    setChoosingDefinitionId(definitionId);
    chooseTimer.current = window.setTimeout(() => onChoose(definitionId), 720);
  };

  return (
    <main className={`draft-screen starter-sanctum${choosingDefinitionId ? ' is-bonding' : ''}`}>
      <div className="starter-atmosphere" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => (
          <i style={{ '--spark-index': index } as CSSProperties} key={`starter-spark-${index}`} />
        ))}
      </div>
      <div className="draft-mast">
        <div className="brand-lockup">
          <span>CODE MONSTERS // {run.mode === 'online' ? 'ONLINE 1V1' : 'CASUAL PROTOTYPE'}</span>
          <h1>血統航路</h1>
        </div>
        <div className="bloodline-weave" aria-hidden="true">
          <span>竜</span>
          <span>悪魔</span>
          <span>精霊</span>
        </div>
      </div>
      <section className="draft-copy">
        <div className="starter-copy">
          <span className="section-index">FIRST BOND · ENTRY {run.draftRound}/3</span>
          <h2>{run.draftRound === 1 ? '最初の相棒を選ぼう' : '次の仲間を迎えよう'}</h2>
          <p>気になる子を選んで、もう一度「この子に決める」。能力は決める前にいつでも確認できます。</p>
        </div>
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
      <div className="draft-grid starter-lineup" key={run.draftRound}>
        {run.draftChoices.map((definitionId, index) => {
          const definition = definitionById(GAME_DATA, definitionId);
          const trait = GAME_DATA.traits.find((entry) => entry.id === definition.traitId);
          const selected = selectedDefinitionId === definitionId;
          const choosing = choosingDefinitionId === definitionId;
          return (
            <div
              className={`draft-choice starter-pedestal${selected ? ' is-chosen' : ''}${
                choosing ? ' is-bonding' : ''
              }${choosingDefinitionId && !choosing ? ' is-dismissed' : ''}`}
              key={definitionId}
              style={{ '--draft-index': index } as CSSProperties}
            >
              <span className="starter-choice-number" aria-hidden="true">
                {String.fromCharCode(65 + index)}
              </span>
              <DefinitionCard
                data={GAME_DATA}
                definition={definition}
                eyebrow={`${lineageName(GAME_DATA, definition)} / ${attributeName(GAME_DATA, definition)}`}
                selected={selected}
                onClick={() => !choosingDefinitionId && setSelectedDefinitionId(definitionId)}
                footer={
                  <div className="starter-card-footer">
                    <span>
                      <small>TRAIT</small>
                      {trait?.name}
                    </span>
                    <div className="starter-card-actions">
                      <button
                        type="button"
                        className="starter-detail-action"
                        disabled={Boolean(choosingDefinitionId)}
                        onClick={() => setPreviewDefinitionId(definitionId)}
                      >
                        能力を見る
                      </button>
                      <button
                        type="button"
                        className="starter-confirm-action"
                        data-action-state={selected ? 'confirm' : 'focus'}
                        disabled={Boolean(choosingDefinitionId)}
                        onClick={() => confirmStarter(definitionId)}
                      >
                        {choosing ? '旅の契約中…' : selected ? 'この子に決める' : 'この子を選ぶ'}
                      </button>
                    </div>
                  </div>
                }
              />
              <i className="starter-pedestal-base" aria-hidden="true" />
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
  cardVariant = 'party',
  ariaLabel,
  allowDrag = true,
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
  cardVariant?: 'party' | 'breeding';
  ariaLabel?: string;
  allowDrag?: boolean;
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
    if (!allowDrag) return;
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
    if (!allowDrag) return;
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
    if (!allowDrag) return;
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
      className={`roster-card${cardVariant === 'breeding' ? ' is-breeding-choice' : ''}${
        selected ? ' is-selected' : ''
      }${active ? ' is-active' : ''}${dropTarget ? ' is-drop-target' : ''}`}
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
      aria-label={ariaLabel ?? `${definition.name}、${active ? '主力' : '控え'}。タップで詳細、長押しで移動`}
    >
      <span className="roster-identity">
        <MonsterSigil data={GAME_DATA} definition={definition} colorStars={monster.colorStars} size="small" />
        <strong>{definition.name}</strong>
        <i>
          Lv.{monster.level} {starText(definition.whiteStars, monster.colorStars)}
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
        <span>編成ボード</span>
        <strong>カードを長押しして並べ替え</strong>
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
              <span>＋</span>
              <small>主力を配置</small>
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
              <span>＋</span>
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
  const [previewEquipmentId, setPreviewEquipmentId] = useState<string>();
  const previewMonster = previewDefinitionId
    ? createMonster(GAME_DATA, previewDefinitionId, 'shop-prospect')
    : undefined;
  const previewEquipment = GAME_DATA.equipment.find((entry) => entry.id === previewEquipmentId);
  if (!run.shop) return null;
  return (
    <section className="workshop-view shop-view" aria-label="ショップ">
      <div className="workshop-title">
        <div>
          <span className="section-index">MONSTER EXCHANGE</span>
          <h2>旅商人の棚</h2>
          <small className="shop-luck-readout">
            ⭐2 出現率 {Math.round((GAME_DATA.rules.shop.luckyUpgradeChance + run.shopLuckBonus) * 100)}% · 希少入荷
            {Math.round(GAME_DATA.rules.shop.rareOfferChance * 100)}%
          </small>
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
            ↻ 更新 {run.freeRerolls > 0 ? `FREE ×${run.freeRerolls}` : '1'}
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
          const eyebrow = offer.lucky
            ? '星が多い'
            : definition.shopAvailability === 'rare'
              ? '珍しい旅仲間'
              : attributeName(GAME_DATA, definition);
          return (
            <article
              className="definition-card shop-offer-card"
              style={monsterStyle(GAME_DATA, definition)}
              key={offer.id}
            >
              <button
                type="button"
                className="definition-card-main"
                onClick={() => setPreviewDefinitionId(definition.id)}
                aria-label={`${definition.name}の能力を見る`}
              >
                <span className="shop-offer-attribute">{eyebrow}</span>
                <MonsterSigil data={GAME_DATA} definition={definition} />
                <span className="monster-card-copy">
                  <strong>{definition.name}</strong>
                  <span className="star-row">{starText(definition.whiteStars)}</span>
                  <small>{lineageName(GAME_DATA, definition)}</small>
                </span>
              </button>
              <div className="monster-card-footer shop-card-footer">
                <div className="shop-card-actions">
                  <button
                    type="button"
                    className="buy-button"
                    aria-label={`${definition.name}を${definition.price}コインで迎える`}
                    onClick={() =>
                      onCommand(buyMonster(GAME_DATA, run, offer.id), `${definition.name}が仲間になりました`)
                    }
                  >
                    <span>●</span>
                    <b>{definition.price}</b>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="equipment-shelf">
        <div>
          <span className="section-index">EQUIPMENT</span>
          <h3>装備棚</h3>
          <small className="equipment-rarity-readout">
            C {GAME_DATA.rules.shop.equipmentRarityWeights.common}% · R{' '}
            {GAME_DATA.rules.shop.equipmentRarityWeights.rare}% · E {GAME_DATA.rules.shop.equipmentRarityWeights.epic}%
            · L {GAME_DATA.rules.shop.equipmentRarityWeights.legendary}%
          </small>
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
              <article className={`equipment-offer is-rarity-${equipment.rarity}`} key={offer.id}>
                <button
                  type="button"
                  className="equipment-detail-button"
                  aria-label={`${equipment.name}の詳細を見る`}
                  onClick={() => setPreviewEquipmentId(equipment.id)}
                >
                  <header>
                    <span className="equipment-glyph" aria-hidden="true">
                      {equipment.icon}
                    </span>
                    <small>{RARITY_LABELS[equipment.rarity]} / 装備</small>
                  </header>
                  <span className="equipment-copy">
                    <strong>{equipment.name}</strong>
                    <small>{equipment.description}</small>
                  </span>
                </button>
                <footer>
                  <button
                    type="button"
                    aria-label="購入"
                    onClick={() => onCommand(buyEquipment(GAME_DATA, run, offer.id), `${equipment.name}を購入しました`)}
                  >
                    <span>●</span>
                    <b>{equipment.price}</b>
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
      <EquipmentDetailDialog equipment={previewEquipment} onClose={() => setPreviewEquipmentId(undefined)} />
    </section>
  );
}

function BreedingOutcome({
  child,
  parents,
  skillChoices,
  selectedSkillId,
  onSelectSkill,
}: {
  child: MonsterInstance;
  parents: [MonsterInstance, MonsterInstance];
  skillChoices: string[];
  selectedSkillId: string;
  onSelectSkill: (skillId: string) => void;
}) {
  const [dropActive, setDropActive] = useState(false);
  const definition = definitionFor(GAME_DATA, child);
  const intrinsicSkills = definition.intrinsicSkillIds.flatMap((skillId) => {
    const skill = GAME_DATA.skills.find((entry) => entry.id === skillId);
    return skill ? [skill] : [];
  });
  const selectedSlotSkill = GAME_DATA.skills.find(
    (skill) => skill.id === (selectedSkillId || definition.defaultSkillId),
  );
  const parentSkillBanks = parents.map((parent, parentIndex) => ({
    parent,
    parentIndex,
    definition: definitionFor(GAME_DATA, parent),
    skills: skillIdsFor(GAME_DATA, parent).flatMap((skillId) => {
      const skill = GAME_DATA.skills.find((entry) => entry.id === skillId);
      return skill ? [skill] : [];
    }),
  }));
  const acceptInheritedSkill = (skillId: string) => {
    if (skillChoices.includes(skillId)) onSelectSkill(skillId);
    setDropActive(false);
  };
  return (
    <section className="breeding-outcome" style={monsterStyle(GAME_DATA, definition)}>
      <header className="breeding-outcome-identity">
        <MonsterSigil data={GAME_DATA} definition={definition} colorStars={child.colorStars} size="large" />
        <div>
          <span>BREEDING RESULT / LEVEL 1</span>
          <h3>{definition.name}</h3>
          <p>
            {starText(definition.whiteStars, child.colorStars)} · {lineageName(GAME_DATA, definition)} ×{' '}
            {attributeName(GAME_DATA, definition)}
          </p>
        </div>
      </header>
      <BreedingStatLedger monster={child} />
      <section className="breeding-skill-workbench">
        <header>
          <div>
            <span>誕生後のスキル</span>
            <strong>効果を見て、3つ目のスキルを選ぶ</strong>
          </div>
          <small>固有2枠 + 初期／継承1枠</small>
        </header>
        <div className="breeding-intrinsic-skills">
          {intrinsicSkills.map((skill, index) => (
            <SkillEffectCard skill={skill} badge={`固有${index + 1}`} key={skill.id} />
          ))}
        </div>
        <div className="inheritance-heading">
          <span>親スキルから継承する</span>
          <small>ドラッグして遺伝子カセットへ。タップでも選択できます</small>
        </div>
        <div className="parent-skill-banks">
          {parentSkillBanks.map(({ parent, parentIndex, definition: parentDefinition, skills }) => (
            <section className="parent-skill-bank" key={parent.id}>
              <header>
                <span>親 {parentIndex === 0 ? 'A' : 'B'}</span>
                <strong>{parentDefinition.name}</strong>
              </header>
              <div>
                {skills.map((skill) => {
                  const inheritable = skillChoices.includes(skill.id);
                  return (
                    <SkillEffectCard
                      skill={skill}
                      badge={inheritable ? 'DRAG / TAP' : '固有と重複'}
                      className="inheritance-parent-skill"
                      selected={selectedSkillId === skill.id}
                      draggable={inheritable}
                      disabled={!inheritable}
                      onSelect={() => acceptInheritedSkill(skill.id)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'copy';
                        event.dataTransfer.setData('text/plain', skill.id);
                        event.dataTransfer.setData('application/x-code-monsters-skill', skill.id);
                      }}
                      onDragEnd={() => setDropActive(false)}
                      key={`${parent.id}-${skill.id}`}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <div
          className={`inheritance-drop-slot${dropActive ? ' is-drop-active' : ''}${selectedSkillId ? ' has-inherited' : ''}`}
          data-selected-skill-id={selectedSkillId}
          onDragEnter={(event) => {
            event.preventDefault();
            setDropActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            setDropActive(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            acceptInheritedSkill(
              event.dataTransfer.getData('application/x-code-monsters-skill') ||
                event.dataTransfer.getData('text/plain'),
            );
          }}
          aria-label="継承スキルの遺伝子カセット"
        >
          <span>{selectedSkillId ? 'INHERITED GENE / 継承確定' : 'DEFAULT GENE / 初期スキル'}</span>
          <strong>{selectedSlotSkill?.name ?? 'スキル未選択'}</strong>
          <p>
            {selectedSlotSkill ? effectFactFor(selectedSlotSkill.effects[0] as EffectDefinition) : '親スキルを選択'}
          </p>
          {selectedSkillId ? (
            <button type="button" onClick={() => onSelectSkill('')}>
              初期スキルに戻す
            </button>
          ) : (
            <small>親のスキルをここへドロップ</small>
          )}
        </div>
      </section>
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
  const skills = skillIdsFor(GAME_DATA, child).flatMap((skillId) => {
    const skill = GAME_DATA.skills.find((entry) => entry.id === skillId);
    return skill ? [skill] : [];
  });
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
        <header className="newborn-identity">
          <div className="newborn-sigil">
            <MonsterSigil data={GAME_DATA} definition={definition} colorStars={child.colorStars} size="large" />
          </div>
          <div>
            <span className="section-index">LINEAGE REWRITTEN</span>
            <p>新しい血統が誕生しました</p>
            <h2>{definition.name}</h2>
            <strong>{starText(definition.whiteStars, child.colorStars)} · Lv.1</strong>
          </div>
        </header>
        <div className="breeding-reveal-dossier">
          <BreedingStatLedger monster={child} />
          <section className="breeding-final-skills">
            <header>
              <span>誕生後のスキル構成</span>
              <strong>数値と追加効果を確認</strong>
            </header>
            <div>
              {skills.map((skill, index) => (
                <SkillEffectCard
                  skill={skill}
                  badge={index === 2 && child.inheritedSkillId ? '継承' : index === 2 ? '初期' : `固有${index + 1}`}
                  key={`${skill.id}-${index}`}
                />
              ))}
            </div>
          </section>
        </div>
        <button
          type="button"
          className="primary-button"
          disabled={stage < 2}
          onClick={() => dialogRef.current?.close()}
        >
          ホームへ戻る
        </button>
      </section>
    </dialog>
  );
}

function EggHatchRevealSequence({
  hatches,
  onComplete,
}: {
  hatches: readonly EggHatchResult[];
  onComplete: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState(0);
  const hatch = hatches[index];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || hatches.length === 0) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [hatches.length]);

  useEffect(() => {
    if (!hatch) return;
    setStage(0);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers = reducedMotion
      ? [window.setTimeout(() => setStage(3), 0)]
      : [
          window.setTimeout(() => setStage(1), 260),
          window.setTimeout(() => setStage(2), 1120),
          window.setTimeout(() => setStage(3), 1840),
        ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [hatch?.eggId]);

  if (!hatch) return null;
  const eggDefinition = definitionById(GAME_DATA, hatch.eggDefinitionId);
  const resultDefinition = definitionById(GAME_DATA, hatch.resultDefinitionId);
  const rankUp = hatch.toWhiteStars > hatch.fromWhiteStars;
  const finalHatch = index === hatches.length - 1;
  const continueReveal = () => {
    if (!finalHatch) {
      setIndex((current) => current + 1);
      return;
    }
    dialogRef.current?.close();
    onComplete();
  };
  return (
    <dialog
      ref={dialogRef}
      className={`hatch-reveal-dialog hatch-stage-${stage}${rankUp ? ' is-rank-up' : ''}`}
      onCancel={(event) => event.preventDefault()}
      aria-label={`${resultDefinition.name}の孵化 ${index + 1}/${hatches.length}`}
    >
      <section className="hatch-reveal-stage" style={monsterStyle(GAME_DATA, resultDefinition)}>
        <header className="hatch-reveal-header">
          <div>
            <span>INCUBATION RECORD</span>
            <strong>
              HATCH {String(index + 1).padStart(2, '0')} / {String(hatches.length).padStart(2, '0')}
            </strong>
          </div>
          <b>{rankUp ? 'RANK SIGNAL DETECTED' : `${eggDefinition.name} / READY`}</b>
        </header>
        <div className="hatch-chamber" aria-live="polite">
          <div className="hatch-aura" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="hatch-particles" aria-hidden="true">
            {Array.from({ length: 16 }, (_, particleIndex) => (
              <i key={particleIndex} style={{ '--hatch-particle': particleIndex } as CSSProperties} />
            ))}
          </div>
          <div className="hatch-flash" aria-hidden="true" />
          <div className="egg-shell" aria-hidden="true">
            <span>{eggDefinition.glyph}</span>
            <i />
            <i />
            <i />
          </div>
          <div className="hatched-monster">
            <div className="hatched-sigil">
              <MonsterSigil data={GAME_DATA} definition={resultDefinition} colorStars={0} size="large" />
            </div>
            <span>{rankUp ? 'LUCKY RANK UP' : 'SHELL OPENED'}</span>
            <h2>{resultDefinition.name}</h2>
            <strong>{starText(resultDefinition.whiteStars, 0)}</strong>
          </div>
        </div>
        <footer className="hatch-reveal-result">
          <div>
            <span>WHITE STAR RESULT</span>
            <strong>
              {'★'.repeat(hatch.fromWhiteStars)} <i>→</i> {'★'.repeat(hatch.toWhiteStars)}
            </strong>
            <small>{rankUp ? '50%の昇格を引き当てました' : '卵と同じ白星で孵化しました'}</small>
          </div>
          <button type="button" className="primary-button" disabled={stage < 3} onClick={continueReveal}>
            {finalHatch ? '旅へ戻る' : '次の卵を孵す'}
          </button>
        </footer>
      </section>
    </dialog>
  );
}

function BreedingView({
  open,
  run,
  discoveredMonsterIds,
  parentIds,
  setParentIds,
  onCommand,
  onClose,
}: {
  open: boolean;
  run: CasualRunState;
  discoveredMonsterIds: ReadonlySet<string>;
  parentIds: string[];
  setParentIds: (ids: string[]) => void;
  onCommand: (result: CommandResult<CasualRunState>, successMessage: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
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
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [revealedChild, setRevealedChild] = useState<MonsterInstance>();
  const starUpPartnersByParent = useMemo(() => {
    const partners = new Map<string, Set<string>>();
    for (let firstIndex = 0; firstIndex < run.roster.length; firstIndex += 1) {
      const firstParent = run.roster[firstIndex];
      if (!firstParent) continue;
      for (let secondIndex = firstIndex + 1; secondIndex < run.roster.length; secondIndex += 1) {
        const secondParent = run.roster[secondIndex];
        if (!secondParent) continue;
        const parentWhiteStars = Math.max(
          definitionFor(GAME_DATA, firstParent).whiteStars,
          definitionFor(GAME_DATA, secondParent).whiteStars,
        );
        const hasStarUpRoute = breedingCandidatesForRun(GAME_DATA, run, firstParent.id, secondParent.id).some(
          (entry) => definitionById(GAME_DATA, entry.definitionId).whiteStars > parentWhiteStars,
        );
        if (!hasStarUpRoute) continue;
        const firstPartners = partners.get(firstParent.id) ?? new Set<string>();
        const secondPartners = partners.get(secondParent.id) ?? new Set<string>();
        firstPartners.add(secondParent.id);
        secondPartners.add(firstParent.id);
        partners.set(firstParent.id, firstPartners);
        partners.set(secondParent.id, secondPartners);
      }
    }
    return partners;
  }, [run]);
  const starUpGuideIds = useMemo(() => {
    if (parentIds.length === 0) return new Set(starUpPartnersByParent.keys());
    if (parentIds.length === 1) {
      const firstParentId = parentIds[0] as string;
      const partnerIds = starUpPartnersByParent.get(firstParentId);
      return partnerIds ? new Set([firstParentId, ...partnerIds]) : new Set<string>();
    }
    const firstParentId = parentIds[0] as string;
    const secondParentId = parentIds[1] as string;
    return starUpPartnersByParent.get(firstParentId)?.has(secondParentId)
      ? new Set([firstParentId, secondParentId])
      : new Set<string>();
  }, [parentIds, starUpPartnersByParent]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
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
    <>
      <dialog
        ref={dialogRef}
        className="breeding-lab-dialog"
        onClose={onClose}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        aria-label="配合ラボ"
      >
        <section className="workshop-view breeding-view breeding-lab-panel panel" aria-label="配合">
          <button
            type="button"
            className="dialog-close breeding-lab-close"
            onClick={() => dialogRef.current?.close()}
            aria-label="配合ラボを閉じる"
          >
            ×
          </button>
          <div className="workshop-title breeding-lab-title">
            <div>
              <span className="section-index">LINEAGE LOOM / FULL WORKBENCH</span>
              <h2>血統を編み直す</h2>
              <p>親・誕生個体・継承スキルを同じ机で比較してから配合します。</p>
            </div>
            <button type="button" className="recipe-archive-button" onClick={() => setRecipeArchiveOpen(true)}>
              <span>SPECIAL</span>
              特殊配合図鑑 <b>{GAME_DATA.specialRecipes.length}</b>
            </button>
          </div>
          <div className="breeding-loom">
            <div className="parent-pool">
              <div className="parent-pool-heading">
                <h3>親を2体選択</h3>
                <span aria-live="polite">
                  <b>A</b> {first ? definitionFor(GAME_DATA, first).name : '未選択'}
                  <i>×</i>
                  <b>B</b> {second ? definitionFor(GAME_DATA, second).name : '未選択'}
                </span>
              </div>
              {run.roster.map((monster) => {
                const definition = definitionFor(GAME_DATA, monster);
                const isStarUpGuide = starUpGuideIds.has(monster.id);
                const eligible = monster.level >= GAME_DATA.rules.breeding.minimumLevel;
                const selectedIndex = parentIds.indexOf(monster.id);
                return (
                  <button
                    type="button"
                    key={monster.id}
                    className={`parent-choice${parentIds.includes(monster.id) ? ' is-selected' : ''}${
                      rankUp && parentIds.includes(monster.id) ? ' is-rank-catalyst' : ''
                    }${isStarUpGuide ? ' is-star-up-guide' : ''}`}
                    data-star-up-guide={isStarUpGuide ? 'true' : undefined}
                    disabled={!eligible}
                    onClick={() => toggleParent(monster.id)}
                    style={monsterStyle(GAME_DATA, definition)}
                  >
                    {selectedIndex >= 0 && (
                      <span className="parent-selection-order" aria-hidden="true">
                        ✓ {selectedIndex === 0 ? 'A' : 'B'}
                      </span>
                    )}
                    <MonsterSigil
                      data={GAME_DATA}
                      definition={definition}
                      colorStars={monster.colorStars}
                      size="small"
                    />
                    <span>
                      <strong>{definition.name}</strong>
                      <small>
                        <span>
                          Lv.{monster.level} · {starText(definition.whiteStars, monster.colorStars)}
                        </span>
                        {isStarUpGuide && <span className="parent-star-up-badge">★ 星UP</span>}
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
              <div className="candidate-pool-heading">
                <h3>誕生する子を選択</h3>
                <span>{candidates.length > 0 ? `${candidates.length}体を比較` : '親の選択待ち'}</span>
              </div>
              <div
                className="candidate-grid"
                style={{ '--candidate-count': Math.max(1, candidates.length) } as CSSProperties}
              >
                {candidates.length === 0 && (
                  <div className="loom-placeholder">
                    <span>?</span>
                    <p>レベル3以上の親を2体選ぶと、系統×属性×実効星から候補を算出します。</p>
                  </div>
                )}
                {candidates.map((entry) => {
                  const definition = definitionById(GAME_DATA, entry.definitionId);
                  const optionChild =
                    first && second
                      ? breedMonsters(GAME_DATA, first, second, entry, undefined, `breeding-option-${entry.id}`)
                      : undefined;
                  return (
                    <div className="breeding-candidate" key={entry.id}>
                      {optionChild && (
                        <RosterCard
                          monster={optionChild}
                          active={false}
                          selected={candidateId === entry.id}
                          cardVariant="breeding"
                          ariaLabel={`${definition.name}を誕生候補に選ぶ。${entry.label}`}
                          allowDrag={false}
                          zone="bench"
                          slotIndex={0}
                          dropTarget={false}
                          onSelect={() => setCandidateId(entry.id)}
                          onDragStart={() => undefined}
                          onDragMove={() => undefined}
                          onDragEnd={() => undefined}
                        />
                      )}
                      <span
                        className={`breeding-candidate-kind is-${entry.kind}${
                          candidateId === entry.id ? ' is-selected' : ''
                        }`}
                      >
                        {candidateId === entry.id
                          ? '✓ 選択中'
                          : entry.kind === 'special'
                            ? '特殊配合'
                            : entry.kind === 'same-name'
                              ? '色星強化'
                              : '位階配合'}
                      </span>
                    </div>
                  );
                })}
              </div>
              {candidate && previewChild && previewDefinition && first && second && (
                <div className="inheritance-control">
                  {rankUp && (
                    <div className="rank-up-signal" aria-live="polite">
                      <span>RANK UP ROUTE</span>
                      <b>
                        {starText(parentWhiteStars)} → {starText(previewDefinition.whiteStars)}
                      </b>
                      <small>選んだ2体の実効星が、次の位階へ届いています</small>
                    </div>
                  )}
                  <BreedingOutcome
                    child={previewChild}
                    parents={[first, second]}
                    skillChoices={skillChoices}
                    selectedSkillId={skillId}
                    onSelectSkill={setSkillId}
                  />
                  <button type="button" className="primary-button" onClick={() => setConfirmationOpen(true)}>
                    配合内容を確認 <span>両親を消費</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </dialog>
      <RecipeArchiveDialog
        open={recipeArchiveOpen}
        discoveredMonsterIds={discoveredMonsterIds}
        onClose={() => setRecipeArchiveOpen(false)}
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
          setRevealedChild(undefined);
          onClose();
        }}
      />
    </>
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
        {CONDITION_GROUPS.map((group) => (
          <optgroup label={group.label} key={group.label}>
            {group.kinds.map((kind) => (
              <option key={kind} value={kind}>
                {CONDITION_LABELS[kind]}
              </option>
            ))}
          </optgroup>
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
      {(condition.kind === 'living-count-at-most' || condition.kind === 'living-count-at-least') && (
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
            onChange={(event) => onChange({ ...condition, count: Number(event.target.value) as 1 | 2 | 3 })}
          >
            <option value={1}>1体</option>
            <option value={2}>2体</option>
            <option value={3}>3体</option>
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
  const changeRule = (index: number, rule: GambitRule) => onChange(updateGambit(run, monster.id, index, rule));
  const addRule = () => {
    const skillId = skillIdsFor(GAME_DATA, monster)[0] ?? 'normal-attack';
    const skill = GAME_DATA.skills.find((entry) => entry.id === skillId);
    const targets = targetRulesForSkill(GAME_DATA, skillId);
    onChange(
      addGambit(
        run,
        monster.id,
        {
          condition: skill && skill.mpCost > 0 ? { kind: 'self-mp-above', threshold: 25 } : { kind: 'always' },
          action: { skillId, target: targets[0] ?? 'random-enemy' },
        },
        Math.max(0, monster.gambits.length - 1),
      ),
    );
  };
  const remainingAdds = MAX_GAMBIT_RULES - monster.gambits.length;
  return (
    <section className="tactics-view" aria-label={`${definition.name}のガンビット`}>
      <div className="gambit-guide">
        <div>
          <span>GAMBIT ORDER</span>
          <b>
            {monster.gambits.length} / {MAX_GAMBIT_RULES} 条件
          </b>
          <p>上から判定し、最初に成立した行動を実行します。</p>
        </div>
        <button type="button" onClick={addRule} disabled={remainingAdds === 0}>
          <span aria-hidden="true">＋</span>
          条件を追加
          <small>{remainingAdds > 0 ? `あと${remainingAdds}つ` : '上限'}</small>
        </button>
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
              <header className="gambit-row-header">
                <span className="priority-number">
                  <small>PRIORITY</small>
                  <b>{String(index + 1).padStart(2, '0')}</b>
                </span>
                <div className="gambit-order-controls">
                  <button
                    type="button"
                    aria-label={`条件${index + 1}を上へ`}
                    title="上へ移動"
                    onClick={() => onChange(moveGambit(run, monster.id, index, index - 1))}
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`条件${index + 1}を下へ`}
                    title="下へ移動"
                    onClick={() => onChange(moveGambit(run, monster.id, index, index + 1))}
                    disabled={index === monster.gambits.length - 1}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="is-remove"
                    aria-label={`条件${index + 1}を削除`}
                    title="削除"
                    onClick={() => onChange(removeGambit(run, monster.id, index))}
                    disabled={monster.gambits.length <= MIN_GAMBIT_RULES}
                  >
                    ×
                  </button>
                </div>
              </header>
              <div className="gambit-rule-grid">
                <section className="gambit-rule-part is-condition">
                  <label>IF / 条件</label>
                  <ConditionEditor
                    condition={rule.condition}
                    onChange={(condition) => changeRule(index, { ...rule, condition })}
                  />
                </section>
                <span className="gambit-arrow" aria-hidden="true">
                  →
                </span>
                <section className="gambit-rule-part is-action">
                  <label>THEN / 行動</label>
                  <div className="action-editor">
                    <select
                      aria-label="スキル"
                      value={rule.action.skillId}
                      onChange={(event) => {
                        const skillId = event.target.value;
                        const validTargets = targetRulesForSkill(GAME_DATA, skillId);
                        changeRule(index, {
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
                        changeRule(index, {
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
                    {skillSummaryText(selectedSkill)}
                  </p>
                </section>
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
  focused = false,
  slot,
}: {
  definition: MonsterDefinition;
  colorStars?: ColorStars;
  label: string;
  locked?: boolean;
  focused?: boolean;
  slot: 'parent' | 'result';
}) {
  return (
    <div
      className={`recipe-token${locked ? ' is-locked' : ''}${focused ? ' is-focused' : ''}`}
      style={monsterStyle(GAME_DATA, definition)}
      data-recipe-slot={slot}
      data-recipe-focus={focused || undefined}
      aria-label={locked ? `${label}は未解放` : `${label}: ${definition.name}`}
    >
      <MonsterSigil data={GAME_DATA} definition={definition} colorStars={colorStars} size="small" obscured={locked} />
      <span>
        <small>{label}</small>
        <strong>{locked ? '???' : definition.name}</strong>
        <i>{locked ? '未解放' : starText(definition.whiteStars, colorStars)}</i>
      </span>
    </div>
  );
}

function SpecialRecipeCard({
  recipeId,
  discoveredMonsterIds,
  focusedDefinitionId,
}: {
  recipeId: string;
  discoveredMonsterIds: ReadonlySet<string>;
  focusedDefinitionId?: string;
}) {
  const recipeIndex = GAME_DATA.specialRecipes.findIndex((recipe) => recipe.id === recipeId);
  const recipe = GAME_DATA.specialRecipes[recipeIndex];
  if (!recipe) return null;
  const parents = [
    definitionById(GAME_DATA, recipe.parentDefinitionIds[0]),
    definitionById(GAME_DATA, recipe.parentDefinitionIds[1]),
  ] as const;
  const result = definitionById(GAME_DATA, recipe.resultDefinitionId);
  const discoveredCount = [...parents, result].filter((definition) => discoveredMonsterIds.has(definition.id)).length;
  return (
    <article className="recipe-card is-special" data-recipe-id={recipe.id}>
      <span className="recipe-kind is-special">SPECIAL #{String(recipeIndex + 1).padStart(2, '0')}</span>
      <span className={`recipe-state${discoveredCount === 3 ? ' is-unlocked' : ''}`}>{discoveredCount}/3 記録</span>
      <div className="recipe-equation">
        <RecipeToken
          definition={parents[0]}
          label="親 A"
          locked={!discoveredMonsterIds.has(parents[0].id)}
          focused={focusedDefinitionId === parents[0].id}
          slot="parent"
        />
        <b>＋</b>
        <RecipeToken
          definition={parents[1]}
          label="親 B"
          locked={!discoveredMonsterIds.has(parents[1].id)}
          focused={focusedDefinitionId === parents[1].id}
          slot="parent"
        />
        <b>＝</b>
        <RecipeToken
          definition={result}
          label="特殊種"
          locked={!discoveredMonsterIds.has(result.id)}
          focused={focusedDefinitionId === result.id}
          slot="result"
        />
      </div>
    </article>
  );
}

function MonsterRecipeView({
  definitionId,
  discoveredMonsterIds,
}: {
  definitionId: string;
  discoveredMonsterIds: ReadonlySet<string>;
}) {
  const relations = specialRecipeRelationsFor(GAME_DATA, definitionId);
  const definitionKnown = discoveredMonsterIds.has(definitionId);
  const relationSections = [
    {
      id: 'created-by',
      label: 'この種を作る',
      note: '誕生に必要な特殊配合',
      recipes: relations.createdBy,
    },
    {
      id: 'used-by',
      label: 'この種を使う',
      note: '親としてつながる特殊配合',
      recipes: relations.usedBy,
    },
  ] as const;
  return (
    <section className="monster-recipe-view" aria-label="このモンスターに関わる特殊配合">
      <header className="monster-recipe-heading">
        <span>LINEAGE CROSS-REFERENCE</span>
        <p>
          {definitionKnown
            ? '記録済みの種だけ名称を表示します。未入手種は輪郭から探索できます。'
            : 'この標本を含め、未入手の種は輪郭だけを記録しています。'}
        </p>
      </header>
      <div className="monster-recipe-relations">
        {relationSections.map((section) => (
          <section
            className={`monster-recipe-relation is-${section.id}`}
            data-recipe-relation={section.id}
            key={section.id}
          >
            <header>
              <div>
                <span>{section.id === 'created-by' ? 'ORIGIN' : 'DESCENDANTS'}</span>
                <h3>{section.label}</h3>
                <p>{section.note}</p>
              </div>
              <b>{String(section.recipes.length).padStart(2, '0')}</b>
            </header>
            {section.recipes.length > 0 ? (
              <div className="monster-recipe-list">
                {section.recipes.map((recipe) => (
                  <SpecialRecipeCard
                    recipeId={recipe.id}
                    discoveredMonsterIds={discoveredMonsterIds}
                    focusedDefinitionId={definitionId}
                    key={recipe.id}
                  />
                ))}
              </div>
            ) : (
              <div className="monster-recipe-empty">
                <span>NO SPECIAL ROUTE</span>
                <p>
                  {section.id === 'created-by'
                    ? 'このモンスターを作る特殊配合はありません。'
                    : 'このモンスターを親として使う特殊配合はありません。'}
                </p>
              </div>
            )}
          </section>
        ))}
      </div>
    </section>
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
        {GAME_DATA.specialRecipes.map((recipe) => (
          <SpecialRecipeCard recipeId={recipe.id} discoveredMonsterIds={discoveredMonsterIds} key={recipe.id} />
        ))}
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

type CatalogFilter = 'all' | LineageId;

function MonsterCatalogCard({
  entry,
  selected,
  onSelect,
}: {
  entry: MonsterCatalogEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const definition = definitionById(GAME_DATA, entry.id);
  const unlocked = entry.state === 'unlocked' && entry.details;
  const recordNumber = String(entry.index).padStart(2, '0');
  return (
    <button
      type="button"
      className={`catalog-card is-${entry.state}${selected ? ' is-selected' : ''}`}
      style={monsterStyle(GAME_DATA, definition)}
      data-catalog-id={entry.id}
      data-catalog-state={entry.state}
      onClick={onSelect}
      aria-label={unlocked ? `図鑑 No.${recordNumber} ${unlocked.name}` : `図鑑 No.${recordNumber} 未確認標本`}
      aria-pressed={selected}
    >
      <span className="catalog-card-number">NO.{recordNumber}</span>
      <MonsterSigil data={GAME_DATA} definition={definition} size="small" obscured={!unlocked} />
      <span className="catalog-card-copy">
        <strong>{unlocked ? unlocked.name : '未確認標本'}</strong>
        <small>{unlocked ? starText(unlocked.whiteStars) : '記録なし'}</small>
      </span>
      <i>{unlocked ? '記録済み' : '未解放'}</i>
    </button>
  );
}

function MonsterCatalogProfile({ entry }: { entry: MonsterCatalogEntry }) {
  const definition = definitionById(GAME_DATA, entry.id);
  const recordNumber = String(entry.index).padStart(2, '0');
  if (!entry.details) {
    return (
      <div className="catalog-profile is-locked">
        <div className="catalog-locked-sigil" aria-hidden="true">
          <MonsterSigil data={GAME_DATA} definition={definition} size="large" obscured />
          <span>?</span>
        </div>
        <span className="section-index">FIELD RECORD NO.{recordNumber}</span>
        <h3>未確認標本</h3>
        <p>旅の仲間として迎えると、名前・能力・特性・スキルの記録が開きます。</p>
        <small>シルエット以外の生態情報は未解放です。</small>
      </div>
    );
  }

  const trait = GAME_DATA.traits.find((entry) => entry.id === definition.traitId);
  const skills = [...definition.intrinsicSkillIds, definition.defaultSkillId]
    .map((skillId) => GAME_DATA.skills.find((skill) => skill.id === skillId))
    .filter((skill): skill is SkillDefinition => Boolean(skill));
  return (
    <div className="catalog-profile is-unlocked">
      <header className="catalog-detail-identity">
        <MonsterSigil data={GAME_DATA} definition={definition} size="large" />
        <div>
          <span className="section-index">FIELD RECORD NO.{recordNumber} / CONFIRMED</span>
          <h3>{definition.name}</h3>
          <p>
            {lineageName(GAME_DATA, definition)} × {attributeName(GAME_DATA, definition)} ·{' '}
            {starText(definition.whiteStars)}
          </p>
        </div>
      </header>
      <div className="stat-grid-heading">
        <span>LEVEL 1 PARAMETERS</span>
        <small>基礎値 / 能力別の図鑑基準</small>
      </div>
      <StatBarChart
        values={
          Object.fromEntries(
            STAT_LABELS.map(([id]) => [
              id,
              {
                base: definition.baseStats[id],
                growth: 0,
                individual: 0,
                equipment: 0,
                total: definition.baseStats[id],
                capped: false,
              },
            ]),
          ) as Record<StatId, StatChartValue>
        }
        ariaLabel={`${definition.name}のレベル1基礎能力`}
      />
      <GrowthProfilePanel definition={definition} />
      <CombatIdentityPanel definition={definition} />
      <section className="catalog-trait">
        <span>TRAIT / 色星0</span>
        <strong>{trait?.name ?? '特性なし'}</strong>
        <p>{trait?.stages[0].description ?? '記録なし'}</p>
      </section>
      <section className="catalog-skills">
        <span>SKILLS / 固有2 + 基本継承1</span>
        <div>
          {skills.map((skill, index) => (
            <SkillEffectCard key={skill.id} skill={skill} badge={index < 2 ? `固有 ${index + 1}` : '基本継承'} />
          ))}
        </div>
      </section>
    </div>
  );
}

function MonsterCatalogDetail({
  entry,
  discoveredMonsterIds,
}: {
  entry: MonsterCatalogEntry;
  discoveredMonsterIds: ReadonlySet<string>;
}) {
  const [tab, setTab] = useState<CatalogDetailTab>('profile');
  const definition = definitionById(GAME_DATA, entry.id);
  useEffect(() => setTab('profile'), [entry.id]);
  return (
    <section
      className={`catalog-detail is-${entry.state}`}
      style={monsterStyle(GAME_DATA, definition)}
      data-catalog-detail-state={entry.state}
    >
      <nav className="inspector-tabs catalog-detail-tabs" aria-label="図鑑詳細メニュー">
        <button type="button" className={tab === 'profile' ? 'is-active' : ''} onClick={() => setTab('profile')}>
          生態記録
        </button>
        <button type="button" className={tab === 'recipes' ? 'is-active' : ''} onClick={() => setTab('recipes')}>
          特殊配合
        </button>
      </nav>
      <div className="catalog-detail-tab-panel">
        {tab === 'profile' ? (
          <MonsterCatalogProfile entry={entry} />
        ) : (
          <MonsterRecipeView definitionId={entry.id} discoveredMonsterIds={discoveredMonsterIds} />
        )}
      </div>
    </section>
  );
}

function CatalogLockedProfile({
  recordNumber,
  noun,
  description,
}: {
  recordNumber: string;
  noun: string;
  description: string;
}) {
  return (
    <div className="catalog-profile is-locked">
      <div className="catalog-locked-mark" aria-hidden="true">
        ?
      </div>
      <span className="section-index">FIELD RECORD NO.{recordNumber}</span>
      <h3>未確認{noun}</h3>
      <p>{description}</p>
      <small>記録を獲得するまで詳細情報は伏せられています。</small>
    </div>
  );
}

function SkillCatalogCard({
  entry,
  selected,
  onSelect,
}: {
  entry: SkillCatalogEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const recordNumber = String(entry.index).padStart(2, '0');
  return (
    <button
      type="button"
      className={`catalog-card catalog-text-card is-${entry.state}${selected ? ' is-selected' : ''}`}
      data-skill-catalog-id={entry.id}
      onClick={onSelect}
      aria-label={
        entry.details ? `スキル図鑑 No.${recordNumber} ${entry.details.name}` : `スキル図鑑 No.${recordNumber} 未確認`
      }
      aria-pressed={selected}
    >
      <span className="catalog-card-number">SKILL NO.{recordNumber}</span>
      <span className="catalog-record-glyph">{entry.details ? '技' : '?'}</span>
      <span className="catalog-card-copy">
        <strong>{entry.details?.name ?? '未確認スキル'}</strong>
        <small>
          {entry.details ? `${RARITY_LABELS[entry.details.rarity]} · MP ${entry.details.mpCost}` : '記録なし'}
        </small>
      </span>
      <i>{entry.details ? '記録済み' : '未解放'}</i>
    </button>
  );
}

function SkillHolderCard({
  definition,
  slot,
  discovered,
}: {
  definition: MonsterDefinition;
  slot: '固有' | '基本継承';
  discovered: boolean;
}) {
  return (
    <div className={`catalog-holder${discovered ? '' : ' is-locked'}`} style={monsterStyle(GAME_DATA, definition)}>
      <MonsterSigil data={GAME_DATA} definition={definition} size="small" obscured={!discovered} />
      <span>
        <strong>{discovered ? definition.name : '???'}</strong>
        <small>
          {slot} · {discovered ? starText(definition.whiteStars) : '未発見'}
        </small>
      </span>
    </div>
  );
}

function SkillCatalogDetail({
  entry,
  discoveredMonsterIds,
  revealAll,
}: {
  entry: SkillCatalogEntry;
  discoveredMonsterIds: ReadonlySet<string>;
  revealAll: boolean;
}) {
  const recordNumber = String(entry.index).padStart(2, '0');
  if (!entry.details) {
    return (
      <section className="catalog-detail is-locked">
        <CatalogLockedProfile
          recordNumber={recordNumber}
          noun="スキル"
          description="仲間が実際に所持すると、効果と所持モンスターの記録が開きます。"
        />
      </section>
    );
  }
  const relations = skillHolderRelationsFor(GAME_DATA, entry.id);
  return (
    <section className="catalog-detail catalog-skill-detail">
      <div className="catalog-detail-tab-panel">
        <header className="catalog-text-identity">
          <span className="catalog-record-glyph">技</span>
          <div>
            <span className="section-index">SKILL RECORD NO.{recordNumber} / CONFIRMED</span>
            <h3>{entry.details.name}</h3>
            <p>
              {RARITY_LABELS[entry.details.rarity]} · 消費MP {entry.details.mpCost}
            </p>
          </div>
        </header>
        <SkillEffectCard skill={entry.details} badge="図鑑記録" />
        <section className="catalog-holders">
          <header>
            <span>HOLDERS / 基本所持モンスター</span>
            <strong>{relations.intrinsic.length + relations.default.length}種</strong>
          </header>
          <div>
            {relations.intrinsic.map((definition) => (
              <SkillHolderCard
                key={`intrinsic-${definition.id}`}
                definition={definition}
                slot="固有"
                discovered={revealAll || discoveredMonsterIds.has(definition.id)}
              />
            ))}
            {relations.default.map((definition) => (
              <SkillHolderCard
                key={`default-${definition.id}`}
                definition={definition}
                slot="基本継承"
                discovered={revealAll || discoveredMonsterIds.has(definition.id)}
              />
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function EventCatalogCard({
  entry,
  selected,
  onSelect,
}: {
  entry: EventCatalogEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const recordNumber = String(entry.index).padStart(2, '0');
  return (
    <button
      type="button"
      className={`catalog-card catalog-text-card is-${entry.state}${selected ? ' is-selected' : ''}`}
      data-event-catalog-id={entry.id}
      onClick={onSelect}
      aria-label={
        entry.details
          ? `イベント図鑑 No.${recordNumber} ${entry.details.name}`
          : `イベント図鑑 No.${recordNumber} 未確認`
      }
      aria-pressed={selected}
    >
      <span className="catalog-card-number">EVENT NO.{recordNumber}</span>
      <span className="catalog-record-glyph">{entry.details?.glyph ?? '?'}</span>
      <span className="catalog-card-copy">
        <strong>{entry.details?.name ?? '未確認イベント'}</strong>
        <small>{entry.details ? '旅路記録' : '記録なし'}</small>
      </span>
      <i>{entry.details ? '体験済み' : '未解放'}</i>
    </button>
  );
}

function EventCatalogDetail({ entry }: { entry: EventCatalogEntry }) {
  const recordNumber = String(entry.index).padStart(2, '0');
  if (!entry.details) {
    return (
      <section className="catalog-detail is-locked">
        <CatalogLockedProfile
          recordNumber={recordNumber}
          noun="イベント"
          description="旅路でこのイベントを選び、結果を確認すると記録が開きます。"
        />
      </section>
    );
  }
  return (
    <section className="catalog-detail catalog-event-detail">
      <div className="catalog-detail-tab-panel">
        <header className="catalog-text-identity">
          <span className="catalog-record-glyph">{entry.details.glyph}</span>
          <div>
            <span className="section-index">EVENT RECORD NO.{recordNumber} / EXPERIENCED</span>
            <h3>{entry.details.name}</h3>
            <p>すべてのイベントは同じ重みで候補に選ばれます。</p>
          </div>
        </header>
        <section className="catalog-event-copy">
          <span>ROUTE EFFECT</span>
          <p>{entry.details.description}</p>
        </section>
      </div>
    </section>
  );
}

function CatalogRecordDialog({
  open,
  label,
  style,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  style?: CSSProperties;
  onClose: () => void;
  children: ReactNode;
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
      className="catalog-record-dialog"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      aria-label={label}
    >
      <section className="catalog-record-panel panel" style={style}>
        <button type="button" className="dialog-close" onClick={() => dialogRef.current?.close()} aria-label="閉じる">
          ×
        </button>
        {children}
      </section>
    </dialog>
  );
}

function FieldCatalogDialog({
  open,
  discoveredMonsterIds,
  discoveredSkillIds,
  discoveredEventIds,
  developerMode,
  onClose,
}: {
  open: boolean;
  discoveredMonsterIds: ReadonlySet<string>;
  discoveredSkillIds: ReadonlySet<string>;
  discoveredEventIds: ReadonlySet<string>;
  developerMode: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [section, setSection] = useState<CatalogSection>('monsters');
  const [filter, setFilter] = useState<CatalogFilter>('all');
  const [selectedMonsterId, setSelectedMonsterId] = useState<string>();
  const [selectedSkillId, setSelectedSkillId] = useState<string>();
  const [selectedEventId, setSelectedEventId] = useState<string>();
  const monsterEntries = monsterCatalogEntries(GAME_DATA, discoveredMonsterIds, developerMode);
  const skillEntries = skillCatalogEntries(GAME_DATA, discoveredSkillIds, developerMode);
  const eventEntries = eventCatalogEntries(GAME_DATA, discoveredEventIds, developerMode);
  const filteredEntries =
    filter === 'all' ? monsterEntries : monsterEntries.filter((entry) => entry.silhouette.lineageId === filter);
  const selectedMonsterEntry = filteredEntries.find((entry) => entry.id === selectedMonsterId);
  const selectedSkillEntry = skillEntries.find((entry) => entry.id === selectedSkillId);
  const selectedEventEntry = eventEntries.find((entry) => entry.id === selectedEventId);
  const sectionMeta = {
    monsters: {
      title: 'モンスター図鑑',
      description: '仲間にした種だけ、生態記録と戦闘能力を閲覧できます。',
      discovered: developerMode ? CATALOG_MONSTER_COUNT : discoveredMonsterIds.size,
      total: CATALOG_MONSTER_COUNT,
    },
    skills: {
      title: 'スキル図鑑',
      description: '仲間が実際に所持したスキルの効果と、基本所持モンスターを記録します。',
      discovered: developerMode ? CATALOG_SKILL_COUNT : discoveredSkillIds.size,
      total: CATALOG_SKILL_COUNT,
    },
    events: {
      title: 'イベント図鑑',
      description: '旅路で選び、結果を確認したイベントを記録します。',
      discovered: developerMode ? CATALOG_EVENT_COUNT : discoveredEventIds.size,
      total: CATALOG_EVENT_COUNT,
    },
  }[section];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <dialog
        ref={dialogRef}
        className="catalog-dialog"
        onClose={onClose}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        aria-label={sectionMeta.title}
      >
        <section className="catalog-archive panel">
          <button type="button" className="dialog-close" onClick={() => dialogRef.current?.close()} aria-label="閉じる">
            ×
          </button>
          <header className="catalog-archive-heading">
            <div>
              <span>CODE MONSTERS // FIELD ARCHIVE</span>
              <h2>{sectionMeta.title}</h2>
              <p>{developerMode ? `DEV OVERRIDE：全${sectionMeta.total}件を一時表示中。` : sectionMeta.description}</p>
            </div>
            <div className="catalog-progress" aria-label={`${sectionMeta.total}件中${sectionMeta.discovered}件発見`}>
              <small>{developerMode ? 'DEV VIEW' : 'RECORDED'}</small>
              <strong>
                {String(sectionMeta.discovered).padStart(2, '0')}
                <i>/</i>
                {sectionMeta.total}
              </strong>
              <span
                style={
                  {
                    '--catalog-progress': `${(sectionMeta.discovered / sectionMeta.total) * 100}%`,
                  } as CSSProperties
                }
              />
            </div>
          </header>
          <nav className="catalog-section-tabs" aria-label="図鑑の種類">
            <button
              type="button"
              className={section === 'monsters' ? 'is-active' : ''}
              onClick={() => {
                setSection('monsters');
                setSelectedSkillId(undefined);
                setSelectedEventId(undefined);
              }}
            >
              モンスター <b>{developerMode ? CATALOG_MONSTER_COUNT : discoveredMonsterIds.size}</b>
            </button>
            <button
              type="button"
              className={section === 'skills' ? 'is-active' : ''}
              onClick={() => {
                setSection('skills');
                setSelectedMonsterId(undefined);
                setSelectedEventId(undefined);
              }}
            >
              スキル <b>{developerMode ? CATALOG_SKILL_COUNT : discoveredSkillIds.size}</b>
            </button>
            <button
              type="button"
              className={section === 'events' ? 'is-active' : ''}
              onClick={() => {
                setSection('events');
                setSelectedMonsterId(undefined);
                setSelectedSkillId(undefined);
              }}
            >
              イベント <b>{developerMode ? CATALOG_EVENT_COUNT : discoveredEventIds.size}</b>
            </button>
          </nav>
          {section === 'monsters' && (
            <>
              <nav className="catalog-filters" aria-label="図鑑の系統絞り込み">
                <button
                  type="button"
                  className={filter === 'all' ? 'is-active' : ''}
                  aria-pressed={filter === 'all'}
                  onClick={() => {
                    setFilter('all');
                    setSelectedMonsterId(undefined);
                  }}
                >
                  すべて <b>{CATALOG_MONSTER_COUNT}</b>
                </button>
                {GAME_DATA.lineages.map((lineage) => (
                  <button
                    type="button"
                    key={lineage.id}
                    className={filter === lineage.id ? 'is-active' : ''}
                    aria-pressed={filter === lineage.id}
                    onClick={() => {
                      setFilter(lineage.id);
                      setSelectedMonsterId(undefined);
                    }}
                  >
                    {lineage.mark} {lineage.name}{' '}
                    <b>{monsterEntries.filter((entry) => entry.silhouette.lineageId === lineage.id).length}</b>
                  </button>
                ))}
              </nav>
              <div className="catalog-body is-index-only">
                <div className="catalog-index" aria-label="モンスター標本一覧">
                  {filteredEntries.map((entry) => (
                    <MonsterCatalogCard
                      key={entry.id}
                      entry={entry}
                      selected={selectedMonsterEntry?.id === entry.id}
                      onSelect={() => setSelectedMonsterId(entry.id)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
          {section === 'skills' && (
            <>
              <div className="catalog-context-bar">
                所持した時点で解放 · カードを選ぶと詳細を表示 · 未発見の所持者は伏せて表示
              </div>
              <div className="catalog-body is-index-only">
                <div className="catalog-index catalog-text-index" aria-label="スキル記録一覧">
                  {skillEntries.map((entry) => (
                    <SkillCatalogCard
                      key={entry.id}
                      entry={entry}
                      selected={selectedSkillEntry?.id === entry.id}
                      onSelect={() => setSelectedSkillId(entry.id)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
          {section === 'events' && (
            <>
              <div className="catalog-context-bar">
                選択して結果を確認した時点で解放 · カードを選ぶと詳細を表示 · 全候補同率
              </div>
              <div className="catalog-body is-index-only">
                <div className="catalog-index catalog-text-index" aria-label="イベント記録一覧">
                  {eventEntries.map((entry) => (
                    <EventCatalogCard
                      key={entry.id}
                      entry={entry}
                      selected={selectedEventEntry?.id === entry.id}
                      onSelect={() => setSelectedEventId(entry.id)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </dialog>
      <CatalogRecordDialog
        open={Boolean(selectedMonsterEntry)}
        label={
          selectedMonsterEntry ? `${definitionById(GAME_DATA, selectedMonsterEntry.id).name}の図鑑詳細` : '図鑑詳細'
        }
        style={
          selectedMonsterEntry ? monsterStyle(GAME_DATA, definitionById(GAME_DATA, selectedMonsterEntry.id)) : undefined
        }
        onClose={() => setSelectedMonsterId(undefined)}
      >
        {selectedMonsterEntry && (
          <MonsterCatalogDetail
            key={selectedMonsterEntry.id}
            entry={selectedMonsterEntry}
            discoveredMonsterIds={
              developerMode ? new Set(GAME_DATA.monsters.map((monster) => monster.id)) : discoveredMonsterIds
            }
          />
        )}
      </CatalogRecordDialog>
      <CatalogRecordDialog
        open={Boolean(selectedSkillEntry)}
        label={selectedSkillEntry?.details ? `${selectedSkillEntry.details.name}の図鑑詳細` : '未確認スキルの図鑑詳細'}
        onClose={() => setSelectedSkillId(undefined)}
      >
        {selectedSkillEntry && (
          <SkillCatalogDetail
            key={selectedSkillEntry.id}
            entry={selectedSkillEntry}
            discoveredMonsterIds={discoveredMonsterIds}
            revealAll={developerMode}
          />
        )}
      </CatalogRecordDialog>
      <CatalogRecordDialog
        open={Boolean(selectedEventEntry)}
        label={
          selectedEventEntry?.details ? `${selectedEventEntry.details.name}の図鑑詳細` : '未確認イベントの図鑑詳細'
        }
        onClose={() => setSelectedEventId(undefined)}
      >
        {selectedEventEntry && <EventCatalogDetail key={selectedEventEntry.id} entry={selectedEventEntry} />}
      </CatalogRecordDialog>
    </>
  );
}

function Inspector({
  run,
  monster,
  discoveredMonsterIds,
  onCommand,
  onChange,
  onClose,
}: {
  run: CasualRunState;
  monster?: MonsterInstance;
  discoveredMonsterIds: ReadonlySet<string>;
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
  const farewell = farewellCoinBreakdownFor(GAME_DATA, monster);
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
          <button type="button" className={tab === 'recipes' ? 'is-active' : ''} onClick={() => setTab('recipes')}>
            特殊配合
          </button>
        </nav>
        <div className="inspector-tab-panel">
          {tab === 'profile' && (
            <div className="profile-panel">
              <MonsterDetailCard monster={monster} showExperience />
              <section className="equipment-block">
                <span>EQUIPMENT CARDS</span>
                <article className={`equipped-row equipment-card${equipped ? '' : ' is-empty'}`}>
                  <b aria-hidden="true">{equipped?.icon ?? '—'}</b>
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
                          <b aria-hidden="true">{equipment.icon}</b>
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
                  onClick={() =>
                    onCommand(
                      sellMonster(GAME_DATA, run, monster.id),
                      `${definition.name}と別れ、${farewell.total}コインを受け取りました`,
                    )
                  }
                >
                  別れる +{farewell.total}
                </button>
              </div>
            </div>
          )}
          {tab === 'gambit' && <TacticsView run={run} monster={monster} onChange={onChange} />}
          {tab === 'recipes' && (
            <MonsterRecipeView definitionId={definition.id} discoveredMonsterIds={discoveredMonsterIds} />
          )}
        </div>
      </aside>
    </dialog>
  );
}

function WorkshopScreen({
  run,
  discoveredMonsterIds,
  discoveredSkillIds,
  discoveredEventIds,
  developerMode,
  setRun,
  onStartBattle,
  online,
}: {
  run: CasualRunState;
  discoveredMonsterIds: ReadonlySet<string>;
  discoveredSkillIds: ReadonlySet<string>;
  discoveredEventIds: ReadonlySet<string>;
  developerMode: boolean;
  setRun: (run: CasualRunState) => void;
  onStartBattle: () => void;
  online?: {
    connected: boolean;
    ownReady: boolean;
    opponentReady: boolean;
  };
}) {
  const [breedingOpen, setBreedingOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(run.activeIds[0]);
  const [inspectedId, setInspectedId] = useState<string>();
  const [parentIds, setParentIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const hatchNoticeKey = (run.lastHatches ?? [])
    .map((hatch) => `${hatch.eggId}:${hatch.resultDefinitionId}:${hatch.toWhiteStars}`)
    .join('|');
  const [visibleHatchNoticeKey, setVisibleHatchNoticeKey] = useState(hatchNoticeKey);
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
  useEffect(() => {
    if (!hatchNoticeKey) {
      setVisibleHatchNoticeKey('');
      return;
    }
    setVisibleHatchNoticeKey(hatchNoticeKey);
    const timer = window.setTimeout(() => setVisibleHatchNoticeKey(''), 5200);
    return () => window.clearTimeout(timer);
  }, [hatchNoticeKey]);

  const onCommand = (result: CommandResult<CasualRunState>, successMessage: string) => {
    setRun(result.state);
    setNotice(result.ok ? successMessage : result.error);
  };

  return (
    <main className="run-screen prep-board">
      <RunHeader run={run} discoveredCount={discoveredMonsterIds.size} onOpenCatalog={() => setCatalogOpen(true)} />
      {(visibleHatchNoticeKey || notice) && (
        <div className="notice-stack" aria-live="polite" aria-atomic="true">
          {visibleHatchNoticeKey && run.lastHatches && run.lastHatches.length > 0 && (
            <section className="notice-toast is-hatch">
              <span>孵化</span>
              <div>
                <strong>
                  {run.lastHatches
                    .map((hatch) => `${definitionById(GAME_DATA, hatch.resultDefinitionId).name}が孵化`)
                    .join(' / ')}
                </strong>
                <small>
                  {run.lastHatches
                    .map((hatch) => `${'★'.repeat(hatch.fromWhiteStars)} → ${'★'.repeat(hatch.toWhiteStars)}`)
                    .join(' · ')}
                </small>
              </div>
              <button type="button" onClick={() => setVisibleHatchNoticeKey('')} aria-label="孵化通知を閉じる">
                ×
              </button>
            </section>
          )}
          {notice && (
            <section className="notice-toast is-command">
              <span>記録</span>
              <strong>{notice}</strong>
              <button type="button" onClick={() => setNotice('')} aria-label="通知を閉じる">
                ×
              </button>
            </section>
          )}
        </div>
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
          <ShopView run={run} onCommand={onCommand} onFreeze={() => setRun(toggleShopFreeze(run))} />
        </section>
      </div>
      <BreedingView
        open={breedingOpen}
        run={run}
        discoveredMonsterIds={discoveredMonsterIds}
        parentIds={parentIds}
        setParentIds={setParentIds}
        onCommand={onCommand}
        onClose={() => setBreedingOpen(false)}
      />
      <Inspector
        run={run}
        monster={inspected}
        discoveredMonsterIds={discoveredMonsterIds}
        onCommand={onCommand}
        onChange={setRun}
        onClose={() => setInspectedId(undefined)}
      />
      <FieldCatalogDialog
        open={catalogOpen}
        discoveredMonsterIds={discoveredMonsterIds}
        discoveredSkillIds={discoveredSkillIds}
        discoveredEventIds={discoveredEventIds}
        developerMode={developerMode}
        onClose={() => setCatalogOpen(false)}
      />
      <footer className="prep-command-dock panel">
        <nav className="workshop-tabs" aria-label="育成メニュー">
          <button
            type="button"
            className="is-active"
            aria-pressed={!breedingOpen}
            onClick={() => setBreedingOpen(false)}
          >
            <span>01</span> ショップ
          </button>
          <button
            type="button"
            className={breedingOpen ? 'is-active' : ''}
            aria-pressed={breedingOpen}
            onClick={() => setBreedingOpen(true)}
          >
            <span>02</span> 配合
          </button>
        </nav>
        <div className="prep-loss-track" aria-label={`5敗中${run.losses}敗`}>
          <span>敗北</span>
          <div>
            {Array.from({ length: 5 }, (_, index) => (
              <i className={index < run.losses ? 'is-lost' : ''} key={index}>
                ♥
              </i>
            ))}
          </div>
        </div>
        <div className="prep-readiness">
          <span>{online ? 'オンライン対戦' : `次のゴースト #${run.cycle.toString().padStart(2, '0')}`}</span>
          <strong>
            {run.activeIds.length !== 3
              ? `主力をあと${3 - run.activeIds.length}体選択`
              : online?.ownReady
                ? online.opponentReady
                  ? '両者の編成を受理しました'
                  : '編成提出済み · 相手を待機中'
                : online?.opponentReady
                  ? '相手は提出済み · あなたの編成待ち'
                  : '編成準備完了'}
          </strong>
        </div>
        <button
          type="button"
          className="launch-button"
          disabled={run.activeIds.length !== 3 || (online ? !online.connected : false)}
          onClick={onStartBattle}
        >
          <span>ATB 3 × 3</span>
          {online ? (online.ownReady ? '編成を更新する' : '編成を提出する') : '戦闘を開始する'}
        </button>
      </footer>
    </main>
  );
}

function EventScreen({
  run,
  onChoose,
}: {
  run: CasualRunState;
  onChoose: (eventId: string, targetMonsterId?: string) => void;
}) {
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [resolvingEventId, setResolvingEventId] = useState<string>();
  const resolveTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (resolveTimer.current !== undefined) window.clearTimeout(resolveTimer.current);
    },
    [],
  );

  const resolveEvent = (eventId: string, targetMonsterId?: string) => {
    if (resolvingEventId) return;
    setResolvingEventId(eventId);
    resolveTimer.current = window.setTimeout(() => onChoose(eventId, targetMonsterId), 680);
  };

  return (
    <main className={`event-screen route-event-screen${resolvingEventId ? ' is-resolving' : ''}`}>
      <RunHeader run={run} />
      <section className="event-stage">
        <div className="event-encounter-heading">
          <div className="event-omen" aria-hidden="true">
            <i />
            <span>?</span>
            <i />
          </div>
          <div>
            <span className="section-index">UNEXPECTED ENCOUNTER · CYCLE {run.cycle}</span>
            <h2>旅路が枝分かれした</h2>
            <p>三つの記録からひとつを選ぶ。どの道も同じ確率で、選んだ結果だけが旅に刻まれます。</p>
          </div>
        </div>
        <div className="event-grid">
          {run.eventChoices.map((eventId, index) => {
            const event = GAME_DATA.events.find((entry) => entry.id === eventId);
            if (!event) return null;
            const needsTarget = eventRequiresTarget(event);
            const targetId = targets[event.id] ?? run.activeIds[0] ?? run.roster[0]?.id;
            const available = eventIsAvailable(event, run);
            const risky = event.effect.kind.startsWith('gamble');
            const resolving = resolvingEventId === event.id;
            return (
              <article
                className={`event-choice-card${risky ? ' is-risk' : ''}${resolving ? ' is-resolving' : ''}${
                  resolvingEventId && !resolving ? ' is-departing' : ''
                }`}
                data-event-state={resolving ? 'resolving' : available ? 'ready' : 'locked'}
                key={event.id}
                style={{ '--event-index': index } as CSSProperties}
              >
                <div className="event-card-aura" aria-hidden="true" />
                <header>
                  <span>{event.glyph}</span>
                  <small>
                    CHOICE {String.fromCharCode(65 + index)} · {risky ? 'RISK' : 'CERTAIN'}
                  </small>
                </header>
                <strong>{event.name}</strong>
                <p>{event.description}</p>
                {needsTarget && (
                  <div className="event-targets" aria-label={`${event.name}の対象`}>
                    <small>対象を選ぶ</small>
                    <div>
                      {run.roster.map((monster) => {
                        const definition = definitionFor(GAME_DATA, monster);
                        return (
                          <button
                            type="button"
                            className={targetId === monster.id ? 'is-selected' : ''}
                            key={monster.id}
                            disabled={Boolean(resolvingEventId)}
                            onClick={() => setTargets((current) => ({ ...current, [event.id]: monster.id }))}
                          >
                            <MonsterSigil
                              data={GAME_DATA}
                              definition={definition}
                              colorStars={monster.colorStars}
                              size="small"
                            />
                            <span>{definition.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="event-commit"
                  disabled={Boolean(resolvingEventId) || !available || (needsTarget && !targetId)}
                  onClick={() => resolveEvent(event.id, needsTarget ? targetId : undefined)}
                >
                  {resolving ? '運命を刻んでいる…' : available ? 'この道を選ぶ' : 'コインが足りない'}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function EventResultScreen({ run, onContinue }: { run: CasualRunState; onContinue: () => void }) {
  const resolution = run.eventResolution;
  const event = resolution ? GAME_DATA.events.find((entry) => entry.id === resolution.eventId) : undefined;
  const target = resolution?.targetMonsterId
    ? run.roster.find((monster) => monster.id === resolution.targetMonsterId)
    : undefined;
  const outcomeLabel =
    resolution?.tone === 'loss' ? 'FATE DENIED' : resolution?.tone === 'risk' ? 'FATE TESTED' : 'REWARD CLAIMED';
  return (
    <main className={`event-screen event-result-screen is-${resolution?.tone ?? 'gain'}`}>
      <div className="event-impact-burst" aria-hidden="true">
        {Array.from({ length: 16 }, (_, index) => (
          <i style={{ '--burst-index': index } as CSSProperties} key={`event-burst-${index}`} />
        ))}
      </div>
      <div className="event-result-particles" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => (
          <i style={{ '--result-particle': index } as CSSProperties} key={`event-particle-${index}`} />
        ))}
      </div>
      <RunHeader run={run} />
      <section className="event-result-stage" aria-live="polite">
        <span className="section-index">ENCOUNTER RESOLVED · CYCLE {run.cycle}</span>
        <div className="event-result-glyph-wrap" aria-hidden="true">
          <i />
          <div className="event-result-glyph">{event?.glyph ?? '路'}</div>
          <i />
        </div>
        <div className="event-outcome-stamp">{outcomeLabel}</div>
        <h2>{resolution?.title ?? '旅路を記録した'}</h2>
        <p>{resolution?.text ?? '次の準備へ進みます。'}</p>
        {target && (
          <div className="event-result-target">
            <MonsterSigil
              data={GAME_DATA}
              definition={definitionFor(GAME_DATA, target)}
              colorStars={target.colorStars}
              size="small"
            />
            <span>
              <small>TARGET</small>
              <strong>{definitionFor(GAME_DATA, target).name}</strong>
              <i>Lv.{target.level}</i>
            </span>
          </div>
        )}
        <button type="button" className="launch-button" onClick={onContinue}>
          <span>PREPARE CYCLE {run.cycle}</span>
          育成と編成へ進む
        </button>
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
  previousHp,
  hpRevealDelayMs,
  critical,
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
  previousHp: number;
  hpRevealDelayMs: number;
  critical: boolean;
}) {
  const definition = definitionById(GAME_DATA, fighter.definitionId);
  const [displayedHp, setDisplayedHp] = useState(previousHp);
  useEffect(() => {
    if (previousHp === fighter.hp) {
      setDisplayedHp(fighter.hp);
      return;
    }
    setDisplayedHp(previousHp);
    const timer = window.setTimeout(() => setDisplayedHp(fighter.hp), hpRevealDelayMs);
    return () => window.clearTimeout(timer);
  }, [fighter.hp, hpRevealDelayMs, previousHp, pulseKey]);
  const hpPercent = Math.max(0, (displayedHp / fighter.maxHp) * 100);
  const mpPercent = Math.max(0, (fighter.mp / fighter.maxMp) * 100);
  const hpPending = displayedHp !== fighter.hp;
  const hit =
    targeted &&
    !acting &&
    (hpDelta > 0 ||
      feedback.some((entry) => entry.tone === 'debuff' || (entry.tone === 'shield' && entry.label.includes('-'))));
  return (
    <article
      className={`battle-sprite is-${side}${fighter.alive ? '' : ' is-defeated'}${acting ? ' is-acting' : ''}${targeted ? ' is-targeted' : ''}${hit ? ' is-hit' : ''}${critical ? ' is-critical-hit' : ''}${hpDelta < 0 ? ' is-healed' : ''}`}
      data-critical-hit={critical}
      data-fighter-id={fighter.id}
      data-hp-current={fighter.hp}
      data-hp-displayed={displayedHp}
      data-hp-pending={hpPending}
      data-hp-reveal-delay-ms={hpRevealDelayMs}
      style={monsterStyle(GAME_DATA, definition)}
    >
      {((acting && actionLabel) || hpDelta !== 0 || feedback.length > 0) && (
        <div className="battle-feedback" key={pulseKey}>
          {acting && actionLabel && (
            <span className="skill-callout">
              <small>{fighter.name}</small>
              <strong>{actionLabel}</strong>
            </span>
          )}
          {hpDelta !== 0 && (
            <b className={`battle-number${hpDelta < 0 ? ' is-heal' : ''}${critical ? ' is-critical' : ''}`}>
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
      {critical && (
        <span className="critical-impact" key={`critical-${pulseKey}`} aria-hidden="true">
          <strong>CRITICAL!</strong>
          <small>会心</small>
          {Array.from({ length: 12 }, (_, index) => (
            <i
              key={index}
              style={
                {
                  '--critical-angle': `${index * 30}deg`,
                  '--critical-angle-reverse': `${index * -30}deg`,
                } as CSSProperties
              }
            />
          ))}
        </span>
      )}
      <MonsterSigil data={GAME_DATA} definition={definition} colorStars={fighter.colorStars} size="large" />
      <div className="battle-monster-copy">
        <span>{side === 'player' ? 'YOUR LINE' : 'GHOST LINE'}</span>
        <strong>{fighter.name}</strong>
        <small>{starText(fighter.whiteStars, fighter.colorStars)}</small>
      </div>
      <div className="battle-bars">
        <div className="hp-bar">
          <span style={{ width: `${hpPercent}%` }} />
          <b>{displayedHp}</b>
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

type BattleOpeningPoint = {
  id: string;
  x: number;
  y: number;
};

type BattleOpeningLayout = {
  height: number;
  source: BattleOpeningPoint;
  targets: BattleOpeningPoint[];
  width: number;
};

function BattleOpeningSequence({
  frame,
  icon,
  order,
  source,
  sourceActorName,
  total,
}: {
  frame: BattleResult['frames'][number];
  icon: string;
  order: number;
  source: NonNullable<BattleResult['frames'][number]['battleStartSource']>;
  sourceActorName: string;
  total: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<BattleOpeningLayout>();

  useLayoutEffect(() => {
    const measure = () => {
      const root = rootRef.current;
      const battlefield = root?.closest('.battlefield');
      if (!(battlefield instanceof HTMLElement)) return;
      const battlefieldBox = battlefield.getBoundingClientRect();
      const fighters = [...battlefield.querySelectorAll<HTMLElement>('[data-fighter-id]')];
      const pointFor = (id: string): BattleOpeningPoint | undefined => {
        const fighter = fighters.find((candidate) => candidate.dataset.fighterId === id);
        const anchor = fighter?.querySelector('.monster-sigil') ?? fighter;
        if (!(anchor instanceof HTMLElement)) return undefined;
        const box = anchor.getBoundingClientRect();
        return {
          id,
          x: box.left + box.width / 2 - battlefieldBox.left,
          y: box.top + box.height / 2 - battlefieldBox.top,
        };
      };
      const actor = frame.actorId ? pointFor(frame.actorId) : undefined;
      if (!actor) return;
      setLayout({
        height: battlefieldBox.height,
        source: actor,
        targets: frame.targetIds.flatMap((id) => {
          const point = pointFor(id);
          return point ? [point] : [];
        }),
        width: battlefieldBox.width,
      });
    };

    const animationFrame = window.requestAnimationFrame(measure);
    const resizeObserver = new ResizeObserver(measure);
    const battlefield = rootRef.current?.closest('.battlefield');
    if (battlefield) resizeObserver.observe(battlefield);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [frame.actorId, frame.targetIds]);

  const badgeHalfWidth = (layout?.width ?? 0) < 600 ? 62 : 86;
  const badgeX = layout ? Math.max(badgeHalfWidth, Math.min(layout.width - badgeHalfWidth, layout.source.x)) : 0;

  return (
    <div
      className={`battle-opening-sequence is-${source.kind}`}
      data-opening-actor={frame.actorId}
      data-opening-order={order}
      data-opening-source={source.kind}
      data-opening-source-id={source.id}
      data-opening-speed={source.speed}
      data-opening-target-count={frame.targetIds.length}
      data-opening-total={total}
      key={`${frame.actorId}-${source.kind}-${source.id}-${order}`}
      ref={rootRef}
      aria-live="polite"
    >
      {layout && (
        <>
          <svg
            className="battle-opening-routes"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <circle
              className="battle-opening-origin"
              cx={layout.source.x}
              cy={layout.source.y}
              r="8"
              vectorEffect="non-scaling-stroke"
            />
            {layout.targets.map((target) => (
              <path
                className="battle-opening-transfer"
                d={`M ${layout.source.x} ${layout.source.y} L ${target.x} ${target.y}`}
                key={`route-${target.id}`}
                pathLength="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          <aside
            className="battle-opening-source"
            style={
              {
                left: `${badgeX}px`,
                top: `${layout.source.y}px`,
              } as CSSProperties
            }
          >
            <span aria-hidden="true">{icon}</span>
            <div>
              <small>
                OPENING {String(order).padStart(2, '0')} / {String(total).padStart(2, '0')} · SPD {source.speed}
              </small>
              <strong>{source.name}</strong>
              <b>
                {source.kind === 'equipment' ? '装備' : '特性'} · {sourceActorName}
              </b>
            </div>
          </aside>
          {layout.targets.map((target) => (
            <span
              className="battle-opening-target"
              key={`target-${target.id}`}
              style={{ left: `${target.x}px`, top: `${target.y}px` }}
              aria-hidden="true"
            >
              <i />
              <i />
            </span>
          ))}
        </>
      )}
    </div>
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
  const replayStepMs = frame?.kind === 'battle-start-effect' ? BATTLE_START_STEP_MS : REPLAY_STEP_MS;
  useEffect(() => {
    if (!battle.playing || battle.frameIndex >= lastIndex) return;
    const timer = window.setTimeout(
      () => onChange({ ...battle, frameIndex: Math.min(lastIndex, battle.frameIndex + 1) }),
      replayStepMs / battle.speed,
    );
    return () => window.clearTimeout(timer);
  }, [battle, lastIndex, onChange, replayStepMs]);
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
    const shield =
      shieldDelta === 0
        ? []
        : [
            {
              label: `盾 ${shieldDelta > 0 ? '+' : ''}${shieldDelta}`,
              tone: 'shield' as const,
            },
          ];
    const startResources =
      frame.kind !== 'battle-start-effect'
        ? []
        : [
            ...(fighter.gauge === previous.gauge
              ? []
              : [
                  {
                    label: `ATB ${fighter.gauge - previous.gauge > 0 ? '+' : ''}${Math.round(fighter.gauge - previous.gauge)}`,
                    tone: 'buff' as const,
                  },
                ]),
            ...(fighter.mp === previous.mp
              ? []
              : [
                  {
                    label: `MP ${fighter.mp - previous.mp > 0 ? '+' : ''}${fighter.mp - previous.mp}`,
                    tone: 'buff' as const,
                  },
                ]),
          ];
    return [...statuses, ...shield, ...startResources];
  };
  const players = frame.fighters.filter((fighter) => fighter.team === 'player');
  const enemies = frame.fighters.filter((fighter) => fighter.team === 'enemy');
  const complete = battle.frameIndex >= lastIndex;
  const battlePulseDuration = Math.max(
    160,
    Math.round((frame.kind === 'battle-start-effect' ? BATTLE_START_PULSE_MS : BATTLE_PULSE_MS) / battle.speed),
  );
  const hpRevealDelayMs = Math.round(battlePulseDuration * HP_REVEAL_PROGRESS);
  const hpTransitionDuration = Math.max(70, Math.round(HP_TRANSITION_MS / battle.speed));
  const activeSkill =
    frame.skillId && frame.skillId !== 'normal-attack'
      ? GAME_DATA.skills.find((skill) => skill.id === frame.skillId)
      : undefined;
  const startSource = frame.battleStartSource;
  const startSourceDefinition =
    startSource?.kind === 'equipment'
      ? GAME_DATA.equipment.find((equipment) => equipment.id === startSource.id)
      : undefined;
  const startSourceFrames = battle.result.frames.filter((event) => event.kind === 'battle-start-effect');
  const startSourceOrder =
    frame.kind === 'battle-start-effect'
      ? battle.result.frames.slice(0, battle.frameIndex + 1).filter((event) => event.kind === 'battle-start-effect')
          .length
      : 0;
  const startActor = startSource ? frame.fighters.find((fighter) => fighter.id === frame.actorId) : undefined;
  const actionLabel = frame.skillId === 'normal-attack' ? '通常攻撃' : (activeSkill?.name ?? startSource?.name);
  const skillFx = startSource
    ? 'opening'
    : activeSkill?.effects.some((effect) => effect.kind === 'heal')
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
  const damagedTargetCount = frame.targetIds.filter((id) => {
    const current = frame.fighters.find((fighter) => fighter.id === id);
    return current ? hpDeltaFor(current) > 0 : false;
  }).length;
  const impact = damagedTargetCount > 0;
  const impactScope = damagedTargetCount > 1 ? 'multi' : impact ? 'single' : 'none';
  const critical = frame.criticalTargetIds.length > 0;
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
          : frame.kind === 'battle-start-effect'
            ? (startSource?.name ?? 'OPENING EFFECT')
            : 'BATTLE START';
  const frameLabel =
    frame.kind === 'battle-start-effect'
      ? `OPENING / ${startSource?.kind === 'equipment' ? '装備' : '特性'}`
      : frame.kind.toUpperCase();
  return (
    <main
      className={`battle-screen${impact ? ` is-impact is-impact-${impactScope}` : ''}${critical ? ' is-critical' : ''} is-frame-${frame.kind} is-skill-${skillFx}`}
      data-critical={critical}
      data-critical-frame-count={battle.result.frames.filter((event) => event.criticalTargetIds.length > 0).length}
      data-impact-scope={impactScope}
      data-skill-id={frame.skillId}
      data-start-source={startSource?.kind}
      data-replay-delay-ms={Math.round(replayStepMs / battle.speed)}
      style={
        {
          '--battle-pulse-duration': `${battlePulseDuration}ms`,
          '--battle-hp-transition-duration': `${hpTransitionDuration}ms`,
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
      <section className="battlefield battle-arena" key={impact ? `impact-${battle.frameIndex}` : 'steady'}>
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
                actionLabel={frame.actorId === fighter.id && !startSource ? actionLabel : undefined}
                feedback={feedbackFor(fighter)}
                skillFx={skillFx}
                pulseKey={battle.frameIndex}
                previousHp={previousFighters.get(fighter.id)?.hp ?? fighter.hp}
                hpRevealDelayMs={hpRevealDelayMs}
                critical={frame.criticalTargetIds.includes(fighter.id)}
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
          <span className="team-label">RIVAL RUN / SAME RULES</span>
          <div className="battle-formation">
            {enemies.map((fighter) => (
              <BattleMonster
                key={fighter.id}
                fighter={fighter}
                side="enemy"
                acting={frame.actorId === fighter.id}
                targeted={frame.targetIds.includes(fighter.id)}
                hpDelta={hpDeltaFor(fighter)}
                actionLabel={frame.actorId === fighter.id && !startSource ? actionLabel : undefined}
                feedback={feedbackFor(fighter)}
                skillFx={skillFx}
                pulseKey={battle.frameIndex}
                previousHp={previousFighters.get(fighter.id)?.hp ?? fighter.hp}
                hpRevealDelayMs={hpRevealDelayMs}
                critical={frame.criticalTargetIds.includes(fighter.id)}
              />
            ))}
          </div>
        </div>
        {startSource && (
          <BattleOpeningSequence
            frame={frame}
            icon={startSourceDefinition?.icon ?? '✦'}
            key={`opening-${battle.frameIndex}`}
            order={startSourceOrder}
            source={startSource}
            sourceActorName={startActor?.name ?? 'UNKNOWN'}
            total={startSourceFrames.length}
          />
        )}
        <div
          className={`battle-fx is-${frame.kind}${impact ? ' is-impact' : ''}`}
          key={battle.frameIndex}
          aria-hidden="true"
        >
          {frame.kind !== 'action' && frame.kind !== 'battle-start-effect' && (
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
            {frameLabel}
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

const reportSkillName = (skillId: string) =>
  skillId === 'normal-attack'
    ? '通常攻撃'
    : skillId === 'passive'
      ? '特性・装備'
      : (GAME_DATA.skills.find((skill) => skill.id === skillId)?.name ?? skillId);

function MonsterCombatLedger({
  report,
  monster,
  finalSnapshot,
}: {
  report: MonsterBattleReport;
  monster?: MonsterInstance;
  finalSnapshot?: FighterSnapshot;
}) {
  const definition = definitionById(GAME_DATA, report.definitionId);
  const metrics = [
    ['DMG', report.damageDealt, '与ダメージ'],
    ['TAKEN', report.damageTaken, '被ダメージ'],
    ['HEAL', report.healingDone, '回復'],
    ['SHIELD', report.shieldingDone, '盾付与'],
    ['BUFF', report.buffApplications, '強化'],
    ['DEBUFF', report.debuffApplications, '弱体'],
    ['ACTION', report.actions, '行動'],
    ['FALLBACK', report.fallbackActions, '代替攻撃'],
    ['ATB', report.atbGranted, 'ATB支援'],
    ['MP', report.mpGranted, 'MP支援'],
  ] as const;
  const breakdown = Object.entries(report.skillBreakdown).filter(
    ([, contribution]) =>
      contribution.uses +
        contribution.damage +
        contribution.healing +
        contribution.shielding +
        contribution.buffs +
        contribution.debuffs >
      0,
  );
  const statuses = Object.entries(report.statusApplications).filter((entry) => (entry[1] ?? 0) > 0);
  return (
    <article className="combat-ledger-card" style={monsterStyle(GAME_DATA, definition)}>
      <header>
        <MonsterSigil data={GAME_DATA} definition={definition} colorStars={monster?.colorStars ?? 0} size="small" />
        <span>
          <small>
            {starText(definition.whiteStars, monster?.colorStars ?? 0)} · {finalSnapshot?.alive ? 'SURVIVED' : 'DOWN'}
          </small>
          <strong>{report.name}</strong>
          <i>
            HP {Math.round(finalSnapshot?.hp ?? 0)}/{finalSnapshot?.maxHp ?? 0}
          </i>
        </span>
        <b>{report.criticalHits > 0 ? `CRIT ×${report.criticalHits}` : `${report.actions} ACT`}</b>
      </header>
      <div className="combat-ledger-metrics">
        {metrics.map(([id, value, label]) => (
          <span key={id}>
            <small>{id}</small>
            <b>{Math.round(value)}</b>
            <i>{label}</i>
          </span>
        ))}
      </div>
      {statuses.length > 0 && (
        <div className="combat-status-ledger">
          {statuses.map(([statusId, count]) => (
            <span key={statusId}>
              {STATUS_LABELS[statusId as StatusId]} ×{count}
            </span>
          ))}
        </div>
      )}
      <details className="skill-ledger">
        <summary>スキル別の内訳</summary>
        <div>
          {breakdown.map(([skillId, contribution]) => (
            <span key={skillId}>
              <strong>{reportSkillName(skillId)}</strong>
              <i>{contribution.uses > 0 ? `${contribution.uses}回` : '自動'}</i>
              <small>
                DMG {Math.round(contribution.damage)} · HEAL {Math.round(contribution.healing)} · SHIELD{' '}
                {Math.round(contribution.shielding)} · B/D {contribution.buffs}/{contribution.debuffs}
              </small>
            </span>
          ))}
        </div>
      </details>
    </article>
  );
}

function CombatLedger({
  result,
  player,
  enemy,
}: {
  result: BattleResult;
  player: MonsterInstance[];
  enemy: MonsterInstance[];
}) {
  const reportsFor = (team: 'player' | 'enemy') => result.monsterReports.filter((report) => report.team === team);
  const finalById = new Map(result.frames.at(-1)?.fighters.map((fighter) => [fighter.id, fighter]) ?? []);
  const monstersById = new Map([...player, ...enemy].map((monster) => [monster.id, monster]));
  const topDamage = [...result.monsterReports].sort((left, right) => right.damageDealt - left.damageDealt)[0];
  const topSupport = [...result.monsterReports].sort(
    (left, right) =>
      right.healingDone +
      right.shieldingDone +
      right.buffApplications * 10 -
      (left.healingDone + left.shieldingDone + left.buffApplications * 10),
  )[0];
  const playerFallbacks = reportsFor('player').reduce((total, report) => total + report.fallbackActions, 0);
  const enemyFallbacks = reportsFor('enemy').reduce((total, report) => total + report.fallbackActions, 0);
  return (
    <section className="combat-ledger">
      <div className="result-section-heading">
        <div>
          <span>02 / TACTICAL LEDGER</span>
          <h3>勝因と敗因</h3>
        </div>
        <small>両陣営を同じ基準で集計</small>
      </div>
      <div className="battle-insight-strip">
        <span>
          <small>最大火力</small>
          <strong>{topDamage?.name ?? '—'}</strong>
          <b>{Math.round(topDamage?.damageDealt ?? 0)} DMG</b>
        </span>
        <span>
          <small>最大支援</small>
          <strong>{topSupport?.name ?? '—'}</strong>
          <b>{Math.round((topSupport?.healingDone ?? 0) + (topSupport?.shieldingDone ?? 0))} RECOVER</b>
        </span>
        <span>
          <small>代替攻撃</small>
          <strong>
            自軍 {playerFallbacks} / 相手 {enemyFallbacks}
          </strong>
          <b>{playerFallbacks > enemyFallbacks ? '自軍のMP・条件を再確認' : 'ガンビットは機能'}</b>
        </span>
      </div>
      <div className="combat-ledger-teams">
        {(['player', 'enemy'] as const).map((team) => (
          <section className={`combat-ledger-team is-${team}`} key={team}>
            <header>
              <span>{team === 'player' ? 'PLAYER PARTY' : 'RIVAL PARTY'}</span>
              <strong>{team === 'player' ? '自軍の戦績' : '相手の戦績'}</strong>
              <b>{result.winner === team ? 'WIN' : result.winner === 'draw' ? 'DRAW' : 'LOSS'}</b>
            </header>
            {reportsFor(team).map((report) => (
              <MonsterCombatLedger
                key={report.id}
                report={report}
                monster={monstersById.get(report.id)}
                finalSnapshot={finalById.get(report.id)}
              />
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}

function ResultScreen({
  run,
  beforeRoster,
  enemy,
  onContinue,
  continueLabel,
  continueEyebrow,
  continueDisabled = false,
  continueStatus,
}: {
  run: CasualRunState;
  beforeRoster: MonsterInstance[];
  enemy: MonsterInstance[];
  onContinue: () => void;
  continueLabel?: string;
  continueEyebrow?: string;
  continueDisabled?: boolean;
  continueStatus?: string;
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
  const journeyCoins = run.lastBattleRewards?.coins ?? 0;
  const reportMetrics = [
    ['TIME', `${result?.durationSeconds.toFixed(1) ?? '0.0'}s`, '戦闘時間'],
    ['DAMAGE', String(result?.damageByTeam.player ?? 0), '与ダメージ'],
    ['RECEIVED', String(result?.damageByTeam.enemy ?? 0), '被ダメージ'],
    ['SURVIVORS', `${survivors}/3`, '生存'],
    ['COIN', `+${journeyCoins}`, journeyCoins > 0 ? '旅路スキル' : '追加報酬なし'],
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
        {result && <CombatLedger result={result} player={beforeRoster} enemy={enemy} />}
        <section className="reward-report">
          <div className="result-section-heading">
            <div>
              <span>03 / EXPERIENCE PULSE</span>
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
          <p>{continueStatus ?? (revealStage >= 3 ? '戦果の記録が完了しました。' : '戦果を記録しています…')}</p>
          <button
            type="button"
            className="launch-button"
            disabled={revealStage < 3 || continueDisabled}
            onClick={onContinue}
          >
            <span>
              {continueEyebrow ??
                (run.completedCycles >= 12 || (run.mode === 'casual' && run.losses >= 5)
                  ? 'RUN COMPLETE'
                  : `NEXT CYCLE ${run.cycle + 1}`)}
            </span>
            {continueLabel ??
              (run.completedCycles >= 12 || (run.mode === 'casual' && run.losses >= 5) ? '最終結果へ' : '旅を続ける')}
          </button>
        </footer>
      </section>
    </main>
  );
}

const formatRunDuration = (durationSeconds: number) => {
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
};

function FinishedScreen({
  run,
  startedAt,
  completedAt,
  onRestart,
}: {
  run: CasualRunState;
  startedAt: string;
  completedAt: string;
  onRestart: () => void;
}) {
  const completion = run.completedCycles >= GAME_DATA.rules.maxCycles;
  const [exportNotice, setExportNotice] = useState('');
  const report = useMemo(
    () => createPlaytestReport(GAME_DATA, run, { startedAt, completedAt }),
    [run, startedAt, completedAt],
  );
  const reportJson = useMemo(() => serializePlaytestReport(report), [report]);
  const reportFileName = `code-monsters-playtest-${report.contentVersion}-seed-${run.seed}.json`;
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(reportJson);
      setExportNotice('航路記録をコピーしました');
    } catch {
      setExportNotice('コピーできませんでした。JSON保存を利用してください');
    }
  };
  const saveReport = () => {
    const url = URL.createObjectURL(new Blob([reportJson], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = reportFileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setExportNotice(`${reportFileName} を保存しました`);
  };
  const activityMetrics = [
    ['BREED', report.activity.breeds, '配合'],
    ['MONSTER', report.activity.monstersBought, '購入'],
    ['EQUIP', report.activity.equipmentBought, '装備購入'],
    ['REROLL', report.activity.shopRerolls, '更新'],
    ['GAMBIT', report.activity.gambitChanges, '変更'],
    ['COMMAND', report.run.commandCount, '全操作'],
  ] as const;

  return (
    <main className="finished-screen">
      <div className="finished-stage">
        <section className="finished-lineage-panel">
          <div className="finish-sigil" aria-hidden="true">
            <span>竜</span>
            <span>魔</span>
            <span>精</span>
          </div>
          <span className="section-index">CASUAL RUN / COMPLETE</span>
          <h1>{completion ? '十二の航路を完走' : '血統の旅はここまで'}</h1>
          <p className="finished-score">
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
        </section>

        <section className="playtest-ledger" aria-labelledby="playtest-ledger-title">
          <header>
            <div>
              <span>PLAYTEST LOG / V{report.schemaVersion}</span>
              <h2 id="playtest-ledger-title">航路記録</h2>
            </div>
            <code>SEED {run.seed}</code>
          </header>
          <dl className="playtest-ledger-meta">
            <div>
              <dt>所要時間</dt>
              <dd>{formatRunDuration(report.run.durationSeconds)}</dd>
            </div>
            <div>
              <dt>コンテンツ</dt>
              <dd>{report.contentVersion}</dd>
            </div>
          </dl>
          <div className="playtest-ledger-grid">
            {activityMetrics.map(([id, value, label]) => (
              <div key={id}>
                <span>{id}</span>
                <b>{value}</b>
                <small>{label}</small>
              </div>
            ))}
          </div>
          <p className="playtest-ledger-note">
            シード、編成、購入、配合、ガンビット、戦闘結果を、再現可能な操作順で記録しました。
          </p>
          <div className="playtest-export-actions">
            <button type="button" onClick={copyReport}>
              <span>COPY LOG</span>
              航路記録をコピー
            </button>
            <button type="button" onClick={saveReport}>
              <span>JSON / {report.commandLogVersion}</span>
              JSONを保存
            </button>
          </div>
          <p className="playtest-export-notice" aria-live="polite">
            {exportNotice || '個人情報は含まれません'}
          </p>
        </section>
      </div>

      <footer className="finished-actions">
        <button type="button" className="launch-button" onClick={onRestart}>
          <span>NEW SEED</span>新しい旅を始める
        </button>
        <small>この記録はバランス調整とプレイフィール検証に利用できます</small>
      </footer>
    </main>
  );
}

export function App() {
  const [mode, setMode] = useState<AppMode>(INITIAL_MODE);
  const [roomId, setRoomId] = useState<string | undefined>(INITIAL_ROOM_ID);
  const [run, setRun] = useState(() => createCasualRun(GAME_DATA, INITIAL_SEED));
  const [onlineRunReady, setOnlineRunReady] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState(() => new Date().toISOString());
  const [runCompletedAt, setRunCompletedAt] = useState<string>();
  const [battle, setBattle] = useState<BattleViewState>();
  const [lastBattleRoster, setLastBattleRoster] = useState<MonsterInstance[]>([]);
  const [lastBattleEnemy, setLastBattleEnemy] = useState<MonsterInstance[]>([]);
  const [pendingHatches, setPendingHatches] = useState<EggHatchResult[]>();
  const [discoveredMonsterIds, setDiscoveredMonsterIds] = useState(() => new Set<string>(loadDiscoveredMonsterIds()));
  const [discoveredSkillIds, setDiscoveredSkillIds] = useState(() => new Set<string>(loadDiscoveredSkillIds()));
  const [discoveredEventIds, setDiscoveredEventIds] = useState(() => new Set<string>(loadDiscoveredEventIds()));
  const [developerMode, setDeveloperMode] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const handledOnlineBattle = useRef(0);
  const online = useOnlineRoom(mode === 'online' ? roomId : undefined);

  const updateLocation = (nextMode: AppMode, nextRoomId?: string) => {
    const url = new URL(window.location.href);
    if (nextMode === 'select') url.searchParams.delete('mode');
    else url.searchParams.set('mode', nextMode);
    if (nextRoomId) url.searchParams.set('room', nextRoomId);
    else url.searchParams.delete('room');
    window.history.replaceState({}, '', url);
  };

  const openCasual = () => {
    const startedAt = new Date().toISOString();
    setMode('casual');
    setRoomId(undefined);
    setOnlineRunReady(false);
    setRunStartedAt(startedAt);
    setRunCompletedAt(undefined);
    setPendingHatches(undefined);
    setBattle(undefined);
    setRun(createCasualRun(GAME_DATA, INITIAL_SEED));
    updateLocation('casual');
  };

  const openOnline = (nextRoomId: string) => {
    if (!/^[a-z0-9][a-z0-9-]{7,63}$/.test(nextRoomId)) return false;
    setMode('online');
    setRoomId(nextRoomId);
    setOnlineRunReady(false);
    setBattle(undefined);
    handledOnlineBattle.current = 0;
    setRunStartedAt(new Date().toISOString());
    setRunCompletedAt(undefined);
    updateLocation('online', nextRoomId);
    return true;
  };

  const leaveOnline = () => {
    setMode('select');
    setRoomId(undefined);
    setOnlineRunReady(false);
    setBattle(undefined);
    setPendingHatches(undefined);
    updateLocation('select');
  };

  useEffect(() => {
    if (mode !== 'online' || !roomId || !online.seat || online.runSeed === undefined || onlineRunReady) return;
    const storageKey = `code-monsters:online-run:${roomId}:${online.seat}`;
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null') as CasualRunState | null;
      if (
        saved?.mode === 'online' &&
        saved.contentVersion === GAME_DATA.rules.contentVersion &&
        saved.schemaVersion === 4
      ) {
        setRun(saved);
      } else {
        setRun(createOnlineRun(GAME_DATA, online.runSeed));
      }
    } catch {
      setRun(createOnlineRun(GAME_DATA, online.runSeed));
    }
    setOnlineRunReady(true);
  }, [mode, online.runSeed, online.seat, onlineRunReady, roomId]);

  useEffect(() => {
    if (mode !== 'online' || !roomId || !online.seat || !onlineRunReady) return;
    try {
      window.localStorage.setItem(`code-monsters:online-run:${roomId}:${online.seat}`, JSON.stringify(run));
    } catch {
      // The connected session remains playable when local persistence is unavailable.
    }
  }, [mode, online.seat, onlineRunReady, roomId, run]);

  useEffect(() => {
    const incoming = online.battle;
    if (mode !== 'online' || !incoming || incoming.battleNumber <= handledOnlineBattle.current) return;
    if (incoming.suddenDeathRound === 0 && run.phase === 'result' && incoming.cycle === run.cycle) {
      handledOnlineBattle.current = incoming.battleNumber;
      online.consumeBattle();
      return;
    }
    if (incoming.suddenDeathRound === 0 && (run.phase !== 'prepare' || incoming.cycle !== run.cycle)) return;
    if (incoming.suddenDeathRound > 0 && run.phase !== 'result') return;

    handledOnlineBattle.current = incoming.battleNumber;
    const beforeRoster = run.roster;
    setRun(
      incoming.suddenDeathRound > 0
        ? {
            ...run,
            lastBattle: incoming.result,
            lastBattleRewards: { coins: 0, xpByMonsterId: {} },
          }
        : applyBattleResult(GAME_DATA, run, incoming.result),
    );
    setBattle({
      result: incoming.result,
      enemy: incoming.opponent,
      beforeRoster,
      frameIndex: 0,
      playing: true,
      speed: 1,
    });
    online.consumeBattle();
  }, [mode, online.battle, online.consumeBattle, run]);

  useEffect(() => {
    if (
      mode !== 'online' ||
      !onlineRunReady ||
      run.phase !== 'result' ||
      online.room?.phase !== 'preparing' ||
      online.room.cycle !== run.cycle + 1
    ) {
      return;
    }
    const next = continueRun(GAME_DATA, run);
    if (next.lastHatches && next.lastHatches.length > 0) setPendingHatches(next.lastHatches);
    setRun(next);
  }, [mode, online.room?.cycle, online.room?.phase, onlineRunReady, run]);

  useEffect(() => {
    setDiscoveredMonsterIds((current) => {
      const next = mergeDiscoveredMonsterIds(GAME_DATA, current, run.roster);
      if (next.size === current.size) return current;
      saveDiscoveredMonsterIds(next);
      return next;
    });
  }, [run.roster]);

  useEffect(() => {
    setDiscoveredSkillIds((current) => {
      const next = mergeDiscoveredSkillIds(GAME_DATA, current, run.roster);
      if (next.size === current.size) return current;
      saveDiscoveryIds(SKILL_DISCOVERY_STORAGE_KEY, next);
      return next;
    });
  }, [run.roster]);

  useEffect(() => {
    const eventId = run.eventResolution?.eventId;
    if (!eventId) return;
    setDiscoveredEventIds((current) => {
      const next = mergeDiscoveredEventIds(GAME_DATA, current, eventId);
      if (next.size === current.size) return current;
      saveDiscoveryIds(EVENT_DISCOVERY_STORAGE_KEY, next);
      return next;
    });
  }, [run.eventResolution?.eventId]);

  const startBattle = () => {
    const player = run.activeIds
      .map((id) => run.roster.find((monster) => monster.id === id))
      .filter((monster): monster is MonsterInstance => Boolean(monster));
    if (player.length !== GAME_DATA.rules.activeLimit) return;
    if (mode === 'online') {
      online.submitBuild(run.cycle, {
        contentVersion: GAME_DATA.rules.contentVersion,
        active: player,
      });
      return;
    }
    const battleSeed = deriveSeed(run.seed, run.cycle * 10_000 + run.commandIndex);
    const enemy = createGhostTeam(GAME_DATA, run.cycle, battleSeed);
    const result = simulateBattle(GAME_DATA, { player, enemy, seed: battleSeed });
    setRun(applyBattleResult(GAME_DATA, run, result));
    setBattle({ result, enemy, beforeRoster: run.roster, frameIndex: 0, playing: true, speed: 1 });
  };
  const continueAfterBattle = () => {
    if (mode === 'online') {
      if (online.room) online.continueMatch(online.room.battleNumber);
      return;
    }
    const next = continueRun(GAME_DATA, run);
    if (next.phase === 'finished') setRunCompletedAt(new Date().toISOString());
    if (next.lastHatches && next.lastHatches.length > 0) setPendingHatches(next.lastHatches);
    setRun(next);
  };
  const restartRun = () => {
    const startedAt = new Date().toISOString();
    setRunStartedAt(startedAt);
    setRunCompletedAt(undefined);
    setPendingHatches(undefined);
    setRun(createCasualRun(GAME_DATA, deriveSeed(run.seed, run.commandIndex + 71)));
  };

  const copyInvitation = async () => {
    if (!roomId) return;
    const invitation = new URL(window.location.href);
    invitation.searchParams.set('mode', 'online');
    invitation.searchParams.set('room', roomId);
    try {
      await navigator.clipboard.writeText(invitation.toString());
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2400);
    } catch {
      setInviteCopied(false);
    }
  };

  let screen;
  if (mode === 'select') {
    screen = (
      <ModeSelectScreen
        onCasual={openCasual}
        onCreateOnline={() => openOnline(`route-${crypto.randomUUID()}`)}
        onJoinOnline={openOnline}
      />
    );
  } else if (mode === 'online' && online.room?.phase === 'finished' && online.seat && !battle) {
    screen = <OnlineFinishedScreen room={online.room} seat={online.seat} onLeave={leaveOnline} />;
  } else if (mode === 'online' && roomId && !onlineRunReady) {
    screen = <OnlineConnectionScreen roomId={roomId} connection={online.connection} error={online.error} />;
  } else if (battle) {
    screen = (
      <BattleScreen
        battle={battle}
        onChange={setBattle}
        onFinish={() => {
          setLastBattleRoster(battle.beforeRoster);
          setLastBattleEnemy(battle.enemy);
          setBattle(undefined);
        }}
      />
    );
  } else if (run.phase === 'draft') {
    screen = <DraftScreen run={run} onChoose={(id) => setRun(chooseDraftMonster(GAME_DATA, run, id))} />;
  } else if (run.phase === 'event') {
    screen = <EventScreen run={run} onChoose={(id, targetId) => setRun(chooseEvent(GAME_DATA, run, id, targetId))} />;
  } else if (run.phase === 'event-result') {
    screen = <EventResultScreen run={run} onContinue={() => setRun(continueEvent(run))} />;
  } else if (run.phase === 'prepare') {
    screen = (
      <WorkshopScreen
        run={run}
        discoveredMonsterIds={discoveredMonsterIds}
        discoveredSkillIds={discoveredSkillIds}
        discoveredEventIds={discoveredEventIds}
        developerMode={developerMode}
        setRun={setRun}
        onStartBattle={startBattle}
        online={
          mode === 'online' && online.seat
            ? {
                connected: online.connection === 'connected',
                ownReady: online.room?.submittedSeats.includes(online.seat) ?? false,
                opponentReady: online.room?.submittedSeats.includes(online.seat === 'a' ? 'b' : 'a') ?? false,
              }
            : undefined
        }
      />
    );
  } else if (run.phase === 'result') {
    screen = (
      <ResultScreen
        run={run}
        beforeRoster={lastBattleRoster}
        enemy={lastBattleEnemy}
        onContinue={continueAfterBattle}
        continueLabel={
          mode === 'online'
            ? online.seat && online.room?.continuedSeats.includes(online.seat)
              ? '相手の確認を待つ'
              : online.room?.suddenDeathRound
                ? 'サドンデス結果を確定'
                : run.completedCycles >= GAME_DATA.rules.maxCycles
                  ? '対戦結果を確定'
                  : '次の育成へ進む'
            : undefined
        }
        continueEyebrow={
          mode === 'online'
            ? online.room?.suddenDeathRound
              ? `SUDDEN DEATH ${online.room.suddenDeathRound}`
              : `ONLINE SCORE ${online.seat === 'b' ? online.room?.score.b : online.room?.score.a} — ${
                  online.seat === 'b' ? online.room?.score.a : online.room?.score.b
                }`
            : undefined
        }
        continueDisabled={
          mode === 'online'
            ? !online.seat ||
              online.connection !== 'connected' ||
              (online.room?.continuedSeats.includes(online.seat) ?? false)
            : false
        }
        continueStatus={
          mode === 'online' && online.seat && online.room?.continuedSeats.includes(online.seat)
            ? '結果を確認しました。相手の確認を待っています。'
            : undefined
        }
      />
    );
  } else {
    screen = (
      <FinishedScreen
        run={run}
        startedAt={runStartedAt}
        completedAt={runCompletedAt ?? runStartedAt}
        onRestart={restartRun}
      />
    );
  }
  return (
    <>
      {mode === 'casual' && <DeveloperModeSwitch enabled={developerMode} onChange={setDeveloperMode} />}
      {screen}
      {mode === 'online' && roomId && (
        <OnlineRoomBar
          room={online.room}
          seat={online.seat}
          connection={online.connection}
          error={online.error}
          copied={inviteCopied}
          onCopy={copyInvitation}
          onLeave={leaveOnline}
        />
      )}
      {pendingHatches && (
        <EggHatchRevealSequence hatches={pendingHatches} onComplete={() => setPendingHatches(undefined)} />
      )}
    </>
  );
}
