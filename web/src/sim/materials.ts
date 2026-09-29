// Mirrors sim/src/materials.rs – keep ids in sync (checked by materials.test.ts).
export const M = {
  EMPTY: 0,
  ROCK: 1,
  BEDROCK: 2,
  SAND: 3,
  WETSAND: 4,
  SLUDGE: 5,
  WATER: 6,
  GRAVEL: 7,
  SHELL: 8,
  MAGNETITE: 9,
  SALT: 10,
  STEAM: 11,
  GLASS: 12,
  WALL: 13,
  CONV_L: 14,
  CONV_R: 15,
  SIEVE: 16,
  DRYER: 17,
  FURNACE: 18,
  MAGNET: 19,
  INLET: 20,
  DRILL: 21,
} as const;

export type MatId = (typeof M)[keyof typeof M];
export const MAT_COUNT = 22;

export const MAT_KEYS: Record<number, string> = {
  0: 'empty',
  1: 'rock',
  2: 'bedrock',
  3: 'sand',
  4: 'wetsand',
  5: 'sludge',
  6: 'water',
  7: 'gravel',
  8: 'shell',
  9: 'magnetite',
  10: 'salt',
  11: 'steam',
  12: 'glass',
  13: 'wall',
  14: 'conveyor',
  15: 'conveyor',
  16: 'sieve',
  17: 'dryer',
  18: 'furnace',
  19: 'magnet',
  20: 'inlet',
  21: 'drill',
};

/** Base colours (same as Rust) for UI swatches. */
export const MAT_COLORS: Record<number, string> = {
  1: '#6b6560',
  2: '#2e2a2b',
  3: '#e2c98f',
  4: '#a88a5a',
  5: '#5e5140',
  6: '#2f6fa8',
  7: '#8e8a84',
  8: '#e9e1d0',
  9: '#3a3f4a',
  10: '#f4f4f0',
  11: '#c8d4dc',
  12: '#9fe3e0',
  13: '#7a5332',
  14: '#4a4f57',
  15: '#4a4f57',
  16: '#b5a27a',
  17: '#c2512e',
  18: '#f08a24',
  19: '#8b3fb8',
  20: '#3fd0a0',
  21: '#d4b21f',
};

/** Materials that can be carried in the vacuum tank. */
export const LOOSE: number[] = [M.SAND, M.WETSAND, M.SLUDGE, M.WATER, M.GRAVEL, M.SHELL, M.MAGNETITE, M.SALT, M.GLASS];
