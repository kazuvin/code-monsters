import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createBattle, createPlayback } from './core/battle';
import { availableCopies, equipCommand } from './core/loadout';
import { createShop, rerollShop } from './core/shop';
import type { BattleState, BattleTraceEvent, FighterState, ProgramBoard, ShopOffer } from './core/types';
import { GAME_DATA } from './game/game-data';

type Phase = 'build' | 'battle' | 'result';
type SlotPosition = { lane: number; slot: number };

const commandById = new Map(GAME_DATA.commands.map((command) => [command.id, command]));
const unitById = new Map(GAME_DATA.units.map((unit) => [unit.id, unit]));
const initialSeed = 73;

const cloneBoard = (board: ProgramBoard): ProgramBoard => board.map((row) => [...row]);

const RobotSprite = ({ fighter, compact = false }: { fighter: FighterState; compact?: boolean }) => (
  <span
    className={`robot-sprite robot-${fighter.unitId} ${fighter.hp <= 0 ? 'is-down' : ''} ${compact ? 'is-compact' : ''}`}
    aria-hidden="true"
    style={{ '--robot-color': fighter.color } as CSSProperties}
  >
    <i className="robot-antenna" />
    <i className="robot-head">
      <b />
    </i>
    <i className="robot-body" />
    <i className="robot-feet" />
  </span>
);

const StatusMeter = ({ fighter }: { fighter: FighterState }) => (
  <div className="fighter-meter">
    <span className="hp-track" aria-label={`${fighter.name} HP ${fighter.hp} / ${fighter.maxHp}`}>
      <i style={{ width: `${Math.max(0, (fighter.hp / fighter.maxHp) * 100)}%` }} />
    </span>
    <span className="fighter-values">
      <b>{fighter.hp}</b>
      {fighter.shield > 0 && <em>盾 {fighter.shield}</em>}
      {fighter.power > 0 && <em>力 {fighter.power}</em>}
    </span>
  </div>
);

const FighterLine = ({ fighter, mirrored }: { fighter: FighterState; mirrored?: boolean }) => (
  <div className={`fighter-line ${mirrored ? 'is-enemy' : ''} ${fighter.hp <= 0 ? 'is-down' : ''}`}>
    <RobotSprite fighter={fighter} />
    <div className="fighter-copy">
      <small>{fighter.code}</small>
      <strong>{fighter.name}</strong>
      <StatusMeter fighter={fighter} />
    </div>
  </div>
);

const traceLabel = (event: BattleTraceEvent, battle: BattleState) => {
  const actor = battle.fighters.find((fighter) => fighter.instanceId === event.actorId);
  const command = commandById.get(event.commandId);
  if (event.kind === 'stackOverflow') return `${actor?.name ?? ''}：深すぎて停止`;
  if (event.kind === 'repeat') return `${actor?.name ?? ''}：ひとつ前へ戻る`;
  if (event.kind !== 'execute') return null;
  return `${actor?.name ?? ''}：${command?.title ?? event.commandId}`;
};

export function App() {
  const [phase, setPhase] = useState<Phase>('build');
  const [coins, setCoins] = useState(GAME_DATA.rules.startingCoins);
  const [run, setRun] = useState(1);
  const [seed, setSeed] = useState(initialSeed);
  const [shop, setShop] = useState(() => createShop(GAME_DATA.commands, initialSeed, GAME_DATA.rules.shopSize));
  const [inventory, setInventory] = useState([...GAME_DATA.startingInventory]);
  const [program, setProgram] = useState<ProgramBoard>(() => cloneBoard(GAME_DATA.playerProgram));
  const [selectedSlot, setSelectedSlot] = useState<SlotPosition>({ lane: 0, slot: 0 });
  const [playback, setPlayback] = useState<BattleState[]>([]);
  const [frame, setFrame] = useState(0);
  const [message, setMessage] = useState('命令を選んで、光るマスへ置く');

  const preview = useMemo(() => createBattle(GAME_DATA, program, GAME_DATA.enemyProgram), [program]);
  const battle = playback[frame] ?? preview;
  const commandCounts = useMemo(
    () =>
      GAME_DATA.commands.map((command) => ({
        command,
        total: inventory.filter((id) => id === command.id).length,
        available: availableCopies(inventory, program, command.id),
      })),
    [inventory, program],
  );
  const recentTrace = useMemo(() => {
    const previousCount = frame > 0 ? (playback[frame - 1]?.trace.length ?? 0) : 0;
    return battle.trace
      .slice(previousCount)
      .map((event) => traceLabel(event, battle))
      .filter((value): value is string => Boolean(value))
      .slice(-3);
  }, [battle, frame, playback]);

  useEffect(() => {
    if (phase !== 'battle') return;
    if (frame >= playback.length - 1) {
      const timer = window.setTimeout(() => setPhase('result'), 650);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setFrame((current) => current + 1), 560);
    return () => window.clearTimeout(timer);
  }, [frame, phase, playback.length]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 1800);
    return () => window.clearTimeout(timer);
  }, [message]);

  const equip = (commandId: string) => {
    const next = equipCommand(inventory, program, selectedSlot, commandId);
    if (next === program) {
      setMessage(
        program[selectedSlot.lane][selectedSlot.slot] === commandId ? 'ここに入っています' : '予備がありません',
      );
      return;
    }
    setProgram(next);
    setMessage(`${commandById.get(commandId)?.title ?? commandId}を置きました`);
  };

  const buy = (offer: ShopOffer) => {
    const command = commandById.get(offer.commandId);
    if (!command) return;
    if (coins < command.price) {
      setMessage('コインが足りません');
      return;
    }
    setCoins((current) => current - command.price);
    setInventory((current) => [...current, command.id]);
    setShop((current) => current.filter((item) => item.id !== offer.id));
    setMessage(`${command.title}を入手`);
  };

  const reroll = () => {
    if (coins < GAME_DATA.rules.rerollCost) {
      setMessage('コインが足りません');
      return;
    }
    const nextSeed = seed + 1;
    setCoins((current) => current - GAME_DATA.rules.rerollCost);
    setSeed(nextSeed);
    setShop((current) => rerollShop(GAME_DATA.commands, current, nextSeed, GAME_DATA.rules.shopSize));
    setMessage('ショップを更新');
  };

  const toggleLock = (id: string) =>
    setShop((current) => current.map((offer) => (offer.id === id ? { ...offer, locked: !offer.locked } : offer)));

  const startBattle = () => {
    const next = createPlayback(GAME_DATA, program, GAME_DATA.enemyProgram);
    setPlayback(next);
    setFrame(0);
    setPhase('battle');
    setMessage('プログラム開始');
  };

  const returnToWorkshop = () => {
    const won = battle.winner === 'player';
    const reward = won ? (GAME_DATA.rules.winReward ?? 4) : (GAME_DATA.rules.retryReward ?? 1);
    const nextSeed = seed + 11;
    setCoins((current) => current + reward);
    setSeed(nextSeed);
    setShop(createShop(GAME_DATA.commands, nextSeed, GAME_DATA.rules.shopSize));
    setRun((current) => current + 1);
    setPlayback([]);
    setFrame(0);
    setPhase('build');
    setMessage(`コイン +${reward}`);
  };

  const playerFighters = battle.fighters.filter((fighter) => fighter.team === 'player');
  const enemyFighters = battle.fighters.filter((fighter) => fighter.team === 'enemy');
  const activeSlot = phase === 'build' ? -1 : battle.currentSlot;

  return (
    <main className={`app-shell phase-${phase}`}>
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-prompt">CM://</span>
          <div>
            <h1>CODE MONSTERS</h1>
            <small>PROGRAM BOARD</small>
          </div>
        </div>
        <div className="run-stats">
          <span>
            RUN <b>{String(run).padStart(2, '0')}</b>
          </span>
          <span className="coin-readout">
            COIN <b>{coins}</b>
          </span>
        </div>
      </header>

      <section className="battle-stage" aria-label="3対3バトル状況">
        <div className="team-stack player-team">
          {playerFighters.map((fighter) => (
            <FighterLine fighter={fighter} key={fighter.instanceId} />
          ))}
        </div>
        <div className="stage-center">
          <span>{phase === 'build' ? 'READY' : `STEP ${Math.max(1, activeSlot + 1)}`}</span>
          <b>3 × 3</b>
          <small>{recentTrace[0] ?? (phase === 'build' ? '組んで、見る。' : '実行中')}</small>
        </div>
        <div className="team-stack enemy-team">
          {enemyFighters.map((fighter) => (
            <FighterLine fighter={fighter} mirrored key={fighter.instanceId} />
          ))}
        </div>
      </section>

      <div className="workspace-layout">
        <section className="console-panel program-panel">
          <header className="panel-head">
            <div>
              <small>YOUR PROGRAM</small>
              <h2>作戦ボード</h2>
            </div>
            <span>左から実行</span>
          </header>

          <div className="program-scroll">
            <div className="program-board" role="grid" aria-label="作戦ボード">
              <div className="board-corner">UNIT</div>
              {Array.from({ length: GAME_DATA.rules.programSlots }, (_, slot) => (
                <div className={`step-label ${activeSlot === slot ? 'is-active' : ''}`} key={`step-${slot}`}>
                  {slot + 1}
                </div>
              ))}
              {program.map((row, lane) => {
                const unit = unitById.get(GAME_DATA.units[lane].id)!;
                const fighter = playerFighters[lane];
                return (
                  <div className="program-row-contents" key={unit.id}>
                    <div className="unit-label">
                      <RobotSprite fighter={fighter} compact />
                      <span>
                        <b>{unit.name}</b>
                        <small>{unit.code}</small>
                      </span>
                    </div>
                    {row.map((commandId, slot) => {
                      const command = commandId ? commandById.get(commandId) : undefined;
                      const selected = selectedSlot.lane === lane && selectedSlot.slot === slot;
                      return (
                        <button
                          className={`program-cell ${selected ? 'is-selected' : ''} ${activeSlot === slot ? 'is-running' : ''} ${command?.effect.kind === 'repeatPrevious' ? 'is-loop' : ''}`}
                          key={`${lane}-${slot}`}
                          onClick={() => {
                            if (phase !== 'build') return;
                            setSelectedSlot({ lane, slot });
                            setMessage(`${unit.name} / ${slot + 1}番目`);
                          }}
                          aria-label={`${unit.name} ${slot + 1}番目 ${command?.title ?? '空き'}`}
                          disabled={phase !== 'build'}
                        >
                          <small>{command?.code ?? '---'}</small>
                          <strong>{command?.title ?? '空き'}</strong>
                          {command?.effect.kind === 'repeatPrevious' && <i>↶</i>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {activeSlot >= 0 && (
                <span className="execution-cursor" style={{ '--active-slot': activeSlot } as CSSProperties} />
              )}
            </div>
          </div>

          <div className="rack">
            <div className="rack-label">
              <small>CHIP RACK</small>
              <b>命令を選ぶ</b>
            </div>
            <div className="rack-list">
              {commandCounts.map(({ command, total, available }) => (
                <button
                  className={`rack-chip rarity-${command.rarity} ${program[selectedSlot.lane][selectedSlot.slot] === command.id ? 'is-current' : ''}`}
                  key={command.id}
                  onClick={() => equip(command.id)}
                  disabled={
                    phase !== 'build' ||
                    (available === 0 && program[selectedSlot.lane][selectedSlot.slot] !== command.id)
                  }
                >
                  <small>{command.code}</small>
                  <b>{command.title}</b>
                  <em>{available > 0 ? `予備 ${available}` : `${total}個`}</em>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="console-panel shop-panel">
          <header className="panel-head">
            <div>
              <small>PARTS SHOP</small>
              <h2>ショップ</h2>
            </div>
            <button className="reroll-button" onClick={reroll} disabled={phase !== 'build'}>
              更新 <b>{GAME_DATA.rules.rerollCost}</b>
            </button>
          </header>
          <div className="shop-list">
            {Array.from({ length: GAME_DATA.rules.shopSize }, (_, slot) => {
              const offer = shop.find((item) => item.slot === slot);
              if (!offer)
                return (
                  <div className="shop-empty" key={`empty-${slot}`}>
                    SOLD
                  </div>
                );
              const command = commandById.get(offer.commandId)!;
              return (
                <article className={`shop-card rarity-${command.rarity}`} key={offer.id}>
                  <button
                    className={`lock-button ${offer.locked ? 'is-locked' : ''}`}
                    onClick={() => toggleLock(offer.id)}
                    aria-label={`${command.title}を${offer.locked ? 'ロック解除' : 'ロック'}`}
                  >
                    {offer.locked ? 'LOCK' : 'KEEP'}
                  </button>
                  <small>{command.code}</small>
                  <strong>{command.title}</strong>
                  <p>{command.description}</p>
                  <button className="buy-button" onClick={() => buy(offer)} disabled={phase !== 'build'}>
                    買う <b>{command.price}</b>
                  </button>
                </article>
              );
            })}
          </div>
          <button className="run-button" onClick={startBattle} disabled={phase !== 'build'}>
            <span>プログラム実行</span>
            <small>RUN ▶</small>
          </button>
        </aside>
      </div>

      <div className={`toast ${message ? 'is-visible' : ''}`} role="status">
        {message}
      </div>

      {phase === 'result' && (
        <div className="result-backdrop">
          <section className="result-panel" role="dialog" aria-modal="true" aria-labelledby="result-title">
            <small>PROGRAM HALTED</small>
            <h2 id="result-title">
              {battle.winner === 'player' ? '勝利' : battle.winner === 'draw' ? '引き分け' : '再調整'}
            </h2>
            <div className="result-score">
              <span>
                自機 <b>{playerFighters.reduce((sum, fighter) => sum + fighter.hp, 0)}</b>
              </span>
              <span>
                相手 <b>{enemyFighters.reduce((sum, fighter) => sum + fighter.hp, 0)}</b>
              </span>
            </div>
            <button onClick={returnToWorkshop}>工房へ戻る</button>
          </section>
        </div>
      )}
    </main>
  );
}
