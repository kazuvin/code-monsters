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
        public List<StatusInstance> Statuses = new List<StatusInstance>();

        public bool HasStatus(string statusId)
        {
            return Statuses.Exists(status => status.StatusId == statusId && status.Stacks > 0);
        }
    }

    public sealed class StatusInstance
    {
        public string StatusId = "";
        public int Stacks = 1;
        public double? RemainingSeconds;
        public string SourceId = "";
        public string TargetId = "";
    }

    public static class BattleRules
    {
        public static double DistanceTo(FighterState actor, FighterState target)
        {
            return Math.Abs(actor.X - target.X);
        }

        public static double ActionRange(FighterState actor, InstructionDefinition instruction)
        {
            return instruction.Params.FixedRange ?? actor.Range;
        }

        public static bool MatchesCondition(
            string conditionId,
            FighterState actor,
            FighterState target,
            BattleConfig battle,
            string statusId = ""
        )
        {
            return conditionId switch
            {
                "always" => true,
                "targetInRange" => DistanceTo(actor, target) <= actor.Range,
                "targetOutOfRange" => DistanceTo(actor, target) > actor.Range,
                "enemyHpBelow50" => target.Hp / target.MaxHp <= battle.EnemyLowHpThreshold,
                "selfHpBelow30" => target.InstanceId == actor.InstanceId
                    && actor.Hp / actor.MaxHp <= battle.LowHpThreshold,
                "enemyHasStatus" => !string.IsNullOrEmpty(statusId) && target.HasStatus(statusId),
                _ => throw new ArgumentOutOfRangeException(nameof(conditionId), conditionId, "Unknown condition"),
            };
        }
    }
}
