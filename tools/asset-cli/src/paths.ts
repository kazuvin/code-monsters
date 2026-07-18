import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const gameDataPath = path.join(repositoryRoot, 'game-data/game-balance.json');
export const pipelineConfigPath = path.join(repositoryRoot, 'game-assets/config/pipeline.json');
export const motionConfigPath = path.join(repositoryRoot, 'game-assets/config/motions.json');
export const unitSpecsRoot = path.join(repositoryRoot, 'game-assets/specs/units');
export const runsRoot = path.join(repositoryRoot, 'game-assets/runs');
export const approvedRoot = path.join(repositoryRoot, 'game-assets/approved');
export const webGeneratedRoot = path.join(repositoryRoot, 'src/assets/generated/units');
export const unityGeneratedRoot = path.join(
  repositoryRoot,
  'unity/CodeMonsters/Assets/CodeMonsters/Presentation/Generated',
);
export const pythonProjectRoot = path.join(repositoryRoot, 'tools/sprite-pipeline');

export function resolveInside(root: string, child: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, child);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Path escapes its allowed root: ${child}`);
  }
  return resolved;
}
