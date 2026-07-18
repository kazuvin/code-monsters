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

        [JsonProperty("label")]
        public string Label = "";

        [JsonProperty("description")]
        public string Description = "";

        [JsonProperty("stacking")]
        public string Stacking = "";

        [JsonProperty("maxStacks")]
        public int MaxStacks;

        [JsonProperty("clearOnAction")]
        public bool ClearOnAction;

        [JsonProperty("duration")]
        public StatusDurationDefinition Duration = new StatusDurationDefinition();

        [JsonProperty("synergy")]
        public StatusSynergyDefinition Synergy = new StatusSynergyDefinition();

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

    }

    public sealed class StatusSynergyDefinition
    {
        [JsonProperty("mode")]
        public string Mode = "";

        [JsonProperty("standaloneReason")]
        public string StandaloneReason = "";

        [JsonProperty("counterplay")]
        public StatusCounterplayDefinition Counterplay = new StatusCounterplayDefinition();
    }

    public sealed class StatusCounterplayDefinition
    {
        [JsonProperty("kind")]
        public string Kind = "";

        [JsonProperty("description")]
        public string Description = "";
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

        [JsonProperty("value")]
        public double? Value;
    }

    public sealed class ConditionDefinition
    {
        [JsonProperty("id")]
        public string Id = "";

        [JsonProperty("label")]
        public string Label = "";

        [JsonProperty("kind")]
        public string Kind = "";

        [JsonProperty("params")]
        public ConditionParameters Params = new ConditionParameters();
    }

    public sealed class ConditionParameters
    {
        [JsonProperty("threshold")]
        public double? Threshold;

        [JsonProperty("statusId")]
        public string StatusId = "";

        [JsonProperty("minimumStacks")]
        public int? MinimumStacks;
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

        [JsonProperty("title")]
        public string Title = "";

        [JsonProperty("action")]
        public string Action = "";

        [JsonProperty("condition")]
        public string Condition = "";

        [JsonProperty("target")]
        public string Target = "";

        [JsonProperty("fixedFor")]
        public string FixedFor = "";

        [JsonProperty("abilityCost")]
        public double AbilityCost;

        [JsonProperty("defaultTarget")]
        public string DefaultTarget = "";

        [JsonProperty("targetMode")]
        public string TargetMode = "";

        [JsonProperty("range")]
        public InstructionRangeDefinition Range = new InstructionRangeDefinition();

        [JsonProperty("effects")]
        public List<InstructionEffectDefinition> Effects = new List<InstructionEffectDefinition>();
    }

    public sealed class InstructionRangeDefinition
    {
        [JsonProperty("mode")]
        public string Mode = "";

        [JsonProperty("value")]
        public double? Value;
    }

    public sealed class InstructionEffectDefinition
    {
        [JsonProperty("kind")]
        public string Kind = "";

        [JsonProperty("mode")]
        public string Mode = "";

        [JsonProperty("target")]
        public string Target = "";

        [JsonProperty("statusId")]
        public string StatusId = "";

        [JsonProperty("stat")]
        public string Stat = "";

        [JsonProperty("attackScale")]
        public double? AttackScale;

        [JsonProperty("flatDamage")]
        public double? FlatDamage;

        [JsonProperty("damageScale")]
        public double? DamageScale;

        [JsonProperty("minimumDamage")]
        public double? MinimumDamage;

        [JsonProperty("knockbackPower")]
        public double? KnockbackPower;

        [JsonProperty("distance")]
        public double? Distance;

        [JsonProperty("amount")]
        public double? Amount;

        [JsonProperty("supportAmount")]
        public double? SupportAmount;

        [JsonProperty("stacks")]
        public int? Stacks;

        [JsonProperty("durationSeconds")]
        public double? DurationSeconds;

        [JsonProperty("bonusDamage")]
        public double? BonusDamage;
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
