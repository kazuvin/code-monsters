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

        var arrow = data.Units.Single(unit => unit.Id == "arrow");
        var shoulderThrow = data.Instructions.Single(instruction => instruction.Id == "shoulder-throw");
        var vulnerable = data.Statuses.Single(status => status.Id == "vulnerable");
        var revealWeakness = data.Instructions.Single(instruction => instruction.Id == "reveal-weakness");
        var pierceVulnerability = data.Instructions.Single(instruction => instruction.Id == "pierce-vulnerability");
        var slowed = data.Statuses.Single(status => status.Id == "slowed");
        var coolantShot = data.Instructions.Single(instruction => instruction.Id == "coolant-shot");
        var shatteringBlow = data.Instructions.Single(instruction => instruction.Id == "shattering-blow");
        var cornerSlowed = data.Instructions.Single(instruction => instruction.Id == "corner-slowed");
        var inspired = data.Statuses.Single(status => status.Id == "inspired");
        var tacticalSupport = data.Instructions.Single(instruction => instruction.Id == "tactical-support");
        var inspiredStrike = data.Instructions.Single(instruction => instruction.Id == "volt-inspired-strike");
        var inspiredSmash = data.Instructions.Single(instruction => instruction.Id == "wrath-inspired-smash");
        var selfInspired = data.Conditions.Single(condition => condition.Id == "selfInspired");
        var toxicCloud = data.BattleZones.Single(zone => zone.Id == "toxic-cloud");
        var toxicFlask = data.Instructions.Single(instruction => instruction.Id == "throw-toxic-flask");
        var poison = data.Statuses.Single(status => status.Id == "poison");
        var targetInRange = data.Conditions.Single(condition => condition.Id == "targetInRange");
        var actor = new FighterState { InstanceId = "arrow-1", X = 40, Range = arrow.Range, Hp = 74, MaxHp = 74 };
        var target = new FighterState { InstanceId = "enemy-1", X = 55, Range = 8, Hp = 100, MaxHp = 100 };
        if (!BattleRules.MatchesCondition(targetInRange, actor, target))
            throw new InvalidDataException("Actor-relative attack range condition did not match");
        if (BattleRules.ActionRange(actor, shoulderThrow) != 9)
            throw new InvalidDataException("Fixed contact-skill range was not preserved");
        if (Math.Abs(vulnerable.Effects.Single(effect => effect.Kind == "incomingDamageScale").Value.GetValueOrDefault() - 1.15) >= 0.0001)
            throw new InvalidDataException("Vulnerable status multiplier was not imported");
        if (!revealWeakness.Effects.Any(effect => effect.Kind == "applyStatus" && effect.StatusId == "vulnerable"))
            throw new InvalidDataException("Vulnerable status producer was not imported");
        if (!pierceVulnerability.Effects.Any(effect => effect.Kind == "consumeStatus" && effect.StatusId == "vulnerable"))
            throw new InvalidDataException("Vulnerable status consumer was not imported");
        if (Math.Abs(slowed.Effects.Single(effect => effect.Kind == "speedScale").Value.GetValueOrDefault() - 0.75) >= 0.0001)
            throw new InvalidDataException("Slowed status speed multiplier was not imported");
        if (!coolantShot.Effects.Any(effect => effect.Kind == "applyStatus" && effect.StatusId == "slowed" && effect.DurationSeconds == 5))
            throw new InvalidDataException("Slowed status producer was not imported");
        if (!shatteringBlow.Effects.Any(effect => effect.Kind == "consumeStatus" && effect.StatusId == "slowed"))
            throw new InvalidDataException("Bastion slowed status consumer was not imported");
        if (!cornerSlowed.Effects.Any(effect => effect.Kind == "consumeStatus" && effect.StatusId == "slowed"))
            throw new InvalidDataException("Relay slowed status consumer was not imported");
        if (Math.Abs(inspired.Effects.Single(effect => effect.Kind == "attackScale").Value.GetValueOrDefault() - 1.15) >= 0.0001)
            throw new InvalidDataException("Inspired status attack multiplier was not imported");
        if (!tacticalSupport.Effects.Any(effect => effect.Kind == "applyStatus" && effect.StatusId == "inspired" && effect.DurationSeconds == 6))
            throw new InvalidDataException("Inspired status producer was not imported");
        if (!inspiredStrike.Effects.Any(effect => effect.Kind == "consumeStatus" && effect.StatusId == "inspired" && effect.Target == "actor"))
            throw new InvalidDataException("Volt inspired status consumer was not imported");
        if (!inspiredSmash.Effects.Any(effect => effect.Kind == "consumeStatus" && effect.StatusId == "inspired" && effect.Target == "actor"))
            throw new InvalidDataException("Wrath inspired status consumer was not imported");
        actor.Statuses.Add(new StatusInstance { StatusId = "inspired", Stacks = 1 });
        if (!BattleRules.MatchesCondition(selfInspired, actor, target))
            throw new InvalidDataException("Actor-owned inspired condition did not match an enemy target");
        if (toxicCloud.TargetFilter != "any" || toxicCloud.Trigger.Effects.Single().StatusId != "poison")
            throw new InvalidDataException("Generic battle zone trigger was not imported");
        if (!toxicFlask.Effects.Any(effect => effect.Kind == "placeZone" && effect.ZoneId == "toxic-cloud"))
            throw new InvalidDataException("Battle zone placement skill was not imported");
        if (!BattleRules.PathEntersZone(20, 80, 50, toxicCloud.Radius))
            throw new InvalidDataException("Battle zone path entry parity failed");
        if (data.Battle.StatusDamageTickSeconds != 1 || poison.Effects.Single().Kind != "damagePerSecond")
            throw new InvalidDataException("Periodic poison damage was not imported");

        Console.WriteLine(
            $"{{\"schemaVersion\":{data.SchemaVersion},\"encounters\":{data.Encounters.Count},\"units\":{data.Units.Count},\"instructions\":{data.Instructions.Count},\"goldenCases\":{checkedCases}}}"
        );
        return 0;
    }
}
