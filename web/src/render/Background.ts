// Parallax background painted at 1/3 resolution for a crisp pixel look:
// sky gradient, sun/moon, stars, clouds, sea horizon and two mountain layers.

const SCALE = 3;

interface Cloud {
  x: number;
  y: number;
  w: number;
  seed: number;
  speed: number;
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i + seed * 31.7) * (1 - u) + hash(i + 1 + seed * 31.7) * u;
}

function lerpColor(a: number[], b: number[], t: number): number[] {
  return a.map((v, i) => v + (b[i] - v) * t);
}

const rgb = (c: number[], a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// sky palettes: [top, horizon]
const DAY = [
  [78, 150, 214],
  [196, 229, 240],
];
const DUSK = [
  [62, 70, 128],
  [246, 168, 112],
];
const NIGHT = [
  [8, 14, 38],
  [30, 44, 78],
];

export class Background {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private clouds: Cloud[] = [];
  private stars: { x: number; y: number; b: number }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    for (let i = 0; i < 14; i++) {
      this.clouds.push({ x: hash(i) * 2000, y: 10 + hash(i + 50) * 70, w: 30 + hash(i + 9) * 60, seed: i, speed: 2 + hash(i + 3) * 4 });
    }
    for (let i = 0; i < 120; i++) this.stars.push({ x: hash(i + 200), y: hash(i + 400) * 0.6, b: hash(i + 600) });
    this.resize();
  }

  resize() {
    const w = Math.ceil((this.canvas.clientWidth || innerWidth) / SCALE);
    const h = Math.ceil((this.canvas.clientHeight || innerHeight) / SCALE);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /**
   * @param horizonScreenY  screen y (css px) of the sea level
   * @param camX            camera x in cells (for parallax)
   * @param dayTime         0..1, 0.25 = noon
   */
  draw(horizonScreenY: number, camX: number, dayTime: number, time: number) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const hy = Math.round(horizonScreenY / SCALE);
    const sun = Math.sin(dayTime * Math.PI * 2); // >0 day
    const day = Math.max(0, Math.min(1, (sun + 0.15) / 0.4));
    const dusk = Math.max(0, 1 - Math.abs(sun) / 0.35) * 0.9;

    let top = lerpColor(NIGHT[0], DAY[0], day);
    let hor = lerpColor(NIGHT[1], DAY[1], day);
    top = lerpColor(top, DUSK[0], dusk * 0.5);
    hor = lerpColor(hor, DUSK[1], dusk);

    // banded gradient (pixel-art style dithered steps)
    const bands = 14;
    const skyH = Math.max(10, hy + 6);
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      ctx.fillStyle = rgb(lerpColor(top, hor, t * t));
      ctx.fillRect(0, Math.floor((i * skyH) / bands), W, Math.ceil(skyH / bands) + 1);
    }
    ctx.fillStyle = rgb(hor);
    ctx.fillRect(0, skyH, W, H - skyH);

    // stars
    if (day < 0.6) {
      for (const s of this.stars) {
        const tw = 0.5 + 0.5 * Math.sin(time * (1 + s.b * 3) + s.b * 20);
        ctx.fillStyle = `rgba(255,255,240,${(1 - day / 0.6) * (0.3 + 0.7 * s.b) * tw})`;
        ctx.fillRect(Math.floor(s.x * W), Math.floor(s.y * hy), 1, 1);
      }
    }

    // sun & moon travel along an arc
    const arc = (phase: number) => ({ x: W * (0.1 + 0.8 * ((phase + 1) % 1)), y: hy - Math.sin(phase * Math.PI * 2) * hy * 0.85 });
    const sp = arc(dayTime);
    if (sun > -0.1) {
      ctx.fillStyle = rgb(lerpColor([255, 170, 90], [255, 244, 200], day), 0.25);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgb(lerpColor([255, 150, 70], [255, 248, 220], day));
      ctx.fillRect(Math.round(sp.x) - 5, Math.round(sp.y) - 5, 10, 10);
      ctx.fillRect(Math.round(sp.x) - 6, Math.round(sp.y) - 3, 12, 6);
      ctx.fillRect(Math.round(sp.x) - 3, Math.round(sp.y) - 6, 6, 12);
    }
    const mp = arc(dayTime + 0.5);
    if (sun < 0.1) {
      ctx.fillStyle = 'rgba(230,236,255,0.9)';
      ctx.fillRect(Math.round(mp.x) - 4, Math.round(mp.y) - 4, 8, 8);
      ctx.fillRect(Math.round(mp.x) - 5, Math.round(mp.y) - 2, 10, 4);
      ctx.fillStyle = rgb(lerpColor(top, hor, 0.3));
      ctx.fillRect(Math.round(mp.x) - 1, Math.round(mp.y) - 4, 5, 6);
    }

    // far mountains (slow parallax)
    this.ridge(camX * 0.08, hy, 38, 0.012, 1, rgb(lerpColor(lerpColor(top, hor, 0.75), [70, 90, 120], 0.35)));
    // clouds
    for (const c of this.clouds) {
      const x = ((((c.x + time * c.speed - camX * 0.15) % (W + 200)) + W + 200) % (W + 200)) - 100;
      this.cloud(x, c.y * (hy / 100), c.w, c.seed, day);
    }
    // sea to the horizon
    const sea0 = lerpColor([24, 60, 100], [60, 130, 180], day);
    const sea1 = lerpColor([10, 26, 50], [30, 80, 130], day);
    for (let y = hy; y < H; y++) {
      const t = Math.min(1, (y - hy) / 40);
      ctx.fillStyle = rgb(lerpColor(sea0, sea1, t));
      ctx.fillRect(0, y, W, 1);
    }
    // glittering horizon line
    ctx.fillStyle = rgb(lerpColor(hor, [255, 255, 255], 0.4), 0.8);
    for (let x = 0; x < W; x += 3) if (hash(x + Math.floor(time * 2)) > 0.6) ctx.fillRect(x, hy + 1 + ((x * 7) % 3), 2, 1);
    // near headlands (faster parallax), right of the view
    this.ridge(camX * 0.22, hy + 2, 22, 0.03, 2, rgb(lerpColor([22, 32, 44], [86, 104, 110], day)), true);
  }

  private ridge(offset: number, base: number, height: number, freq: number, seed: number, color: string, headlands = false) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    ctx.fillStyle = color;
    for (let x = 0; x < W; x++) {
      const wx = x + offset;
      let n = noise1(wx * freq, seed) * 0.65 + noise1(wx * freq * 3, seed + 5) * 0.35;
      if (headlands) n = Math.max(0, n - 0.35) * 1.8;
      const hgt = Math.round(n * height);
      if (hgt > 0) ctx.fillRect(x, base - hgt, 1, hgt + 1);
    }
  }

  private cloud(x: number, y: number, w: number, seed: number, day: number) {
    const ctx = this.ctx;
    const light = rgb(lerpColor([70, 80, 110], [255, 255, 255], day), 0.85);
    const shade = rgb(lerpColor([50, 58, 86], [214, 226, 238], day), 0.85);
    const puffs = 4 + Math.floor(hash(seed) * 3);
    for (let i = 0; i < puffs; i++) {
      const px = x + (i / puffs) * w;
      const r = 5 + hash(seed * 7 + i) * 8;
      ctx.fillStyle = shade;
      ctx.fillRect(Math.round(px - r), Math.round(y - r * 0.5 + 2), Math.round(r * 2), Math.round(r));
      ctx.fillStyle = light;
      ctx.fillRect(Math.round(px - r + 1), Math.round(y - r * 0.8), Math.round(r * 2 - 2), Math.round(r));
    }
  }
}
