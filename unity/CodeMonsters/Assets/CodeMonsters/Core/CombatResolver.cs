using System;

namespace CodeMonsters.Core
{
    public sealed class ImpactProfile
    {
        public double? DamageScale;
        public double? KnockbackPower;
    }

    public sealed class ImpactInput
    {
        public double RawDamage;
        public double MinimumDamage;
        public string AttackType = "";
        public double AttackerKnockbackPower;
        public double TargetDefense;
        public double TargetWeight;
        public string TargetRole = "";
        public bool TargetGuarded;
        public double? GuardDamageScale;
        public double? GuardKnockbackScale;
        public ImpactProfile Impact;
    }

    public readonly struct ImpactResult
    {
        public readonly int Damage;
        public readonly double KnockbackDistance;

        public ImpactResult(int damage, double knockbackDistance)
        {
            Damage = damage;
            KnockbackDistance = knockbackDistance;
        }
    }

    public static class CombatResolver
    {
        public static ImpactResult Resolve(ImpactInput input, BattleConfig battle)
        {
            var damageScale = input.Impact?.DamageScale ?? 1;
            var guardedScale = input.TargetGuarded ? input.GuardDamageScale ?? 1 : 1;
            var baseDamage = RoundLikeJavaScript(
                (input.RawDamage - input.TargetDefense * battle.DefenseDamageFactor) * guardedScale
            );
            var damage = damageScale <= 0
                ? 0
                : Math.Max((int)input.MinimumDamage, RoundLikeJavaScript(baseDamage * damageScale));

            var defaultKnockback = input.AttackType == "sniper" ? 0 : input.AttackerKnockbackPower;
            var knockbackPower = input.Impact?.KnockbackPower ?? defaultKnockback;
            if (knockbackPower <= 0)
                return new ImpactResult(damage, 0);

            var tankScale = input.TargetRole == "TANK" ? battle.TankKnockbackScale : 1;
            var guardScale = input.TargetGuarded ? input.GuardKnockbackScale ?? 1 : 1;
            var knockbackDistance = Math.Max(
                    battle.MinimumKnockbackDistance,
                    knockbackPower - input.TargetWeight * battle.WeightKnockbackFactor
                )
                * tankScale
                * guardScale;
            return new ImpactResult(damage, knockbackDistance);
        }

        private static int RoundLikeJavaScript(double value)
        {
            return (int)Math.Floor(value + 0.5);
        }
    }
}
