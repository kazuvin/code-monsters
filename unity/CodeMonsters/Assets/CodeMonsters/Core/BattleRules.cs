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
            var horizontal = Math.Abs(fighter.X - shape.X) <= shape.Width / 2 + fighterRadius;
            if (!horizontal || !shape.Height.HasValue)
                return horizontal;
            return Math.Abs(fighter.Y - shape.Y) <= shape.Height.Value / 2 + fighterRadius;
        }

        public static ProjectileState CreateProjectile(
            SpatialDeliveryDefinition delivery,
            FighterState actor,
            FighterState target,
            double fighterRadius,
            bool reaction = false
        )
        {
            var startY = actor.Y + fighterRadius * 0.6;
            var dx = target.X - actor.X;
            var dy = target.Y - startY;
            var magnitude = Math.Sqrt(dx * dx + dy * dy);
            if (magnitude <= double.Epsilon)
                magnitude = 1;
            var speed = delivery.Speed ?? 0;
            return new ProjectileState
            {
                X = actor.X,
                Y = startY,
                VX = dx / magnitude * speed,
                VY = dy / magnitude * speed,
                Speed = speed,
                Radius = delivery.Radius ?? 0,
                RemainingSeconds = delivery.LifetimeSeconds ?? 0,
                Homing = delivery.Homing,
                Reaction = reaction,
                TurnRateDegrees = delivery.TurnRateDegrees ?? 0,
            };
        }

        public static ProjectileState AdvanceProjectile(ProjectileState projectile, FighterState target, double dt)
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
            return new ProjectileState
            {
                X = projectile.X + vx * dt,
                Y = projectile.Y + vy * dt,
                VX = vx,
                VY = vy,
                Speed = projectile.Speed,
                Radius = projectile.Radius,
                RemainingSeconds = Math.Max(0, projectile.RemainingSeconds - dt),
                Homing = projectile.Homing,
                Reaction = projectile.Reaction,
                TurnRateDegrees = projectile.TurnRateDegrees,
            };
        }

        public static bool ProjectileIntersects(
            ProjectileState previous,
            ProjectileState next,
            FighterState fighter,
            double fighterRadius
        )
        {
            return PointSegmentDistance(fighter.X, fighter.Y, previous.X, previous.Y, next.X, next.Y)
                <= next.Radius + fighterRadius;
        }

        public static FighterState TickMotion(FighterState fighter, BattleConfig battle, double dt)
        {
            var activeGravityScale = fighter.GravityScaleRemaining > 0 ? fighter.GravityScale : 1;
            var gravityRemaining = Math.Max(0, fighter.GravityScaleRemaining - dt);
            var gravityScale = gravityRemaining > 0 ? fighter.GravityScale : 1;
            var acceleratedVY = Math.Max(-battle.MaxFallSpeed, fighter.VY - battle.GravityPerSecond * activeGravityScale * dt);
            var unclampedY = fighter.Y + acceleratedVY * dt;
            var y = Math.Max(battle.FloorY, Math.Min(battle.CeilingY, unclampedY));
            var hitFloor = y <= battle.FloorY && acceleratedVY < 0;
            var hitCeiling = y >= battle.CeilingY && acceleratedVY > 0;
            var drag = hitFloor ? battle.GroundFrictionPerSecond : battle.HorizontalDragPerSecond;
            var vx = MoveTowardZero(fighter.VX, Math.Max(0, drag) * dt);
            return new FighterState
            {
                InstanceId = fighter.InstanceId,
                Team = fighter.Team,
                Role = fighter.Role,
                AttackType = fighter.AttackType,
                X = fighter.X + fighter.VX * dt,
                Y = y,
                VX = vx,
                VY = hitFloor || hitCeiling ? 0 : acceleratedVY,
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

        private static double MoveTowardZero(double value, double amount)
        {
            if (Math.Abs(value) <= amount)
                return 0;
            return value - Math.Sign(value) * amount;
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
