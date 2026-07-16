# Unity migration architecture

The prototype now separates game definitions, deterministic rules, and rendering. Unity cannot reuse the TypeScript runtime directly, but it can import the same data and port the small core modules one by one without translating React behavior.

## Source of truth

`game-data/game-balance.json` owns every adjustable gameplay value:

- unit stats, rarity, price, role, attack type, and program capacity
- instruction conditions, targets, effects, movement, damage, knockback, healing, and buffs
- fixed reactions and default programs
- battle timing, walls, cooldowns, damage/knockback formulas, overheat, economy, and shop weights
- static-analysis weights and allowed balance spreads

Stable IDs such as `enemyInRange`, `nearestEnemy`, and `berserker-mode` are saved and evaluated. Japanese copy is display data only. This avoids coupling Unity rules to localization.

For Unity, import the JSON with Newtonsoft Json.NET (or a custom importer) and generate ScriptableObjects if inspector editing is preferred. Keep JSON as the canonical reviewed asset; generated ScriptableObjects should not become a second source of truth.

## Module boundary

| TypeScript | Unity destination | Responsibility |
| --- | --- | --- |
| `src/core/combat.ts` | `CombatResolver.cs` | damage and knockback math |
| `src/core/rules.ts` | `BattleRules.cs` | conditions, targets, cooldowns, movement, action effects |
| `src/core/battle-engine.ts` | `BattleEngine.cs` | deterministic frame planning and serializable battle steps |
| `src/core/roster.ts` | `RosterFactory.cs` | inventory units and battle-state construction |
| `src/core/shop.ts` | `ShopGenerator.cs` | seeded shop generation |
| `src/core/balance.ts` | editor/CLI validation | reference validation and power scoring |
| `src/App.tsx`, `src/BattleScene.tsx` | MonoBehaviours/UI Toolkit | orchestration, animation, audio, and presentation only |

`BattleStep` contains only plain values: a visual event, optional log event, and fighter field updates. There are no closures in the core queue. Unity can mirror this with serializable structs and let animation code consume the visual event independently of the simulation.

## Suggested port order

1. Define C# DTOs matching `game-balance.json` and reject unsupported `schemaVersion` values.
2. Port combat math and its tests with the same fixture values.
3. Port condition/target selection and roster construction.
4. Port `planBattleFrame` and compare serialized step snapshots between TypeScript and C#.
5. Build Unity presentation from battle-step events; do not move rules into MonoBehaviours.
6. Keep `pnpm balance:check` available until the analyzer itself is ported to an editor tool or .NET CLI.

When adding a parameter, add it under an instruction's `params` or a named configuration section, update the TypeScript type, add a focused test, then mirror the DTO in Unity. Breaking schema changes require a `schemaVersion` increment and migration note.
