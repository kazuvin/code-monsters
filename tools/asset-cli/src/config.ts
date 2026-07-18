import { readJson } from './files.ts';
import { gameDataPath, motionConfigPath, pipelineConfigPath } from './paths.ts';
import type { GameData, MotionConfig, PipelineConfig, UnitDefinition } from './types.ts';

const stableId = /^[a-z][a-z0-9-]*$/;

export async function loadGameData(): Promise<GameData> {
  const data = await readJson<GameData>(gameDataPath);
  if (!Number.isInteger(data.schemaVersion) || !Array.isArray(data.units) || !Array.isArray(data.instructions)) {
    throw new Error('game-data/game-balance.json does not match the asset CLI contract');
  }
  return data;
}

export async function loadMotionConfig(): Promise<MotionConfig> {
  const config = await readJson<MotionConfig>(motionConfigPath);
  if (config.schemaVersion !== 1 || !Array.isArray(config.motions) || config.motions.length === 0) {
    throw new Error('Unsupported or empty motion configuration');
  }
  const ids = new Set<string>();
  for (const motion of config.motions) {
    if (!stableId.test(motion.motionId) || ids.has(motion.motionId)) {
      throw new Error(`Invalid or duplicate motionId: ${motion.motionId}`);
    }
    if (!Number.isInteger(motion.frames) || motion.frames < 1 || motion.fps <= 0) {
      throw new Error(`Invalid timing for motion: ${motion.motionId}`);
    }
    ids.add(motion.motionId);
  }
  for (const motion of config.motions) {
    if (motion.fallbackMotionId && !ids.has(motion.fallbackMotionId)) {
      throw new Error(`Unknown fallback ${motion.fallbackMotionId} for ${motion.motionId}`);
    }
  }
  return config;
}

export async function loadPipelineConfig(): Promise<PipelineConfig> {
  const config = await readJson<PipelineConfig>(pipelineConfigPath);
  if (config.schemaVersion !== 1 || config.pipelineVersion < 1) {
    throw new Error(`Unsupported pipeline configuration: ${config.schemaVersion}`);
  }
  return config;
}

export function findUnit(data: GameData, unitId: string): UnitDefinition {
  if (!stableId.test(unitId)) throw new Error(`Invalid unit ID: ${unitId}`);
  const unit = data.units.find((candidate) => candidate.id === unitId);
  if (!unit) throw new Error(`Unknown unit ID: ${unitId}`);
  return unit;
}
