import assert from 'node:assert/strict';
import test from 'node:test';
import { manifestContentHash, validateAssetManifest, validateQualityReport } from '../src/contracts.ts';
import { sha256Text } from '../src/files.ts';
import type { AssetManifest } from '../src/types.ts';

function manifestFixture(): AssetManifest {
  const colors = ['#242932', '#39D9FF'];
  const manifest: AssetManifest = {
    schemaVersion: 1,
    pipelineVersion: 1,
    unitId: 'volt',
    sourceRunId: 'test-run',
    sourceGameSchemaVersion: 8,
    coordinateSystem: 'top-left',
    sheet: { fileName: 'sprite-sheet.png', width: 96, height: 96, sha256: 'a'.repeat(64) },
    palette: { id: 'test-palette', sha256: sha256Text(JSON.stringify(colors)), colors },
    pixelsPerUnit: 96,
    motions: [{ motionId: 'idle', fps: 8, loop: true, frameIds: ['volt.idle.000'] }],
    frames: [
      {
        frameId: 'volt.idle.000',
        motionId: 'idle',
        frameIndex: 0,
        rect: { x: 0, y: 0, width: 96, height: 96 },
        pivot: { x: 0.5, y: 0.1 },
        sha256: 'b'.repeat(64),
      },
    ],
    fallbacks: { move: 'idle' },
    qaSummary: { errors: 0, warnings: 0, infos: 0 },
    contentHash: '',
  };
  manifest.contentHash = manifestContentHash(manifest);
  return manifest;
}

test('asset manifest validation accepts a complete, self-consistent contract', () => {
  const manifest = manifestFixture();
  assert.equal(validateAssetManifest(manifest), manifest);
});

test('asset manifest validation rejects content changed after hashing', () => {
  const manifest = manifestFixture();
  manifest.motions[0].fps = 12;
  assert.throws(() => validateAssetManifest(manifest), /contentHash/);
});

test('quality report validation rejects a summary that hides an error', () => {
  assert.throws(
    () =>
      validateQualityReport({
        schemaVersion: 1,
        runId: 'test-run',
        unitId: 'volt',
        summary: { errors: 0, warnings: 0, infos: 0 },
        issues: [{ code: 'TEST_ERROR', severity: 'error', message: 'failure' }],
      }),
    /summary/,
  );
});
