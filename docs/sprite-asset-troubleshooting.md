# Sprite asset troubleshooting

## Python environment is missing

Error:

```text
Python asset environment is missing; run pnpm assets:python:setup
```

Run:

```bash
pnpm assets:python:setup
pnpm assets:python:test
```

The setup command uses `uv.lock`; do not install OpenCV, Pillow, or NumPy globally.

## `uv` fails before dependency resolution on macOS

Some Homebrew uv builds can fail while initializing macOS SystemConfiguration in a restricted process. Routine tests and processing do not invoke uv; they call the locked `.venv` Python directly.

Run setup from a normal terminal session. If the environment already exists, use `pnpm assets:python:test` rather than `uv run`.

## Wrong number of source PNGs

Error:

```text
<motion> requires <n> PNG files; found <m>
```

Check the frame count in `game-assets/config/motions.json`. Filenames are sorted lexically, so use zero-padded names such as `000.png`, `001.png`, and `002.png`.

## Foreground disappears

Relevant issues:

- `FRAME_PROCESSING_FAILED`
- `OCCUPANCY_OUT_OF_RANGE`
- `ACCENT_COLOR_MISSING`

Confirm that `--background` exactly matches the source background and that `assets:requirements` selected a color far from the unit palette. Background removal only removes chroma regions connected to an outer image border; a gradient or decorated background is invalid input.

## Character or weapon is clipped

Relevant issue:

```text
FOREGROUND_TOUCHES_BORDER
```

Add safe padding to the high-resolution source. Do not increase the canvas or loosen the threshold only to make the report pass.

## Animation shakes vertically

Relevant issues:

- `BASELINE_DRIFT`
- `CENTROID_DRIFT`
- `SILHOUETTE_DIMENSION_CHANGE`

Check that every source frame uses the same camera scale and ground line. Airborne motions may legitimately move above the baseline, but their identity, pivot, and scale must remain stable.

## Approval is rejected

Run:

```bash
pnpm assets:validate --run <runId>
pnpm assets:preview --run <runId>
```

Every `error` must be corrected and reprocessed. Warnings require visual review but do not block approval.

If the unit already has an approved version, compare the previous and new content hashes. Use `--replace` only after reviewing that change.

## Unity does not generate `.anim`

Check that the published directory contains both files at the same level:

```text
manifest.json
sprite-sheet.png
```

Then run the Unity menu item:

```text
Code Monsters > Assets > Import Approved Sprites
```

The importer rejects:

- non-zero `qaSummary.errors`
- missing `approvedAt` or `approvedBy`
- unknown manifest schema versions
- unsupported coordinate systems
- invalid frame rectangles or pivots
- sheet SHA-256 mismatches
- fallbacks pointing to unavailable motions

Read `import-result.json` on success and the Unity Console on failure.

## Unity batch test hangs during licensing

The test command has a three-minute timeout and writes `/tmp/code-monsters-unity-asset-tests.log`.

If the log stops at licensing initialization, confirm that Unity Hub has an active license and that no modal license dialog is waiting. This is an Editor environment problem, not a sprite-manifest validation failure.

The specific message `com.unity.editor.headless was not found` means the licensing client did not provide the batch-mode entitlement. `pnpm test:unity-assets:compile` can still verify C# syntax and pinned API compatibility, but it does not replace the EditMode importer test.

## Unity cannot parse `TagManager.asset`

Unity's YAML serializer represents empty layer names as `- ` with a significant trailing space. Do not normalize those lines to a bare `-`; Unity 6000.3 reports `Expect ':' between key and value within mapping`. The repository's `.gitattributes` exempts `.asset` files from Git's trailing-whitespace warning for this reason.

## Unity assets change GUID after re-import

Do not delete the generated `.meta` files or change the generated unit path. The importer updates `.anim`, `.controller`, and `.prefab` assets in place. The EditMode test checks GUID stability across a second import.
