import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { simulateBattle } from './core/battle';
import { breedingSkillChoices, listBreedingCandidates } from './core/breeding';
import { specialRecipeSignalsForShopOffer } from './core/catalog';
import { definitionFor, targetRulesForSkill } from './core/monster';
import { createRivalBuild } from './core/rival';
import { deriveSeed } from './core/rng';
import {
  addGambit,
  applyBattleResult,
  breedInRun,
  buyEquipment,
  buyMonster,
  chooseDraftMonster,
  chooseEvent,
  continueEvent,
  continueRun,
  createCasualRun,
  equipItem,
  removeGambit,
  rerollShop,
  sellMonster,
  skipEvent,
  toggleActiveMonster,
  toggleShopFreeze,
  updateGambit,
} from './core/run';
import type {
  BreedingCandidate,
  BattleResult,
  CasualRunState,
  CommandResult,
  FighterSnapshot,
  GambitCondition,
  MonsterDefinition,
  MonsterBattleReport,
  MonsterInstance,
  SkillDefinition,
  StatusId,
  TargetRule,
} from './core/types';
import { GAME_DATA } from './game/game-data';

type BreedingPlan = {
  first: MonsterInstance;
  second: MonsterInstance;
  candidate: BreedingCandidate;
};

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
  'lowest-hp-ally': 'HPが最も低い味方',
  'highest-hp-ally': 'HPが最も高い味方',
  'lowest-hp-enemy': 'HPが最も低い敵',
  'highest-hp-enemy': 'HPが最も高い敵',
  'highest-attack-enemy': '攻撃が最も高い敵',
  'random-enemy': 'ランダムな敵',
};

const requestedSeed = Number(new URLSearchParams(window.location.search).get('seed'));
const INITIAL_SEED = Number.isInteger(requestedSeed) && requestedSeed > 0 ? requestedSeed : 7261;

const CONDITION_OPTIONS: Array<{ label: string; value: GambitCondition }> = [
  { label: 'いつでも', value: { kind: 'always' } },
  { label: '自分 HP50%以下', value: { kind: 'self-hp-below', threshold: 50 } },
  { label: '味方 HP50%以下', value: { kind: 'ally-hp-below', threshold: 50 } },
  { label: '敵 HP50%以下', value: { kind: 'enemy-hp-below', threshold: 50 } },
  { label: '敵 HP50%以上', value: { kind: 'enemy-hp-above', threshold: 50 } },
];

const conditionKey = (condition: GambitCondition) => JSON.stringify(condition);

const lineageFor = (definition: MonsterDefinition) =>
  GAME_DATA.lineages.find((lineage) => lineage.id === definition.lineageId);

const attributeFor = (definition: MonsterDefinition) =>
  GAME_DATA.attributes.find((attribute) => attribute.id === definition.attributeId);

const traitFor = (definition: MonsterDefinition) => GAME_DATA.traits.find((trait) => trait.id === definition.traitId);

const skillFor = (skillId: string) => GAME_DATA.skills.find((skill) => skill.id === skillId);

const monsterStyle = (definition: MonsterDefinition) => {
  const attribute = attributeFor(definition);
  return {
    '--monster-color': attribute?.color ?? '#dda93a',
    '--monster-accent': attribute?.accent ?? '#fff1ba',
  } as CSSProperties;
};

function FieldSigil({
  definition,
  size = 'regular',
}: {
  definition: MonsterDefinition;
  size?: 'small' | 'regular' | 'large';
}) {
  return (
    <div
      className={`monster-sigil is-${size} is-form-${definition.appearance.form}`}
      style={monsterStyle(definition)}
      aria-hidden="true"
    >
      <span>{definition.appearance.body}</span>
      <em>{definition.appearance.attire}</em>
      <s>{definition.glyph}</s>
      <b>{lineageFor(definition)?.mark}</b>
    </div>
  );
}

function MonsterSigil({ definition }: { definition: MonsterDefinition }) {
  const attribute = attributeFor(definition);
  return (
    <span
      className="synergy-sigil"
      style={{ '--sigil-color': attribute?.color ?? '#cf5f52' } as CSSProperties}
      aria-hidden="true"
    >
      <span>{definition.glyph}</span>
      <small>{lineageFor(definition)?.mark}</small>
    </span>
  );
}

function SkillChip({ skill, source }: { skill?: SkillDefinition; source?: string }) {
  if (!skill) return null;
  return (
    <span className="synergy-skill-chip" title={skill.description}>
      {source && <small>{source}</small>}
      <b>{skill.name}</b>
      <span>MP {skill.mpCost}</span>
    </span>
  );
}

function DefinitionCard({ definition, action }: { definition: MonsterDefinition; action?: React.ReactNode }) {
  const trait = traitFor(definition);
  return (
    <article className="synergy-monster-card">
      <header>
        <MonsterSigil definition={definition} />
        <span>
          <small>
            {lineageFor(definition)?.name} / {attributeFor(definition)?.name}
          </small>
          <strong>{definition.name}</strong>
        </span>
        {definition.shopAvailability === 'breeding-only' && <em>特殊配合</em>}
      </header>
      <div className="synergy-trait">
        <small>固有特性</small>
        <b>{trait?.name}</b>
        <p>{trait?.description}</p>
      </div>
      <div className="synergy-skill-row">
        {[...definition.intrinsicSkillIds, definition.defaultSkillId].map((skillId) => (
          <SkillChip key={skillId} skill={skillFor(skillId)} />
        ))}
      </div>
      {action}
    </article>
  );
}

function MonsterCard({
  monster,
  active,
  onToggle,
  onSell,
  onEquip,
  equipmentIds = [],
}: {
  monster: MonsterInstance;
  active: boolean;
  onToggle?: () => void;
  onSell?: () => void;
  onEquip?: (equipmentId?: string) => void;
  equipmentIds?: string[];
}) {
  const definition = definitionFor(GAME_DATA, monster);
  const trait = traitFor(definition);
  return (
    <article className={`synergy-monster-card instance ${active ? 'is-active' : ''}`}>
      <header>
        <MonsterSigil definition={definition} />
        <span>
          <small>{active ? '主力' : '控え'}</small>
          <strong>{definition.name}</strong>
        </span>
      </header>
      <div className="synergy-trait compact">
        <small>固有特性</small>
        <b>{trait?.name}</b>
        <p>{trait?.description}</p>
      </div>
      <div className="synergy-skill-row">
        {monster.skillIds.map((skillId) => (
          <SkillChip key={skillId} skill={skillFor(skillId)} />
        ))}
      </div>
      {onEquip && (
        <label className="synergy-equip-select">
          装備
          <select value={monster.equipmentId ?? ''} onChange={(event) => onEquip(event.target.value || undefined)}>
            <option value="">なし</option>
            {[monster.equipmentId, ...equipmentIds]
              .filter((id, index, ids): id is string => Boolean(id) && ids.indexOf(id) === index)
              .map((equipmentId) => {
                const equipment = GAME_DATA.equipment.find((entry) => entry.id === equipmentId);
                return equipment ? (
                  <option key={equipment.id} value={equipment.id}>
                    {equipment.name}
                  </option>
                ) : null;
              })}
          </select>
        </label>
      )}
      {(onToggle || onSell) && (
        <footer>
          {onToggle && <button onClick={onToggle}>{active ? '控えへ' : '主力へ'}</button>}
          {onSell && !active && <button onClick={onSell}>別れる +{definition.sellPrice}</button>}
        </footer>
      )}
    </article>
  );
}

function capabilityForSkill(skill: SkillDefinition) {
  if (skill.effects.some((effect) => effect.kind === 'heal')) return '回復';
  if (skill.effects.some((effect) => effect.kind === 'shield')) return '防壁';
  if (skill.effects.some((effect) => effect.kind === 'status' && effect.statusId.endsWith('-up'))) return '強化';
  if (skill.effects.some((effect) => effect.kind === 'status')) return '妨害';
  if (skill.effects.some((effect) => effect.kind === 'atb' || effect.kind === 'mp')) return '加速';
  return '攻撃';
}

function SynergyBoard({ monsters }: { monsters: MonsterInstance[] }) {
  const coverage = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const monster of monsters) {
      const name = definitionFor(GAME_DATA, monster).name;
      for (const skillId of monster.skillIds) {
        const skill = skillFor(skillId);
        if (!skill) continue;
        const capability = capabilityForSkill(skill);
        map.set(capability, [...(map.get(capability) ?? []), name]);
      }
    }
    return map;
  }, [monsters]);
  return (
    <aside className="synergy-board">
      <div>
        <small>TEAM SYNERGY</small>
        <h2>役割の噛み合わせ</h2>
      </div>
      <div className="synergy-coverage">
        {['攻撃', '回復', '防壁', '強化', '妨害', '加速'].map((capability) => {
          const owners = coverage.get(capability) ?? [];
          return (
            <span key={capability} className={owners.length > 0 ? 'is-covered' : 'is-gap'}>
              <b>{capability}</b>
              <small>{owners.length > 0 ? `${new Set(owners).size}体` : '空き'}</small>
            </span>
          );
        })}
      </div>
      <p>特性と3つのスキルを見比べ、足りない役割をショップか特殊配合で補う。</p>
    </aside>
  );
}

function DraftScreen({ run, onChoose }: { run: CasualRunState; onChoose: (id: string) => void }) {
  return (
    <main className="synergy-shell synergy-draft">
      <header className="synergy-title">
        <small>FIELD JOURNAL / ENTRY {run.draftRound}</small>
        <h1>血統航路</h1>
        <p>固有特性と3つのスキルを読み、最初の3体を組む。</p>
      </header>
      <section className="synergy-draft-grid">
        {run.draftChoices.map((id) => {
          const definition = GAME_DATA.monsters.find((monster) => monster.id === id);
          return definition ? (
            <DefinitionCard
              key={id}
              definition={definition}
              action={
                <button className="synergy-primary" onClick={() => onChoose(id)}>
                  この個体を迎える
                </button>
              }
            />
          ) : null;
        })}
      </section>
    </main>
  );
}

function RunHeader({ run, onReset }: { run: CasualRunState; onReset?: () => void }) {
  return (
    <>
      <header className="run-header">
        <div className="brand-lockup">
          <span>CODE MONSTERS // FIELD LAB</span>
          <h1>血統航路</h1>
        </div>
        <div className="run-header-tools">
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
          {onReset && (
            <button type="button" className="synergy-reset-button" onClick={onReset}>
              リセット
            </button>
          )}
        </div>
      </header>
      <div className="cycle-rail" aria-label={`全${GAME_DATA.rules.maxCycles}サイクル中${run.cycle}サイクル`}>
        {Array.from({ length: GAME_DATA.rules.maxCycles }, (_, index) => {
          const cycle = index + 1;
          return (
            <span
              key={cycle}
              className={`${cycle <= run.completedCycles ? 'is-complete' : ''}${cycle === run.cycle ? ' is-current' : ''}`}
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

function TeamView({ run, commit }: { run: CasualRunState; commit: (result: CommandResult<CasualRunState>) => void }) {
  const active = run.activeIds.flatMap((id) => {
    const monster = run.roster.find((entry) => entry.id === id);
    return monster ? [monster] : [];
  });
  const bench = run.roster.filter((monster) => !run.activeIds.includes(monster.id));
  const equip = (monster: MonsterInstance, equipmentId?: string) =>
    commit(equipItem(GAME_DATA, run, monster.id, equipmentId));
  return (
    <div className="synergy-two-column">
      <section>
        <div className="synergy-section-title">
          <span>01</span>
          <div>
            <h2>主力3体</h2>
            <p>戦う順ではなく、役割の組み合わせを決める。</p>
          </div>
        </div>
        <div className="synergy-card-grid active-grid">
          {active.map((monster) => (
            <MonsterCard
              key={monster.id}
              monster={monster}
              active
              onToggle={() => commit(toggleActiveMonster(GAME_DATA, run, monster.id))}
              onEquip={(id) => equip(monster, id)}
              equipmentIds={run.equipmentInventory}
            />
          ))}
        </div>
        <div className="synergy-section-title">
          <span>02</span>
          <div>
            <h2>控え</h2>
            <p>配合素材もここで即座に使える。</p>
          </div>
        </div>
        <div className="synergy-card-grid bench-grid">
          {bench.length === 0 && <p className="synergy-empty">ショップで仲間を増やすと、配合ルートが開きます。</p>}
          {bench.map((monster) => (
            <MonsterCard
              key={monster.id}
              monster={monster}
              active={false}
              onToggle={() => commit(toggleActiveMonster(GAME_DATA, run, monster.id))}
              onSell={() => commit(sellMonster(GAME_DATA, run, monster.id))}
              onEquip={(id) => equip(monster, id)}
              equipmentIds={run.equipmentInventory}
            />
          ))}
        </div>
      </section>
      <SynergyBoard monsters={active} />
    </div>
  );
}

function ShopView({
  run,
  commit,
  setRun,
}: {
  run: CasualRunState;
  commit: (result: CommandResult<CasualRunState>) => void;
  setRun: (run: CasualRunState) => void;
}) {
  const shelfIds = run.shop?.monsters.flatMap((offer) => (offer ? [offer.definitionId] : [])) ?? [];
  const rosterIds = run.roster.map((monster) => monster.definitionId);
  return (
    <section>
      <div className="synergy-section-title">
        <span>SHOP</span>
        <div>
          <h2>探索商会</h2>
          <p>光る札は、手持ちか同じ棚の商品と特殊配合できます。</p>
        </div>
      </div>
      <div className="synergy-shop-actions">
        <button onClick={() => commit(rerollShop(GAME_DATA, run))}>
          品揃え更新 −{run.freeRerolls > 0 ? 0 : GAME_DATA.rules.shop.rerollCost}
        </button>
        <button onClick={() => setRun(toggleShopFreeze(run))}>{run.shop?.frozen ? '固定を解除' : '棚を固定'}</button>
      </div>
      <div className="synergy-card-grid shop-grid">
        {run.shop?.monsters.map((offer, index) => {
          if (!offer)
            return (
              <div className="synergy-sold" key={`sold-${index}`}>
                SOLD
              </div>
            );
          const definition = GAME_DATA.monsters.find((monster) => monster.id === offer.definitionId);
          if (!definition) return null;
          const signals = specialRecipeSignalsForShopOffer(GAME_DATA, definition.id, rosterIds, shelfIds);
          const best = signals[0];
          const result = best && GAME_DATA.monsters.find((monster) => monster.id === best.resultDefinitionId);
          return (
            <div className={signals.length > 0 ? 'synergy-shop-signal' : ''} key={offer.id}>
              {best && (
                <div className="synergy-signal-label">
                  ◆ 特殊配合 {best.source === 'roster' ? '成立' : '棚で成立'} → {result?.name}
                </div>
              )}
              <DefinitionCard
                definition={definition}
                action={
                  <button
                    className="synergy-primary"
                    disabled={run.coins < definition.price}
                    onClick={() => commit(buyMonster(GAME_DATA, run, offer.id))}
                  >
                    {definition.price}コインで迎える
                  </button>
                }
              />
            </div>
          );
        })}
      </div>
      <div className="synergy-section-title compact">
        <span>GEAR</span>
        <div>
          <h2>装備</h2>
        </div>
      </div>
      <div className="synergy-equipment-row">
        {run.shop?.equipment.map((offer, index) => {
          if (!offer) return <span key={`gear-sold-${index}`}>SOLD</span>;
          const equipment = GAME_DATA.equipment.find((entry) => entry.id === offer.equipmentId);
          return equipment ? (
            <button
              key={offer.id}
              disabled={run.coins < equipment.price}
              onClick={() => commit(buyEquipment(GAME_DATA, run, offer.id))}
            >
              <b>{equipment.name}</b>
              <small>{equipment.description}</small>
              <em>{equipment.price} coin</em>
            </button>
          ) : null;
        })}
      </div>
    </section>
  );
}

function BreedingDialog({
  plan,
  run,
  onClose,
  onComplete,
}: {
  plan: BreedingPlan;
  run: CasualRunState;
  onClose: () => void;
  onComplete: (result: CommandResult<CasualRunState>) => void;
}) {
  const child = GAME_DATA.monsters.find((monster) => monster.id === plan.candidate.definitionId);
  const choices = child ? breedingSkillChoices(GAME_DATA, plan.first, plan.second, plan.candidate) : [];
  const [selected, setSelected] = useState<string[]>(child ? [...child.intrinsicSkillIds, child.defaultSkillId] : []);
  if (!child) return null;
  const firstName = definitionFor(GAME_DATA, plan.first).name;
  const secondName = definitionFor(GAME_DATA, plan.second).name;
  const sourcesFor = (skillId: string) =>
    [
      ...(plan.first.skillIds.includes(skillId) ? ['親1'] : []),
      ...(plan.second.skillIds.includes(skillId) ? ['親2'] : []),
      ...([...child.intrinsicSkillIds, child.defaultSkillId].includes(skillId) ? ['子'] : []),
    ].join('・');
  const toggle = (skillId: string) =>
    setSelected((current) =>
      current.includes(skillId)
        ? current.filter((id) => id !== skillId)
        : current.length < 3
          ? [...current, skillId]
          : current,
    );
  const submit = () => {
    if (selected.length !== 3) return;
    onComplete(
      breedInRun(
        GAME_DATA,
        run,
        plan.first.id,
        plan.second.id,
        plan.candidate.id,
        selected as [string, string, string],
      ),
    );
  };
  return (
    <div className="synergy-overlay" role="dialog" aria-modal="true" aria-label="特殊配合のスキル選択">
      <div className="synergy-breeding-dialog">
        <button className="synergy-close" onClick={onClose}>
          閉じる
        </button>
        <small>SPECIAL BREEDING / TRAIT IS FIXED</small>
        <h2>
          {firstName} × {secondName}
        </h2>
        <div className="synergy-child-preview">
          <MonsterSigil definition={child} />
          <div>
            <small>生まれるモンスター</small>
            <h3>{child.name}</h3>
            <b>固有特性「{traitFor(child)?.name}」</b>
            <p>{traitFor(child)?.description}</p>
          </div>
        </div>
        <div className="synergy-gene-slots" aria-label="選択した3つのスキル">
          {[0, 1, 2].map((slot) => (
            <span key={slot} className={selected[slot] ? 'is-filled' : ''}>
              <small>GENE {slot + 1}</small>
              <b>{selected[slot] ? skillFor(selected[slot])?.name : '未選択'}</b>
            </span>
          ))}
        </div>
        <p className="synergy-instruction">親1・親2・子のスキル候補から、重複しない3つを選択。</p>
        <div className="synergy-skill-pool">
          {choices.map((skillId) => {
            const skill = skillFor(skillId);
            const isSelected = selected.includes(skillId);
            return skill ? (
              <button key={skillId} className={isSelected ? 'is-selected' : ''} onClick={() => toggle(skillId)}>
                <SkillChip skill={skill} source={sourcesFor(skillId)} />
                <p>{skill.description}</p>
              </button>
            ) : null;
          })}
        </div>
        <button className="synergy-primary synergy-breed-submit" disabled={selected.length !== 3} onClick={submit}>
          この3スキルで特殊配合する
        </button>
      </div>
    </div>
  );
}

function BreedingView({
  run,
  onComplete,
}: {
  run: CasualRunState;
  onComplete: (result: CommandResult<CasualRunState>) => void;
}) {
  const [plan, setPlan] = useState<BreedingPlan>();
  const availablePlans = useMemo(
    () =>
      run.roster.flatMap((first, firstIndex) =>
        run.roster
          .slice(firstIndex + 1)
          .flatMap((second) =>
            listBreedingCandidates(GAME_DATA, first, second).map((candidate) => ({ first, second, candidate })),
          ),
      ),
    [run.roster],
  );
  const recipesByChild = useMemo(
    () =>
      GAME_DATA.monsters
        .filter((monster) => monster.shopAvailability === 'breeding-only')
        .map((child) => ({
          child,
          recipes: GAME_DATA.specialRecipes.filter((recipe) => recipe.resultDefinitionId === child.id),
        })),
    [],
  );
  const availableRecipeIds = new Set(availablePlans.map((entry) => entry.candidate.recipeId));
  return (
    <section>
      <div className="synergy-section-title">
        <span>LAB</span>
        <div>
          <h2>特殊配合図</h2>
          <p>欲しい固有特性から逆算する。成立中の組み合わせは最上段に表示。</p>
        </div>
      </div>
      <div className="synergy-ready-recipes">
        <h3>いま配合できる組み合わせ</h3>
        {availablePlans.length === 0 && (
          <p className="synergy-empty">まだ成立していません。下の配合図を見て、ショップで親を揃えましょう。</p>
        )}
        {availablePlans.map((entry) => {
          const child = GAME_DATA.monsters.find((monster) => monster.id === entry.candidate.definitionId);
          return child ? (
            <button key={`${entry.first.id}:${entry.second.id}:${entry.candidate.id}`} onClick={() => setPlan(entry)}>
              <span>
                {definitionFor(GAME_DATA, entry.first).name} × {definitionFor(GAME_DATA, entry.second).name}
              </span>
              <b>→ {child.name}</b>
              <small>固定特性: {traitFor(child)?.name}</small>
            </button>
          ) : null;
        })}
      </div>
      <div className="synergy-recipe-grid">
        {recipesByChild.map(({ child, recipes }) => (
          <article
            key={child.id}
            className={recipes.some((recipe) => availableRecipeIds.has(recipe.id)) ? 'is-ready' : ''}
          >
            <header>
              <MonsterSigil definition={child} />
              <div>
                <small>特殊配合限定</small>
                <b>{child.name}</b>
                <em>{traitFor(child)?.name}</em>
              </div>
            </header>
            {recipes.map((recipe) => {
              const [left, right] = recipe.parentDefinitionIds.map((id) =>
                GAME_DATA.monsters.find((monster) => monster.id === id),
              );
              return (
                <p key={recipe.id} className={availableRecipeIds.has(recipe.id) ? 'is-ready' : ''}>
                  <span>{left?.name}</span>
                  <i>×</i>
                  <span>{right?.name}</span>
                </p>
              );
            })}
          </article>
        ))}
      </div>
      {plan && (
        <BreedingDialog
          plan={plan}
          run={run}
          onClose={() => setPlan(undefined)}
          onComplete={(result) => {
            if (result.ok) setPlan(undefined);
            onComplete(result);
          }}
        />
      )}
    </section>
  );
}

function TacticsView({
  run,
  setRun,
  initialMonsterId,
}: {
  run: CasualRunState;
  setRun: (run: CasualRunState) => void;
  initialMonsterId?: string;
}) {
  const [monsterId, setMonsterId] = useState(initialMonsterId ?? run.activeIds[0] ?? run.roster[0]?.id ?? '');
  const monster = run.roster.find((entry) => entry.id === monsterId) ?? run.roster[0];
  if (!monster) return null;
  const updateAction = (index: number, skillId: string) => {
    const target = targetRulesForSkill(GAME_DATA, skillId)[0] ?? 'random-enemy';
    setRun(updateGambit(run, monster.id, index, { ...monster.gambits[index], action: { skillId, target } }));
  };
  return (
    <section>
      <div className="synergy-section-title">
        <span>AI</span>
        <div>
          <h2>作戦盤</h2>
          <p>上から条件を判定。どれにも当てはまらなければ通常攻撃。</p>
        </div>
      </div>
      <select
        className="synergy-monster-select"
        value={monster.id}
        onChange={(event) => setMonsterId(event.target.value)}
      >
        {run.roster.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {definitionFor(GAME_DATA, entry).name}
          </option>
        ))}
      </select>
      <div className="synergy-gambits">
        {monster.gambits.map((gambit, index) => (
          <article key={`${monster.id}-${index}`}>
            <b>RULE {index + 1}</b>
            <select
              value={conditionKey(gambit.condition)}
              onChange={(event) => {
                const condition = CONDITION_OPTIONS.find(
                  (option) => conditionKey(option.value) === event.target.value,
                )?.value;
                if (condition) setRun(updateGambit(run, monster.id, index, { ...gambit, condition }));
              }}
            >
              {CONDITION_OPTIONS.map((option) => (
                <option key={conditionKey(option.value)} value={conditionKey(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
            <span>なら</span>
            <select value={gambit.action.skillId} onChange={(event) => updateAction(index, event.target.value)}>
              {monster.skillIds.map((skillId) => (
                <option key={skillId} value={skillId}>
                  {skillFor(skillId)?.name}
                </option>
              ))}
              <option value="normal-attack">通常攻撃</option>
            </select>
            <select
              value={gambit.action.target}
              onChange={(event) =>
                setRun(
                  updateGambit(run, monster.id, index, {
                    ...gambit,
                    action: { ...gambit.action, target: event.target.value as typeof gambit.action.target },
                  }),
                )
              }
            >
              {targetRulesForSkill(GAME_DATA, gambit.action.skillId).map((target) => (
                <option key={target} value={target}>
                  {TARGET_LABELS[target]}
                </option>
              ))}
            </select>
            <button disabled={monster.gambits.length <= 2} onClick={() => setRun(removeGambit(run, monster.id, index))}>
              削除
            </button>
          </article>
        ))}
      </div>
      <button
        disabled={monster.gambits.length >= 6}
        onClick={() =>
          setRun(
            addGambit(run, monster.id, {
              condition: { kind: 'always' },
              action: {
                skillId: monster.skillIds[0],
                target: targetRulesForSkill(GAME_DATA, monster.skillIds[0])[0] ?? 'random-enemy',
              },
            }),
          )
        }
      >
        ルールを追加
      </button>
    </section>
  );
}

function FieldGuide() {
  return (
    <section>
      <div className="synergy-section-title">
        <span>FIELD</span>
        <div>
          <h2>モンスター図鑑</h2>
          <p>店頭種と特殊配合種を、固有特性とスキル構成で比較。</p>
        </div>
      </div>
      <div className="synergy-guide-grid">
        {GAME_DATA.monsters.map((definition) => (
          <DefinitionCard key={definition.id} definition={definition} />
        ))}
      </div>
    </section>
  );
}

function EventScreen({ run, setRun }: { run: CasualRunState; setRun: (run: CasualRunState) => void }) {
  return (
    <main className="synergy-shell">
      <RunHeader run={run} onReset={() => setRun(createCasualRun(GAME_DATA, INITIAL_SEED))} />
      <div className="synergy-section-title">
        <span>EVENT</span>
        <div>
          <h2>旅の分岐</h2>
          <p>次の編成判断に効く資源を選ぶ。</p>
        </div>
      </div>
      <div className="synergy-event-grid">
        {run.eventChoices.map((id) => {
          const event = GAME_DATA.events.find((entry) => entry.id === id);
          return event ? (
            <button key={id} onClick={() => setRun(chooseEvent(GAME_DATA, run, id))}>
              <span>{event.glyph}</span>
              <b>{event.name}</b>
              <p>{event.description}</p>
            </button>
          ) : null;
        })}
      </div>
      <button onClick={() => setRun(skipEvent(GAME_DATA, run))}>何も選ばず進む</button>
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
  const definition = GAME_DATA.monsters.find((monster) => monster.id === fighter.definitionId);
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
  if (!definition) return null;
  const hpPercent = Math.max(0, (displayedHp / fighter.maxHp) * 100);
  const mpPercent = Math.max(0, (fighter.mp / fighter.maxMp) * 100);
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
      data-hp-pending={displayedHp !== fighter.hp}
      data-hp-reveal-delay-ms={hpRevealDelayMs}
      style={monsterStyle(definition)}
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
            <span className={`status-callout is-${entry.tone}`} key={`${entry.label}-${index}`}>
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
      <FieldSigil definition={definition} size="large" />
      <div className="battle-monster-copy">
        <span>{side === 'player' ? 'YOUR LINE' : 'GHOST LINE'}</span>
        <strong>{fighter.name}</strong>
        <small>特性「{traitFor(definition)?.name}」</small>
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

type BattleOpeningPoint = { id: string; x: number; y: number };
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
      data-opening-order={order}
      data-opening-source={source.kind}
      data-opening-total={total}
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
                key={target.id}
                pathLength="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          <aside className="battle-opening-source" style={{ left: `${badgeX}px`, top: `${layout.source.y}px` }}>
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
      shieldDelta === 0 ? [] : [{ label: `盾 ${shieldDelta > 0 ? '+' : ''}${shieldDelta}`, tone: 'shield' as const }];
    const resources =
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
    return [...statuses, ...shield, ...resources];
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
          {!complete ? (
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
          ) : (
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
      : (skillFor(skillId)?.name ?? skillId);

function MonsterCombatLedger({
  report,
  finalSnapshot,
}: {
  report: MonsterBattleReport;
  finalSnapshot?: FighterSnapshot;
}) {
  const definition = GAME_DATA.monsters.find((monster) => monster.id === report.definitionId);
  if (!definition) return null;
  const metrics = [
    ['DMG', report.damageDealt, '与ダメージ'],
    ['TAKEN', report.damageTaken, '被ダメージ'],
    ['HEAL', report.healingDone, '回復'],
    ['SHIELD', report.shieldingDone, '盾付与'],
    ['BUFF', report.buffApplications, '強化'],
    ['ACTION', report.actions, '行動'],
  ] as const;
  const breakdown = Object.entries(report.skillBreakdown).filter(([, contribution]) => contribution.uses > 0);
  return (
    <article className="combat-ledger-card" style={monsterStyle(definition)}>
      <header>
        <FieldSigil definition={definition} size="small" />
        <span>
          <small>
            {finalSnapshot?.alive ? 'SURVIVED' : 'DOWN'} · 特性「{traitFor(definition)?.name}」
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
      <details className="skill-ledger">
        <summary>スキル別の内訳</summary>
        <div>
          {breakdown.map(([skillId, contribution]) => (
            <span key={skillId}>
              <strong>{reportSkillName(skillId)}</strong>
              <i>{contribution.uses}回</i>
              <small>
                DMG {Math.round(contribution.damage)} · HEAL {Math.round(contribution.healing)} · SHIELD{' '}
                {Math.round(contribution.shielding)}
              </small>
            </span>
          ))}
        </div>
      </details>
    </article>
  );
}

function CombatLedger({ result }: { result: BattleResult }) {
  const finalById = new Map(result.frames.at(-1)?.fighters.map((fighter) => [fighter.id, fighter]) ?? []);
  const reportsFor = (team: 'player' | 'enemy') => result.monsterReports.filter((report) => report.team === team);
  const topDamage = [...result.monsterReports].sort((left, right) => right.damageDealt - left.damageDealt)[0];
  const topSupport = [...result.monsterReports].sort(
    (left, right) => right.healingDone + right.shieldingDone - (left.healingDone + left.shieldingDone),
  )[0];
  return (
    <section className="combat-ledger">
      <div className="result-section-heading">
        <div>
          <span>02 / TACTICAL LEDGER</span>
          <h3>勝因と敗因</h3>
        </div>
        <small>特性×3スキルの機能を両陣営で比較</small>
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
          <b>{Math.round((topSupport?.healingDone ?? 0) + (topSupport?.shieldingDone ?? 0))} SUPPORT</b>
        </span>
        <span>
          <small>戦闘時間</small>
          <strong>{result.durationSeconds.toFixed(1)}s</strong>
          <b>DETERMINISTIC</b>
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
              <MonsterCombatLedger key={report.id} report={report} finalSnapshot={finalById.get(report.id)} />
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}

function ResultScreen({ run, setRun }: { run: CasualRunState; setRun: (run: CasualRunState) => void }) {
  const result = run.lastBattle;
  if (!result) return null;
  const won = result.winner === 'player';
  const finalFrame = result.frames.at(-1);
  const survivors = finalFrame?.fighters.filter((fighter) => fighter.team === 'player' && fighter.alive).length ?? 0;
  return (
    <main className={`result-screen reveal-stage-3${won ? ' is-win' : ''}`}>
      <RunHeader run={run} />
      <section className="result-stage panel">
        <header className="result-hero">
          <div>
            <span className="section-index">CYCLE {run.cycle} / BATTLE REPORT</span>
            <h2>{result.winner === 'draw' ? '引き分け' : won ? '勝利' : '敗北'}</h2>
            <p>行動順、スキル発動、支援量を確認し、次の編成と特殊配合へつなげる。</p>
          </div>
          <div className="result-seal" aria-hidden="true">
            <span>{won ? 'CLEAR' : result.winner === 'draw' ? 'DRAW' : 'RETRY'}</span>
            <b>{String(run.cycle).padStart(2, '0')}</b>
          </div>
        </header>
        <section className="battle-report">
          <div className="result-section-heading">
            <div>
              <span>01 / COMBAT DATA</span>
              <h3>戦闘報告</h3>
            </div>
            <small>決定論的リプレイ記録</small>
          </div>
          <div className="battle-report-grid">
            {[
              ['TIME', `${result.durationSeconds.toFixed(1)}s`, '戦闘時間'],
              ['DAMAGE', String(result.damageByTeam.player), '与ダメージ'],
              ['RECEIVED', String(result.damageByTeam.enemy), '被ダメージ'],
              ['SURVIVORS', `${survivors}/3`, '生存'],
            ].map(([id, value, label]) => (
              <div className="battle-report-metric" key={id}>
                <span>{id}</span>
                <b>{value}</b>
                <small>{label}</small>
              </div>
            ))}
          </div>
        </section>
        <CombatLedger result={result} />
        <footer className="result-actions">
          <button type="button" className="launch-button" onClick={() => setRun(continueRun(GAME_DATA, run))}>
            <span>RETURN TO FIELD LAB</span>
            {run.completedCycles >= GAME_DATA.rules.maxCycles || run.losses >= GAME_DATA.rules.maxLosses
              ? 'ラン結果へ'
              : '次のサイクルへ'}
          </button>
        </footer>
      </section>
    </main>
  );
}

function FinishedScreen({ run, onReset }: { run: CasualRunState; onReset: () => void }) {
  return (
    <main className="synergy-shell synergy-result">
      <small>RUN COMPLETE</small>
      <h1>
        {run.wins}勝 {run.losses}敗
      </h1>
      <p>完成した3体の特性とスキル構成が、このランの答えです。</p>
      <SynergyBoard
        monsters={run.activeIds.flatMap((id) => {
          const monster = run.roster.find((entry) => entry.id === id);
          return monster ? [monster] : [];
        })}
      />
      <button className="synergy-primary" onClick={onReset}>
        新しいラン
      </button>
    </main>
  );
}

function RosterSpecimenCard({
  monster,
  active,
  onOpen,
}: {
  monster: MonsterInstance;
  active: boolean;
  onOpen: () => void;
}) {
  const definition = definitionFor(GAME_DATA, monster);
  const trait = traitFor(definition);
  return (
    <button
      type="button"
      className="roster-card"
      style={monsterStyle(definition)}
      onClick={onOpen}
      aria-label={`${definition.name}の特性・スキル・作戦を開く`}
    >
      <span className="roster-identity">
        <small>{active ? 'ACTIVE' : 'BENCH'}</small>
        <FieldSigil definition={definition} />
        <strong>{definition.name}</strong>
        <i>固有特性「{trait?.name}」</i>
        <em>{monster.skillIds.map((id) => skillFor(id)?.name).join(' / ')}</em>
      </span>
    </button>
  );
}

function OneScreenTeamPanel({ run, onOpen }: { run: CasualRunState; onOpen: (monsterId: string) => void }) {
  const active = run.activeIds.flatMap((id) => {
    const monster = run.roster.find((entry) => entry.id === id);
    return monster ? [monster] : [];
  });
  const bench = run.roster.filter((monster) => !run.activeIds.includes(monster.id));
  return (
    <section className="team-panel panel" aria-label="編成一覧">
      <header className="panel-heading">
        <span>01 / PARTY BOARD</span>
        <strong>カードを選ぶと詳細・作戦</strong>
      </header>
      <div className="team-zone is-active">
        <div className="team-zone-label">
          <h2>主力</h2>
          <span>{active.length}/3</span>
        </div>
        <div className="roster-list">
          {active.map((monster) => (
            <RosterSpecimenCard key={monster.id} monster={monster} active onOpen={() => onOpen(monster.id)} />
          ))}
          {Array.from({ length: Math.max(0, 3 - active.length) }, (_, index) => (
            <span className="empty-roster-slot" key={`active-empty-${index}`}>
              +
            </span>
          ))}
        </div>
      </div>
      <div className="team-zone is-bench">
        <div className="team-zone-label">
          <h3>控え</h3>
          <span>{bench.length}/4</span>
        </div>
        <div className="roster-list is-bench">
          {bench.map((monster) => (
            <RosterSpecimenCard key={monster.id} monster={monster} active={false} onOpen={() => onOpen(monster.id)} />
          ))}
          {Array.from({ length: Math.max(0, 4 - bench.length) }, (_, index) => (
            <span className="empty-roster-slot is-bench" key={`bench-empty-${index}`}>
              +
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function OneScreenShop({
  run,
  commit,
  onFreeze,
}: {
  run: CasualRunState;
  commit: (result: CommandResult<CasualRunState>) => void;
  onFreeze: () => void;
}) {
  const shelfIds = run.shop?.monsters.flatMap((offer) => (offer ? [offer.definitionId] : [])) ?? [];
  const rosterIds = run.roster.map((monster) => monster.definitionId);
  return (
    <div className="shop-view workshop-view">
      <header className="workshop-title">
        <div>
          <span className="section-index">02 / FIELD SHOP</span>
          <h2>探索商会</h2>
          <small className="shop-stock-readout">特性と3スキルを見比べて、編成の穴を埋める</small>
        </div>
        <div className="shop-actions">
          <button type="button" onClick={() => commit(rerollShop(GAME_DATA, run))}>
            更新 −{run.freeRerolls > 0 ? 0 : GAME_DATA.rules.shop.rerollCost}
          </button>
          <button type="button" onClick={onFreeze}>
            {run.shop?.frozen ? '固定解除' : '棚を固定'}
          </button>
        </div>
      </header>
      <div className="shop-monsters">
        {run.shop?.monsters.map((offer, index) => {
          if (!offer)
            return (
              <div className="sold-slot" key={`sold-${index}`}>
                SOLD
              </div>
            );
          const definition = GAME_DATA.monsters.find((entry) => entry.id === offer.definitionId);
          if (!definition) return null;
          const signals = specialRecipeSignalsForShopOffer(GAME_DATA, definition.id, rosterIds, shelfIds);
          const signal = signals[0];
          const result = signal && GAME_DATA.monsters.find((entry) => entry.id === signal.resultDefinitionId);
          return (
            <article
              className={`definition-card shop-offer-card${signal ? ' has-recipe-signal' : ''}`}
              key={offer.id}
              style={monsterStyle(definition)}
            >
              <div className="definition-card-main">
                <span className="shop-offer-attribute">{attributeFor(definition)?.name}</span>
                <FieldSigil definition={definition} />
                <span className="monster-card-copy">
                  <strong>{definition.name}</strong>
                  <small>特性「{traitFor(definition)?.name}」</small>
                  <small>
                    {[...definition.intrinsicSkillIds, definition.defaultSkillId]
                      .map((id) => skillFor(id)?.name)
                      .join(' / ')}
                  </small>
                </span>
              </div>
              {signal && (
                <div className="shop-recipe-signal">
                  <span>◆ 特殊配合</span>
                  <strong>{result?.name}</strong>
                  <small>{signal.source === 'roster' ? '手持ちで成立' : '棚内で成立'}</small>
                </div>
              )}
              <footer className="monster-card-footer shop-card-footer">
                <div className="shop-card-actions">
                  <button
                    type="button"
                    className="buy-button"
                    disabled={run.coins < definition.price}
                    onClick={() => commit(buyMonster(GAME_DATA, run, offer.id))}
                  >
                    <span>●</span> <b>{definition.price}</b> 迎える
                  </button>
                </div>
              </footer>
            </article>
          );
        })}
      </div>
      <section className="equipment-shelf">
        <div>
          <h3>装備棚</h3>
        </div>
        <div className="equipment-offers">
          {run.shop?.equipment.map((offer, index) => {
            if (!offer)
              return (
                <div className="sold-slot" key={`equipment-sold-${index}`}>
                  SOLD
                </div>
              );
            const equipment = GAME_DATA.equipment.find((entry) => entry.id === offer.equipmentId);
            return equipment ? (
              <article className={`equipment-offer is-rarity-${equipment.rarity}`} key={offer.id}>
                <header>
                  <span className="equipment-glyph">{equipment.icon}</span>
                </header>
                <span className="equipment-copy">
                  <strong>{equipment.name}</strong>
                  <small>{equipment.description}</small>
                </span>
                <footer>
                  <button
                    type="button"
                    disabled={run.coins < equipment.price}
                    onClick={() => commit(buyEquipment(GAME_DATA, run, offer.id))}
                  >
                    <span>●</span> <b>{equipment.price}</b>
                  </button>
                </footer>
              </article>
            ) : null;
          })}
        </div>
      </section>
    </div>
  );
}

function MonsterInspector({
  monster,
  run,
  setRun,
  commit,
  onClose,
}: {
  monster?: MonsterInstance;
  run: CasualRunState;
  setRun: (run: CasualRunState) => void;
  commit: (result: CommandResult<CasualRunState>) => void;
  onClose: () => void;
}) {
  if (!monster) return null;
  const active = run.activeIds.includes(monster.id);
  return (
    <div className="synergy-overlay" role="dialog" aria-modal="true" aria-label="モンスター詳細">
      <div className="synergy-inspector">
        <button type="button" className="synergy-close" onClick={onClose}>
          閉じる
        </button>
        <MonsterCard
          monster={monster}
          active={active}
          onToggle={() => commit(toggleActiveMonster(GAME_DATA, run, monster.id))}
          onSell={active ? undefined : () => commit(sellMonster(GAME_DATA, run, monster.id))}
          onEquip={(equipmentId) => commit(equipItem(GAME_DATA, run, monster.id, equipmentId))}
          equipmentIds={run.equipmentInventory}
        />
        <TacticsView run={run} setRun={setRun} initialMonsterId={monster.id} />
      </div>
    </div>
  );
}

function Workshop({
  run,
  setRun,
  message,
  setMessage,
  onStartBattle,
}: {
  run: CasualRunState;
  setRun: (run: CasualRunState) => void;
  message: string;
  setMessage: (message: string) => void;
  onStartBattle: (battle: BattleViewState) => void;
}) {
  const [breedingOpen, setBreedingOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [inspectedId, setInspectedId] = useState<string>();
  const commit = (result: CommandResult<CasualRunState>) => {
    if (result.ok) {
      setRun(result.state);
      setMessage('');
    } else setMessage(result.error);
  };
  const battle = () => {
    if (run.activeIds.length !== GAME_DATA.rules.activeLimit) {
      setMessage('主力を3体揃えてください');
      return;
    }
    const player = run.activeIds.flatMap((id) => {
      const monster = run.roster.find((entry) => entry.id === id);
      return monster ? [monster] : [];
    });
    const enemy = createRivalBuild(GAME_DATA, run.cycle, deriveSeed(run.seed, 50_000 + run.cycle)).team;
    const result = simulateBattle(GAME_DATA, { player, enemy, seed: deriveSeed(run.seed, 90_000 + run.cycle) });
    setRun(applyBattleResult(GAME_DATA, run, result));
    onStartBattle({ result, enemy, beforeRoster: run.roster, frameIndex: 0, playing: true, speed: 1 });
  };
  const inspected = run.roster.find((monster) => monster.id === inspectedId);
  return (
    <main className="run-screen prep-board">
      <RunHeader run={run} onReset={() => setRun(createCasualRun(GAME_DATA, INITIAL_SEED))} />
      {message && (
        <div className="notice-stack" aria-live="polite">
          <section className="notice-toast is-command">
            <span>記録</span>
            <strong>{message}</strong>
            <button type="button" onClick={() => setMessage('')} aria-label="通知を閉じる">
              ×
            </button>
          </section>
        </div>
      )}
      <div className="workbench-layout">
        <OneScreenTeamPanel run={run} onOpen={setInspectedId} />
        <section className="workbench panel">
          <OneScreenShop run={run} commit={commit} onFreeze={() => setRun(toggleShopFreeze(run))} />
        </section>
      </div>
      <footer className="prep-command-dock panel">
        <nav className="workshop-tabs" aria-label="作業台メニュー">
          <button type="button" onClick={() => setBreedingOpen(true)}>
            <span>01</span> 特殊配合を開く
          </button>
          <button type="button" onClick={() => setGuideOpen(true)}>
            <span>02</span> 図鑑を開く
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
          <span>NEXT GHOST #{String(run.cycle).padStart(2, '0')}</span>
          <strong>{run.activeIds.length === 3 ? '編成準備完了' : `主力をあと${3 - run.activeIds.length}体選択`}</strong>
        </div>
        <button type="button" className="launch-button" disabled={run.activeIds.length !== 3} onClick={battle}>
          <span>ATB 3 × 3</span>
          戦闘を開始する
        </button>
      </footer>
      {breedingOpen && (
        <div className="synergy-overlay synergy-hub-overlay" role="dialog" aria-modal="true" aria-label="特殊配合">
          <div className="synergy-modal-hub">
            <button type="button" className="synergy-close" onClick={() => setBreedingOpen(false)}>
              特殊配合を閉じる
            </button>
            <BreedingView run={run} onComplete={commit} />
          </div>
        </div>
      )}
      {guideOpen && (
        <div
          className="synergy-overlay synergy-hub-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="モンスター図鑑"
        >
          <div className="synergy-modal-hub">
            <button type="button" className="synergy-close" onClick={() => setGuideOpen(false)}>
              図鑑を閉じる
            </button>
            <FieldGuide />
          </div>
        </div>
      )}
      <MonsterInspector
        monster={inspected}
        run={run}
        setRun={setRun}
        commit={commit}
        onClose={() => setInspectedId(undefined)}
      />
    </main>
  );
}

export function App() {
  const [run, setRun] = useState(() => createCasualRun(GAME_DATA, INITIAL_SEED));
  const [message, setMessage] = useState('');
  const [battle, setBattle] = useState<BattleViewState>();
  if (battle) return <BattleScreen battle={battle} onChange={setBattle} onFinish={() => setBattle(undefined)} />;
  if (run.phase === 'draft')
    return <DraftScreen run={run} onChoose={(id) => setRun(chooseDraftMonster(GAME_DATA, run, id))} />;
  if (run.phase === 'event') return <EventScreen run={run} setRun={setRun} />;
  if (run.phase === 'event-result')
    return (
      <main className="synergy-shell synergy-result">
        <small>FIELD NOTE</small>
        <h1>{run.eventResolution?.title}</h1>
        <p>{run.eventResolution?.text}</p>
        <button className="synergy-primary" onClick={() => setRun(continueEvent(run))}>
          準備へ戻る
        </button>
      </main>
    );
  if (run.phase === 'result') return <ResultScreen run={run} setRun={setRun} />;
  if (run.phase === 'finished')
    return <FinishedScreen run={run} onReset={() => setRun(createCasualRun(GAME_DATA, INITIAL_SEED + 1))} />;
  return <Workshop run={run} setRun={setRun} message={message} setMessage={setMessage} onStartBattle={setBattle} />;
}
