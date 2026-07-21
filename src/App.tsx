import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createBattle, createPlayback } from './core/battle';
import { findPoweredCells, rotatePorts } from './core/circuit';
import { moveBlock, placeBlockFromRack, removeBlockToRack, rotateBoardBlock } from './core/loadout';
import { createShop, rerollShop } from './core/shop';
import type {
  BattleState,
  BattleTraceEvent,
  BlockDefinition,
  CellPosition,
  CircuitBoard,
  Direction,
  FighterState,
  Rotation,
  ShopOffer,
} from './core/types';
import { GAME_DATA } from './game/game-data';

type Phase = 'build' | 'battle' | 'result';
type DetailTarget = {
  blockId: string;
  position?: CellPosition;
  location: 'board' | 'rack' | 'shop';
};
type DragOrigin = { kind: 'board'; position: CellPosition } | { kind: 'rack'; blockId: string };
type DragState = {
  origin: DragOrigin;
  blockId: string;
  rotation: Rotation;
  x: number;
  y: number;
};
type PendingDrag = DragState & { pointerId: number; startX: number; startY: number; started: boolean };

const initialSeed = 73;
const HOLD_DELAY = 320;
const blockById = new Map(GAME_DATA.blocks.map((block) => [block.id, block]));
const shopBlocks = GAME_DATA.blocks.filter((block) => block.price > 0);

const effectLabel = (block: BlockDefinition) => {
  const effect = block.effect;
  if (effect.kind === 'damage') return `ダメージ ${effect.amount}`;
  if (effect.kind === 'shield') return `シールド ${effect.amount}`;
  if (effect.kind === 'repair') return `回復 ${effect.amount}`;
  if (effect.kind === 'amplify') return `直結効果 +${effect.amount}`;
  if (effect.kind === 'haste') return `発動間隔 -${effect.amount}`;
  return '電流を通す';
};

const cooldownLabel = (block: BlockDefinition) => {
  if (!block.cooldown) return '常時';
  return block.cooldown === 1 ? '毎拍' : `${block.cooldown}拍ごと`;
};

const BlockVisual = ({
  block,
  rotation = 0,
  powered = false,
  fixed = false,
  compact = false,
}: {
  block: BlockDefinition;
  rotation?: Rotation;
  powered?: boolean;
  fixed?: boolean;
  compact?: boolean;
}) => {
  const ports = rotatePorts(block.ports, rotation);
  return (
    <span
      className={`block-visual effect-${block.effect.kind} rarity-${block.rarity} ${powered ? 'is-powered' : ''} ${fixed ? 'is-fixed' : ''} ${compact ? 'is-compact' : ''}`}
      aria-hidden="true"
    >
      {ports.map((port) => (
        <i className={`block-port port-${port}`} key={port} />
      ))}
      <span className="block-core">
        <b>{block.glyph}</b>
        {!compact && <small>{block.code}</small>}
      </span>
      {powered && <em className="power-pip" />}
    </span>
  );
};

const RobotSprite = ({ fighter }: { fighter: FighterState }) => (
  <span
    className={`robot-sprite ${fighter.hp <= 0 ? 'is-down' : ''}`}
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
    </span>
  </div>
);

const ArenaFighter = ({ fighter, acting, hit }: { fighter: FighterState; acting: boolean; hit: boolean }) => (
  <article
    className={`arena-fighter team-${fighter.team} ${fighter.hp <= 0 ? 'is-down' : ''} ${acting ? 'is-acting' : ''} ${hit ? 'is-hit' : ''}`}
    style={{ '--robot-color': fighter.color } as CSSProperties}
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

const traceLabel = (event: BattleTraceEvent) => {
  const block = blockById.get(event.blockId);
  if (!block) return event.blockId;
  const suffix =
    event.kind === 'damage'
      ? ` ${event.value} HIT`
      : event.kind === 'shield'
        ? ` 盾+${event.value}`
        : ` HP+${event.value}`;
  return `${block.title}${suffix}`;
};

export function App() {
  const [phase, setPhase] = useState<Phase>('build');
  const [coins, setCoins] = useState(GAME_DATA.rules.startingCoins);
  const [run, setRun] = useState(1);
  const [seed, setSeed] = useState(initialSeed);
  const [shop, setShop] = useState(() => createShop(shopBlocks, initialSeed, GAME_DATA.rules.shopSize));
  const [rack, setRack] = useState([...GAME_DATA.startingRack]);
  const [board, setBoard] = useState<CircuitBoard>(() =>
    GAME_DATA.playerBoard.map((row) => row.map((cell) => (cell ? { ...cell } : null))),
  );
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [playback, setPlayback] = useState<BattleState[]>([]);
  const [frame, setFrame] = useState(0);
  const [message, setMessage] = useState('ブロックを長押しして回路を組む');
  const holdTimer = useRef<number | null>(null);
  const pendingDrag = useRef<PendingDrag | null>(null);
  const suppressClick = useRef(false);

  const powered = useMemo(() => findPoweredCells(board, GAME_DATA.blocks, GAME_DATA.rules.sourceRow), [board]);
  const preview = useMemo(() => createBattle(GAME_DATA, board, GAME_DATA.enemyBoard), [board]);
  const battle = playback[frame] ?? preview;
  const fighters = battle.fighters;
  const player = fighters.find((fighter) => fighter.team === 'player')!;
  const enemy = fighters.find((fighter) => fighter.team === 'enemy')!;
  const rackGroups = useMemo(
    () =>
      [...new Set(rack)].map((blockId) => ({
        block: blockById.get(blockId)!,
        count: rack.filter((candidate) => candidate === blockId).length,
      })),
    [rack],
  );
  const frameEvents = useMemo(() => {
    const previousCount = frame > 0 ? (playback[frame - 1]?.trace.length ?? 0) : 0;
    return battle.trace.slice(previousCount);
  }, [battle.trace, frame, playback]);
  const actingTeams = useMemo(() => new Set(frameEvents.map((event) => event.team)), [frameEvents]);
  const hitTeams = useMemo(
    () =>
      new Set(
        frameEvents
          .filter((event) => event.kind === 'damage')
          .map((event) => (event.team === 'player' ? 'enemy' : 'player')),
      ),
    [frameEvents],
  );

  useEffect(() => {
    if (phase !== 'battle') return;
    if (frame >= playback.length - 1) {
      const timer = window.setTimeout(() => setPhase('result'), 720);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setFrame((current) => current + 1), 620);
    return () => window.clearTimeout(timer);
  }, [frame, phase, playback.length]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 1800);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    document.body.classList.toggle('is-dragging', Boolean(dragging));
    return () => document.body.classList.remove('is-dragging');
  }, [dragging]);

  useEffect(() => {
    if (!detail) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetail(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [detail]);

  useEffect(
    () => () => {
      if (holdTimer.current) window.clearTimeout(holdTimer.current);
    },
    [],
  );

  const clearHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const beginHold = (
    event: ReactPointerEvent<HTMLButtonElement>,
    origin: DragOrigin,
    blockId: string,
    rotation: Rotation,
  ) => {
    if (event.button !== 0) return;
    clearHold();
    event.currentTarget.setPointerCapture(event.pointerId);
    pendingDrag.current = {
      origin,
      blockId,
      rotation,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
    };
    holdTimer.current = window.setTimeout(() => {
      const pending = pendingDrag.current;
      if (!pending) return;
      pending.started = true;
      suppressClick.current = true;
      setDragging({
        origin: pending.origin,
        blockId: pending.blockId,
        rotation: pending.rotation,
        x: pending.x,
        y: pending.y,
      });
      if ('vibrate' in navigator) navigator.vibrate(18);
    }, HOLD_DELAY);
  };

  const moveHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pending = pendingDrag.current;
    if (!pending || pending.pointerId !== event.pointerId) return;
    pending.x = event.clientX;
    pending.y = event.clientY;
    if (!pending.started) {
      const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
      if (distance > 10) clearHold();
      return;
    }
    event.preventDefault();
    setDragging({
      origin: pending.origin,
      blockId: pending.blockId,
      rotation: pending.rotation,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const dropAt = (drag: DragState, x: number, y: number) => {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-circuit-cell]');
    if (!target) {
      setMessage('回路盤へ置く');
      return;
    }
    const position = { row: Number(target.dataset.row), column: Number(target.dataset.column) };
    if (drag.origin.kind === 'rack') {
      const result = placeBlockFromRack(rack, board, drag.origin.blockId, position);
      if (result.board === board) {
        setMessage('固定ブロックは動かせません');
        return;
      }
      setBoard(result.board);
      setRack(result.rack);
      setMessage(`${blockById.get(drag.blockId)?.title ?? 'ブロック'}を配置`);
      return;
    }
    const next = moveBlock(board, drag.origin.position, position);
    if (next === board) {
      setMessage('そこへは移動できません');
      return;
    }
    setBoard(next);
    setMessage('ブロックを移動');
  };

  const endHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pending = pendingDrag.current;
    clearHold();
    if (!pending || pending.pointerId !== event.pointerId) return;
    if (pending.started) {
      dropAt(pending, event.clientX, event.clientY);
      setDragging(null);
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
    pendingDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const cancelHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    clearHold();
    pendingDrag.current = null;
    setDragging(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const openDetail = (target: DetailTarget) => {
    if (suppressClick.current) return;
    setDetail(target);
  };

  const rotateDetailBlock = () => {
    if (!detail?.position) return;
    const next = rotateBoardBlock(board, detail.position);
    if (next === board) {
      setMessage('固定ブロックは回せません');
      return;
    }
    setBoard(next);
    setMessage('ブロックを回転');
  };

  const removeDetailBlock = () => {
    if (!detail?.position) return;
    const result = removeBlockToRack(rack, board, detail.position);
    if (result.board === board) {
      setMessage('固定ブロックは外せません');
      return;
    }
    setBoard(result.board);
    setRack(result.rack);
    setDetail(null);
    setMessage('ラックへ戻しました');
  };

  const buy = (offer: ShopOffer) => {
    const block = blockById.get(offer.blockId);
    if (!block) return;
    if (coins < block.price) {
      setMessage('コインが足りません');
      return;
    }
    setCoins((current) => current - block.price);
    setRack((current) => [...current, block.id]);
    setShop((current) => current.filter((item) => item.id !== offer.id));
    setMessage(`${block.title}を入手`);
  };

  const reroll = () => {
    if (coins < GAME_DATA.rules.rerollCost) {
      setMessage('コインが足りません');
      return;
    }
    const nextSeed = seed + 1;
    setCoins((current) => current - GAME_DATA.rules.rerollCost);
    setSeed(nextSeed);
    setShop((current) => rerollShop(shopBlocks, current, nextSeed, GAME_DATA.rules.shopSize));
    setMessage('ショップを更新');
  };

  const toggleLock = (id: string) =>
    setShop((current) => current.map((offer) => (offer.id === id ? { ...offer, locked: !offer.locked } : offer)));

  const startBattle = () => {
    const next = createPlayback(GAME_DATA, board, GAME_DATA.enemyBoard);
    setDetail(null);
    setPlayback(next);
    setFrame(0);
    setPhase('battle');
    setMessage('');
  };

  const returnToWorkshop = () => {
    const reward = battle.winner === 'player' ? GAME_DATA.rules.winReward : GAME_DATA.rules.retryReward;
    const nextSeed = seed + 11;
    setCoins((current) => current + reward);
    setSeed(nextSeed);
    setShop(createShop(shopBlocks, nextSeed, GAME_DATA.rules.shopSize));
    setRun((current) => current + 1);
    setPlayback([]);
    setFrame(0);
    setPhase('build');
    setMessage(`コイン +${reward}`);
  };

  const detailBlock = detail ? blockById.get(detail.blockId) : undefined;
  const detailPlaced = detail?.position ? board[detail.position.row]?.[detail.position.column] : undefined;

  return (
    <main className={`app-shell phase-${phase}`}>
      {phase === 'build' ? (
        <>
          <header className="topbar">
            <div className="brand-block">
              <span className="brand-prompt">CM://</span>
              <div>
                <h1>CODE MONSTERS</h1>
                <small>CIRCUIT BAY</small>
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
            <section className="console-panel circuit-panel">
              <header className="panel-head">
                <div>
                  <small>YOUR CIRCUIT</small>
                  <h2>回路ボード</h2>
                </div>
                <span className="power-count">
                  通電 <b>{powered.size}</b> / 25
                </span>
              </header>

              <div className="circuit-workbench">
                <div className="circuit-stage">
                  <div
                    className="source-column"
                    style={{ '--source-row': GAME_DATA.rules.sourceRow + 1 } as CSSProperties}
                  >
                    <div className="power-source" aria-label="電源コア">
                      <small>CORE</small>
                      <b>∞</b>
                    </div>
                  </div>
                  <div className="circuit-board" role="grid" aria-label="5×5 回路ボード">
                    {board.flatMap((row, rowIndex) =>
                      row.map((placed, columnIndex) => {
                        const block = placed ? blockById.get(placed.blockId) : undefined;
                        const key = `${rowIndex}:${columnIndex}`;
                        return (
                          <div
                            className={`circuit-cell ${powered.has(key) ? 'is-powered' : ''}`}
                            data-circuit-cell
                            data-row={rowIndex}
                            data-column={columnIndex}
                            role="gridcell"
                            key={key}
                          >
                            {block && placed ? (
                              <button
                                className="block-button"
                                aria-label={`${block.title}${powered.has(key) ? ' 通電中' : ' 未通電'}。クリックで詳細、長押しで移動`}
                                onClick={() =>
                                  openDetail({
                                    blockId: block.id,
                                    position: { row: rowIndex, column: columnIndex },
                                    location: 'board',
                                  })
                                }
                                onPointerDown={(event) =>
                                  beginHold(
                                    event,
                                    { kind: 'board', position: { row: rowIndex, column: columnIndex } },
                                    block.id,
                                    placed.rotation,
                                  )
                                }
                                onPointerMove={moveHold}
                                onPointerUp={endHold}
                                onPointerCancel={cancelHold}
                              >
                                <BlockVisual
                                  block={block}
                                  rotation={placed.rotation}
                                  powered={powered.has(key)}
                                  fixed={placed.fixed}
                                />
                              </button>
                            ) : (
                              <span className="empty-cell" aria-label="空きマス" />
                            )}
                          </div>
                        );
                      }),
                    )}
                  </div>
                </div>
                <div className="board-legend" aria-hidden="true">
                  <span>
                    <i className="legend-live" /> 通電
                  </span>
                  <span>
                    <i className="legend-off" /> 未接続
                  </span>
                  <b>長押しで移動</b>
                </div>
              </div>

              <div className="rack">
                <div className="rack-label">
                  <small>BLOCK RACK</small>
                  <b>予備ブロック</b>
                </div>
                <div className="rack-list">
                  {rackGroups.length === 0 ? (
                    <span className="rack-empty">ショップで補充</span>
                  ) : (
                    rackGroups.map(({ block, count }) => (
                      <button
                        className="rack-block"
                        key={block.id}
                        aria-label={`${block.title} ${count}個。クリックで詳細、長押しで配置`}
                        onClick={() => openDetail({ blockId: block.id, location: 'rack' })}
                        onPointerDown={(event) => beginHold(event, { kind: 'rack', blockId: block.id }, block.id, 0)}
                        onPointerMove={moveHold}
                        onPointerUp={endHold}
                        onPointerCancel={cancelHold}
                      >
                        <BlockVisual block={block} compact />
                        <span>{block.title}</span>
                        <em>×{count}</em>
                      </button>
                    ))
                  )}
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
                  const block = blockById.get(offer.blockId)!;
                  return (
                    <article className={`shop-card rarity-${block.rarity}`} key={offer.id}>
                      <button
                        className={`lock-button ${offer.locked ? 'is-locked' : ''}`}
                        onClick={() => toggleLock(offer.id)}
                        aria-label={`${block.title}を${offer.locked ? 'ロック解除' : 'ロック'}`}
                      >
                        {offer.locked ? 'LOCK' : 'KEEP'}
                      </button>
                      <button
                        className="shop-block-button"
                        onClick={() => openDetail({ blockId: block.id, location: 'shop' })}
                        aria-label={`${block.title}の詳細を見る`}
                      >
                        <BlockVisual block={block} compact />
                        <span>
                          <small>{block.code}</small>
                          <strong>{block.title}</strong>
                        </span>
                      </button>
                      <button className="buy-button" onClick={() => buy(offer)}>
                        買う <b>{block.price}</b>
                      </button>
                    </article>
                  );
                })}
              </div>
              <button className="run-button" onClick={startBattle}>
                <span>戦闘開始</span>
                <small>POWER ON ▶</small>
              </button>
            </aside>
          </div>
        </>
      ) : (
        <section className="battle-screen" aria-label="1対1バトル画面">
          <header className="battle-hud">
            <div>
              <small>CODE MONSTERS</small>
              <h1>BATTLE RUN {String(run).padStart(2, '0')}</h1>
            </div>
            <div className="battle-counter">
              <span>BEAT</span>
              <b>{Math.max(1, battle.tick)}</b>
              <i>/ {GAME_DATA.rules.battleTicks}</i>
            </div>
          </header>

          <div className="arena-field">
            <div className="arena-team-label is-player">YOUR UNIT</div>
            <div className="arena-team-label is-enemy">RIVAL</div>
            <ArenaFighter fighter={player} acting={actingTeams.has('player')} hit={hitTeams.has('player')} />
            <ArenaFighter fighter={enemy} acting={actingTeams.has('enemy')} hit={hitTeams.has('enemy')} />
            <div className="battle-callout" aria-live="polite">
              <small>CIRCUIT LIVE</small>
              <strong>{frameEvents.map(traceLabel).slice(0, 2).join(' / ') || '通電開始'}</strong>
            </div>
          </div>

          <footer className="battle-beat-rail" aria-label="戦闘進行">
            {Array.from({ length: GAME_DATA.rules.battleTicks }, (_, tick) => (
              <span
                className={`${battle.tick === tick + 1 ? 'is-active' : ''} ${battle.tick > tick + 1 ? 'is-complete' : ''}`}
                key={`beat-${tick + 1}`}
              />
            ))}
          </footer>
        </section>
      )}

      <div className={`toast ${message ? 'is-visible' : ''}`} role="status">
        {message}
      </div>

      {detailBlock && detail && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => event.target === event.currentTarget && setDetail(null)}
        >
          <section className="block-dialog" role="dialog" aria-modal="true" aria-labelledby="block-dialog-title">
            <button className="dialog-close" onClick={() => setDetail(null)} aria-label="詳細を閉じる">
              ×
            </button>
            <div className="dialog-block-preview">
              <BlockVisual
                block={detailBlock}
                rotation={detailPlaced?.rotation ?? 0}
                powered={Boolean(detail.position && powered.has(`${detail.position.row}:${detail.position.column}`))}
                fixed={detailPlaced?.fixed}
              />
            </div>
            <div className="dialog-copy">
              <small>{detailBlock.code}</small>
              <h2 id="block-dialog-title">{detailBlock.title}</h2>
              <p>{detailBlock.description}</p>
              <dl>
                <div>
                  <dt>効果</dt>
                  <dd>{effectLabel(detailBlock)}</dd>
                </div>
                <div>
                  <dt>動作</dt>
                  <dd>{cooldownLabel(detailBlock)}</dd>
                </div>
                <div>
                  <dt>接続</dt>
                  <dd>
                    {rotatePorts(detailBlock.ports, detailPlaced?.rotation ?? 0)
                      .map((port) => ({ north: '上', east: '右', south: '下', west: '左' })[port as Direction])
                      .join('・')}
                  </dd>
                </div>
              </dl>
            </div>
            {detail.location === 'board' && !detailPlaced?.fixed && (
              <div className="dialog-actions">
                <button onClick={rotateDetailBlock}>回す ↻</button>
                <button className="is-danger" onClick={removeDetailBlock}>
                  外す
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {dragging && (
        <div className="drag-ghost" style={{ left: dragging.x, top: dragging.y } as CSSProperties} aria-hidden="true">
          <BlockVisual block={blockById.get(dragging.blockId)!} rotation={dragging.rotation} powered />
        </div>
      )}

      {phase === 'result' && (
        <div className="result-backdrop">
          <section className="result-panel" role="dialog" aria-modal="true" aria-labelledby="result-title">
            <small>CIRCUIT HALTED</small>
            <h2 id="result-title">
              {battle.winner === 'player' ? '勝利' : battle.winner === 'draw' ? '引き分け' : '再配線'}
            </h2>
            <div className="result-score">
              <span>
                自機 <b>{player.hp}</b>
              </span>
              <span>
                相手 <b>{enemy.hp}</b>
              </span>
            </div>
            <button onClick={returnToWorkshop}>工房へ戻る</button>
          </section>
        </div>
      )}
    </main>
  );
}
