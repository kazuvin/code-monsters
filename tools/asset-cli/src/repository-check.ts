import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { validateAssetManifest } from './contracts.ts';
import { loadGameData, loadMotionConfig, loadPipelineConfig } from './config.ts';
import { readJson, sha256File } from './files.ts';
import { approvedRoot, unitSpecsRoot } from './paths.ts';

type CheckResult = {
  units: number;
  motions: number;
  unitSpecs: number;
  approvedAssets: number;
};

async function directories(root: string): Promise<string[]> {
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function checkRepositoryAssets(): Promise<CheckResult> {
  const data = await loadGameData();
  const motions = await loadMotionConfig();
  await loadPipelineConfig();
  const unitIds = new Set(data.units.map((unit) => unit.id));
  let unitSpecs = 0;
  for (const entry of await readdir(unitSpecsRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const spec = await readJson<{ schemaVersion: number; unitId: string }>(path.join(unitSpecsRoot, entry.name));
    if (spec.schemaVersion !== 1 || !unitIds.has(spec.unitId) || entry.name !== `${spec.unitId}.json`) {
      throw new Error(`Invalid unit art spec: ${entry.name}`);
    }
    unitSpecs += 1;
  }

  let approvedAssets = 0;
  for (const unitId of await directories(approvedRoot)) {
    if (!unitIds.has(unitId)) throw new Error(`Approved asset has unknown unit ID: ${unitId}`);
    const directory = path.join(approvedRoot, unitId);
    const manifest = validateAssetManifest(await readJson<unknown>(path.join(directory, 'manifest.json')));
    if (
      manifest.schemaVersion !== 1 ||
      manifest.unitId !== unitId ||
      manifest.qaSummary.errors !== 0 ||
      !manifest.approvedAt ||
      !manifest.approvedBy
    ) {
      throw new Error(`Approved manifest is invalid: ${unitId}`);
    }
    const sheetPath = path.join(directory, manifest.sheet.fileName);
    await access(sheetPath);
    if ((await sha256File(sheetPath)) !== manifest.sheet.sha256) {
      throw new Error(`Approved sprite sheet hash mismatch: ${unitId}`);
    }
    approvedAssets += 1;
  }

  return { units: data.units.length, motions: motions.motions.length, unitSpecs, approvedAssets };
}
