# Unity migration architecture

The prototype now separates game definitions, deterministic rules, and rendering. Unity cannot reuse the TypeScript runtime directly, but it can import the same data and port the small core modules one by one without translating React behavior.

## Source of truth

`game-data/game-balance.json` owns every adjustable gameplay value:

- unit stats, rarity, price, role, attack type, and program capacity
- target selectors, condition compatibility, instruction target modes, effects, movement, damage, knockback, healing, and buffs
- fixed reactions and default programs
- battle timing, walls, cooldowns, ability-gauge capacity/regeneration, damage/knockback formulas, overheat, debug-training recovery, economy, and shop weights
- static-analysis weights and allowed balance spreads

Stable IDs such as `nearestEnemy`, `nearestAlly`, `criticalAlly`, and `targetInRange` are saved and evaluated. Japanese copy is display data only. This avoids coupling Unity rules to localization.

For Unity, import the JSON with Newtonsoft Json.NET (or a custom importer) and generate ScriptableObjects if inspector editing is preferred. Keep JSON as the canonical reviewed asset; generated ScriptableObjects should not become a second source of truth.

## Module boundary

| TypeScript | Unity destination | Responsibility |
| --- | --- | --- |
| `src/core/combat.ts` | `CombatResolver.cs` | damage and knockback math |
| `src/core/statuses.ts` | `BattleRules.cs` / future `StatusRuntime.cs` | generic status instances, stacking, duration, effects, and visual metadata lookup |
| `src/core/rules.ts` | `BattleRules.cs` | target selection, per-target condition matching, cooldowns, movement, action effects |
| `src/core/battle-engine.ts` | `BattleEngine.cs` | deterministic frame planning and serializable battle steps |
| `src/core/roster.ts` | `RosterFactory.cs` | inventory units and battle-state construction |
| `src/core/shop.ts` | `ShopGenerator.cs` | seeded shop generation |
| `src/core/balance.ts` | editor/CLI validation | reference validation and power scoring |
| `src/core/debug-simulation.ts` | editor test harness | deterministic single-action and timeline measurements using the live frame planner |
| `src/App.tsx`, `src/BattleScene.tsx` | MonoBehaviours/UI Toolkit | orchestration, animation, audio, and presentation only |

`BattleStep` contains only plain values: a visual event, optional log and damage events, and fighter field updates. Damage events carry the acting unit, stable action ID, actual HP damage, and whether the source was a normal instruction or reaction. There are no closures in the core queue. Unity can mirror this with serializable structs and let animation and report code consume events independently of the simulation.

The debug-room harness constructs a plain two-fighter/program input and advances `planBattleFrame` on a virtual clock. Its start-distance presets come from `debugTraining.positionPresets`, while every configurable status is generated from the canonical top-level `statuses` registry; the same status runtime applies to the attacker and dummy. It preserves movement and status updates in serializable playback frames, clamps the dummy to `debugTraining.minimumDummyHp`, and restores only its HP after `debugTraining.recoveryDelaySeconds`; Reset recreates the configured initial fighters. Unit stat and state overrides remain harness inputs rather than presentation-only modifiers. It derives per-hit damage independent of remaining dummy HP, DPS, resource efficiency, healing, maximum displacement, state stacks, recovery count, and skip reasons from normal battle outputs. Port the harness as an editor tool rather than duplicating combat formulas in Unity UI code; matching harness results provide a practical parity check during migration.

## Suggested port order

1. Define C# DTOs matching `game-balance.json` and reject unsupported `schemaVersion` values.
2. Port combat math and its tests with the same fixture values.
3. Port condition/target selection and roster construction.
4. Port `planBattleFrame` and compare serialized step snapshots between TypeScript and C#.
5. Build Unity presentation from battle-step events; do not move rules into MonoBehaviours.
6. Keep `pnpm balance:check` available until the analyzer itself is ported to an editor tool or .NET CLI.

When adding a parameter, add it under an instruction's `params` or a named configuration section, update the TypeScript type, add a focused test, then mirror the DTO in Unity. Add statuses once to the top-level `statuses` registry with their debug control and visual metadata; runtime fighters store only generic status instances. The web controls and status chips are generated from the registry, and `pnpm verify` checks every unit, status, position preset, and instruction. Unsupported status effects, duration modes, actions, conditions, or target structures fail validation rather than being silently omitted. Breaking schema changes require a `schemaVersion` increment and migration note.

## Schema version 2 migration

Normal-program blocks now serialize `{ targetId, conditionId, actionId }`. Instructions add `defaultTarget`, `targetMode`, and `compatibleTargets`; conditions add `compatibleTargets`; and `targetSelectors` defines the selectable subject slots. Importers upgrading version 1 saves should derive `targetId` from the instruction's version 2 `defaultTarget` before validating the block. Conditions now return the matching subset of selected fighters, so a future multi-target action can consume the full array without changing the program schema.

## Schema version 3 migration

Rename the version 2 target selector ID `currentEnemy` to `nearestEnemy`. Version 3 also adds `nearestAlly` and `criticalAlly`; ally selectors other than `allAllies` exclude the acting unit because `self` remains a separate explicit target.

## Schema version 4 migration

Rename the version 3 condition IDs `enemyInRange` and `enemyOutOfRange` to `targetInRange` and `targetOutOfRange`. Both conditions always measure from the unit executing the program to the selected target, and they now support ally selectors as well as enemy selectors. Remove `allyHpBelow50` and `battle.allyLowHpThreshold`; ally-target programs choose between the acting unit's in-range and out-of-range conditions. The `emergency-repair` instruction was also removed, leaving `field-repair` as the single healing instruction.

## Schema version 5 migration

Add `abilityCost` to every instruction and add `abilityGaugeMax`, `abilityGaugeInitial`, and `abilityGaugeRegenPerSecond` under `battle`. Runtime fighter state now includes `abilityGauge`. Regenerate it by elapsed battle time, cap it at the configured maximum, and deduct the instruction cost only when an action or reaction is committed. If a normal-program instruction cannot afford its cost, continue evaluating later blocks so free attacks and movement can remain fallbacks. Reactions with insufficient gauge do not fire or consume their reaction cooldown. Add `balanceAnalysis.abilityReferenceSpeed` when importing the analyzer configuration.

Instructions may also define the optional `params.fixedRange` value. Use it as the action's execution range instead of the acting unit's attack range; the `targetInRange` and `targetOutOfRange` conditions continue to describe the acting unit's own attack range. This keeps close-contact skills such as throws independent from the weapon range while preserving range-condition save semantics.

## Schema version 6 migration

Add the ordered `encounters` array. Each entry owns its stable ID, player-facing briefing, enemy unit IDs, enemy stat scale, and victory reward. The current round selects one encounter; defeat retries the same encounter without a reward, while victory advances to the next entry. Importers should keep `roster.enemyUnitIds` only as a legacy/default fallback and use `encounters` for the playable run. The prototype's standard battle contract is three starting allies against three encounter enemies; loaders reject default or encounter rosters with a different count.

## Schema version 7 migration

Move status definitions from `debugTraining.statuses` to the canonical top-level `statuses` registry. Each definition owns a stable ID, stacking and duration behavior, optional typed effects, debug controls, and presentation metadata. Instructions that apply a state now reference it through `appliesStatusId`; status-sensitive conditions and damage modifiers reference a `statusId`. Runtime fighter state replaces poison, guard, berserk, and taunt-specific fields with a serializable `statuses` array containing `{ statusId, stacks, remainingSeconds, sourceId, targetId }`.

Importers must reject unknown status IDs and new unsupported effect or duration kinds. Debug tools should enumerate the registry instead of maintaining a separate status list. This makes data-only additions visible in the debug room and causes structural additions that require runtime work to fail CI until both TypeScript and Unity loaders support them.

## Executable migration spike

`unity/CodeMonsters` is a minimal Unity 6 project that proves the first migration boundary without introducing a second balance-data source. It reads the repository's canonical `game-data/game-balance.json` at EditMode test time and currently ports:

- schema-v7 DTO loading and stable-ID/reference validation, including the canonical status registry
- actor-relative range and condition evaluation, including fixed-range contact skills
- damage and knockback math
- plain C# contracts for program blocks, decision traces, battle steps, and replay frames

The TypeScript and C# combat resolvers both execute `game-data/golden/combat-cases.json`. Add formula edge cases to that shared fixture before expanding either implementation.

The license-independent smoke gate compiles the same C# source with the Roslyn/Mono toolchain bundled in Unity and executes the shared fixtures:

```bash
pnpm test:unity-core
```

Run the spike with the pinned local editor:

```bash
UNITY=/Applications/Unity/Hub/Editor/6000.3.16f1/Unity.app/Contents/MacOS/Unity
"$UNITY" -batchmode -nographics -projectPath unity/CodeMonsters \
  -runTests -testPlatform EditMode -testResults /tmp/code-monsters-unity-tests.xml -quit
```

This spike deliberately stops before porting the full frame planner. The next Unity increment should implement target selection and roster construction, then compare serialized `BattleStep` snapshots from both runtimes before any scene or MonoBehaviour owns combat rules.
