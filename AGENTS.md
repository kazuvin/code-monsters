# Repository rules

## Architecture

- Treat `src/game/game.json` as the single source of truth for units, circuit blocks, starting boards, economy, and battle tuning.
- Keep deterministic game rules in `src/core/`. Core modules must not import React, DOM, CSS, or browser APIs.
- Keep battle inputs and outputs as plain serializable data so replays and ports stay straightforward.
- Use stable English IDs in state and rules. Japanese labels are presentation data; never branch on localized strings.
- Prefer pure functions and discriminated unions over inheritance. Add a new block effect by extending the data union and resolver.
- Keep the first playable loop small: shop, 5x5 circuit board, deterministic 1-vs-1 battle, result, repeat.

## Build design

- Model build concepts on two independent axes in `buildDesign.axes`: traits such as poison or charge, and weapon or device types such as blade, bow, cannon, or device.
- Give every playable node exactly one design entry with both axis links. Use multiple trait values for genuine cross-build or pivot nodes instead of duplicating a poison-only version for each build.
- Keep trait behavior and weapon delivery separate: traits define what is accumulated or transformed, while weapon types define how the node attacks, branches, sustains, or finishes.
- Define a build as a placement identity, strength, risk, game plan, and payoff paths in `src/game/game.json` before expanding its skills.
- Give every build coverage for starter, grower, cycler, sustain, and payoff roles. A label or status type alone is not a build.
- Give every build at least two distinct payoff paths. Each path must have its own payoff skill plus supporting grower and cycler skills.
- Make payoff paths meaningfully different. For example, poison can preserve stacks for continued growth or rupture stacks for immediate damage.
- Keep builds open to shop-driven pivots. Each build needs reusable skills or explicit cross-build hooks, and must stay below the configured exclusive-skill ratio.
- Let connector direction and circuit topology express the build identity. Do not replace placement decisions with flat same-tag bonuses.
- Keep unimplemented concepts in `buildDesign.skills` with `status: "planned"`; only use `status: "playable"` with a valid `blockId`.
- Keep `minimumPlayableSkillsPerBuild` at `0` while build design is exploratory; raise it deliberately when playable coverage should become a release gate.
- Run `pnpm design:matrix` after build-design changes and review `docs/build-synergy-matrix.md`. Run `pnpm design:matrix:check` to detect stale output and invalid coverage.
- Treat charge as a transient value carried by one circuit pulse, not a persistent energy meter. Only nodes with an explicit `charge` effect add charge; ordinary traversed nodes merely carry the incoming total, and release nodes convert it into their output.
- Keep node price bands strictly separated by rarity, and make higher-rarity nodes meaningfully stronger through output, multi-effects, or payoff efficiency.
- Give rare, epic, and legendary tiers one or two charge-release nodes each so the build has finishers before its rarest rolls appear.
- Define the four node rarities and their progressively lower base shop weights in `src/game/game.json`; individual `shopWeight` values may tune nodes only within that rarity baseline.

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
