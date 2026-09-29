// All tunable numbers live here so balancing never needs code changes.
import { M } from '../sim/materials';

export const WORLD = {
  width: 1024,
  height: 512,
  ticksPerSecond: 60,
  /** Real seconds for a full day/night cycle. */
  dayLength: 8 * 60,
  startCredits: 50,
};

/** Value of one delivered cell. `fp` = research points. */
export const MATERIAL_VALUE: Record<number, { credits: number; fp: number }> = {
  [M.SAND]: { credits: 1, fp: 0.01 },
  [M.WETSAND]: { credits: 0.4, fp: 0.002 },
  [M.SLUDGE]: { credits: 0.2, fp: 0 },
  [M.WATER]: { credits: 0, fp: 0 },
  [M.GRAVEL]: { credits: 1.5, fp: 0.015 },
  [M.SHELL]: { credits: 3, fp: 0.05 },
  [M.MAGNETITE]: { credits: 5, fp: 0.1 },
  [M.SALT]: { credits: 6, fp: 0.08 },
  [M.GLASS]: { credits: 12, fp: 0.25 },
};

export type BuildMode = 'brush' | 'stamp' | 'pipe';

export interface BuildDef {
  id: string;
  /** Material placed (for pipes: 0 – direction chosen at placement). */
  mat: number;
  cost: number;
  mode: BuildMode;
  /** Research node that unlocks it, or null if available from the start. */
  unlock: string | null;
  hotkey?: string;
}

export const BUILDINGS: BuildDef[] = [
  { id: 'wall', mat: M.WALL, cost: 1, mode: 'brush', unlock: null },
  { id: 'conveyor', mat: M.CONV_R, cost: 4, mode: 'brush', unlock: 'conv' },
  { id: 'sieve', mat: M.SIEVE, cost: 5, mode: 'brush', unlock: 'sieve' },
  { id: 'dryer', mat: M.DRYER, cost: 30, mode: 'brush', unlock: 'dryer' },
  { id: 'pipe', mat: 0, cost: 6, mode: 'pipe', unlock: 'pipe' },
  { id: 'magnet', mat: M.MAGNET, cost: 60, mode: 'stamp', unlock: 'magnet' },
  { id: 'drill', mat: M.DRILL, cost: 80, mode: 'stamp', unlock: 'drillm' },
  { id: 'furnace', mat: M.FURNACE, cost: 120, mode: 'brush', unlock: 'furnace' },
  { id: 'inlet', mat: M.INLET, cost: 400, mode: 'brush', unlock: 'inlet' },
];

/** Share of the build cost returned when deconstructing. */
export const REFUND = 0.5;

/** Base player/tool stats before research. */
export const BASE_STATS = {
  vacCap: 300,
  vacRadius: 6,
  vacRate: 14, // cells per tick
  emitRate: 10, // cells per tick
  emitRadius: 3,
  reach: 56, // tool range around the player's hand (cells)
  drillPower: 0.02, // chance per rock cell per tick
  drillRadius: 5,
  priceMult: 1,
  // simulation parameters (fed into the Rust side)
  convP: 0.5,
  sieveP: 0.35,
  heatP: 0.25,
  heatR: 1,
  glassP: 0.15,
  magR: 6,
  magSamples: 6,
  drillP: 0.04,
  drillR: 40, // shaft depth of auto drills
  sun: 0.08,
};

export type Stats = typeof BASE_STATS;
