import { BATTLE_CONFIG } from '../data.ts';
import type { Fighter, Instruction, ProjectileDelivery, ResolvedAttackShape, SpatialProjectile } from '../types.ts';

const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;
const normalizeAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

export const spatialDistance = (left: Pick<Fighter, 'x' | 'y'>, right: Pick<Fighter, 'x' | 'y'>) =>
  Math.hypot(right.x - left.x, right.y - left.y);

export const directionToward = (actor: Pick<Fighter, 'x' | 'team'>, target: Pick<Fighter, 'x'>) =>
  Math.sign(target.x - actor.x) || (actor.team === 'ally' ? 1 : -1);

export function resolveAttackShape(
  instruction: Instruction,
  actor: Fighter,
  target: Fighter,
): ResolvedAttackShape | null {
  if (instruction.delivery?.kind !== 'shape') return null;
  const direction = directionToward(actor, target);
  const shape = instruction.delivery.shape;
  if (shape.kind === 'circle') {
    return {
      kind: 'circle',
      x: actor.x + direction * shape.offsetX,
      y: actor.y + shape.offsetY,
      radius: shape.radius,
    };
  }
  return {
    kind: 'box',
    x: actor.x + direction * shape.offsetX,
    y: actor.y + shape.offsetY,
    width: shape.width,
    height: shape.height,
  };
}

export function shapeIntersectsFighter(shape: ResolvedAttackShape, fighter: Fighter): boolean {
  const radius = BATTLE_CONFIG.fighterRadius;
  if (shape.kind === 'circle') return Math.hypot(fighter.x - shape.x, fighter.y - shape.y) <= shape.radius + radius;
  const horizontal = Math.abs(fighter.x - shape.x) <= shape.width / 2 + radius;
  if (!horizontal || shape.height === null) return horizontal;
  return Math.abs(fighter.y - shape.y) <= shape.height / 2 + radius;
}

export function createProjectile(
  instruction: Instruction,
  delivery: ProjectileDelivery,
  actor: Fighter,
  target: Fighter,
  elapsed: number,
  sequence: number,
  reaction = false,
): SpatialProjectile {
  const startX = actor.x;
  const startY = actor.y + BATTLE_CONFIG.fighterRadius * 0.6;
  const dx = target.x - startX;
  const dy = target.y - startY;
  const magnitude = Math.hypot(dx, dy) || 1;
  return {
    instanceId: `${instruction.id}:${actor.instanceId}:${Math.round(elapsed * 1000)}:${sequence}`,
    actionId: instruction.id,
    sourceId: actor.instanceId,
    sourceTeam: actor.team,
    reaction,
    targetId: target.instanceId,
    x: startX,
    y: startY,
    vx: (dx / magnitude) * delivery.speed,
    vy: (dy / magnitude) * delivery.speed,
    speed: delivery.speed,
    radius: delivery.radius,
    remainingSeconds: delivery.lifetimeSeconds,
    homing: delivery.homing,
    turnRateDegrees: delivery.turnRateDegrees ?? 0,
  };
}

export function advanceProjectile(
  projectile: SpatialProjectile,
  target: Fighter | undefined,
  dt: number,
): SpatialProjectile {
  let vx = projectile.vx;
  let vy = projectile.vy;
  if (projectile.homing && target && target.hp > 0) {
    const desiredAngle = Math.atan2(target.y - projectile.y, target.x - projectile.x);
    const currentAngle = Math.atan2(vy, vx);
    const maxTurn = degreesToRadians(projectile.turnRateDegrees) * dt;
    const turn = Math.max(-maxTurn, Math.min(maxTurn, normalizeAngle(desiredAngle - currentAngle)));
    const nextAngle = currentAngle + turn;
    vx = Math.cos(nextAngle) * projectile.speed;
    vy = Math.sin(nextAngle) * projectile.speed;
  }
  return {
    ...projectile,
    x: projectile.x + vx * dt,
    y: projectile.y + vy * dt,
    vx,
    vy,
    remainingSeconds: Math.max(0, projectile.remainingSeconds - dt),
  };
}

const pointSegmentDistance = (
  pointX: number,
  pointY: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
) => {
  const segmentX = toX - fromX;
  const segmentY = toY - fromY;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (lengthSquared <= Number.EPSILON) return Math.hypot(pointX - fromX, pointY - fromY);
  const projection = Math.max(
    0,
    Math.min(1, ((pointX - fromX) * segmentX + (pointY - fromY) * segmentY) / lengthSquared),
  );
  return Math.hypot(pointX - (fromX + segmentX * projection), pointY - (fromY + segmentY * projection));
};

export function projectileIntersectsFighter(
  previous: SpatialProjectile,
  current: SpatialProjectile,
  fighter: Fighter,
): boolean {
  return (
    pointSegmentDistance(fighter.x, fighter.y, previous.x, previous.y, current.x, current.y) <=
    previous.radius + BATTLE_CONFIG.fighterRadius
  );
}

export const projectileInBounds = (projectile: SpatialProjectile) =>
  projectile.remainingSeconds > 0 &&
  projectile.x >= BATTLE_CONFIG.wallLeft - projectile.radius &&
  projectile.x <= BATTLE_CONFIG.wallRight + projectile.radius &&
  projectile.y >= BATTLE_CONFIG.floorY - projectile.radius &&
  projectile.y <= BATTLE_CONFIG.ceilingY + projectile.radius;
