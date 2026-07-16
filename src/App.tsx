import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Coins,
  Lock,
  LockOpen,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  Sparkles,
  Swords,
  X,
  Zap,
} from 'lucide-react';
import { BattleScene } from './BattleScene';
import { applyBattleStep, isBattleComplete, planBattleFrame, type BattleStep } from './core/battle-engine';
import { createBattleFighters, createInventoryUnit, unitById } from './core/roster';
import {
  actionCooldown,
  conditionById,
  instructionById,
  instructionMetrics,
  isConditionCompatibleWithTarget,
  isInstructionCompatibleWithTarget,
  targetSelectorById,
  tickCooldowns,
} from './core/rules';
import { createShop, type ShopItem } from './core/shop';
import {
  BATTLE_CONFIG,
  DEFAULT_REACTIONS,
  ECONOMY_CONFIG,
  REACTION_TRIGGERS,
  ROSTER_CONFIG,
  TARGET_SELECTORS,
  type TargetSelectorDefinition,
} from './data';
import type {
  BattleFlash,
  ConditionId,
  Fighter,
  Instruction,
  LogItem,
  ProgramBlock,
  Rarity,
  ReactionBlock,
  ReactionTrigger,
  TargetSelectorId,
  UnitDefinition,
  UnitInventoryItem,
} from './types';

type Phase = 'build' | 'battle' | 'result';
type EditingSlot = { scope: 'program' | 'reaction'; index: number; field: 'target' | 'condition' | 'action' } | null;

const rarityLabels: Record<Rarity, string> = { common: 'COMMON', rare: 'RARE', epic: 'EPIC' };
const reactionTriggerLabels = new Map(REACTION_TRIGGERS.map((trigger) => [trigger.id, trigger.label]));
const reactionDetails = new Map(REACTION_TRIGGERS.map((trigger) => [trigger.id, trigger]));
const attackTypeLabels: Record<UnitDefinition['attackType'], string> = {
  melee: '近距離',
  blunt: '打撃',
  sniper: '狙撃',
};
const actionLabel = (id: string) => instructionById.get(id)?.title ?? id;
const conditionLabel = (id: ConditionId) => conditionById.get(id)?.label ?? id;
const targetLabel = (id: TargetSelectorId) => targetSelectorById.get(id)?.label ?? id;
const actionTargetLabels: Record<Instruction['targetMode'], string> = {
  selected: '対象スロット',
  self: '自分固定',
  allEnemies: '敵全体固定',
  allAllies: '味方全体固定',
};
const actionKindLabels: Record<Instruction['action'], string> = {
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

const InstructionChoiceCard = ({
  instruction,
  unit,
  active,
  reaction = false,
  onSelect,
}: {
  instruction: Instruction;
  unit: UnitDefinition;
  active: boolean;
  reaction?: boolean;
  onSelect: () => void;
}) => {
  const metrics = instructionMetrics(instruction, unit);
  return (
    <button
      className={`instruction-choice-card ${instruction.tone} ${active ? 'active' : ''} ${reaction ? 'reaction-choice' : ''}`}
      aria-pressed={active}
      onClick={onSelect}
    >
      <span className="choice-card-kicker">
        {actionKindLabels[instruction.action]} / {rarityLabels[instruction.rarity]}
      </span>
      <strong>{instruction.title}</strong>
      <span className="choice-card-flavor">{instruction.flavor}</span>
      <span className="choice-action-target">
        <small>対象</small>
        <b>{actionTargetLabels[instruction.targetMode]}</b>
      </span>
      <span className="choice-card-ability">
        <small>ABILITY</small>
        <span>
          {metrics.map((metric) => (
            <span className="choice-metric" key={metric.label}>
              <small>{metric.label}</small>
              <b>{metric.value}</b>
            </span>
          ))}
        </span>
      </span>
      <span className="choice-card-state">{active ? '選択中' : '選ぶ'}</span>
    </button>
  );
};

const ConditionChoiceCard = ({
  title,
  flavor,
  effect,
  active,
  reaction = false,
  onSelect,
}: {
  title: string;
  flavor: string;
  effect: string;
  active: boolean;
  reaction?: boolean;
  onSelect: () => void;
}) => (
  <button
    className={`condition-choice-card ${active ? 'active' : ''} ${reaction ? 'reaction-choice' : ''}`}
    aria-pressed={active}
    onClick={onSelect}
  >
    <span className="choice-card-kicker">{reaction ? 'REACTION TRIGGER' : 'IF CONDITION'}</span>
    <strong>{title}</strong>
    <span className="choice-card-flavor">{flavor}</span>
    <span className="condition-effect">
      <small>判定</small>
      <b>{effect}</b>
    </span>
    <span className="choice-card-state">{active ? '選択中' : '選ぶ'}</span>
  </button>
);

const TargetChoiceCard = ({
  target,
  active,
  onSelect,
}: {
  target: TargetSelectorDefinition;
  active: boolean;
  onSelect: () => void;
}) => (
  <button
    className={`target-choice-card target-${target.domain} ${target.cardinality === 'many' ? 'target-many' : ''} ${active ? 'active' : ''}`}
    aria-pressed={active}
    onClick={onSelect}
  >
    <span className="choice-card-kicker">TARGET / {target.cardinality === 'many' ? 'MULTI' : 'SINGLE'}</span>
    <strong>{target.label}</strong>
    <span className="choice-card-flavor">{target.flavor}</span>
    <span className="choice-card-state">{active ? '選択中' : '選ぶ'}</span>
  </button>
);

const ShopUnitTrait = ({ unit }: { unit: UnitDefinition }) => {
  const reaction = DEFAULT_REACTIONS[unit.id];
  if (!reaction?.fixedReaction) return null;
  const instruction = instructionById.get(reaction.actionId);
  const detail = reactionDetails.get(reaction.trigger);
  if (!instruction || !detail) return null;
  const metrics = instructionMetrics(instruction, unit);
  return (
    <div className={`shop-unit-trait ${instruction.action === 'berserk' ? 'berserk' : ''}`}>
      <small>固有リアクション</small>
      <b>
        {detail.title} → {instruction.short}
      </b>
      <span>{metrics.map((metric) => `${metric.label} ${metric.value}`).join(' / ')}</span>
    </div>
  );
};

let inventorySequence = 0;
const newInventoryUnit = (unitId: string) => createInventoryUnit(unitId, `${unitId}-${++inventorySequence}`);
const initialUnits = ROSTER_CONFIG.startingUnitIds.map(newInventoryUnit);

export function App() {
  const [phase, setPhase] = useState<Phase>('build');
  const [coins, setCoins] = useState(ECONOMY_CONFIG.startingCoins);
  const [round, setRound] = useState(1);
  const [team, setTeam] = useState<UnitInventoryItem[]>(initialUnits);
  const [bench, setBench] = useState<UnitInventoryItem[]>([]);
  const [selected, setSelected] = useState(0);
  const [ownedActions, setOwnedActions] = useState<string[]>([...ROSTER_CONFIG.startingActionIds]);
  const [lastPurchasedAction, setLastPurchasedAction] = useState<string | null>(null);
  const [ownedConditions, setOwnedConditions] = useState<ConditionId[]>([...ROSTER_CONFIG.startingConditionIds]);
  const [editingSlot, setEditingSlot] = useState<EditingSlot>({ scope: 'program', index: 0, field: 'condition' });
  const [shopSeed, setShopSeed] = useState(0);
  const [shop, setShop] = useState(() => createShop());
  const [fighters, setFighters] = useState(() => createBattleFighters(initialUnits));
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [flash, setFlash] = useState<BattleFlash | null>(null);
  const battleQueueRef = useRef<BattleStep[]>([]);
  const lastStepAtRef = useRef(0);
  const [logsOpen, setLogsOpen] = useState(false);
  const [toast, setToast] = useState('');
  const logId = useRef(0);
  const selectedUnit = team[Math.min(selected, team.length - 1)];
  const currentProgram = selectedUnit?.program ?? [];
  const currentReaction = selectedUnit?.reaction ?? null;
  const winner =
    phase === 'result'
      ? fighters.some((fighter) => fighter.team === 'enemy' && fighter.hp > 0)
        ? '敗北'
        : '勝利'
      : '';

  const addLog = useCallback((actor: string, text: string, type: LogItem['type'] = 'info') => {
    const t = Math.max(0, elapsedRef.current);
    setLogs((current) =>
      [
        {
          id: ++logId.current,
          time: `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`,
          actor,
          text,
          type,
        },
        ...current,
      ].slice(0, BATTLE_CONFIG.maxLogEntries),
    );
  }, []);

  const updateSelectedProgram = (updater: (program: ProgramBlock[]) => ProgramBlock[]) =>
    setTeam((units) =>
      units.map((unit, index) => (index === selected ? { ...unit, program: updater(unit.program) } : unit)),
    );
  const updateSelectedReaction = (updater: (reaction: ReactionBlock | null) => ReactionBlock | null) =>
    setTeam((units) =>
      units.map((unit, index) => (index === selected ? { ...unit, reaction: updater(unit.reaction) } : unit)),
    );

  const refresh = () => {
    if (coins < ECONOMY_CONFIG.refreshCost) {
      setToast('コインが足りません');
      return;
    }
    setCoins((current) => current - ECONOMY_CONFIG.refreshCost);
    setShopSeed((current) => current + 1);
    setShop((current) => {
      const next = createShop(shopSeed + 1);
      return next.map((item, index) => (current[index]?.locked ? current[index] : item));
    });
  };

  const toggleLock = (key: string) =>
    setShop((current) => current.map((item) => (item.key === key ? { ...item, locked: !item.locked } : item)));

  const buy = (item: ShopItem) => {
    if (item.kind === 'unit') {
      const unit = unitById.get(item.id)!;
      if (coins < unit.price) {
        setToast('コインが足りません');
        return;
      }
      setCoins((current) => current - unit.price);
      setBench((current) => [...current, newInventoryUnit(unit.id)]);
      setToast(`${unit.name}をインベントリに追加しました`);
    } else {
      const instruction = instructionById.get(item.id)!;
      if (coins < instruction.price) {
        setToast('コインが足りません');
        return;
      }
      setCoins((current) => current - instruction.price);
      setOwnedActions((current) => (current.includes(instruction.id) ? current : [...current, instruction.id]));
      setLastPurchasedAction(instruction.id);
      if (!instruction.reactionOnly)
        setOwnedConditions((current) =>
          current.includes(instruction.condition) ? current : [...current, instruction.condition],
        );
      setToast(`${instruction.title}を取得しました`);
    }
    setShop((current) => current.filter((candidate) => candidate.key !== item.key));
  };

  const moveInstruction = (index: number, direction: -1 | 1) =>
    updateSelectedProgram((program) => {
      const next = [...program];
      const destination = index + direction;
      if (destination < 0 || destination >= next.length) return next;
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  const removeInstruction = (index: number) => {
    if (!currentProgram[index]?.fixedAction)
      updateSelectedProgram((program) => program.filter((_, candidate) => candidate !== index));
  };
  const addInstruction = (actionId = ownedActions[0]) => {
    if (currentProgram.length >= selectedUnit.programLimit) {
      setToast(`指示容量は${selectedUnit.programLimit}です`);
      return;
    }
    const action = instructionById.get(actionId)!;
    updateSelectedProgram((program) => [
      ...program,
      { targetId: action.defaultTarget, conditionId: action.condition, actionId },
    ]);
    setEditingSlot({ scope: 'program', index: currentProgram.length, field: 'target' });
  };
  const addReaction = () => {
    if (currentReaction) return;
    updateSelectedReaction(() => ({ trigger: REACTION_TRIGGERS[0].id, actionId: ownedActions[0] }));
    setEditingSlot({ scope: 'reaction', index: 0, field: 'condition' });
  };
  const removeReaction = () => {
    if (currentReaction?.fixedReaction) return;
    updateSelectedReaction(() => null);
    setEditingSlot({ scope: 'program', index: 0, field: 'condition' });
  };

  const sellSelected = () => {
    if (team.length <= 1) {
      setToast('最後のユニットは売却できません');
      return;
    }
    const value = Math.max(ECONOMY_CONFIG.minimumSellPrice, selectedUnit.price - ECONOMY_CONFIG.sellPricePenalty);
    setCoins((current) => current + value);
    setTeam((current) => current.filter((_, index) => index !== selected));
    setSelected(0);
    setToast(`${selectedUnit.name}を ${value} コインで売却しました`);
  };

  const moveTeamUnitToBench = (index: number) => {
    if (team.length <= 1) {
      setToast('最後のユニットは外せません');
      return;
    }
    setBench((current) => [...current, team[index]]);
    setTeam((current) => current.filter((_, candidate) => candidate !== index));
    setSelected(0);
  };

  const equipBenchUnit = (inventoryId: string) => {
    const unit = bench.find((candidate) => candidate.inventoryId === inventoryId);
    if (!unit) return;
    setBench((current) => current.filter((candidate) => candidate.inventoryId !== inventoryId));
    setTeam((current) => [...current, unit]);
    setSelected(team.length);
  };

  const replaceFocusedSlot = (id: string) => {
    if (!editingSlot) return;
    if (editingSlot.scope === 'reaction') {
      if (currentReaction?.fixedReaction) return;
      updateSelectedReaction((reaction) =>
        reaction
          ? editingSlot.field === 'condition'
            ? { ...reaction, trigger: id as ReactionTrigger }
            : { ...reaction, actionId: id }
          : reaction,
      );
    } else if (editingSlot.field === 'target') {
      const targetId = id as TargetSelectorId;
      updateSelectedProgram((program) =>
        program.map((block, index) => {
          if (index !== editingSlot.index) return block;
          const conditionId = isConditionCompatibleWithTarget(block.conditionId, targetId)
            ? block.conditionId
            : (ownedConditions.find((condition) => isConditionCompatibleWithTarget(condition, targetId)) ??
              block.conditionId);
          return { ...block, targetId, conditionId };
        }),
      );
      setEditingSlot({ ...editingSlot, field: 'condition' });
    } else if (editingSlot.field === 'condition') {
      updateSelectedProgram((program) =>
        program.map((block, index) =>
          index === editingSlot.index ? { ...block, conditionId: id as ConditionId } : block,
        ),
      );
    } else if (!currentProgram[editingSlot.index]?.fixedAction) {
      updateSelectedProgram((program) =>
        program.map((block, index) => (index === editingSlot.index ? { ...block, actionId: id } : block)),
      );
    }
  };

  const startBattle = () => {
    battleQueueRef.current = [];
    lastStepAtRef.current = 0;
    setFlash(null);
    setFighters(createBattleFighters(team));
    setLogs([]);
    setElapsed(0);
    elapsedRef.current = 0;
    setPaused(false);
    setLogsOpen(false);
    setPhase('battle');
    setToast('プログラムを実行します');
  };
  const reset = () => {
    battleQueueRef.current = [];
    lastStepAtRef.current = 0;
    setFlash(null);
    setPhase('build');
    setFighters(createBattleFighters(team));
    setLogs([]);
    setLogsOpen(false);
    setElapsed(0);
    elapsedRef.current = 0;
  };
  const completeBattle = useCallback(() => {
    setLogsOpen(false);
    setPhase('result');
  }, []);

  useEffect(() => {
    if (phase !== 'battle' || paused) return;
    const timer = setInterval(() => {
      const dt = BATTLE_CONFIG.tickSeconds * speed;
      const previousElapsed = elapsedRef.current;
      elapsedRef.current += dt;
      setElapsed(elapsedRef.current);
      const queuedStep = battleQueueRef.current[0];
      const now = Date.now();
      if (queuedStep && now - lastStepAtRef.current >= BATTLE_CONFIG.actionStepMs / speed) {
        battleQueueRef.current = battleQueueRef.current.slice(1);
        lastStepAtRef.current = now;
        setFighters((current) => {
          const next = applyBattleStep(tickCooldowns(current, dt), queuedStep);
          setFlash({ ...queuedStep.flash, n: now });
          if (queuedStep.log) addLog(queuedStep.log.actor, queuedStep.log.text, queuedStep.log.type);
          if (isBattleComplete(next)) setTimeout(completeBattle, BATTLE_CONFIG.resultDelayMs);
          return next;
        });
        return;
      }
      if (queuedStep) {
        setFighters((current) => tickCooldowns(current, dt));
        return;
      }
      setFighters((current) => {
        const plan = planBattleFrame({ fighters: current, team, dt, elapsed: elapsedRef.current, previousElapsed });
        battleQueueRef.current.push(...plan.steps);
        for (const log of plan.logs) addLog(log.actor, log.text, log.type);
        if (plan.complete) setTimeout(completeBattle, BATTLE_CONFIG.resultDelayMs);
        return plan.fighters;
      });
    }, BATTLE_CONFIG.tickSeconds * 1000);
    return () => clearInterval(timer);
  }, [phase, paused, speed, team, addLog, completeBattle]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 1800);
    return () => clearTimeout(timer);
  }, [toast]);
  const teamHp = useMemo(
    () =>
      fighters
        .filter((fighter) => fighter.team === 'ally')
        .reduce((total, fighter) => total + Math.max(0, fighter.hp), 0),
    [fighters],
  );
  const enemyHp = useMemo(
    () =>
      fighters
        .filter((fighter) => fighter.team === 'enemy')
        .reduce((total, fighter) => total + Math.max(0, fighter.hp), 0),
    [fighters],
  );
  const fighterGroups = useMemo(
    () => [
      { key: 'ally', label: '味方ユニット', units: fighters.filter((fighter) => fighter.team === 'ally') },
      { key: 'enemy', label: '敵ユニット', units: fighters.filter((fighter) => fighter.team === 'enemy') },
    ],
    [fighters],
  );
  const statusTags = (fighter: Fighter) => {
    if (fighter.hp <= 0) return ['戦闘不能'];
    const tags = [fighter.berserk ? '暴走' : '正常'];
    if (fighter.guarded) tags.push('防御');
    if (fighter.poison > 0) tags.push(`毒 ${fighter.poison}`);
    if (fighter.tauntSeconds > 0) tags.push(`標的固定 ${fighter.tauntSeconds.toFixed(1)}秒`);
    if (fighter.cooldown > 0.55) tags.push('準備中');
    return tags;
  };
  const cooldownProgress = (fighter: Fighter) =>
    Math.max(0, Math.min(1, 1 - fighter.cooldown / actionCooldown(fighter.speed)));

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">CM_</span>
          <div>
            <strong>CODE MONSTERS</strong>
            <small>BUILD / COMPILE / BATTLE</small>
          </div>
        </div>
        <div className="round">
          <small>ROUND</small>
          <b>{String(round).padStart(2, '0')}</b>
          <span>1W / 0L</span>
        </div>
        <div className="wallet">
          <Coins size={16} />
          <b>{coins}</b>
          <small>COIN</small>
        </div>
      </header>
      {phase === 'build' ? (
        <div className="build-layout">
          <section className="workbench">
            <div className="section-head">
              <div>
                <span className="step-no">01</span>
                <h2>作戦</h2>
              </div>
              <span className="capacity">
                通常 {currentProgram.length} / {selectedUnit.programLimit}
              </span>
            </div>
            <div className="unit-tabs">
              {team.map((unit, index) => (
                <button
                  key={unit.inventoryId}
                  className={selected === index ? 'active' : ''}
                  onClick={() => {
                    setSelected(index);
                    setEditingSlot({ scope: 'program', index: 0, field: 'condition' });
                  }}
                >
                  <span className="unit-dot" style={{ background: unit.color }} />
                  <span>
                    {unit.name}
                    <small>{unit.role}</small>
                  </span>
                  <b>{unit.code}</b>
                </button>
              ))}
            </div>
            <div className="unit-meta">
              <div>
                <span>{selectedUnit.code}</span>
                <h3>{selectedUnit.name}</h3>
                <small>
                  {attackTypeLabels[selectedUnit.attackType]} / {rarityLabels[selectedUnit.rarity]} / 枠{' '}
                  {selectedUnit.programLimit}
                </small>
              </div>
              <div className="stats">
                <span>
                  HP <b>{selectedUnit.maxHp}</b>
                </span>
                <span>
                  ATK <b>{selectedUnit.attack}</b>
                </span>
                <span>
                  RNG <b>{selectedUnit.range}</b>
                </span>
                <span>
                  KB <b>{selectedUnit.knockbackPower}</b>
                </span>
                <span>
                  WT <b>{selectedUnit.weight}</b>
                </span>
                <span>
                  SPD <b>{selectedUnit.speed}</b>
                </span>
              </div>
              <button className="sell-unit" onClick={sellSelected}>
                売却 +{Math.max(ECONOMY_CONFIG.minimumSellPrice, selectedUnit.price - ECONOMY_CONFIG.sellPricePenalty)}
              </button>
              <button className="bench-unit" onClick={() => moveTeamUnitToBench(selected)}>
                外す
              </button>
            </div>
            <div className="mode-label">
              <span>NORMAL LOOP</span>
              <b>クールダウン完了時に上から評価</b>
            </div>
            <div className="program-list sentence-list">
              {currentProgram.map((block, index) => {
                const instruction = instructionById.get(block.actionId)!;
                const target = targetSelectorById.get(block.targetId)!;
                const targetActive =
                  editingSlot?.scope === 'program' && editingSlot.index === index && editingSlot.field === 'target';
                const conditionActive =
                  editingSlot?.scope === 'program' && editingSlot.index === index && editingSlot.field === 'condition';
                const actionActive =
                  editingSlot?.scope === 'program' && editingSlot.index === index && editingSlot.field === 'action';
                return (
                  <article
                    className={`code-block sentence-block ${instruction.tone} ${block.fixedAction ? 'fixed-action' : ''}`}
                    key={`${block.actionId}-${block.conditionId}-${index}`}
                  >
                    <div className="line-no">{index + 1}</div>
                    <div className="sentence-copy">
                      <span>もし</span>
                      <button
                        className={`word-slot target-word-slot target-${target.domain} ${target.cardinality === 'many' ? 'target-many' : ''} ${targetActive ? 'active' : ''}`}
                        onClick={() => setEditingSlot({ scope: 'program', index, field: 'target' })}
                      >
                        {targetLabel(block.targetId)}
                      </button>
                      <span>が</span>
                      <button
                        className={conditionActive ? 'word-slot active' : 'word-slot'}
                        onClick={() => setEditingSlot({ scope: 'program', index, field: 'condition' })}
                      >
                        {conditionLabel(block.conditionId)}
                      </button>
                      <span>なら</span>
                      <button
                        className={actionActive ? 'word-slot active' : 'word-slot'}
                        disabled={block.fixedAction}
                        onClick={() => setEditingSlot({ scope: 'program', index, field: 'action' })}
                      >
                        {actionLabel(block.actionId)}
                      </button>
                    </div>
                    <div className="line-actions">
                      <button aria-label="上へ移動" disabled={index === 0} onClick={() => moveInstruction(index, -1)}>
                        <ArrowUp size={13} />
                      </button>
                      <button
                        aria-label="下へ移動"
                        disabled={index === currentProgram.length - 1}
                        onClick={() => moveInstruction(index, 1)}
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button aria-label="削除" disabled={block.fixedAction} onClick={() => removeInstruction(index)}>
                        <X size={13} />
                      </button>
                    </div>
                  </article>
                );
              })}
              <button className="add-block" onClick={() => addInstruction(lastPurchasedAction ?? ownedActions[0])}>
                ＋ 通常作戦を追加
              </button>
            </div>
            <section className="reaction-loop">
              <div className="mode-label reaction-mode-label">
                <span>REACTION LOOP</span>
                <b>
                  常時監視 · {currentReaction ? '1 / 1' : '0 / 1'} · CD{' '}
                  {BATTLE_CONFIG.reactionCooldownSeconds.toFixed(1)} SEC
                </b>
              </div>
              <div className="program-list sentence-list reaction-list">
                {currentReaction ? (
                  <article
                    className={`code-block sentence-block violet reaction-code-block ${currentReaction.fixedReaction ? 'fixed-action' : ''}`}
                  >
                    <div className="line-no">
                      <Zap size={13} />
                    </div>
                    <div className="sentence-copy">
                      <span>もし</span>
                      <button
                        className={
                          editingSlot?.scope === 'reaction' && editingSlot.field === 'condition'
                            ? 'word-slot active'
                            : 'word-slot'
                        }
                        disabled={currentReaction.fixedReaction}
                        onClick={() => setEditingSlot({ scope: 'reaction', index: 0, field: 'condition' })}
                      >
                        {reactionTriggerLabels.get(currentReaction.trigger)}
                      </button>
                      <span>なら</span>
                      <button
                        className={
                          editingSlot?.scope === 'reaction' && editingSlot.field === 'action'
                            ? 'word-slot active'
                            : 'word-slot'
                        }
                        disabled={currentReaction.fixedReaction}
                        onClick={() => setEditingSlot({ scope: 'reaction', index: 0, field: 'action' })}
                      >
                        {actionLabel(currentReaction.actionId)}
                      </button>
                    </div>
                    <div className="line-actions">
                      <button
                        aria-label="リアクションを削除"
                        disabled={currentReaction.fixedReaction}
                        onClick={removeReaction}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </article>
                ) : (
                  <button className="add-block reaction-add" onClick={addReaction}>
                    <Zap size={13} />＋ リアクションを追加
                  </button>
                )}
              </div>
            </section>
            <div className="choice-panel">
              <div className="choice-head">
                {editingSlot?.scope === 'reaction' ? 'リアクション' : '通常作戦'} /{' '}
                {editingSlot?.field === 'target'
                  ? '対象を選ぶ'
                  : editingSlot?.field === 'condition'
                    ? '条件を選ぶ'
                    : '行動を選ぶ'}
              </div>
              <div className="choice-list">
                {editingSlot?.field === 'target'
                  ? TARGET_SELECTORS.filter((target) => {
                      const block = currentProgram[editingSlot.index];
                      const instruction = block ? instructionById.get(block.actionId) : undefined;
                      return instruction ? isInstructionCompatibleWithTarget(instruction, target.id) : false;
                    }).map((target) => (
                      <TargetChoiceCard
                        key={target.id}
                        target={target}
                        active={currentProgram[editingSlot.index]?.targetId === target.id}
                        onSelect={() => replaceFocusedSlot(target.id)}
                      />
                    ))
                  : editingSlot?.field === 'condition'
                    ? editingSlot.scope === 'reaction'
                      ? REACTION_TRIGGERS.map((trigger) => (
                          <ConditionChoiceCard
                            key={trigger.id}
                            title={trigger.title}
                            flavor={trigger.flavor}
                            effect={trigger.effect}
                            reaction
                            active={currentReaction?.trigger === trigger.id}
                            onSelect={() => replaceFocusedSlot(trigger.id)}
                          />
                        ))
                      : ownedConditions
                          .filter((condition) =>
                            isConditionCompatibleWithTarget(
                              condition,
                              currentProgram[editingSlot.index]?.targetId ?? 'nearestEnemy',
                            ),
                          )
                          .map((condition) => {
                            const detail = conditionById.get(condition)!;
                            return (
                              <ConditionChoiceCard
                                key={condition}
                                title={detail.label}
                                flavor={detail.flavor}
                                effect={detail.effect}
                                active={currentProgram[editingSlot.index]?.conditionId === condition}
                                onSelect={() => replaceFocusedSlot(condition)}
                              />
                            );
                          })
                    : ownedActions
                        .filter((id) => {
                          if (editingSlot?.scope === 'reaction') return true;
                          const instruction = instructionById.get(id);
                          const target = currentProgram[editingSlot?.index ?? 0]?.targetId ?? 'nearestEnemy';
                          return (
                            Boolean(instruction) &&
                            !instruction?.reactionOnly &&
                            isInstructionCompatibleWithTarget(instruction!, target)
                          );
                        })
                        .map((id) => {
                          const instruction = instructionById.get(id)!;
                          return (
                            <InstructionChoiceCard
                              key={id}
                              instruction={instruction}
                              unit={selectedUnit}
                              reaction={editingSlot?.scope === 'reaction'}
                              active={
                                (editingSlot?.scope === 'reaction'
                                  ? currentReaction?.actionId
                                  : currentProgram[editingSlot?.index ?? 0]?.actionId) === id
                              }
                              onSelect={() => replaceFocusedSlot(id)}
                            />
                          );
                        })}
              </div>
            </div>
            <div className="inventory-grid">
              <div className="inventory">
                <small>控え</small>
                <div>
                  {bench.length === 0 ? (
                    <span className="empty-inventory">なし</span>
                  ) : (
                    bench.map((unit) => (
                      <button key={unit.inventoryId} onClick={() => equipBenchUnit(unit.inventoryId)}>
                        <span className="unit-mini" style={{ background: unit.color }} />
                        {unit.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
          <aside className="shop-panel">
            <div className="section-head">
              <div>
                <span className="step-no">02</span>
                <h2>ショップ</h2>
              </div>
              <button className="refresh" onClick={refresh}>
                <RefreshCw size={15} />
                更新 <b>{ECONOMY_CONFIG.refreshCost}</b>
              </button>
            </div>
            <div className="shop-grid">
              {shop.map((item) => {
                const data: UnitDefinition | Instruction =
                  item.kind === 'unit' ? unitById.get(item.id)! : instructionById.get(item.id)!;
                const isUnit = item.kind === 'unit';
                const unit = isUnit ? (data as UnitDefinition) : null;
                const label = unit ? unit.name : (data as Instruction).title;
                const instruction = isUnit ? null : (data as Instruction);
                return (
                  <article
                    className={`shop-item rarity-${data.rarity} ${instruction ? 'instruction-shop-item' : ''}`}
                    key={item.key}
                  >
                    <button className="lock" aria-label="ロック" onClick={() => toggleLock(item.key)}>
                      {item.locked ? <Lock /> : <LockOpen />}
                    </button>
                    <small>
                      {rarityLabels[data.rarity]} /{' '}
                      {unit ? attackTypeLabels[unit.attackType] : actionKindLabels[instruction!.action]}
                    </small>
                    <strong>{label}</strong>
                    {instruction ? (
                      <>
                        <p className="shop-flavor">{instruction.flavor}</p>
                        <div className="shop-metrics">
                          {instructionMetrics(instruction, selectedUnit).map((metric) => (
                            <span key={metric.label}>
                              <small>{metric.label}</small>
                              <b>{metric.value}</b>
                            </span>
                          ))}
                        </div>
                      </>
                    ) : unit ? (
                      <>
                        <p>{`ATK ${unit.attack} / SPD ${unit.speed} / RNG ${unit.range} / 枠 ${unit.programLimit}`}</p>
                        <ShopUnitTrait unit={unit} />
                      </>
                    ) : null}
                    <button className="buy" onClick={() => buy(item)}>
                      <ShoppingCart size={15} />
                      <span>購入</span>
                      <b>
                        <Coins size={13} />
                        {data.price}
                      </b>
                    </button>
                  </article>
                );
              })}
            </div>
            <button className="ready" onClick={startBattle}>
              <Swords />
              戦闘開始
            </button>
          </aside>
        </div>
      ) : (
        <div className="battle-layout">
          <section className="arena">
            <div className="battle-hud">
              <div className="hud-team ally">
                <small>YOUR SQUAD</small>
                <b>{teamHp}</b>
                <span>HP</span>
              </div>
              <div className="timer">
                <small>
                  {elapsed >= BATTLE_CONFIG.overheatStartSeconds - BATTLE_CONFIG.overheatWarningSeconds
                    ? 'OVERHEAT IN'
                    : 'BATTLE TIME'}
                </small>
                <b>
                  {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')}
                </b>
              </div>
              <div className="hud-team enemy">
                <small>ENEMY</small>
                <b>{enemyHp}</b>
                <span>HP</span>
              </div>
            </div>
            <BattleScene fighters={fighters} flash={flash} running={phase === 'battle' && !paused} />
            <div className="unit-bars">
              {fighters.map((fighter) => (
                <div className={fighter.team} key={fighter.instanceId}>
                  <span>{fighter.name}</span>
                  <div>
                    <i style={{ width: `${Math.max(0, (fighter.hp / fighter.maxHp) * 100)}%` }} />
                  </div>
                  <b>{Math.ceil(fighter.hp)}</b>
                </div>
              ))}
            </div>
            <div className="battle-controls">
              <button onClick={() => setPaused((current) => !current)}>{paused ? <Play /> : <Pause />}</button>
              <button className={speed === 1 ? 'active' : ''} onClick={() => setSpeed(1)}>
                x1
              </button>
              <button className={speed === 2 ? 'active' : ''} onClick={() => setSpeed(2)}>
                x2
              </button>
              <button onClick={reset}>
                <RotateCcw />
              </button>
            </div>
          </section>
          <aside className="status-panel">
            <div className="section-head">
              <div>
                <span className="live-dot" />
                <h2>ユニット状態</h2>
              </div>
              <button className="open-log" onClick={() => setLogsOpen(true)}>
                ログ <b>{logs.length}</b>
              </button>
            </div>
            <div className="status-roster">
              {fighterGroups.map((group) => (
                <section className="status-group" key={group.key}>
                  <h3>{group.label}</h3>
                  {group.units.map((fighter) => {
                    const hpRatio = Math.max(0, (fighter.hp / fighter.maxHp) * 100);
                    const cooldownRatio = cooldownProgress(fighter);
                    const active = flash?.id === fighter.instanceId && flash.actionLabel;
                    return (
                      <article
                        className={`unit-status-card unit-${fighter.id} ${fighter.team} ${fighter.hp <= 0 ? 'down' : ''} ${fighter.berserk ? 'berserk' : ''} ${active ? 'acting' : ''}`}
                        key={fighter.instanceId}
                      >
                        <div className="status-avatar" style={{ ['--unit-color' as string]: fighter.color }}>
                          <i />
                        </div>
                        <div className="status-id">
                          <small>{fighter.code}</small>
                          <strong>{fighter.name}</strong>
                          <span>{attackTypeLabels[fighter.attackType]}</span>
                        </div>
                        <div className="unit-status-hp">
                          <div>
                            <i style={{ width: `${hpRatio}%` }} />
                          </div>
                          <b>
                            {Math.ceil(Math.max(0, fighter.hp))}/{fighter.maxHp}
                          </b>
                        </div>
                        <div className="status-cooldown">
                          <div>
                            <i style={{ width: `${cooldownRatio * 100}%` }} />
                          </div>
                          <b>{cooldownRatio >= 1 ? 'READY' : 'WAIT'}</b>
                        </div>
                        <div className="status-stats">
                          <span>
                            A <b>{fighter.attack}</b>
                          </span>
                          <span>
                            R <b>{fighter.range}</b>
                          </span>
                          <span>
                            K <b>{fighter.knockbackPower}</b>
                          </span>
                          <span>
                            W <b>{fighter.weight}</b>
                          </span>
                          <span>
                            D <b>{fighter.defense}</b>
                          </span>
                          <span>
                            S <b>{fighter.speed}</b>
                          </span>
                        </div>
                        <div className="status-tags">
                          {statusTags(fighter).map((tag) => (
                            <span className={tag === '正常' ? 'normal' : tag === '暴走' ? 'berserk' : ''} key={tag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                        {active && (
                          <div className={`card-action-bubble ${flash?.kind === 'miss' ? 'miss' : ''}`}>
                            {flash.actionLabel}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </section>
              ))}
            </div>
          </aside>
          {logsOpen && (
            <div className="log-dialog-overlay" role="dialog" aria-modal="true" aria-label="戦闘ログ">
              <div className="log-dialog">
                <div className="log-dialog-head">
                  <div>
                    <span className="live-dot" />
                    <h2>戦闘ログ</h2>
                    <small>{logs.length} EVENTS</small>
                  </div>
                  <button aria-label="ログを閉じる" onClick={() => setLogsOpen(false)}>
                    <X size={18} />
                  </button>
                </div>
                <div className="logs">
                  {logs.length === 0 ? (
                    <div className="empty-log">
                      <Sparkles />
                      <span>プログラムを初期化中</span>
                    </div>
                  ) : (
                    logs.map((log) => (
                      <div className={`log ${log.type}`} key={log.id}>
                        <time>{log.time}</time>
                        <div>
                          <b>{log.actor}</b>
                          <span>{log.text}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
          {phase === 'result' && (
            <div className="result-overlay">
              <div className="result-dialog">
                <small>BATTLE COMPLETE</small>
                <h1>{winner}</h1>
                <p>{winner === '勝利' ? 'ロジックが敵チームを停止させました' : 'プログラムを調整して再実行できます'}</p>
                <div>
                  <span>
                    実行イベント <b>{logs.length}</b>
                  </span>
                  <span>
                    戦闘時間 <b>{elapsed.toFixed(1)}s</b>
                  </span>
                </div>
                <button
                  onClick={() => {
                    setRound((current) => current + 1);
                    setCoins((current) => current + ECONOMY_CONFIG.roundReward);
                    reset();
                  }}
                >
                  次のラウンドへ
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
