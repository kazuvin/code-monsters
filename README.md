# Code Monsters

Code Monsters is a one-on-one programmable auto-battle prototype. A single duelist is configured with a frame, weapon, logic chip, and ordered combat program before facing five authored rival protocols. The repository includes a React/Vite web client, canonical JSON game data, a deterministic TypeScript battle core, a Unity 6 migration project, and an authoring-time sprite asset pipeline.

The playable animation scope is deliberately limited to three reusable unit bodies: `volt`, `bastion`, and `relay`. Matchup variety comes from equipment tradeoffs, granted actions, reactions, and enemy programs rather than a large recruitable roster.

## Repository layout

```text
src/                         Web application and deterministic game core
game-data/                   Canonical gameplay data and golden combat cases
game-assets/                 Sprite pipeline configuration, specs, approved assets
packages/asset-contracts/    Language-neutral JSON contracts
tools/asset-cli/             TypeScript orchestration and approval CLI
tools/sprite-pipeline/       Python/OpenCV/Pillow image processing
unity/CodeMonsters/          Unity 6 core migration and presentation importer
scripts/                     Verification and browser/Unity test entrypoints
docs/                        Architecture and operator documentation
```

The root is a pnpm workspace. Python dependencies are locked separately with uv, and Unity keeps its own package manifest.

## Setup

```bash
pnpm install --frozen-lockfile
pnpm assets:python:setup
```

## Main commands

```bash
pnpm dev
pnpm verify
pnpm synergy:report
pnpm test:unity-core
pnpm test:unity-assets:compile
pnpm test:unity-assets
```

For the sprite authoring flow, see [docs/sprite-asset-workflow.md](docs/sprite-asset-workflow.md).
