import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateAssetManifest, validateQualityReport } from './contracts.ts';
import { approvedRoot } from './paths.ts';
import { copyMappedFilesAtomically, readJson, sha256File, writeJson } from './files.ts';
import { loadRun, saveRun } from './run-store.ts';
import type { AssetManifest, QualityReport } from './types.ts';

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function validateRun(runId: string): Promise<{ report: QualityReport; manifest: AssetManifest }> {
  const { run, directory } = await loadRun(runId);
  if (!run.outputs.report || !run.outputs.manifest || !run.outputs.sheet) {
    throw new Error(`Run ${runId} has not been processed`);
  }
  const report = validateQualityReport(await readJson<unknown>(path.join(directory, run.outputs.report)));
  const manifest = validateAssetManifest(await readJson<unknown>(path.join(directory, run.outputs.manifest)));
  if (report.runId !== runId || manifest.sourceRunId !== runId || report.unitId !== run.unitId) {
    throw new Error(`Run ${runId} output identity does not match run metadata`);
  }
  const actualSheetHash = await sha256File(path.join(directory, run.outputs.sheet));
  if (actualSheetHash !== manifest.sheet.sha256) throw new Error(`Sprite sheet hash mismatch for run ${runId}`);
  if (
    manifest.qaSummary.errors !== report.summary.errors ||
    manifest.qaSummary.warnings !== report.summary.warnings ||
    manifest.qaSummary.infos !== report.summary.infos
  )
    throw new Error(`QA summary mismatch for run ${runId}`);
  return { report, manifest };
}

export async function approveRun(
  runId: string,
  approvedBy: string,
  replace: boolean,
): Promise<{ directory: string; manifest: AssetManifest }> {
  if (approvedBy.trim().length === 0) throw new Error('Reviewer name must not be empty');
  const { run, directory } = await loadRun(runId);
  const { report, manifest } = await validateRun(runId);
  if (report.summary.errors > 0) {
    throw new Error(`Run ${runId} has ${report.summary.errors} blocking quality error(s)`);
  }
  const targetDirectory = path.join(approvedRoot, run.unitId);
  if ((await pathExists(targetDirectory)) && !replace) {
    throw new Error(`Approved asset already exists for ${run.unitId}; pass --replace after reviewing the content hash`);
  }
  const approvedManifest: AssetManifest = {
    ...manifest,
    approvedAt: new Date().toISOString(),
    approvedBy: approvedBy.trim(),
  };
  validateAssetManifest(approvedManifest);
  await writeJson(path.join(directory, 'processed/manifest.approved.json'), approvedManifest);
  const runPreview = await readFile(path.join(directory, 'qa/report.html'), 'utf8');
  await writeFile(
    path.join(directory, 'qa/report.approved.html'),
    runPreview.replace('../processed/sprite-sheet.png', 'sprite-sheet.png'),
    'utf8',
  );
  await copyMappedFilesAtomically(directory, targetDirectory, [
    { source: 'processed/sprite-sheet.png', target: 'sprite-sheet.png' },
    { source: 'processed/manifest.approved.json', target: 'manifest.json' },
    { source: 'qa/report.json', target: 'qa-report.json' },
    { source: 'qa/report.approved.html', target: 'qa-report.html' },
  ]);
  run.status = 'approved';
  await saveRun(directory, run);
  return { directory: targetDirectory, manifest: approvedManifest };
}
