# Repository rules

## Architecture

- Treat `src/game/game.json` as the single source of truth for units, commands, programs, economy, and battle tuning.
- Keep deterministic game rules in `src/core/`. Core modules must not import React, DOM, CSS, or browser APIs.
- Keep battle inputs and outputs as plain serializable data so replays and ports stay straightforward.
- Use stable English IDs in state and rules. Japanese labels are presentation data; never branch on localized strings.
- Prefer pure functions and discriminated unions over inheritance. Add a new command effect by extending the data union and resolver.
- Keep the first playable loop small: shop, four-slot program board, deterministic 3-vs-3 battle, result, repeat.

## Test-driven development

- Write or update a failing Vitest test before changing core behavior.
- Keep focused tests beside `src/core/` and game-data validation in `src/game/`.
- Run `pnpm format` after supported source or config edits.
- Run `pnpm verify` before declaring changes complete.
- For UI or interaction changes, also run `pnpm test:browser` against a local server and inspect the desktop and mobile screenshots.

## Product and presentation

- Use short verbs and direct manipulation. Do not solve onboarding with paragraphs or tutorial modals.
- Preserve the program board as the primary visual and interaction surface.
- Keep the pixel-art treatment crisp: hard edges, restrained motion, and the established navy/cyan/coral/amber palette.
- Prefer CSS and existing assets for UI motifs. Do not duplicate gameplay data in presentation code.

## Archive

- The superseded real-time prototype is preserved as both branch `archive/realtime-prototype-v1` and tag `realtime-prototype-v1`.
- Do not revive archived systems or asset-pipeline dependencies in `main` unless the product direction changes explicitly.
