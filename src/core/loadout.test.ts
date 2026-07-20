import { describe, expect, it } from 'vitest';
import { availableCopies, equipCommand } from './loadout';
import type { ProgramBoard } from './types';

const program: ProgramBoard = [
  ['charge', 'strike', 'loop', 'burst'],
  ['guard', 'strike', 'loop', 'guard'],
  ['charge', 'link', 'repair', 'strike'],
];
const inventory = [
  'strike',
  'strike',
  'strike',
  'guard',
  'guard',
  'charge',
  'charge',
  'burst',
  'loop',
  'loop',
  'link',
  'repair',
];

describe('loadout', () => {
  it('does not equip a copy that is already in use', () => {
    expect(availableCopies(inventory, program, 'repair')).toBe(0);
    expect(equipCommand(inventory, program, { lane: 0, slot: 0 }, 'repair')).toEqual(program);
  });

  it('uses a newly purchased copy and returns the replaced command to the rack', () => {
    const expandedInventory = [...inventory, 'repair'];
    const next = equipCommand(expandedInventory, program, { lane: 0, slot: 0 }, 'repair');

    expect(next[0][0]).toBe('repair');
    expect(availableCopies(expandedInventory, next, 'charge')).toBe(1);
  });
});
