// Browser smoke test: serves ./dist, plays a few actions and writes screenshots.
// Usage: npm run build && npm run e2e   (screenshots land in test-results/)
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { existsSync } from 'node:fs';

const DIST = 'dist';
const OUT = 'test-results';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = normalize(join(DIST, url === '/' ? 'index.html' : url));
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
await mkdir(OUT, { recursive: true });

const executablePath = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = false;
const check = (cond, msg) => {
  console.log(`${cond ? '✔' : '✘'} ${msg}`);
  if (!cond) failed = true;
};

try {
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('[data-testid=new-game]', { timeout: 15000 });
  await page.screenshot({ path: `${OUT}/01-title.png` });
  check(true, 'title screen');

  await page.click('[data-testid=new-game]');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/02-start.png` });

  const info = () => page.evaluate(() => {
    const g = window.abyssal.game;
    return { credits: g.state.credits, inv: { ...g.state.inventory }, tick: g.sim.api.get_tick(), core: g.sim.core, cam: { ...g.camera }, delivered: { ...g.state.stats.delivered }, contract: g.state.contractIndex };
  });
  const a = await info();
  check(a.tick > 10, `simulation runs (tick ${a.tick})`);

  // Suck sand: find a sand column near the core and hold LMB there.
  const target = await page.evaluate(() => {
    const g = window.abyssal.game;
    const { sim } = g;
    const c = sim.core;
    for (let dx = 40; dx < 200; dx++) {
      const x = c.x + c.w + dx;
      for (let y = 0; y < sim.h; y++) {
        const m = sim.get(x, y);
        if (m === 3) return { wx: x, wy: y + 3 };
        if (m !== 0) break;
      }
    }
    return null;
  });
  check(!!target, 'found sand near base');
  const toScreen = (wx, wy) => page.evaluate(([x, y]) => window.abyssal.game.worldToScreen(x, y), [wx, wy]);
  let p = await toScreen(target.wx, target.wy);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down({ button: 'left' });
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(p.x + (i % 4) * 6, p.y + Math.floor(i / 4) * 6);
    await page.waitForTimeout(120);
  }
  await page.mouse.up({ button: 'left' });
  const b = await info();
  const sucked = Object.values(b.inv).reduce((s, n) => s + n, 0);
  check(sucked > 50, `vacuum picked up ${sucked} cells`);
  await page.screenshot({ path: `${OUT}/03-sucked.png` });

  // Eject above the funnel.
  p = await toScreen(b.core.x + b.core.w / 2, b.core.y - 8);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(1500);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(1500);
  const c = await info();
  check((c.delivered[3] ?? 0) > 20, `delivered sand to base (${c.delivered[3] ?? 0})`);
  check(c.credits > b.credits, `credits increased ${b.credits.toFixed(0)} -> ${c.credits.toFixed(0)}`);
  await page.screenshot({ path: `${OUT}/04-delivered.png` });

  // Build a wall.
  await page.keyboard.press('3');
  p = await toScreen(b.core.x - 30, b.core.y - 20);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 60, p.y, { steps: 10 });
  await page.mouse.up();
  const walls = await page.evaluate(() => window.abyssal.sim.api.count_mat(13));
  check(walls > 100, `built walls (${walls} wall cells incl. base)`);

  // Research dialog.
  await page.keyboard.press('t');
  await page.waitForSelector('[data-testid=research]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/05-research.png` });
  await page.keyboard.press('Escape');

  // Pause, settings, save.
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid=pause]');
  await page.screenshot({ path: `${OUT}/06-pause.png` });
  const saved = await page.evaluate(() => window.abyssal.game.save('1'));
  check(saved, 'saved to slot 1');
  const reloaded = await page.evaluate(() => {
    const raw = localStorage.getItem('abyssal.save.1');
    return raw ? raw.length : 0;
  });
  check(reloaded > 1000, `save size ${(reloaded / 1024).toFixed(0)} KB`);

  // Mobile viewport screenshot.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/07-mobile.png` });

  const perf = await page.evaluate(() => window.abyssal.game.debugInfo());
  console.log('perf', perf);
  check(errors.length === 0, `no console errors ${errors.length ? JSON.stringify(errors) : ''}`);
} catch (e) {
  console.error(e);
  failed = true;
  await page.screenshot({ path: `${OUT}/error.png` }).catch(() => {});
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
