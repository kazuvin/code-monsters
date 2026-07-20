# Sprite asset workflow

This runbook covers the implemented authoring flow from reviewed PNG frames to Web assets and Unity `.anim` files for the three animated combat bodies: `volt`, `bastion`, and `relay`.

The provider is `manual`: a pixel artist authors the final character motion frames, then the repository pipeline performs deterministic normalization, QA, sheet construction, approval, and export. AI-generated character motion is not an approval path because frame-to-frame anatomy and pixel clusters are not reliable enough for the target quality. AI generation is reserved for static backgrounds, skill icons, portraits, effects, and non-animated props.

## Responsibility boundary

| Step | Owner |
| --- | --- |
| Define unit identity and motion intent | Human, `game-assets/specs` and `game-assets/config` |
| Author coherent character motion frames | Pixel artist |
| Remove background, normalize, pixelate, build sheet | Python pipeline |
| Calculate QA metrics and blocking errors | Python pipeline and TypeScript CLI |
| Review preview and approve the candidate | Human |
| Publish approved PNG and manifest | TypeScript CLI |
| Slice sprites and generate `.anim`, controller, prefab | Unity Editor importer |

Humans author and review the sprite frames, but do not manually assemble ordinary `.anim` files. The Unity importer still owns slicing, clip construction, controllers, and Prefabs unless a motion needs custom transitions or Animation Events beyond the generated contract.

## One-time setup

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm assets:python:setup
```

The second command creates `tools/sprite-pipeline/.venv` from `tools/sprite-pipeline/uv.lock`. Routine processing calls that environment directly and does not contact a package index.

Required local tools:

- Node.js 24.14.0
- pnpm 10.28.1
- uv
- Unity 6000.3.16f1 for Unity import and EditMode tests

## 1. Inspect the unit requirements

```bash
pnpm assets:requirements --unit volt
pnpm assets:requirements --unit bastion
pnpm assets:requirements --unit relay
```

The command reads `game-data/game-balance.json` and reports:

- required motions for the unit's base presentation, default program, and authored rival encounters
- optional motions reachable through general instructions
- fallback mappings for motions without dedicated frames
- the recommended single-color source background, selected by perceptual distance from the unit palette

For the current `volt` player and mirror-match build, the required motions are `idle`, `move`, `attack`, `hit`, `death`, `retreat`, `buff`, and `follow`. Always use the command output rather than maintaining this list by hand.

## 2. Prepare hand-authored source frames

Use the reported background color and create one PNG per frame. Input names only determine sort order; motion IDs come from directory names.

```text
/path/to/volt-source/
  idle/
    000.png
    001.png
    ...
  move/
    000.png
    ...
  attack/
  hit/
  death/
  follow/
```

The number of PNGs must match `game-assets/config/motions.json` exactly.

Source rules:

- finished pixel art at the configured frame size or a deliberate integer multiple
- right-facing side view
- fixed camera, scale, and ground line
- full body and weapon inside the frame
- flat background matching the selected color
- no floor, cast shadow, text, UI, scenery, or extra character
- stable armor, limb count, weapon, and proportions across frames

The unit-specific identity constraints are in `game-assets/specs/units/<unitId>.json`.

## 3. Import the source as an immutable run

```bash
pnpm assets:generate \
  --unit volt \
  --source-dir /path/to/volt-source \
  --motions idle,move,attack,hit,death,follow \
  --background '#FF00FF'
```

Use the background returned by `assets:requirements`; the example value is not universal.

The command copies the inputs into `game-assets/runs/<runId>/source/`, records SHA-256 hashes, and prints the run ID. Runs are ignored by Git and are not approved product assets.

## 4. Process and inspect QA

```bash
pnpm assets:process --run <runId>
pnpm assets:validate --run <runId>
pnpm assets:preview --run <runId>
```

`assets:process` performs:

1. EXIF and RGBA normalization
2. border-connected chroma background removal in Lab color space
3. foreground component cleanup
4. crop, scale, baseline, and pivot normalization
5. area/Lanczos resizing
6. fixed-palette quantization
7. frame and motion QA
8. sprite-sheet, manifest, JSON report, and HTML preview generation

The preview command prints the local HTML report path. Open that file in a browser and review the original motion intent, processed sheet, warnings, and measured thresholds.

`assets:validate` exits with code `2` when the report contains blocking errors. Warnings do not block approval but require review.

Important issue codes include:

- `FRAME_PROCESSING_FAILED`
- `FRAME_COUNT_MISMATCH`
- `FRAME_SIZE_MISMATCH`
- `FOREGROUND_TOUCHES_BORDER`
- `PALETTE_COLOR_OUTSIDE_SET`
- `OCCUPANCY_OUT_OF_RANGE`
- `TRANSPARENCY_OUT_OF_RANGE`
- `TOO_MANY_COMPONENTS`
- `ACCENT_COLOR_MISSING`
- `BASELINE_DRIFT`
- `CENTROID_DRIFT`
- `SILHOUETTE_DIMENSION_CHANGE`
- `POSSIBLE_DUPLICATE_FRAME`
- `ADJACENT_FRAME_CHANGE_TOO_LARGE`
- `LOOP_CLOSURE_MISMATCH`

## 5. Approve the run

```bash
pnpm assets:approve --run <runId> --by <reviewer-name>
```

Approval fails if QA contains any error. It copies only the reviewed sheet, manifest, and reports to:

```text
game-assets/approved/<unitId>/
  sprite-sheet.png
  manifest.json
  qa-report.json
  qa-report.html
```

If an approved asset already exists, inspect both content hashes and explicitly replace it:

```bash
pnpm assets:approve --run <runId> --by <reviewer-name> --replace
```

## 6. Publish to Web and Unity

```bash
pnpm assets:publish --unit volt
```

The CLI copies the same approved files to:

```text
src/assets/generated/units/volt/
unity/CodeMonsters/Assets/CodeMonsters/Presentation/Generated/volt/
```

Only approved manifests can be published. A manifest without `approvedAt`, `approvedBy`, or with a non-zero QA error count is rejected.

Web rendering integration is intentionally separate from authoring. The published files are ready for a Web sprite runtime, while the existing CSS unit remains the display fallback until that runtime is enabled.

## 7. Generate Unity assets and `.anim` files

If Unity is open when the files are published, `SpriteAssetPostprocessor` detects the approved manifest and schedules import. Otherwise open the Unity project and run:

```text
Code Monsters > Assets > Import Approved Sprites
```

The importer verifies approval and the sheet SHA-256, then generates:

```text
Presentation/Generated/volt/
  sprite-sheet.png
  manifest.json
  Animations/
    idle.anim
    move.anim
    attack.anim
    hit.anim
    death.anim
    follow.anim
  volt.controller
  volt.prefab
  import-result.json
```

Each `.anim` is generated from manifest frame order, FPS, and loop settings. Missing optional motions become Animator states that reference a resolved fallback clip. Re-import updates assets at stable paths, preserving their `.meta` GUIDs.

The generated Prefab contains presentation components only:

- `SpriteRenderer`
- `Animator`
- `GeneratedUnitPresenter` with the stable unit ID

It does not duplicate HP, attack, speed, prices, or battle rules.

Publishing a replacement updates only the four approved input files. Existing Unity-generated clips, controllers, Prefabs, and their `.meta` files remain in place; the importer then updates their contents at stable asset paths.

## Verification

Run the non-networked repository gates:

```bash
pnpm assets:check
pnpm assets:test
pnpm assets:python:test
pnpm verify
pnpm test:unity-assets:compile
pnpm test:unity-assets
```

`pnpm verify` checks configuration, unit specs, approved sheet hashes, TypeScript tests, and Python fixtures. It does not call an image-generation API or write new assets.

`pnpm test:unity-assets` launches the pinned Unity Editor in batch mode and writes:

- `/tmp/code-monsters-unity-asset-tests.xml`
- `/tmp/code-monsters-unity-asset-tests.log`

`pnpm test:unity-assets:compile` is a license-independent C# compile smoke test against the pinned Unity installation. The EditMode command remains the authoritative importer integration test because it exercises AssetDatabase, Sprite Editor data providers, and GUID idempotence.

See [sprite-asset-troubleshooting.md](sprite-asset-troubleshooting.md) when a step fails.
