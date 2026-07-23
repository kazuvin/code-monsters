import { cellKey } from './circuit';
import { upgradeBlockDefinition } from './fusion';
import type { CircuitAnalysis } from './circuit';
import type {
  BlockDefinition,
  CellPosition,
  CircuitBoard,
  PacketImprint,
  PacketPayloadKind,
  SkillFusionRules,
} from './types';

type PacketPayloads = Partial<Record<PacketPayloadKind, number>>;

type CircuitPacket = {
  id: string;
  payloads: PacketPayloads;
  lastGenerated?: { kind: PacketPayloadKind; amount: number };
  imprint?: PacketImprint;
  echoed: boolean;
  recirculated: boolean;
  incomingFrom: string;
};

type QueuedPacket = {
  position: CellPosition;
  packet: CircuitPacket;
};

export type PacketAction =
  | {
      blockId: string;
      position: CellPosition;
      kind: 'damage' | 'shield' | 'repair' | 'poison' | 'coin';
      amount: number;
      charge?: number;
    }
  | {
      blockId: string;
      position: CellPosition;
      kind: 'rupture';
      amount: number;
      consume: number;
    };

export type PacketVisit = {
  blockId: string;
  position: CellPosition;
  payloads: PacketPayloads;
};

export type PacketResolution = {
  actions: PacketAction[];
  visits: PacketVisit[];
};

type ResolvePacketCircuitOptions = {
  board: CircuitBoard;
  blocks: BlockDefinition[];
  analysis: CircuitAnalysis;
  tick: number;
  fusionRules: SkillFusionRules;
};

const clonePacket = (packet: CircuitPacket): CircuitPacket => ({
  ...packet,
  payloads: { ...packet.payloads },
  ...(packet.lastGenerated ? { lastGenerated: { ...packet.lastGenerated } } : {}),
});

const hasPayload = (packet: CircuitPacket) =>
  Object.values(packet.payloads).some((amount) => amount !== undefined && amount > 0);

const addPayload = (packet: CircuitPacket, kind: PacketPayloadKind, amount: number) => {
  if (amount <= 0) return;
  packet.payloads[kind] = (packet.payloads[kind] ?? 0) + amount;
  packet.lastGenerated = { kind, amount };
};

const outputKind = (
  kind: Extract<PacketPayloadKind, 'damage' | 'shield' | 'repair'>,
  imprint: PacketImprint | undefined,
): Extract<PacketAction['kind'], 'damage' | 'shield' | 'repair'> => {
  if (imprint === 'assault') return 'damage';
  if (imprint === 'guard') return 'shield';
  if (imprint === 'renew') return 'repair';
  return kind;
};

const emitRemainingPayloads = (
  actions: PacketAction[],
  block: BlockDefinition,
  position: CellPosition,
  packet: CircuitPacket,
) => {
  (['damage', 'shield', 'repair'] as const).forEach((kind) => {
    const amount = packet.payloads[kind] ?? 0;
    if (amount <= 0) return;
    actions.push({ blockId: block.id, position, kind: outputKind(kind, packet.imprint), amount });
  });
  const poison = packet.payloads.poison ?? 0;
  if (poison > 0) actions.push({ blockId: block.id, position, kind: 'poison', amount: poison });
  const coin = packet.payloads.coin ?? 0;
  if (coin > 0) actions.push({ blockId: block.id, position, kind: 'coin', amount: coin });
};

const mergePackets = (packets: CircuitPacket[], incomingFrom: string): CircuitPacket => {
  const merged: CircuitPacket = {
    id: packets
      .map((packet) => packet.id)
      .sort()
      .join('+'),
    payloads: {},
    imprint: packets.find((packet) => packet.imprint)?.imprint,
    echoed: packets.some((packet) => packet.echoed),
    recirculated: packets.some((packet) => packet.recirculated),
    incomingFrom,
  };
  packets.forEach((packet) => {
    (Object.entries(packet.payloads) as Array<[PacketPayloadKind, number]>).forEach(([kind, amount]) => {
      merged.payloads[kind] = (merged.payloads[kind] ?? 0) + amount;
    });
  });
  const lastGenerated = [...packets].reverse().find((packet) => packet.lastGenerated)?.lastGenerated;
  if (lastGenerated) merged.lastGenerated = { ...lastGenerated };
  return merged;
};

const splitPacket = (packet: CircuitPacket, size: number, index: number): CircuitPacket => {
  const split = clonePacket(packet);
  split.id = `${packet.id}.${index + 1}`;
  (Object.entries(split.payloads) as Array<[PacketPayloadKind, number]>).forEach(([kind, amount]) => {
    split.payloads[kind] = amount / size;
  });
  if (split.lastGenerated) split.lastGenerated.amount /= size;
  return split;
};

const placedAt = (board: CircuitBoard, position: CellPosition) => board[position.row]?.[position.column] ?? null;

export function resolvePacketCircuit({
  board,
  blocks,
  analysis,
  tick,
  fusionRules,
}: ResolvePacketCircuitOptions): PacketResolution {
  const definitions = new Map(blocks.map((block) => [block.id, block]));
  const actions: PacketAction[] = [];
  const visits: PacketVisit[] = [];
  const mergeBuffers = new Map<string, CircuitPacket[]>();
  const queue: QueuedPacket[] = [...analysis.heartConnections].sort().map((key, index) => {
    const [row, column] = key.split(':').map(Number);
    return {
      position: { row, column },
      packet: {
        id: `root-${index + 1}`,
        payloads: {},
        echoed: false,
        recirculated: false,
        incomingFrom: 'heart',
      },
    };
  });

  while (queue.length > 0) {
    queue.sort(
      (left, right) =>
        (analysis.waveStep.get(cellKey(left.position)) ?? 0) - (analysis.waveStep.get(cellKey(right.position)) ?? 0) ||
        cellKey(left.position).localeCompare(cellKey(right.position)) ||
        left.packet.id.localeCompare(right.packet.id),
    );
    const current = queue.shift()!;
    const key = cellKey(current.position);
    const placed = placedAt(board, current.position);
    const baseBlock = placed ? definitions.get(placed.blockId) : undefined;
    if (!placed || !baseBlock?.packet) continue;
    const block = upgradeBlockDefinition(baseBlock, placed.stars ?? 0, fusionRules);
    const program = block.packet;
    if (!program) continue;

    let packet = clonePacket(current.packet);
    if (program.effects.some((effect) => effect.kind === 'merge-packet')) {
      const buffer = mergeBuffers.get(key) ?? [];
      if (!buffer.some((candidate) => candidate.incomingFrom === packet.incomingFrom)) buffer.push(packet);
      mergeBuffers.set(key, buffer);
      const expectedInputs = Math.max(2, analysis.upstreamCells.get(key)?.length ?? 0);
      if (buffer.length < expectedInputs) continue;
      packet = mergePackets(buffer, key);
      mergeBuffers.delete(key);
    }

    const active = !block.cooldown || (tick - 1) % block.cooldown === 0;
    let converted = false;
    for (const effect of program.effects) {
      if (effect.kind === 'generate-packet' && active) {
        addPayload(packet, effect.payload, effect.amount);
      }
      if (effect.kind === 'echo-packet' && !packet.echoed && packet.lastGenerated) {
        packet.payloads[packet.lastGenerated.kind] =
          (packet.payloads[packet.lastGenerated.kind] ?? 0) + packet.lastGenerated.amount;
        packet.echoed = true;
      }
      if (effect.kind === 'imprint-packet') packet.imprint = effect.imprint;
      if (effect.kind === 'recirculate-packet' && analysis.cyclicCells.has(key) && !packet.recirculated) {
        (Object.entries(packet.payloads) as Array<[PacketPayloadKind, number]>).forEach(([kind, amount]) => {
          packet.payloads[kind] = amount * 2;
        });
        if (packet.lastGenerated) packet.lastGenerated.amount *= 2;
        packet.recirculated = true;
      }
      if (effect.kind === 'convert-packet' && active) {
        const input = packet.payloads[effect.input] ?? 0;
        if (input <= 0) continue;
        const amount = effect.amount + input * effect.perUnit;
        delete packet.payloads[effect.input];
        converted = true;
        if (effect.output === 'rupture') {
          actions.push({
            blockId: block.id,
            position: current.position,
            kind: 'rupture',
            amount,
            consume: effect.consume ?? 0.5,
          });
        } else {
          actions.push({
            blockId: block.id,
            position: current.position,
            kind: outputKind(effect.output, packet.imprint),
            amount,
            ...(effect.input === 'charge' ? { charge: input } : {}),
          });
        }
      }
    }

    visits.push({
      blockId: block.id,
      position: current.position,
      payloads: { ...packet.payloads },
    });

    const downstream = [...(analysis.downstreamCells.get(key) ?? [])].sort((left, right) =>
      cellKey(left).localeCompare(cellKey(right)),
    );
    const terminal = program.terminal ?? program.effects.some((effect) => effect.kind === 'convert-packet');
    if (terminal || downstream.length === 0) {
      if (hasPayload(packet)) emitRemainingPayloads(actions, block, current.position, packet);
      continue;
    }

    const splits = program.effects.some((effect) => effect.kind === 'split-packet') && downstream.length > 1;
    const targets = splits ? downstream : downstream.slice(0, 1);
    targets.forEach((position, index) => {
      const outgoing = splits ? splitPacket(packet, targets.length, index) : clonePacket(packet);
      outgoing.incomingFrom = key;
      queue.push({ position, packet: outgoing });
    });

    if (converted && downstream.length === 0 && hasPayload(packet)) {
      emitRemainingPayloads(actions, block, current.position, packet);
    }
  }

  return { actions, visits };
}
