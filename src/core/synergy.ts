import type { ConditionDefinition, GameBalanceData } from '../data.ts';
import type { Instruction, StatusCounterplayKind, StatusDefinition } from '../types.ts';
import { effectsByKind } from './instruction-effects.ts';

export type SynergyInstructionRef = {
  id: string;
  title: string;
  fixedFor: string | null;
};

export type SynergyCheck = {
  id: 'producer' | 'consumer' | 'crossUnit' | 'counterplay';
  label: string;
  passed: boolean;
  detail: string;
};

export type StatusSynergyReport = {
  statusId: string;
  label: string;
  description: string;
  mode: StatusDefinition['synergy']['mode'];
  standaloneReason: string | null;
  producers: SynergyInstructionRef[];
  consumers: SynergyInstructionRef[];
  conditions: Array<Pick<ConditionDefinition, 'id' | 'label'>>;
  counterplay: {
    kind: StatusCounterplayKind;
    description: string;
    verified: boolean;
  };
  checks: SynergyCheck[];
  ready: boolean;
};

export type SynergyIssue = {
  code: 'MISSING_STATUS_PRODUCER' | 'MISSING_STATUS_CONSUMER' | 'MISSING_CROSS_UNIT_SYNERGY' | 'INVALID_COUNTERPLAY';
  statusId: string;
  message: string;
};

export type SynergyReport = {
  packs: StatusSynergyReport[];
  issues: SynergyIssue[];
  readyPacks: number;
  comboPacks: number;
  standalonePacks: number;
};

const instructionRef = (instruction: Instruction): SynergyInstructionRef => ({
  id: instruction.id,
  title: instruction.title,
  fixedFor: instruction.fixedFor ?? null,
});

const hasDistinctOwners = (data: GameBalanceData, producers: Instruction[], consumers: Instruction[]) => {
  const owners = (instruction: Instruction) =>
    instruction.fixedFor ? [instruction.fixedFor] : data.units.map((unit) => unit.id);
  return producers.some((producer) =>
    consumers.some((consumer) =>
      owners(producer).some((producerOwner) =>
        owners(consumer).some((consumerOwner) => producerOwner !== consumerOwner),
      ),
    ),
  );
};

const verifiesCounterplay = (
  data: GameBalanceData,
  status: StatusDefinition,
  producers: Instruction[],
  consumers: Instruction[],
) => {
  switch (status.synergy.counterplay.kind) {
    case 'expires':
      return (
        status.duration.mode === 'application' &&
        producers.some((instruction) =>
          effectsByKind(instruction, 'applyStatus').some(
            (effect) => effect.statusId === status.id && (effect.durationSeconds ?? 0) > 0,
          ),
        )
      );
    case 'clearsOnAction':
      return status.clearOnAction;
    case 'consumedBySkill':
      return consumers.length > 0;
    case 'lowHpRequirement':
      return producers.some((instruction) => {
        const condition = data.conditions.find((candidate) => candidate.id === instruction.condition);
        return condition?.kind === 'selfHpBelow' && (condition.params.threshold ?? 1) < 1;
      });
  }
};

const check = (id: SynergyCheck['id'], label: string, passed: boolean, detail: string): SynergyCheck => ({
  id,
  label,
  passed,
  detail,
});

export function analyzeSynergies(data: GameBalanceData): SynergyReport {
  const packs = data.statuses.map((status): StatusSynergyReport => {
    const producers = data.instructions.filter((instruction) =>
      effectsByKind(instruction, 'applyStatus').some((effect) => effect.statusId === status.id),
    );
    const consumers = data.instructions.filter((instruction) =>
      effectsByKind(instruction, 'consumeStatus').some((effect) => effect.statusId === status.id),
    );
    const conditions = data.conditions.filter(
      (condition) => condition.kind === 'targetHasStatus' && condition.params.statusId === status.id,
    );
    const isCombo = status.synergy.mode === 'combo';
    const producerReady = producers.length > 0;
    const consumerReady = !isCombo || consumers.length > 0;
    const crossUnitReady = !isCombo || hasDistinctOwners(data, producers, consumers);
    const counterplayReady = verifiesCounterplay(data, status, producers, consumers);
    const checks = [
      check(
        'producer',
        '付与技',
        producerReady,
        producerReady ? `${producers.length}件` : '状態を付与する技がありません',
      ),
      check(
        'consumer',
        '利用・消費技',
        consumerReady,
        isCombo ? (consumerReady ? `${consumers.length}件` : '状態を消費する技がありません') : '単独完結型',
      ),
      check(
        'crossUnit',
        '別ユニット連携',
        crossUnitReady,
        isCombo ? (crossUnitReady ? '異なるユニットで連携可能' : '付与役と利用役が同一です') : '単独完結型',
      ),
      check(
        'counterplay',
        '対抗手段',
        counterplayReady,
        counterplayReady ? status.synergy.counterplay.description : '定義と実装が一致していません',
      ),
    ];
    return {
      statusId: status.id,
      label: status.label,
      description: status.description,
      mode: status.synergy.mode,
      standaloneReason: status.synergy.standaloneReason ?? null,
      producers: producers.map(instructionRef),
      consumers: consumers.map(instructionRef),
      conditions: conditions.map(({ id, label }) => ({ id, label })),
      counterplay: {
        kind: status.synergy.counterplay.kind,
        description: status.synergy.counterplay.description,
        verified: counterplayReady,
      },
      checks,
      ready: checks.every((candidate) => candidate.passed),
    };
  });
  const issues = packs.flatMap((pack): SynergyIssue[] => {
    const mappings: Array<[SynergyCheck['id'], SynergyIssue['code']]> = [
      ['producer', 'MISSING_STATUS_PRODUCER'],
      ['consumer', 'MISSING_STATUS_CONSUMER'],
      ['crossUnit', 'MISSING_CROSS_UNIT_SYNERGY'],
      ['counterplay', 'INVALID_COUNTERPLAY'],
    ];
    return mappings.flatMap(([checkId, code]) => {
      const result = pack.checks.find((candidate) => candidate.id === checkId);
      return result?.passed
        ? []
        : [{ code, statusId: pack.statusId, message: `状態 ${pack.statusId}: ${result?.detail ?? '不明な不備'}` }];
    });
  });
  return {
    packs,
    issues,
    readyPacks: packs.filter((pack) => pack.ready).length,
    comboPacks: packs.filter((pack) => pack.mode === 'combo').length,
    standalonePacks: packs.filter((pack) => pack.mode === 'standalone').length,
  };
}
