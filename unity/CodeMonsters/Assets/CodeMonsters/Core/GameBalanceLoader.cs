using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using UnityEngine;

namespace CodeMonsters.Core
{
    public static class GameBalanceLoader
    {
        public const int SupportedSchemaVersion = 12;

        public static string CanonicalDataPath => Path.GetFullPath(
            Path.Combine(Application.dataPath, "..", "..", "..", "game-data", "game-balance.json")
        );

        public static GameBalanceData LoadCanonical()
        {
            return Load(File.ReadAllText(CanonicalDataPath));
        }

        public static GameBalanceData Load(string json)
        {
            var data = JsonConvert.DeserializeObject<GameBalanceData>(json)
                ?? throw new InvalidDataException("game-balance.json could not be deserialized");
            Validate(data);
            return data;
        }

        public static void Validate(GameBalanceData data)
        {
            if (data.SchemaVersion != SupportedSchemaVersion)
                throw new InvalidDataException(
                    $"Unsupported game-data schema {data.SchemaVersion}; expected {SupportedSchemaVersion}"
                );
            if (data.Encounters.Count != 5)
                throw new InvalidDataException("The migration spike expects exactly five ordered encounters");
            if (data.Battle.TeamSize != 2)
                throw new InvalidDataException("The current battle contract requires two fighters per team");
            if (data.Battle.StatusDamageTickSeconds <= 0)
                throw new InvalidDataException("Status damage tick interval must be positive");
            ValidateDebugTraining(data.DebugTraining);

            var unitIds = UniqueIds(data.Units, unit => unit.Id, "unit");
            var instructionIds = UniqueIds(data.Instructions, instruction => instruction.Id, "instruction");
            var conditionIds = UniqueIds(data.Conditions, condition => condition.Id, "condition");
            var statusIds = UniqueIds(data.Statuses, status => status.Id, "status");
            var battleZoneIds = UniqueIds(data.BattleZones, zone => zone.Id, "battle zone");
            if (statusIds.Count == 0)
                throw new InvalidDataException("The canonical status registry must not be empty");

            ValidateStatuses(data.Statuses);
            ValidateBattleZones(data.BattleZones, statusIds);
            ValidateConditions(data.Conditions, statusIds);
            ValidateInstructions(data.Instructions, instructionIds, conditionIds, statusIds, battleZoneIds);
            ValidateSynergies(data, unitIds);

            foreach (var encounter in data.Encounters)
            {
                if (encounter.EnemyUnitIds.Count != data.Battle.TeamSize)
                    throw new InvalidDataException(
                        $"Encounter {encounter.Id} must contain {data.Battle.TeamSize} enemies"
                    );
                foreach (var unitId in encounter.EnemyUnitIds)
                    if (!unitIds.Contains(unitId))
                        throw new InvalidDataException($"Encounter {encounter.Id} references unknown unit {unitId}");
            }
        }

        private static HashSet<string> UniqueIds<T>(IEnumerable<T> values, System.Func<T, string> getId, string kind)
        {
            var ids = new HashSet<string>();
            foreach (var value in values)
            {
                var id = getId(value);
                if (!ids.Add(id))
                    throw new InvalidDataException($"Duplicate {kind} id: {id}");
            }
            return ids;
        }

        private static void ValidateDebugTraining(DebugTrainingConfig debug)
        {
            if (
                debug.MinimumDummyHp < 1
                || debug.RecoveryDelaySeconds <= 0
                || debug.OutsideRangeGap <= 0
                || debug.PositionPresets.Count == 0
            )
                throw new InvalidDataException("Debug training HP, recovery, and position data must be valid");
            if (!debug.PositionPresets.Exists(preset => preset.Id == debug.DefaultPositionPresetId))
                throw new InvalidDataException("Debug training default position preset is missing");
        }

        private static void ValidateStatuses(IEnumerable<StatusDefinition> statuses)
        {
            var supportedEffects = new HashSet<string>
            {
                "incomingDamageScale",
                "incomingKnockbackScale",
                "attackScale",
                "speedScale",
                "targetLock",
                "damagePerSecond",
            };
            var supportedCounterplay = new HashSet<string>
            {
                "expires",
                "clearsOnAction",
                "consumedBySkill",
                "lowHpRequirement",
            };
            foreach (var status in statuses)
            {
                if (status.Stacking != "stack" && status.Stacking != "replace")
                    throw new InvalidDataException($"Status {status.Id} has unsupported stacking behavior");
                if (status.MaxStacks < 1 || (status.Debug.Control != "toggle" && status.Debug.Control != "stacks"))
                    throw new InvalidDataException($"Status {status.Id} has invalid stack or debug configuration");
                if (
                    string.IsNullOrEmpty(status.Visual.ClassName)
                    || string.IsNullOrEmpty(status.Visual.CardClass)
                    || string.IsNullOrEmpty(status.Visual.ChipClass)
                )
                    throw new InvalidDataException($"Status {status.Id} has incomplete visual configuration");
                if (status.Duration.Mode != "persistent" && status.Duration.Mode != "application")
                    throw new InvalidDataException($"Status {status.Id} has unsupported duration behavior");
                if (status.Synergy.Mode != "combo" && status.Synergy.Mode != "standalone")
                    throw new InvalidDataException($"Status {status.Id} has unsupported synergy mode");
                if (
                    !supportedCounterplay.Contains(status.Synergy.Counterplay.Kind)
                    || string.IsNullOrEmpty(status.Synergy.Counterplay.Description)
                )
                    throw new InvalidDataException($"Status {status.Id} has invalid counterplay metadata");
                if (status.Synergy.Mode == "standalone" && string.IsNullOrEmpty(status.Synergy.StandaloneReason))
                    throw new InvalidDataException($"Standalone status {status.Id} must explain why it is standalone");
                foreach (var effect in status.Effects)
                {
                    if (!supportedEffects.Contains(effect.Kind))
                        throw new InvalidDataException($"Status {status.Id} has unsupported effect {effect.Kind}");
                    if (effect.Kind == "targetLock" && effect.Value.HasValue)
                        throw new InvalidDataException($"Status {status.Id} targetLock cannot declare a numeric value");
                    if (effect.Kind != "targetLock" && (!effect.Value.HasValue || effect.Value.Value <= 0))
                        throw new InvalidDataException($"Status {status.Id} numeric effect must own a positive value");
                    if (
                        (effect.Kind == "attackScale" || effect.Kind == "speedScale")
                        && status.Stacking != "replace"
                    )
                        throw new InvalidDataException($"Status {status.Id} has unsupported stat effect lifecycle");
                }
            }
        }

        private static void ValidateBattleZones(
            IEnumerable<BattleZoneDefinition> zones,
            HashSet<string> statusIds
        )
        {
            foreach (var zone in zones)
            {
                if (
                    string.IsNullOrEmpty(zone.Label)
                    || zone.Radius <= 0
                    || zone.DurationSeconds <= 0
                    || (zone.TargetFilter != "any" && zone.TargetFilter != "ally" && zone.TargetFilter != "enemy")
                )
                    throw new InvalidDataException($"Battle zone {zone.Id} has invalid dimensions or target filter");
                if (zone.Trigger.Kind != "onEnter" || zone.Trigger.Effects.Count == 0)
                    throw new InvalidDataException($"Battle zone {zone.Id} has unsupported or empty trigger");
                foreach (var effect in zone.Trigger.Effects)
                    if (effect.Kind != "applyStatus" || !statusIds.Contains(effect.StatusId) || effect.Stacks < 1)
                        throw new InvalidDataException($"Battle zone {zone.Id} has invalid trigger effect");
                if (string.IsNullOrEmpty(zone.Visual.ClassName) || string.IsNullOrEmpty(zone.Visual.Label))
                    throw new InvalidDataException($"Battle zone {zone.Id} has incomplete visual definition");
            }
        }

        private static void ValidateConditions(IEnumerable<ConditionDefinition> conditions, HashSet<string> statusIds)
        {
            var supportedKinds = new HashSet<string>
            {
                "always",
                "targetInRange",
                "targetOutOfRange",
                "targetHpBelow",
                "selfHpBelow",
                "targetHasStatus",
                "selfHasStatus",
            };
            foreach (var condition in conditions)
            {
                if (!supportedKinds.Contains(condition.Kind))
                    throw new InvalidDataException($"Condition {condition.Id} has unsupported kind {condition.Kind}");
                if (condition.Kind == "targetHasStatus" || condition.Kind == "selfHasStatus")
                {
                    if (!statusIds.Contains(condition.Params.StatusId))
                        throw new InvalidDataException($"Condition {condition.Id} references unknown status");
                    if (!condition.Params.MinimumStacks.HasValue || condition.Params.MinimumStacks.Value < 1)
                        throw new InvalidDataException($"Condition {condition.Id} must require positive status stacks");
                }
            }
        }

        private static void ValidateInstructions(
            IEnumerable<InstructionDefinition> instructions,
            HashSet<string> instructionIds,
            HashSet<string> conditionIds,
            HashSet<string> statusIds,
            HashSet<string> battleZoneIds
        )
        {
            var supportedKinds = new HashSet<string>
            {
                "damage",
                "move",
                "heal",
                "applyStatus",
                "consumeStatus",
                "removeStatus",
                "modifyStat",
                "placeZone",
                "wait",
            };
            var supportedRanges = new HashSet<string> { "unit", "fixed", "scaled" };
            foreach (var instruction in instructions)
            {
                if (!instructionIds.Contains(instruction.Id))
                    throw new InvalidDataException($"Unknown instruction {instruction.Id}");
                if (!conditionIds.Contains(instruction.Condition))
                    throw new InvalidDataException($"Instruction {instruction.Id} references unknown condition");
                if (!supportedRanges.Contains(instruction.Range.Mode))
                    throw new InvalidDataException($"Instruction {instruction.Id} has unsupported range mode");
                if (
                    instruction.Range.Mode != "unit"
                    && (!instruction.Range.Value.HasValue || instruction.Range.Value.Value <= 0)
                )
                    throw new InvalidDataException($"Instruction {instruction.Id} range requires a positive value");
                if (instruction.Effects.Count == 0)
                    throw new InvalidDataException($"Instruction {instruction.Id} must declare finite effects");
                foreach (var effect in instruction.Effects)
                {
                    if (!supportedKinds.Contains(effect.Kind))
                        throw new InvalidDataException($"Instruction {instruction.Id} has unsupported effect {effect.Kind}");
                    if (effect.Kind == "damage" && (!effect.AttackScale.HasValue || !effect.MinimumDamage.HasValue))
                        throw new InvalidDataException($"Instruction {instruction.Id} damage effect is incomplete");
                    if (effect.Kind == "move" && (!effect.Distance.HasValue || effect.Distance.Value <= 0))
                        throw new InvalidDataException($"Instruction {instruction.Id} move effect is incomplete");
                    if (effect.Kind == "heal" && (!effect.Amount.HasValue || effect.Amount.Value <= 0))
                        throw new InvalidDataException($"Instruction {instruction.Id} heal effect is incomplete");
                    if (
                        effect.Kind == "placeZone"
                        && (
                            !battleZoneIds.Contains(effect.ZoneId)
                            || (effect.Anchor != "actor" && effect.Anchor != "target")
                            || !effect.Offset.HasValue
                            || effect.Offset.Value < 0
                        )
                    )
                        throw new InvalidDataException($"Instruction {instruction.Id} placeZone effect is incomplete");
                    if (effect.Kind == "applyStatus" || effect.Kind == "consumeStatus" || effect.Kind == "removeStatus")
                    {
                        if (!statusIds.Contains(effect.StatusId))
                            throw new InvalidDataException($"Instruction {instruction.Id} references unknown status");
                    }
                }
            }
        }

        private static void ValidateSynergies(GameBalanceData data, HashSet<string> unitIds)
        {
            var conditions = new Dictionary<string, ConditionDefinition>();
            var zones = new Dictionary<string, BattleZoneDefinition>();
            foreach (var condition in data.Conditions)
                conditions[condition.Id] = condition;
            foreach (var zone in data.BattleZones)
                zones[zone.Id] = zone;
            foreach (var status in data.Statuses)
            {
                var producers = new List<InstructionDefinition>();
                var consumers = new List<InstructionDefinition>();
                foreach (var instruction in data.Instructions)
                {
                    foreach (var effect in instruction.Effects)
                    {
                        if (effect.Kind == "applyStatus" && effect.StatusId == status.Id)
                            producers.Add(instruction);
                        if (effect.Kind == "placeZone" && zones.TryGetValue(effect.ZoneId, out var zone))
                            foreach (var zoneEffect in zone.Trigger.Effects)
                                if (zoneEffect.StatusId == status.Id && !producers.Contains(instruction))
                                    producers.Add(instruction);
                        if (effect.Kind == "consumeStatus" && effect.StatusId == status.Id)
                            consumers.Add(instruction);
                    }
                }
                if (producers.Count == 0)
                    throw new InvalidDataException($"Status {status.Id} has no producer skill");
                if (status.Synergy.Mode == "combo" && consumers.Count == 0)
                    throw new InvalidDataException($"Combo status {status.Id} has no consumer skill");
                if (status.Synergy.Mode == "combo" && !HasStatusCondition(data.Conditions, status.Id))
                    throw new InvalidDataException($"Combo status {status.Id} has no status condition");
                if (status.Synergy.Mode == "combo" && !HasCrossUnitPath(producers, consumers, unitIds.Count))
                    throw new InvalidDataException($"Combo status {status.Id} has no cross-unit path");

                var counterplayVerified = status.Synergy.Counterplay.Kind switch
                {
                    "expires" => status.Duration.Mode == "application" && HasTimedProducer(producers, status.Id),
                    "clearsOnAction" => status.ClearOnAction,
                    "consumedBySkill" => consumers.Count > 0,
                    "lowHpRequirement" => HasLowHpProducer(producers, conditions),
                    _ => false,
                };
                if (!counterplayVerified)
                    throw new InvalidDataException($"Status {status.Id} counterplay does not match its data");
            }
        }

        private static bool HasCrossUnitPath(
            IEnumerable<InstructionDefinition> producers,
            IEnumerable<InstructionDefinition> consumers,
            int unitCount
        )
        {
            foreach (var producer in producers)
                foreach (var consumer in consumers)
                    if (
                        (!string.IsNullOrEmpty(producer.FixedFor) && !string.IsNullOrEmpty(consumer.FixedFor)
                            && producer.FixedFor != consumer.FixedFor)
                        || (unitCount > 1 && (string.IsNullOrEmpty(producer.FixedFor) || string.IsNullOrEmpty(consumer.FixedFor)))
                    )
                        return true;
            return false;
        }

        private static bool HasStatusCondition(IEnumerable<ConditionDefinition> conditions, string statusId)
        {
            foreach (var condition in conditions)
                if (
                    (condition.Kind == "targetHasStatus" || condition.Kind == "selfHasStatus")
                    && condition.Params.StatusId == statusId
                )
                    return true;
            return false;
        }

        private static bool HasTimedProducer(IEnumerable<InstructionDefinition> producers, string statusId)
        {
            foreach (var producer in producers)
                foreach (var effect in producer.Effects)
                    if (
                        effect.Kind == "applyStatus"
                        && effect.StatusId == statusId
                        && effect.DurationSeconds.HasValue
                        && effect.DurationSeconds.Value > 0
                    )
                        return true;
            return false;
        }

        private static bool HasLowHpProducer(
            IEnumerable<InstructionDefinition> producers,
            Dictionary<string, ConditionDefinition> conditions
        )
        {
            foreach (var producer in producers)
                if (
                    conditions.TryGetValue(producer.Condition, out var condition)
                    && condition.Kind == "selfHpBelow"
                    && condition.Params.Threshold.HasValue
                    && condition.Params.Threshold.Value < 1
                )
                    return true;
            return false;
        }
    }
}
