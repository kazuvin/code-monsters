using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using UnityEngine;

namespace CodeMonsters.Core
{
    public static class GameBalanceLoader
    {
        public const int SupportedSchemaVersion = 7;

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
            if (
                data.DebugTraining.MinimumDummyHp < 1
                || data.DebugTraining.RecoveryDelaySeconds <= 0
                || data.DebugTraining.OutsideRangeGap <= 0
                || data.DebugTraining.PositionPresets.Count == 0
            )
                throw new InvalidDataException("Debug training HP, recovery, and position data must be valid");
            if (!data.DebugTraining.PositionPresets.Exists(preset => preset.Id == data.DebugTraining.DefaultPositionPresetId))
                throw new InvalidDataException("Debug training default position preset is missing");

            var unitIds = new HashSet<string>();
            foreach (var unit in data.Units)
                if (!unitIds.Add(unit.Id))
                    throw new InvalidDataException($"Duplicate unit id: {unit.Id}");

            var instructionIds = new HashSet<string>();
            var instructions = new Dictionary<string, InstructionDefinition>();
            foreach (var instruction in data.Instructions)
            {
                if (!instructionIds.Add(instruction.Id))
                    throw new InvalidDataException($"Duplicate instruction id: {instruction.Id}");
                instructions.Add(instruction.Id, instruction);
            }

            var supportedStatusEffects = new HashSet<string>
            {
                "incomingDamageScale",
                "incomingKnockbackScale",
                "attackScale",
                "speedScale",
                "targetLock",
            };
            var statusIds = new HashSet<string>();
            foreach (var status in data.Statuses)
            {
                if (!statusIds.Add(status.Id))
                    throw new InvalidDataException($"Duplicate status id: {status.Id}");
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
                if (status.Duration.Mode != "persistent" && status.Duration.Mode != "instructionParam")
                    throw new InvalidDataException($"Status {status.Id} has unsupported duration behavior");
                if (status.Duration.Mode == "instructionParam")
                {
                    if (!instructions.TryGetValue(status.Duration.SourceInstructionId, out var durationInstruction))
                        throw new InvalidDataException($"Status {status.Id} references unknown duration instruction");
                    if (!HasNumericParameter(durationInstruction.Params, status.Duration.Parameter))
                        throw new InvalidDataException($"Status {status.Id} references unknown duration parameter");
                }
                foreach (var effect in status.Effects)
                {
                    if (!supportedStatusEffects.Contains(effect.Kind))
                        throw new InvalidDataException($"Status {status.Id} has unsupported effect {effect.Kind}");
                    if (
                        effect.Kind != "targetLock"
                        && (string.IsNullOrEmpty(effect.SourceInstructionId) || string.IsNullOrEmpty(effect.Parameter))
                    )
                        throw new InvalidDataException($"Status {status.Id} numeric effect must reference a parameter");
                    if (
                        (effect.Kind == "attackScale" || effect.Kind == "speedScale")
                        && (status.Duration.Mode != "persistent" || status.ClearOnAction || status.Stacking != "replace")
                    )
                        throw new InvalidDataException($"Status {status.Id} has unsupported stat effect lifecycle");
                    if (!string.IsNullOrEmpty(effect.SourceInstructionId))
                    {
                        if (!instructions.TryGetValue(effect.SourceInstructionId, out var effectInstruction))
                            throw new InvalidDataException($"Status {status.Id} references unknown effect instruction");
                        if (!HasNumericParameter(effectInstruction.Params, effect.Parameter))
                            throw new InvalidDataException($"Status {status.Id} references unknown effect parameter");
                    }
                }
            }
            if (statusIds.Count == 0)
                throw new InvalidDataException("The canonical status registry must not be empty");

            foreach (var condition in data.Conditions)
                if (!string.IsNullOrEmpty(condition.StatusId) && !statusIds.Contains(condition.StatusId))
                    throw new InvalidDataException($"Condition {condition.Id} references unknown status {condition.StatusId}");

            var statusActions = new HashSet<string> { "guard", "berserk", "taunt" };
            var statusApplicationActions = new HashSet<string>
            {
                "attack",
                "heavy",
                "throw",
                "taunt",
                "guard",
                "berserk",
                "poison",
                "burn",
                "follow",
            };
            foreach (var instruction in data.Instructions)
            {
                if (statusActions.Contains(instruction.Action) && string.IsNullOrEmpty(instruction.AppliesStatusId))
                    throw new InvalidDataException($"Instruction {instruction.Id} must declare appliesStatusId");
                if (!string.IsNullOrEmpty(instruction.AppliesStatusId) && !statusIds.Contains(instruction.AppliesStatusId))
                    throw new InvalidDataException($"Instruction {instruction.Id} references unknown applied status");
                if (
                    !string.IsNullOrEmpty(instruction.AppliesStatusId)
                    && !statusApplicationActions.Contains(instruction.Action)
                )
                    throw new InvalidDataException($"Instruction {instruction.Id} has unsupported status application");
                if (!string.IsNullOrEmpty(instruction.Params.StatusTargetId) && !statusIds.Contains(instruction.Params.StatusTargetId))
                    throw new InvalidDataException($"Instruction {instruction.Id} references unknown target status");
            }

            foreach (var encounter in data.Encounters)
            {
                if (encounter.EnemyUnitIds.Count != 3)
                    throw new InvalidDataException($"Encounter {encounter.Id} must contain three enemies");
                foreach (var unitId in encounter.EnemyUnitIds)
                    if (!unitIds.Contains(unitId))
                        throw new InvalidDataException($"Encounter {encounter.Id} references unknown unit {unitId}");
            }
        }

        private static bool HasNumericParameter(ActionParameters parameters, string parameter)
        {
            return parameter switch
            {
                "attackScale" => parameters.AttackScale.HasValue,
                "flatDamage" => parameters.FlatDamage.HasValue,
                "minimumDamage" => parameters.MinimumDamage.HasValue,
                "knockbackPower" => parameters.KnockbackPower.HasValue,
                "fixedRange" => parameters.FixedRange.HasValue,
                "statusStacks" => parameters.StatusStacks.HasValue,
                "statusTargetDamageBonus" => parameters.StatusTargetDamageBonus.HasValue,
                "durationSeconds" => parameters.DurationSeconds.HasValue,
                "speedScale" => parameters.SpeedScale.HasValue,
                "incomingDamageScale" => parameters.IncomingDamageScale.HasValue,
                "incomingKnockbackScale" => parameters.IncomingKnockbackScale.HasValue,
                _ => false,
            };
        }
    }
}
