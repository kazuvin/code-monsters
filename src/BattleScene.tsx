import { useEffect, useState } from 'react';
import { BATTLE_ZONES } from './data';
import { activeStatusDetails, hasStatus, statusEffectTargetId, statusVisualClasses } from './core/statuses';
import type { BattleFlash, BattleZoneInstance, Fighter, SpatialProjectile } from './types';

type Props = {
  fighters: Fighter[];
  zones?: BattleZoneInstance[];
  projectiles?: SpatialProjectile[];
  flash: BattleFlash | null;
  flashes?: BattleFlash[];
  running: boolean;
};
const zoneById = new Map(BATTLE_ZONES.map((zone) => [zone.id, zone]));

const DEPTH_SLOTS = 2;
const DEPTH_SLOT_OFFSETS_PX = [-7, 7] as const;
const TEAM_DEPTH_NUDGE_PX: Record<Fighter['team'], number> = { ally: -2, enemy: 2 };
const depthSlot = (fighter: Fighter, fighters: Fighter[]) =>
  fighters
    .filter((other) => other.team === fighter.team)
    .findIndex((other) => other.instanceId === fighter.instanceId) % DEPTH_SLOTS;
const depthIndex = (fighter: Fighter, fighters: Fighter[]) =>
  50 - depthSlot(fighter, fighters) * 10 + (fighter.team === 'ally' ? 1 : 0);
const depthOffset = (fighter: Fighter, fighters: Fighter[]) => {
  const teamSize = fighters.filter((other) => other.team === fighter.team).length;
  return teamSize <= 1 ? 0 : DEPTH_SLOT_OFFSETS_PX[depthSlot(fighter, fighters)] + TEAM_DEPTH_NUDGE_PX[fighter.team];
};

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

export function BattleScene({ fighters, zones = [], projectiles = [], flash, flashes, running }: Props) {
  const activeFlashes = flashes && flashes.length > 0 ? flashes : flash ? [flash] : [];
  const [missNotice, setMissNotice] = useState<BattleFlash | null>(null);
  useEffect(() => {
    const missed = (flashes && flashes.length > 0 ? flashes : flash ? [flash] : []).find(
      (candidate) => candidate.kind === 'miss',
    );
    if (missed) setMissNotice(missed);
  }, [flash, flashes]);
  useEffect(() => {
    if (!missNotice) return;
    const timer = setTimeout(() => setMissNotice(null), 1200);
    return () => clearTimeout(timer);
  }, [missNotice]);
  const aliveAllies = fighters.filter((f) => f.team === 'ally' && f.hp > 0);
  const aliveEnemies = fighters.filter((f) => f.team === 'enemy' && f.hp > 0);
  const allyFront = aliveAllies.reduce((n, f) => n + f.x, 0) / (aliveAllies.length || 1);
  const enemyFront = aliveEnemies.reduce((n, f) => n + f.x, 0) / (aliveEnemies.length || 1);
  const flashSubject = flash ? fighters.find((fighter) => fighter.instanceId === flash.id) : undefined;
  const flashActor = flash?.actorId ? fighters.find((fighter) => fighter.instanceId === flash.actorId) : flashSubject;
  const flashTarget = flash?.targetId ? fighters.find((fighter) => fighter.instanceId === flash.targetId) : undefined;
  const attackShapes = activeFlashes.flatMap((candidate) =>
    candidate.shape ? [{ ...candidate.shape, flash: candidate }] : [],
  );

  return (
    <div
      className={`side-battlefield ${running ? 'is-running' : 'is-paused'} ${activeFlashes.some((candidate) => candidate.actionLabel) ? 'has-action-focus' : ''}`}
      aria-label="2D戦闘フィールド"
      data-event-id={flash?.n ?? ''}
      data-event-kind={activeFlashes.map((candidate) => candidate.kind).join(',')}
      data-action-label={activeFlashes
        .map((candidate) => candidate.actionLabel)
        .filter(Boolean)
        .join(' / ')}
    >
      <div className="stage-wall wall-ally" />
      <div className="stage-wall wall-enemy" />
      <div className="base base-ally">
        <span>ALLY CORE</span>
      </div>
      <div className="base base-enemy">
        <span>ENEMY CORE</span>
      </div>
      {flashActor && flash?.actionLabel && (
        <div
          className={`battle-action-readout ${flashActor.team} ${flash?.reaction ? 'reaction' : ''} ${flash?.kind === 'miss' ? 'miss' : ''}`}
          role="status"
          aria-live="polite"
        >
          <span>{flashActor.name}</span>
          <i aria-hidden="true">→</i>
          <b>{flash.actionLabel}</b>
          {flashTarget && flashTarget.instanceId !== flashActor.instanceId && (
            <>
              <i aria-hidden="true">→</i>
              <span>{flashTarget.name}</span>
            </>
          )}
          {flash.reaction && <em>REACTION</em>}
        </div>
      )}
      <div className="battle-road">
        <div className="frontline" style={{ left: `${Math.max(14, Math.min(86, (allyFront + enemyFront) / 2))}%` }} />
        {zones.map((zone) => {
          const definition = zoneById.get(zone.zoneId);
          if (!definition) return null;
          return (
            <div
              className={`battle-zone ${definition.visual.className}`}
              data-zone-id={zone.zoneId}
              key={zone.instanceId}
              aria-label={`${definition.label} 残り${zone.remainingSeconds.toFixed(1)}秒`}
              style={{
                left: `${zone.x - definition.radius}%`,
                width: `${definition.radius * 2}%`,
                ['--zone-y' as string]: `${zone.y}px`,
                ['--zone-color' as string]: definition.visual.color,
              }}
            >
              <i aria-hidden="true" />
              <span>{definition.visual.label}</span>
              <small>{zone.remainingSeconds.toFixed(1)}s</small>
            </div>
          );
        })}
        {attackShapes.map((shape) => (
          <i
            aria-hidden="true"
            className={`spatial-attack-shape shape-${shape.kind} ${shape.kind === 'box' && shape.height === null ? 'is-infinite-height' : ''}`}
            data-attack-shape={shape.kind}
            key={`shape-${shape.flash.id}-${shape.flash.n}`}
            style={{
              left: `${shape.x}%`,
              ['--shape-y' as string]: `${shape.y}px`,
              ['--shape-width' as string]: `${shape.kind === 'circle' ? shape.radius * 2 : shape.width}%`,
              ['--shape-height' as string]: `${shape.kind === 'circle' ? shape.radius * 2 : (shape.height ?? 64)}px`,
            }}
          />
        ))}
        {projectiles.map((projectile) => (
          <i
            aria-hidden="true"
            className={`spatial-projectile ${projectile.sourceTeam} ${projectile.homing ? 'is-homing' : 'is-direct'}`}
            data-projectile-id={projectile.instanceId}
            data-projectile-kind={projectile.homing ? 'homing' : 'direct'}
            key={projectile.instanceId}
            style={{
              left: `${projectile.x}%`,
              ['--projectile-y' as string]: `${projectile.y}px`,
              ['--projectile-angle' as string]: `${Math.atan2(projectile.vy, projectile.vx)}rad`,
              ['--projectile-size' as string]: `${Math.max(7, projectile.radius * 3)}px`,
            }}
          />
        ))}
        {fighters.map((fighter) => {
          const fighterFlashes = activeFlashes.filter((candidate) => candidate.id === fighter.instanceId);
          const fighterFlash =
            fighterFlashes.find((candidate) => candidate.kind === 'thrown' || candidate.kind === 'pulled') ??
            fighterFlashes[0];
          const impactFlash = activeFlashes.find((candidate) => candidate.targetId === fighter.instanceId);
          const isActor = fighterFlash !== undefined;
          const isFocusActor = activeFlashes.some((candidate) => {
            const actorId = candidate.actorId ?? candidate.id;
            return actorId === fighter.instanceId;
          });
          const hasMissNotice = missNotice?.id === fighter.instanceId;
          const isTarget = impactFlash !== undefined;
          const isProjectileTarget = projectiles.some((projectile) => projectile.targetId === fighter.instanceId);
          const showsImpact =
            isTarget &&
            impactFlash?.kind !== 'miss' &&
            (attackKinds.some((kind) => kind === impactFlash?.kind) ||
              impactFlash?.kind === 'throw' ||
              impactFlash?.kind === 'status');
          const isAttack = isActor && attackKinds.some((kind) => kind === fighterFlash?.kind);
          const attackType = isActor && fighterFlash?.attackType ? fighterFlash.attackType : fighter.attackType;
          const attackEffect = fighterFlash?.kind === 'follow' ? 'follow' : attackType;
          const abilityEffect =
            isActor &&
            (fighterFlash?.kind === 'dash' ||
              fighterFlash?.kind === 'throw' ||
              fighterFlash?.kind === 'taunt' ||
              fighterFlash?.kind === 'pull' ||
              fighterFlash?.kind === 'retreat' ||
              fighterFlash?.kind === 'field' ||
              fighterFlash?.kind === 'guard')
              ? fighterFlash.kind
              : null;
          const state = fighter.hp <= 0 ? 'is-dead' : isActor ? `is-${fighterFlash?.kind}` : '';
          const hpRatio = Math.max(0, fighter.hp / fighter.maxHp);
          const opponent = nearestOpponent(fighter, fighters);
          const facingClass = opponent
            ? opponent.x < fighter.x
              ? 'face-left'
              : 'face-right'
            : fighter.team === 'enemy'
              ? 'face-left'
              : 'face-right';
          const animationKey = fighterFlash?.n ?? impactFlash?.n ?? 'idle';
          const fighterDepthSlot = depthSlot(fighter, fighters);
          const statusDetails = activeStatusDetails(fighter);
          return (
            <div
              className={`sprite unit-${fighter.id} ${fighter.team} ${facingClass} role-${fighter.role.toLowerCase()} attack-${attackType} ${statusVisualClasses(fighter)} ${fighter.y > 0.1 ? 'has-height' : ''} ${isProjectileTarget ? 'projectile-impact-target' : ''} ${activeFlashes.some((candidate) => candidate.actionLabel) ? (isFocusActor ? 'is-focus-actor' : isTarget ? 'is-focus-target' : 'is-focus-muted') : ''} ${state}`}
              data-depth-slot={fighterDepthSlot}
              data-x={fighter.x.toFixed(2)}
              data-y={fighter.y.toFixed(2)}
              data-vx={fighter.vx.toFixed(2)}
              data-vy={fighter.vy.toFixed(2)}
              key={fighter.instanceId}
              style={{
                left: `${fighter.x}%`,
                zIndex: depthIndex(fighter, fighters),
                ['--unit-color' as string]: colorHex(fighter.color),
                ['--depth-offset' as string]: `${depthOffset(fighter, fighters)}px`,
                ['--unit-y' as string]: `${fighter.y}px`,
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
                {showsImpact && <i className="hit-spark" key={`hit-${animationKey}`} />}
              </div>
              {hasMissNotice && (
                <div className="miss-callout" key={`miss-${missNotice.n}`}>
                  <b>MISS</b>
                  <span>空振り</span>
                </div>
              )}
              {isActor && fighterFlash?.reaction && <i className="reaction-pulse" key={`reaction-${animationKey}`} />}
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
              {isActor && fighterFlash?.kind === 'heal' && <div className="status-chip heal">PATCH</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
