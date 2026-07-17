import { useEffect, useState } from 'react';
import { activeStatusDetails, hasStatus, statusEffectTargetId, statusVisualClasses } from './core/statuses';
import type { BattleFlash, Fighter } from './types';

type Props = { fighters: Fighter[]; flash: BattleFlash | null; running: boolean };

const FORMATION_LANES = 3;
const LANE_SPACING_PX = 22;
const laneIndex = (fighter: Fighter, fighters: Fighter[]) =>
  fighters
    .filter((other) => other.team === fighter.team)
    .findIndex((other) => other.instanceId === fighter.instanceId) % FORMATION_LANES;
const depthIndex = (fighter: Fighter, fighters: Fighter[]) => 50 - laneIndex(fighter, fighters) * 10;
const laneOffset = (fighter: Fighter, fighters: Fighter[]) => laneIndex(fighter, fighters) * LANE_SPACING_PX;

const colorHex = (value: string) => value;
const attackKinds = ['attack', 'heavy', 'poison', 'burn', 'follow', 'miss'] as const;
const nearestOpponent = (fighter: Fighter, fighters: Fighter[]) => {
  const opponents = fighters
    .filter((other) => other.team !== fighter.team && other.hp > 0)
    .sort((a, b) => Math.abs(fighter.x - a.x) - Math.abs(fighter.x - b.x));
  const lockedTargetId = statusEffectTargetId(fighter, 'targetLock');
  return lockedTargetId
    ? (opponents.find((opponent) => opponent.instanceId === lockedTargetId) ?? opponents[0])
    : opponents[0];
};

export function BattleScene({ fighters, flash, running }: Props) {
  const [missNotice, setMissNotice] = useState<BattleFlash | null>(null);
  useEffect(() => {
    if (flash?.kind === 'miss') setMissNotice(flash);
  }, [flash]);
  useEffect(() => {
    if (!missNotice) return;
    const timer = setTimeout(() => setMissNotice(null), 1200);
    return () => clearTimeout(timer);
  }, [missNotice]);
  const aliveAllies = fighters.filter((f) => f.team === 'ally' && f.hp > 0);
  const aliveEnemies = fighters.filter((f) => f.team === 'enemy' && f.hp > 0);
  const allyFront = aliveAllies.reduce((n, f) => n + f.x, 0) / (aliveAllies.length || 1);
  const enemyFront = aliveEnemies.reduce((n, f) => n + f.x, 0) / (aliveEnemies.length || 1);
  const flashActor = flash ? fighters.find((fighter) => fighter.instanceId === flash.id) : undefined;
  const flashTarget = flash?.targetId ? fighters.find((fighter) => fighter.instanceId === flash.targetId) : undefined;
  const projectileAttack =
    flash &&
    flashActor &&
    flashTarget &&
    (flash.attackType ?? flashActor.attackType) === 'sniper' &&
    attackKinds.some((kind) => kind === flash.kind)
      ? { actor: flashActor, target: flashTarget }
      : null;

  return (
    <div
      className={`side-battlefield ${running ? 'is-running' : 'is-paused'}`}
      aria-label="2D戦闘フィールド"
      data-event-id={flash?.n ?? ''}
    >
      <div className="stage-wall wall-ally" />
      <div className="stage-wall wall-enemy" />
      <div className="base base-ally">
        <span>ALLY CORE</span>
      </div>
      <div className="base base-enemy">
        <span>ENEMY CORE</span>
      </div>
      <div className="battle-road">
        <div className="frontline" style={{ left: `${Math.max(14, Math.min(86, (allyFront + enemyFront) / 2))}%` }} />
        {projectileAttack && (
          <i
            aria-hidden="true"
            className={`battle-projectile projectile-arrow ${projectileAttack.target.x < projectileAttack.actor.x ? 'flies-left' : 'flies-right'}`}
            key={`projectile-${flash?.n}`}
            style={{
              ['--projectile-start-x' as string]: `${projectileAttack.actor.x}%`,
              ['--projectile-end-x' as string]: `${projectileAttack.target.x}%`,
              ['--projectile-start-lane' as string]: `${laneOffset(projectileAttack.actor, fighters)}px`,
              ['--projectile-end-lane' as string]: `${laneOffset(projectileAttack.target, fighters)}px`,
            }}
          />
        )}
        {fighters.map((fighter) => {
          const isActor = flash?.id === fighter.instanceId;
          const hasMissNotice = missNotice?.id === fighter.instanceId;
          const isTarget = flash?.targetId === fighter.instanceId;
          const isProjectileTarget = isTarget && projectileAttack?.target.instanceId === fighter.instanceId;
          const isAttack = isActor && attackKinds.some((kind) => kind === flash?.kind);
          const attackType = isActor && flash?.attackType ? flash.attackType : fighter.attackType;
          const attackEffect = flash?.kind === 'follow' ? 'follow' : attackType;
          const abilityEffect =
            isActor &&
            (flash?.kind === 'dash' ||
              flash?.kind === 'jump' ||
              flash?.kind === 'throw' ||
              flash?.kind === 'taunt' ||
              flash?.kind === 'pull' ||
              flash?.kind === 'retreat' ||
              flash?.kind === 'guard')
              ? flash.kind
              : null;
          const state = fighter.hp <= 0 ? 'is-dead' : isActor ? `is-${flash?.kind}` : '';
          const hpRatio = Math.max(0, fighter.hp / fighter.maxHp);
          const opponent = nearestOpponent(fighter, fighters);
          const facingClass = opponent
            ? opponent.x < fighter.x
              ? 'face-left'
              : 'face-right'
            : fighter.team === 'enemy'
              ? 'face-left'
              : 'face-right';
          const animationKey = (isActor || isTarget) && flash ? flash.n : 'idle';
          const fighterLane = laneIndex(fighter, fighters);
          const statusDetails = activeStatusDetails(fighter);
          return (
            <div
              className={`sprite unit-${fighter.id} ${fighter.team} ${facingClass} role-${fighter.role.toLowerCase()} attack-${attackType} ${statusVisualClasses(fighter)} ${isProjectileTarget ? 'projectile-impact-target' : ''} ${state}`}
              data-lane-index={fighterLane}
              key={fighter.instanceId}
              style={{
                left: `${fighter.x}%`,
                zIndex: depthIndex(fighter, fighters),
                ['--unit-color' as string]: colorHex(fighter.color),
                ['--lane-offset' as string]: `${laneOffset(fighter, fighters)}px`,
              }}
            >
              <i className="team-ring" aria-hidden="true" />
              {hasStatus(fighter, 'berserk') && <i className="berserk-aura" aria-hidden="true" />}
              {hasStatus(fighter, 'poison') && fighter.hp > 0 && <i className="poison-haze" aria-hidden="true" />}
              <div className="sprite-label">
                <b>{fighter.code}</b>
                <span>{fighter.name}</span>
              </div>
              <div className="sprite-body" key={`body-${animationKey}`}>
                <i className="antenna" />
                <i className="face" />
                <i className="arm arm-a" />
                <i className="arm arm-b" />
                <i className="leg leg-a" />
                <i className="leg leg-b" />
                {hasStatus(fighter, 'poison') && <i className="poison-surface" aria-hidden="true" />}
                {isAttack && <i className={`attack-fx fx-${attackEffect}`} key={`fx-${animationKey}`} />}
                {isTarget && <i className="hit-spark" key={`hit-${animationKey}`} />}
              </div>
              {hasMissNotice && (
                <div className="miss-callout" key={`miss-${missNotice.n}`}>
                  <b>MISS</b>
                  <span>空振り</span>
                </div>
              )}
              {isActor && flash?.reaction && <i className="reaction-pulse" key={`reaction-${animationKey}`} />}
              {abilityEffect && <i className={`ability-fx fx-${abilityEffect}`} key={`ability-${animationKey}`} />}
              <div className="sprite-hp">
                <i style={{ width: `${hpRatio * 100}%` }} />
              </div>
              {fighter.hp <= 0 && <div className="ko-chip">DOWN</div>}
              {fighter.hp > 0 &&
                statusDetails.map(({ definition, instance }) => (
                  <div
                    className={definition.visual.chipClass}
                    aria-label={`${definition.label}状態 ${instance.stacks}`}
                    key={definition.id}
                  >
                    {definition.visual.label}
                    {definition.visual.showStacks && <b>×{instance.stacks}</b>}
                    {definition.visual.showRemaining && instance.remainingSeconds !== null && (
                      <> {instance.remainingSeconds.toFixed(1)}</>
                    )}
                  </div>
                ))}
              {isActor && flash?.kind === 'heal' && <div className="status-chip heal">PATCH</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
