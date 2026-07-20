# Unity migration architecture

The prototype now separates game definitions, deterministic rules, and rendering. Unity cannot reuse the TypeScript runtime directly, but it can import the same data and port the small core modules one by one without translating React behavior.

## Source of truth

`game-data/game-balance.json` owns every adjustable gameplay value:

- unit-body stats, rarity, role, attack type, and program capacity
- frame, weapon, and chip equipment; stat modifiers; granted actions; and default reactions
- target selectors, condition compatibility, instruction target modes, effects, movement, damage, knockback, healing, and buffs
- fixed reactions and default programs
- ordered one-on-one encounters, including each rival's equipment loadout, program, reaction, stat scale, and reward
- team size, battle timing, walls, cooldowns, ability-gauge capacity/regeneration, damage/knockback formulas, overheat, debug-training recovery, economy, and shop weights
- static-analysis weights and allowed balance spreads

Stable IDs such as `nearestEnemy`, `self`, and `targetInRange` are saved and evaluated. Japanese copy is display data only. This avoids coupling Unity rules to localization.

For Unity, import the JSON with Newtonsoft Json.NET (or a custom importer) and generate ScriptableObjects if inspector editing is preferred. Keep JSON as the canonical reviewed asset; generated ScriptableObjects should not become a second source of truth.

## Module boundary

| TypeScript | Unity destination | Responsibility |
| --- | --- | --- |
| `src/core/combat.ts` | `CombatResolver.cs` | damage and knockback math |
| `src/core/statuses.ts` | `BattleRules.cs` / future `StatusRuntime.cs` | generic status instances, stacking, duration, effects, and visual metadata lookup |
| `src/core/battle-zones.ts` | `BattleRules.cs` / future `BattleZoneRuntime.cs` | generic timed areas, path-entry detection, and typed trigger effects |
| `src/core/rules.ts` | `BattleRules.cs` | target selection, per-target condition matching, cooldowns, movement, action effects |
| `src/core/battle-engine.ts` | `BattleEngine.cs` | deterministic frame planning and serializable battle steps |
| `src/core/roster.ts` | `RosterFactory.cs` | equipment application, inventory units, and one-on-one battle-state construction |
| `src/core/shop.ts` | `ShopGenerator.cs` | seeded equipment and instruction shop generation |
| `src/core/balance.ts` | editor/CLI validation | reference validation and power scoring |
| `src/core/synergy.ts` | editor/CLI validation | status-pack graph generation and synergy completeness checks |
| `src/core/debug-simulation.ts` | editor test harness | deterministic single-action and timeline measurements using the live frame planner |
| `src/App.tsx`, `src/BattleScene.tsx` | MonoBehaviours/UI Toolkit | orchestration, animation, audio, and presentation only |

`BattleStep` contains only plain values: a visual event, optional log and damage events, and fighter field updates. Damage events carry the acting unit, stable action ID, actual HP damage, and whether the source was a normal instruction, reaction, or status tick. Status damage also carries its stable status ID. There are no closures in the core queue. Unity can mirror this with serializable structs and let animation and report code consume events independently of the simulation.

The debug-room harness constructs a plain two-fighter/program input and advances `planBattleFrame` on a virtual clock. Its start-distance presets come from `debugTraining.positionPresets`, while every configurable status is generated from the canonical top-level `statuses` registry; the same status runtime applies to the attacker and dummy. It preserves movement and status updates in serializable playback frames, clamps the dummy to `debugTraining.minimumDummyHp`, and restores only its HP after `debugTraining.recoveryDelaySeconds`; Reset recreates the configured initial fighters. Unit stat and state overrides remain harness inputs rather than presentation-only modifiers. It derives per-hit damage independent of remaining dummy HP, DPS, resource efficiency, healing, maximum displacement, state stacks, recovery count, and skip reasons from normal battle outputs. Port the harness as an editor tool rather than duplicating combat formulas in Unity UI code; matching harness results provide a practical parity check during migration.

## Sprite presentation assets

The authoring pipeline publishes approved PNG and manifest pairs to `Assets/CodeMonsters/Presentation/Generated/<unitId>`. `SpriteAssetImporter` validates approval and content hashes, configures the texture, slices frames through `ISpriteEditorDataProvider`, and generates AnimationClips, an AnimatorController, and a presentation-only Prefab through Unity Editor APIs.

Animation timing and fallback IDs come from the approved asset manifest. Gameplay data remains in `game-balance.json`; generated Prefabs contain no stats or instruction logic. A future Unity battle presenter should translate plain battle events to stable motion IDs and request them from the generated AnimatorController.

Run `pnpm test:unity-assets:compile` for the license-independent C# smoke check and `pnpm test:unity-assets` for importer and idempotence coverage. See `docs/sprite-asset-workflow.md` for the operator flow and `docs/sprite-asset-architecture.md` for package boundaries.

## Suggested port order

1. Define C# DTOs matching `game-balance.json` and reject unsupported `schemaVersion` values.
2. Port combat math and its tests with the same fixture values.
3. Port condition/target selection and roster construction.
4. Port `planBattleFrame` and compare serialized step snapshots between TypeScript and C#.
5. Build Unity presentation from battle-step events; do not move rules into MonoBehaviours.
6. Keep `pnpm balance:check` available until the analyzer itself is ported to an editor tool or .NET CLI.

When adding behavior, compose the finite instruction `effects` primitives (`damage`, `move`, `heal`, `applyStatus`, `consumeStatus`, `removeStatus`, `modifyStat`, `placeZone`, and `wait`) rather than embedding executable scripts. Update the TypeScript type and C# DTO/allowlist only when introducing a genuinely new runtime behavior, then add a focused parity test. Add statuses and battle zones once to their top-level registries with debug or visual metadata; runtime fighters and zones store only generic serializable instances. The web controls, chips, and synergy matrices are generated from those registries, and `pnpm verify` checks every unit, status, position preset, instruction, status pack, and position pack. Unsupported status effects, zone triggers, duration modes, instruction-effect kinds, condition kinds, or target structures fail validation rather than being silently omitted. Breaking schema changes require a `schemaVersion` increment and migration note.

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

Add the ordered `encounters` array. Each entry owns its stable ID, player-facing briefing, enemy unit IDs, enemy stat scale, and victory reward. The current round selects one encounter; defeat retries the same encounter without a reward, while victory advances to the next entry. Importers should keep `roster.enemyUnitIds` only as a legacy/default fallback and use `encounters` for the playable run. Version 6 introduced a three-versus-three standard contract; schema version 11 replaces that fixed count with `battle.teamSize`.

## Schema version 7 migration

Move status definitions from `debugTraining.statuses` to the canonical top-level `statuses` registry. Each definition owns a stable ID, stacking and duration behavior, optional typed effects, debug controls, and presentation metadata. Instructions that apply a state now reference it through `appliesStatusId`; status-sensitive conditions and damage modifiers reference a `statusId`. Runtime fighter state replaces poison, guard, berserk, and taunt-specific fields with a serializable `statuses` array containing `{ statusId, stacks, remainingSeconds, sourceId, targetId }`.

Importers must reject unknown status IDs and new unsupported effect or duration kinds. Debug tools should enumerate the registry instead of maintaining a separate status list. This makes data-only additions visible in the debug room and causes structural additions that require runtime work to fail CI until both TypeScript and Unity loaders support them.

## Schema version 8 migration

Replace each instruction's open-ended `params` object and `appliesStatusId` field with a typed `range` object and ordered `effects` array. Every effect must use one of the finite kinds supported by both runtimes. Damage, movement, healing, status application, status consumption, status removal, stat modification, and wait behavior now have explicit serializable payloads. Conditions keep stable IDs for saved programs but dispatch through a finite `kind` plus typed `params`, so new data-only condition IDs can reuse an existing runtime predicate.

Status definitions now own all canonical effect magnitudes through `effects[].value`. An instruction applying a status owns only the target, stack count, and application duration. This guarantees that the same status ID cannot silently mean different guard, speed, or attack multipliers depending on its source skill. Application-duration statuses receive `durationSeconds` from each `applyStatus` effect; persistent statuses do not.

Each status also declares whether it is a `combo` or explicitly justified `standalone` pack and names a verifiable counterplay rule. Combo packs must have a producer, consumer, cross-unit ownership path, and working counterplay. `src/core/synergy.ts` derives that graph from canonical data; `pnpm balance:check` treats an incomplete pack as an error, while the Debug Room renders the same report as its Synergy Graph summary.

## Schema version 9 migration

Add the finite `selfHasStatus` condition kind. Unlike `targetHasStatus`, it evaluates the acting unit's status while preserving the selected action targets, so a program can require an actor-owned buff and still attack an enemy. Status-consuming effects may now explicitly use `target: "actor"`; calculate their bonus from the actor and consume the status only after a successful impact. Buff actions may apply a canonical status to their selected ally instead of owning a one-off stat magnitude.

Importers must add `selfHasStatus` to their condition allowlist and validate its `statusId` and positive `minimumStacks` exactly like `targetHasStatus`. Synergy analyzers must count either condition kind as a status-condition path. Version 9's first pack is `inspired`: Mender applies the timed attack multiplier to an ally, while Volt and Wrath consume it from themselves for their own enemy-targeted attacks.

## Schema version 10 migration

Add the top-level `battleZones` registry and the finite `placeZone` instruction effect. A zone owns its radius, lifetime, team filter, typed `onEnter` effects, and visual metadata; a placement skill owns only its zone ID, anchor, and directional offset. Runtime state stores serializable zone instances and tests every movement segment against active zones. Entering from outside applies the configured effect once, including when a movement crosses the complete area between frames; starting inside and leaving does not retrigger it.

Web, debug playback, and Unity replay contracts now carry zone state separately from fighters. The Debug Room and position-synergy matrix enumerate the same canonical data. Version 10's first content is `toxic-cloud`, but neither the runtime nor movement skills branch on poison: existing advance, retreat, jump, pull, throw, and knockback behaviors interact with any future zone definition automatically.

## Schema version 11 migration

Add `battle.teamSize` and set the standard battle contract to two allies against two encounter enemies. Loaders validate `roster.startingUnitIds`, the fallback enemy roster, and every encounter against that value. Build UI may temporarily hold one active unit while editing, but battle start requires exactly two.

Replace the ally selectors `nearestAlly`, `lowestHpAlly`, `criticalAlly`, and `allAllies` with the single selector `partner`. Version 10 saved programs using any removed ally selector should migrate it to `partner`; healing now combines that selector with `partnerHpBelow50` instead of encoding urgency in the target selector. Rename the reaction trigger `allyAttackHit` to `partnerAttackHit`. Enemy target selectors remain unchanged because choosing between the nearer enemy and the lower-HP enemy is still meaningful in 2vs2.

## Schema version 12 migration

Add `battle.statusDamageTickSeconds` and the finite status effect `damagePerSecond`. Runtime status instances add `tickAccumulatorSeconds` so periodic damage remains deterministic even while presentation steps are queued. Each completed interval emits a serializable damage event with `source: "status"`, `statusId`, the original applier as actor, and the actual HP removed. Status damage bypasses defense and guard because its canonical value is fixed damage per stack; report and replay consumers must include it alongside instruction and reaction damage.

Version 12 changes poison to a five-stack damage-over-time status. Each stack deals 2 fixed damage per second, while `corrosion-burst` still consumes two stacks for its existing bonus damage. Importers must add `damagePerSecond` to the status-effect allowlist and persist the accumulator in fighter snapshots.

## Schema version 13 migration

Allow stacking statuses to set `maxStacks` to `null`, meaning that applications never stop at an arbitrary gameplay cap. Replace-status definitions must continue to declare a positive integer limit. Add the finite status effect `decayStacksPerTick`; its positive integer value removes that many stacks after each completed status-damage interval.

Version 13 changes poison to an uncapped, naturally decaying status. `battle.statusDamageTickSeconds` is now 2, poison deals 1 damage per second per stack (therefore 2 fixed damage per stack on each tick), and then loses 1 stack. Damage and decay use the same deterministic queued step, while replays additionally serialize a `statusChange` event containing the source, target, status ID, amount, and before/after stack counts. Reports aggregate poison damage and natural decay separately. `corrosion-burst` continues to consume two stacks for 18 bonus damage.

## Schema version 14 migration

Remove the `decayStacksPerTick` status effect and the replay-only `statusChange` decay event. Poison remains uncapped and continues to deal 2 fixed damage per stack every 2 seconds, but stacks now persist until a skill explicitly consumes or removes them. Result reports continue to aggregate poison and other status damage through the existing serializable damage event.

Battle-zone triggers may now use `onActionWhileInside`. The canonical `toxic-cloud` no longer fires on placement, entry, or path crossing. Instead, each successfully executed normal action or reaction adds 1 poison stack when the acting unit's action-start position is inside the zone. A skipped instruction does not fire the trigger; an executed miss does. Importers should retain `onEnter` support for compatible zone data, add `onActionWhileInside` to the finite trigger allowlist, and evaluate the trigger before resolving the action so movement uses the start position.

## Schema version 15 migration

Set `battle.teamSize` to exactly `1`. The canonical roster now contains only `volt`, `bastion`, and `relay`, with one starting player unit and one fallback rival. Remove `partner`, low-HP enemy, and multi-target selectors from canonical data; remove partner conditions, `partnerAttackHit`, and the `taunted` status. Version 14 saves that reference removed units, targets, conditions, reactions, or statuses are not directly compatible and should start a new run.

Add the top-level `equipment` registry and the `roster.startingEquipmentIds` loadout. Every inventory unit serializes exactly one `frame`, `weapon`, and `chip`. Equipment can modify base stats, override attack type, grant instruction IDs, and supply a default reaction. Replacing equipment must recalculate the unit from its immutable base definition and remove program or reaction entries that are no longer owned.

Encounters now serialize one enemy unit plus `enemyEquipmentIds`, `enemyProgramActionIds`, and `enemyReaction`. This allows the same three animated bodies to provide distinct authored matchups. The four-slot shop reserves two deterministic positions for unowned equipment and fills the other two with instructions; unit recruitment, bench management, and unit resale are removed from the run loop.

## Schema version 16 migration

Replace the fighter-wide normal-action cooldown with a short action lock plus per-instruction cooldowns. Each instruction now requires `cooldownSeconds`; `battle.baseActionLockSeconds`, `battle.minimumActionLockSeconds`, and `battle.minimumInstructionCooldownSeconds` control the speed-scaled runtime floors. Runtime fighters serialize `actionLock` and an `instructionCooldowns` map keyed by stable instruction ID. Both timers advance in parallel with status and gauge time.

When the action lock is open, scan the ordered program and execute the first block whose instruction cooldown is ready, condition matches, range/state constraints pass, and cost is affordable. Committing an action starts only that instruction's cooldown plus the short actor action lock; skipped blocks consume neither. Reactions retain their independent interrupt cooldown. Version 15 fighter snapshots containing a single `cooldown` value are not timing-compatible and should start a new battle.

## Schema version 17 migration

Separate normal actions into commit, windup, and impact phases. `battle.baseActionWindupSeconds` and `battle.minimumActionWindupSeconds` define the speed-scaled delay between commit and impact. Runtime fighters serialize a nullable `pendingAction` containing the stable action ID, locked target IDs, start time, and impact time. A fighter cannot commit another normal action while this value is present.

Resolve pending actions by impact time. Actions with the same impact time must read actor and target values from the same pre-impact snapshot, then apply their effects as one `simultaneousGroup`; this permits mutual knockouts and prevents stable-ID or speed ordering from canceling an already committed action. HP changes within a group are summed as deltas from the shared snapshot and clamped once after aggregation, so healing and damage cannot overwrite each other by processing order. Reactions are evaluated after the simultaneous impact group. Version 16 fighter snapshots do not contain pending action timing and should start a new battle.

## Schema version 18 migration

Add serializable airborne state to fighters: current `z` plus remaining duration, total duration, maximum height, launch position, landing position, launch height, and landing height. Web advances horizontal travel with smoothstep easing and derives vertical travel from the same progress using a parabolic arc; Unity ports should preserve the same values rather than infer airborne state from presentation transforms. Landing snaps to the authored landing position and resets `z` to zero.

Instructions may declare `altitude.actor` and `altitude.target` as `grounded`, `airborne`, or `any`. An omitted declaration retains the version-17 ground-to-ground behavior. Check these requirements both when committing an action and again at impact, so an opponent that takes off during windup causes a height-condition miss. Add the finite `airborne` and `land` effects plus the `selfAirborne`, `selfGrounded`, `targetAirborne`, `targetGrounded`, and `targetAirborneRemainingBelow` conditions.

Version 18 adds boost jump, hover, air dash, dive strike, aerial barrage, anti-air shot, launch uppercut, and landing punish. These remain plain instruction data; neither runtime should branch on their stable IDs.

Airborne movement itself is the presentation path. Do not layer a separate jump animation or jump effect on top of it: doing so creates a short hop followed by apparent hovering. A `flight` battle flash may label the takeoff without transforming the unit body.

## Executable migration spike

`unity/CodeMonsters` is a minimal Unity 6 project that proves the first migration boundary without introducing a second balance-data source. It reads the repository's canonical `game-data/game-balance.json` at EditMode test time and currently ports:

- schema-v18 DTO loading and stable-ID/reference validation, including the one-on-one contract, action windup, airborne state and altitude requirements, instruction cooldowns and action-lock limits, three-slot equipment, encounter programs, uncapped non-decaying status damage, action-triggered battle zones, finite instruction effects, and canonical status values
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
