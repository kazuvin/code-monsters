# Power-balance check

Run:

```bash
pnpm balance:check
pnpm balance:check -- --json
```

The analyzer first validates IDs and references across the one-unit roster, equipment registry, three-slot loadouts, encounter programs, shop, reactions, conditions, units, and instructions. It rejects unknown instruction-effect or condition kinds, so adding a behavior that neither runtime understands cannot silently pass as data. Structural errors always fail the command.

The same gate derives a status synergy graph from canonical data. A combo status must have a producer, a status-aware condition, a consumer, a loadout path that can own the pieces together, and a counterplay rule that matches real data (expiry, action clear, consumption, or low-HP activation). A deliberately standalone status must include its reason and a verifiable counterplay. The Debug Room's Synergy Heatmap page is a presentation of this exact report, not a separately maintained list.

For a non-blocking reference matrix, run:

```bash
pnpm synergy:report
pnpm synergy:report -- --json
```

This prints the same producer, condition, consumer, ownership-path, and counterplay counts used by the Debug Room heatmap. Coverage gaps are listed for reference but do not set a failing exit code, and this command is intentionally not part of `pnpm verify`.

It then estimates every unit against the reference defense in `game-data/game-balance.json`:

```text
base DPS = expected normal-attack damage / action cooldown
effective HP = max HP + defense * defense weight
power = DPS, effective HP, range, knockback/second, and program capacity (weighted sum)
ability recovery = ability cost / gauge regeneration per second
sustainable ability interval = max(reference action cooldown, ability recovery)
```

The ability-economy table reports each instruction's gauge cost, recovery time, sustainable interval, and uses per minute. Strong actions must have a positive integer cost no greater than the configured gauge maximum; a free strong action is a structural error. The base unit report intentionally excludes equipment so body balance and loadout balance remain distinguishable. Equipment-granted reactions and tradeoffs are covered by structural checks, core tests, and matchup playtests. The unit report shows absolute power and median-relative index; units are not sold during a run.

The in-app catalog reads the same source data and exposes all three bodies, equipment, conditions, target selectors, and instructions as comparison cards. Its ten-cell cost rulers, recovery time, and sustainable uses-per-minute values are presentation of the analyzer inputs and output; they are not separately maintained balance data.

The in-app debug room complements the static analyzer with reproducible live-engine measurements. It runs the same deterministic battle-frame planner as a normal match in a one-on-one training setup. Both units start inside each other's attack range. Movement and status changes persist so the resulting spacing and state can be inspected; only the dummy HP is clamped to the configured minimum and recovered after the configured delay. The target profile can override HP, defense, weight, role, and canonical status state; reports include per-hit damage, total damage, DPS, healing, gauge efficiency, movement, state stacks, recovery count, and decision skip reasons.

This is a deterministic screening model, not proof of live-match fairness. It is intentionally good at finding broken references, impossible parameters, extreme same-rarity gaps, and price-efficiency outliers. Borderline spreads are warnings and should be followed by matchup simulation or playtesting. Exceeding configured hard limits exits non-zero.

`pnpm verify` is the local completion gate. For this individual project it provides the useful part of CI without requiring GitHub Actions. If pull requests or collaborators are added later, the same command can be used unchanged in CI.
