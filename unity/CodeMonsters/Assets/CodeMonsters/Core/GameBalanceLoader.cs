using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using UnityEngine;

namespace CodeMonsters.Core
{
    public static class GameBalanceLoader
    {
        public const int SupportedSchemaVersion = 6;

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

            var unitIds = new HashSet<string>();
            foreach (var unit in data.Units)
                if (!unitIds.Add(unit.Id))
                    throw new InvalidDataException($"Duplicate unit id: {unit.Id}");

            var instructionIds = new HashSet<string>();
            foreach (var instruction in data.Instructions)
                if (!instructionIds.Add(instruction.Id))
                    throw new InvalidDataException($"Duplicate instruction id: {instruction.Id}");

            foreach (var encounter in data.Encounters)
            {
                if (encounter.EnemyUnitIds.Count != 3)
                    throw new InvalidDataException($"Encounter {encounter.Id} must contain three enemies");
                foreach (var unitId in encounter.EnemyUnitIds)
                    if (!unitIds.Contains(unitId))
                        throw new InvalidDataException($"Encounter {encounter.Id} references unknown unit {unitId}");
            }
        }
    }
}
