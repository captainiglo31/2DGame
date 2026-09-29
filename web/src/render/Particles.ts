// Cosmetic particles in world space (they never touch the simulation):
// suction streams, eject sprays, drill sparks, jetpack flames, dust, sparkles.

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  /** Home in on (tx, ty) – used by the suction stream. */
  tx?: number;
  ty?: number;
  gravity?: number;
  glow?: boolean;
}

const MAX = 1500;

export class Particles {
  list: Particle[] = [];

  add(p: Partial<Particle> & { x: number; y: number }) {
    if (this.list.length >= MAX) this.list.shift();
    const life = p.life ?? 0.5;
    this.list.push({ vx: 0, vy: 0, color: '#fff', size: 1, ...p, life, max: life });
  }

  update(dt: number, target?: { x: number; y: number }) {
    for (const p of this.list) {
      p.life -= dt;
      if (p.tx !== undefined && p.ty !== undefined) {
        const tx = target?.x ?? p.tx;
        const ty = target?.y ?? p.ty;
        const dx = tx - p.x;
        const dy = ty - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const speed = 90 + (1 - p.life / p.max) * 160;
        p.vx += ((dx / d) * speed - p.vx) * Math.min(1, dt * 10);
        p.vy += ((dy / d) * speed - p.vy) * Math.min(1, dt * 10);
        if (d < 1.5) p.life = 0;
      }
      if (p.gravity) p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D, toScreen: (x: number, y: number) => { x: number; y: number }, zoom: number) {
    for (const p of this.list) {
      const s = toScreen(p.x, p.y);
      const a = Math.max(0, Math.min(1, p.life / p.max));
      const size = Math.max(1, p.size * zoom * (p.glow ? 0.6 + a * 0.6 : 1));
      ctx.globalAlpha = p.glow ? a : Math.min(1, a * 1.5);
      ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(s.x - size / 2), Math.round(s.y - size / 2), Math.ceil(size), Math.ceil(size));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
