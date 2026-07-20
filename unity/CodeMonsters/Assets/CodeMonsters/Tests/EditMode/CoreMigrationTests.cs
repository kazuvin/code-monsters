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
        public void CanonicalSpatialDataLoadsFiveEncounterRun()
        {
            Assert.That(data.SchemaVersion, Is.EqualTo(20));
            Assert.That(data.Battle.TeamSize, Is.EqualTo(1));
            Assert.That(data.Battle.GravityPerSecond, Is.GreaterThan(0));
            Assert.That(data.Battle.CeilingY, Is.GreaterThan(data.Battle.FloorY));
            Assert.That(data.Battle.FighterRadius, Is.GreaterThan(0));
            Assert.That(data.DebugTraining.PositionPresets.All(preset => preset.Distance > 0), Is.True);
            Assert.That(data.Statuses.Select(status => status.Id), Does.Contain("poison"));
            Assert.That(data.BattleZones.Select(zone => zone.Id), Does.Contain("corrosion-field"));
            Assert.That(data.Encounters, Has.Count.EqualTo(5));
            Assert.That(data.Encounters.All(encounter => encounter.EnemyUnitIds.Count == 1), Is.True);
            Assert.That(data.Encounters.All(encounter => encounter.EnemyEquipmentIds.Count == 3), Is.True);
            Assert.That(data.Units.Select(unit => unit.Id), Is.EquivalentTo(new[] { "volt", "bastion", "relay" }));
            Assert.That(data.Instructions.All(instruction => instruction.CooldownSeconds > 0), Is.True);
            Assert.That(data.Instructions.All(instruction => instruction.Delivery == null || instruction.Delivery.Kind != ""), Is.True);
        }

        [Test]
        public void ConditionsUseContinuousPositionAndVelocity()
        {
            var actor = new FighterState { InstanceId = "volt-1", X = 40, Y = 9, VY = -5, Hp = 25, MaxHp = 116 };
            var enemy = new FighterState { InstanceId = "enemy-1", X = 46, Y = 17, Hp = 80, MaxHp = 100 };
            enemy.Statuses.Add(new StatusInstance { StatusId = "poison", Stacks = 2 });
            actor.Statuses.Add(new StatusInstance { StatusId = "inspired", Stacks = 1 });

            Assert.That(BattleRules.DistanceTo(actor, enemy), Is.EqualTo(10).Within(0.0001));
            Assert.That(BattleRules.MatchesCondition(data.Conditions.Single(value => value.Id == "targetNear12"), actor, enemy), Is.True);
            Assert.That(BattleRules.MatchesCondition(data.Conditions.Single(value => value.Id == "targetFar12"), actor, enemy), Is.False);
            Assert.That(BattleRules.MatchesCondition(data.Conditions.Single(value => value.Id == "selfHeightAbove8"), actor, enemy), Is.True);
            Assert.That(BattleRules.MatchesCondition(data.Conditions.Single(value => value.Id == "targetHeightAbove8"), actor, enemy), Is.True);
            Assert.That(BattleRules.MatchesCondition(data.Conditions.Single(value => value.Id == "selfDescending"), actor, enemy), Is.True);
            Assert.That(BattleRules.MatchesCondition(data.Conditions.Single(value => value.Id == "enemyHasStatus"), actor, enemy), Is.True);
            Assert.That(BattleRules.MatchesCondition(data.Conditions.Single(value => value.Id == "selfInspired"), actor, enemy), Is.True);
        }

        [Test]
        public void InfiniteHeightBoxUsesActualCoordinates()
        {
            var instruction = data.Instructions.Single(value => value.Id == "vertical-lance");
            var actor = new FighterState { InstanceId = "volt-1", Team = "ally", X = 40, Y = 0 };
            var target = new FighterState { InstanceId = "enemy-1", Team = "enemy", X = 55, Y = 42 };
            var shape = BattleRules.ResolveAttackShape(instruction, actor, target);

            Assert.That(shape.Kind, Is.EqualTo("box"));
            Assert.That(shape.X, Is.EqualTo(50));
            Assert.That(shape.Width, Is.EqualTo(20));
            Assert.That(shape.Height, Is.Null);
            Assert.That(BattleRules.ShapeIntersectsFighter(shape, target, data.Battle.FighterRadius), Is.True);
            target.X = 70;
            Assert.That(BattleRules.ShapeIntersectsFighter(shape, target, data.Battle.FighterRadius), Is.False);
        }

        [Test]
        public void DirectAndHomingProjectilesAdvanceOnTheirOwnClock()
        {
            var directInstruction = data.Instructions.Single(value => value.Id == "pulse-bolt");
            var homingInstruction = data.Instructions.Single(value => value.Id == "seeker-orb");
            var actor = new FighterState { InstanceId = "volt-1", Team = "ally", X = 20, Y = 0, Hp = 100 };
            var target = new FighterState { InstanceId = "enemy-1", Team = "enemy", X = 60, Y = 0, Hp = 100 };
            var direct = BattleRules.CreateProjectile(directInstruction.Delivery, actor, target, data.Battle);
            var directAdvanced = BattleRules.AdvanceProjectile(direct, target, data.Battle, 0.5);
            Assert.That(directAdvanced.X, Is.GreaterThan(direct.X));
            Assert.That(directAdvanced.VY, Is.EqualTo(direct.VY).Within(0.0001));

            var homing = BattleRules.CreateProjectile(homingInstruction.Delivery, actor, target, data.Battle);
            target.X = 35;
            target.Y = 30;
            var curved = BattleRules.AdvanceProjectile(homing, target, data.Battle, 0.25);
            Assert.That(curved.VY, Is.GreaterThan(homing.VY));

            var sweptStart = new ProjectileState { X = 40, Y = 0, Radius = 2 };
            var sweptEnd = new ProjectileState { X = 60, Y = 0, Radius = 2 };
            target.X = 50;
            target.Y = 0;
            Assert.That(BattleRules.ProjectileIntersects(sweptStart, sweptEnd, target, data.Battle.FighterRadius), Is.True);
        }

        [Test]
        public void GravityProducesAnArcWithoutAirborneState()
        {
            var fighter = new FighterState
            {
                InstanceId = "volt-1",
                Team = "ally",
                X = 40,
                Y = data.Battle.FloorY,
                VX = 14,
                VY = 30,
                GravityScale = 1,
            };
            var rising = BattleRules.TickMotion(fighter, data.Battle, 0.5);
            Assert.That(rising.X, Is.GreaterThan(fighter.X));
            Assert.That(rising.Y, Is.GreaterThan(fighter.Y));
            Assert.That(rising.VY, Is.LessThan(fighter.VY));

            var current = rising;
            for (var index = 0; index < 100 && current.Y > data.Battle.FloorY; index++)
                current = BattleRules.TickMotion(current, data.Battle, 0.1);
            Assert.That(current.Y, Is.EqualTo(data.Battle.FloorY));
            Assert.That(current.VY, Is.EqualTo(0));
        }

        [Test]
        public void CorrosionFieldImportsTwoDimensionalPlacement()
        {
            var zone = data.BattleZones.Single(candidate => candidate.Id == "corrosion-field");
            var skill = data.Instructions.Single(candidate => candidate.Id == "corrosion-field");
            var effect = skill.Effects.Single(candidate => candidate.Kind == "placeZone");

            Assert.That(zone.Trigger.Kind, Is.EqualTo("onActionWhileInside"));
            Assert.That(zone.Trigger.Effects.Single().StatusId, Is.EqualTo("poison"));
            Assert.That(effect.ZoneId, Is.EqualTo(zone.Id));
            Assert.That(effect.OffsetX, Is.EqualTo(0));
            Assert.That(effect.OffsetY, Is.EqualTo(0));
            Assert.That(skill.Delivery.Kind, Is.EqualTo("lob"));
            var actor = new FighterState { InstanceId = "volt-1", Team = "ally", X = 20, Y = 0, Hp = 100 };
            var target = new FighterState { InstanceId = "enemy-1", Team = "enemy", X = 60, Y = 30, Hp = 100 };
            var lob = BattleRules.CreateProjectile(skill.Delivery, actor, target, data.Battle);
            var previous = lob;
            var impactX = lob.X;
            var landed = false;
            for (var index = 0; index < 40 && !landed; index++)
            {
                var next = BattleRules.AdvanceProjectile(previous, target, data.Battle, data.Battle.TickSeconds);
                landed = BattleRules.ProjectileHitsFloor(previous, next, data.Battle.FloorY);
                if (landed)
                    impactX = BattleRules.ProjectileFloorImpactX(previous, next, data.Battle.FloorY);
                previous = next;
            }
            Assert.That(lob.Trajectory, Is.EqualTo("ballistic"));
            Assert.That(landed, Is.True);
            Assert.That(impactX, Is.EqualTo(target.X).Within(1));
            Assert.That(BattleRules.PathEntersZone(20, 0, 80, 0, 50, 0, zone.Radius), Is.True);
            Assert.That(BattleRules.PathEntersZone(50, 0, 80, 0, 50, 0, zone.Radius), Is.False);
        }

        [Test]
        public void EquipmentImportsNewSpatialSkillSet()
        {
            var corrosion = data.Equipment.Single(item => item.Id == "corrosion-core");
            Assert.That(corrosion.Modifiers.Attack, Is.LessThan(0));
            Assert.That(corrosion.GrantsActionIds, Does.Contain("toxin-orb"));
            Assert.That(corrosion.GrantsActionIds, Does.Contain("corrosion-column"));
            Assert.That(corrosion.GrantsActionIds, Does.Contain("corrosion-field"));
            var reactive = data.Equipment.Single(item => item.Id == "reactive-servo");
            Assert.That(reactive.DefaultReaction.Trigger, Is.EqualTo("selfAttackHit"));
            Assert.That(reactive.DefaultReaction.ActionId, Is.EqualTo("counter-orb"));
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
                Assert.That(actual.KnockbackDistance, Is.EqualTo(testCase.Expected.KnockbackDistance).Within(0.0001), testCase.Id);
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
