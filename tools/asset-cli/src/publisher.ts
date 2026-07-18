import path from 'node:path';
import { validateAssetManifest } from './contracts.ts';
import { approvedRoot, unityGeneratedRoot, webGeneratedRoot } from './paths.ts';
import { copyFilesAtomically, copyFilesPreservingDirectory, readJson } from './files.ts';
import { loadRun, saveRun } from './run-store.ts';

export async function publishUnit(unitId: string): Promise<{ web: string; unity: string; contentHash: string }> {
  const sourceDirectory = path.join(approvedRoot, unitId);
  const manifest = validateAssetManifest(await readJson<unknown>(path.join(sourceDirectory, 'manifest.json')));
  if (manifest.unitId !== unitId || !manifest.approvedAt || !manifest.approvedBy) {
    throw new Error(`Approved manifest is missing approval metadata for ${unitId}`);
  }
  const sourceFiles = ['sprite-sheet.png', 'qa-report.json', 'qa-report.html', 'manifest.json'];
  const webDirectory = path.join(webGeneratedRoot, unitId);
  const unityDirectory = path.join(unityGeneratedRoot, unitId);
  await copyFilesAtomically(sourceDirectory, webDirectory, sourceFiles);
  await copyFilesPreservingDirectory(sourceDirectory, unityDirectory, sourceFiles);

  const { run, directory } = await loadRun(manifest.sourceRunId);
  run.status = 'published';
  await saveRun(directory, run);
  return { web: webDirectory, unity: unityDirectory, contentHash: manifest.contentHash };
}
