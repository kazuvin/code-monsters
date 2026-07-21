# Repository rules

## Architecture

- Treat `src/game/game.json` as the single source of truth for units, circuit blocks, starting boards, economy, and battle tuning.
- Keep deterministic game rules in `src/core/`. Core modules must not import React, DOM, CSS, or browser APIs.
- Keep battle inputs and outputs as plain serializable data so replays and ports stay straightforward.
- Use stable English IDs in state and rules. Japanese labels are presentation data; never branch on localized strings.
- Prefer pure functions and discriminated unions over inheritance. Add a new block effect by extending the data union and resolver.
- Keep the first playable loop small: shop, 5x5 circuit board, deterministic 1-vs-1 battle, result, repeat.

## Test-driven development

- Write or update a failing Vitest test before changing core behavior.
- Keep focused tests beside `src/core/` and game-data validation in `src/game/`.
- Run `pnpm format` after supported source or config edits.
- Run `pnpm verify` before declaring changes complete.
- For UI or interaction changes, also run `pnpm test:browser` against a local server and inspect the desktop and mobile screenshots.

## Product and presentation

- Use short verbs and direct manipulation. Do not solve onboarding with paragraphs or tutorial modals.
- Preserve the 5x5 circuit board as the primary visual and interaction surface.
- Treat power as binary connectivity in the prototype. Do not add energy, heat, resistance, conditions, or priority rules.
- Skills may pass power onward. Their connector shape and effect belong to the same data-driven block definition.
- Open block details on click; use long-press drag for placement and swapping on pointer and touch devices.
- Keep the pixel-art treatment crisp: hard edges, restrained motion, and the established navy/cyan/coral/amber palette.
- Prefer CSS and existing assets for UI motifs. Do not duplicate gameplay data in presentation code.

## Archive

- The superseded real-time prototype is preserved as both branch `archive/realtime-prototype-v1` and tag `realtime-prototype-v1`.
- Do not revive archived systems or asset-pipeline dependencies in `main` unless the product direction changes explicitly.
