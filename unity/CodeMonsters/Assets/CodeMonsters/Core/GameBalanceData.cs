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

        [JsonProperty("units")]
        public List<UnitDefinition> Units = new List<UnitDefinition>();

        [JsonProperty("instructions")]
        public List<InstructionDefinition> Instructions = new List<InstructionDefinition>();

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
