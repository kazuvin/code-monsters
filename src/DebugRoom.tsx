import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Crosshair,
  Gauge,
  Play,
  RotateCcw,
  Settings2,
  Shield,
  Sparkles,
  TimerReset,
  X,
  Zap,
} from 'lucide-react';
import { BattleScene } from './BattleScene';
import {
  createDebugFighters,
  runDebugSimulation,
  type DebugEffectEvent,
  type DebugSimulationInput,
  type DebugSimulationResult,
} from './core/debug-simulation';
import { BATTLE_CONFIG, CONDITIONS, INSTRUCTIONS, UNITS } from './data';
import type { BattleFlash, Fighter, Role } from './types';

const unitById = new Map(UNITS.map((unit) => [unit.id, unit]));
const instructionById = new Map(INSTRUCTIONS.map((instruction) => [instruction.id, instruction]));
const conditionById = new Map(CONDITIONS.map((condition) => [condition.id, condition]));

const defaultTarget = unitById.get('bastion') ?? UNITS[0];
const defaultInstruction = instructionById.get('attack-low') ?? INSTRUCTIONS[0];

const roles: Array<{ id: Role; label: string }> = [
  { id: 'STRIKER', label: 'ストライカー' },
  { id: 'TANK', label: 'タンク' },
  { id: 'SUPPORT', label: 'サポート' },
  { id: 'VENOM', label: 'ヴェノム' },
  { id: 'CHASE', label: 'チェイス' },
  { id: 'HACKER', label: 'ハッカー' },
  { id: 'BERSERKER', label: 'バーサーカー' },
];

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
  targetPoison: 0,
  targetGuarded: false,
  targetBerserk: false,
  targetTaunted: false,
});

const skipLabels = {
  condition: '条件不一致',
  range: '射程外',
  cost: 'コスト不足',
  state: '状態重複',
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

const damageActions = new Set(['attack', 'heavy', 'throw', 'poison', 'burn', 'follow']);

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
          aria-label={label}
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

function visualKind(instruction: (typeof INSTRUCTIONS)[number]): BattleFlash['kind'] {
  if (instruction.action === 'move') return instruction.visualKind === 'dash' ? 'dash' : 'move';
  if (instruction.action === 'buff') return 'wait';
  return instruction.action;
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
  const instruction = instructionById.get(input.instructionId) ?? INSTRUCTIONS[0];

  useEffect(() => {
    const timers: number[] = [];
    setFighters(initialFighters);
    setFlash(null);
    setImpact(null);
    setRunning(false);
    if (!result) return undefined;

    const events =
      result.events.length > 0 ? result.events.slice(0, 18) : [{ elapsed: 0, amount: 0, kind: 'damage' as const }];
    const interval = Math.max(230, Math.min(620, Math.floor(3800 / events.length)));
    const actorId = 'debug-actor';
    const targetId = instruction.action === 'heal' || instruction.targetMode === 'self' ? actorId : 'debug-target';
    setRunning(true);

    events.forEach((event, index) => {
      timers.push(
        window.setTimeout(
          () => {
            const n = Date.now() + index;
            setFlash({
              id: actorId,
              kind: visualKind(instruction),
              n,
              targetId,
              attackType: initialFighters[0]?.attackType,
              actionLabel: instruction.short,
            });
            if (event.amount > 0) {
              setImpact({ amount: event.amount, kind: event.kind });
              setFighters((current) =>
                current.map((fighter) => {
                  if (fighter.instanceId !== targetId) return fighter;
                  const hp =
                    event.kind === 'damage'
                      ? Math.max(1, fighter.maxHp - event.amount)
                      : Math.min(fighter.maxHp, fighter.hp + event.amount);
                  return { ...fighter, hp };
                }),
              );
              timers.push(
                window.setTimeout(() => {
                  setFighters((current) =>
                    current.map((fighter) =>
                      fighter.instanceId === 'debug-target' ? { ...fighter, hp: fighter.maxHp } : fighter,
                    ),
                  );
                  setImpact(null);
                }, 180),
              );
            }
          },
          180 + index * interval,
        ),
      );
    });
    timers.push(window.setTimeout(() => setRunning(false), 460 + events.length * interval));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [initialFighters, instruction, result, sequence]);

  const actor = fighters.find((fighter) => fighter.instanceId === 'debug-actor') ?? fighters[0];
  const target = fighters.find((fighter) => fighter.instanceId === 'debug-target') ?? fighters[1];
  const elapsed = result?.elapsed ?? 0;

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
      <div className="debug-range-lock">
        <Crosshair size={13} />
        <span>相互射程内</span>
        <b>{(result?.mutualDistance ?? Math.abs(actor.x - target.x)).toFixed(1)} RNG</b>
        <small>
          {actor.range} / {target.range}
        </small>
      </div>
      <div className="debug-auto-recovery">
        <i />
        <span>AUTO RECOVER</span>
        <b>被弾後 0.18秒で全回復</b>
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
  const isDamage = damageActions.has(measuredInstruction.action);
  const effectPerUse = isHealing
    ? result && result.executions > 0
      ? Number((result.totalHealing / result.executions).toFixed(1))
      : 0
    : (result?.damagePerHit ?? 0);
  const efficiency = result?.effectPerCost ?? (measuredInstruction.abilityCost === 0 ? 'FREE' : '—');
  const activeStatuses = [
    measuredInput.targetPoison > 0 ? `毒 ×${measuredInput.targetPoison}` : null,
    measuredInput.targetGuarded ? 'ガード' : null,
    measuredInput.targetBerserk ? 'バーサーク' : null,
    measuredInput.targetTaunted ? '挑発' : null,
  ].filter(Boolean);

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
    updateInput({
      instructionId,
      conditionId: nextInstruction.condition,
      targetSelectorId: nextInstruction.defaultTarget,
      actorHpRatio: nextInstruction.condition === 'selfHpBelow30' || nextInstruction.action === 'heal' ? 0.25 : 1,
    });
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
    const next = { ...input };
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
    setMeasuredInput({ ...input });
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

          <DebugBattlePreview input={measuredInput} result={result} sequence={sequence} />

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
              <small>{actionLabels[measuredInstruction.action]}</small>
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
              {activeStatuses.length > 0 ? (
                activeStatuses.map((status) => <span key={status}>{status}</span>)
              ) : (
                <span className="normal">状態なし</span>
              )}
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
                  <option value={role.id} key={role.id}>
                    {role.label} / {role.id}
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
            <NumberControl
              label="毒スタック"
              value={input.targetPoison}
              min={0}
              max={99}
              onChange={(targetPoison) => updateInput({ targetPoison })}
            />
            <div className="debug-status-toggles">
              <button
                aria-pressed={input.targetGuarded}
                className={input.targetGuarded ? 'active' : ''}
                onClick={() => updateInput({ targetGuarded: !input.targetGuarded })}
              >
                <Shield size={14} />
                <span>ガード</span>
                <small>被ダメージ軽減</small>
              </button>
              <button
                aria-pressed={input.targetBerserk}
                className={input.targetBerserk ? 'active' : ''}
                onClick={() => updateInput({ targetBerserk: !input.targetBerserk })}
              >
                <Sparkles size={14} />
                <span>バーサーク</span>
                <small>状態表示</small>
              </button>
              <button
                aria-pressed={input.targetTaunted}
                className={input.targetTaunted ? 'active' : ''}
                onClick={() => updateInput({ targetTaunted: !input.targetTaunted })}
              >
                <Crosshair size={14} />
                <span>挑発</span>
                <small>標的固定</small>
              </button>
            </div>
          </div>

          <div className="debug-recovery-note">
            <Activity size={15} />
            <div>
              <b>自動復元が常時有効</b>
              <span>敵HPと両者の位置は、効果を記録した直後に初期状態へ戻ります。</span>
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
