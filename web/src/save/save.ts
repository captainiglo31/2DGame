import type { GameState } from '../game/state';
import type { Sim } from '../sim/Sim';
import { fromBase64, rleDecode, rleEncode, toBase64 } from './codec';

export const SAVE_FORMAT = 'abyssal-drift-save';
export const SAVE_VERSION = 1;
export const SLOTS = ['auto', '1', '2', '3'] as const;
export type Slot = (typeof SLOTS)[number];

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  savedAt: number;
  w: number;
  h: number;
  tick: number;
  core: [number, number, number, number];
  surface: number[];
  state: GameState;
  cells: string;
  data: string;
  pipes: string;
}

export interface SaveMeta {
  slot: Slot;
  savedAt: number;
  credits: number;
  contract: number;
  playTime: number;
  creative: boolean;
}

const key = (slot: Slot) => `abyssal.save.${slot}`;
const metaKey = (slot: Slot) => `abyssal.meta.${slot}`;

export function serialize(sim: Sim, state: GameState, surface: number[]): SaveFile {
  const n = sim.w * sim.h;
  const vars = sim.vars;
  const data = new Uint8Array(n);
  for (let i = 0; i < n; i++) data[i] = vars[i] >> 5;
  const c = sim.core;
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: Date.now(),
    w: sim.w,
    h: sim.h,
    tick: sim.api.get_tick(),
    core: [c.x, c.y, c.w, c.h],
    surface,
    state: structuredClone(state),
    cells: toBase64(rleEncode(sim.mat)),
    data: toBase64(rleEncode(data)),
    pipes: toBase64(rleEncode(sim.st)),
  };
}

export function validate(f: unknown): f is SaveFile {
  if (!f || typeof f !== 'object') return false;
  const s = f as Partial<SaveFile>;
  return (
    s.format === SAVE_FORMAT &&
    typeof s.version === 'number' &&
    s.version <= SAVE_VERSION &&
    typeof s.w === 'number' &&
    typeof s.h === 'number' &&
    typeof s.cells === 'string' &&
    typeof s.data === 'string' &&
    typeof s.pipes === 'string' &&
    !!s.state &&
    Array.isArray(s.core)
  );
}

/** Write a save into the simulation. The world must have matching dimensions. */
export function restore(sim: Sim, f: SaveFile) {
  if (f.w !== sim.w || f.h !== sim.h) throw new Error('world size mismatch');
  const n = sim.w * sim.h;
  const cells = rleDecode(fromBase64(f.cells), n);
  const data = rleDecode(fromBase64(f.data), n);
  const pipes = rleDecode(fromBase64(f.pipes), n);
  sim.mat.set(cells);
  sim.st.set(pipes);
  const vars = sim.vars;
  for (let i = 0; i < n; i++) vars[i] = (data[i] << 5) | (Math.imul(i, 2654435761) >>> 27);
  sim.api.set_tick(f.tick);
  sim.api.set_core_rect(...f.core);
  sim.api.wake_all();
}

function store(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function writeSlot(slot: Slot, f: SaveFile): boolean {
  const meta: SaveMeta = {
    slot,
    savedAt: f.savedAt,
    credits: f.state.credits,
    contract: f.state.contractIndex,
    playTime: f.state.stats.playTime,
    creative: f.state.creative,
  };
  try {
    store()?.setItem(key(slot), JSON.stringify(f));
    store()?.setItem(metaKey(slot), JSON.stringify(meta));
    return true;
  } catch {
    return false;
  }
}

export function readSlot(slot: Slot): SaveFile | null {
  try {
    const raw = store()?.getItem(key(slot));
    if (!raw) return null;
    const f = JSON.parse(raw);
    return validate(f) ? f : null;
  } catch {
    return null;
  }
}

export function readMeta(slot: Slot): SaveMeta | null {
  try {
    const raw = store()?.getItem(metaKey(slot));
    return raw ? (JSON.parse(raw) as SaveMeta) : null;
  } catch {
    return null;
  }
}

export function deleteSlot(slot: Slot) {
  store()?.removeItem(key(slot));
  store()?.removeItem(metaKey(slot));
}

export function latestSlot(): Slot | null {
  let best: SaveMeta | null = null;
  for (const s of SLOTS) {
    const m = readMeta(s);
    if (m && (!best || m.savedAt > best.savedAt)) best = m;
  }
  return best?.slot ?? null;
}
