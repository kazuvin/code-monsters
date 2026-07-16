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
- For battle presentation changes, also run the relevant browser regression scripts (`test:ability`, `test:berserker`, `test:knockback`, `test:miss`, `test:sniper`, or `test:visual`).

## Unity portability

- Prefer small deterministic functions over stateful UI callbacks.
- Add schema fields compatibly and increment `schemaVersion` for breaking data changes.
- Update `docs/unity-migration.md` when the core boundary or import strategy changes.
