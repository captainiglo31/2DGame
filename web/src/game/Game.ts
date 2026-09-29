import { audio } from '../audio/audio';
import { BUILDINGS, REFUND, WORLD, type BuildDef, type Stats } from '../data/balance';
import { RESEARCH_BY_ID } from '../data/research';
import { t } from '../i18n';
import { Background } from '../render/Background';
import { Particles } from '../render/Particles';
import { buildSprite, GUN, GUN_PIVOT, PLAYER_FRAMES, SHOULDER } from '../render/sprites';
import { WorldRenderer, type Light } from '../render/WorldRenderer';
import { restore, serialize, writeSlot, type SaveFile, type Slot } from '../save/save';
import type { Settings } from '../settings';
import { LOOSE, M, MAT_COLORS } from '../sim/materials';
import { P, prob, type Sim } from '../sim/Sim';
import { Player, PLAYER, type PlayerInput, type Terrain } from './Player';
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

export interface Canvases {
  bg: HTMLCanvasElement;
  world: HTMLCanvasElement;
  fx: HTMLCanvasElement;
}

interface Pointer {
  sx: number;
  sy: number;
  wx: number;
  wy: number;
  lastTx: number;
  lastTy: number;
  primary: boolean;
  secondary: boolean;
  inside: boolean;
}

// Cells the player can stand on: static structures and powders.
const SOLID = new Uint8Array(32);
for (const m of [M.ROCK, M.BEDROCK, M.SAND, M.WETSAND, M.GRAVEL, M.SHELL, M.MAGNETITE, M.SALT, M.GLASS, M.WALL, M.CONV_L, M.CONV_R, M.SIEVE, M.DRYER, M.FURNACE, M.MAGNET, M.INLET, M.DRILL]) SOLID[m] = 1;

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
  /** On-screen movement buttons (touch). */
  touchInput: PlayerInput = { left: false, right: false, up: false };
  paused = true;
  /** Title screen: slow camera drift instead of following the player. */
  attract = true;
  debug = false;

  camera = { x: 0, y: 0, zoom: 3 };
  surface: number[] = [];
  player = new Player(0, 0);
  dayTime = 0.12;

  private canvases: Canvases;
  private fx: CanvasRenderingContext2D;
  private renderer: WorldRenderer | null;
  private fallback: { ctx: CanvasRenderingContext2D; buf: HTMLCanvasElement; bctx: CanvasRenderingContext2D; image: ImageData | null } | null = null;
  private background: Background;
  private particles = new Particles();
  private sprites: Record<string, HTMLCanvasElement[][]> = {};
  private gunSprite: [HTMLCanvasElement, HTMLCanvasElement];
  private pointer: Pointer = { sx: 0, sy: 0, wx: 0, wy: 0, lastTx: 0, lastTy: 0, primary: false, secondary: false, inside: false };
  private keys = new Set<string>();
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; zoom: number } | null = null;
  private acc = 0;
  private last = 0;
  private time = 0;
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
  private terrain: Terrain;

  constructor(canvases: Canvases, sim: Sim, settings: Settings, events: GameEvents) {
    this.canvases = canvases;
    this.sim = sim;
    this.settings = settings;
    this.events = events;
    this.state = newState(1);
    this.stats = computeStats([]);
    this.fx = canvases.fx.getContext('2d')!;
    this.background = new Background(canvases.bg);
    this.renderer = WorldRenderer.create(canvases.world, sim);
    if (!this.renderer) {
      const buf = document.createElement('canvas');
      buf.width = sim.w;
      buf.height = sim.h;
      this.fallback = { ctx: canvases.world.getContext('2d')!, buf, bctx: buf.getContext('2d')!, image: null };
    }
    for (const [anim, frames] of Object.entries(PLAYER_FRAMES)) {
      this.sprites[anim] = frames.map((f) => [buildSprite(f), buildSprite(f, true)]);
    }
    this.gunSprite = [buildSprite(GUN), buildSprite(GUN)];
    const mat = () => this.sim.mat;
    this.terrain = {
      solid: (x, y) => {
        if (x < 0 || x >= this.sim.w || y >= this.sim.h) return true;
        if (y < 0) return false;
        return SOLID[mat()[y * this.sim.w + x]] === 1;
      },
      liquid: (x, y) => {
        if (x < 0 || y < 0 || x >= this.sim.w || y >= this.sim.h) return false;
        const m = mat()[y * this.sim.w + x];
        return m === M.WATER || m === M.SLUDGE;
      },
    };
    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get usesWebGL(): boolean {
    return this.renderer !== null;
  }

  // ------------------------------------------------------------ lifecycle

  newGame(seed: number, creative = false) {
    this.sim.generate(seed);
    this.state = newState(seed, creative);
    this.sim.api.set_tick(0);
    this.computeSurface();
    this.afterStateChange();
    this.camera.zoom = 4;
    this.spawnPlayer();
    this.snapCamera();
    this.dayTime = 0.12;
    this.floaters = [];
    this.particles.list = [];
  }

  load(f: SaveFile) {
    restore(this.sim, f);
    this.state = f.state;
    // forward-compatible defaults for older saves
    this.state.stats ??= { delivered: {}, earned: 0, playTime: 0, built: 0 };
    this.state.contractProgress ??= {};
    this.surface = f.surface?.length === this.sim.w ? f.surface : [];
    if (!this.surface.length) this.computeSurface();
    this.renderer?.setOriginalSurface(this.surface);
    this.sim.collectAbsorbed();
    this.afterStateChange();
    this.camera.zoom = 4;
    const p = this.state.player;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      this.player = new Player(p.x, p.y);
      if (this.player.collides(this.terrain, p.x, p.y)) this.spawnPlayer();
    } else this.spawnPlayer();
    this.snapCamera();
    this.floaters = [];
    this.particles.list = [];
  }

  private syncPlayerToState() {
    this.state.player = { x: this.player.x, y: this.player.y };
  }

  save(slot: Slot): boolean {
    this.syncPlayerToState();
    return writeSlot(slot, serialize(this.sim, this.state, this.surface));
  }

  exportSave(): SaveFile {
    this.syncPlayerToState();
    return serialize(this.sim, this.state, this.surface);
  }

  /** Put the player on the ground just right of the base. */
  spawnPlayer() {
    const c = this.sim.core;
    const x = c.x + c.w + 10;
    let y = Math.max(PLAYER.height + 1, c.y - 30);
    while (y < this.sim.h - 1 && !this.player.collides(this.terrain, x, y + 1)) y++;
    this.player = new Player(x, y);
    while (this.player.collides(this.terrain, x, this.player.y)) this.player.y -= 1;
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

  /** Camera straight onto the player (or the base on the title screen). */
  snapCamera() {
    if (this.attract) {
      const c = this.sim.core;
      this.camera.x = c.x + c.w / 2;
      this.camera.y = c.y - 10;
    } else {
      this.camera.x = this.player.x;
      this.camera.y = this.player.y - 14;
    }
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
    this.renderer?.setOriginalSurface(this.surface);
  }

  // ---------------------------------------------------------------- loop

  private frame(now: number) {
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    this.time += dt;
    if (dt > 0) this.fps = this.fps * 0.95 + (1 / dt) * 0.05;
    this.actionFlags = { vac: false, drill: false, emit: false };

    if (!this.paused) {
      this.state.stats.playTime += dt;
      this.dayTime = (this.dayTime + dt / WORLD.dayLength) % 1;
      this.sim.setParam(P.SUN, prob(this.stats.sun * this.daylight()));
      this.updatePlayer(dt);
      this.acc += dt * this.settings.simSpeed;
      let ticks = Math.floor(this.acc * WORLD.ticksPerSecond);
      this.acc -= ticks / WORLD.ticksPerSecond;
      ticks = Math.min(ticks, 6);
      const t0 = performance.now();
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
    } else if (this.attract) {
      // title screen: the tide keeps moving and the camera drifts along the coast
      this.acc += dt;
      if (this.acc > 1 / 30) {
        this.sim.step(1);
        this.acc = 0;
      }
      this.camera.x += dt * 4;
      if (this.camera.x > this.sim.w * 0.7) this.camera.x = this.sim.w * 0.25;
      this.clampCamera();
    }
    this.particles.update(dt, this.nozzle());
    audio.update(this.actionFlags.vac, this.actionFlags.drill, this.actionFlags.emit);
    this.render();
  }

  private updatePlayer(dt: number) {
    const k = this.keys;
    const ti = this.touchInput;
    const input: PlayerInput = {
      left: k.has('a') || k.has('arrowleft') || ti.left,
      right: k.has('d') || k.has('arrowright') || ti.right,
      up: k.has('w') || k.has(' ') || k.has('arrowup') || ti.up,
    };
    const p = this.player;
    p.update(dt, input, this.terrain);
    // face the aim point while a tool is in use, otherwise the walking direction
    if (this.pointer.inside && (this.pointer.primary || this.pointer.secondary || (!input.left && !input.right))) {
      p.facing = this.pointer.wx >= p.x ? 1 : -1;
    }
    if (p.jetting && !this.settings.reducedMotion) {
      const bx = p.x - p.facing * 3;
      for (let i = 0; i < 2; i++) {
        this.particles.add({ x: bx + (Math.random() - 0.5), y: p.y - 7, vx: (Math.random() - 0.5) * 10, vy: 40 + Math.random() * 30, life: 0.18 + Math.random() * 0.1, color: Math.random() < 0.5 ? '#ffb347' : '#ff6a2a', size: 1.2, glow: true });
      }
      if (Math.random() < 0.3) this.particles.add({ x: bx, y: p.y - 4, vx: (Math.random() - 0.5) * 6, vy: 12, life: 0.6, color: 'rgba(200,200,200,0.5)', size: 1.6 });
    }
    if (p.landed > 0) {
      for (let i = 0; i < 10 * p.landed; i++) this.particles.add({ x: p.x + (Math.random() - 0.5) * 6, y: p.y - 0.5, vx: (Math.random() - 0.5) * 30, vy: -Math.random() * 12, life: 0.5, color: 'rgba(214,190,140,0.8)', size: 1, gravity: 30 });
      p.landed = 0;
    }
    // camera follows with a slight lead towards the cursor
    const lead = this.pointer.inside ? 0.18 : 0;
    const tx = p.x + (this.pointer.wx - p.x) * lead;
    const ty = p.y - 14 + (this.pointer.wy - p.y) * lead;
    const f = 1 - Math.exp(-dt * 6);
    this.camera.x += (tx - this.camera.x) * f;
    this.camera.y += (ty - this.camera.y) * f;
    this.clampCamera();
    this.refreshPointerWorld();
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
      const c = this.sim.core;
      for (let i = 0; i < 3; i++) {
        this.particles.add({ x: c.x + 3 + Math.random() * (c.w - 6), y: c.y - 1, vx: 0, vy: -10 - Math.random() * 10, life: 0.8, color: '#9fffe0', size: 1, glow: true });
      }
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

  /** Tool target: the cursor, clamped to the tool reach around the hand. */
  aim(): { x: number; y: number; clamped: boolean } {
    const h = this.player.hand;
    const dx = this.pointer.wx - h.x;
    const dy = this.pointer.wy - h.y;
    const d = Math.hypot(dx, dy);
    const r = this.stats.reach;
    if (d <= r) return { x: this.pointer.wx, y: this.pointer.wy, clamped: false };
    return { x: h.x + (dx / d) * r, y: h.y + (dy / d) * r, clamped: true };
  }

  /** World position of the gun tip. */
  nozzle(): { x: number; y: number } {
    const h = this.player.hand;
    const a = this.aim();
    const dx = a.x - h.x;
    const dy = a.y - h.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: h.x + (dx / d) * 10, y: h.y + (dy / d) * 10 };
  }

  private emitting(): boolean {
    return this.tool === 'vacuum' && (this.pointer.secondary || (this.pointer.primary && this.emitMode));
  }

  private applyTool() {
    const p = this.pointer;
    const a = this.aim();
    if (!p.inside || (!p.primary && !p.secondary)) {
      p.lastTx = a.x;
      p.lastTy = a.y;
      return;
    }
    const x = Math.floor(a.x);
    const y = Math.floor(a.y);
    const s = this.stats;
    switch (this.tool) {
      case 'vacuum':
        if (this.emitting()) this.emit(x, y);
        else if (p.primary) this.suck(x, y);
        break;
      case 'drill':
        if (p.primary) {
          const n = this.sim.drill(x, y, s.drillRadius, s.drillPower);
          this.actionFlags.drill = true;
          const sparks = Math.min(4, 1 + n);
          for (let i = 0; i < sparks; i++) {
            this.particles.add({ x: a.x + (Math.random() - 0.5) * s.drillRadius, y: a.y + (Math.random() - 0.5) * s.drillRadius, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 50, life: 0.3, color: Math.random() < 0.5 ? '#ffe28a' : '#ffffff', size: 0.8, gravity: 160, glow: true });
          }
        }
        break;
      case 'build':
        if (p.primary) this.buildAlong(a);
        else if (p.secondary) this.removeAt(x, y);
        break;
      case 'remove':
        this.removeAt(x, y);
        break;
    }
    p.lastTx = a.x;
    p.lastTy = a.y;
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
    const nz = this.nozzle();
    for (let m = 0; m < got.length; m++) {
      if (!got[m]) continue;
      inv[m] = (inv[m] ?? 0) + got[m];
      const n = Math.min(3, Math.ceil(got[m] / 4));
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = Math.random() * s.vacRadius;
        this.particles.add({ x: x + Math.cos(ang) * r, y: y + Math.sin(ang) * r, tx: nz.x, ty: nz.y, life: 0.6, color: MAT_COLORS[m], size: 1 });
      }
    }
    // idle suction swirl so the beam reads even over empty air
    if (Math.random() < 0.6) {
      const ang = Math.random() * Math.PI * 2;
      this.particles.add({ x: x + Math.cos(ang) * s.vacRadius, y: y + Math.sin(ang) * s.vacRadius, tx: nz.x, ty: nz.y, life: 0.5, color: 'rgba(143,227,255,0.6)', size: 0.6 });
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
    const nz = this.nozzle();
    const dx = x + 0.5 - nz.x;
    const dy = y + 0.5 - nz.y;
    for (let i = 0; i < 2; i++) {
      this.particles.add({ x: nz.x, y: nz.y, vx: dx * 7 + (Math.random() - 0.5) * 12, vy: dy * 7 + (Math.random() - 0.5) * 12, life: 0.14, color: MAT_COLORS[m], size: 1 });
    }
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
    const size = this.tool === 'remove' ? this.brush + 1 : def.mode === 'stamp' ? 3 : this.brush;
    const o = Math.floor((size - 1) / 2);
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) out.push([x - o + dx, y - o + dy]);
    return out;
  }

  private buildAlong(a: { x: number; y: number }) {
    const p = this.pointer;
    const def = this.buildDef;
    const x1 = Math.floor(a.x);
    const y1 = Math.floor(a.y);
    const x0 = Math.floor(p.lastTx);
    const y0 = Math.floor(p.lastTy);
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
      const [cx, cy] = valid[0];
      this.particles.add({ x: cx + 0.5, y: cy + 0.5, vx: 0, vy: -8, life: 0.3, color: '#ffffff', size: 1, glow: true });
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
    // never wall the player in
    const p = this.player;
    if (x >= Math.floor(p.left) && x < Math.ceil(p.left + PLAYER.width) && y >= Math.floor(p.top) && y < Math.ceil(p.y)) return false;
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
        if (n < 6) this.particles.add({ x: x - o + dx + 0.5, y: y - o + dy + 0.5, vx: (Math.random() - 0.5) * 30, vy: -20, life: 0.4, color: MAT_COLORS[r] ?? '#9aa7b0', size: 1, gravity: 120 });
      }
    }
    if (n) {
      if (!this.state.creative) this.state.credits += refund;
      audio.play('remove');
    }
  }

  // --------------------------------------------------------------- input

  private bindInput() {
    const c = this.canvases.fx;
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
      this.pointer.primary = this.pointer.secondary = false;
    });
  }

  private refreshPointerWorld() {
    const w = this.screenToWorld(this.pointer.sx, this.pointer.sy);
    this.pointer.wx = w.x;
    this.pointer.wy = w.y;
  }

  private updatePointer(e: PointerEvent) {
    const r = this.canvases.fx.getBoundingClientRect();
    this.pointer.sx = e.clientX - r.left;
    this.pointer.sy = e.clientY - r.top;
    this.refreshPointerWorld();
  }

  private onPointerDown(e: PointerEvent) {
    audio.unlock();
    this.canvases.fx.setPointerCapture?.(e.pointerId);
    this.updatePointer(e);
    this.pointer.inside = true;
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        this.pointer.primary = false;
        const [a, b] = [...this.touches.values()];
        this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: this.camera.zoom };
        return;
      }
      if (this.touches.size > 2) return;
    }
    const a = this.aim();
    this.pointer.lastTx = a.x;
    this.pointer.lastTy = a.y;
    this.lastStamp = { x: -99, y: -99 };
    if (e.button === 0) this.pointer.primary = true;
    if (e.button === 2) this.pointer.secondary = true;
  }

  private onPointerMove(e: PointerEvent) {
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.touches.size >= 2) {
        const [a, b] = [...this.touches.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        this.camera.zoom = Math.max(2, Math.min(8, (this.pinch.zoom * dist) / this.pinch.dist));
        return;
      }
    }
    this.updatePointer(e);
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
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      this.brush = Math.max(1, Math.min(6, this.brush + (e.deltaY < 0 ? 1 : -1)));
      return;
    }
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.camera.zoom = Math.max(2, Math.min(8, this.camera.zoom * factor));
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
    if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
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

  private clampCamera() {
    const c = this.camera;
    const cw = this.canvases.fx.clientWidth;
    const ch = this.canvases.fx.clientHeight;
    const hw = cw / 2 / c.zoom;
    const hh = ch / 2 / c.zoom;
    const { w, h } = this.sim;
    c.x = hw * 2 >= w ? w / 2 : Math.max(hw, Math.min(w - hw, c.x));
    c.y = hh * 2 >= h ? h / 2 : Math.max(hh, Math.min(h - hh, c.y));
  }

  screenToWorld(sx: number, sy: number) {
    const c = this.camera;
    return { x: c.x + (sx - this.canvases.fx.clientWidth / 2) / c.zoom, y: c.y + (sy - this.canvases.fx.clientHeight / 2) / c.zoom };
  }

  worldToScreen(wx: number, wy: number) {
    const c = this.camera;
    return { x: (wx - c.x) * c.zoom + this.canvases.fx.clientWidth / 2, y: (wy - c.y) * c.zoom + this.canvases.fx.clientHeight / 2 };
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const c of [this.canvases.world, this.canvases.fx]) {
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
    }
    this.fx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.fallback?.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.background.resize();
    this.clampCamera();
  }

  // -------------------------------------------------------------- render

  private collectLights(x0: number, y0: number, x1: number, y1: number, night: number): Light[] {
    const lights: Light[] = [];
    const p = this.player;
    if (!this.attract) {
      // helmet lamp, stronger at night
      lights.push({ x: p.x + p.facing * 2, y: p.y - 15, radius: 30 + night * 18, r: 0.55 * (0.3 + night), g: 0.5 * (0.3 + night), b: 0.4 * (0.3 + night) });
      if (this.actionFlags.drill || this.pointer.primary) {
        const a = this.aim();
        if (this.tool === 'drill' && this.pointer.primary) lights.push({ x: a.x, y: a.y, radius: 14, r: 0.9, g: 0.7, b: 0.3 });
        if (this.tool === 'vacuum' && this.pointer.primary) lights.push({ x: a.x, y: a.y, radius: 12, r: 0.2, g: 0.5, b: 0.6 });
      }
      if (p.jetting) lights.push({ x: p.x - p.facing * 3, y: p.y - 4, radius: 16, r: 0.9, g: 0.5, b: 0.2 });
    }
    // machines (one light per 8×8 block)
    const mat = this.sim.mat;
    const w = this.sim.w;
    const seen = new Set<number>();
    for (let y = Math.max(0, y0); y < Math.min(this.sim.h, y1) && lights.length < 24; y += 2) {
      for (let x = Math.max(0, x0); x < Math.min(w, x1) && lights.length < 24; x += 2) {
        const m = mat[y * w + x];
        if (m !== M.FURNACE && m !== M.DRYER && m !== M.INLET && m !== M.MAGNET) continue;
        const key = ((y >> 3) << 10) | (x >> 3);
        if (seen.has(key)) continue;
        seen.add(key);
        const busy = !this.paused && !this.settings.reducedMotion;
        if (m === M.FURNACE) {
          lights.push({ x, y, radius: 20, r: 1.0, g: 0.55, b: 0.2 });
          if (busy && Math.random() < 0.25) this.particles.add({ x: x + Math.random() * 8, y: y - 0.5, vx: (Math.random() - 0.5) * 6, vy: -14 - Math.random() * 10, life: 0.9, color: Math.random() < 0.5 ? '#ffb347' : '#ff6a2a', size: 0.7, glow: true });
        } else if (m === M.DRYER) {
          lights.push({ x, y, radius: 12, r: 0.8, g: 0.35, b: 0.15 });
          if (busy && Math.random() < 0.12) this.particles.add({ x: x + Math.random() * 8, y: y - 0.5, vx: (Math.random() - 0.5) * 4, vy: -8, life: 1.2, color: 'rgba(230,236,240,0.35)', size: 1.4 });
        } else if (m === M.INLET && busy && Math.random() < 0.08) {
          this.particles.add({ x: x + Math.random() * 8, y: y - 0.5, vx: 0, vy: -6, life: 0.8, color: '#9fffe0', size: 0.6, glow: true });
        }
        if (m === M.INLET) lights.push({ x, y, radius: 12, r: 0.15, g: 0.55, b: 0.4 });
        else if (m === M.MAGNET) lights.push({ x, y, radius: 10, r: 0.4, g: 0.2, b: 0.55 });
      }
    }
    return lights;
  }

  private render() {
    const cw = this.canvases.fx.clientWidth;
    const ch = this.canvases.fx.clientHeight;
    const c = this.camera;
    const light = this.settings.nightDarkness ? this.daylight() : Math.max(0.75, this.daylight());
    const night = 1 - light;

    const horizon = this.worldToScreen(0, this.sim.api.tide_level()).y;
    this.background.draw(horizon, c.x, this.dayTime, this.time);

    const x0 = Math.floor(c.x - cw / 2 / c.zoom) - 1;
    const x1 = Math.ceil(c.x + cw / 2 / c.zoom) + 1;
    const y0 = Math.floor(c.y - ch / 2 / c.zoom) - 1;
    const y1 = Math.ceil(c.y + ch / 2 / c.zoom) + 1;

    if (this.renderer) {
      this.renderer.render({ camX: c.x, camY: c.y, zoom: c.zoom, time: this.time, daylight: light, lights: this.collectLights(x0, y0, x1, y1, night) });
    } else {
      this.renderFallback(x0, y0, x1, y1, night);
    }

    const ctx = this.fx;
    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = false;
    this.drawCore(ctx, night);
    if (!this.attract) this.drawPlayer(ctx);
    this.particles.draw(ctx, (x, y) => this.worldToScreen(x, y), c.zoom);
    this.drawFloaters(ctx);
    if (!this.paused) this.drawCursor(ctx);
    if (this.debug || this.settings.showFps) this.drawDebug(ctx);
  }

  private renderFallback(x0: number, y0: number, x1: number, y1: number, night: number) {
    const f = this.fallback!;
    const { w, h } = this.sim;
    const vx0 = Math.max(0, x0);
    const vy0 = Math.max(0, y0);
    const vw = Math.min(w, x1) - vx0;
    const vh = Math.min(h, y1) - vy0;
    const cw = this.canvases.fx.clientWidth;
    const ch = this.canvases.fx.clientHeight;
    f.ctx.clearRect(0, 0, cw, ch);
    if (vw <= 0 || vh <= 0) return;
    this.sim.render(vx0, vy0, vx0 + vw, vy0 + vh);
    const rgba = this.sim.rgba;
    if (!f.image || f.image.data.buffer !== rgba.buffer) f.image = new ImageData(rgba as unknown as Uint8ClampedArray<ArrayBuffer>, w, h);
    f.bctx.putImageData(f.image, 0, 0, vx0, vy0, vw, vh);
    f.ctx.imageSmoothingEnabled = false;
    const s = this.worldToScreen(vx0, vy0);
    f.ctx.drawImage(f.buf, vx0, vy0, vw, vh, s.x, s.y, vw * this.camera.zoom, vh * this.camera.zoom);
    if (night > 0) {
      f.ctx.fillStyle = `rgba(5,10,35,${night * 0.5})`;
      f.ctx.fillRect(0, 0, cw, ch);
    }
  }

  /** The base station: windows, door, sign and an antenna over the steel hull. */
  private drawCore(ctx: CanvasRenderingContext2D, night: number) {
    const core = this.sim.core;
    const z = this.camera.zoom;
    const rect = (x: number, y: number, w: number, h: number, color: string) => {
      const s = this.worldToScreen(core.x + x, core.y + y);
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), Math.ceil(w * z), Math.ceil(h * z));
    };
    const W = core.w;
    const H = core.h;
    const winLit = night > 0.35;
    const winColor = winLit ? '#ffd27a' : '#9fd4e8';
    // roof trim under the funnel
    rect(0, 1, W, 1, '#2a3440');
    // windows
    for (const wx of [3, 7, W - 10, W - 6]) {
      rect(wx - 0.5, 4.5, 4, 4, '#1a222b');
      rect(wx, 5, 3, 3, winColor);
      rect(wx, 5, 3, 1, winLit ? '#fff0c0' : '#d8f1fa');
      rect(wx + 1, 5, 0.5, 3, '#1a222b');
    }
    // door
    const dx = Math.floor(W / 2) - 2;
    rect(dx - 0.5, H - 7.5, 5, 7.5, '#1a222b');
    rect(dx, H - 7, 4, 7, '#3b4652');
    rect(dx + 2.6, H - 3.5, 0.6, 0.6, '#ffd24a');
    rect(dx - 1, H - 9, 6, 1, winLit ? '#ffd27a' : '#6b7480');
    // sign
    rect(dx - 5, 2.4, 14, 1.8, '#10161c');
    const s = this.worldToScreen(core.x + dx + 2, core.y + 3.35);
    ctx.save();
    ctx.font = `${Math.max(8, Math.round(z * 1.6))}px 'Pixelify Sans', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.deliveredFlash > 0 ? '#9fffe0' : '#3fd0a0';
    ctx.fillText(t('hud.core'), s.x, s.y);
    ctx.restore();
    // antenna with blinking beacon
    const ax = W + 6;
    rect(ax, -18, 1, 18, '#6b7480');
    rect(ax - 1, -18, 3, 1, '#98a2ad');
    rect(ax - 2, -12, 5, 1, '#98a2ad');
    const on = Math.floor(this.time * 1.5) % 2 === 0;
    rect(ax - 0.5, -20, 2, 2, on ? '#ff4a4a' : '#5a1a1a');
    if (on && night > 0.2) {
      const b = this.worldToScreen(core.x + ax + 0.5, core.y - 19);
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, z * 8);
      g.addColorStop(0, 'rgba(255,60,60,0.5)');
      g.addColorStop(1, 'rgba(255,60,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(b.x - z * 8, b.y - z * 8, z * 16, z * 16);
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const p = this.player;
    const z = this.camera.zoom;
    const { anim, index } = p.frame();
    const frames = this.sprites[anim];
    const pair = frames[index % frames.length];
    const img = pair[p.facing > 0 ? 0 : 1];
    const left = p.x - 7;
    const top = p.y - 20;
    const s = this.worldToScreen(left, top);
    // soft shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    const sh = this.worldToScreen(p.x - 4, p.y - 0.4);
    if (p.onGround) ctx.fillRect(Math.round(sh.x), Math.round(sh.y), 8 * z, z * 0.8);
    ctx.drawImage(img, Math.round(s.x), Math.round(s.y), img.width * z, img.height * z);

    // gun rotated towards the aim point
    const sx = p.facing > 0 ? SHOULDER.x : 13 - SHOULDER.x;
    const sw = this.worldToScreen(left + sx + 0.5, top + SHOULDER.y + 0.5);
    const a = this.aim();
    const ang = Math.atan2(a.y - (top + SHOULDER.y), a.x - (left + sx));
    ctx.save();
    ctx.translate(sw.x, sw.y);
    ctx.rotate(ang);
    if (Math.cos(ang) < 0) ctx.scale(1, -1);
    ctx.drawImage(this.gunSprite[0], -GUN_PIVOT.x * z, -GUN_PIVOT.y * z - z / 2, GUN[0].length * z, GUN.length * z);
    ctx.restore();

    // jetpack fuel gauge while not full
    if (p.fuel < PLAYER.fuelMax - 0.01) {
      const g = this.worldToScreen(p.x - 5, p.y - 24);
      const wpx = 10 * z;
      ctx.fillStyle = 'rgba(10,16,24,0.7)';
      ctx.fillRect(Math.round(g.x) - 1, Math.round(g.y) - 1, wpx + 2, Math.max(3, z) + 2);
      ctx.fillStyle = p.fuel / PLAYER.fuelMax < 0.25 ? '#ff6a6a' : '#ffb347';
      ctx.fillRect(Math.round(g.x), Math.round(g.y), wpx * (p.fuel / PLAYER.fuelMax), Math.max(3, z));
    }
  }

  private drawFloaters(ctx: CanvasRenderingContext2D) {
    if (!this.floaters.length) return;
    ctx.save();
    ctx.font = `bold 16px 'Pixelify Sans', monospace`;
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      const p = this.worldToScreen(f.x, f.y);
      const rise = this.settings.reducedMotion ? 0 : f.age * 30;
      ctx.globalAlpha = Math.max(0, 1 - f.age / 1.6);
      ctx.fillStyle = '#ffd24a';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, p.x, p.y - rise);
      ctx.fillText(f.text, p.x, p.y - rise);
    }
    ctx.restore();
  }

  private drawCursor(ctx: CanvasRenderingContext2D) {
    const p = this.pointer;
    if (!p.inside || this.touches.size > 1) return;
    const z = this.camera.zoom;
    const a = this.aim();
    const x = Math.floor(a.x);
    const y = Math.floor(a.y);
    ctx.save();
    if (this.tool === 'vacuum' || this.tool === 'drill') {
      const r = this.tool === 'vacuum' ? (this.emitting() ? this.stats.emitRadius : this.stats.vacRadius) : this.stats.drillRadius;
      const s = this.worldToScreen(x + 0.5, y + 0.5);
      const col = this.tool === 'drill' ? '255,210,74' : this.emitting() ? '255,159,90' : '143,227,255';
      ctx.strokeStyle = `rgba(${col},0.9)`;
      ctx.lineWidth = 2;
      ctx.setLineDash([z * 2, z * 2]);
      ctx.lineDashOffset = -this.time * 20;
      ctx.beginPath();
      ctx.arc(s.x, s.y, (r + 0.5) * z, 0, Math.PI * 2);
      ctx.stroke();
      // beam from the nozzle while working
      if (p.primary || p.secondary) {
        const nz = this.worldToScreen(this.nozzle().x, this.nozzle().y);
        const g = ctx.createLinearGradient(nz.x, nz.y, s.x, s.y);
        g.addColorStop(0, `rgba(${col},0.55)`);
        g.addColorStop(1, `rgba(${col},0.05)`);
        ctx.setLineDash([]);
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(2, z);
        ctx.beginPath();
        ctx.moveTo(nz.x, nz.y);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
    } else {
      const def = this.buildDef;
      const cells = this.brushCells(x, y);
      const affordable = this.state.creative || this.state.credits >= def.cost * (def.mode === 'stamp' ? cells.length : 1);
      for (const [cx, cy] of cells) {
        const s = this.worldToScreen(cx, cy);
        if (this.tool === 'remove') ctx.fillStyle = 'rgba(255,80,80,0.35)';
        else {
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
    // reach limit hint
    if (a.clamped) {
      const h = this.worldToScreen(this.player.hand.x, this.player.hand.y);
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(h.x, h.y, this.stats.reach * z, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawDebug(ctx: CanvasRenderingContext2D) {
    const lines = [`FPS ${this.fps.toFixed(0)}`];
    if (this.debug) {
      lines.push(
        `sim ${this.simMs.toFixed(2)} ms`,
        `renderer ${this.renderer ? 'webgl2' : 'canvas2d'}`,
        `chunks ${this.sim.api.active_chunks()}`,
        `tick ${this.sim.api.get_tick()}`,
        `tide ${this.sim.api.tide_level()}`,
        `player ${this.player.x.toFixed(1)},${this.player.y.toFixed(1)} ${this.player.onGround ? 'ground' : 'air'}`,
        `cell ${Math.floor(this.pointer.wx)},${Math.floor(this.pointer.wy)} = ${this.sim.get(Math.floor(this.pointer.wx), Math.floor(this.pointer.wy))}`,
      );
    }
    ctx.save();
    ctx.font = '12px ui-monospace, monospace';
    const ch = this.canvases.fx.clientHeight;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(8, ch - 20 - lines.length * 14, 230, lines.length * 14 + 10);
    ctx.fillStyle = '#b8ffb8';
    lines.forEach((l, i) => ctx.fillText(l, 14, ch - 14 - (lines.length - 1 - i) * 14));
    ctx.restore();
  }

  /** Test/automation hook: stats for the e2e smoke test. */
  debugInfo() {
    return { fps: this.fps, simMs: this.simMs, chunks: this.sim.api.active_chunks(), tick: this.sim.api.get_tick(), webgl: !!this.renderer, player: { x: this.player.x, y: this.player.y, onGround: this.player.onGround } };
  }
}

function hexA(hex: string, a: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}
