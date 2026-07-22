# Repository rules

## Architecture

- Treat `src/game/game.json` as the single source of truth for units, circuit blocks, the player starting board, rival generation, economy, and battle tuning.
- Keep deterministic game rules in `src/core/`. Core modules must not import React, DOM, CSS, or browser APIs.
- Keep battle inputs and outputs as plain serializable data so replays and ports stay straightforward.
- Use stable English IDs in state and rules. Japanese labels are presentation data; never branch on localized strings.
- Prefer pure functions and discriminated unions over inheritance. Add a new block effect by extending the data union and resolver.
- Keep the first playable loop small: shop, 5x5 circuit board, deterministic 1-vs-1 battle, result, repeat.

## Build design

- Keep the two user-facing axes in `buildDesign.axes`: traits such as poison or charge, and delivery types such as blade, bow, cannon, device, or magic. Track topology internally through `buildDesign.placementPatterns`; do not expose it as a third named axis in the card UI.
- Give every playable node exactly one design entry with both visible axis links and one `placementPatternId`. Assign generic nodes to the neutral trait, and use multiple trait values only when the node mechanically combines those traits.
- Keep trait behavior and weapon delivery separate: traits define what is accumulated or transformed, while weapon types define how the node attacks, branches, sustains, or finishes.
- Define a build as a placement identity, strength, risk, game plan, and payoff paths in `src/game/game.json` before expanding its skills.
- Give every build coverage for starter, grower, cycler, sustain, and payoff roles. A label or status type alone is not a build.
- Give every build at least two distinct payoff paths. Each path must have its own payoff skill plus supporting grower and cycler skills.
- Make payoff paths meaningfully different. For example, poison can preserve stacks for continued growth or rupture stacks for immediate damage.
- Keep builds open to shop-driven pivots. Each build needs reusable skills or explicit cross-build hooks, and must stay below the configured exclusive-skill ratio.
- Let connector direction and circuit topology express the build identity. Do not replace placement decisions with flat same-tag bonuses.
- Keep unimplemented concepts in `buildDesign.skills` with `status: "planned"`; only use `status: "playable"` with a valid `blockId`.
- Keep `minimumPlayableSkillsPerBuild` at `0` while build design is exploratory; raise it deliberately when playable coverage should become a release gate.
- Before adding a skill, run `pnpm design:matrix` and use the generated placement-condition × trait × delivery-type counts in `docs/build-synergy-matrix.md` to prioritize empty or thin cells. Run it again after editing, then run `pnpm design:matrix:check` to detect stale output and invalid coverage.
- Make difficult topology conditions such as being in a loop, filling every port, or joining a long straight segment pay noticeably above unconditional effects. Prefer upgrading underused nodes into these cells before duplicating an already dense combination.
- Treat charge as a transient value carried by one circuit pulse, not a persistent energy meter. Only nodes with an explicit `charge` effect add charge; ordinary traversed nodes merely carry the incoming total, and release nodes convert it into their output.
- Every playable node tagged with the charge trait must define either a `charge` effect or a `release-charge` effect; reject mismatches in game-data validation.
- Generate the rival circuit deterministically from the run and seed. Each run must add configured board pressure until the board cap, continue scaling rival health after the cap, and include a starter plus payoff for one real trait with optional neutral support.
- Keep rival and balance-simulation build discovery data-driven from `buildDesign.builds`; never add a hard-coded build ID union or list in core code. A new build must be an axis value, have playable starter and payoff coverage, and generate a powered board within the available budget.
- Keep node price bands strictly separated by rarity, and make higher-rarity nodes meaningfully stronger through output, multi-effects, or payoff efficiency.
- Give rare, epic, and legendary tiers one or two charge-release nodes each so the build has finishers before its rarest rolls appear.
- Define the four node rarities and their progressively lower base shop weights in `src/game/game.json`; individual `shopWeight` values may tune nodes only within that rarity baseline.
- Every playable skill must be included by the default balance run without an explicit `--skills` list. Baseline comparison must reject added or removed playable skills and builds instead of silently inheriting an old catalog.
- Add a deterministic ceiling test for every payoff that multiplies an accumulated resource or combines with amplification, haste, merge, or fusion. The random tournament measures average generated boards and does not replace a hand-authored high-synergy regression test.
- Size skill parameters with `rules.balanceFormula` and `pnpm balance:formula` before using simulation results. Compare reference DPS, condition-weighted CVPS, and the rarity/price target separately; never hide a missing effect formula by excluding a playable skill from the report.
- Treat condition availability as a fixed design coefficient, not an observed win rate. Regenerate `reports/balance/formula.*` after changing a skill, battle tempo, fusion multiplier, rarity target, or formula coefficient, and keep `pnpm balance:formula:check` in the verification gate.
- Generate a fresh random seed for every normal shop arrival while keeping seeded core functions and the browser fixture deterministic. Unowned offers must still expose a west connector.
- Fuse exactly three normal copies across the board and rack into one starred copy. Apply fusion tuning from `rules.skillFusion`, preserve one board placement when possible, and grant one choice from three unique skills of the fused rarity.

## Test-driven development

- Write or update a failing Vitest test before changing core behavior.
- Keep focused tests beside `src/core/` and game-data validation in `src/game/`.
- Run `pnpm format` after supported source or config edits.
- Run `pnpm verify` before declaring changes complete.
- After gameplay tuning, run `pnpm balance:check`, a focused higher-trial simulation for changed skills, and one different validation seed before updating `reports/balance/baseline.*`.
- For UI or interaction changes, also run `pnpm test:browser` against a local server and inspect the desktop and mobile screenshots.

## Product and presentation

- Use short verbs and direct manipulation. Do not solve onboarding with paragraphs or tutorial modals.
- Preserve the 5x5 circuit board as the primary visual and interaction surface.
- Treat power as binary connectivity in the prototype. Topology-triggered skill effects are allowed; do not add energy, heat, resistance, unrelated combat conditions, or priority rules.
- Skills may pass power onward. Their connector shape and effect belong to the same data-driven block definition.
- Open block details on click; use long-press drag for placement and swapping on pointer and touch devices.
- Keep the pixel-art treatment crisp: hard edges, restrained motion, and the established navy/cyan/coral/amber palette.
- Prefer CSS and existing assets for UI motifs. Do not duplicate gameplay data in presentation code.

## Archive

- The superseded real-time prototype is preserved as both branch `archive/realtime-prototype-v1` and tag `realtime-prototype-v1`.
- Do not revive archived systems or asset-pipeline dependencies in `main` unless the product direction changes explicitly.
