import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, filePath);
}

export async function sha256File(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

export function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function copyFilesAtomically(
  sourceDirectory: string,
  targetDirectory: string,
  fileNames: string[],
): Promise<void> {
  const stagingDirectory = `${targetDirectory}.staging`;
  await rm(stagingDirectory, { recursive: true, force: true });
  await mkdir(stagingDirectory, { recursive: true });
  for (const fileName of fileNames) {
    await mkdir(path.dirname(path.join(stagingDirectory, fileName)), { recursive: true });
    await copyFile(path.join(sourceDirectory, fileName), path.join(stagingDirectory, fileName));
  }
  await rm(targetDirectory, { recursive: true, force: true });
  await rename(stagingDirectory, targetDirectory);
}

export async function copyFilesPreservingDirectory(
  sourceDirectory: string,
  targetDirectory: string,
  fileNames: string[],
): Promise<void> {
  const stagingDirectory = path.join(targetDirectory, '.publish-staging');
  await rm(stagingDirectory, { recursive: true, force: true });
  await mkdir(stagingDirectory, { recursive: true });
  for (const fileName of fileNames) {
    const stagedPath = path.join(stagingDirectory, fileName);
    await mkdir(path.dirname(stagedPath), { recursive: true });
    await copyFile(path.join(sourceDirectory, fileName), stagedPath);
  }
  for (const fileName of fileNames) {
    const targetPath = path.join(targetDirectory, fileName);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await rm(targetPath, { force: true });
    await rename(path.join(stagingDirectory, fileName), targetPath);
  }
  await rm(stagingDirectory, { recursive: true, force: true });
}

export async function copyMappedFilesAtomically(
  sourceDirectory: string,
  targetDirectory: string,
  files: { source: string; target: string }[],
): Promise<void> {
  const stagingDirectory = `${targetDirectory}.staging`;
  await rm(stagingDirectory, { recursive: true, force: true });
  await mkdir(stagingDirectory, { recursive: true });
  for (const file of files) {
    const targetPath = path.join(stagingDirectory, file.target);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(path.join(sourceDirectory, file.source), targetPath);
  }
  await rm(targetDirectory, { recursive: true, force: true });
  await rename(stagingDirectory, targetDirectory);
}
