import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Crosshair, Gauge, Network, Play, RotateCcw, Settings2, TimerReset, X, Zap } from 'lucide-react';
import { BattleScene } from './BattleScene';
import { SynergyGraph } from './SynergyGraph';
import {
  createDebugFighters,
  createDefaultDebugStatuses,
  runDebugSimulation,
  type DebugEffectEvent,
  type DebugSimulationInput,
  type DebugSimulationResult,
} from './core/debug-simulation';
import { instructionHasDamage } from './core/instruction-effects';
import { BATTLE_CONFIG, CONDITIONS, DEBUG_TRAINING_CONFIG, INSTRUCTIONS, STATUSES, UNITS } from './data';
import type { BattleFlash, Fighter, Role } from './types';

const unitById = new Map(UNITS.map((unit) => [unit.id, unit]));
const instructionById = new Map(INSTRUCTIONS.map((instruction) => [instruction.id, instruction]));
const conditionById = new Map(CONDITIONS.map((condition) => [condition.id, condition]));

const defaultTarget = unitById.get('bastion') ?? UNITS[0];
const defaultInstruction = instructionById.get('attack-low') ?? INSTRUCTIONS[0];

const roles = Array.from(new Set(UNITS.map((unit) => unit.role)));

const createDefaultInput = (): DebugSimulationInput => ({
  actorUnitId: unitById.has('volt') ? 'volt' : UNITS[0].id,
  instructionId: defaultInstruction.id,
  conditionId: defaultInstruction.condition,
  targetSelectorId: defaultInstruction.defaultTarget,
  targetUnitId: defaultTarget.id,
  mode: 'single',
  durationSeconds: 10,
  initialGauge: BATTLE_CONFIG.abilityGaugeMax,
  actorHpRatio: 1,
  targetMaxHp: defaultTarget.maxHp,
  targetDefense: defaultTarget.defense,
  targetWeight: defaultTarget.weight,
  targetRole: defaultTarget.role,
  positionPresetId: DEBUG_TRAINING_CONFIG.defaultPositionPresetId,
  actorStatuses: createDefaultDebugStatuses(),
  targetStatuses: createDefaultDebugStatuses(),
});

const skipLabels = {
  condition: '条件不一致',
  range: '射程外',
  cost: 'コスト不足',
  state: '状態重複',
};

const hasDamageEffect = (instruction: (typeof INSTRUCTIONS)[number]) => instructionHasDamage(instruction);

const statusLabels = (values: Record<string, number>) =>
  STATUSES.flatMap((status) => {
    const value = values[status.id] ?? 0;
    if (value <= 0) return [];
    return [status.debug.control === 'stacks' ? `${status.label} ×${value}` : status.label];
  });

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
  ariaLabel,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  ariaLabel?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="debug-number-control">
      <span>{label}</span>
      <div>
        <input
          aria-label={ariaLabel ?? label}
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

function StatusControls({
  sideLabel,
  values,
  onChange,
}: {
  sideLabel: string;
  values: Record<string, number>;
  onChange: (values: Record<string, number>) => void;
}) {
  const stackStatuses = STATUSES.filter((status) => status.debug.control === 'stacks');
  const toggleStatuses = STATUSES.filter((status) => status.debug.control === 'toggle');
  const update = (statusId: string, value: number) => onChange({ ...values, [statusId]: value });
  return (
    <>
      {stackStatuses.map((status) => (
        <NumberControl
          key={status.id}
          label={`${status.label}スタック`}
          ariaLabel={`${sideLabel} ${status.label}スタック`}
          value={values[status.id] ?? 0}
          min={status.debug.min ?? 0}
          max={status.debug.max ?? 99}
          step={status.debug.step ?? 1}
          onChange={(value) => update(status.id, value)}
        />
      ))}
      {toggleStatuses.length > 0 && (
        <div className="debug-status-toggles">
          {toggleStatuses.map((status) => {
            const active = (values[status.id] ?? 0) > 0;
            return (
              <button
                key={status.id}
                aria-label={`${sideLabel} ${status.label} ${status.description}`}
                aria-pressed={active}
                className={active ? 'active' : ''}
                onClick={() => update(status.id, active ? 0 : 1)}
              >
                <span>{status.label}</span>
                <small>{status.description}</small>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function DebugBattlePreview({
  input,
  result,
  sequence,
}: {
  input: DebugSimulationInput;
  result: DebugSimulationResult | null;
  sequence: number;
}) {
  const initialFighters = useMemo(() => createDebugFighters(input), [input]);
  const [fighters, setFighters] = useState<Fighter[]>(initialFighters);
  const [flash, setFlash] = useState<BattleFlash | null>(null);
  const [impact, setImpact] = useState<{ amount: number; kind: DebugEffectEvent['kind'] } | null>(null);
  const [running, setRunning] = useState(false);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    const timers: number[] = [];
    let recoveryTimer: number | null = null;
    setFighters(initialFighters);
    setFlash(null);
    setImpact(null);
    setRunning(false);
    setRecovering(false);
    if (!result) return undefined;

    const frames = result.playback.slice(0, 18);
    if (frames.length === 0) return undefined;
    const interval = Math.max(230, Math.min(620, Math.floor(3800 / frames.length)));
    setRunning(frames.length > 0);

    frames.forEach((frame, index) => {
      timers.push(
        window.setTimeout(
          () => {
            const n = Date.now() + index;
            setFlash({ ...frame.flash, n });
            setFighters(frame.fighters.map((fighter) => ({ ...fighter })));
            if (frame.effect) {
              setImpact({ amount: frame.effect.amount, kind: frame.effect.kind });
              timers.push(window.setTimeout(() => setImpact(null), 520));
            }
            if (frame.effect?.kind === 'damage') {
              setRecovering(true);
              if (recoveryTimer !== null) window.clearTimeout(recoveryTimer);
              recoveryTimer = window.setTimeout(() => {
                setFighters((current) =>
                  current.map((fighter) =>
                    fighter.instanceId === 'debug-target' ? { ...fighter, hp: fighter.maxHp } : fighter,
                  ),
                );
                setRecovering(false);
              }, DEBUG_TRAINING_CONFIG.recoveryDelaySeconds * 1000);
              timers.push(recoveryTimer);
            }
          },
          180 + index * interval,
        ),
      );
    });
    timers.push(window.setTimeout(() => setRunning(false), 460 + frames.length * interval));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [initialFighters, result, sequence]);

  const actor = fighters.find((fighter) => fighter.instanceId === 'debug-actor') ?? fighters[0];
  const target = fighters.find((fighter) => fighter.instanceId === 'debug-target') ?? fighters[1];
  const elapsed = result?.elapsed ?? 0;
  const currentDistance = Math.abs(actor.x - target.x);
  const actorInRange = currentDistance <= actor.range;
  const mutuallyInRange = currentDistance <= actor.range && currentDistance <= target.range;
  const rangeLabel = mutuallyInRange ? '相互射程内' : actorInRange ? '攻撃側の射程内' : '攻撃側の射程外';

  return (
    <section className="debug-arena-stage" aria-label="1対1戦闘テスト">
      <div className="battle-hud debug-battle-hud">
        <div className="hud-team ally">
          <small>ATTACKER</small>
          <b>{Math.ceil(actor.hp)}</b>
          <span>HP</span>
        </div>
        <div className="timer">
          <small>{running ? 'MEASURING' : result ? 'COMPLETE' : 'STANDBY'}</small>
          <b>
            {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')}
          </b>
        </div>
        <div className="hud-team enemy">
          <small>AUTO-RECOVERY DUMMY</small>
          <b>{Math.ceil(target.hp)}</b>
          <span>HP</span>
        </div>
      </div>
      <BattleScene fighters={fighters} flash={flash} running={running} />
      <div className={`debug-range-lock ${actorInRange ? '' : 'is-outside'}`}>
        <Crosshair size={13} />
        <span>{rangeLabel}</span>
        <b>{currentDistance.toFixed(1)} RNG</b>
        <small>
          {actor.range} / {target.range}
        </small>
      </div>
      <div className={`debug-auto-recovery ${recovering ? 'is-pending' : ''}`}>
        <i />
        <span>{recovering ? 'RECOVERING' : 'AUTO RECOVER'}</span>
        <b>被弾後 {DEBUG_TRAINING_CONFIG.recoveryDelaySeconds.toFixed(1)}秒で全回復</b>
      </div>
      {impact && (
        <div className={`debug-impact-pop ${impact.kind}`} key={`${sequence}-${flash?.n}`}>
          <strong>
            {impact.kind === 'damage' ? '-' : '+'}
            {impact.amount}
          </strong>
          <span>{impact.kind === 'damage' ? 'DAMAGE' : 'REPAIR'}</span>
        </div>
      )}
      <div className="debug-duel-bars">
        {[actor, target].map((fighter) => (
          <div className={fighter.team} key={fighter.instanceId}>
            <span>{fighter.name}</span>
            <b>
              {Math.ceil(fighter.hp)} / {fighter.maxHp}
            </b>
            <i>
              <span style={{ width: `${Math.max(0, (fighter.hp / fighter.maxHp) * 100)}%` }} />
            </i>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DebugRoom() {
  const [view, setView] = useState<'lab' | 'synergy'>('lab');
  const [input, setInput] = useState<DebugSimulationInput>(createDefaultInput);
  const [measuredInput, setMeasuredInput] = useState<DebugSimulationInput>(createDefaultInput);
  const [result, setResult] = useState<DebugSimulationResult | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [sequence, setSequence] = useState(0);
  const [dirty, setDirty] = useState(false);
  const configScrollRef = useRef<HTMLDivElement>(null);

  const instruction = instructionById.get(input.instructionId) ?? INSTRUCTIONS[0];
  const measuredActor = unitById.get(measuredInput.actorUnitId) ?? UNITS[0];
  const measuredInstruction = instructionById.get(measuredInput.instructionId) ?? INSTRUCTIONS[0];
  const measuredTarget = unitById.get(measuredInput.targetUnitId) ?? UNITS[0];
  const isHealing = measuredInstruction.action === 'heal';
  const isDamage = hasDamageEffect(measuredInstruction);
  const effectPerUse = isHealing
    ? result && result.executions > 0
      ? Number((result.totalHealing / result.executions).toFixed(1))
      : 0
    : (result?.damagePerHit ?? 0);
  const efficiency = result?.effectPerCost ?? (measuredInstruction.abilityCost === 0 ? 'FREE' : '—');
  const activeActorStatuses = statusLabels(result?.finalActorStatuses ?? measuredInput.actorStatuses);
  const activeTargetStatuses = statusLabels(result?.finalTargetStatuses ?? measuredInput.targetStatuses);

  const updateInput = (next: Partial<DebugSimulationInput>) => {
    setInput((current) => ({ ...current, ...next }));
    setDirty(true);
  };

  const openSettings = () => {
    if (configScrollRef.current) configScrollRef.current.scrollTop = 0;
    setSetupOpen(true);
  };

  const selectInstruction = (instructionId: string) => {
    const nextInstruction = instructionById.get(instructionId);
    if (!nextInstruction) return;
    const nextCondition = conditionById.get(nextInstruction.condition);
    setInput((current) => {
      const statusId = nextCondition?.kind === 'selfHasStatus' ? nextCondition.params.statusId : undefined;
      return {
        ...current,
        instructionId,
        conditionId: nextInstruction.condition,
        targetSelectorId: nextInstruction.defaultTarget,
        actorHpRatio: nextCondition?.kind === 'selfHpBelow' || nextInstruction.action === 'heal' ? 0.25 : 1,
        actorStatuses: statusId
          ? { ...current.actorStatuses, [statusId]: nextCondition?.params.minimumStacks ?? 1 }
          : current.actorStatuses,
      };
    });
    setDirty(true);
  };

  const selectTargetPreset = (targetUnitId: string) => {
    const unit = unitById.get(targetUnitId);
    if (!unit) return;
    updateInput({
      targetUnitId,
      targetMaxHp: unit.maxHp,
      targetDefense: unit.defense,
      targetWeight: unit.weight,
      targetRole: unit.role,
    });
  };

  const measure = () => {
    const next = {
      ...input,
      actorStatuses: { ...input.actorStatuses },
      targetStatuses: { ...input.targetStatuses },
    };
    setMeasuredInput(next);
    setResult(runDebugSimulation(next));
    setSequence((current) => current + 1);
    setDirty(false);
    setSetupOpen(false);
  };

  const resetBattle = () => {
    setResult(null);
    setSequence((current) => current + 1);
  };

  const applySettings = () => {
    setMeasuredInput({
      ...input,
      actorStatuses: { ...input.actorStatuses },
      targetStatuses: { ...input.targetStatuses },
    });
    setResult(null);
    setSequence((current) => current + 1);
    setDirty(false);
    setSetupOpen(false);
  };

  const restoreDefaults = () => {
    const next = createDefaultInput();
    setInput(next);
    setMeasuredInput(next);
    setResult(null);
    setSequence((current) => current + 1);
    setDirty(false);
  };

  const primaryValue = result
    ? isHealing
      ? result.totalHealing
      : isDamage
        ? result.lastDamage
        : result.executions
    : 0;
  const primaryLabel = isHealing ? 'TOTAL REPAIR' : isDamage ? 'LAST HIT DAMAGE' : 'EXECUTED';
  const verdict = result
    ? result.verdict === 'damage'
      ? 'DAMAGE CONFIRMED'
      : result.verdict === 'healing'
        ? 'REPAIR CONFIRMED'
        : result.verdict === 'effect'
          ? 'EFFECT CONFIRMED'
          : 'NO EFFECT'
    : 'READY TO MEASURE';

  if (view === 'synergy') return <SynergyGraph onBack={() => setView('lab')} />;

  return (
    <div className="debug-room">
      <header className="debug-room-head">
        <div className="debug-room-title">
          <span>ONE-ON-ONE COMBAT LAB</span>
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
        <div className="debug-head-actions">
          <button className="debug-synergy-button" onClick={() => setView('synergy')}>
            <Network size={15} /> シナジー
          </button>
          <button className="debug-settings-button" onClick={openSettings}>
            <Settings2 size={15} /> 設定
          </button>
          <button className="debug-reset-button" onClick={resetBattle}>
            <RotateCcw size={15} /> リセット
          </button>
          <button className="debug-run-button" onClick={measure}>
            <Play size={15} fill="currentColor" /> 計測開始
          </button>
        </div>
      </header>

      <div className="debug-workspace">
        <main className="debug-duel">
          <header className="debug-duel-head">
            <div>
              <small>ATTACKER</small>
              <b>{measuredActor.name}</b>
              <span>
                ATK {measuredActor.attack} · RNG {measuredActor.range} · SPD {measuredActor.speed.toFixed(2)}
              </span>
            </div>
            <div className="debug-versus">VS</div>
            <div className="enemy">
              <small>RECOVERY DUMMY</small>
              <b>{measuredTarget.name}</b>
              <span>
                DEF {measuredInput.targetDefense} · WGT {measuredInput.targetWeight} · {measuredInput.targetRole}
              </span>
            </div>
          </header>

          <DebugBattlePreview key={sequence} input={measuredInput} result={result} sequence={sequence} />

          <section className="debug-impact-tape" aria-label="技別ダメージログ">
            <header>
              <span>HIT LOG / {measuredInstruction.title}</span>
              <b>{result ? `${result.events.length} EVENTS` : 'NO DATA'}</b>
            </header>
            <div>
              {result?.events
                .slice(-8)
                .reverse()
                .map((event, index) => (
                  <article className={event.kind} key={`${event.elapsed}-${index}`}>
                    <small>{event.elapsed.toFixed(1)}s</small>
                    <span>{event.kind === 'damage' ? 'DAMAGE' : 'REPAIR'}</span>
                    <b>{event.amount}</b>
                  </article>
                ))}
              {!result?.events.length && <p>「計測開始」で、この技の実ダメージを記録します。</p>}
            </div>
          </section>
        </main>

        <aside className="debug-telemetry" aria-label="計測結果">
          <header>
            <span>
              <Activity size={14} /> TELEMETRY
            </span>
            <b className={dirty ? 'is-stale' : ''}>{dirty ? '設定変更あり' : result ? '計測済み' : '待機中'}</b>
          </header>

          <div className="debug-skill-readout">
            <div>
              <small>{measuredInstruction.action.toUpperCase()}</small>
              <b>{measuredInstruction.title}</b>
            </div>
            <span>COST {measuredInstruction.abilityCost}</span>
          </div>

          <div className="debug-verdict">
            <small>{verdict}</small>
            <strong>{primaryValue}</strong>
            <span>{primaryLabel}</span>
          </div>

          <div className="debug-primary-metrics">
            <Metric label={isHealing ? '1 REPAIR' : '1 HIT'} value={effectPerUse} tone="cyan" />
            <Metric
              label={isHealing ? 'TOTAL REPAIR' : 'TOTAL DAMAGE'}
              value={isHealing ? (result?.totalHealing ?? 0) : (result?.totalDamage ?? 0)}
              tone="amber"
            />
            <Metric
              label={isHealing ? 'HPS' : 'DPS'}
              value={isHealing ? (result?.healingPerSecond ?? 0) : (result?.dps ?? 0)}
              tone="lime"
            />
            <Metric label={isHealing ? 'REPAIR / COST' : 'DMG / COST'} value={result ? efficiency : '—'} />
            <Metric label="EXECUTED" value={result ? `${result.executions}/${result.attempts}` : '0/0'} />
            <Metric label="AUTO RECOVER" value={result?.targetRecoveryCount ?? 0} />
          </div>

          <section className="debug-target-profile">
            <header>
              <span>ENEMY PROFILE</span>
              <b>HP {measuredInput.targetMaxHp}</b>
            </header>
            <div className="debug-profile-stats">
              <span>
                DEF <b>{measuredInput.targetDefense}</b>
              </span>
              <span>
                WGT <b>{measuredInput.targetWeight}</b>
              </span>
              <span>
                ROLE <b>{measuredInput.targetRole}</b>
              </span>
            </div>
            <div className="debug-profile-statuses">
              <div>
                <small>ATTACKER</small>
                <p>
                  {activeActorStatuses.length > 0 ? (
                    activeActorStatuses.map((status) => <span key={status}>{status}</span>)
                  ) : (
                    <span className="normal">状態なし</span>
                  )}
                </p>
              </div>
              <div>
                <small>DUMMY</small>
                <p>
                  {activeTargetStatuses.length > 0 ? (
                    activeTargetStatuses.map((status) => <span key={status}>{status}</span>)
                  ) : (
                    <span className="normal">状態なし</span>
                  )}
                </p>
              </div>
            </div>
          </section>

          <div className="debug-secondary-metrics">
            <span>
              <Zap size={13} /> 消費コスト <b>{result?.costSpent ?? 0}</b>
            </span>
            <span>
              <Gauge size={13} /> 最低ゲージ <b>{result?.minimumGauge ?? measuredInput.initialGauge}</b>
            </span>
            <span>
              <Crosshair size={13} /> 対象移動 <b>{result?.targetDisplacement ?? 0}</b>
            </span>
            <span>
              <TimerReset size={13} /> 自分移動 <b>{result?.actorDisplacement ?? 0}</b>
            </span>
          </div>

          <div className="debug-skips">
            <span>SKIPPED REASONS</span>
            <div>
              {(Object.keys(skipLabels) as Array<keyof typeof skipLabels>).map((reason) => (
                <span className={(result?.skipped[reason] ?? 0) > 0 ? 'has-skips' : ''} key={reason}>
                  {skipLabels[reason]} <b>{result?.skipped[reason] ?? 0}</b>
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <aside className={`debug-config ${setupOpen ? 'is-open' : ''}`} aria-label="デバッグ設定">
        <header>
          <div>
            <small>DUEL LOADOUT</small>
            <b>計測設定</b>
          </div>
          <button aria-label="設定を閉じる" onClick={() => setSetupOpen(false)}>
            <X size={18} />
          </button>
        </header>

        <div className="debug-config-scroll" ref={configScrollRef}>
          <div className="debug-config-section">
            <span>攻撃側</span>
            <label className="debug-select-control">
              <span>攻撃ユニット</span>
              <select
                aria-label="攻撃ユニット"
                value={input.actorUnitId}
                onChange={(event) => updateInput({ actorUnitId: event.target.value })}
              >
                {UNITS.map((unit) => (
                  <option value={unit.id} key={unit.id}>
                    {unit.name} / ATK {unit.attack} / RNG {unit.range}
                  </option>
                ))}
              </select>
            </label>
            <label className="debug-select-control">
              <span>計測する技</span>
              <select
                aria-label="計測する技"
                value={input.instructionId}
                onChange={(event) => selectInstruction(event.target.value)}
              >
                {INSTRUCTIONS.map((option) => (
                  <option value={option.id} key={option.id}>
                    {option.title} / COST {option.abilityCost}
                  </option>
                ))}
              </select>
            </label>
            <div className="debug-readonly-condition">
              <span>発動条件</span>
              <b>{conditionById.get(instruction.condition)?.label ?? instruction.condition}</b>
            </div>
            <div className="debug-control-grid">
              <NumberControl
                label="開始コスト"
                value={input.initialGauge}
                min={0}
                max={BATTLE_CONFIG.abilityGaugeMax}
                step={0.5}
                suffix={`/ ${BATTLE_CONFIG.abilityGaugeMax}`}
                onChange={(initialGauge) => updateInput({ initialGauge })}
              />
              <NumberControl
                label="攻撃側の現在HP"
                value={Math.round(input.actorHpRatio * 100)}
                min={1}
                max={100}
                suffix="%"
                onChange={(value) => updateInput({ actorHpRatio: value / 100 })}
              />
            </div>
          </div>

          <div className="debug-config-section status actor-status">
            <span>攻撃側の状態</span>
            <StatusControls
              sideLabel="攻撃側"
              values={input.actorStatuses}
              onChange={(actorStatuses) => updateInput({ actorStatuses })}
            />
          </div>

          <div className="debug-config-section position">
            <span>開始位置</span>
            <label className="debug-select-control">
              <span>射程プリセット</span>
              <select
                aria-label="開始位置"
                value={input.positionPresetId}
                onChange={(event) => updateInput({ positionPresetId: event.target.value })}
              >
                {DEBUG_TRAINING_CONFIG.positionPresets.map((preset) => (
                  <option value={preset.id} key={preset.id}>
                    {preset.label} / {preset.description}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="debug-config-section enemy">
            <span>敵ユニット</span>
            <label className="debug-select-control">
              <span>素体</span>
              <select
                aria-label="敵ユニット"
                value={input.targetUnitId}
                onChange={(event) => selectTargetPreset(event.target.value)}
              >
                {UNITS.map((unit) => (
                  <option value={unit.id} key={unit.id}>
                    {unit.name} / DEF {unit.defense} / WGT {unit.weight}
                  </option>
                ))}
              </select>
            </label>
            <label className="debug-select-control">
              <span>ロール属性</span>
              <select
                aria-label="敵のロール属性"
                value={input.targetRole}
                onChange={(event) => updateInput({ targetRole: event.target.value as Role })}
              >
                {roles.map((role) => (
                  <option value={role} key={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <div className="debug-control-grid three">
              <NumberControl
                label="最大HP"
                value={input.targetMaxHp}
                min={1}
                max={99999}
                onChange={(targetMaxHp) => updateInput({ targetMaxHp })}
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
            </div>
          </div>

          <div className="debug-config-section status">
            <span>敵の状態</span>
            <StatusControls
              sideLabel="敵側"
              values={input.targetStatuses}
              onChange={(targetStatuses) => updateInput({ targetStatuses })}
            />
          </div>

          <div className="debug-recovery-note">
            <Activity size={15} />
            <div>
              <b>HPだけ自動復元</b>
              <span>
                敵はHP {DEBUG_TRAINING_CONFIG.minimumDummyHp}で耐え、
                {DEBUG_TRAINING_CONFIG.recoveryDelaySeconds.toFixed(1)}
                秒後に全回復。移動と状態はリセットまで保持します。
              </span>
            </div>
          </div>
        </div>

        <footer>
          <button className="debug-defaults-button" onClick={restoreDefaults}>
            <RotateCcw size={14} /> 初期設定に戻す
          </button>
          <button className="debug-apply-button" onClick={applySettings}>
            設定を適用
          </button>
        </footer>
      </aside>

      {setupOpen && (
        <button className="debug-config-backdrop" aria-label="設定を閉じる" onClick={() => setSetupOpen(false)} />
      )}

      <footer className="debug-mobile-dock">
        <button onClick={() => setView('synergy')}>
          <Network size={17} />
          シナジー
        </button>
        <button onClick={openSettings}>
          <Settings2 size={17} />
          設定
        </button>
        <button onClick={resetBattle}>
          <RotateCcw size={17} />
          リセット
        </button>
        <button className="debug-mobile-run" onClick={measure}>
          <Play size={17} fill="currentColor" />
          計測開始
        </button>
      </footer>
    </div>
  );
}
