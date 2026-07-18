import { sha256Text } from './files.ts';
import type { AssetManifest, QualityReport } from './types.ts';

const stableId = /^[a-z][a-z0-9-]*$/;
const sha256 = /^[0-9a-f]{64}$/;
const color = /^#[0-9A-F]{6}$/;

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, name: string): Record<string, unknown> {
  expect(value !== null && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  return value as Record<string, unknown>;
}

function array(value: unknown, name: string): unknown[] {
  expect(Array.isArray(value), `${name} must be an array`);
  return value;
}

function positiveNumber(value: unknown, name: string): number {
  expect(typeof value === 'number' && Number.isFinite(value) && value > 0, `${name} must be positive`);
  return value;
}

function nonNegativeInteger(value: unknown, name: string): number {
  expect(Number.isInteger(value) && Number(value) >= 0, `${name} must be a non-negative integer`);
  return Number(value);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function manifestContentHash(manifest: AssetManifest): string {
  return sha256Text(
    canonicalJson({
      pipelineVersion: manifest.pipelineVersion,
      unitId: manifest.unitId,
      sheetSha256: manifest.sheet.sha256,
      paletteSha256: manifest.palette.sha256,
      motions: manifest.motions,
      frameHashes: manifest.frames.map((frame) => frame.sha256),
      fallbacks: manifest.fallbacks,
    }),
  );
}

export function validateAssetManifest(value: unknown): AssetManifest {
  const root = object(value, 'manifest');
  expect(root.schemaVersion === 1, 'Unsupported asset manifest schemaVersion');
  positiveNumber(root.pipelineVersion, 'pipelineVersion');
  expect(typeof root.unitId === 'string' && stableId.test(root.unitId), 'Invalid manifest unitId');
  expect(typeof root.sourceRunId === 'string' && root.sourceRunId.length > 0, 'Invalid sourceRunId');
  positiveNumber(root.sourceGameSchemaVersion, 'sourceGameSchemaVersion');
  expect(root.coordinateSystem === 'top-left', 'Unsupported manifest coordinateSystem');

  const sheet = object(root.sheet, 'sheet');
  expect(typeof sheet.fileName === 'string' && /^[^/\\]+\.png$/i.test(sheet.fileName), 'Invalid sprite sheet fileName');
  const sheetWidth = positiveNumber(sheet.width, 'sheet.width');
  const sheetHeight = positiveNumber(sheet.height, 'sheet.height');
  expect(Number.isInteger(sheetWidth) && Number.isInteger(sheetHeight), 'Sprite sheet dimensions must be integers');
  expect(typeof sheet.sha256 === 'string' && sha256.test(sheet.sha256), 'Invalid sprite sheet SHA-256');

  const palette = object(root.palette, 'palette');
  expect(typeof palette.id === 'string' && stableId.test(palette.id), 'Invalid palette ID');
  expect(typeof palette.sha256 === 'string' && sha256.test(palette.sha256), 'Invalid palette SHA-256');
  const colors = array(palette.colors, 'palette.colors');
  expect(
    colors.length > 0 && colors.every((entry) => typeof entry === 'string' && color.test(entry)),
    'Invalid palette colors',
  );
  expect(new Set(colors).size === colors.length, 'Palette colors must be unique');
  expect(palette.sha256 === sha256Text(JSON.stringify(colors)), 'Palette hash does not match its colors');
  positiveNumber(root.pixelsPerUnit, 'pixelsPerUnit');

  const frames = array(root.frames, 'frames');
  expect(frames.length > 0, 'Manifest frames must not be empty');
  const frameIds = new Set<string>();
  const frameIdsByMotion = new Map<string, { id: string; index: number }[]>();
  for (const [position, value] of frames.entries()) {
    const frame = object(value, `frames[${position}]`);
    expect(typeof frame.motionId === 'string' && stableId.test(frame.motionId), 'Invalid frame motionId');
    const frameIndex = nonNegativeInteger(frame.frameIndex, 'frameIndex');
    const expectedFrameId = `${root.unitId}.${frame.motionId}.${String(frameIndex).padStart(3, '0')}`;
    expect(
      frame.frameId === expectedFrameId && !frameIds.has(expectedFrameId),
      `Invalid or duplicate frameId: ${frame.frameId}`,
    );
    frameIds.add(expectedFrameId);
    const rect = object(frame.rect, `frame ${expectedFrameId} rect`);
    const x = nonNegativeInteger(rect.x, 'rect.x');
    const y = nonNegativeInteger(rect.y, 'rect.y');
    const width = positiveNumber(rect.width, 'rect.width');
    const height = positiveNumber(rect.height, 'rect.height');
    expect(Number.isInteger(width) && Number.isInteger(height), 'Frame dimensions must be integers');
    expect(x + width <= sheetWidth && y + height <= sheetHeight, `Frame is outside the sheet: ${expectedFrameId}`);
    const pivot = object(frame.pivot, `frame ${expectedFrameId} pivot`);
    expect(
      typeof pivot.x === 'number' &&
        pivot.x >= 0 &&
        pivot.x <= 1 &&
        typeof pivot.y === 'number' &&
        pivot.y >= 0 &&
        pivot.y <= 1,
      `Invalid frame pivot: ${expectedFrameId}`,
    );
    expect(typeof frame.sha256 === 'string' && sha256.test(frame.sha256), `Invalid frame hash: ${expectedFrameId}`);
    const motionFrames = frameIdsByMotion.get(frame.motionId) ?? [];
    motionFrames.push({ id: expectedFrameId, index: frameIndex });
    frameIdsByMotion.set(frame.motionId, motionFrames);
  }

  const motions = array(root.motions, 'motions');
  expect(motions.length > 0, 'Manifest motions must not be empty');
  const motionIds = new Set<string>();
  const referencedFrames = new Set<string>();
  for (const [position, value] of motions.entries()) {
    const motion = object(value, `motions[${position}]`);
    expect(
      typeof motion.motionId === 'string' && stableId.test(motion.motionId) && !motionIds.has(motion.motionId),
      `Invalid or duplicate motionId: ${motion.motionId}`,
    );
    motionIds.add(motion.motionId);
    positiveNumber(motion.fps, `motion ${motion.motionId} fps`);
    expect(typeof motion.loop === 'boolean', `Invalid loop setting for ${motion.motionId}`);
    const actualFrameIds = array(motion.frameIds, `motion ${motion.motionId} frameIds`);
    const expectedFrameIds = (frameIdsByMotion.get(motion.motionId) ?? [])
      .sort((left, right) => left.index - right.index)
      .map((frame) => frame.id);
    expect(
      actualFrameIds.length > 0 && JSON.stringify(actualFrameIds) === JSON.stringify(expectedFrameIds),
      `Frame order does not match frame records for ${motion.motionId}`,
    );
    for (const frameId of actualFrameIds) {
      expect(typeof frameId === 'string' && !referencedFrames.has(frameId), `Duplicate frame reference: ${frameId}`);
      referencedFrames.add(frameId);
    }
  }
  expect(referencedFrames.size === frameIds.size, 'Every frame must be referenced by exactly one motion');

  const fallbacks = object(root.fallbacks, 'fallbacks');
  for (const [motionId, fallbackId] of Object.entries(fallbacks)) {
    expect(
      stableId.test(motionId) &&
        !motionIds.has(motionId) &&
        typeof fallbackId === 'string' &&
        motionIds.has(fallbackId),
      `Invalid fallback mapping: ${motionId} -> ${String(fallbackId)}`,
    );
  }

  const summary = object(root.qaSummary, 'qaSummary');
  nonNegativeInteger(summary.errors, 'qaSummary.errors');
  nonNegativeInteger(summary.warnings, 'qaSummary.warnings');
  nonNegativeInteger(summary.infos, 'qaSummary.infos');
  expect(typeof root.contentHash === 'string' && sha256.test(root.contentHash), 'Invalid manifest contentHash');

  const hasApproval = root.approvedAt !== undefined || root.approvedBy !== undefined;
  if (hasApproval) {
    expect(
      typeof root.approvedAt === 'string' && !Number.isNaN(Date.parse(root.approvedAt)),
      'Invalid approvedAt timestamp',
    );
    expect(typeof root.approvedBy === 'string' && root.approvedBy.trim().length > 0, 'Invalid approvedBy value');
  }

  const manifest = value as AssetManifest;
  expect(manifest.contentHash === manifestContentHash(manifest), 'Manifest contentHash does not match its contents');
  return manifest;
}

export function validateQualityReport(value: unknown): QualityReport {
  const root = object(value, 'quality report');
  expect(root.schemaVersion === 1, 'Unsupported quality report schemaVersion');
  expect(typeof root.runId === 'string' && root.runId.length > 0, 'Invalid quality report runId');
  expect(typeof root.unitId === 'string' && stableId.test(root.unitId), 'Invalid quality report unitId');
  const summary = object(root.summary, 'quality report summary');
  nonNegativeInteger(summary.errors, 'summary.errors');
  nonNegativeInteger(summary.warnings, 'summary.warnings');
  nonNegativeInteger(summary.infos, 'summary.infos');
  const issues = array(root.issues, 'quality report issues');
  const severityCounts = { errors: 0, warnings: 0, infos: 0 };
  for (const entry of issues) {
    const issue = object(entry, 'quality report issue');
    expect(typeof issue.code === 'string' && issue.code.length > 0, 'Invalid quality issue code');
    expect(['error', 'warning', 'info'].includes(String(issue.severity)), 'Invalid quality issue severity');
    expect(typeof issue.message === 'string' && issue.message.length > 0, 'Invalid quality issue message');
    if (issue.severity === 'error') severityCounts.errors += 1;
    if (issue.severity === 'warning') severityCounts.warnings += 1;
    if (issue.severity === 'info') severityCounts.infos += 1;
  }
  expect(
    summary.errors === severityCounts.errors &&
      summary.warnings === severityCounts.warnings &&
      summary.infos === severityCounts.infos,
    'Quality report summary does not match its issues',
  );
  return value as QualityReport;
}
