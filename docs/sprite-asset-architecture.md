# Sprite asset architecture

## Objective

The sprite pipeline turns human-authored character animation frames into reviewed, deterministic assets consumed by the Web and Unity presentation layers. AI-generated bitmaps can use the same QA and approval boundary for static assets, but do not enter the animated-unit sheet path.

```text
game-balance.json + UnitArtSpec + MotionSpec
                    |
                    v
          manual pixel-art run
                    |
                    v
         Python normalization and QA
                    |
                    v
              human approval
                    |
                    v
          approved PNG + manifest
             /              \
            v                v
     Web publisher      Unity Editor importer
                         -> Sprite slices
                         -> AnimationClip
                         -> Controller
                         -> Prefab
```

## Sources of truth

- `game-data/game-balance.json`: units, stable IDs, role, attack type, canonical accent color, encounter programs, and reactions
- `game-assets/config/motions.json`: presentation motion timing and fallback rules
- `game-assets/config/pipeline.json`: canvas, palette, processing settings, QA thresholds
- `game-assets/specs/units/*.json`: art-only identity constraints keyed by an existing unit ID
- `packages/asset-contracts/schemas`: language-neutral file contracts
- `game-assets/approved/<unitId>/manifest.json`: the approved asset version for a unit

Game stats are never copied into art specs, manifests, Animator assets, or Prefabs.

## Package boundaries

### TypeScript CLI

`tools/asset-cli` owns orchestration and filesystem state transitions. It reads canonical game data, derives motion requirements, creates immutable runs, invokes the Python interpreter, blocks invalid approval, and publishes approved files.

It does not process pixels and does not write Unity YAML.

### Python pipeline

`tools/sprite-pipeline` owns deterministic pixel processing. Its input is a JSON request plus PNG files. Its outputs are normalized PNG frames, one sprite sheet, an asset manifest, and QA reports.

It does not know React, game rules, Animator state machines, or Unity asset serialization.

### Unity Editor importer

`Assets/CodeMonsters/Presentation/Editor` owns Unity-specific import and asset creation. It validates approved manifests, configures the `TextureImporter`, slices sprites through the Unity 6 Sprite Editor data-provider API, creates or updates clips, builds a generated controller, and saves a presentation Prefab. The Unity project declares `com.unity.2d.sprite` explicitly for that API.

It does not decide gameplay timing or read localized labels.

## Run state machine

```text
generated
  -> validated
  -> approved
  -> published

generated
  -> validation-failed
  -> process again
```

`approve` requires a QA report with zero errors. `publish` requires approval metadata. Replacing an existing approved unit requires an explicit `--replace` flag.

## Determinism and provenance

Each run records source hashes, game schema version, pipeline version, provider, background color, motion IDs, and status. The manifest records the sheet hash, palette hash, per-frame hashes, content hash, source run, QA summary, and reviewer. The animated roster is intentionally capped at `volt`, `bastion`, and `relay`; new matchup variety should first come from skills and programs.

The Python producer and TypeScript approval boundary independently validate the manifest. Approval recomputes its canonical content hash and rejects invalid rectangles, frame order, fallback references, palette hashes, QA summaries, or provenance fields.

The report timestamp is observational and is not part of the asset content hash. The same run, settings, dependencies, and input files must produce identical sheet bytes and content hashes.

## Frame and sheet coordinates

Normalized frames use a fixed transparent canvas. The foreground is horizontally centered and its bottom is aligned to the configured baseline. Manifest pivots are normalized bottom-left coordinates for Unity.

Sheet rectangles use a documented `top-left` origin because Python and Web image tooling use top-left coordinates. The Unity importer converts each rectangle to Unity's bottom-left texture coordinate system.

Motions occupy rows; frame indices occupy columns. Consumers must read manifest rectangles instead of inferring them from filenames or row order.

## Fallbacks

The CLI resolves fallback chains to a motion that is actually generated for the unit. For example, when only `attack` exists:

```text
throw -> heavy -> attack
```

is published as:

```text
throw -> attack
```

The Unity importer creates an Animator state named `throw` that references the generated `attack` clip. Runtime code can request stable motion IDs without knowing which units have bespoke animation.

## Security and deployment

The pipeline is an authoring tool. Python, OpenCV, source runs, and image-generation credentials are not part of the Cloudflare or browser runtime. `game-assets/runs` and Python virtual environments are ignored by Git.

CI uses only locked dependencies, synthetic fixtures, approved manifests, and deterministic checks. It never calls an image-generation provider.
