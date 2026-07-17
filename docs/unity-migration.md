# Unity migration architecture

The prototype now separates game definitions, deterministic rules, and rendering. Unity cannot reuse the TypeScript runtime directly, but it can import the same data and port the small core modules one by one without translating React behavior.

## Source of truth

`game-data/game-balance.json` owns every adjustable gameplay value:

- unit stats, rarity, price, role, attack type, and program capacity
- target selectors, condition compatibility, instruction target modes, effects, movement, damage, knockback, healing, and buffs
- fixed reactions and default programs
- battle timing, walls, cooldowns, ability-gauge capacity/regeneration, damage/knockback formulas, overheat, economy, and shop weights
- static-analysis weights and allowed balance spreads

Stable IDs such as `nearestEnemy`, `nearestAlly`, `criticalAlly`, and `targetInRange` are saved and evaluated. Japanese copy is display data only. This avoids coupling Unity rules to localization.

For Unity, import the JSON with Newtonsoft Json.NET (or a custom importer) and generate ScriptableObjects if inspector editing is preferred. Keep JSON as the canonical reviewed asset; generated ScriptableObjects should not become a second source of truth.

## Module boundary

| TypeScript | Unity destination | Responsibility |
| --- | --- | --- |
| `src/core/combat.ts` | `CombatResolver.cs` | damage and knockback math |
| `src/core/rules.ts` | `BattleRules.cs` | target selection, per-target condition matching, cooldowns, movement, action effects |
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

## Schema version 2 migration

Normal-program blocks now serialize `{ targetId, conditionId, actionId }`. Instructions add `defaultTarget`, `targetMode`, and `compatibleTargets`; conditions add `compatibleTargets`; and `targetSelectors` defines the selectable subject slots. Importers upgrading version 1 saves should derive `targetId` from the instruction's version 2 `defaultTarget` before validating the block. Conditions now return the matching subset of selected fighters, so a future multi-target action can consume the full array without changing the program schema.

## Schema version 3 migration

Rename the version 2 target selector ID `currentEnemy` to `nearestEnemy`. Version 3 also adds `nearestAlly` and `criticalAlly`; ally selectors other than `allAllies` exclude the acting unit because `self` remains a separate explicit target.

## Schema version 4 migration

Rename the version 3 condition IDs `enemyInRange` and `enemyOutOfRange` to `targetInRange` and `targetOutOfRange`. Both conditions always measure from the unit executing the program to the selected target, and they now support ally selectors as well as enemy selectors. Remove `allyHpBelow50` and `battle.allyLowHpThreshold`; ally-target programs choose between the acting unit's in-range and out-of-range conditions. The `emergency-repair` instruction was also removed, leaving `field-repair` as the single healing instruction.

## Schema version 5 migration

Add `abilityCost` to every instruction and add `abilityGaugeMax`, `abilityGaugeInitial`, and `abilityGaugeRegenPerSecond` under `battle`. Runtime fighter state now includes `abilityGauge`. Regenerate it by elapsed battle time, cap it at the configured maximum, and deduct the instruction cost only when an action or reaction is committed. If a normal-program instruction cannot afford its cost, continue evaluating later blocks so free attacks and movement can remain fallbacks. Reactions with insufficient gauge do not fire or consume their reaction cooldown. Add `balanceAnalysis.abilityReferenceSpeed` when importing the analyzer configuration.
