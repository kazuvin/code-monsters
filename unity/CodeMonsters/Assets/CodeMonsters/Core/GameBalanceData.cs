using System.Collections.Generic;
using Newtonsoft.Json;

namespace CodeMonsters.Core
{
    public sealed class GameBalanceData
    {
        [JsonProperty("schemaVersion")]
        public int SchemaVersion;

        [JsonProperty("battle")]
        public BattleConfig Battle = new BattleConfig();

        [JsonProperty("debugTraining")]
        public DebugTrainingConfig DebugTraining = new DebugTrainingConfig();

        [JsonProperty("statuses")]
        public List<StatusDefinition> Statuses = new List<StatusDefinition>();

        [JsonProperty("units")]
        public List<UnitDefinition> Units = new List<UnitDefinition>();

        [JsonProperty("instructions")]
        public List<InstructionDefinition> Instructions = new List<InstructionDefinition>();

        [JsonProperty("conditions")]
        public List<ConditionDefinition> Conditions = new List<ConditionDefinition>();

        [JsonProperty("encounters")]
        public List<EncounterDefinition> Encounters = new List<EncounterDefinition>();
    }

    public sealed class BattleConfig
    {
        [JsonProperty("abilityGaugeMax")]
        public double AbilityGaugeMax;

        [JsonProperty("abilityGaugeInitial")]
        public double AbilityGaugeInitial;

        [JsonProperty("abilityGaugeRegenPerSecond")]
        public double AbilityGaugeRegenPerSecond;

        [JsonProperty("lowHpThreshold")]
        public double LowHpThreshold;

        [JsonProperty("enemyLowHpThreshold")]
        public double EnemyLowHpThreshold;

        [JsonProperty("defenseDamageFactor")]
        public double DefenseDamageFactor;

        [JsonProperty("minimumKnockbackDistance")]
        public double MinimumKnockbackDistance;

        [JsonProperty("weightKnockbackFactor")]
        public double WeightKnockbackFactor;

        [JsonProperty("tankKnockbackScale")]
        public double TankKnockbackScale;
    }

    public sealed class DebugTrainingConfig
    {
        [JsonProperty("minimumDummyHp")]
        public int MinimumDummyHp;

        [JsonProperty("recoveryDelaySeconds")]
        public double RecoveryDelaySeconds;

        [JsonProperty("outsideRangeGap")]
        public double OutsideRangeGap;

        [JsonProperty("defaultPositionPresetId")]
        public string DefaultPositionPresetId = "";

        [JsonProperty("positionPresets")]
        public List<DebugPositionPresetDefinition> PositionPresets = new List<DebugPositionPresetDefinition>();

    }

    public sealed class DebugPositionPresetDefinition
    {
        [JsonProperty("id")]
        public string Id = "";

        [JsonProperty("rangeReference")]
        public string RangeReference = "";

        [JsonProperty("relation")]
        public string Relation = "";
    }

    public sealed class StatusDefinition
    {
        [JsonProperty("id")]
        public string Id = "";

        [JsonProperty("stacking")]
        public string Stacking = "";

        [JsonProperty("maxStacks")]
        public int MaxStacks;

        [JsonProperty("clearOnAction")]
        public bool ClearOnAction;

        [JsonProperty("duration")]
        public StatusDurationDefinition Duration = new StatusDurationDefinition();

        [JsonProperty("debug")]
        public StatusDebugDefinition Debug = new StatusDebugDefinition();

        [JsonProperty("visual")]
        public StatusVisualDefinition Visual = new StatusVisualDefinition();

        [JsonProperty("effects")]
        public List<StatusEffectDefinition> Effects = new List<StatusEffectDefinition>();
    }

    public sealed class StatusDurationDefinition
    {
        [JsonProperty("mode")]
        public string Mode = "";

        [JsonProperty("sourceInstructionId")]
        public string SourceInstructionId = "";

        [JsonProperty("parameter")]
        public string Parameter = "";
    }

    public sealed class StatusDebugDefinition
    {
        [JsonProperty("control")]
        public string Control = "";

        [JsonProperty("min")]
        public double? Min;

        [JsonProperty("max")]
        public double? Max;
    }

    public sealed class StatusVisualDefinition
    {
        [JsonProperty("className")]
        public string ClassName = "";

        [JsonProperty("cardClass")]
        public string CardClass = "";

        [JsonProperty("chipClass")]
        public string ChipClass = "";

        [JsonProperty("label")]
        public string Label = "";
    }

    public sealed class StatusEffectDefinition
    {
        [JsonProperty("kind")]
        public string Kind = "";

        [JsonProperty("sourceInstructionId")]
        public string SourceInstructionId = "";

        [JsonProperty("parameter")]
        public string Parameter = "";

    }

    public sealed class ConditionDefinition
    {
        [JsonProperty("id")]
        public string Id = "";

        [JsonProperty("statusId")]
        public string StatusId = "";
    }

    public sealed class UnitDefinition
    {
        [JsonProperty("id")]
        public string Id = "";

        [JsonProperty("name")]
        public string Name = "";

        [JsonProperty("role")]
        public string Role = "";

        [JsonProperty("maxHp")]
        public int MaxHp;

        [JsonProperty("attack")]
        public int Attack;

        [JsonProperty("defense")]
        public int Defense;

        [JsonProperty("speed")]
        public double Speed;

        [JsonProperty("range")]
        public double Range;

        [JsonProperty("knockbackPower")]
        public double KnockbackPower;

        [JsonProperty("weight")]
        public double Weight;

        [JsonProperty("attackType")]
        public string AttackType = "";

        [JsonProperty("programLimit")]
        public int ProgramLimit;
    }

    public sealed class InstructionDefinition
    {
        [JsonProperty("id")]
        public string Id = "";

        [JsonProperty("action")]
        public string Action = "";

        [JsonProperty("abilityCost")]
        public double AbilityCost;

        [JsonProperty("defaultTarget")]
        public string DefaultTarget = "";

        [JsonProperty("targetMode")]
        public string TargetMode = "";

        [JsonProperty("appliesStatusId")]
        public string AppliesStatusId = "";

        [JsonProperty("params")]
        public ActionParameters Params = new ActionParameters();
    }

    public sealed class ActionParameters
    {
        [JsonProperty("attackScale")]
        public double? AttackScale;

        [JsonProperty("flatDamage")]
        public double? FlatDamage;

        [JsonProperty("minimumDamage")]
        public double? MinimumDamage;

        [JsonProperty("knockbackPower")]
        public double? KnockbackPower;

        [JsonProperty("fixedRange")]
        public double? FixedRange;

        [JsonProperty("statusStacks")]
        public int? StatusStacks;

        [JsonProperty("statusTargetDamageBonus")]
        public double? StatusTargetDamageBonus;

        [JsonProperty("statusTargetId")]
        public string StatusTargetId = "";

        [JsonProperty("durationSeconds")]
        public double? DurationSeconds;

        [JsonProperty("speedScale")]
        public double? SpeedScale;

        [JsonProperty("incomingDamageScale")]
        public double? IncomingDamageScale;

        [JsonProperty("incomingKnockbackScale")]
        public double? IncomingKnockbackScale;
    }

    public sealed class EncounterDefinition
    {
        [JsonProperty("id")]
        public string Id = "";

        [JsonProperty("name")]
        public string Name = "";

        [JsonProperty("enemyUnitIds")]
        public List<string> EnemyUnitIds = new List<string>();

        [JsonProperty("enemyStatScale")]
        public double EnemyStatScale;

        [JsonProperty("reward")]
        public int Reward;
    }
}
