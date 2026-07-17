using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using NUnit.Framework;
using UnityEngine;

namespace CodeMonsters.Core.Tests
{
    public sealed class CoreMigrationTests
    {
        private GameBalanceData data;

        [SetUp]
        public void SetUp()
        {
            data = GameBalanceLoader.LoadCanonical();
        }

        [Test]
        public void CanonicalDataLoadsFiveEncounterRun()
        {
            Assert.That(data.SchemaVersion, Is.EqualTo(6));
            Assert.That(data.Encounters, Has.Count.EqualTo(5));
            Assert.That(data.Encounters.All(encounter => encounter.EnemyUnitIds.Count == 3), Is.True);
            Assert.That(data.Units.Select(unit => unit.Id), Does.Contain("mender"));
            Assert.That(data.Units.Select(unit => unit.Id), Does.Contain("toxin"));
        }

        [Test]
        public void ContactSkillKeepsFixedRangeWhileConditionUsesUnitRange()
        {
            var arrow = data.Units.Single(unit => unit.Id == "arrow");
            var shoulderThrow = data.Instructions.Single(instruction => instruction.Id == "shoulder-throw");
            var actor = new FighterState { InstanceId = "arrow-1", X = 40, Range = arrow.Range, Hp = 74, MaxHp = 74 };
            var target = new FighterState { InstanceId = "enemy-1", X = 55, Range = 8, Hp = 100, MaxHp = 100 };

            Assert.That(BattleRules.MatchesCondition("targetInRange", actor, target, data.Battle), Is.True);
            Assert.That(BattleRules.ActionRange(actor, shoulderThrow), Is.EqualTo(9));
            Assert.That(BattleRules.DistanceTo(actor, target), Is.GreaterThan(BattleRules.ActionRange(actor, shoulderThrow)));
        }

        [Test]
        public void SupportAndStatusConditionsRemainActorRelative()
        {
            var actor = new FighterState { InstanceId = "mender-1", X = 40, Range = 14, Hp = 118, MaxHp = 118 };
            var ally = new FighterState { InstanceId = "volt-1", X = 52, Range = 10, Hp = 30, MaxHp = 116 };
            var enemy = new FighterState { InstanceId = "enemy-1", X = 54, Range = 10, Hp = 80, MaxHp = 100, Poison = 1 };

            Assert.That(BattleRules.MatchesCondition("targetInRange", actor, ally, data.Battle), Is.True);
            Assert.That(BattleRules.MatchesCondition("enemyHasStatus", actor, enemy, data.Battle), Is.True);
            Assert.That(BattleRules.MatchesCondition("selfHpBelow30", actor, ally, data.Battle), Is.False);
        }

        [Test]
        public void CombatMathMatchesSharedGoldenCases()
        {
            var fixturePath = Path.GetFullPath(
                Path.Combine(Application.dataPath, "..", "..", "..", "game-data", "golden", "combat-cases.json")
            );
            var fixture = JsonConvert.DeserializeObject<CombatFixture>(File.ReadAllText(fixturePath));
            Assert.That(fixture, Is.Not.Null);
            Assert.That(fixture.Cases, Is.Not.Empty);

            foreach (var testCase in fixture.Cases)
            {
                var actual = CombatResolver.Resolve(testCase.Input, data.Battle);
                Assert.That(actual.Damage, Is.EqualTo(testCase.Expected.Damage), testCase.Id);
                Assert.That(
                    actual.KnockbackDistance,
                    Is.EqualTo(testCase.Expected.KnockbackDistance).Within(0.0001),
                    testCase.Id
                );
            }
        }

        private sealed class CombatFixture
        {
            [JsonProperty("cases")]
            public List<CombatCase> Cases = new List<CombatCase>();
        }

        private sealed class CombatCase
        {
            [JsonProperty("id")]
            public string Id = "";

            [JsonProperty("input")]
            public ImpactInput Input = new ImpactInput();

            [JsonProperty("expected")]
            public ExpectedImpact Expected = new ExpectedImpact();
        }

        private sealed class ExpectedImpact
        {
            [JsonProperty("damage")]
            public int Damage;

            [JsonProperty("knockbackDistance")]
            public double KnockbackDistance;
        }
    }
}
