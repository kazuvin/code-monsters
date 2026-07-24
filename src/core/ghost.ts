import { createRivalBuild } from './rival';
import type { GameData } from './types';

export const createGhostTeam = (data: GameData, cycle: number, seed: number) =>
  createRivalBuild(data, cycle, seed).team;
