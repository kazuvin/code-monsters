import assert from 'node:assert/strict';
import {
  createDebugFighters,
  createDefaultDebugStatuses,
  readDebugStatusValues,
  runDebugSimulation,
} from '../src/core/debug-simulation.ts';
import { BATTLE_CONFIG, DEBUG_TRAINING_CONFIG, INSTRUCTIONS, UNITS } from '../src/data.ts';

const unitById = new Map(UNITS.map((unit) => [unit.id, unit]));
const defaultActor = unitById.get('volt') ?? UNITS[0];
const defaultTarget = unitById.get('bastion') ?? UNITS[0];

const makeInput = (overrides = {}) => ({
  actorUnitId: defaultActor.id,
  instructionId: INSTRUCTIONS[0].id,
  conditionId: INSTRUCTIONS[0].condition,
  targetSelectorId: INSTRUCTIONS[0].defaultTarget,
  targetUnitId: defaultTarget.id,
  mode: 'single',
  durationSeconds: 10,
  initialGauge: BATTLE_CONFIG.abilityGaugeMax,
  actorHpRatio: 1,
  targetMaxHp: 99_999,
  targetDefense: defaultTarget.defense,
  targetWeight: defaultTarget.weight,
  targetRole: defaultTarget.role,
  positionPresetId: DEBUG_TRAINING_CONFIG.defaultPositionPresetId,
  actorStatuses: createDefaultDebugStatuses(),
  targetStatuses: createDefaultDebugStatuses(),
  ...overrides,
});

for (const status of DEBUG_TRAINING_CONFIG.statuses) {
  const activeValue = status.control === 'stacks' ? Math.max(1, status.min ?? 0) : 1;
  for (const side of ['actorStatuses', 'targetStatuses']) {
    const input = makeInput({ [side]: { ...createDefaultDebugStatuses(), [status.id]: activeValue } });
    const fighter = createDebugFighters(input).find((candidate) =>
      side === 'actorStatuses' ? candidate.team === 'ally' : candidate.team === 'enemy',
    );
    assert.ok(fighter, `${status.id} の${side}検証用ユニットを作れません`);
    assert.ok(readDebugStatusValues(fighter)[status.id] > 0, `${status.id} が${side}へ反映されていません`);
  }
}

for (const preset of DEBUG_TRAINING_CONFIG.positionPresets) {
  const fighters = createDebugFighters(makeInput({ positionPresetId: preset.id }));
  const actor = fighters.find((fighter) => fighter.team === 'ally');
  const target = fighters.find((fighter) => fighter.team === 'enemy');
  assert.ok(actor && target, `${preset.id} の配置ユニットを作れません`);
  const distance = Math.abs(actor.x - target.x);
  const referenceRange =
    preset.rangeReference === 'mutual'
      ? Math.min(actor.range, target.range)
      : preset.rangeReference === 'actor'
        ? actor.range
        : target.range;
  if (preset.relation === 'inside') assert.ok(distance <= referenceRange, `${preset.id} が射程内ではありません`);
  else assert.ok(distance > referenceRange, `${preset.id} が射程外ではありません`);
}

for (const instruction of INSTRUCTIONS) {
  const actor =
    (instruction.fixedFor && unitById.get(instruction.fixedFor)) ||
    (instruction.action === 'heal' ? unitById.get('mender') : undefined) ||
    defaultActor;
  const targetStatuses = createDefaultDebugStatuses();
  if (instruction.condition === 'enemyHasStatus') targetStatuses.poison = 1;
  const input = makeInput({
    actorUnitId: actor.id,
    instructionId: instruction.id,
    conditionId: instruction.condition,
    targetSelectorId: instruction.defaultTarget,
    actorHpRatio: instruction.condition === 'selfHpBelow30' || instruction.action === 'heal' ? 0.25 : 1,
    positionPresetId:
      instruction.condition === 'targetOutOfRange'
        ? DEBUG_TRAINING_CONFIG.positionPresets.find(
            (preset) => preset.rangeReference === 'actor' && preset.relation === 'outside',
          )?.id
        : DEBUG_TRAINING_CONFIG.defaultPositionPresetId,
    targetStatuses,
  });
  const result = runDebugSimulation(input);
  assert.ok(result.attempts > 0, `${instruction.id} がデバッグ計測の判定対象になっていません`);
  assert.ok(result.executions > 0, `${instruction.id} をデバッグルームで実行できません`);
}

console.log(
  JSON.stringify({
    instructions: INSTRUCTIONS.length,
    statuses: DEBUG_TRAINING_CONFIG.statuses.length,
    positionPresets: DEBUG_TRAINING_CONFIG.positionPresets.length,
  }),
);
