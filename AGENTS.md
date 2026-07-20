# Repository rules

## Architecture

- Treat `game-data/game-balance.json` as the single source of truth for units, instructions, reactions, economy, shop, battle tuning, and balance thresholds.
- Keep game rules in `src/core/`. Core modules must not import React, DOM, Three.js, or CSS.
- Use stable English IDs in saved/game state. Japanese labels and flavor text are presentation data; never branch game rules on localized strings.
- Battle-engine inputs and outputs must remain plain serializable data so the behavior can be ported to Unity/C# and replayed in tests.
- Do not add gameplay magic numbers to `App.tsx`, `BattleScene.tsx`, or core rule implementations. Add named parameters to the game-data schema instead.

## Completion gate

- Run `pnpm format` after editing supported source/config files. `pnpm verify` includes a non-writing `pnpm format:check` gate.
- Keep the Husky + lint-staged pre-commit hook enabled. It formats staged supported files and re-stages the formatter output automatically.
- After changing `src/core/`, `game-data/`, units, skills, reactions, combat parameters, prices, or shop settings, run `pnpm verify` before declaring the task complete.
- `pnpm verify` must include the production build, core tests, combat-math tests, and `pnpm balance:check` equivalent.
- Balance errors block completion. Warnings require review and should be reported; do not loosen a threshold only to silence a result.
- For battle presentation or build-screen changes, also run the relevant browser regression scripts (`test:skills`, `test:run`, `test:mobile`, `test:miss`, `test:jump`, `test:projectile`, `test:field`, or `test:visual`).

## Unity portability

- Prefer small deterministic functions over stateful UI callbacks.
- Add schema fields compatibly and increment `schemaVersion` for breaking data changes.
- Update `docs/unity-migration.md` when the core boundary or import strategy changes.

## Sprite asset pipeline

- Keep animated combat units limited to the canonical `volt`, `bastion`, and `relay` roster unless the game scope is intentionally revised. Unit animation sheets are human-authored; use AI generation for static backgrounds, skill icons, portraits, effects, and non-animated props instead of final character motion frames.
- Keep gameplay definitions in `game-data/game-balance.json`; art specs and manifests may reference a stable unit ID but must not duplicate stats or localized names.
- Treat `game-assets/config/`, `game-assets/specs/`, and `packages/asset-contracts/schemas/` as reviewed authoring inputs. Keep unapproved `game-assets/runs/` out of Git.
- Only `game-assets/approved/<unitId>/manifest.json` may be published to Web or Unity. QA errors block approval; warnings require human review.
- Use `tools/sprite-pipeline` for deterministic pixel processing and `tools/asset-cli` for orchestration. Do not generate Unity YAML or `.meta` files from Python.
- Unity presentation assets belong under `Assets/CodeMonsters/Presentation`; generated Prefabs must not own combat rules or duplicate balance data.
- Preserve Unity YAML serialization, including the significant trailing spaces used by empty `TagManager.asset` layer entries.
- After changing asset contracts, pipeline config, CLI, or Python processing, run `pnpm assets:check`, `pnpm assets:test`, and `pnpm assets:python:test`.
- After changing the Unity sprite importer, also run `pnpm test:unity-assets` and inspect `/tmp/code-monsters-unity-asset-tests.log` when the Editor cannot complete.
