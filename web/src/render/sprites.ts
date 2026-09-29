// Hand-made pixel art, stored as character grids with a shared palette.
// One sprite pixel = one world cell, so characters match the particle scale.

export const PALETTE: Record<string, string> = {
  k: '#15171f', // outline
  o: '#e8742a', // suit orange
  O: '#b3521c', // suit shade
  y: '#f7a65a', // suit highlight
  h: '#dfe4ea', // helmet
  H: '#98a2ad', // helmet shade
  v: '#3fd0e0', // visor
  V: '#1d7688', // visor shade
  w: '#f2fdff', // glint / white
  b: '#3a3f4a', // boots, belt, dark metal
  B: '#6b7480', // light metal
  t: '#2f8f83', // air tank
  T: '#1f5f58', // tank shade
  G: '#b8c4cc', // steel
  g: '#7d8a94', // steel shade
  n: '#8a6038', // wood
  N: '#5e3f22', // dark wood
  r: '#c8663a', // brick
  R: '#94452a', // brick shade
  a: '#8fe3ff', // liquid
  A: '#e8fbff', // bubble
  Y: '#e39a1c', // gold shade
  c: '#ffd24a', // gold
};

// ------------------------------------------------------------------ player
// 14×20, facing right. Body (rows 0–12) is shared, legs (rows 13–19) animate.
const BODY = [
  '....kkkkk.....',
  '...khhhhhk....',
  '..khhhhhhhk...',
  '..khhhvvvvk...',
  '..khhvwvvVk...',
  '..khhvvvVVk...',
  '.kkHhhhhhHk...',
  '.tTkkoooook...',
  '.tTkoyyoook...',
  '.tTkoyoooOk...',
  '.tTkooooOOk...',
  '.tTkooooOOk...',
  '.kkkbbbbbbk...',
];

const LEGS = {
  idle: ['...kooOkook...', '...koOk.kook..', '...koOk.kOok..', '...kOOk.kOOk..', '...kbbk.kbbk..', '...kbbBkkbbBk.', '...kkkkkkkkkk.'],
  runA: ['...kooOkook...', '..koOk..kook..', '..koOk..kOok..', '.kOOk....kOOk.', '.kbbk....kbbk.', '.kbbBk...kbbBk', '.kkkkk...kkkkk'],
  runB: ['...kooOkook...', '...koOkkook...', '...kOOkkOok...', '....kbbkOOk...', '....kbBkbbk...', '....kkkkbbBk..', '......kkkkk...'],
  jump: ['...kooOkook...', '..koOkkkOok...', '.koOk..kOok...', '.kbbk..kbbk...', '.kbbBk.kbbBk..', '.kkkkk.kkkkk..', '..............'],
};

const swapShade = (rows: string[]) => rows.map((r) => r.replace(/o/g, '#').replace(/O/g, 'o').replace(/#/g, 'O'));

export const PLAYER_FRAMES: Record<string, string[][]> = {
  idle: [
    [...BODY, ...LEGS.idle],
    [...BODY.slice(0, 1).map(() => '..............'), ...BODY.slice(0, 12), ...LEGS.idle],
  ],
  run: [
    [...BODY, ...LEGS.runA],
    [...BODY.slice(0, 1).map(() => '..............'), ...BODY.slice(0, 12), ...LEGS.runB],
    [...BODY, ...swapShade(LEGS.runA)],
    [...BODY.slice(0, 1).map(() => '..............'), ...BODY.slice(0, 12), ...swapShade(LEGS.runB)],
  ],
  jump: [[...BODY, ...LEGS.jump]],
};

/** Vacuum gun, pointing right. Pivot (hand) at (1, 2). */
export const GUN = ['......kkkkk.', '.kkkkkBBBBBk', 'koooBBbbbbak', '.kkkkkBBBBBk', '......kkkkk.'];
export const GUN_PIVOT = { x: 1, y: 2 };
/** Shoulder position inside the player sprite. */
export const SHOULDER = { x: 7, y: 9 };

// ------------------------------------------------------------------- icons
export const ICONS: Record<string, string[]> = {
  coin: [
    '...kkkkkk...',
    '..kccccccK..'.replace('K', 'k'),
    '.kccwwcccYk.',
    '.kcwcccccYk.',
    '.kcccYYccYk.',
    '.kccYkkYcYk.',
    '.kccYkkYcYk.',
    '.kcccYYccYk.',
    '.kcccccccYk.',
    '.kYcccccYYk.',
    '..kYYYYYYk..',
    '...kkkkkk...',
  ],
  flask: [
    '...kkkkkk...',
    '....kwwk....',
    '....kwwk....',
    '....kwwk....',
    '...kwwwwk...',
    '..kwwwwwwk..',
    '.kwwwwwwwwk.',
    '.kaaAaaaaak.',
    '.kaaaaaAaak.',
    '.kaAaaaaaak.',
    '..kaaaaaak..',
    '...kkkkkk...',
  ],
  vacuum: [
    '............',
    '.kkkkk......',
    'kBBBBBkk....',
    'kBbbbbBBkkk.',
    'kBbbbbbbbBak',
    'kBbbbbbbbBak',
    'kBbbbbBBkkk.',
    'kBBBBBkk....',
    '.kkkkk......',
    '..kk..a.a...',
    '..kk...a.a..',
    '.kkkk.......',
  ],
  drill: [
    '...kkkkkk...',
    '.kkGGGGGGkk.',
    'kGGkkkkkkGGk',
    'kGk..kn..kGk',
    '.k...kn...k.',
    '.....kn.....',
    '.....kn.....',
    '.....kn.....',
    '.....kn.....',
    '.....kn.....',
    '....kNNk....',
    '....kkkk....',
  ],
  build: [
    '............',
    'kkkkkkkkkkkk',
    'krrrrkrrrrrk',
    'kRRRRkRRRRRk',
    'kkkkkkkkkkkk',
    'krrrrrrkrrrk',
    'kRRRRRRkRRRk',
    'kkkkkkkkkkkk',
    'krrrrkrrrrrk',
    'kRRRRkRRRRRk',
    'kkkkkkkkkkkk',
    '............',
  ],
  remove: [
    '............',
    '.kkkkkkkk...',
    'kGGGGGGGGk..',
    'kGggggggGk..',
    '.kkkknkkk...',
    '....kn......',
    '....kn......',
    '....kn......',
    '....kn......',
    '....kn......',
    '...kNNk.....',
    '...kkkk.....',
  ],
  sun: [
    '.....cc.....',
    '.c...cc...c.',
    '..c......c..',
    '....cccc....',
    '...cwcccc...',
    'cc.cwcccY.cc',
    'cc.cccccY.cc',
    '...ccccY....',
    '....cYYY....',
    '..c......c..',
    '.c...cc...c.',
    '.....cc.....',
  ],
  moon: [
    '....kkkk....',
    '..kkhhhhk...',
    '.khhhhkk....',
    '.khhhk......',
    'khhhk.......',
    'khhhk.......',
    'khhhk.......',
    'khhhhk......',
    '.khhhhkk..k.',
    '.kHhhhhhkkk.',
    '..kkHHHHhk..',
    '....kkkk....',
  ],
  wave: [
    '............',
    '............',
    '...kkk......',
    '..kaaAk...k.',
    '.kaakkak.kak',
    'kaak..kaaaak',
    'kak....kaak.',
    '............',
    '..kkk....kkk',
    '.kaaak..kaaa',
    'kaa..kaak..k',
    '............',
  ],
  tank: [
    '....kkkk....',
    '...kGGGGk...',
    '..kkkkkkkk..',
    '.kttttttTTk.',
    '.ktwttttTTk.',
    '.ktwttttTTk.',
    '.kttttttTTk.',
    '.kttttttTTk.',
    '.kttttttTTk.',
    '.kttttttTTk.',
    '..kTTTTTTk..',
    '...kkkkkk...',
  ],
};

// ------------------------------------------------------------------ builder
/** Rasterise a sprite into a canvas (1 px per sprite pixel). */
export function buildSprite(rows: string[], flip = false): HTMLCanvasElement {
  const h = rows.length;
  const w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][flip ? w - 1 - x : x];
      const col = PALETTE[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

const iconCache = new Map<string, string>();
/** Data URL of an icon scaled up crisply (for DOM <img>). */
export function iconUrl(name: string, scale = 3): string {
  const key = `${name}@${scale}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const src = buildSprite(ICONS[name]);
  const c = document.createElement('canvas');
  c.width = src.width * scale;
  c.height = src.height * scale;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}

/** Every sprite grid, for the shape test. */
export function allGrids(): [string, string[]][] {
  const out: [string, string[]][] = [];
  for (const [k, frames] of Object.entries(PLAYER_FRAMES)) frames.forEach((f, i) => out.push([`player.${k}.${i}`, f]));
  out.push(['gun', GUN]);
  for (const [k, g] of Object.entries(ICONS)) out.push([`icon.${k}`, g]);
  return out;
}
