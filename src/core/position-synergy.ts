import type { GameBalanceData } from '../data.ts';
import type { Instruction } from '../types.ts';
import { effectsByKind } from './instruction-effects.ts';

export type PositionMetricId = 'placer' | 'trigger' | 'selfMove' | 'forcedMove' | 'interaction';
export type PositionInstructionRef = Pick<Instruction, 'id' | 'title'>;
export type PositionSynergyPack = {
  zoneId: string;
  label: string;
  description: string;
  placers: PositionInstructionRef[];
  selfMovers: PositionInstructionRef[];
  forcedMovers: PositionInstructionRef[];
  statusLabels: string[];
  triggerCount: number;
  interactionCount: number;
  ready: boolean;
};
export type PositionSynergyReport = {
  packs: PositionSynergyPack[];
  readyPacks: number;
  issues: Array<{ zoneId: string; code: string; message: string }>;
};

const ref = ({ id, title }: Instruction): PositionInstructionRef => ({ id, title });
const hasMoveMode = (instruction: Instruction, modes: string[]) =>
  effectsByKind(instruction, 'move').some((effect) => modes.includes(effect.mode));

export const positionMetricCount = (pack: PositionSynergyPack, metric: PositionMetricId): number => {
  switch (metric) {
    case 'placer':
      return pack.placers.length;
    case 'trigger':
      return pack.triggerCount;
    case 'selfMove':
      return pack.selfMovers.length;
    case 'forcedMove':
      return pack.forcedMovers.length;
    case 'interaction':
      return pack.interactionCount;
  }
};

export function analyzePositionSynergies(data: GameBalanceData): PositionSynergyReport {
  const selfMovers = data.instructions.filter((instruction) =>
    hasMoveMode(instruction, ['advance', 'retreat', 'jump']),
  );
  const forcedMovers = data.instructions.filter(
    (instruction) =>
      hasMoveMode(instruction, ['throwTarget', 'pullTarget']) ||
      effectsByKind(instruction, 'damage').some((effect) => (effect.knockbackPower ?? 0) > 0),
  );
  const packs = data.battleZones.map((zone): PositionSynergyPack => {
    const placers = data.instructions.filter((instruction) =>
      effectsByKind(instruction, 'placeZone').some((effect) => effect.zoneId === zone.id),
    );
    const triggerCount = zone.trigger.effects.length > 0 ? 1 : 0;
    const statusLabels = [
      ...new Set(
        zone.trigger.effects.map(
          (effect) => data.statuses.find((status) => status.id === effect.statusId)?.label ?? effect.statusId,
        ),
      ),
    ];
    const interactionCount = placers.length * (selfMovers.length + forcedMovers.length);
    return {
      zoneId: zone.id,
      label: zone.label,
      description: zone.description,
      placers: placers.map(ref),
      selfMovers: selfMovers.map(ref),
      forcedMovers: forcedMovers.map(ref),
      statusLabels,
      triggerCount,
      interactionCount,
      ready:
        placers.length > 0 &&
        triggerCount > 0 &&
        selfMovers.length > 0 &&
        forcedMovers.length > 0 &&
        interactionCount > 0,
    };
  });
  const issues = packs.flatMap((pack) => {
    const checks = [
      ['MISSING_ZONE_PLACER', pack.placers.length > 0, '設置技がありません'],
      ['MISSING_ZONE_TRIGGER', pack.triggerCount > 0, 'エリア発動効果がありません'],
      ['MISSING_SELF_MOVEMENT', pack.selfMovers.length > 0, '自発移動との連携がありません'],
      ['MISSING_FORCED_MOVEMENT', pack.forcedMovers.length > 0, '強制移動との連携がありません'],
    ] as const;
    return checks.flatMap(([code, passed, message]) =>
      passed ? [] : [{ zoneId: pack.zoneId, code, message: `設置エリア ${pack.zoneId}: ${message}` }],
    );
  });
  return { packs, readyPacks: packs.filter((pack) => pack.ready).length, issues };
}
