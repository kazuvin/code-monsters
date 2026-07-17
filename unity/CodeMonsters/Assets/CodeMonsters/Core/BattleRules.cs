using System;

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
        public double Poison;
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
            BattleConfig battle
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
                "enemyHasStatus" => target.Poison > 0,
                _ => throw new ArgumentOutOfRangeException(nameof(conditionId), conditionId, "Unknown condition"),
            };
        }
    }
}
