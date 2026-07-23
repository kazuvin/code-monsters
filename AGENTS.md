# Repository rules

## Product direction

- The current product is a run-based 3-vs-3 monster auto-battler built around shop choices, breeding, skill inheritance, gambits, and deterministic asynchronous battles.
- Treat `docs/game-system-spec.md` as the agreed product specification.
- The circuit prototypes are archived as branch/tag pairs `archive/realtime-prototype-v1` / `realtime-prototype-v1` and `archive/circuit-prototype-v2` / `circuit-prototype-v2`. Do not restore their code or assets on `main`.
- The current validation scope is the casual 12-cycle mode. Ranked and synchronized-build online modes remain future work.

## Architecture

- Treat `src/game/game.json` as the single source of truth for content and tunable rules.
- Keep deterministic game rules in `src/core/`. Core modules must not import React, DOM, CSS, storage, clocks, or browser APIs.
- Keep run, shop, breeding, monster, gambit, and battle inputs and outputs as plain serializable data.
- Use stable English IDs in rules and state. Japanese labels are presentation data; never branch on localized strings.
- Use a caller-provided integer seed for every random decision. Never call `Math.random()` in `src/core/`.
- Prefer pure command functions, discriminated unions, and data interpreters over inheritance-heavy object models.
- Add a new skill, trait, equipment effect, condition, or target by extending its data union and resolver. Do not add species-specific conditionals to the battle loop.
- Preserve battle reproducibility across ports: the same content version, inputs, and seed must produce the same result and replay frames.
- Keep the React app as an imperative shell around the functional core. UI state may control presentation, but it must not calculate authoritative game outcomes.
- See `docs/architecture.md` for the Unity port boundary and adopted patterns.

## Game invariants

- Validation content is exactly 45 species: 3 lineages × 3 attributes × white stars 1–5.
- Attributes have no damage, resistance, accuracy, or type-advantage rules.
- A party has 3 active and up to 4 bench monsters.
- A casual run lasts at most 12 cycles and ends early at 5 losses.
- A monster owns exactly 3 skills: 2 intrinsic slots and 1 default/inherited slot. Normal attack is separate.
- A gambit has exactly 3 ordered `condition -> action including target` rules and falls back to normal attack.
- Breeding consumes both parents, starts the child at level 1, unequips parent gear, grants 1 coin, and may inherit one parent skill.
- White and color stars remain separate in state. Effective stars are their sum.
- Battle is deterministic ATB with MP and environment-collapse damage beginning at 45 seconds.

## Test-driven development

- Write or update a failing Vitest test before changing core behavior.
- Keep focused tests beside `src/core/` and game-data validation in `src/game/`.
- Run `pnpm format` after supported source or config edits.
- Run `pnpm verify` before declaring changes complete.
- For UI or interaction changes, also run `pnpm test:browser` against a local server and inspect the desktop and mobile screenshots.
- Heavy balance simulation is not part of normal verification. Add it deliberately when the user requests balance work.

## Product and presentation

- Use short verbs and direct manipulation. Prefer visible state over tutorial modals.
- Keep lineage, attribute, white stars, color stars, level, equipment, and active/bench position visible where decisions are made.
- Treat attribute colors as taxonomy and visual identity, never as a hidden combat advantage.
- Keep the current field-journal visual language: hard-edged panels, restrained motion, plum/ivory/coral/mint/gold palette, and two-axis monster sigils.
- Prefer CSS and data already in `game.json`. Do not duplicate gameplay data in presentation code.
