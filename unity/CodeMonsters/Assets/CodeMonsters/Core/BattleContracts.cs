using System.Collections.Generic;

namespace CodeMonsters.Core
{
    public sealed class ProgramBlock
    {
        public string TargetId = "";
        public string ConditionId = "";
        public string ActionId = "";
    }

    public sealed class DecisionTrace
    {
        public string ActorId = "";
        public string Team = "";
        public int BlockIndex;
        public string ActionId = "";
        public string Outcome = "";
        public string Reason = "";
    }

    public sealed class FighterUpdate
    {
        public string Id = "";
        public Dictionary<string, double> Values = new Dictionary<string, double>();
    }

    public sealed class BattleStep
    {
        public string VisualKind = "";
        public string ActorId = "";
        public string TargetId = "";
        public List<FighterUpdate> Updates = new List<FighterUpdate>();
    }

    public sealed class ReplayFrame
    {
        public double Elapsed;
        public List<FighterState> Fighters = new List<FighterState>();
        public List<BattleStep> QueuedSteps = new List<BattleStep>();
        public List<DecisionTrace> Decisions = new List<DecisionTrace>();
    }
}
