import type { CommandDefinition, ShopOffer } from './types';

const randomUnit = (seed: number) => {
  const value = Math.sin(seed * 9301 + 49297) * 233280;
  return value - Math.floor(value);
};

const pickWeighted = (commands: CommandDefinition[], seed: number) => {
  const total = commands.reduce((sum, command) => sum + (command.shopWeight ?? 1), 0);
  let cursor = randomUnit(seed) * total;
  for (const command of commands) {
    cursor -= command.shopWeight ?? 1;
    if (cursor <= 0) return command;
  }
  return commands[commands.length - 1];
};

export function createShop(commands: CommandDefinition[], seed: number, size: number): ShopOffer[] {
  if (commands.length < size) throw new Error('Shop size exceeds the command pool');
  const used = new Set<string>();
  return Array.from({ length: size }, (_, slot) => {
    const candidates = commands.filter((command) => !used.has(command.id));
    const command = pickWeighted(candidates, seed * 17 + slot * 31 + 7);
    used.add(command.id);
    return { id: `${seed}-${slot}-${command.id}`, slot, commandId: command.id, locked: false };
  });
}

export function rerollShop(
  commands: CommandDefinition[],
  current: ShopOffer[],
  seed: number,
  size: number,
): ShopOffer[] {
  const retained = new Map(current.filter((offer) => offer.locked).map((offer) => [offer.slot, offer]));
  const used = new Set([...retained.values()].map((offer) => offer.commandId));
  return Array.from({ length: size }, (_, slot) => {
    const locked = retained.get(slot);
    if (locked) return locked;
    const candidates = commands.filter((command) => !used.has(command.id));
    const command = pickWeighted(candidates, seed * 17 + slot * 31 + 7);
    used.add(command.id);
    return { id: `${seed}-${slot}-${command.id}`, slot, commandId: command.id, locked: false };
  });
}
