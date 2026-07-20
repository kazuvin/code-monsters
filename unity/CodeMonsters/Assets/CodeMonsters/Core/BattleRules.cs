using System;
using System.Collections.Generic;

namespace CodeMonsters.Core
{
    public sealed class FighterState
    {
        public string InstanceId = "";
        public string Team = "";
        public string Role = "";
        public string AttackType = "";
        public double X;
        public double Y;
        public double VX;
        public double VY;
        public double HorizontalBrakePerSecond;
        public double HorizontalBrakeRemaining;
        public double FallSpeedLimit;
        public double FallSpeedLimitRemaining;
        public double GravityScale = 1;
        public double GravityScaleRemaining;
        public double Hp;
        public double MaxHp;
        public List<StatusInstance> Statuses = new List<StatusInstance>();

        public bool HasStatus(string statusId)
        {
            return Statuses.Exists(status => status.StatusId == statusId && status.Stacks > 0);
        }

        public int StatusStacks(string statusId)
        {
            var status = Statuses.Find(candidate => candidate.StatusId == statusId);
            return status == null ? 0 : status.Stacks;
        }
    }

    public sealed class StatusInstance
    {
        public string StatusId = "";
        public int Stacks = 1;
        public double? RemainingSeconds;
        public string SourceId = "";
        public string TargetId = "";
        public double TickAccumulatorSeconds;
    }

    public sealed class ResolvedAttackShape
    {
        public string Kind = "";
        public double X;
        public double Y;
        public double Radius;
        public double Width;
        public double? Height;
        public double AngleDegrees;
        public int Direction;
    }

    public sealed class ProjectileState
    {
        public double X;
        public double Y;
        public double VX;
        public double VY;
        public double Speed;
        public double Radius;
        public double RemainingSeconds;
        public bool Homing;
        public bool Reaction;
        public double TurnRateDegrees;
        public string Trajectory = "linear";
        public string Impact = "fighter";
        public double GravityScale;
        public double MinimumTravelDistance;
        public double DistanceTraveled;
    }

    public static class BattleRules
    {
        public static double DistanceTo(FighterState actor, FighterState target)
        {
            return Math.Sqrt(Math.Pow(target.X - actor.X, 2) + Math.Pow(target.Y - actor.Y, 2));
        }

        public static bool MatchesCondition(
            ConditionDefinition condition,
            FighterState actor,
            FighterState target
        )
        {
            return condition.Kind switch
            {
                "always" => true,
                "targetWithinDistance" => condition.Params.Distance.HasValue
                    && DistanceTo(actor, target) <= condition.Params.Distance.Value,
                "targetBeyondDistance" => condition.Params.Distance.HasValue
                    && DistanceTo(actor, target) > condition.Params.Distance.Value,
                "targetHpBelow" => condition.Params.Threshold.HasValue
                    && target.Hp / target.MaxHp <= condition.Params.Threshold.Value,
                "selfHpBelow" => condition.Params.Threshold.HasValue
                    && target.InstanceId == actor.InstanceId
                    && actor.Hp / actor.MaxHp <= condition.Params.Threshold.Value,
                "targetHasStatus" => !string.IsNullOrEmpty(condition.Params.StatusId)
                    && target.StatusStacks(condition.Params.StatusId) >= (condition.Params.MinimumStacks ?? 1),
                "selfHasStatus" => !string.IsNullOrEmpty(condition.Params.StatusId)
                    && actor.StatusStacks(condition.Params.StatusId) >= (condition.Params.MinimumStacks ?? 1),
                "selfHeightAbove" => condition.Params.Height.HasValue && actor.Y >= condition.Params.Height.Value,
                "selfHeightBelow" => condition.Params.Height.HasValue && actor.Y <= condition.Params.Height.Value,
                "targetHeightAbove" => condition.Params.Height.HasValue && target.Y >= condition.Params.Height.Value,
                "selfDescending" => condition.Params.VerticalSpeed.HasValue
                    && actor.VY <= -condition.Params.VerticalSpeed.Value,
                _ => throw new ArgumentOutOfRangeException(nameof(condition.Kind), condition.Kind, "Unknown condition"),
            };
        }

        public static ResolvedAttackShape ResolveAttackShape(
            InstructionDefinition instruction,
            FighterState actor,
            FighterState target
        )
        {
            if (instruction.Delivery == null || instruction.Delivery.Kind != "shape" || instruction.Delivery.Shape == null)
                return null;
            var shape = instruction.Delivery.Shape;
            var direction = DirectionToward(actor, target);
            return new ResolvedAttackShape
            {
                Kind = shape.Kind,
                X = actor.X + direction * shape.OffsetX,
                Y = actor.Y + shape.OffsetY,
                Radius = shape.Radius ?? 0,
                Width = shape.Width ?? 0,
                Height = shape.Height,
                AngleDegrees = shape.AngleDegrees ?? 0,
                Direction = direction,
            };
        }

        public static ResolvedAttackShape ResolveLandingShape(
            SpatialDeliveryDefinition delivery,
            FighterState actor,
            FighterState target,
            BattleConfig battle
        )
        {
            if (delivery == null || delivery.Kind != "landing" || delivery.Shape == null)
                return null;
            var direction = DirectionToward(actor, target);
            return new ResolvedAttackShape
            {
                Kind = delivery.Shape.Kind,
                X = actor.X + direction * delivery.Shape.OffsetX,
                Y = battle.FloorY + delivery.Shape.OffsetY,
                Radius = delivery.Shape.Radius ?? 0,
                Width = delivery.Shape.Width ?? 0,
                Height = delivery.Shape.Height,
            };
        }

        public static bool ShapeIntersectsFighter(
            ResolvedAttackShape shape,
            FighterState fighter,
            double fighterRadius
        )
        {
            if (shape.Kind == "circle")
                return Math.Sqrt(Math.Pow(fighter.X - shape.X, 2) + Math.Pow(fighter.Y - shape.Y, 2))
                    <= shape.Radius + fighterRadius;
            if (shape.Kind == "sector")
            {
                var dx = fighter.X - shape.X;
                var dy = fighter.Y - shape.Y;
                var distance = Math.Sqrt(dx * dx + dy * dy);
                if (distance <= fighterRadius)
                    return true;
                if (distance > shape.Radius + fighterRadius)
                    return false;
                var forwardRatio = Math.Max(-1, Math.Min(1, dx * shape.Direction / distance));
                var angle = Math.Acos(forwardRatio);
                var angularPadding = Math.Asin(Math.Min(1, fighterRadius / distance));
                return angle <= shape.AngleDegrees * Math.PI / 360 + angularPadding;
            }
            var horizontal = Math.Abs(fighter.X - shape.X) <= shape.Width / 2 + fighterRadius;
            if (!horizontal || !shape.Height.HasValue)
                return horizontal;
            return Math.Abs(fighter.Y - shape.Y) <= shape.Height.Value / 2 + fighterRadius;
        }

        public static ProjectileState CreateProjectile(
            SpatialDeliveryDefinition delivery,
            FighterState actor,
            FighterState target,
            BattleConfig battle,
            bool reaction = false
        )
        {
            var ballistic = delivery.Kind == "lob";
            var radius = delivery.Radius ?? 0;
            var startY = ballistic ? actor.Y + battle.FighterRadius + radius : actor.Y + battle.FighterRadius * 0.6;
            var dx = target.X - actor.X;
            var dy = target.Y - startY;
            var magnitude = Math.Sqrt(dx * dx + dy * dy);
            if (magnitude <= double.Epsilon)
                magnitude = 1;
            var speed = delivery.Speed ?? 0;
            var gravityScale = ballistic ? delivery.GravityScale ?? 0 : 0;
            var flightSeconds = ballistic ? delivery.FlightSeconds ?? 0 : 0;
            var gravity = battle.GravityPerSecond * gravityScale;
            var destinationY = battle.FloorY + radius;
            var vx = ballistic ? dx / flightSeconds : dx / magnitude * speed;
            var vy = ballistic
                ? (destinationY - startY + 0.5 * gravity * flightSeconds * flightSeconds) / flightSeconds
                : dy / magnitude * speed;
            return new ProjectileState
            {
                X = actor.X,
                Y = startY,
                VX = vx,
                VY = vy,
                Speed = ballistic ? Math.Sqrt(vx * vx + vy * vy) : speed,
                Radius = radius,
                RemainingSeconds = ballistic
                    ? flightSeconds + battle.TickSeconds * 3
                    : delivery.LifetimeSeconds ?? 0,
                Homing = ballistic ? false : delivery.Homing,
                Reaction = reaction,
                TurnRateDegrees = ballistic ? 0 : delivery.TurnRateDegrees ?? 0,
                Trajectory = ballistic ? "ballistic" : "linear",
                Impact = ballistic ? "floor" : "fighter",
                GravityScale = gravityScale,
                MinimumTravelDistance = ballistic ? 0 : delivery.MinimumTravelDistance ?? 0,
                DistanceTraveled = 0,
            };
        }

        public static ProjectileState AdvanceProjectile(
            ProjectileState projectile,
            FighterState target,
            BattleConfig battle,
            double dt
        )
        {
            var vx = projectile.VX;
            var vy = projectile.VY;
            if (projectile.Homing && target != null && target.Hp > 0)
            {
                var desiredAngle = Math.Atan2(target.Y - projectile.Y, target.X - projectile.X);
                var currentAngle = Math.Atan2(vy, vx);
                var maxTurn = projectile.TurnRateDegrees * Math.PI / 180 * dt;
                var turn = Math.Max(-maxTurn, Math.Min(maxTurn, NormalizeAngle(desiredAngle - currentAngle)));
                var nextAngle = currentAngle + turn;
                vx = Math.Cos(nextAngle) * projectile.Speed;
                vy = Math.Sin(nextAngle) * projectile.Speed;
            }
            var gravity = battle.GravityPerSecond * projectile.GravityScale;
            var x = projectile.X + vx * dt;
            var y = projectile.Y + vy * dt - 0.5 * gravity * dt * dt;
            return new ProjectileState
            {
                X = x,
                Y = y,
                VX = vx,
                VY = vy - gravity * dt,
                Speed = projectile.Speed,
                Radius = projectile.Radius,
                RemainingSeconds = Math.Max(0, projectile.RemainingSeconds - dt),
                Homing = projectile.Homing,
                Reaction = projectile.Reaction,
                TurnRateDegrees = projectile.TurnRateDegrees,
                Trajectory = projectile.Trajectory,
                Impact = projectile.Impact,
                GravityScale = projectile.GravityScale,
                MinimumTravelDistance = projectile.MinimumTravelDistance,
                DistanceTraveled = projectile.DistanceTraveled
                    + Math.Sqrt(Math.Pow(x - projectile.X, 2) + Math.Pow(y - projectile.Y, 2)),
            };
        }

        public static bool ProjectileHitsFloor(
            ProjectileState previous,
            ProjectileState next,
            double floorY
        )
        {
            return next.Impact == "floor"
                && next.VY <= 0
                && previous.Y > floorY + previous.Radius
                && next.Y <= floorY + next.Radius;
        }

        public static double ProjectileFloorImpactX(
            ProjectileState previous,
            ProjectileState next,
            double floorY
        )
        {
            var floorLevel = floorY + next.Radius;
            var verticalTravel = previous.Y - next.Y;
            if (verticalTravel <= double.Epsilon)
                return next.X;
            var progress = Math.Max(0, Math.Min(1, (previous.Y - floorLevel) / verticalTravel));
            return previous.X + (next.X - previous.X) * progress;
        }

        public static bool ProjectileIntersects(
            ProjectileState previous,
            ProjectileState next,
            FighterState fighter,
            double fighterRadius
        )
        {
            if (next.DistanceTraveled < next.MinimumTravelDistance)
                return false;
            var fromX = previous.X;
            var fromY = previous.Y;
            var segmentDistance = next.DistanceTraveled - previous.DistanceTraveled;
            if (previous.DistanceTraveled < next.MinimumTravelDistance && segmentDistance > double.Epsilon)
            {
                var progress = (next.MinimumTravelDistance - previous.DistanceTraveled) / segmentDistance;
                fromX = previous.X + (next.X - previous.X) * progress;
                fromY = previous.Y + (next.Y - previous.Y) * progress;
            }
            return PointSegmentDistance(fighter.X, fighter.Y, fromX, fromY, next.X, next.Y)
                <= next.Radius + fighterRadius;
        }

        public static FighterState TickMotion(FighterState fighter, BattleConfig battle, double dt)
        {
            var activeGravityScale = fighter.GravityScaleRemaining > 0 ? fighter.GravityScale : 1;
            var gravityRemaining = Math.Max(0, fighter.GravityScaleRemaining - dt);
            var gravityScale = gravityRemaining > 0 ? fighter.GravityScale : 1;
            var activeFallSpeedLimit = fighter.FallSpeedLimitRemaining > 0
                ? fighter.FallSpeedLimit
                : battle.MaxFallSpeed;
            var fallSpeedLimitRemaining = Math.Max(0, fighter.FallSpeedLimitRemaining - dt);
            var acceleratedVY = Math.Max(-activeFallSpeedLimit, fighter.VY - battle.GravityPerSecond * activeGravityScale * dt);
            var unclampedY = fighter.Y + acceleratedVY * dt;
            var y = Math.Max(battle.FloorY, Math.Min(battle.CeilingY, unclampedY));
            var hitFloor = y <= battle.FloorY && acceleratedVY < 0;
            var hitCeiling = y >= battle.CeilingY && acceleratedVY > 0;
            var controlledDuration = Math.Min(dt, Math.Max(0, fighter.HorizontalBrakeRemaining));
            var vx = fighter.VX;
            var horizontalDistance = IntegrateHorizontalDrag(
                ref vx,
                Math.Max(0, fighter.HorizontalBrakePerSecond),
                controlledDuration
            );
            var passiveDrag = hitFloor ? battle.GroundFrictionPerSecond : battle.HorizontalDragPerSecond;
            horizontalDistance += IntegrateHorizontalDrag(
                ref vx,
                Math.Max(0, passiveDrag),
                Math.Max(0, dt - controlledDuration)
            );
            var horizontalBrakeRemaining = Math.Max(0, fighter.HorizontalBrakeRemaining - dt);
            return new FighterState
            {
                InstanceId = fighter.InstanceId,
                Team = fighter.Team,
                Role = fighter.Role,
                AttackType = fighter.AttackType,
                X = fighter.X + horizontalDistance,
                Y = y,
                VX = vx,
                VY = hitFloor || hitCeiling ? 0 : acceleratedVY,
                HorizontalBrakePerSecond = horizontalBrakeRemaining > 0 ? fighter.HorizontalBrakePerSecond : 0,
                HorizontalBrakeRemaining = horizontalBrakeRemaining,
                FallSpeedLimit = fallSpeedLimitRemaining > 0 ? fighter.FallSpeedLimit : battle.MaxFallSpeed,
                FallSpeedLimitRemaining = fallSpeedLimitRemaining,
                GravityScale = gravityScale,
                GravityScaleRemaining = gravityRemaining,
                Hp = fighter.Hp,
                MaxHp = fighter.MaxHp,
                Statuses = fighter.Statuses,
            };
        }

        public static bool PathEntersZone(
            double fromX,
            double fromY,
            double toX,
            double toY,
            double zoneX,
            double zoneY,
            double radius
        )
        {
            if (Math.Sqrt(Math.Pow(fromX - zoneX, 2) + Math.Pow(fromY - zoneY, 2)) <= radius)
                return false;
            return PointSegmentDistance(zoneX, zoneY, fromX, fromY, toX, toY) <= radius;
        }

        private static int DirectionToward(FighterState actor, FighterState target)
        {
            var direction = Math.Sign(target.X - actor.X);
            return direction == 0 ? (actor.Team == "ally" ? 1 : -1) : direction;
        }

        private static double NormalizeAngle(double angle)
        {
            return Math.Atan2(Math.Sin(angle), Math.Cos(angle));
        }

        private static double IntegrateHorizontalDrag(
            ref double velocity,
            double dragPerSecond,
            double duration
        )
        {
            if (duration <= 0 || velocity == 0)
                return 0;
            if (dragPerSecond <= 0)
                return velocity * duration;
            var direction = Math.Sign(velocity);
            var activeDuration = Math.Min(duration, Math.Abs(velocity) / dragPerSecond);
            var distance = velocity * activeDuration
                - direction * 0.5 * dragPerSecond * activeDuration * activeDuration;
            velocity -= direction * dragPerSecond * activeDuration;
            if (Math.Abs(velocity) < 0.000000001)
                velocity = 0;
            return distance;
        }

        private static double PointSegmentDistance(
            double pointX,
            double pointY,
            double fromX,
            double fromY,
            double toX,
            double toY
        )
        {
            var segmentX = toX - fromX;
            var segmentY = toY - fromY;
            var lengthSquared = segmentX * segmentX + segmentY * segmentY;
            if (lengthSquared <= double.Epsilon)
                return Math.Sqrt(Math.Pow(pointX - fromX, 2) + Math.Pow(pointY - fromY, 2));
            var t = Math.Max(
                0,
                Math.Min(1, ((pointX - fromX) * segmentX + (pointY - fromY) * segmentY) / lengthSquared)
            );
            var closestX = fromX + segmentX * t;
            var closestY = fromY + segmentY * t;
            return Math.Sqrt(Math.Pow(pointX - closestX, 2) + Math.Pow(pointY - closestY, 2));
        }
    }
}
