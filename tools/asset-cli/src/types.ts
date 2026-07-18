export type UnitDefinition = {
  id: string;
  name: string;
  role: string;
  color: string;
  attackType: string;
};

export type InstructionDefinition = {
  id: string;
  action: string;
  fixedFor?: string;
  visualKind?: string;
};

export type GameData = {
  schemaVersion: number;
  units: UnitDefinition[];
  instructions: InstructionDefinition[];
  defaultPrograms: { unitId: string; actionIds: string[] }[];
  defaultReactions: { unitId: string; actionId: string | null }[];
};

export type MotionDefinition = {
  motionId: string;
  frames: number;
  fps: number;
  loop: boolean;
  fallbackMotionId: string | null;
  generationHints: string;
};

export type MotionConfig = {
  schemaVersion: number;
  motions: MotionDefinition[];
};

export type PipelineConfig = {
  schemaVersion: number;
  pipelineVersion: number;
  canvas: {
    width: number;
    height: number;
    topMargin: number;
    sideMargin: number;
    bottomMargin: number;
    pixelsPerUnit: number;
  };
  background: {
    candidates: string[];
    minimumPaletteDeltaE: number;
    removalDeltaE: number;
  };
  palette: { id: string; baseColors: string[] };
  processing: { minimumComponentArea: number; alphaThreshold: number; orderedDither: boolean };
  quality: Record<string, number>;
};

export type SourceFrame = {
  motionId: string;
  frameIndex: number;
  path: string;
  sha256: string;
};

export type GenerationRun = {
  schemaVersion: 1;
  runId: string;
  unitId: string;
  motionIds: string[];
  createdAt: string;
  provider: 'manual';
  model: null;
  seed: null;
  promptVersion: 1;
  promptHash: null;
  sourceGameSchemaVersion: number;
  pipelineVersion: number;
  backgroundColor: string;
  inputHashes: Record<string, string>;
  outputs: Record<string, string>;
  sourceFrames: SourceFrame[];
  status: 'generated' | 'normalized' | 'validated' | 'validation-failed' | 'approved' | 'published';
};

export type QualityReport = {
  schemaVersion: 1;
  runId: string;
  unitId: string;
  summary: { errors: number; warnings: number; infos: number };
  issues: { code: string; severity: 'error' | 'warning' | 'info'; message: string }[];
};

export type AssetManifest = {
  schemaVersion: 1;
  pipelineVersion: number;
  unitId: string;
  sourceRunId: string;
  sourceGameSchemaVersion: number;
  coordinateSystem: 'top-left';
  sheet: { fileName: string; width: number; height: number; sha256: string };
  palette: { id: string; sha256: string; colors: string[] };
  pixelsPerUnit: number;
  motions: { motionId: string; fps: number; loop: boolean; frameIds: string[] }[];
  frames: {
    frameId: string;
    motionId: string;
    frameIndex: number;
    rect: { x: number; y: number; width: number; height: number };
    pivot: { x: number; y: number };
    sha256: string;
  }[];
  fallbacks: Record<string, string>;
  qaSummary: { errors: number; warnings: number; infos: number };
  approvedAt?: string;
  approvedBy?: string;
  contentHash: string;
};
