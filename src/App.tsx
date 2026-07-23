import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { simulateBattle } from './core/battle';
import { inheritanceSkillChoices } from './core/breeding';
import { createGhostTeam } from './core/ghost';
import { definitionFor, effectiveStarsFor, permanentStatsFor, skillIdsFor, targetRulesForSkill } from './core/monster';
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

type WorkshopTab = 'shop' | 'breed' | 'tactics';
type BattleViewState = {
  result: BattleResult;
  enemy: MonsterInstance[];
  frameIndex: number;
  playing: boolean;
};

const query = new URLSearchParams(window.location.search);
const requestedSeed = Number(query.get('seed'));
const INITIAL_SEED = Number.isInteger(requestedSeed) && requestedSeed > 0 ? requestedSeed : 7261;

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
  <>
    <span className="white-stars">{'★'.repeat(whiteStars)}</span>
    {colorStars > 0 && <span className="color-stars">{'★'.repeat(colorStars)}</span>}
  </>
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
  return (
    <div className={`monster-sigil is-${size}`} style={monsterStyle(data, definition)} aria-hidden="true">
      <span>{definition.glyph}</span>
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
      {footer && <div className="monster-card-footer">{footer}</div>}
    </>
  );
  return onClick ? (
    <button
      className={`definition-card${selected ? ' is-selected' : ''}`}
      style={monsterStyle(data, definition)}
      type="button"
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <article className={`definition-card${selected ? ' is-selected' : ''}`} style={monsterStyle(data, definition)}>
      {content}
    </article>
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
        <p>光・闇・火は配合の血筋。戦闘相性ではありません。3回選ぶと最初のチームが完成します。</p>
      </section>
      <div className="draft-grid">
        {run.draftChoices.map((definitionId) => {
          const definition = definitionById(GAME_DATA, definitionId);
          const trait = GAME_DATA.traits.find((entry) => entry.id === definition.traitId);
          return (
            <DefinitionCard
              key={definitionId}
              data={GAME_DATA}
              definition={definition}
              eyebrow={`${lineageName(GAME_DATA, definition)} / ${attributeName(GAME_DATA, definition)}`}
              onClick={() => onChoose(definitionId)}
              footer={
                <>
                  <span>{trait?.name}</span>
                  <b>この仲間を迎える →</b>
                </>
              }
            />
          );
        })}
      </div>
      <p className="prototype-note">PROTOTYPE RULESET · 12 CYCLES · ASYNC GHOST</p>
    </main>
  );
}

function RosterCard({
  monster,
  active,
  selected,
  onSelect,
}: {
  monster: MonsterInstance;
  active: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const definition = definitionFor(GAME_DATA, monster);
  return (
    <button
      type="button"
      className={`roster-card${selected ? ' is-selected' : ''}${active ? ' is-active' : ''}`}
      style={monsterStyle(GAME_DATA, definition)}
      onClick={onSelect}
      aria-pressed={selected}
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
}: {
  run: CasualRunState;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const active = run.activeIds
    .map((id) => run.roster.find((monster) => monster.id === id))
    .filter((monster): monster is MonsterInstance => Boolean(monster));
  const bench = run.roster.filter((monster) => !run.activeIds.includes(monster.id));
  return (
    <aside className="team-panel panel">
      <div className="panel-heading">
        <span>01 / PARTY</span>
        <strong>{run.activeIds.length}/3</strong>
      </div>
      <h2>主力</h2>
      <div className="roster-list">
        {active.map((monster) => (
          <RosterCard
            key={monster.id}
            monster={monster}
            active
            selected={selectedId === monster.id}
            onSelect={() => onSelect(monster.id)}
          />
        ))}
        {Array.from({ length: Math.max(0, 3 - active.length) }, (_, index) => (
          <div className="empty-roster-slot" key={`active-empty-${index}`}>
            主力を配置
          </div>
        ))}
      </div>
      <div className="bench-heading">
        <h3>控え</h3>
        <span>{bench.length}/4</span>
      </div>
      <div className="roster-list is-bench">
        {bench.map((monster) => (
          <RosterCard
            key={monster.id}
            monster={monster}
            active={false}
            selected={selectedId === monster.id}
            onSelect={() => onSelect(monster.id)}
          />
        ))}
        {bench.length === 0 && <p className="muted-copy">ショップで仲間を増やせます。</p>}
      </div>
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
          return (
            <DefinitionCard
              key={offer.id}
              data={GAME_DATA}
              definition={definition}
              eyebrow={offer.lucky ? 'LUCKY RANK UP' : `${attributeName(GAME_DATA, definition)}の気配`}
              footer={
                <button
                  type="button"
                  className="buy-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCommand(buyMonster(GAME_DATA, run, offer.id), `${definition.name}が仲間になりました`);
                  }}
                >
                  迎える <b>{definition.price}</b>
                </button>
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
                <span className="equipment-glyph">{equipment.glyph}</span>
                <div>
                  <strong>{equipment.name}</strong>
                  <small>{equipment.description}</small>
                </div>
                <button
                  type="button"
                  onClick={() => onCommand(buyEquipment(GAME_DATA, run, offer.id), `${equipment.name}を購入しました`)}
                >
                  {equipment.price}
                </button>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function BreedingView({
  run,
  parentIds,
  setParentIds,
  onCommand,
}: {
  run: CasualRunState;
  parentIds: string[];
  setParentIds: (ids: string[]) => void;
  onCommand: (result: CommandResult<CasualRunState>, successMessage: string) => void;
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
  useEffect(() => {
    setCandidateId(candidates[0]?.id ?? '');
    setSkillId('');
  }, [candidates]);
  const first = run.roster.find((monster) => monster.id === parentIds[0]);
  const second = run.roster.find((monster) => monster.id === parentIds[1]);
  const candidate = candidates.find((entry) => entry.id === candidateId);
  const skillChoices = first && second && candidate ? inheritanceSkillChoices(GAME_DATA, first, second, candidate) : [];

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
        <p>親2体は旅立ち、子はLv.1から。成立する配合先はすべて表示します。</p>
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
                className={`parent-choice${parentIds.includes(monster.id) ? ' is-selected' : ''}`}
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
                <b>{eligible ? (parentIds.includes(monster.id) ? '選択中' : '選ぶ') : 'Lv.3必要'}</b>
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
          {candidates.length === 0 && (
            <div className="loom-placeholder">
              <span>?</span>
              <p>レベル3以上の親を2体選ぶと、系統×属性×実効星から候補を算出します。</p>
            </div>
          )}
          {candidates.map((entry) => {
            const definition = definitionById(GAME_DATA, entry.definitionId);
            return (
              <DefinitionCard
                key={entry.id}
                data={GAME_DATA}
                definition={definition}
                colorStars={entry.colorStars}
                eyebrow={
                  entry.kind === 'special' ? 'SPECIAL RECIPE' : entry.kind === 'same-name' ? 'COLOR STAR' : 'RANK BREED'
                }
                selected={candidateId === entry.id}
                onClick={() => setCandidateId(entry.id)}
                footer={<span>{entry.label}</span>}
              />
            );
          })}
          {candidate && (
            <div className="inheritance-control">
              <label htmlFor="inherit-skill">継承スキル（1つ）</label>
              <select id="inherit-skill" value={skillId} onChange={(event) => setSkillId(event.target.value)}>
                <option value="">継承しない</option>
                {skillChoices.map((id) => (
                  <option key={id} value={id}>
                    {GAME_DATA.skills.find((skill) => skill.id === id)?.name ?? id}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  if (!first || !second) return;
                  const result = breedInRun(GAME_DATA, run, first.id, second.id, candidate.id, skillId || undefined);
                  onCommand(result, `配合成功。ボーナスコイン +${GAME_DATA.rules.breedingCoinBonus}`);
                  if (result.ok) setParentIds([]);
                }}
              >
                この血統で配合する <span>+1 COIN</span>
              </button>
            </div>
          )}
        </div>
      </div>
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
      <section className="workshop-view empty-view">
        <p>左の名簿からモンスターを選んでください。</p>
      </section>
    );
  }
  const definition = definitionFor(GAME_DATA, monster);
  const skills = ['normal-attack', ...skillIdsFor(GAME_DATA, monster)];
  const changeRule = (index: 0 | 1 | 2, rule: GambitRule) => onChange(updateGambit(run, monster.id, index, rule));
  return (
    <section className="workshop-view tactics-view" aria-label="ガンビット">
      <div className="workshop-title">
        <div>
          <span className="section-index">GAMBIT / {definition.name}</span>
          <h2>優先行動を組む</h2>
        </div>
        <p>上から判定し、条件・MP・対象が成立した最初の行動を実行します。</p>
      </div>
      <div className="gambit-stack">
        {monster.gambits.map((rule, index) => {
          const targets = targetRulesForSkill(GAME_DATA, rule.action.skillId);
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
              </div>
            </article>
          );
        })}
      </div>
      <p className="gambit-fallback">すべて不成立なら「通常攻撃 → ランダムな敵」へフォールバック</p>
    </section>
  );
}

function Inspector({
  run,
  monster,
  onCommand,
}: {
  run: CasualRunState;
  monster?: MonsterInstance;
  onCommand: (result: CommandResult<CasualRunState>, successMessage: string) => void;
}) {
  if (!monster) {
    return (
      <aside className="inspector panel">
        <p className="muted-copy">仲間を選ぶと詳細が表示されます。</p>
      </aside>
    );
  }
  const definition = definitionFor(GAME_DATA, monster);
  const trait = GAME_DATA.traits.find((entry) => entry.id === definition.traitId);
  const stats = permanentStatsFor(GAME_DATA, monster);
  const equipped = GAME_DATA.equipment.find((entry) => entry.id === monster.equipmentId);
  const active = run.activeIds.includes(monster.id);
  return (
    <aside className="inspector panel" style={monsterStyle(GAME_DATA, definition)}>
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
      <div className="xp-track">
        <span style={{ width: `${Math.min(100, (monster.xp / 108) * 100)}%` }} />
      </div>
      <small className="xp-label">EXP {monster.xp} / 108</small>
      <div className="stat-grid">
        {STAT_LABELS.map(([id, label]) => (
          <span key={id}>
            <small>{label}</small>
            <b>
              {stats[id]}
              {id === 'crit' ? '%' : ''}
            </b>
          </span>
        ))}
      </div>
      <section className="trait-block">
        <span>TRAIT / COLOR STAGE {monster.colorStars}</span>
        <h3>{trait?.name}</h3>
        <p>{trait?.stages[monster.colorStars].description}</p>
      </section>
      <section className="skill-list">
        <span>SKILLS</span>
        {skillIdsFor(GAME_DATA, monster).map((skillId, index) => {
          const skill = GAME_DATA.skills.find((entry) => entry.id === skillId);
          return (
            <div key={`${skillId}-${index}`}>
              <b>{index === 2 && monster.inheritedSkillId ? '継' : index + 1}</b>
              <span>
                <strong>{skill?.name}</strong>
                <small>
                  MP {skill?.mpCost} · {skill?.description}
                </small>
              </span>
            </div>
          );
        })}
      </section>
      <section className="equipment-block">
        <span>EQUIPMENT</span>
        <div className="equipped-row">
          <b>{equipped?.glyph ?? '—'}</b>
          <span>{equipped ? `${equipped.name} / ${equipped.description}` : '装備なし'}</span>
          {equipped && (
            <button type="button" onClick={() => onCommand(equipItem(GAME_DATA, run, monster.id), '装備を外しました')}>
              外す
            </button>
          )}
        </div>
        {run.equipmentInventory.length > 0 && (
          <div className="inventory-list">
            {run.equipmentInventory.map((equipmentId, index) => {
              const equipment = GAME_DATA.equipment.find((entry) => entry.id === equipmentId);
              if (!equipment) return null;
              return (
                <button
                  type="button"
                  key={`${equipmentId}-${index}`}
                  onClick={() =>
                    onCommand(equipItem(GAME_DATA, run, monster.id, equipmentId), `${equipment.name}を装備しました`)
                  }
                  title={equipment.description}
                >
                  {equipment.glyph}
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
            onCommand(toggleActiveMonster(GAME_DATA, run, monster.id), active ? '控えへ移しました' : '主力へ移しました')
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
    </aside>
  );
}

function WorkshopScreen({
  run,
  setRun,
  onStartBattle,
}: {
  run: CasualRunState;
  setRun: (run: CasualRunState) => void;
  onStartBattle: () => void;
}) {
  const [tab, setTab] = useState<WorkshopTab>('shop');
  const [selectedId, setSelectedId] = useState(run.activeIds[0]);
  const [parentIds, setParentIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const selected = run.roster.find((monster) => monster.id === selectedId);

  useEffect(() => {
    if (!selected && run.roster[0]) setSelectedId(run.roster[0].id);
  }, [run.roster, selected]);

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
        <TeamPanel run={run} selectedId={selectedId} onSelect={setSelectedId} />
        <section className="workbench panel">
          <nav className="workshop-tabs" aria-label="育成メニュー">
            <button type="button" className={tab === 'shop' ? 'is-active' : ''} onClick={() => setTab('shop')}>
              <span>01</span> ショップ
            </button>
            <button type="button" className={tab === 'breed' ? 'is-active' : ''} onClick={() => setTab('breed')}>
              <span>02</span> 配合
            </button>
            <button type="button" className={tab === 'tactics' ? 'is-active' : ''} onClick={() => setTab('tactics')}>
              <span>03</span> ガンビット
            </button>
          </nav>
          {tab === 'shop' && (
            <ShopView run={run} onCommand={onCommand} onFreeze={() => setRun(toggleShopFreeze(run))} />
          )}
          {tab === 'breed' && (
            <BreedingView run={run} parentIds={parentIds} setParentIds={setParentIds} onCommand={onCommand} />
          )}
          {tab === 'tactics' && <TacticsView run={run} monster={selected} onChange={setRun} />}
        </section>
        <Inspector run={run} monster={selected} onCommand={onCommand} />
      </div>
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

function BattleMonster({ fighter, side }: { fighter: FighterSnapshot; side: 'player' | 'enemy' }) {
  const definition = definitionById(GAME_DATA, fighter.definitionId);
  const hpPercent = Math.max(0, (fighter.hp / fighter.maxHp) * 100);
  const mpPercent = Math.max(0, (fighter.mp / fighter.maxMp) * 100);
  return (
    <article
      className={`battle-monster is-${side}${fighter.alive ? '' : ' is-defeated'}`}
      style={monsterStyle(GAME_DATA, definition)}
    >
      <MonsterSigil data={GAME_DATA} definition={definition} colorStars={fighter.colorStars} size="large" />
      <div className="battle-monster-copy">
        <span>{side === 'player' ? 'YOUR LINE' : 'GHOST LINE'}</span>
        <strong>{fighter.name}</strong>
        <small>{starText(fighter.whiteStars, fighter.colorStars)}</small>
      </div>
      <div className="battle-bars">
        <div className="hp-bar">
          <span style={{ width: `${hpPercent}%` }} />
          <b>
            {fighter.hp}/{fighter.maxHp}
          </b>
        </div>
        <div className="mp-bar">
          <span style={{ width: `${mpPercent}%` }} />
          <b>MP {fighter.mp}</b>
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
      360,
    );
    return () => window.clearTimeout(timer);
  }, [battle, lastIndex, onChange]);
  if (!frame) return null;
  const players = frame.fighters.filter((fighter) => fighter.team === 'player');
  const enemies = frame.fighters.filter((fighter) => fighter.team === 'enemy');
  const complete = battle.frameIndex >= lastIndex;
  return (
    <main className="battle-screen">
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
      <section className="battlefield">
        <div className="battle-team">
          <span className="team-label">YOUR PARTY</span>
          {players.map((fighter) => (
            <BattleMonster key={fighter.id} fighter={fighter} side="player" />
          ))}
        </div>
        <div className="versus-mark" aria-hidden="true">
          <span>ATB</span>
          <b>VS</b>
          <small>3 × 3</small>
        </div>
        <div className="battle-team is-enemy">
          <span className="team-label">GHOST #{battle.enemy[0]?.id.split('-')[1] ?? '00'}</span>
          {enemies.map((fighter) => (
            <BattleMonster key={fighter.id} fighter={fighter} side="enemy" />
          ))}
        </div>
      </section>
      <section className="battle-console">
        <div>
          <span>{frame.kind.toUpperCase()}</span>
          <strong>{frame.text}</strong>
        </div>
        <div className="replay-controls">
          {!complete && (
            <>
              <button type="button" onClick={() => onChange({ ...battle, playing: !battle.playing })}>
                {battle.playing ? 'Ⅱ 一時停止' : '▶ 再生'}
              </button>
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

function ResultScreen({ run, onContinue }: { run: CasualRunState; onContinue: () => void }) {
  const result = run.lastBattle;
  const won = result?.winner === 'player';
  return (
    <main className={`result-screen${won ? ' is-win' : ''}`}>
      <RunHeader run={run} />
      <section className="result-card panel">
        <span className="section-index">CYCLE {run.cycle} / RESULT</span>
        <h2>{result?.winner === 'draw' ? '引き分け' : won ? '勝利' : '敗北'}</h2>
        <p>
          {won
            ? '血統は次の戦いへ進みます。勝利ボーナス経験値を獲得しました。'
            : '敗北しても育成は続きます。5敗するまでは立て直せます。'}
        </p>
        <div className="result-roster">
          {run.roster.map((monster) => {
            const definition = definitionFor(GAME_DATA, monster);
            return (
              <div key={monster.id}>
                <MonsterSigil data={GAME_DATA} definition={definition} colorStars={monster.colorStars} size="small" />
                <span>
                  <strong>{definition.name}</strong>
                  <small>
                    Lv.{monster.level} · EXP {monster.xp}
                  </small>
                </span>
                <b>{run.activeIds.includes(monster.id) ? '主力EXP' : '控えEXP 50%'}</b>
              </div>
            );
          })}
        </div>
        <button type="button" className="launch-button" onClick={onContinue}>
          <span>{run.completedCycles >= 12 || run.losses >= 5 ? 'RUN COMPLETE' : `NEXT CYCLE ${run.cycle + 1}`}</span>
          {run.completedCycles >= 12 || run.losses >= 5 ? '最終結果へ' : '旅を続ける'}
        </button>
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

  const startBattle = () => {
    const player = run.activeIds
      .map((id) => run.roster.find((monster) => monster.id === id))
      .filter((monster): monster is MonsterInstance => Boolean(monster));
    if (player.length !== GAME_DATA.rules.activeLimit) return;
    const battleSeed = deriveSeed(run.seed, run.cycle * 10_000 + run.commandIndex);
    const enemy = createGhostTeam(GAME_DATA, run.cycle, battleSeed);
    const result = simulateBattle(GAME_DATA, { player, enemy, seed: battleSeed });
    setRun(applyBattleResult(GAME_DATA, run, result));
    setBattle({ result, enemy, frameIndex: 0, playing: true });
  };

  if (battle) {
    return <BattleScreen battle={battle} onChange={setBattle} onFinish={() => setBattle(undefined)} />;
  }
  if (run.phase === 'draft') {
    return <DraftScreen run={run} onChoose={(id) => setRun(chooseDraftMonster(GAME_DATA, run, id))} />;
  }
  if (run.phase === 'event') {
    return <EventScreen run={run} onChoose={(id) => setRun(chooseEvent(GAME_DATA, run, id))} />;
  }
  if (run.phase === 'prepare') {
    return <WorkshopScreen run={run} setRun={setRun} onStartBattle={startBattle} />;
  }
  if (run.phase === 'result') {
    return <ResultScreen run={run} onContinue={() => setRun(continueRun(GAME_DATA, run))} />;
  }
  return (
    <FinishedScreen
      run={run}
      onRestart={() => setRun(createCasualRun(GAME_DATA, deriveSeed(run.seed, run.commandIndex + 71)))}
    />
  );
}
