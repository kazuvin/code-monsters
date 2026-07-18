import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { findUnit, loadGameData, loadMotionConfig, loadPipelineConfig } from './config.ts';
import { readJson, writeJson } from './files.ts';
import { pythonProjectRoot, repositoryRoot } from './paths.ts';
import { loadRun, saveRun } from './run-store.ts';
import type { QualityReport } from './types.ts';

function runCommand(
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repositoryRoot, env: environment });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += String(chunk)));
    child.stderr.on('data', (chunk) => (stderr += String(chunk)));
    child.on('error', reject);
    child.on('close', (exitCode) => resolve({ stdout, stderr, exitCode: exitCode ?? 1 }));
  });
}

function resolveFallbacks(
  motions: Awaited<ReturnType<typeof loadMotionConfig>>['motions'],
  selectedMotionIds: Set<string>,
): Record<string, string> {
  const motionById = new Map(motions.map((motion) => [motion.motionId, motion]));
  const result: Record<string, string> = {};
  for (const motion of motions) {
    if (selectedMotionIds.has(motion.motionId)) continue;
    const visited = new Set([motion.motionId]);
    let fallback = motion.fallbackMotionId;
    while (fallback && !selectedMotionIds.has(fallback)) {
      if (visited.has(fallback)) throw new Error(`Motion fallback cycle detected at ${fallback}`);
      visited.add(fallback);
      fallback = motionById.get(fallback)?.fallbackMotionId ?? null;
    }
    if (fallback) result[motion.motionId] = fallback;
  }
  return result;
}

export async function processRun(runId: string): Promise<QualityReport> {
  const { run, directory } = await loadRun(runId);
  if (!['generated', 'normalized', 'validated', 'validation-failed'].includes(run.status)) {
    throw new Error(`Run ${runId} cannot be processed from status ${run.status}`);
  }
  const data = await loadGameData();
  const unit = findUnit(data, run.unitId);
  const pipeline = await loadPipelineConfig();
  const motionConfig = await loadMotionConfig();
  const selectedMotions = motionConfig.motions.filter((motion) => run.motionIds.includes(motion.motionId));
  const selectedMotionIds = new Set(selectedMotions.map((motion) => motion.motionId));
  const palette = [...new Set([...pipeline.palette.baseColors, unit.color.toUpperCase()])];
  const outputDirectory = path.join(directory, 'processed');
  const requestPath = path.join(directory, 'process-request.json');
  await writeJson(requestPath, {
    schemaVersion: 1,
    runId: run.runId,
    unitId: run.unitId,
    sourceGameSchemaVersion: run.sourceGameSchemaVersion,
    pipelineVersion: run.pipelineVersion,
    outputDirectory,
    backgroundColor: run.backgroundColor,
    palette: { id: pipeline.palette.id, colors: palette },
    settings: {
      canvas: pipeline.canvas,
      background: pipeline.background,
      processing: pipeline.processing,
      quality: pipeline.quality,
      unitAccentColor: unit.color.toUpperCase(),
    },
    motions: selectedMotions,
    fallbacks: resolveFallbacks(motionConfig.motions, selectedMotionIds),
    frames: run.sourceFrames.map((frame) => ({
      motionId: frame.motionId,
      frameIndex: frame.frameIndex,
      path: path.join(directory, frame.path),
    })),
  });

  const python = path.join(
    pythonProjectRoot,
    '.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  );
  try {
    await access(python);
  } catch {
    throw new Error('Python asset environment is missing; run pnpm assets:python:setup');
  }
  const result = await runCommand(python, ['-m', 'sprite_pipeline', 'process', '--request', requestPath], process.env);
  if (![0, 2].includes(result.exitCode)) {
    throw new Error(`Python sprite processing failed (${result.exitCode}): ${result.stderr || result.stdout}`);
  }
  const reportPath = path.join(directory, 'qa/report.json');
  const report = await readJson<QualityReport>(reportPath);
  run.outputs = {
    manifest: path.relative(directory, path.join(outputDirectory, 'manifest.json')),
    sheet: path.relative(directory, path.join(outputDirectory, 'sprite-sheet.png')),
    report: path.relative(directory, reportPath),
    preview: path.relative(directory, path.join(directory, 'qa/report.html')),
  };
  run.status = report.summary.errors === 0 ? 'validated' : 'validation-failed';
  await saveRun(directory, run);
  return report;
}
