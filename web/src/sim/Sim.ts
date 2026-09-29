// Thin typed wrapper around the Rust/WASM cellular automaton.

export interface SimExports {
  memory: WebAssembly.Memory;
  init(w: number, h: number, seed: number): void;
  generate(seed: number): void;
  clear_world(): void;
  step(n: number): void;
  render(x0: number, y0: number, x1: number, y1: number): void;
  mat_ptr(): number;
  var_ptr(): number;
  st_ptr(): number;
  rgba_ptr(): number;
  absorbed_ptr(): number;
  taken_ptr(): number;
  reset_absorbed(): void;
  mat_count(): number;
  mat_rgb(m: number): number;
  mat_kind(m: number): number;
  set_param(id: number, v: number): void;
  get_tick(): number;
  set_tick(t: number): void;
  tide_level(): number;
  core_rect(i: number): number;
  set_core_rect(x: number, y: number, w: number, h: number): void;
  active_chunks(): number;
  wake_all(): void;
  get_cell(x: number, y: number): number;
  get_pipe(x: number, y: number): number;
  vacuum(cx: number, cy: number, r: number, max: number, mask: number): number;
  emit(cx: number, cy: number, r: number, m: number, count: number): number;
  drill_area(cx: number, cy: number, r: number, p: number): number;
  place(x: number, y: number, m: number): number;
  place_pipe(x: number, y: number, dir: number): number;
  deconstruct(x: number, y: number): number;
  set_cell(x: number, y: number, m: number, data: number): void;
  count_mat(m: number): number;
}

export const P = {
  CONV_P: 0,
  SIEVE_P: 1,
  HEAT_P: 2,
  HEAT_R: 3,
  GLASS_P: 4,
  MAG_R: 5,
  MAG_SAMPLES: 6,
  DRILL_P: 7,
  DRILL_R: 8,
  SUN: 9,
  RANDOM_TICKS: 10,
  TIDE_ON: 11,
  TIDE_BASE: 12,
  TIDE_AMP: 13,
  TIDE_PERIOD: 14,
  SLUDGE_SPAWN: 15,
  SEA_COLS: 16,
  SETTLE_P: 17,
} as const;

/** Probability (0..1) to the fixed-point format used by the simulation. */
export const prob = (f: number) => Math.round(Math.max(0, Math.min(1, f)) * 65536);

export class Sim {
  readonly w: number;
  readonly h: number;
  private ex: SimExports;

  private constructor(ex: SimExports, w: number, h: number) {
    this.ex = ex;
    this.w = w;
    this.h = h;
  }

  static async load(bytes: BufferSource | Promise<BufferSource>, w: number, h: number, seed: number): Promise<Sim> {
    const { instance } = await WebAssembly.instantiate(await bytes, {});
    const ex = instance.exports as unknown as SimExports;
    ex.init(w, h, seed >>> 0);
    return new Sim(ex, w, h);
  }

  get api(): SimExports {
    return this.ex;
  }

  // Views must be re-created after memory growth, so build them on demand.
  private u8(ptr: number, len: number) {
    return new Uint8Array(this.ex.memory.buffer, ptr, len);
  }
  get mat() {
    return this.u8(this.ex.mat_ptr(), this.w * this.h);
  }
  get vars() {
    return this.u8(this.ex.var_ptr(), this.w * this.h);
  }
  get st() {
    return this.u8(this.ex.st_ptr(), this.w * this.h);
  }
  get rgba() {
    return new Uint8ClampedArray(this.ex.memory.buffer, this.ex.rgba_ptr(), this.w * this.h * 4);
  }
  absorbed(): Uint32Array {
    return new Uint32Array(this.ex.memory.buffer, this.ex.absorbed_ptr(), 32);
  }
  taken(): Uint32Array {
    return new Uint32Array(this.ex.memory.buffer, this.ex.taken_ptr(), 32);
  }

  /** Read and clear what the core inlets swallowed since the last call. */
  collectAbsorbed(): number[] {
    const a = Array.from(this.absorbed());
    this.ex.reset_absorbed();
    return a;
  }

  get core() {
    const e = this.ex;
    return { x: e.core_rect(0), y: e.core_rect(1), w: e.core_rect(2), h: e.core_rect(3) };
  }

  generate(seed: number) {
    this.ex.generate(seed >>> 0);
  }
  step(n = 1) {
    this.ex.step(n);
  }
  render(x0: number, y0: number, x1: number, y1: number) {
    this.ex.render(x0, y0, x1, y1);
  }
  setParam(id: number, v: number) {
    this.ex.set_param(id, Math.round(v));
  }
  get(x: number, y: number) {
    return this.ex.get_cell(x, y);
  }

  vacuum(cx: number, cy: number, r: number, max: number, mask: number): number[] {
    const n = this.ex.vacuum(cx, cy, r, max, mask >>> 0);
    return n ? Array.from(this.taken()) : [];
  }
  emit(cx: number, cy: number, r: number, m: number, count: number) {
    return this.ex.emit(cx, cy, r, m, count);
  }
  drill(cx: number, cy: number, r: number, p: number) {
    return this.ex.drill_area(cx, cy, r, prob(p));
  }
  place(x: number, y: number, m: number) {
    return this.ex.place(x, y, m) === 1;
  }
  placePipe(x: number, y: number, dir: number) {
    return this.ex.place_pipe(x, y, dir) === 1;
  }
  deconstruct(x: number, y: number) {
    return this.ex.deconstruct(x, y);
  }
}
