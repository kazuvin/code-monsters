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
        public double Hp;
        public double MaxHp;
        public double Range;
        public double? AirborneRemainingSeconds;
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

        public bool IsAirborne()
        {
            return AirborneRemainingSeconds.HasValue && AirborneRemainingSeconds.Value > 0;
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

    public static class BattleRules
    {
        public static double DistanceTo(FighterState actor, FighterState target)
        {
            return Math.Abs(actor.X - target.X);
        }

        public static double ActionRange(FighterState actor, InstructionDefinition instruction)
        {
            if (instruction.Range.Mode == "fixed")
                return instruction.Range.Value ?? actor.Range;
            if (instruction.Range.Mode == "scaled")
                return actor.Range * (instruction.Range.Value ?? 1);
            return actor.Range;
        }

        public static bool PathEntersZone(double fromX, double toX, double zoneX, double radius)
        {
            if (Math.Abs(fromX - zoneX) <= radius)
                return false;
            var low = Math.Min(fromX, toX);
            var high = Math.Max(fromX, toX);
            return high >= zoneX - radius && low <= zoneX + radius;
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
                "targetInRange" => DistanceTo(actor, target) <= actor.Range,
                "targetOutOfRange" => DistanceTo(actor, target) > actor.Range,
                "targetHpBelow" => condition.Params.Threshold.HasValue
                    && target.Hp / target.MaxHp <= condition.Params.Threshold.Value,
                "selfHpBelow" => condition.Params.Threshold.HasValue
                    && target.InstanceId == actor.InstanceId
                    && actor.Hp / actor.MaxHp <= condition.Params.Threshold.Value,
                "targetHasStatus" => !string.IsNullOrEmpty(condition.Params.StatusId)
                    && target.StatusStacks(condition.Params.StatusId) >= (condition.Params.MinimumStacks ?? 1),
                "selfHasStatus" => !string.IsNullOrEmpty(condition.Params.StatusId)
                    && actor.StatusStacks(condition.Params.StatusId) >= (condition.Params.MinimumStacks ?? 1),
                "selfAirborne" => actor.IsAirborne(),
                "selfGrounded" => !actor.IsAirborne(),
                "targetAirborne" => target.IsAirborne(),
                "targetGrounded" => !target.IsAirborne(),
                "targetAirborneRemainingBelow" => target.IsAirborne()
                    && condition.Params.ThresholdSeconds.HasValue
                    && target.AirborneRemainingSeconds.Value <= condition.Params.ThresholdSeconds.Value,
                _ => throw new ArgumentOutOfRangeException(nameof(condition.Kind), condition.Kind, "Unknown condition"),
            };
        }

        public static bool InstructionAltitudeReady(
            InstructionDefinition instruction,
            FighterState actor,
            FighterState target
        )
        {
            var actorRequirement = instruction.Altitude?.Actor ?? "grounded";
            var targetRequirement = instruction.Altitude?.Target ?? "grounded";
            return MatchesAltitude(actor, actorRequirement) && MatchesAltitude(target, targetRequirement);
        }

        private static bool MatchesAltitude(FighterState fighter, string requirement)
        {
            return requirement == "any" || (requirement == "airborne" ? fighter.IsAirborne() : !fighter.IsAirborne());
        }
    }
}
