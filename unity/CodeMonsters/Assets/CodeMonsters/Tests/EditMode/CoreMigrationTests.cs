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
            Assert.That(data.SchemaVersion, Is.EqualTo(18));
            Assert.That(data.Battle.TeamSize, Is.EqualTo(1));
            Assert.That(data.Battle.BaseActionLockSeconds, Is.GreaterThan(0));
            Assert.That(data.Battle.BaseActionWindupSeconds, Is.GreaterThan(0));
            Assert.That(data.Battle.MinimumActionWindupSeconds, Is.GreaterThan(0));
            Assert.That(data.Battle.MinimumInstructionCooldownSeconds, Is.GreaterThan(0));
            Assert.That(data.Battle.StatusDamageTickSeconds, Is.EqualTo(2));
            Assert.That(data.DebugTraining.MinimumDummyHp, Is.EqualTo(1));
            Assert.That(data.DebugTraining.RecoveryDelaySeconds, Is.EqualTo(3));
            Assert.That(data.DebugTraining.PositionPresets, Has.Count.EqualTo(3));
            Assert.That(data.Statuses.Select(status => status.Id), Does.Contain("poison"));
            var poison = data.Statuses.Single(status => status.Id == "poison");
            Assert.That(poison.MaxStacks, Is.Null);
            Assert.That(poison.Effects.Select(effect => effect.Kind), Does.Contain("damagePerSecond"));
            Assert.That(poison.Effects.Select(effect => effect.Kind), Does.Not.Contain("decayStacksPerTick"));
            Assert.That(data.BattleZones.Select(zone => zone.Id), Does.Contain("toxic-cloud"));
            Assert.That(data.Encounters, Has.Count.EqualTo(5));
            Assert.That(data.Encounters.All(encounter => encounter.EnemyUnitIds.Count == 1), Is.True);
            Assert.That(data.Encounters.All(encounter => encounter.EnemyEquipmentIds.Count == 3), Is.True);
            Assert.That(data.Encounters.All(encounter => encounter.EnemyProgramActionIds.Count > 0), Is.True);
            Assert.That(data.Units, Has.Count.EqualTo(3));
            Assert.That(data.Units.Select(unit => unit.Id), Is.EquivalentTo(new[] { "volt", "bastion", "relay" }));
            Assert.That(data.Instructions.All(instruction => instruction.CooldownSeconds > 0), Is.True);
        }

        [Test]
        public void BattleZoneImportsActionTriggerAndKeepsPathUtility()
        {
            var zone = data.BattleZones.Single(candidate => candidate.Id == "toxic-cloud");
            var skill = data.Instructions.Single(candidate => candidate.Id == "throw-toxic-flask");
            var effect = skill.Effects.Single(candidate => candidate.Kind == "placeZone");

            Assert.That(zone.TargetFilter, Is.EqualTo("any"));
            Assert.That(zone.Trigger.Kind, Is.EqualTo("onActionWhileInside"));
            Assert.That(zone.Trigger.Effects.Single().StatusId, Is.EqualTo("poison"));
            Assert.That(effect.ZoneId, Is.EqualTo(zone.Id));
            Assert.That(BattleRules.PathEntersZone(20, 80, 50, zone.Radius), Is.True);
            Assert.That(BattleRules.PathEntersZone(50, 80, 50, zone.Radius), Is.False);
        }

        [Test]
        public void ContactSkillKeepsFixedRangeWhileConditionUsesUnitRange()
        {
            var relay = data.Units.Single(unit => unit.Id == "relay");
            var shoulderThrow = data.Instructions.Single(instruction => instruction.Id == "shoulder-throw");
            var targetInRange = data.Conditions.Single(condition => condition.Id == "targetInRange");
            var actor = new FighterState { InstanceId = "relay-1", X = 40, Range = relay.Range, Hp = 74, MaxHp = 74 };
            var target = new FighterState { InstanceId = "enemy-1", X = 50, Range = 8, Hp = 100, MaxHp = 100 };

            Assert.That(BattleRules.MatchesCondition(targetInRange, actor, target), Is.True);
            Assert.That(BattleRules.ActionRange(actor, shoulderThrow), Is.EqualTo(9));
            Assert.That(BattleRules.DistanceTo(actor, target), Is.GreaterThan(BattleRules.ActionRange(actor, shoulderThrow)));
        }

        [Test]
        public void DuelStatusConditionsRemainActorRelative()
        {
            var actor = new FighterState { InstanceId = "volt-1", X = 40, Range = 10, Hp = 25, MaxHp = 116 };
            var enemy = new FighterState { InstanceId = "enemy-1", X = 48, Range = 10, Hp = 80, MaxHp = 100 };
            enemy.Statuses.Add(new StatusInstance { StatusId = "poison", Stacks = 2 });
            var targetInRange = data.Conditions.Single(candidate => candidate.Id == "targetInRange");
            var enemyHasStatus = data.Conditions.Single(candidate => candidate.Id == "enemyHasStatus");
            var selfHpBelow = data.Conditions.Single(candidate => candidate.Id == "selfHpBelow30");
            var selfInspired = data.Conditions.Single(candidate => candidate.Id == "selfInspired");
            actor.Statuses.Add(new StatusInstance { StatusId = "inspired", Stacks = 1 });

            Assert.That(BattleRules.MatchesCondition(targetInRange, actor, enemy), Is.True);
            Assert.That(BattleRules.MatchesCondition(enemyHasStatus, actor, enemy), Is.True);
            Assert.That(BattleRules.MatchesCondition(selfHpBelow, actor, actor), Is.True);
            Assert.That(BattleRules.MatchesCondition(selfInspired, actor, enemy), Is.True);
        }

        [Test]
        public void AirborneConditionsAndAltitudeRequirementsImport()
        {
            var actor = new FighterState
            {
                InstanceId = "volt-1",
                Hp = 100,
                MaxHp = 100,
                AirborneRemainingSeconds = 1.2,
            };
            var enemy = new FighterState { InstanceId = "enemy-1", Hp = 100, MaxHp = 100 };
            var selfAirborne = data.Conditions.Single(candidate => candidate.Id == "selfAirborne");
            var targetGrounded = data.Conditions.Single(candidate => candidate.Id == "targetGrounded");
            var diveStrike = data.Instructions.Single(candidate => candidate.Id == "dive-strike");

            Assert.That(BattleRules.MatchesCondition(selfAirborne, actor, enemy), Is.True);
            Assert.That(BattleRules.MatchesCondition(targetGrounded, actor, enemy), Is.True);
            Assert.That(BattleRules.InstructionAltitudeReady(diveStrike, actor, enemy), Is.True);
            Assert.That(diveStrike.Effects.Select(effect => effect.Kind), Does.Contain("land"));
        }

        [Test]
        public void EquipmentImportsTradeoffsAndGrantedActions()
        {
            Assert.That(data.Equipment.Select(item => item.Slot).Distinct(), Is.EquivalentTo(new[] { "frame", "weapon", "chip" }));
            var corrosion = data.Equipment.Single(item => item.Id == "corrosion-core");
            Assert.That(corrosion.Modifiers.Attack, Is.LessThan(0));
            Assert.That(corrosion.Modifiers.Range, Is.GreaterThan(0));
            Assert.That(corrosion.GrantsActionIds, Does.Contain("toxic-mark"));
            Assert.That(corrosion.GrantsActionIds, Does.Contain("corrosion-burst"));
            var reactive = data.Equipment.Single(item => item.Id == "reactive-servo");
            Assert.That(reactive.DefaultReaction.Trigger, Is.EqualTo("selfAttackHit"));
            Assert.That(reactive.DefaultReaction.ActionId, Is.EqualTo("volt-follow"));
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
