import { useMemo, useState, type CSSProperties } from 'react';
import { simulateBattle } from './core/battle';
import { breedingSkillChoices, listBreedingCandidates } from './core/breeding';
import { specialRecipeSignalsForShopOffer } from './core/catalog';
import { definitionFor, skillIdsFor, targetRulesForSkill } from './core/monster';
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
  CasualRunState,
  CommandResult,
  GameData,
  GambitCondition,
  MonsterDefinition,
  MonsterInstance,
  SkillDefinition,
} from './core/types';
import { GAME_DATA } from './game/game-data';

type PrepareView = 'team' | 'shop' | 'breeding' | 'tactics' | 'field-guide';

type BreedingPlan = {
  first: MonsterInstance;
  second: MonsterInstance;
  candidate: BreedingCandidate;
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

function RunHeader({ run, onReset }: { run: CasualRunState; onReset: () => void }) {
  return (
    <header className="synergy-run-header">
      <span>
        <small>CYCLE</small>
        <b>
          {run.cycle} / {GAME_DATA.rules.maxCycles}
        </b>
      </span>
      <span>
        <small>RECORD</small>
        <b>
          {run.wins}勝 {run.losses}敗
        </b>
      </span>
      <span>
        <small>COIN</small>
        <b>{run.coins}</b>
      </span>
      <button onClick={onReset}>ランをやり直す</button>
    </header>
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

function TacticsView({ run, setRun }: { run: CasualRunState; setRun: (run: CasualRunState) => void }) {
  const [monsterId, setMonsterId] = useState(run.activeIds[0] ?? run.roster[0]?.id ?? '');
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
                  {target}
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

function ResultScreen({ run, setRun }: { run: CasualRunState; setRun: (run: CasualRunState) => void }) {
  const result = run.lastBattle;
  return (
    <main className="synergy-shell synergy-result">
      <RunHeader run={run} onReset={() => setRun(createCasualRun(GAME_DATA, INITIAL_SEED))} />
      <small>BATTLE REPORT</small>
      <h1>{result?.winner === 'player' ? '勝利' : result?.winner === 'enemy' ? '敗北' : '引き分け'}</h1>
      <p>戦闘後も編成はそのまま。すぐ次のシナジー判断へ戻ります。</p>
      <div className="synergy-damage">
        <span>
          PLAYER <b>{result?.damageByTeam.player ?? 0}</b>
        </span>
        <span>
          RIVAL <b>{result?.damageByTeam.enemy ?? 0}</b>
        </span>
      </div>
      <button className="synergy-primary" onClick={() => setRun(continueRun(GAME_DATA, run))}>
        {run.completedCycles >= GAME_DATA.rules.maxCycles || run.losses >= GAME_DATA.rules.maxLosses
          ? '結果を見る'
          : '次のサイクルへ'}
      </button>
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

function Workshop({
  run,
  setRun,
  message,
  setMessage,
}: {
  run: CasualRunState;
  setRun: (run: CasualRunState) => void;
  message: string;
  setMessage: (message: string) => void;
}) {
  const [view, setView] = useState<PrepareView>('team');
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
  };
  return (
    <main className="synergy-shell">
      <RunHeader run={run} onReset={() => setRun(createCasualRun(GAME_DATA, INITIAL_SEED))} />
      <nav className="synergy-tabs">
        {(
          [
            ['team', '編成'],
            ['shop', 'ショップ'],
            ['breeding', '特殊配合'],
            ['tactics', '作戦'],
            ['field-guide', '図鑑'],
          ] as Array<[PrepareView, string]>
        ).map(([id, label]) => (
          <button key={id} className={view === id ? 'is-active' : ''} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </nav>
      {message && (
        <p className="synergy-message" role="alert">
          {message}
        </p>
      )}
      <div className="synergy-workspace">
        {view === 'team' ? (
          <TeamView run={run} commit={commit} />
        ) : view === 'shop' ? (
          <ShopView run={run} commit={commit} setRun={setRun} />
        ) : view === 'breeding' ? (
          <BreedingView run={run} onComplete={commit} />
        ) : view === 'tactics' ? (
          <TacticsView run={run} setRun={setRun} />
        ) : (
          <FieldGuide />
        )}
      </div>
      <footer className="synergy-battle-dock">
        <span>
          <small>NEXT BATTLE</small>
          <b>主力 {run.activeIds.length} / 3</b>
        </span>
        <button className="synergy-primary" disabled={run.activeIds.length !== 3} onClick={battle}>
          編成を確定して戦う
        </button>
      </footer>
    </main>
  );
}

export function App() {
  const [run, setRun] = useState(() => createCasualRun(GAME_DATA, INITIAL_SEED));
  const [message, setMessage] = useState('');
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
  return <Workshop run={run} setRun={setRun} message={message} setMessage={setMessage} />;
}
