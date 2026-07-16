# Power-balance check

Run:

```bash
pnpm balance:check
pnpm balance:check -- --json
```

The analyzer first validates IDs and references across the roster, shop, programs, reactions, conditions, units, and instructions. Structural errors always fail the command.

It then estimates every unit against the reference defense in `game-data/game-balance.json`:

```text
base DPS = expected normal-attack damage / action cooldown
effective HP = max HP + defense * defense weight
power = DPS, effective HP, range, knockback/second, and program capacity (weighted sum)
cost efficiency = power / unit price
```

Fixed reactions modify the corresponding estimate using the configured trigger uptime: attacks add expected DPS, guard increases effective HP, and berserker blends its ATK × SPD multiplier over the low-HP uptime. The report shows absolute power, median-relative index, and power per coin.

This is a deterministic screening model, not proof of live-match fairness. It is intentionally good at finding broken references, impossible parameters, extreme same-rarity gaps, and price-efficiency outliers. Borderline spreads are warnings and should be followed by matchup simulation or playtesting. Exceeding configured hard limits exits non-zero.

`pnpm verify` is the local completion gate. For this individual project it provides the useful part of CI without requiring GitHub Actions. If pull requests or collaborators are added later, the same command can be used unchanged in CI.
