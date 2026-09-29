// WebGL2 world renderer. Every screen pixel looks up its cell and shades it with
// world-space textures, edge highlights, depth darkness, water transparency and
// point lights. The simulation only supplies raw cell data (mat, var, pipe).

import type { Sim } from '../sim/Sim';

export interface Light {
  x: number;
  y: number;
  radius: number;
  r: number;
  g: number;
  b: number;
}

export interface FrameParams {
  camX: number;
  camY: number;
  zoom: number;
  time: number;
  /** 0 = night, 1 = full day. */
  daylight: number;
  lights: Light[];
}

const MAX_LIGHTS = 24;

const BLIT = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;      // canvas size in device pixels
uniform vec2 uCam;      // camera centre in cells
uniform float uZoom;    // device pixels per cell
uniform vec2 uOrigin;   // world cell of texel (0,0)
uniform vec2 uSize;     // texture size in cells
out vec4 outColor;
void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 world = uCam + (px - uRes * 0.5) / uZoom;
  vec2 uv = (world - uOrigin) / uSize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x >= 1.0 || uv.y >= 1.0) { outColor = vec4(0.0); return; }
  outColor = texture(uTex, uv);
}
`;

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uCells;   // r = mat, g = var, b = pipe
uniform sampler2D uCols;    // r,g = original surface (lo,hi), b,a = current sky surface (lo,hi)
uniform vec2 uWorld;        // world size in cells
uniform ivec2 uOrigin;      // top-left cell of the rendered block
uniform float uTime;
uniform float uDay;
uniform int uLightCount;
uniform vec4 uLights[${MAX_LIGHTS}];   // x, y, radius, unused
uniform vec3 uLightCol[${MAX_LIGHTS}];

out vec4 outColor;

// ---------------------------------------------------------------- helpers
float hash(ivec2 p) {
  uint h = uint(p.x) * 374761393u + uint(p.y) * 668265263u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float(h & 0xFFFFu) / 65535.0;
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(ivec2(i));
  float b = hash(ivec2(i) + ivec2(1, 0));
  float c = hash(ivec2(i) + ivec2(0, 1));
  float d = hash(ivec2(i) + ivec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
vec3 hex(int c) { return vec3(float((c >> 16) & 255), float((c >> 8) & 255), float(c & 255)) / 255.0; }

ivec4 cellAt(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= int(uWorld.x) || c.y >= int(uWorld.y)) return ivec4(2, 0, 0, 0);
  vec4 t = texelFetch(uCells, c, 0);
  return ivec4(t * 255.0 + 0.5);
}
int matAt(ivec2 c) { return cellAt(c).r; }

// material ids (mirror of materials.rs)
const int EMPTY = 0, ROCK = 1, BEDROCK = 2, SAND = 3, WETSAND = 4, SLUDGE = 5, WATER = 6, GRAVEL = 7,
  SHELL = 8, MAGNETITE = 9, SALT = 10, STEAM = 11, GLASS = 12, WALL = 13, CONV_L = 14, CONV_R = 15,
  SIEVE = 16, DRYER = 17, FURNACE = 18, MAGNET = 19, INLET = 20, DRILL = 21;

bool isAirLike(int m) { return m == EMPTY || m == STEAM; }
bool isLiquid(int m) { return m == WATER || m == SLUDGE; }
bool isSolidish(int m) { return !isAirLike(m) && !isLiquid(m); }

// 3-tone palette pick with a clustered noise so grains read as grains, not static
vec3 tones(vec3 a, vec3 b, vec3 c, float n) { return n < 0.33 ? a : (n < 0.72 ? b : c); }

// --------------------------------------------------------------- materials
// returns rgb albedo; emission goes to 'glow'
vec3 shade(int m, int v, ivec2 c, vec2 f, inout vec3 glow, inout float alpha) {
  float n = float(v & 31) / 31.0;          // per-cell noise from the sim
  float h = hash(c);                        // stable world-space noise
  float h2 = hash(c / 2);                   // 2x2 clusters
  int data = v >> 5;
  float t = uTime;

  if (m == ROCK) {
    float strata = vnoise(vec2(float(c.x) * 0.02, float(c.y) * 0.18)) * 0.6 + vnoise(vec2(c) * 0.08) * 0.4;
    vec3 base = mix(hex(0x5b5552), hex(0x7c746c), strata);
    base *= 0.9 + 0.2 * h2;
    if (data == 1) { // shell limestone
      vec3 s = tones(hex(0xd9cfb4), hex(0xebe3cc), hex(0xb9ad90), h);
      base = mix(base, s, h2 > 0.35 ? 0.85 : 0.35);
    } else if (data == 2) { // magnetite
      base = tones(hex(0x4a5264), hex(0x586275), hex(0x3c4354), h2) * (0.9 + 0.15 * n);
      if (h > 0.9) base = hex(0xaebfd6);    // metallic glint
    } else if (data == 3) { // sandstone
      float band = vnoise(vec2(float(c.x) * 0.05, float(c.y) * 0.5));
      base = mix(hex(0xb88a52), hex(0xd6aa6a), band) * (0.92 + 0.12 * h);
    }
    return base;
  }
  if (m == BEDROCK) return mix(hex(0x1e1b21), hex(0x2f2a31), h2) * (0.85 + 0.25 * h);
  if (m == SAND) {
    vec3 s = tones(hex(0xd9bd82), hex(0xe7cf96), hex(0xc9a96e), n);
    if (h > 0.97) s = hex(0xfff2cf);
    return s;
  }
  if (m == WETSAND) return tones(hex(0x8f7248), hex(0x9f8052), hex(0x7d6340), n) * (0.95 + 0.1 * sin(t * 0.8 + float(c.x) * 0.3) * step(0.9, h));
  if (m == SLUDGE) return tones(hex(0x4c4034), hex(0x584a3a), hex(0x3f352b), n) + vec3(0.03) * sin(t * 1.5 + h * 6.28);
  if (m == GRAVEL) return tones(hex(0x77736e), hex(0x96918a), hex(0x5d5a56), h2 * 0.7 + n * 0.3);
  if (m == SHELL) return tones(hex(0xf0e8d8), hex(0xe2d2bd), hex(0xf6dccf), n);
  if (m == MAGNETITE) { vec3 b = tones(hex(0x444c5c), hex(0x525b6d), hex(0x383f4d), n); return h > 0.88 ? hex(0xb4c4dc) : b; }
  if (m == SALT) return tones(hex(0xf7f9fa), hex(0xe6eef2), hex(0xffffff), n);
  if (m == GLASS) { alpha = 0.85; glow += hex(0x3cc8c8) * 0.08; return tones(hex(0x8fe0dc), hex(0xb6f2ee), hex(0x6fcfd0), n) + (h > 0.9 ? vec3(0.3) : vec3(0.0)); }
  if (m == STEAM) { alpha = 0.3 + 0.2 * n; return vec3(0.92, 0.95, 0.97); }

  // ------------------------------------------------------------ structures
  if (m == WALL) {
    if (data == 7) { // core hull: riveted steel
      vec3 p = mix(hex(0x3c4a57), hex(0x4a5a68), step(0.5, fract(float(c.x) / 6.0)));
      if (c.x % 6 == 0 || c.y % 5 == 0) p *= 0.75;
      if ((c.x % 6 == 1) && (c.y % 5 == 1)) p = hex(0x8a9aa8);
      return p;
    }
    int plank = c.y / 3;
    float pn = hash(ivec2(plank, c.x / 9));
    vec3 wood = mix(hex(0x6e4a2c), hex(0x8a6038), pn);
    wood *= 0.9 + 0.15 * vnoise(vec2(float(c.x) * 0.5, float(plank) * 3.0));
    if (c.y % 3 == 0) wood *= 0.7;                   // seam
    if ((c.x + plank * 5) % 9 == 0) wood *= 0.8;     // butt joint
    return wood;
  }
  if (m == CONV_L || m == CONV_R) {
    int dir = m == CONV_R ? 1 : -1;
    int phase = int(floor(float(c.x) - float(dir) * t * 12.0));
    vec3 belt = hex(0x2d3138);
    if (((phase % 4) + 4) % 4 == 0) belt = hex(0x4a515c);
    if (matAt(c + ivec2(0, -1)) != m) belt = mix(belt, hex(0x6b7480), 0.5); // top edge
    return belt;
  }
  if (m == SIEVE) {
    bool hole = ((c.x + c.y) & 1) == 0;
    vec3 frame = hex(0xa89370);
    return hole ? hex(0x3b3226) : frame * (0.9 + 0.2 * sin(t * 30.0 + float(c.x)) * 0.2);
  }
  if (m == DRYER) {
    vec3 brick = mix(hex(0x7a3222), hex(0x8f3f2a), h2);
    if (c.y % 2 == 0 && ((c.x + (c.y / 2) * 2) % 4 == 0)) brick *= 0.6;
    float pulse = 0.6 + 0.4 * sin(t * 3.0 + h * 6.28);
    if (c.y % 2 == 1 && c.x % 2 == 0) glow += hex(0xff6a2a) * 0.5 * pulse;
    return brick;
  }
  if (m == FURNACE) {
    float fl = 0.7 + 0.3 * sin(t * 9.0 + h * 12.0) * sin(t * 5.3 + float(c.y));
    glow += mix(hex(0xff5a14), hex(0xffd24a), n) * fl;
    return hex(0x55301e);
  }
  if (m == MAGNET) {
    vec3 coil = (c.y % 2 == 0) ? hex(0xb87333) : hex(0x8a5426);
    if (c.x % 3 == 0) coil = hex(0x5b2f86);
    glow += hex(0x8b3fb8) * (0.12 + 0.08 * sin(t * 4.0));
    return coil;
  }
  if (m == INLET) {
    float chev = fract((float(c.y) + float(abs(c.x % 8 - 4))) / 4.0 + t * 1.2);
    glow += hex(0x3fd0a0) * (0.35 + 0.35 * step(0.5, chev));
    return hex(0x1b6b55);
  }
  if (m == DRILL) {
    bool stripe = ((c.x + c.y + int(t * 8.0)) / 2) % 2 == 0;
    vec3 d = stripe ? hex(0xd4b21f) : hex(0x2b2b2b);
    if (matAt(c + ivec2(0, -1)) != DRILL) d = mix(d, hex(0xf0e0a0), 0.3);
    return d;
  }
  return vec3(1.0, 0.0, 1.0);
}

vec3 waterColor(ivec2 c, int m, inout float alpha) {
  // depth inside the water body
  int d = 0;
  for (int i = 1; i <= 24; i++) {
    int mm = matAt(c - ivec2(0, i));
    if (!isLiquid(mm)) break;
    d = i;
  }
  float depth = float(d) / 24.0;
  vec3 col;
  if (m == WATER) {
    col = mix(hex(0x3f8fc4), hex(0x14385e), depth);
    alpha = mix(0.62, 0.92, depth);
    // caustic shimmer
    float cs = vnoise(vec2(c) * 0.25 + vec2(uTime * 0.6, uTime * 0.3));
    col += vec3(0.06, 0.1, 0.12) * smoothstep(0.65, 0.9, cs) * (1.0 - depth);
  } else {
    col = mix(hex(0x5a4b3a), hex(0x2f261d), depth) + vec3(0.02) * sin(uTime + float(c.x) * 0.4);
    alpha = 0.97;
  }
  // surface foam line with a gentle wave
  if (isAirLike(matAt(c - ivec2(0, 1)))) {
    float wave = sin(float(c.x) * 0.35 + uTime * 2.2) * 0.5 + 0.5;
    col = mix(col, m == WATER ? hex(0xbfe8f6) : hex(0x8a7560), 0.55 + 0.3 * wave);
    alpha = max(alpha, 0.9);
  }
  return col;
}

int surfaceAt(int x, bool original) {
  vec4 t = texelFetch(uCols, ivec2(clamp(x, 0, int(uWorld.x) - 1), 0), 0);
  ivec4 b = ivec4(t * 255.0 + 0.5);
  return original ? (b.r | (b.g << 8)) : (b.b | (b.a << 8));
}

void main() {
  // one fragment per cell; the block is stored with row 0 = top cell row
  ivec2 c = uOrigin + ivec2(gl_FragCoord.xy);
  vec2 world = vec2(c) + 0.5;
  if (c.x < 0 || c.y < 0 || c.x >= int(uWorld.x) || c.y >= int(uWorld.y)) { outColor = vec4(0.0); return; }
  ivec4 cell = cellAt(c);
  int m = cell.r;
  int v = cell.g;
  int pipe = cell.b;
  vec2 f = vec2(0.5);

  float alpha = 1.0;
  vec3 glow = vec3(0.0);
  vec3 col;

  int origSurf = surfaceAt(c.x, true);
  int skySurf = surfaceAt(c.x, false);
  bool underground = c.y > origSurf + 2;

  if (isAirLike(m) && pipe == 0) {
    if (!underground) {
      if (m == STEAM) { col = vec3(0.93, 0.95, 0.97); alpha = 0.35; }
      else { outColor = vec4(0.0); return; }
    } else {
      // back wall of dug-out caves
      float bn = vnoise(vec2(c) * 0.15) * 0.5 + hash(c / 3) * 0.5;
      col = mix(hex(0x4a3c32), hex(0x5e4d40), bn);
      if (hash(c / 4) > 0.8) col *= 0.85; // loose stones in the wall
      if (m == STEAM) col = mix(col, vec3(0.9), 0.3);
    }
  } else if (isLiquid(m)) {
    col = waterColor(c, m, alpha);
  } else if (m == EMPTY) {
    col = underground ? hex(0x4a3c32) : vec3(0.0);
    alpha = underground ? 1.0 : 0.0;
  } else {
    col = shade(m, v, c, f, glow, alpha);
  }

  // pipes: dark tube with rims along the flow direction
  if (pipe != 0) {
    bool vertical = pipe == 1 || pipe == 3;
    ivec2 side = vertical ? ivec2(1, 0) : ivec2(0, 1);
    bool rimA = cellAt(c - side).b == 0;
    bool rimB = cellAt(c + side).b == 0;
    vec3 tube = hex(0x27313a);
    col = (m == EMPTY) ? tube : mix(col, tube, 0.35);
    alpha = 1.0;
    if (rimA || rimB) col = mix(col, hex(0x8796a3), 0.6);
    int along = vertical ? c.y : c.x;
    if (along % 6 == 0) col = mix(col, hex(0xa9b6c1), 0.5); // flange
  }

  // ------------------------------------------------------------- lighting
  bool solidHere = isSolidish(m) || isLiquid(m);
  // edge light: exposed top faces catch the sky, bottoms get a shadow
  if (solidHere && !isLiquid(m)) {
    bool airUp = isAirLike(matAt(c + ivec2(0, -1)));
    bool airDown = isAirLike(matAt(c + ivec2(0, 1)));
    bool airL = isAirLike(matAt(c + ivec2(-1, 0)));
    bool airR = isAirLike(matAt(c + ivec2(1, 0)));
    if (airUp) col *= 1.18;
    if (airDown) col *= 0.78;
    if (airL || airR) col *= 1.05;
  }

  // sky light: fades with depth below the open-air surface, and also reaches in
  // sideways from neighbouring columns so cliff faces and slopes stay lit
  float sky = 0.0;
  for (int i = -20; i <= 20; i += 4) {
    float d = float(c.y - surfaceAt(c.x + i, false)) + abs(float(i)) * 0.9;
    sky = max(sky, 1.0 - smoothstep(3.0, 58.0, d));
  }
  sky = max(sky, 0.16);
  vec3 ambientDay = vec3(1.0, 0.98, 0.94);
  vec3 ambientNight = vec3(0.26, 0.32, 0.5);
  vec3 ambient = mix(ambientNight, ambientDay, uDay) * sky + vec3(0.05, 0.05, 0.07);

  vec3 point = vec3(0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec4 L = uLights[i];
    float d = distance(world, L.xy);
    if (d < L.z) {
      float k = 1.0 - d / L.z;
      point += uLightCol[i] * k * k;
    }
  }

  vec3 lit = col * (ambient + point) + glow;
  outColor = vec4(lit * alpha, alpha); // premultiplied
}
`;

export class WorldRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private blit: WebGLProgram;
  private target: WebGLTexture;
  private fbo: WebGLFramebuffer;
  private targetSize = { w: 0, h: 0 };
  private bu: Record<string, WebGLUniformLocation | null> = {};
  private cellTex: WebGLTexture;
  private colTex: WebGLTexture;
  private colData: Uint8Array;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private sim: Sim;
  private lightBuf = new Float32Array(MAX_LIGHTS * 4);
  private lightCol = new Float32Array(MAX_LIGHTS * 3);
  originalSurface: number[] = [];

  static create(canvas: HTMLCanvasElement, sim: Sim): WorldRenderer | null {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return null;
    try {
      return new WorldRenderer(gl, sim);
    } catch (e) {
      console.warn('WebGL renderer unavailable', e);
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext, sim: Sim) {
    this.gl = gl;
    this.sim = sim;
    this.prog = link(gl, VERT, FRAG);
    gl.useProgram(this.prog);
    for (const name of ['uCells', 'uCols', 'uWorld', 'uOrigin', 'uTime', 'uDay', 'uLightCount', 'uLights', 'uLightCol']) {
      this.u[name] = gl.getUniformLocation(this.prog, name);
    }
    this.blit = link(gl, VERT, BLIT);
    for (const name of ['uTex', 'uRes', 'uCam', 'uZoom', 'uOrigin', 'uSize']) this.bu[name] = gl.getUniformLocation(this.blit, name);
    this.target = makeTex(gl, 1, 1);
    this.fbo = gl.createFramebuffer()!;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.cellTex = makeTex(gl, sim.w, sim.h);
    this.colTex = makeTex(gl, sim.w, 1);
    this.colData = new Uint8Array(sim.w * 4);
    gl.uniform1i(this.u.uCells, 0);
    gl.uniform1i(this.u.uCols, 1);
    gl.uniform2f(this.u.uWorld, sim.w, sim.h);
    gl.clearColor(0, 0, 0, 0);
  }

  setOriginalSurface(surface: number[]) {
    this.originalSurface = surface;
  }

  render(p: FrameParams) {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    const { w, h } = this.sim;
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const zoom = p.zoom * dpr;
    const halfW = canvas.width / 2 / zoom;
    const halfH = canvas.height / 2 / zoom;
    // upload extra rows above the view so water depth/edge lookups have data
    const y0 = Math.max(0, Math.floor(p.camY - halfH) - 2);
    const upY0 = Math.max(0, y0 - 26);
    const y1 = Math.min(h, Math.ceil(p.camY + halfH) + 2);
    const x0 = Math.max(0, Math.floor(p.camX - halfW) - 8);
    const x1 = Math.min(w, Math.ceil(p.camX + halfW) + 8);
    if (y1 <= y0) return;

    // cell data: upload the visible band of whole rows
    const upY1 = Math.min(h, y1 + 2);
    this.sim.api.pack(upY0, upY1);
    const bytes = new Uint8Array(this.sim.api.memory.buffer, this.sim.api.rgba_ptr() + upY0 * w * 4, (upY1 - upY0) * w * 4);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.cellTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, upY0, w, upY1 - upY0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);

    // per-column surfaces: original (for back walls) and current (for sky light)
    const mat = this.sim.mat;
    const cd = this.colData;
    for (let x = x0; x < x1; x++) {
      const o = this.originalSurface[x] ?? h;
      let y = 0;
      while (y < h) {
        const m = mat[y * w + x];
        if (m !== 0 && m !== 11 && m < 13) break; // structures don't cast depth shadow
        y++;
      }
      cd[x * 4] = o & 255;
      cd[x * 4 + 1] = o >> 8;
      cd[x * 4 + 2] = y & 255;
      cd[x * 4 + 3] = y >> 8;
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.colTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, 1, gl.RGBA, gl.UNSIGNED_BYTE, cd);

    const n = Math.min(MAX_LIGHTS, p.lights.length);
    for (let i = 0; i < n; i++) {
      const L = p.lights[i];
      this.lightBuf.set([L.x, L.y, L.radius, 0], i * 4);
      this.lightCol.set([L.r, L.g, L.b], i * 3);
    }

    // pass 1: shade every visible cell once into an offscreen block
    const bw = x1 - x0;
    const bh = y1 - y0;
    if (bw > this.targetSize.w || bh > this.targetSize.h) {
      this.targetSize = { w: Math.max(bw, this.targetSize.w), h: Math.max(bh, this.targetSize.h) };
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.target);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.targetSize.w, this.targetSize.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.target, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, bw, bh);
    gl.useProgram(this.prog);
    gl.uniform2i(this.u.uOrigin, x0, y0);
    gl.uniform1f(this.u.uTime, p.time);
    gl.uniform1f(this.u.uDay, p.daylight);
    gl.uniform1i(this.u.uLightCount, n);
    gl.uniform4fv(this.u.uLights, this.lightBuf);
    gl.uniform3fv(this.u.uLightCol, this.lightCol);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // pass 2: scale the block onto the screen with crisp nearest sampling
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.blit);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.target);
    gl.uniform1i(this.bu.uTex, 2);
    gl.uniform2f(this.bu.uRes, canvas.width, canvas.height);
    gl.uniform2f(this.bu.uCam, p.camX, p.camY);
    gl.uniform1f(this.bu.uZoom, zoom);
    gl.uniform2f(this.bu.uOrigin, x0, y0);
    gl.uniform2f(this.bu.uSize, this.targetSize.w, this.targetSize.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

function makeTex(gl: WebGL2RenderingContext, w: number, h: number): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
  return s;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link error');
  return p;
}
