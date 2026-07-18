import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { chooseBackgroundColor } from './colors.ts';
import { findUnit, loadGameData, loadMotionConfig, loadPipelineConfig } from './config.ts';
import { readJson, sha256File, sha256Text, writeJson } from './files.ts';
import { resolveInside, runsRoot } from './paths.ts';
import { deriveMotionRequirements } from './requirements.ts';
import type { GenerationRun, SourceFrame } from './types.ts';

function createRunId(unitId: string, motionIds: string[], now: Date): string {
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'z')
    .toLowerCase();
  const suffix = sha256Text(`${unitId}:${motionIds.join(',')}:${now.toISOString()}`).slice(0, 8);
  return `${timestamp}-${unitId}-${suffix}`;
}

export async function importManualRun(input: {
  unitId: string;
  motionIds?: string[];
  sourceDirectory: string;
  backgroundColor?: string;
  now?: Date;
}): Promise<GenerationRun> {
  const data = await loadGameData();
  const unit = findUnit(data, input.unitId);
  const motions = await loadMotionConfig();
  const pipeline = await loadPipelineConfig();
  const requirements = deriveMotionRequirements(data, motions, unit.id);
  const motionIds = input.motionIds?.length ? input.motionIds : requirements.requiredMotionIds;
  const motionById = new Map(motions.motions.map((motion) => [motion.motionId, motion]));
  for (const motionId of motionIds) if (!motionById.has(motionId)) throw new Error(`Unknown motion ID: ${motionId}`);

  const palette = [...pipeline.palette.baseColors, unit.color.toUpperCase()];
  const backgroundColor = (
    input.backgroundColor ??
    chooseBackgroundColor(pipeline.background.candidates, palette, pipeline.background.minimumPaletteDeltaE)
  ).toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(backgroundColor)) throw new Error(`Invalid background color: ${backgroundColor}`);

  const now = input.now ?? new Date();
  const runId = createRunId(unit.id, motionIds, now);
  const runDirectory = resolveInside(runsRoot, runId);
  try {
    await stat(runDirectory);
    throw new Error(`Run already exists: ${runId}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const sourceFrames: SourceFrame[] = [];
  const inputHashes: Record<string, string> = {};
  for (const motionId of motionIds) {
    const motion = motionById.get(motionId)!;
    const sourceMotionDirectory = path.resolve(input.sourceDirectory, motionId);
    const entries = (await readdir(sourceMotionDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
      .map((entry) => entry.name)
      .sort();
    if (entries.length !== motion.frames) {
      throw new Error(`${motionId} requires ${motion.frames} PNG files; found ${entries.length}`);
    }
    for (const [frameIndex, fileName] of entries.entries()) {
      const sourcePath = path.join(sourceMotionDirectory, fileName);
      const relativePath = path.join('source', motionId, `${frameIndex.toString().padStart(3, '0')}.png`);
      const targetPath = path.join(runDirectory, relativePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
      const sha256 = await sha256File(targetPath);
      inputHashes[`${motionId}/${frameIndex}`] = sha256;
      sourceFrames.push({ motionId, frameIndex, path: relativePath, sha256 });
    }
  }

  const run: GenerationRun = {
    schemaVersion: 1,
    runId,
    unitId: unit.id,
    motionIds,
    createdAt: now.toISOString(),
    provider: 'manual',
    model: null,
    seed: null,
    promptVersion: 1,
    promptHash: null,
    sourceGameSchemaVersion: data.schemaVersion,
    pipelineVersion: pipeline.pipelineVersion,
    backgroundColor,
    inputHashes,
    outputs: {},
    sourceFrames,
    status: 'generated',
  };
  await writeJson(path.join(runDirectory, 'run.json'), run);
  return run;
}

export async function loadRun(runId: string): Promise<{ run: GenerationRun; directory: string }> {
  const directory = resolveInside(runsRoot, runId);
  const run = await readJson<GenerationRun>(path.join(directory, 'run.json'));
  if (run.schemaVersion !== 1 || run.runId !== runId) throw new Error(`Invalid run metadata: ${runId}`);
  return { run, directory };
}

export async function saveRun(directory: string, run: GenerationRun): Promise<void> {
  await writeJson(path.join(directory, 'run.json'), run);
}
