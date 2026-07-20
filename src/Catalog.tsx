import { Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { analyzeBalance } from './core/balance';
import {
  BATTLE_CONFIG,
  CONDITIONS,
  EQUIPMENT,
  GAME_DATA,
  INSTRUCTIONS,
  STATUSES,
  TARGET_SELECTORS,
  UNITS,
} from './data';
import type { EquipmentDefinition, Instruction, InstructionEffect, UnitDefinition } from './types';

type CatalogKind = 'all' | 'unit' | 'equipment' | 'condition' | 'target' | 'instruction';

const kindLabels: Record<CatalogKind, string> = {
  all: 'すべて',
  unit: 'ユニット',
  equipment: '装備',
  condition: '条件',
  target: '対象',
  instruction: 'スキル',
};
const rarityLabels = { common: 'COMMON', rare: 'RARE', epic: 'EPIC' } as const;
const attackTypeLabels: Record<UnitDefinition['attackType'], string> = {
  melee: '近距離',
  blunt: '打撃',
  sniper: '狙撃',
};
const targetModeLabels: Record<Instruction['targetMode'], string> = {
  selected: '対象スロット',
  self: '自分固定',
  allEnemies: '敵全体固定',
  allAllies: '味方全体固定',
};
const domainLabels = { enemy: '敵', ally: '味方', self: '自分' } as const;
const cardinalityLabels = { one: '単体', many: '複数' } as const;
const targetById = new Map(TARGET_SELECTORS.map((target) => [target.id, target]));
const conditionById = new Map(CONDITIONS.map((condition) => [condition.id, condition]));
const instructionById = new Map(INSTRUCTIONS.map((instruction) => [instruction.id, instruction]));
const unitById = new Map(UNITS.map((unit) => [unit.id, unit]));
const statusById = new Map(STATUSES.map((status) => [status.id, status]));
const abilityMetricById = new Map(analyzeBalance(GAME_DATA).abilityMetrics.map((metric) => [metric.id, metric]));

const searchable = (query: string, values: Array<string | number | undefined>) =>
  query.length === 0 ||
  values.some((value) =>
    String(value ?? '')
      .toLocaleLowerCase('ja')
      .includes(query),
  );

const effectSummary = (effect: InstructionEffect): { label: string; value: string } => {
  switch (effect.kind) {
    case 'damage':
      return {
        label: 'ダメージ',
        value: `ATK×${effect.attackScale}${effect.flatDamage ? ` +${effect.flatDamage}` : ''} / 最低${effect.minimumDamage}`,
      };
    case 'motion':
      return {
        label: `速度・${effect.mode}`,
        value: `X ${effect.x} / Y ${effect.y} / ${effect.relativeTo === 'target' ? '対象基準' : 'ワールド基準'}`,
      };
    case 'gravity':
      return { label: '重力倍率', value: `×${effect.scale} / ${effect.durationSeconds}秒 / ${effect.target}` };
    case 'heal':
      return {
        label: '回復',
        value: `${effect.amount} HP${effect.supportAmount ? ` / 支援${effect.supportAmount}` : ''}`,
      };
    case 'applyStatus':
      return {
        label: '状態付与',
        value: `${statusById.get(effect.statusId)?.label ?? effect.statusId} ×${effect.stacks}${effect.durationSeconds ? ` / ${effect.durationSeconds}秒` : ''}`,
      };
    case 'consumeStatus':
      return {
        label: '状態消費',
        value: `${statusById.get(effect.statusId)?.label ?? effect.statusId} ×${effect.stacks}${effect.bonusDamage ? ` / +${effect.bonusDamage} DMG` : ''}`,
      };
    case 'removeStatus':
      return { label: '状態解除', value: statusById.get(effect.statusId)?.label ?? effect.statusId };
    case 'modifyStat':
      return { label: '能力変更', value: `${effect.stat} ${effect.amount > 0 ? '+' : ''}${effect.amount}` };
    case 'placeZone':
      return {
        label: 'エリア設置',
        value: `${effect.zoneId} / ${effect.anchor} / X ${effect.offsetX} / Y ${effect.offsetY}`,
      };
    case 'wait':
      return { label: '待機', value: `${effect.durationSeconds}秒` };
  }
};

const CatalogSection = ({
  id,
  label,
  count,
  children,
  wide = false,
}: {
  id: string;
  label: string;
  count: number;
  children: ReactNode;
  wide?: boolean;
}) => (
  <section className="catalog-section" id={id}>
    <div className="catalog-section-head">
      <div>
        <span>{id.toUpperCase()}</span>
        <h2>{label}</h2>
      </div>
      <b>{String(count).padStart(2, '0')} ENTRIES</b>
    </div>
    <div className={`catalog-grid ${wide ? 'wide' : ''}`}>{children}</div>
  </section>
);

export function Catalog() {
  const [kind, setKind] = useState<CatalogKind>('all');
  const [search, setSearch] = useState('');
  const query = search.trim().toLocaleLowerCase('ja');
  const visible = (candidate: Exclude<CatalogKind, 'all'>) => kind === 'all' || kind === candidate;
  const counts = {
    all: UNITS.length + EQUIPMENT.length + CONDITIONS.length + TARGET_SELECTORS.length + INSTRUCTIONS.length,
    unit: UNITS.length,
    equipment: EQUIPMENT.length,
    condition: CONDITIONS.length,
    target: TARGET_SELECTORS.length,
    instruction: INSTRUCTIONS.length,
  };

  const filtered = useMemo(
    () => ({
      units: UNITS.filter((unit) =>
        searchable(query, [unit.id, unit.name, unit.code, unit.role, unit.rarity, unit.attackType]),
      ),
      equipment: EQUIPMENT.filter((equipment) =>
        searchable(query, [
          equipment.id,
          equipment.name,
          equipment.code,
          equipment.slot,
          equipment.description,
          equipment.tradeoff,
          equipment.rarity,
        ]),
      ),
      conditions: CONDITIONS.filter((condition) =>
        searchable(query, [condition.id, condition.label, condition.flavor, condition.effect]),
      ),
      targets: TARGET_SELECTORS.filter((target) =>
        searchable(query, [target.id, target.label, target.flavor, target.domain, target.cardinality]),
      ),
      instructions: INSTRUCTIONS.filter((instruction) =>
        searchable(query, [
          instruction.id,
          instruction.title,
          instruction.short,
          instruction.flavor,
          instruction.action,
          instruction.rarity,
          JSON.stringify(instruction.effects),
          conditionById.get(instruction.condition)?.label,
          targetById.get(instruction.defaultTarget)?.label,
          unitById.get(instruction.fixedFor ?? '')?.name,
        ]),
      ),
    }),
    [query],
  );
  const visibleCount =
    (visible('unit') ? filtered.units.length : 0) +
    (visible('equipment') ? filtered.equipment.length : 0) +
    (visible('condition') ? filtered.conditions.length : 0) +
    (visible('target') ? filtered.targets.length : 0) +
    (visible('instruction') ? filtered.instructions.length : 0);

  return (
    <div className="catalog-page">
      <section className="catalog-hero">
        <div className="catalog-hero-copy">
          <span>SYSTEM CATALOG / GAME-DATA</span>
          <h1>
            戦力を、<em>同じ物差し</em>で見る。
          </h1>
          <p>3体の機体・装備・条件・スキルを、実際の1vs1ゲームデータから一覧化した調整用カタログです。</p>
        </div>
        <div className="catalog-economy" aria-label="コストゲージ設定">
          <div>
            <small>ABILITY RESERVE</small>
            <strong>
              {BATTLE_CONFIG.abilityGaugeInitial}
              <span> / {BATTLE_CONFIG.abilityGaugeMax}</span>
            </strong>
            <p>戦闘開始時 / 最大値</p>
          </div>
          <div>
            <small>PASSIVE CHARGE</small>
            <strong>
              +{BATTLE_CONFIG.abilityGaugeRegenPerSecond}
              <span> / SEC</span>
            </strong>
            <p>全ユニット共通の時間回復</p>
          </div>
          <div className="catalog-cost-legend">
            <small>COST SCALE</small>
            <span>
              <b>0</b> 基本
            </span>
            <span>
              <b>1–3</b> 軽技
            </span>
            <span>
              <b>4–6</b> 強技
            </span>
            <span>
              <b>7–10</b> 奥義
            </span>
          </div>
        </div>
      </section>

      <section className="catalog-controls" aria-label="カタログの検索と絞り込み">
        <label className="catalog-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">カタログを検索</span>
          <input
            type="search"
            placeholder="名前・ID・効果で検索"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="catalog-filters">
          {(Object.keys(kindLabels) as CatalogKind[]).map((candidate) => (
            <button
              className={kind === candidate ? 'active' : ''}
              aria-pressed={kind === candidate}
              key={candidate}
              onClick={() => setKind(candidate)}
            >
              {kindLabels[candidate]} <b>{counts[candidate]}</b>
            </button>
          ))}
        </div>
        <output>{visibleCount}件を表示</output>
      </section>

      <div className="catalog-content">
        {visible('unit') && filtered.units.length > 0 && (
          <CatalogSection id="units" label="ユニット" count={filtered.units.length}>
            {filtered.units.map((unit) => {
              return (
                <article
                  className="catalog-card catalog-unit-card"
                  data-catalog-id={unit.id}
                  key={unit.id}
                  style={{ ['--entry-color' as string]: unit.color }}
                >
                  <header>
                    <span>{unit.code}</span>
                    <b>{rarityLabels[unit.rarity]}</b>
                  </header>
                  <div className="catalog-unit-title">
                    <i />
                    <div>
                      <h3>{unit.name}</h3>
                      <code>{unit.id}</code>
                    </div>
                    <strong>{unit.role}</strong>
                  </div>
                  <dl className="catalog-stat-grid">
                    <div>
                      <dt>HP</dt>
                      <dd>{unit.maxHp}</dd>
                    </div>
                    <div>
                      <dt>ATK</dt>
                      <dd>{unit.attack}</dd>
                    </div>
                    <div>
                      <dt>DEF</dt>
                      <dd>{unit.defense}</dd>
                    </div>
                    <div>
                      <dt>SPD</dt>
                      <dd>{unit.speed}</dd>
                    </div>
                    <div>
                      <dt>KB</dt>
                      <dd>{unit.knockbackPower}</dd>
                    </div>
                    <div>
                      <dt>WT</dt>
                      <dd>{unit.weight}</dd>
                    </div>
                    <div>
                      <dt>SLOT</dt>
                      <dd>{unit.programLimit}</dd>
                    </div>
                  </dl>
                  <div className="catalog-unit-footer">
                    <span>{attackTypeLabels[unit.attackType]}</span>
                    <span>{unit.id === 'volt' ? 'PLAYER' : 'RIVAL'}</span>
                  </div>
                  <div className="catalog-trait">
                    <small>LOADOUT POLICY</small>
                    <b>固有能力なし / 装備とプログラムで構成</b>
                  </div>
                </article>
              );
            })}
          </CatalogSection>
        )}

        {visible('equipment') && filtered.equipment.length > 0 && (
          <CatalogSection id="equipment" label="装備" count={filtered.equipment.length} wide>
            {filtered.equipment.map((equipment: EquipmentDefinition) => (
              <article
                className={`catalog-card catalog-skill-card equipment-catalog-card slot-${equipment.slot}`}
                data-catalog-id={equipment.id}
                key={equipment.id}
              >
                <header>
                  <span>
                    {equipment.slot.toUpperCase()} / {rarityLabels[equipment.rarity]}
                  </span>
                  <code>{equipment.code}</code>
                </header>
                <div className="catalog-skill-title">
                  <div>
                    <h3>{equipment.name}</h3>
                    <p>{equipment.description}</p>
                  </div>
                  <strong>
                    <small>PRICE</small>
                    {equipment.price}
                  </strong>
                </div>
                <div className="equipment-tradeoff">
                  <small>TRADE-OFF</small>
                  <b>{equipment.tradeoff}</b>
                </div>
                {equipment.grantsActionIds.length > 0 && (
                  <div className="catalog-compatible">
                    <small>解放する行動</small>
                    <div>
                      {equipment.grantsActionIds.map((id) => (
                        <span key={id}>{instructionById.get(id)?.title ?? id}</span>
                      ))}
                    </div>
                  </div>
                )}
                <footer>
                  <span>{equipment.id}</span>
                  {equipment.defaultReaction && <span>リアクション自動設定</span>}
                </footer>
              </article>
            ))}
          </CatalogSection>
        )}

        {visible('condition') && filtered.conditions.length > 0 && (
          <CatalogSection id="conditions" label="条件" count={filtered.conditions.length}>
            {filtered.conditions.map((condition) => (
              <article className="catalog-card catalog-rule-card" data-catalog-id={condition.id} key={condition.id}>
                <header>
                  <span>IF CONDITION</span>
                  <code>{condition.id}</code>
                </header>
                <h3>{condition.label}</h3>
                <p>{condition.flavor}</p>
                <div className="catalog-rule-effect">
                  <small>判定</small>
                  <b>{condition.effect}</b>
                </div>
                <div className="catalog-compatible">
                  <small>対応する対象</small>
                  <div>
                    {condition.compatibleTargets.map((targetId) => (
                      <span key={targetId}>{targetById.get(targetId)?.label ?? targetId}</span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </CatalogSection>
        )}

        {visible('target') && filtered.targets.length > 0 && (
          <CatalogSection id="targets" label="対象" count={filtered.targets.length}>
            {filtered.targets.map((target) => (
              <article
                className={`catalog-card catalog-target-card target-${target.domain}`}
                data-catalog-id={target.id}
                key={target.id}
              >
                <header>
                  <span>TARGET SELECTOR</span>
                  <code>{target.id}</code>
                </header>
                <div className="catalog-target-kind">
                  <span>{domainLabels[target.domain]}</span>
                  <span>{cardinalityLabels[target.cardinality]}</span>
                </div>
                <h3>{target.label}</h3>
                <p>{target.flavor}</p>
              </article>
            ))}
          </CatalogSection>
        )}

        {visible('instruction') && filtered.instructions.length > 0 && (
          <CatalogSection id="skills" label="スキル" count={filtered.instructions.length} wide>
            {filtered.instructions.map((instruction) => {
              const metric = abilityMetricById.get(instruction.id);
              return (
                <article
                  className={`catalog-card catalog-skill-card ${instruction.tone}`}
                  data-catalog-id={instruction.id}
                  key={instruction.id}
                >
                  <header>
                    <span>
                      {instruction.action.toUpperCase()} / {rarityLabels[instruction.rarity]}
                    </span>
                    <code>{instruction.id}</code>
                  </header>
                  <div className="catalog-skill-title">
                    <div>
                      <h3>{instruction.title}</h3>
                      <p>{instruction.flavor}</p>
                    </div>
                    <strong>
                      <small>COST</small>
                      {instruction.abilityCost === 0 ? '0' : instruction.abilityCost}
                    </strong>
                  </div>
                  <div
                    className="catalog-cost-ruler"
                    aria-label={`コスト ${instruction.abilityCost} / ${BATTLE_CONFIG.abilityGaugeMax}`}
                  >
                    {Array.from({ length: BATTLE_CONFIG.abilityGaugeMax }, (_, index) => (
                      <i className={index < instruction.abilityCost ? 'filled' : ''} key={index} />
                    ))}
                  </div>
                  <div className="catalog-economy-row">
                    <span>
                      <small>指示CD</small>
                      <b>{metric?.cooldownSeconds ?? instruction.cooldownSeconds}秒</b>
                    </span>
                    <span>
                      <small>持続使用</small>
                      <b>{metric?.usesPerMinute ?? 0}回/分</b>
                    </span>
                    <span>
                      <small>購入</small>
                      <b>{instruction.price === 0 ? '固有' : instruction.price}</b>
                    </span>
                  </div>
                  <dl className="catalog-skill-rules">
                    <div>
                      <dt>条件</dt>
                      <dd>{conditionById.get(instruction.condition)?.label ?? instruction.condition}</dd>
                    </div>
                    <div>
                      <dt>対象</dt>
                      <dd>
                        {targetModeLabels[instruction.targetMode]} /{' '}
                        {targetById.get(instruction.defaultTarget)?.label ?? instruction.defaultTarget}
                      </dd>
                    </div>
                    {instruction.delivery && (
                      <div>
                        <dt>空間判定</dt>
                        <dd>
                          {instruction.delivery.kind === 'projectile'
                            ? `${instruction.delivery.homing ? '追尾弾' : '直進弾'} / 速度${instruction.delivery.speed} / 半径${instruction.delivery.radius}`
                            : instruction.delivery.kind === 'lob'
                              ? `放物投擲 / 滞空${instruction.delivery.flightSeconds}秒 / 地面着弾`
                              : instruction.delivery.shape.kind === 'circle'
                                ? `円 / 半径${instruction.delivery.shape.radius}`
                                : `矩形 / 幅${instruction.delivery.shape.width} / 高さ${instruction.delivery.shape.height ?? '無限'}`}
                        </dd>
                      </div>
                    )}
                  </dl>
                  {instruction.effects.length > 0 && (
                    <div className="catalog-parameters">
                      {instruction.effects.map((effect, index) => {
                        const summary = effectSummary(effect);
                        return (
                          <span key={`${effect.kind}-${index}`}>
                            <small>{summary.label}</small>
                            <b>{summary.value}</b>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <footer>
                    {instruction.fixedFor && (
                      <span>専用: {unitById.get(instruction.fixedFor)?.name ?? instruction.fixedFor}</span>
                    )}
                    {instruction.reactionOnly && <span>リアクション限定</span>}
                    {instruction.compatibleTargets.map((targetId) => (
                      <span key={targetId}>{targetById.get(targetId)?.label ?? targetId}</span>
                    ))}
                  </footer>
                </article>
              );
            })}
          </CatalogSection>
        )}

        {visibleCount === 0 && (
          <div className="catalog-empty">
            <strong>該当するデータがありません</strong>
            <span>検索語または種別を変更してください。</span>
          </div>
        )}
      </div>
    </div>
  );
}
