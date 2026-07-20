using System;
using System.IO;
using System.Linq;
using CodeMonsters.Core;
using Newtonsoft.Json.Linq;

internal static class UnityCoreSmoke
{
    private static int Main(string[] args)
    {
        if (args.Length != 2)
            throw new ArgumentException("Expected game-balance.json and combat-cases.json paths");

        var data = GameBalanceLoader.Load(File.ReadAllText(args[0]));
        var fixture = JObject.Parse(File.ReadAllText(args[1]));
        var cases = fixture["cases"] ?? throw new InvalidDataException("Golden combat cases are missing");
        var checkedCases = 0;
        foreach (var item in cases)
        {
            var input = item["input"]?.ToObject<ImpactInput>()
                ?? throw new InvalidDataException("Golden combat input is missing");
            var expectedDamage = item["expected"]?["damage"]?.Value<int>() ?? -1;
            var expectedKnockback = item["expected"]?["knockbackDistance"]?.Value<double>() ?? -1;
            var actual = CombatResolver.Resolve(input, data.Battle);
            if (actual.Damage != expectedDamage || Math.Abs(actual.KnockbackDistance - expectedKnockback) >= 0.0001)
                throw new InvalidDataException($"Combat parity failed for {item["id"]}");
            checkedCases += 1;
        }

        if (data.Battle.TeamSize != 1 || data.Units.Count != 3)
            throw new InvalidDataException("The canonical duel and animation-scope contract was not imported");
        if (data.Encounters.Any(encounter => encounter.EnemyUnitIds.Count != 1))
            throw new InvalidDataException("An encounter is not one-on-one");
        if (data.Encounters.Any(encounter => encounter.EnemyEquipmentIds.Count != 3))
            throw new InvalidDataException("An encounter does not define three equipment bays");
        if (data.Encounters.Any(encounter => encounter.EnemyProgramActionIds.Count == 0))
            throw new InvalidDataException("An encounter does not expose its enemy program");

        var vulnerable = data.Statuses.Single(status => status.Id == "vulnerable");
        var pulseBolt = data.Instructions.Single(instruction => instruction.Id == "pulse-bolt");
        var seekerOrb = data.Instructions.Single(instruction => instruction.Id == "seeker-orb");
        var slowed = data.Statuses.Single(status => status.Id == "slowed");
        var cryoBolt = data.Instructions.Single(instruction => instruction.Id == "cryo-bolt");
        var frostColumn = data.Instructions.Single(instruction => instruction.Id == "frost-column");
        var inspired = data.Statuses.Single(status => status.Id == "inspired");
        var overclock = data.Instructions.Single(instruction => instruction.Id == "overclock");
        var energizedBolt = data.Instructions.Single(instruction => instruction.Id == "energized-bolt");
        var selfInspired = data.Conditions.Single(condition => condition.Id == "selfInspired");
        var corrosionField = data.BattleZones.Single(zone => zone.Id == "corrosion-field");
        var corrosionFieldSkill = data.Instructions.Single(instruction => instruction.Id == "corrosion-field");
        var poison = data.Statuses.Single(status => status.Id == "poison");
        var targetNear = data.Conditions.Single(condition => condition.Id == "targetNear12");
        var vectorThrust = data.Instructions.Single(instruction => instruction.Id == "vector-thrust");
        var actor = new FighterState { InstanceId = "volt-1", Team = "ally", X = 40, Y = 0, Hp = 74, MaxHp = 74 };
        var target = new FighterState { InstanceId = "enemy-1", Team = "enemy", X = 46, Y = 8, Hp = 100, MaxHp = 100 };
        if (!BattleRules.MatchesCondition(targetNear, actor, target))
            throw new InvalidDataException("Two-dimensional distance condition did not match");
        var vectorMotion = vectorThrust.Effects.Single(effect => effect.Kind == "motion");
        if (
            vectorMotion.Mode != "setVelocity"
            || vectorMotion.VerticalMode != "addVelocity"
            || vectorMotion.HorizontalBrakePerSecond != 80
            || vectorMotion.HorizontalBrakeDurationSeconds != 0.5
            || data.Battle.VerticalDisplayRangePercent != 62
        )
            throw new InvalidDataException("Controlled movement and vertical presentation data were not imported");
        var braking = new FighterState
        {
            InstanceId = "motion-1",
            Team = "ally",
            X = 40,
            Y = 0,
            VX = 40,
            VY = 12,
            HorizontalBrakePerSecond = 80,
            HorizontalBrakeRemaining = 0.5,
        };
        for (var index = 0; index < 5; index++)
            braking = BattleRules.TickMotion(braking, data.Battle, 0.1);
        if (Math.Abs(braking.X - 50) > 0.0001 || braking.VX != 0)
            throw new InvalidDataException("Controlled movement did not brake at the authored distance");
        if (Math.Abs(vulnerable.Effects.Single(effect => effect.Kind == "incomingDamageScale").Value.GetValueOrDefault() - 1.15) >= 0.0001)
            throw new InvalidDataException("Vulnerable status multiplier was not imported");
        if (!pulseBolt.Effects.Any(effect => effect.Kind == "applyStatus" && effect.StatusId == "vulnerable"))
            throw new InvalidDataException("Vulnerable status producer was not imported");
        if (!seekerOrb.Effects.Any(effect => effect.Kind == "consumeStatus" && effect.StatusId == "vulnerable"))
            throw new InvalidDataException("Vulnerable status consumer was not imported");
        if (Math.Abs(slowed.Effects.Single(effect => effect.Kind == "speedScale").Value.GetValueOrDefault() - 0.75) >= 0.0001)
            throw new InvalidDataException("Slowed status speed multiplier was not imported");
        if (!cryoBolt.Effects.Any(effect => effect.Kind == "applyStatus" && effect.StatusId == "slowed" && effect.DurationSeconds == 5))
            throw new InvalidDataException("Slowed status producer was not imported");
        if (!frostColumn.Effects.Any(effect => effect.Kind == "consumeStatus" && effect.StatusId == "slowed"))
            throw new InvalidDataException("Slowed status consumer was not imported");
        if (Math.Abs(inspired.Effects.Single(effect => effect.Kind == "attackScale").Value.GetValueOrDefault() - 1.15) >= 0.0001)
            throw new InvalidDataException("Inspired status attack multiplier was not imported");
        if (!overclock.Effects.Any(effect => effect.Kind == "applyStatus" && effect.StatusId == "inspired" && effect.DurationSeconds == 6))
            throw new InvalidDataException("Inspired status producer was not imported");
        if (!energizedBolt.Effects.Any(effect => effect.Kind == "consumeStatus" && effect.StatusId == "inspired" && effect.Target == "actor"))
            throw new InvalidDataException("Volt inspired status consumer was not imported");
        actor.Statuses.Add(new StatusInstance { StatusId = "inspired", Stacks = 1 });
        if (!BattleRules.MatchesCondition(selfInspired, actor, target))
            throw new InvalidDataException("Actor-owned inspired condition did not match an enemy target");
        if (
            corrosionField.TargetFilter != "any"
            || corrosionField.Trigger.Kind != "onActionWhileInside"
            || corrosionField.Trigger.Effects.Single().StatusId != "poison"
        )
            throw new InvalidDataException("Generic battle zone trigger was not imported");
        if (!corrosionFieldSkill.Effects.Any(effect => effect.Kind == "placeZone" && effect.ZoneId == "corrosion-field"))
            throw new InvalidDataException("Battle zone placement skill was not imported");
        if (!BattleRules.PathEntersZone(20, 0, 80, 0, 50, 0, corrosionField.Radius))
            throw new InvalidDataException("Battle zone path entry parity failed");
        var verticalLance = data.Instructions.Single(instruction => instruction.Id == "vertical-lance");
        var shape = BattleRules.ResolveAttackShape(verticalLance, actor, target);
        if (shape == null || shape.Kind != "box" || shape.Height.HasValue)
            throw new InvalidDataException("Infinite-height attack shape was not imported");
        var projectile = BattleRules.CreateProjectile(seekerOrb.Delivery, actor, target, data.Battle);
        var advanced = BattleRules.AdvanceProjectile(projectile, target, data.Battle, 0.1);
        if (advanced.X == projectile.X && advanced.Y == projectile.Y)
            throw new InvalidDataException("Projectile time did not advance");
        var corrosionFieldInstruction = data.Instructions.Single(item => item.Id == "corrosion-field");
        var lob = BattleRules.CreateProjectile(corrosionFieldInstruction.Delivery, actor, target, data.Battle);
        var previousLob = lob;
        var lobImpactX = lob.X;
        var lobLanded = false;
        for (var index = 0; index < 40 && !lobLanded; index++)
        {
            var nextLob = BattleRules.AdvanceProjectile(previousLob, target, data.Battle, data.Battle.TickSeconds);
            lobLanded = BattleRules.ProjectileHitsFloor(previousLob, nextLob, data.Battle.FloorY);
            if (lobLanded)
                lobImpactX = BattleRules.ProjectileFloorImpactX(previousLob, nextLob, data.Battle.FloorY);
            previousLob = nextLob;
        }
        if (!lobLanded || Math.Abs(lobImpactX - target.X) > 1)
            throw new InvalidDataException("Ballistic field projectile did not land at the targeted ground coordinate");
        if (
            data.Battle.StatusDamageTickSeconds != 2
            || poison.MaxStacks.HasValue
            || !poison.Effects.Any(effect => effect.Kind == "damagePerSecond" && effect.Value == 1)
            || poison.Effects.Any(effect => effect.Kind == "decayStacksPerTick")
        )
            throw new InvalidDataException("Unbounded non-decaying poison was not imported");
        var equipmentSlots = data.Equipment.Select(item => item.Slot).Distinct().OrderBy(slot => slot).ToArray();
        if (!equipmentSlots.SequenceEqual(new[] { "chip", "frame", "weapon" }))
            throw new InvalidDataException("The three equipment slot types were not imported");
        var corrosion = data.Equipment.Single(item => item.Id == "corrosion-core");
        if (
            corrosion.Modifiers.Attack.GetValueOrDefault() >= 0
            || !corrosion.GrantsActionIds.Contains("corrosion-column")
            || !corrosion.GrantsActionIds.Contains("corrosion-field")
        )
            throw new InvalidDataException("Equipment trade-off or granted actions were not imported");

        Console.WriteLine(
            $"{{\"schemaVersion\":{data.SchemaVersion},\"mode\":\"1vs1\",\"encounters\":{data.Encounters.Count},\"units\":{data.Units.Count},\"equipment\":{data.Equipment.Count},\"instructions\":{data.Instructions.Count},\"goldenCases\":{checkedCases}}}"
        );
        return 0;
    }
}
