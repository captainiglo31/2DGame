import { audio } from '../audio/audio';
import { BUILDINGS, REFUND, WORLD, type BuildDef, type Stats } from '../data/balance';
import { RESEARCH_BY_ID } from '../data/research';
import { t } from '../i18n';
import { LOOSE, M, MAT_COLORS } from '../sim/materials';
import { P, prob, type Sim } from '../sim/Sim';
import type { Settings } from '../settings';
import { restore, serialize, writeSlot, type SaveFile, type Slot } from '../save/save';
import {
  checkContract,
  computeStats,
  deliver,
  doResearch,
  inventoryTotal,
  isUnlocked,
  newState,
  spend,
  type GameState,
} from './state';

export type ToolId = 'vacuum' | 'drill' | 'build' | 'remove';
export const TOOLS: ToolId[] = ['vacuum', 'drill', 'build', 'remove'];

export interface GameEvents {
  toast(msg: string, kind?: 'info' | 'good' | 'warn'): void;
  contractDone(id: string): void;
  researchDone(id: string): void;
  alphaComplete(): void;
  pause(): void;
  openResearch(): void;
  toggleContracts(): void;
}

interface Pointer {
  sx: number;
  sy: number;
  wx: number;
  wy: number;
  lastWx: number;
  lastWy: number;
  primary: boolean;
  secondary: boolean;
  middle: boolean;
  inside: boolean;
}

export class Game {
  readonly sim: Sim;
  state: GameState;
  stats: Stats;
  settings: Settings;
  events: GameEvents;

  tool: ToolId = 'vacuum';
  buildId = 'wall';
  conveyorDir: 1 | -1 = 1;
  pipeDir = 1;
  brush = 2;
  selectedMat: number = M.SAND;
  pickupWater = false;
  /** Touch UI: primary action ejects instead of sucking. */
  emitMode = false;
  paused = true;
  debug = false;

  camera = { x: 0, y: 0, zoom: 3 };
  surface: number[] = [];

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private worldCanvas: HTMLCanvasElement;
  private worldCtx: CanvasRenderingContext2D;
  private bgCanvas: HTMLCanvasElement;
  private image: ImageData | null = null;
  private pointer: Pointer = { sx: 0, sy: 0, wx: 0, wy: 0, lastWx: 0, lastWy: 0, primary: false, secondary: false, middle: false, inside: false };
  private keys = new Set<string>();
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; zoom: number; cx: number; cy: number; camX: number; camY: number } | null = null;
  private acc = 0;
  private last = 0;
  private autosaveTimer = 0;
  private warnCooldown = 0;
  private fps = 0;
  private simMs = 0;
  private actionFlags = { vac: false, drill: false, emit: false };
  private lastStamp = { x: -99, y: -99 };
  private deliveredFlash = 0;
  private floaters: { x: number; y: number; text: string; age: number }[] = [];
  private pendingIncome = 0;
  private incomeTimer = 0;
  dayTime = 0.12;

  constructor(canvas: HTMLCanvasElement, sim: Sim, settings: Settings, events: GameEvents) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.sim = sim;
    this.settings = settings;
    this.events = events;
    this.state = newState(1);
    this.stats = computeStats([]);
    this.worldCanvas = document.createElement('canvas');
    this.worldCanvas.width = sim.w;
    this.worldCanvas.height = sim.h;
    this.worldCtx = this.worldCanvas.getContext('2d')!;
    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = sim.w;
    this.bgCanvas.height = sim.h;
    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ------------------------------------------------------------ lifecycle

  newGame(seed: number, creative = false) {
    this.sim.generate(seed);
    this.state = newState(seed, creative);
    this.sim.api.set_tick(0);
    this.computeSurface();
    this.afterStateChange();
    this.camera.zoom = 3;
    this.focusCore();
    this.dayTime = 0.12;
    this.floaters = [];
  }

  load(f: SaveFile) {
    restore(this.sim, f);
    this.state = f.state;
    // forward-compatible defaults for older saves
    this.state.stats ??= { delivered: {}, earned: 0, playTime: 0, built: 0 };
    this.state.contractProgress ??= {};
    this.surface = f.surface?.length === this.sim.w ? f.surface : [];
    if (!this.surface.length) this.computeSurface();
    else this.drawBackground();
    this.sim.collectAbsorbed();
    this.afterStateChange();
    this.camera.zoom = 3;
    this.focusCore();
    this.floaters = [];
  }

  save(slot: Slot): boolean {
    return writeSlot(slot, serialize(this.sim, this.state, this.surface));
  }

  exportSave(): SaveFile {
    return serialize(this.sim, this.state, this.surface);
  }

  /** Recompute derived stats and push them into the simulation. */
  afterStateChange() {
    this.stats = computeStats(this.state.research);
    const s = this.stats;
    const sim = this.sim;
    sim.setParam(P.CONV_P, prob(s.convP));
    sim.setParam(P.SIEVE_P, prob(s.sieveP));
    sim.setParam(P.HEAT_P, prob(s.heatP));
    sim.setParam(P.HEAT_R, s.heatR);
    sim.setParam(P.GLASS_P, prob(s.glassP));
    sim.setParam(P.MAG_R, s.magR);
    sim.setParam(P.MAG_SAMPLES, s.magSamples);
    sim.setParam(P.DRILL_P, prob(s.drillP));
    sim.setParam(P.DRILL_R, s.drillR);
    if (!isUnlocked(this.state, BUILDINGS.find((b) => b.id === this.buildId)?.unlock ?? null)) this.buildId = 'wall';
  }

  research(id: string): boolean {
    if (!doResearch(this.state, id)) {
      audio.play('error');
      return false;
    }
    this.afterStateChange();
    audio.play('unlock');
    this.events.researchDone(id);
    if (RESEARCH_BY_ID[id].final) this.events.alphaComplete();
    this.checkContracts();
    return true;
  }

  focusCore() {
    const c = this.sim.core;
    this.camera.x = c.x + c.w / 2;
    this.camera.y = c.y - 10;
    this.clampCamera();
  }

  start() {
    const loop = (now: number) => {
      this.frame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private computeSurface() {
    const { w, h } = this.sim;
    const mat = this.sim.mat;
    this.surface = new Array(w);
    for (let x = 0; x < w; x++) {
      let y = 0;
      while (y < h) {
        const m = mat[y * w + x];
        if (m !== M.EMPTY && m !== M.WATER && m !== M.STEAM) break;
        y++;
      }
      this.surface[x] = y;
    }
    this.drawBackground();
  }

  /** Dark back wall behind everything that was underground at generation. */
  private drawBackground() {
    const { w, h } = this.sim;
    const ctx = this.bgCanvas.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    const d = new Uint32Array(img.data.buffer);
    for (let x = 0; x < w; x++) {
      const s = this.surface[x] + 3;
      for (let y = Math.max(0, s); y < h; y++) {
        const depth = Math.min(1, (y - s) / 160);
        const n = ((x * 7 + y * 13) ^ (x * y)) & 7;
        const r = 58 - depth * 34 + n;
        const g = 46 - depth * 26 + n;
        const b = 40 - depth * 16 + n;
        d[y * w + x] = 0xff000000 | (b << 16) | (g << 8) | r;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---------------------------------------------------------------- loop

  private frame(now: number) {
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    if (dt > 0) this.fps = this.fps * 0.95 + (1 / dt) * 0.05;
    this.panCamera(dt);

    if (!this.paused) {
      this.state.stats.playTime += dt;
      this.dayTime = (this.dayTime + dt / WORLD.dayLength) % 1;
      this.sim.setParam(P.SUN, prob(this.stats.sun * this.daylight()));
      this.acc += dt * this.settings.simSpeed;
      let ticks = Math.floor(this.acc * WORLD.ticksPerSecond);
      this.acc -= ticks / WORLD.ticksPerSecond;
      ticks = Math.min(ticks, 4);
      const t0 = performance.now();
      this.actionFlags = { vac: false, drill: false, emit: false };
      for (let i = 0; i < ticks; i++) {
        this.applyTool();
        this.sim.step(1);
      }
      this.simMs = this.simMs * 0.9 + (performance.now() - t0) * 0.1;
      this.collectDeliveries();
      this.updateFloaters(dt);
      this.autosave(dt);
      this.warnCooldown = Math.max(0, this.warnCooldown - dt);
      this.deliveredFlash = Math.max(0, this.deliveredFlash - dt);
    } else {
      this.actionFlags = { vac: false, drill: false, emit: false };
    }
    audio.update(this.actionFlags.vac, this.actionFlags.drill, this.actionFlags.emit);
    this.render();
  }

  daylight(): number {
    const s = Math.sin(this.dayTime * Math.PI * 2);
    return Math.max(0, Math.min(1, (s + 0.15) / 0.4));
  }

  isNight() {
    return this.daylight() < 0.5;
  }

  tideRising(): boolean {
    const period = 60 * 90;
    const tick = this.sim.api.get_tick() % period;
    return Math.cos((tick / period) * Math.PI * 2) > 0;
  }

  private autosave(dt: number) {
    if (this.settings.autosaveMin <= 0) return;
    this.autosaveTimer += dt;
    if (this.autosaveTimer >= this.settings.autosaveMin * 60) {
      this.autosaveTimer = 0;
      if (this.save('auto')) this.events.toast(`${t('menu.autosave')} ✓`);
    }
  }

  private collectDeliveries() {
    const counts = this.sim.collectAbsorbed();
    if (!counts.some((c) => c > 0)) return;
    const gained = deliver(this.state, counts, this.stats);
    if (gained.credits >= 1) {
      audio.play('sell');
      this.deliveredFlash = 0.4;
    }
    this.pendingIncome += gained.credits;
    this.checkContracts();
  }

  private updateFloaters(dt: number) {
    this.incomeTimer += dt;
    if (this.incomeTimer > 0.6 && this.pendingIncome >= 1) {
      const c = this.sim.core;
      this.floaters.push({ x: c.x + c.w / 2 + (Math.random() - 0.5) * 8, y: c.y - 4, text: `+${Math.floor(this.pendingIncome)}¢`, age: 0 });
      this.pendingIncome = 0;
      this.incomeTimer = 0;
    }
    for (const f of this.floaters) f.age += dt;
    this.floaters = this.floaters.filter((f) => f.age < 1.6);
  }

  /** Material under the cursor, for the HUD. */
  hoverMaterial(): number {
    if (!this.pointer.inside) return -1;
    return this.sim.get(Math.floor(this.pointer.wx), Math.floor(this.pointer.wy));
  }

  checkContracts() {
    for (;;) {
      const done = checkContract(this.state);
      if (!done) break;
      audio.play('contract');
      this.events.contractDone(done.id);
    }
  }

  private warn(msg: string) {
    if (this.warnCooldown > 0) return;
    this.warnCooldown = 1.5;
    this.events.toast(msg, 'warn');
    audio.play('error');
  }

  // --------------------------------------------------------------- tools

  private emitting(): boolean {
    return this.tool === 'vacuum' && (this.pointer.secondary || (this.pointer.primary && this.emitMode));
  }

  private applyTool() {
    const p = this.pointer;
    if (!p.inside || (!p.primary && !p.secondary)) {
      p.lastWx = p.wx;
      p.lastWy = p.wy;
      return;
    }
    const x = Math.floor(p.wx);
    const y = Math.floor(p.wy);
    const s = this.stats;
    switch (this.tool) {
      case 'vacuum':
        if (this.emitting()) this.emit(x, y);
        else if (p.primary) this.suck(x, y);
        break;
      case 'drill':
        if (p.primary) {
          this.sim.drill(x, y, s.drillRadius, s.drillPower);
          this.actionFlags.drill = true;
        }
        break;
      case 'build':
        if (p.primary) this.buildAlong();
        else if (p.secondary) this.removeAt(x, y);
        break;
      case 'remove':
        this.removeAt(x, y);
        break;
    }
    p.lastWx = p.wx;
    p.lastWy = p.wy;
  }

  private suck(x: number, y: number) {
    const s = this.stats;
    const room = s.vacCap - inventoryTotal(this.state);
    if (room <= 0) {
      this.warn(t('hud.tankFull'));
      return;
    }
    let mask = 0;
    for (const m of LOOSE) if (m !== M.WATER || this.pickupWater) mask |= 1 << m;
    const got = this.sim.vacuum(x, y, s.vacRadius, Math.min(s.vacRate, room), mask);
    this.actionFlags.vac = true;
    const inv = this.state.inventory;
    for (let m = 0; m < got.length; m++) {
      if (got[m]) inv[m] = (inv[m] ?? 0) + got[m];
    }
    if (!inv[this.selectedMat]) this.cycleMaterial(1, true);
  }

  private emit(x: number, y: number) {
    const inv = this.state.inventory;
    if (!inv[this.selectedMat]) this.cycleMaterial(1, true);
    const m = this.selectedMat;
    const have = inv[m] ?? 0;
    if (have <= 0) {
      this.warn(t('hud.tankEmpty'));
      return;
    }
    const n = this.sim.emit(x, y, this.stats.emitRadius, m, Math.min(this.stats.emitRate, have));
    this.actionFlags.emit = true;
    inv[m] = have - n;
    if (inv[m] <= 0) delete inv[m];
  }

  /** Pick the next material in the tank. */
  cycleMaterial(dir: number, onlyIfEmpty = false) {
    const inv = this.state.inventory;
    const have = LOOSE.filter((m) => (inv[m] ?? 0) > 0);
    if (!have.length) return;
    if (onlyIfEmpty && inv[this.selectedMat]) return;
    const i = have.indexOf(this.selectedMat);
    const next = i < 0 ? 0 : (i + dir + have.length) % have.length;
    this.selectedMat = have[next];
  }

  get buildDef(): BuildDef {
    return BUILDINGS.find((b) => b.id === this.buildId) ?? BUILDINGS[0];
  }

  /** Cells covered by the brush / stamp at (x, y). */
  brushCells(x: number, y: number): [number, number][] {
    const def = this.buildDef;
    const out: [number, number][] = [];
    const size = def.mode === 'stamp' ? 3 : this.tool === 'remove' ? this.brush + 1 : this.brush;
    const o = Math.floor((size - 1) / 2);
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) out.push([x - o + dx, y - o + dy]);
    return out;
  }

  private buildAlong() {
    const p = this.pointer;
    const def = this.buildDef;
    const x1 = Math.floor(p.wx);
    const y1 = Math.floor(p.wy);
    const x0 = Math.floor(p.lastWx);
    const y0 = Math.floor(p.lastWy);
    // drag direction drives belts & pipes
    const ddx = x1 - x0;
    const ddy = y1 - y0;
    if (ddx || ddy) {
      if (def.id === 'conveyor' && ddx) this.conveyorDir = ddx > 0 ? 1 : -1;
      if (def.id === 'pipe') {
        if (Math.abs(ddx) >= Math.abs(ddy)) this.pipeDir = ddx > 0 ? 2 : 4;
        else this.pipeDir = ddy > 0 ? 3 : 1;
      }
    }
    if (def.mode === 'stamp') {
      if (Math.abs(x1 - this.lastStamp.x) < 3 && Math.abs(y1 - this.lastStamp.y) < 3) return;
      this.placeCells(this.brushCells(x1, y1), def, true);
      this.lastStamp = { x: x1, y: y1 };
      return;
    }
    // Bresenham between last and current position
    const steps = Math.max(Math.abs(ddx), Math.abs(ddy), 1);
    const cells: [number, number][] = [];
    const seen = new Set<number>();
    for (let i = 0; i <= steps; i++) {
      const cx = Math.round(x0 + (ddx * i) / steps);
      const cy = Math.round(y0 + (ddy * i) / steps);
      for (const c of this.brushCells(cx, cy)) {
        const k = c[1] * this.sim.w + c[0];
        if (!seen.has(k)) {
          seen.add(k);
          cells.push(c);
        }
      }
    }
    this.placeCells(cells, def, false);
  }

  private placeCells(cells: [number, number][], def: BuildDef, atomic: boolean) {
    if (!isUnlocked(this.state, def.unlock)) return;
    const sim = this.sim;
    const valid = cells.filter(([x, y]) => this.canPlace(x, y, def));
    if (atomic && valid.length !== cells.length) {
      this.warn(t('hud.cantBuild'));
      return;
    }
    let placed = 0;
    if (atomic && !spend(this.state, def.cost * valid.length)) {
      this.warn(t('hud.noCredits'));
      return;
    }
    for (const [x, y] of valid) {
      if (!atomic && !spend(this.state, def.cost)) {
        this.warn(t('hud.noCredits'));
        break;
      }
      const ok = def.mode === 'pipe' ? sim.placePipe(x, y, this.pipeDir) : sim.place(x, y, this.matFor(def));
      if (ok) placed++;
      else if (!this.state.creative) this.state.credits += def.cost;
    }
    if (placed) {
      this.state.stats.built += placed;
      audio.play('place');
    }
  }

  private matFor(def: BuildDef): number {
    if (def.id === 'conveyor') return this.conveyorDir > 0 ? M.CONV_R : M.CONV_L;
    return def.mat;
  }

  canPlace(x: number, y: number, def: BuildDef): boolean {
    if (x < 0 || y < 0 || x >= this.sim.w || y >= this.sim.h) return false;
    const m = this.sim.get(x, y);
    if (def.mode === 'pipe') {
      return this.sim.api.get_pipe(x, y) === 0 && (m === M.EMPTY || LOOSE.includes(m) || m === M.STEAM);
    }
    return m === M.EMPTY || m === M.WATER || m === M.SLUDGE || m === M.STEAM;
  }

  private removeAt(x: number, y: number) {
    let refund = 0;
    let n = 0;
    const size = this.brush + 1;
    const o = Math.floor((size - 1) / 2);
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const r = this.sim.deconstruct(x - o + dx, y - o + dy);
        if (!r) continue;
        n++;
        const def = r >= 100 ? BUILDINGS.find((b) => b.id === 'pipe') : BUILDINGS.find((b) => b.mat === r || (r === M.CONV_L && b.id === 'conveyor'));
        if (def) refund += def.cost * REFUND;
      }
    }
    if (n) {
      if (!this.state.creative) this.state.credits += refund;
      audio.play('remove');
    }
  }

  // --------------------------------------------------------------- input

  private bindInput() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    c.addEventListener('pointerleave', () => (this.pointer.inside = false));
    c.addEventListener('pointerenter', () => (this.pointer.inside = true));
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointer.primary = this.pointer.secondary = this.pointer.middle = false;
    });
  }

  private updatePointer(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.sx = e.clientX - r.left;
    this.pointer.sy = e.clientY - r.top;
    const w = this.screenToWorld(this.pointer.sx, this.pointer.sy);
    this.pointer.wx = w.x;
    this.pointer.wy = w.y;
  }

  private onPointerDown(e: PointerEvent) {
    audio.unlock();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.updatePointer(e);
    this.pointer.inside = true;
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        this.pointer.primary = false;
        this.startPinch();
        return;
      }
      if (this.touches.size > 2) return;
    }
    this.pointer.lastWx = this.pointer.wx;
    this.pointer.lastWy = this.pointer.wy;
    this.lastStamp = { x: -99, y: -99 };
    if (e.button === 0) this.pointer.primary = true;
    if (e.button === 2) this.pointer.secondary = true;
    if (e.button === 1) {
      this.pointer.middle = true;
      e.preventDefault();
    }
  }

  private onPointerMove(e: PointerEvent) {
    const prevSx = this.pointer.sx;
    const prevSy = this.pointer.sy;
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.touches.size >= 2) {
        this.updatePinch();
        return;
      }
    }
    this.updatePointer(e);
    if (this.pointer.middle) {
      this.camera.x -= (this.pointer.sx - prevSx) / this.camera.zoom;
      this.camera.y -= (this.pointer.sy - prevSy) / this.camera.zoom;
      this.clampCamera();
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinch = null;
      if (this.touches.size === 0) this.pointer.primary = false;
      return;
    }
    if (e.button === 0) this.pointer.primary = false;
    if (e.button === 2) this.pointer.secondary = false;
    if (e.button === 1) this.pointer.middle = false;
  }

  private startPinch() {
    const [a, b] = [...this.touches.values()];
    this.pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      zoom: this.camera.zoom,
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      camX: this.camera.x,
      camY: this.camera.y,
    };
  }

  private updatePinch() {
    const p = this.pinch!;
    const [a, b] = [...this.touches.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    this.camera.zoom = Math.max(1, Math.min(10, (p.zoom * dist) / p.dist));
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    this.camera.x = p.camX - (cx - p.cx) / this.camera.zoom;
    this.camera.y = p.camY - (cy - p.cy) / this.camera.zoom;
    this.clampCamera();
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      this.brush = Math.max(1, Math.min(6, this.brush + (e.deltaY < 0 ? 1 : -1)));
      return;
    }
    const before = this.screenToWorld(this.pointer.sx, this.pointer.sy);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.camera.zoom = Math.max(1, Math.min(10, this.camera.zoom * factor));
    const after = this.screenToWorld(this.pointer.sx, this.pointer.sy);
    this.camera.x += before.x - after.x;
    this.camera.y += before.y - after.y;
    this.clampCamera();
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (down) this.keys.add(k);
    else this.keys.delete(k);
    if (!down) return;
    if (k === 'escape') {
      this.events.pause();
      return;
    }
    if (this.paused) return;
    switch (k) {
      case '1':
      case '2':
      case '3':
      case '4':
        this.setTool(TOOLS[Number(k) - 1]);
        break;
      case 'q':
        this.cycleMaterial(-1);
        break;
      case 'e':
        this.cycleMaterial(1);
        break;
      case 'r':
        this.rotate();
        break;
      case 't':
        this.events.openResearch();
        break;
      case 'c':
        this.events.toggleContracts();
        break;
      case ' ':
        this.focusCore();
        e.preventDefault();
        break;
      case 'f3':
        this.debug = !this.debug;
        e.preventDefault();
        break;
    }
  }

  setTool(tool: ToolId) {
    this.tool = tool;
    audio.play('click');
  }

  rotate() {
    if (this.buildId === 'conveyor') this.conveyorDir = this.conveyorDir > 0 ? -1 : 1;
    else if (this.buildId === 'pipe') this.pipeDir = (this.pipeDir % 4) + 1;
  }

  private panCamera(dt: number) {
    if (this.paused) return;
    const speed = (600 / this.camera.zoom) * dt;
    let dx = 0;
    let dy = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) dx -= 1;
    if (k.has('d') || k.has('arrowright')) dx += 1;
    if (k.has('w') || k.has('arrowup')) dy -= 1;
    if (k.has('s') || k.has('arrowdown')) dy += 1;
    if (this.settings.edgePan && this.pointer.inside && !this.touches.size) {
      const m = 12;
      if (this.pointer.sx < m) dx -= 1;
      if (this.pointer.sx > this.canvas.clientWidth - m) dx += 1;
      if (this.pointer.sy < m) dy -= 1;
      if (this.pointer.sy > this.canvas.clientHeight - m) dy += 1;
    }
    if (dx || dy) {
      this.camera.x += dx * speed;
      this.camera.y += dy * speed;
      this.clampCamera();
      const w = this.screenToWorld(this.pointer.sx, this.pointer.sy);
      this.pointer.wx = w.x;
      this.pointer.wy = w.y;
    }
  }

  private clampCamera() {
    const c = this.camera;
    const hw = this.canvas.clientWidth / 2 / c.zoom;
    const hh = this.canvas.clientHeight / 2 / c.zoom;
    const { w, h } = this.sim;
    c.x = hw * 2 >= w ? w / 2 : Math.max(hw, Math.min(w - hw, c.x));
    c.y = hh * 2 >= h ? h / 2 : Math.max(hh, Math.min(h - hh, c.y));
  }

  screenToWorld(sx: number, sy: number) {
    const c = this.camera;
    return { x: c.x + (sx - this.canvas.clientWidth / 2) / c.zoom, y: c.y + (sy - this.canvas.clientHeight / 2) / c.zoom };
  }

  worldToScreen(wx: number, wy: number) {
    const c = this.camera;
    return { x: (wx - c.x) * c.zoom + this.canvas.clientWidth / 2, y: (wy - c.y) * c.zoom + this.canvas.clientHeight / 2 };
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.clampCamera();
  }

  // -------------------------------------------------------------- render

  private render() {
    const ctx = this.ctx;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    const c = this.camera;
    const light = this.daylight();

    // sky
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, mix('#0a1330', '#6fb3e0', light));
    g.addColorStop(1, mix('#1c2b4d', '#d8eef6', light));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);

    const { w, h } = this.sim;
    const vx0 = Math.max(0, Math.floor(c.x - cw / 2 / c.zoom) - 1);
    const vy0 = Math.max(0, Math.floor(c.y - ch / 2 / c.zoom) - 1);
    const vx1 = Math.min(w, Math.ceil(c.x + cw / 2 / c.zoom) + 1);
    const vy1 = Math.min(h, Math.ceil(c.y + ch / 2 / c.zoom) + 1);
    const vw = vx1 - vx0;
    const vh = vy1 - vy0;
    if (vw <= 0 || vh <= 0) return;

    this.sim.render(vx0, vy0, vx1, vy1);
    const rgba = this.sim.rgba;
    if (!this.image || this.image.data.buffer !== rgba.buffer || this.image.data.byteOffset !== rgba.byteOffset) {
      this.image = new ImageData(rgba as unknown as Uint8ClampedArray<ArrayBuffer>, w, h);
    }
    this.worldCtx.clearRect(vx0, vy0, vw, vh);
    this.worldCtx.putImageData(this.image, 0, 0, vx0, vy0, vw, vh);

    ctx.imageSmoothingEnabled = false;
    const s0 = this.worldToScreen(vx0, vy0);
    ctx.drawImage(this.bgCanvas, vx0, vy0, vw, vh, s0.x, s0.y, vw * c.zoom, vh * c.zoom);
    ctx.drawImage(this.worldCanvas, vx0, vy0, vw, vh, s0.x, s0.y, vw * c.zoom, vh * c.zoom);

    // night
    if (this.settings.nightDarkness && light < 1) {
      ctx.fillStyle = `rgba(5, 10, 35, ${(1 - light) * 0.5})`;
      ctx.fillRect(0, 0, cw, ch);
      if (light < 0.7) this.drawGlow(ctx, vx0, vy0, vx1, vy1, 1 - light);
    }

    this.drawCore(ctx);
    this.drawFloaters(ctx);
    if (!this.paused) this.drawCursor(ctx);
    if (this.debug || this.settings.showFps) this.drawDebug(ctx);
  }

  /** Heat machines glow at night (one glow per 6×6 block, capped). */
  private drawGlow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, strength: number) {
    const mat = this.sim.mat;
    const w = this.sim.w;
    const z = this.camera.zoom;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const seen = new Set<number>();
    for (let y = y0; y < y1 && seen.size < 300; y++) {
      for (let x = x0; x < x1; x++) {
        const m = mat[y * w + x];
        if (m !== M.DRYER && m !== M.FURNACE) continue;
        const key = ((y / 6) | 0) * 1024 + ((x / 6) | 0);
        if (seen.has(key)) continue;
        seen.add(key);
        const s = this.worldToScreen(x + 0.5, y + 0.5);
        const r = (m === M.FURNACE ? 14 : 9) * z;
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
        g.addColorStop(0, m === M.FURNACE ? `rgba(255,140,40,${0.35 * strength})` : `rgba(255,90,40,${0.22 * strength})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2);
      }
    }
    ctx.restore();
  }

  private drawFloaters(ctx: CanvasRenderingContext2D) {
    if (!this.floaters.length) return;
    ctx.save();
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      const p = this.worldToScreen(f.x, f.y);
      const rise = this.settings.reducedMotion ? 0 : f.age * 30;
      ctx.globalAlpha = Math.max(0, 1 - f.age / 1.6);
      ctx.fillStyle = '#ffd24a';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, p.x, p.y - rise);
      ctx.fillText(f.text, p.x, p.y - rise);
    }
    ctx.restore();
  }

  private drawCore(ctx: CanvasRenderingContext2D) {
    const core = this.sim.core;
    const p = this.worldToScreen(core.x + core.w / 2, core.y + core.h / 2 + 1);
    ctx.save();
    ctx.font = `bold ${Math.max(10, this.camera.zoom * 4)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.deliveredFlash > 0 ? '#9fffe0' : 'rgba(255,255,255,0.75)';
    ctx.fillText(t('hud.core'), p.x, p.y);
    ctx.restore();
  }

  private drawCursor(ctx: CanvasRenderingContext2D) {
    const p = this.pointer;
    if (!p.inside || this.touches.size > 1) return;
    const z = this.camera.zoom;
    const x = Math.floor(p.wx);
    const y = Math.floor(p.wy);
    ctx.save();
    if (this.tool === 'vacuum' || this.tool === 'drill') {
      const r = this.tool === 'vacuum' ? (this.emitting() ? this.stats.emitRadius : this.stats.vacRadius) : this.stats.drillRadius;
      const s = this.worldToScreen(x + 0.5, y + 0.5);
      ctx.strokeStyle = this.tool === 'drill' ? '#ffd24a' : this.emitting() ? '#ff9f5a' : '#8fe3ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, (r + 0.5) * z, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const def = this.buildDef;
      const cells = this.brushCells(x, y);
      const affordable = this.state.creative || this.state.credits >= def.cost * (def.mode === 'stamp' ? cells.length : 1);
      for (const [cx, cy] of cells) {
        const s = this.worldToScreen(cx, cy);
        if (this.tool === 'remove') {
          ctx.fillStyle = 'rgba(255,80,80,0.35)';
        } else {
          const ok = this.canPlace(cx, cy, def) && affordable;
          ctx.fillStyle = ok ? hexA(def.mode === 'pipe' ? '#9aa7b0' : MAT_COLORS[this.matFor(def)], 0.6) : 'rgba(255,60,60,0.45)';
        }
        ctx.fillRect(s.x, s.y, z, z);
      }
      if (this.tool === 'build' && (def.id === 'conveyor' || def.id === 'pipe')) {
        const s = this.worldToScreen(x + 0.5, y + 0.5);
        const dir = def.id === 'conveyor' ? (this.conveyorDir > 0 ? 2 : 4) : this.pipeDir;
        const arrow = ['', '↑', '→', '↓', '←'][dir];
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(arrow, s.x + 12, s.y - 12);
        ctx.fillText(arrow, s.x + 12, s.y - 12);
      }
    }
    ctx.restore();
  }

  private drawDebug(ctx: CanvasRenderingContext2D) {
    const lines = [`FPS ${this.fps.toFixed(0)}`];
    if (this.debug) {
      lines.push(
        `sim ${this.simMs.toFixed(2)} ms`,
        `chunks ${this.sim.api.active_chunks()}`,
        `tick ${this.sim.api.get_tick()}`,
        `tide ${this.sim.api.tide_level()}`,
        `cam ${this.camera.x.toFixed(0)},${this.camera.y.toFixed(0)} x${this.camera.zoom.toFixed(1)}`,
        `cell ${Math.floor(this.pointer.wx)},${Math.floor(this.pointer.wy)} = ${this.sim.get(Math.floor(this.pointer.wx), Math.floor(this.pointer.wy))}`,
      );
    }
    ctx.save();
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(8, this.canvas.clientHeight - 20 - lines.length * 14, 200, lines.length * 14 + 10);
    ctx.fillStyle = '#b8ffb8';
    lines.forEach((l, i) => ctx.fillText(l, 14, this.canvas.clientHeight - 14 - (lines.length - 1 - i) * 14));
    ctx.restore();
  }

  /** Test/automation hook: stats for the e2e smoke test. */
  debugInfo() {
    return { fps: this.fps, simMs: this.simMs, chunks: this.sim.api.active_chunks(), tick: this.sim.api.get_tick() };
  }
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
  const [ar, ag, ab] = ch(pa);
  const [br, bg, bb] = ch(pb);
  return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
}

function hexA(hex: string, a: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}
