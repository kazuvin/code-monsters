import { type CSSProperties, useMemo, useState } from 'react';
import {
  Activity,
  Crosshair,
  Gauge,
  HeartPulse,
  Play,
  RotateCcw,
  Settings2,
  Shield,
  Timer,
  X,
  Zap,
} from 'lucide-react';
import { runDebugSimulation, type DebugSimulationInput, type DebugSimulationResult } from './core/debug-simulation';
import { BATTLE_CONFIG, CONDITIONS, INSTRUCTIONS, TARGET_SELECTORS, UNITS } from './data';
import type { ConditionId, TargetSelectorId } from './types';

const unitById = new Map(UNITS.map((unit) => [unit.id, unit]));
const instructionById = new Map(INSTRUCTIONS.map((instruction) => [instruction.id, instruction]));
const targetById = new Map(TARGET_SELECTORS.map((target) => [target.id, target]));

const defaultTarget = unitById.get('bastion') ?? UNITS[0];
const defaultInstruction = instructionById.get('knock-away') ?? INSTRUCTIONS[0];

const createDefaultInput = (): DebugSimulationInput => ({
  actorUnitId: unitById.has('volt') ? 'volt' : UNITS[0].id,
  instructionId: defaultInstruction.id,
  conditionId: defaultInstruction.condition,
  targetSelectorId: defaultInstruction.defaultTarget,
  targetUnitId: defaultTarget.id,
  mode: 'timeline',
  durationSeconds: 10,
  initialGauge: BATTLE_CONFIG.abilityGaugeInitial,
  distance: 7,
  targetMaxHp: defaultTarget.maxHp,
  targetHpRatio: 1,
  targetDefense: defaultTarget.defense,
  targetWeight: defaultTarget.weight,
  targetPoison: 0,
});

const skipLabels = {
  condition: '条件不一致',
  range: '射程外',
  cost: 'コスト不足',
  state: '状態重複',
};

const verdictLabels: Record<DebugSimulationResult['verdict'], string> = {
  damage: 'DAMAGE CONFIRMED',
  healing: 'REPAIR CONFIRMED',
  effect: 'EFFECT CONFIRMED',
  blocked: 'NO EFFECT',
};

const actionLabels = {
  attack: 'ATTACK',
  heavy: 'IMPACT',
  move: 'MOVE',
  jump: 'JUMP',
  throw: 'THROW',
  taunt: 'TAUNT',
  pull: 'PULL',
  retreat: 'RETREAT',
  heal: 'REPAIR',
  guard: 'GUARD',
  buff: 'BOOST',
  berserk: 'BERSERK',
  poison: 'POISON',
  burn: 'BURN',
  follow: 'FOLLOW',
  wait: 'WAIT',
};

function Metric({
  label,
  value,
  unit,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'neutral' | 'cyan' | 'amber' | 'lime';
}) {
  return (
    <div className={`debug-metric tone-${tone}`}>
      <small>{label}</small>
      <strong>
        {value}
        {unit && <span>{unit}</span>}
      </strong>
    </div>
  );
}

function NumberControl({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="debug-number-control">
      <span>{label}</span>
      <div>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix && <small>{suffix}</small>}
      </div>
    </label>
  );
}

export function DebugRoom() {
  const [input, setInput] = useState<DebugSimulationInput>(createDefaultInput);
  const [measuredInput, setMeasuredInput] = useState<DebugSimulationInput>(createDefaultInput);
  const [result, setResult] = useState<DebugSimulationResult>(() => runDebugSimulation(createDefaultInput()));
  const [setupOpen, setSetupOpen] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [dirty, setDirty] = useState(false);

  const instruction = instructionById.get(input.instructionId) ?? INSTRUCTIONS[0];
  const targetDefinition = targetById.get(input.targetSelectorId) ?? TARGET_SELECTORS[0];
  const measuredActor = unitById.get(measuredInput.actorUnitId) ?? UNITS[0];
  const measuredInstruction = instructionById.get(measuredInput.instructionId) ?? INSTRUCTIONS[0];
  const measuredTargetPreset = unitById.get(measuredInput.targetUnitId) ?? UNITS[0];
  const measuredTargetDefinition = targetById.get(measuredInput.targetSelectorId) ?? TARGET_SELECTORS[0];
  const compatibleTargets = useMemo(
    () =>
      instruction.targetMode === 'selected'
        ? TARGET_SELECTORS.filter((target) => instruction.compatibleTargets.includes(target.id))
        : TARGET_SELECTORS.filter((target) => target.id === instruction.defaultTarget),
    [instruction],
  );
  const compatibleConditions = useMemo(
    () => CONDITIONS.filter((condition) => condition.compatibleTargets.includes(input.targetSelectorId)),
    [input.targetSelectorId],
  );
  const maximumEvent = Math.max(1, ...result.events.map((event) => event.amount));
  const primaryValue = result.totalDamage > 0 ? result.totalDamage : result.totalHealing;
  const primaryLabel =
    result.totalDamage > 0 ? 'TOTAL DAMAGE' : result.totalHealing > 0 ? 'TOTAL REPAIR' : 'TOTAL EFFECT';
  const finalHpPercent = Math.max(0, Math.min(100, result.finalTargetHpRatio * 100));
  const isSingle = measuredInput.mode === 'single';
  const isHealing = measuredInstruction.action === 'heal';
  const isDamageAction = ['attack', 'heavy', 'throw', 'poison', 'burn', 'follow'].includes(measuredInstruction.action);
  const effectPerUse = isHealing
    ? result.executions > 0
      ? Number((result.totalHealing / result.executions).toFixed(1))
      : 0
    : result.damagePerHit;
  const efficiencyValue =
    result.totalDamage > 0 || result.totalHealing > 0
      ? (result.effectPerCost ?? 'FREE')
      : measuredInstruction.abilityCost === 0
        ? 'FREE'
        : '—';

  const updateInput = (next: Partial<DebugSimulationInput>) => {
    setInput((current) => ({ ...current, ...next }));
    setDirty(true);
  };

  const selectInstruction = (instructionId: string) => {
    const nextInstruction = instructionById.get(instructionId);
    if (!nextInstruction) return;
    const nextTarget = nextInstruction.defaultTarget;
    const defaultCondition = CONDITIONS.find(
      (condition) => condition.id === nextInstruction.condition && condition.compatibleTargets.includes(nextTarget),
    );
    const fallbackCondition = CONDITIONS.find((condition) => condition.compatibleTargets.includes(nextTarget));
    updateInput({
      instructionId,
      targetSelectorId: nextTarget,
      conditionId: (defaultCondition ?? fallbackCondition ?? CONDITIONS[0]).id,
      targetHpRatio: nextInstruction.action === 'heal' ? 0.3 : input.targetHpRatio,
    });
  };

  const selectTarget = (targetSelectorId: TargetSelectorId) => {
    const conditionStillWorks = CONDITIONS.some(
      (condition) => condition.id === input.conditionId && condition.compatibleTargets.includes(targetSelectorId),
    );
    const nextCondition = conditionStillWorks
      ? input.conditionId
      : (CONDITIONS.find((condition) => condition.compatibleTargets.includes(targetSelectorId))?.id ?? 'always');
    updateInput({ targetSelectorId, conditionId: nextCondition });
  };

  const selectTargetPreset = (targetUnitId: string) => {
    const unit = unitById.get(targetUnitId);
    if (!unit) return;
    updateInput({
      targetUnitId,
      targetMaxHp: unit.maxHp,
      targetDefense: unit.defense,
      targetWeight: unit.weight,
    });
  };

  const run = () => {
    setResult(runDebugSimulation(input));
    setMeasuredInput({ ...input });
    setRunKey((current) => current + 1);
    setDirty(false);
    setSetupOpen(false);
  };

  const reset = () => {
    const next = createDefaultInput();
    setInput(next);
    setMeasuredInput(next);
    setResult(runDebugSimulation(next));
    setRunKey((current) => current + 1);
    setDirty(false);
  };

  return (
    <div className="debug-room">
      <header className="debug-room-head">
        <div>
          <span>LIVE COMBAT HARNESS</span>
          <h1>デバッグルーム</h1>
        </div>
        <div className="debug-mode-switch" aria-label="計測モード">
          <button className={input.mode === 'single' ? 'active' : ''} onClick={() => updateInput({ mode: 'single' })}>
            単発
          </button>
          {[10, 30, 60].map((duration) => (
            <button
              key={duration}
              className={input.mode === 'timeline' && input.durationSeconds === duration ? 'active' : ''}
              onClick={() => updateInput({ mode: 'timeline', durationSeconds: duration })}
            >
              {duration}秒
            </button>
          ))}
        </div>
      </header>

      <div className="debug-workspace">
        <aside className={`debug-config ${setupOpen ? 'is-open' : ''}`} aria-label="デバッグ設定">
          <header>
            <div>
              <small>LOADOUT / TARGET</small>
              <b>計測設定</b>
            </div>
            <button className="debug-config-close" aria-label="設定を閉じる" onClick={() => setSetupOpen(false)}>
              <X size={18} />
            </button>
          </header>

          <div className="debug-config-scroll">
            <label className="debug-select-control">
              <span>攻撃ユニット</span>
              <select value={input.actorUnitId} onChange={(event) => updateInput({ actorUnitId: event.target.value })}>
                {UNITS.map((unit) => (
                  <option value={unit.id} key={unit.id}>
                    {unit.name} / ATK {unit.attack} / SPD {unit.speed.toFixed(2)}
                  </option>
                ))}
              </select>
            </label>

            <label className="debug-select-control">
              <span>実行する技</span>
              <select value={input.instructionId} onChange={(event) => selectInstruction(event.target.value)}>
                {INSTRUCTIONS.map((option) => (
                  <option value={option.id} key={option.id}>
                    {option.title} / COST {option.abilityCost}
                  </option>
                ))}
              </select>
            </label>

            <label className="debug-select-control debug-config-mode">
              <span>計測方法</span>
              <select
                value={input.mode === 'single' ? 'single' : String(input.durationSeconds)}
                onChange={(event) =>
                  event.target.value === 'single'
                    ? updateInput({ mode: 'single' })
                    : updateInput({ mode: 'timeline', durationSeconds: Number(event.target.value) })
                }
              >
                <option value="single">単発</option>
                <option value="10">10秒</option>
                <option value="30">30秒</option>
                <option value="60">60秒</option>
              </select>
            </label>

            <NumberControl
              label="開始コスト"
              value={input.initialGauge}
              min={0}
              max={BATTLE_CONFIG.abilityGaugeMax}
              step={0.5}
              suffix={`/ ${BATTLE_CONFIG.abilityGaugeMax}`}
              onChange={(initialGauge) => updateInput({ initialGauge })}
            />

            <div className="debug-control-pair">
              <label className="debug-select-control">
                <span>対象</span>
                <select
                  value={input.targetSelectorId}
                  onChange={(event) => selectTarget(event.target.value as TargetSelectorId)}
                >
                  {compatibleTargets.map((target) => (
                    <option value={target.id} key={target.id}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="debug-select-control">
                <span>条件</span>
                <select
                  value={input.conditionId}
                  onChange={(event) => updateInput({ conditionId: event.target.value as ConditionId })}
                >
                  {compatibleConditions.map((condition) => (
                    <option value={condition.id} key={condition.id}>
                      {condition.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {targetDefinition.domain !== 'self' && (
              <>
                <div className="debug-config-divider">
                  <span>SANDBAG PROFILE</span>
                </div>
                <label className="debug-select-control">
                  <span>サンドバッグ素体</span>
                  <select value={input.targetUnitId} onChange={(event) => selectTargetPreset(event.target.value)}>
                    {UNITS.map((unit) => (
                      <option value={unit.id} key={unit.id}>
                        {unit.name} / DEF {unit.defense} / WGT {unit.weight}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="debug-control-grid">
                  <NumberControl
                    label="最大HP"
                    value={input.targetMaxHp}
                    min={1}
                    max={99999}
                    onChange={(targetMaxHp) => updateInput({ targetMaxHp })}
                  />
                  <NumberControl
                    label="現在HP"
                    value={Math.round(input.targetHpRatio * 100)}
                    min={1}
                    max={100}
                    suffix="%"
                    onChange={(value) => updateInput({ targetHpRatio: value / 100 })}
                  />
                  <NumberControl
                    label="防御"
                    value={input.targetDefense}
                    min={0}
                    max={999}
                    onChange={(targetDefense) => updateInput({ targetDefense })}
                  />
                  <NumberControl
                    label="重量"
                    value={input.targetWeight}
                    min={0}
                    max={999}
                    step={0.5}
                    onChange={(targetWeight) => updateInput({ targetWeight })}
                  />
                  <NumberControl
                    label="距離"
                    value={input.distance}
                    min={0}
                    max={72}
                    step={0.5}
                    onChange={(distance) => updateInput({ distance })}
                  />
                  <NumberControl
                    label="毒"
                    value={input.targetPoison}
                    min={0}
                    max={99}
                    onChange={(targetPoison) => updateInput({ targetPoison })}
                  />
                </div>
              </>
            )}
            {targetDefinition.domain === 'self' && (
              <NumberControl
                label="実行ユニットの現在HP"
                value={Math.round(input.targetHpRatio * 100)}
                min={1}
                max={100}
                suffix="%"
                onChange={(value) => updateInput({ targetHpRatio: value / 100 })}
              />
            )}
          </div>

          <footer>
            <button className="debug-reset" onClick={reset}>
              <RotateCcw size={14} /> 初期値
            </button>
            <button className="debug-config-run" onClick={run}>
              <Play size={15} fill="currentColor" /> 計測する
            </button>
          </footer>
        </aside>

        <main className="debug-bay" key={runKey}>
          <header className="debug-bay-head">
            <div>
              <small>ATTACKER</small>
              <b>{measuredActor.name}</b>
              <span>
                ATK {measuredActor.attack} · SPD {measuredActor.speed.toFixed(2)} · RNG {measuredActor.range}
              </span>
            </div>
            <div className="debug-skill-readout">
              <small>{actionLabels[measuredInstruction.action]}</small>
              <b>{measuredInstruction.title}</b>
              <span>COST {measuredInstruction.abilityCost}</span>
            </div>
          </header>

          <section
            className={`debug-stage verdict-${result.verdict} target-${measuredTargetDefinition.domain}`}
            aria-label="攻撃テスト表示"
            style={
              {
                '--debug-target-x': `${Math.min(86, 27 + (measuredInput.distance / 72) * 59)}%`,
              } as CSSProperties
            }
          >
            <div className="debug-stage-grid" />
            {measuredTargetDefinition.domain !== 'self' && (
              <div className="debug-range-line">
                <span>{measuredInput.distance.toFixed(1)} RNG</span>
              </div>
            )}
            <div className="debug-rig debug-actor-rig">
              <span className="debug-rig-code">{measuredActor.code}</span>
              <i style={{ '--rig-color': measuredActor.color } as CSSProperties} />
              <b>{measuredActor.name}</b>
            </div>
            {measuredTargetDefinition.domain !== 'self' && (
              <>
                <div className="debug-impact-beam" />
                <div className="debug-rig debug-target-rig">
                  <span className="debug-rig-code">
                    {measuredTargetDefinition.domain === 'ally' ? 'ALLY RIG' : 'DUMMY'}
                  </span>
                  <i />
                  <b>{measuredTargetPreset.name}</b>
                </div>
              </>
            )}
            <div className="debug-verdict">
              <small>{verdictLabels[result.verdict]}</small>
              <strong>{primaryValue}</strong>
              <span>{primaryLabel}</span>
            </div>
          </section>

          <section className="debug-impact-tape" aria-label="効果発生タイムライン">
            <header>
              <span>IMPACT TAPE</span>
              <b>{result.elapsed.toFixed(1)} SEC</b>
            </header>
            <div>
              {result.events.map((event, index) => (
                <i
                  className={event.kind}
                  key={`${event.elapsed}-${index}`}
                  style={
                    {
                      '--event-left': `${Math.min(100, (event.elapsed / Math.max(result.elapsed, 0.01)) * 100)}%`,
                      '--event-height': `${Math.max(16, (event.amount / maximumEvent) * 100)}%`,
                    } as CSSProperties
                  }
                  title={`${event.elapsed.toFixed(1)}秒 / ${event.amount} ${event.kind === 'damage' ? 'ダメージ' : '回復'}`}
                />
              ))}
              {result.events.length === 0 && <span>効果イベントなし</span>}
            </div>
          </section>
        </main>

        <aside className="debug-telemetry" aria-label="計測結果">
          <header>
            <span>
              <Activity size={14} /> TELEMETRY
            </span>
            <b className={dirty ? 'is-stale' : ''}>{dirty ? '設定変更あり' : '計測済み'}</b>
          </header>
          <div className="debug-primary-metrics">
            {isHealing ? (
              <>
                <Metric
                  label={isSingle ? 'REPAIR' : 'HPS'}
                  value={isSingle ? result.totalHealing : result.healingPerSecond}
                  tone="cyan"
                />
                <Metric label="1 REPAIR" value={effectPerUse} tone="amber" />
                <Metric label="REPAIR / COST" value={efficiencyValue} tone="lime" />
              </>
            ) : isDamageAction ? (
              <>
                <Metric
                  label={isSingle ? 'DAMAGE' : 'DPS'}
                  value={isSingle ? result.totalDamage : result.dps}
                  tone="cyan"
                />
                <Metric label="1 HIT" value={effectPerUse} tone="amber" />
                <Metric label="DMG / COST" value={efficiencyValue} tone="lime" />
              </>
            ) : (
              <>
                <Metric label="STATE" value={result.effectState} tone="cyan" />
                <Metric
                  label="ATK DELTA"
                  value={result.attackDelta > 0 ? `+${result.attackDelta}` : result.attackDelta}
                  tone="amber"
                />
                <Metric
                  label="MOVE"
                  value={Math.max(result.actorDisplacement, result.targetDisplacement)}
                  tone="lime"
                />
              </>
            )}
            <Metric
              label={isSingle ? 'ELAPSED' : 'USES / MIN'}
              value={isSingle ? result.elapsed : result.usesPerMinute}
              unit={isSingle ? 'SEC' : undefined}
            />
            <Metric label="EXECUTED" value={`${result.executions}/${result.attempts}`} />
            <Metric label="MIN GAUGE" value={result.minimumGauge} unit={`/ ${BATTLE_CONFIG.abilityGaugeMax}`} />
          </div>

          <div className="debug-target-health">
            <div>
              <span>TARGET INTEGRITY</span>
              <b>{Math.round(finalHpPercent)}%</b>
            </div>
            <i>
              <span style={{ width: `${finalHpPercent}%` }} />
            </i>
            <small>
              {result.finalTargetHp} HP
              {result.timeToKill !== null && ` · TTK ${result.timeToKill.toFixed(1)}秒`}
            </small>
          </div>

          <div className="debug-secondary-metrics">
            <span>
              <Zap size={13} /> 消費コスト <b>{result.costSpent}</b>
            </span>
            <span>
              <Gauge size={13} /> ガス欠率 <b>{Math.round(result.emptyGaugeRate * 100)}%</b>
            </span>
            <span>
              <Crosshair size={13} /> 対象移動 <b>{result.targetDisplacement}</b>
            </span>
            <span>
              <Timer size={13} /> 自分移動 <b>{result.actorDisplacement}</b>
            </span>
            <span>
              <HeartPulse size={13} /> {isHealing ? '総回復' : 'SPD変化'}{' '}
              <b>
                {isHealing ? result.totalHealing : result.speedDelta > 0 ? `+${result.speedDelta}` : result.speedDelta}
              </b>
            </span>
            <span>
              <Shield size={13} /> 毒スタック <b>{result.finalPoison}</b>
            </span>
          </div>

          <div className="debug-skips">
            <span>SKIPPED REASONS</span>
            <div>
              {(Object.keys(skipLabels) as Array<keyof typeof skipLabels>).map((reason) => (
                <span className={result.skipped[reason] > 0 ? 'has-skips' : ''} key={reason}>
                  {skipLabels[reason]} <b>{result.skipped[reason]}</b>
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {setupOpen && (
        <button className="debug-config-backdrop" aria-label="設定を閉じる" onClick={() => setSetupOpen(false)} />
      )}
      <footer className="debug-mobile-dock">
        <button onClick={() => setSetupOpen((current) => !current)}>
          {setupOpen ? <X size={17} /> : <Settings2 size={17} />}
          {setupOpen ? '閉じる' : '設定'}
        </button>
        <button className="debug-mobile-run" onClick={run}>
          <Play size={17} fill="currentColor" />
          {dirty ? 'この設定で計測' : 'もう一度計測'}
        </button>
      </footer>
    </div>
  );
}
