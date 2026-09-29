// Player character: box collision against the particle grid, walking with
// step-up over small piles, jumping, a jetpack with fuel and swimming.
// Units are cells and seconds; y grows downwards; (x, y) is the feet centre.

export interface PlayerInput {
  left: boolean;
  right: boolean;
  up: boolean; // jump / jetpack
}

export interface Terrain {
  solid(x: number, y: number): boolean;
  liquid(x: number, y: number): boolean;
}

export const PLAYER = {
  width: 6,
  height: 18,
  runSpeed: 34,
  accel: 260,
  airAccel: 140,
  gravity: 190,
  jumpSpeed: 64,
  jetAccel: 330,
  jetMaxUp: 55,
  fuelMax: 1.8,
  fuelRegen: 1.1,
  maxFall: 140,
  stepUp: 3,
};

export class Player {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;
  onGround = false;
  inLiquid = false;
  fuel = PLAYER.fuelMax;
  jetting = false;
  animTime = 0;
  /** Seconds since the jump key was pressed while grounded (jump buffering). */
  private jumpHeld = false;
  landed = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  get left() {
    return this.x - PLAYER.width / 2;
  }
  get top() {
    return this.y - PLAYER.height;
  }
  /** Shoulder / gun pivot in world cells. */
  get hand() {
    return { x: this.x + this.facing * 0.5, y: this.y - 11 };
  }

  collides(t: Terrain, x: number, y: number): boolean {
    const x0 = Math.floor(x - PLAYER.width / 2);
    const x1 = Math.floor(x + PLAYER.width / 2 - 0.001);
    const y0 = Math.floor(y - PLAYER.height);
    const y1 = Math.floor(y - 0.001);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (t.solid(cx, cy)) return true;
    return false;
  }

  private groundBelow(t: Terrain): boolean {
    const x0 = Math.floor(this.x - PLAYER.width / 2);
    const x1 = Math.floor(this.x + PLAYER.width / 2 - 0.001);
    const cy = Math.floor(this.y + 0.01);
    for (let cx = x0; cx <= x1; cx++) if (t.solid(cx, cy)) return true;
    return false;
  }

  update(dt: number, input: PlayerInput, t: Terrain) {
    // sand fell on us: climb out
    for (let i = 0; i < 6 && this.collides(t, this.x, this.y); i++) this.y -= 1;

    this.inLiquid = t.liquid(Math.floor(this.x), Math.floor(this.y - PLAYER.height / 2));
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir) this.facing = dir > 0 ? 1 : -1;

    const target = dir * PLAYER.runSpeed * (this.inLiquid ? 0.55 : 1);
    const a = this.onGround ? PLAYER.accel : PLAYER.airAccel;
    if (this.vx < target) this.vx = Math.min(target, this.vx + a * dt);
    else if (this.vx > target) this.vx = Math.max(target, this.vx - a * dt);

    // jump / jetpack
    this.jetting = false;
    if (input.up) {
      if (this.onGround && !this.jumpHeld) {
        this.vy = -PLAYER.jumpSpeed;
        this.onGround = false;
      } else if (!this.onGround && this.fuel > 0 && (this.jumpHeld || this.vy > -10)) {
        this.vy = Math.max(-PLAYER.jetMaxUp, this.vy - PLAYER.jetAccel * dt);
        this.fuel = Math.max(0, this.fuel - dt);
        this.jetting = true;
      }
    }
    this.jumpHeld = input.up;
    if (this.onGround) this.fuel = Math.min(PLAYER.fuelMax, this.fuel + PLAYER.fuelRegen * dt * 2);
    else if (!this.jetting) this.fuel = Math.min(PLAYER.fuelMax, this.fuel + PLAYER.fuelRegen * dt * 0.15);

    const g = this.inLiquid ? PLAYER.gravity * 0.35 : PLAYER.gravity;
    this.vy = Math.min(this.inLiquid ? 30 : PLAYER.maxFall, this.vy + g * dt);
    if (this.inLiquid && input.up) this.vy = Math.max(-30, this.vy - 200 * dt);

    // integrate in sub-steps of at most half a cell
    const steps = Math.max(1, Math.ceil((Math.max(Math.abs(this.vx), Math.abs(this.vy)) * dt) / 0.5));
    const sdt = dt / steps;
    const wasGround = this.onGround;
    const fallSpeed = this.vy;
    for (let s = 0; s < steps; s++) {
      // horizontal
      const nx = this.x + this.vx * sdt;
      if (!this.collides(t, nx, this.y)) this.x = nx;
      else {
        let stepped = false;
        if (this.onGround || this.inLiquid) {
          for (let up = 1; up <= PLAYER.stepUp; up++) {
            if (!this.collides(t, nx, this.y - up)) {
              this.x = nx;
              this.y -= up;
              stepped = true;
              break;
            }
          }
        }
        if (!stepped) this.vx = 0;
      }
      // vertical
      const ny = this.y + this.vy * sdt;
      if (!this.collides(t, this.x, ny)) {
        this.y = ny;
        this.onGround = false;
      } else {
        if (this.vy > 0) {
          this.y = Math.floor(ny + 0.001) - 0.0001;
          while (this.collides(t, this.x, this.y)) this.y -= 1;
          this.onGround = true;
        }
        this.vy = 0;
      }
    }
    if (!this.onGround && this.vy >= 0 && this.groundBelow(t)) this.onGround = true;
    if (this.onGround && !wasGround && fallSpeed > 60) this.landed = Math.min(1, fallSpeed / 140);

    this.animTime += dt * (this.onGround ? Math.abs(this.vx) / 12 : 1);
  }

  /** Animation name and frame index for the renderer. */
  frame(): { anim: 'idle' | 'run' | 'jump'; index: number } {
    if (!this.onGround && !this.inLiquid) return { anim: 'jump', index: 0 };
    if (Math.abs(this.vx) > 3) return { anim: 'run', index: Math.floor(this.animTime) % 4 };
    return { anim: 'idle', index: Math.floor(performance.now() / 600) % 2 };
  }
}
