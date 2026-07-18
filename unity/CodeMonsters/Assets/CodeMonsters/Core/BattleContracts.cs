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

    public sealed class BattleDamagePayload
    {
        public string ActorId = "";
        public string ActorName = "";
        public string Team = "";
        public string ActionId = "";
        public double Amount;
        public string Source = "";
    }

    public sealed class BattleStep
    {
        public string VisualKind = "";
        public string ActorId = "";
        public string TargetId = "";
        public BattleDamagePayload Damage;
        public List<FighterUpdate> Updates = new List<FighterUpdate>();
        public List<BattleZoneChange> ZoneChanges = new List<BattleZoneChange>();
    }

    public sealed class BattleZoneState
    {
        public string InstanceId = "";
        public string ZoneId = "";
        public double X;
        public double RemainingSeconds;
        public string SourceId = "";
        public string SourceTeam = "";
    }

    public sealed class BattleZoneChange
    {
        public string Kind = "";
        public string ZoneId = "";
        public BattleZoneState Zone;
    }

    public sealed class ReplayFrame
    {
        public double Elapsed;
        public List<FighterState> Fighters = new List<FighterState>();
        public List<BattleZoneState> Zones = new List<BattleZoneState>();
        public List<BattleStep> QueuedSteps = new List<BattleStep>();
        public List<DecisionTrace> Decisions = new List<DecisionTrace>();
    }
}
