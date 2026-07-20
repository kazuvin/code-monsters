import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createBattle, createPlayback } from './core/battle';
import { availableCopies, equipCommand, swapCommands } from './core/loadout';
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

const ArenaFighter = ({ fighter, acting, hit }: { fighter: FighterState; acting: boolean; hit: boolean }) => (
  <article
    className={`arena-fighter team-${fighter.team} lane-${fighter.lane} ${fighter.hp <= 0 ? 'is-down' : ''} ${acting ? 'is-acting' : ''} ${hit ? 'is-hit' : ''}`}
  >
    <div className="arena-unit-visual">
      <RobotSprite fighter={fighter} />
    </div>
    <div className="arena-unit-copy">
      <small>{fighter.code}</small>
      <strong>{fighter.name}</strong>
      <StatusMeter fighter={fighter} />
    </div>
  </article>
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
  const [selectedSlot, setSelectedSlot] = useState<SlotPosition | null>(null);
  const [playback, setPlayback] = useState<BattleState[]>([]);
  const [frame, setFrame] = useState(0);
  const [message, setMessage] = useState('マスを選び、入れ替え先か命令を選ぶ');

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
  const frameEvents = useMemo(() => {
    const previousCount = frame > 0 ? (playback[frame - 1]?.trace.length ?? 0) : 0;
    return battle.trace.slice(previousCount);
  }, [battle.trace, frame, playback]);
  const recentTrace = useMemo(
    () =>
      frameEvents
        .map((event) => traceLabel(event, battle))
        .filter((value): value is string => Boolean(value))
        .slice(-3),
    [battle, frameEvents],
  );
  const actingFighters = useMemo(
    () => new Set(frameEvents.filter((event) => event.kind === 'execute').map((event) => event.actorId)),
    [frameEvents],
  );
  const hitFighters = useMemo(
    () =>
      new Set(
        frameEvents
          .filter((event) => event.kind === 'damage' && event.targetId)
          .map((event) => event.targetId as string),
      ),
    [frameEvents],
  );

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

  const selectProgramSlot = (position: SlotPosition, unitName: string) => {
    if (!selectedSlot) {
      setSelectedSlot(position);
      setMessage('入れ替え先か命令を選ぶ');
      return;
    }
    if (selectedSlot.lane === position.lane && selectedSlot.slot === position.slot) {
      setSelectedSlot(null);
      setMessage('選択を解除');
      return;
    }
    setProgram((current) => swapCommands(current, selectedSlot, position));
    setSelectedSlot(null);
    setMessage(`${unitName}の作戦と入れ替えました`);
  };

  const equip = (commandId: string) => {
    if (!selectedSlot) {
      setMessage('先にマスを選ぶ');
      return;
    }
    const next = equipCommand(inventory, program, selectedSlot, commandId);
    if (next === program) {
      setMessage(
        program[selectedSlot.lane][selectedSlot.slot] === commandId ? 'ここに入っています' : '予備がありません',
      );
      return;
    }
    setProgram(next);
    setSelectedSlot(null);
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
    setSelectedSlot(null);
    setPlayback(next);
    setFrame(0);
    setPhase('battle');
    setMessage('');
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
      {phase === 'build' ? (
        <>
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

          <div className="workspace-layout">
            <section className="console-panel program-panel">
              <header className="panel-head">
                <div>
                  <small>YOUR PROGRAM</small>
                  <h2>作戦ボード</h2>
                </div>
                <span>2マスで入れ替え</span>
              </header>

              <div className="program-scroll">
                <div className="program-board" role="grid" aria-label="作戦ボード">
                  <div className="board-corner">UNIT</div>
                  {Array.from({ length: GAME_DATA.rules.programSlots }, (_, slot) => (
                    <div className="step-label" key={`step-${slot}`}>
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
                          const selected = selectedSlot?.lane === lane && selectedSlot.slot === slot;
                          return (
                            <button
                              className={`program-cell ${selected ? 'is-selected' : ''} ${command?.effect.kind === 'repeatPrevious' ? 'is-loop' : ''}`}
                              key={`${lane}-${slot}`}
                              onClick={() => selectProgramSlot({ lane, slot }, unit.name)}
                              aria-label={`${unit.name} ${slot + 1}番目 ${command?.title ?? '空き'}${selected ? ' 選択中' : ''}`}
                              aria-pressed={selected}
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
                </div>
              </div>

              <div className="rack">
                <div className="rack-label">
                  <small>CHIP RACK</small>
                  <b>命令を置く</b>
                </div>
                <div className="rack-list">
                  {commandCounts.map(({ command, total, available }) => {
                    const currentCommand = selectedSlot ? program[selectedSlot.lane][selectedSlot.slot] : null;
                    return (
                      <button
                        className={`rack-chip rarity-${command.rarity} ${currentCommand === command.id ? 'is-current' : ''}`}
                        key={command.id}
                        onClick={() => equip(command.id)}
                        disabled={Boolean(selectedSlot && available === 0 && currentCommand !== command.id)}
                      >
                        <small>{command.code}</small>
                        <b>{command.title}</b>
                        <em>{available > 0 ? `予備 ${available}` : `${total}個`}</em>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <aside className="console-panel shop-panel">
              <header className="panel-head">
                <div>
                  <small>PARTS SHOP</small>
                  <h2>ショップ</h2>
                </div>
                <button className="reroll-button" onClick={reroll} aria-label="ショップを更新">
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
                      <button className="buy-button" onClick={() => buy(offer)}>
                        買う <b>{command.price}</b>
                      </button>
                    </article>
                  );
                })}
              </div>
              <button className="run-button" onClick={startBattle}>
                <span>戦闘開始</span>
                <small>RUN ▶</small>
              </button>
            </aside>
          </div>
        </>
      ) : (
        <section className="battle-screen" aria-label="3対3バトル画面">
          <header className="battle-hud">
            <div>
              <small>CODE MONSTERS</small>
              <h1>BATTLE RUN {String(run).padStart(2, '0')}</h1>
            </div>
            <div className="battle-counter">
              <span>ROUND</span>
              <b>{battle.round}</b>
              <i>/ {GAME_DATA.rules.maxRounds}</i>
            </div>
          </header>

          <div className="arena-field">
            <div className="arena-team-label is-player">YOUR TEAM</div>
            <div className="arena-team-label is-enemy">RIVAL</div>
            {[...playerFighters, ...enemyFighters].map((fighter) => (
              <ArenaFighter
                fighter={fighter}
                acting={actingFighters.has(fighter.instanceId)}
                hit={hitFighters.has(fighter.instanceId)}
                key={fighter.instanceId}
              />
            ))}
            <div className="battle-callout" aria-live="polite">
              <small>STEP {Math.max(1, activeSlot + 1)}</small>
              <strong>{recentTrace.at(-1) ?? 'プログラム読込中'}</strong>
            </div>
          </div>

          <footer className="battle-step-rail" aria-label="実行ステップ">
            {Array.from({ length: GAME_DATA.rules.programSlots }, (_, slot) => (
              <span
                className={`${activeSlot === slot ? 'is-active' : ''} ${activeSlot > slot ? 'is-complete' : ''}`}
                key={`battle-step-${slot}`}
              >
                <small>STEP</small>
                <b>{slot + 1}</b>
              </span>
            ))}
          </footer>
        </section>
      )}

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
