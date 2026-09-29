//! Procedural coast generator: sea -> tidal flat -> beach -> dunes -> cliffs.

use crate::materials::*;
use crate::world::{World, PROTECTED};

fn hash(mut x: u32) -> u32 {
    x ^= x >> 16;
    x = x.wrapping_mul(0x7feb352d);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846ca68b);
    x ^= x >> 16;
    x
}

fn h2(x: i32, y: i32, seed: u32) -> f32 {
    let v = hash((x as u32).wrapping_mul(73856093) ^ (y as u32).wrapping_mul(19349663) ^ seed.wrapping_mul(83492791));
    (v & 0xFFFF) as f32 / 65535.0
}

fn smooth(t: f32) -> f32 {
    t * t * (3.0 - 2.0 * t)
}

fn floor(x: f32) -> i32 {
    let i = x as i32;
    if (i as f32) > x {
        i - 1
    } else {
        i
    }
}

pub fn noise1(x: f32, seed: u32) -> f32 {
    let xi = floor(x);
    let t = smooth(x - xi as f32);
    let a = h2(xi, 0, seed);
    let b = h2(xi + 1, 0, seed);
    a + (b - a) * t
}

pub fn noise2(x: f32, y: f32, seed: u32) -> f32 {
    let xi = floor(x);
    let yi = floor(y);
    let tx = smooth(x - xi as f32);
    let ty = smooth(y - yi as f32);
    let a = h2(xi, yi, seed);
    let b = h2(xi + 1, yi, seed);
    let c = h2(xi, yi + 1, seed);
    let d = h2(xi + 1, yi + 1, seed);
    let ab = a + (b - a) * tx;
    let cd = c + (d - c) * tx;
    ab + (cd - ab) * ty
}

fn fbm1(x: f32, seed: u32) -> f32 {
    noise1(x, seed) * 0.6 + noise1(x * 2.3, seed + 1) * 0.3 + noise1(x * 5.1, seed + 2) * 0.1
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t.clamp(0.0, 1.0)
}

pub struct Layout {
    pub beach_start: i32,
    pub dune_start: i32,
    pub cliff_start: i32,
    pub sea_level: i32,
    pub core_x: i32,
}

pub fn layout(w: i32, h: i32) -> Layout {
    Layout {
        beach_start: (w as f32 * 0.22) as i32,
        dune_start: (w as f32 * 0.36) as i32,
        cliff_start: (w as f32 * 0.58) as i32,
        sea_level: (h as f32 * 0.585) as i32,
        core_x: (w as f32 * 0.43) as i32,
    }
}

pub fn surface(x: i32, w: i32, h: i32, seed: u32, l: &Layout) -> i32 {
    let hf = h as f32;
    let xf = x as f32;
    let n = fbm1(xf / 60.0, seed);
    let s = if x < l.beach_start {
        let t = xf / l.beach_start as f32;
        lerp(hf * 0.86, hf * 0.60, t) + (n - 0.5) * hf * 0.03
    } else if x < l.dune_start {
        let t = (x - l.beach_start) as f32 / (l.dune_start - l.beach_start) as f32;
        lerp(hf * 0.60, hf * 0.53, smooth(t)) + (n - 0.5) * hf * 0.01
    } else if x < l.cliff_start {
        let t = (x - l.dune_start) as f32 / (l.cliff_start - l.dune_start) as f32;
        let dune = (fbm1(xf / 25.0, seed + 7) - 0.5) * hf * 0.07;
        lerp(hf * 0.53, hf * 0.49, t) + dune
    } else {
        let t = (x - l.cliff_start) as f32 / 40.0;
        let top = hf * 0.36 + (n - 0.5) * hf * 0.08;
        lerp(hf * 0.49, top, smooth(t.min(1.0)))
    };
    // flatten the building site around the core
    let d = (x - l.core_x).abs();
    let flat = hf * 0.52;
    if d < 28 {
        return flat as i32;
    } else if d < 60 {
        let t = (d - 28) as f32 / 32.0;
        return lerp(flat, s, smooth(t)) as i32;
    }
    let _ = w;
    s as i32
}

pub fn generate(world: &mut World, seed: u32) {
    let w = world.w;
    let h = world.h;
    let l = layout(w, h);
    world.params.tide_base = l.sea_level;
    world.tide_level = l.sea_level;
    world.clear();

    for x in 0..w {
        let s = surface(x, w, h, seed, &l);
        for y in 0..h {
            let depth = y - s;
            let mut m = EMPTY;
            let mut data = 0u8;
            if depth >= 0 {
                let (soft_depth, top_mat) = if x < l.beach_start {
                    (26, SLUDGE)
                } else if x < l.dune_start {
                    (24, if s > l.sea_level - 6 { WETSAND } else { SAND })
                } else if x < l.cliff_start {
                    (38 + ((noise1(x as f32 / 30.0, seed + 3) * 12.0) as i32), SAND)
                } else {
                    (3, GRAVEL)
                };
                if depth < soft_depth {
                    m = if x < l.beach_start {
                        if depth < 5 + (noise1(x as f32 / 9.0, seed + 5) * 5.0) as i32 {
                            SLUDGE
                        } else if depth < 16 {
                            WETSAND
                        } else {
                            SAND
                        }
                    } else if top_mat == WETSAND && depth < 10 {
                        WETSAND
                    } else {
                        top_mat
                    };
                } else {
                    m = ROCK;
                    let rd = depth - soft_depth;
                    let xf = x as f32;
                    let yf = y as f32;
                    if rd < 70 && noise2(xf / 40.0, yf / 9.0, seed + 11) > 0.66 {
                        data = 1; // shell limestone band
                    }
                    if rd > 30 && noise2(xf / 16.0, yf / 16.0, seed + 13) > 0.74 {
                        data = 2; // magnetite pocket
                    }
                    if x >= l.cliff_start && rd > 10 && noise2(xf / 12.0, yf / 12.0, seed + 17) > 0.7 {
                        data = 2;
                    }
                    if data == 0 && rd < 40 && noise2(xf / 22.0, yf / 22.0, seed + 19) > 0.72 {
                        data = 3; // sandstone
                    }
                    if rd > 20 && noise2(xf / 30.0, yf / 14.0, seed + 23) > 0.78 {
                        m = if y > (h as f32 * 0.8) as i32 { WATER } else { EMPTY };
                        data = 0;
                    }
                }
            } else if x < l.dune_start && y >= l.sea_level {
                m = WATER;
            }
            if y >= h - 6 || x >= w - 2 || (y >= h - 12 && h2(x, y, seed + 29) > 0.5) {
                m = BEDROCK;
                data = 0;
            }
            if m != EMPTY {
                world.set(x, y, m, data);
            }
        }
    }
    build_core(world, &l, h);
    world.wake_all();
}

fn build_core(world: &mut World, l: &Layout, h: i32) {
    let top = (h as f32 * 0.52) as i32; // surface at the core site
    let body_w = 26;
    let body_h = 14;
    let x0 = l.core_x - body_w / 2;
    let y0 = top - body_h; // body sits on the ground
    for y in y0..top {
        for x in x0..x0 + body_w {
            world.set(x, y, WALL, PROTECTED);
        }
    }
    // inlet row on top of the body
    for x in x0 + 3..x0 + body_w - 3 {
        world.set(x, y0, INLET, PROTECTED);
    }
    // funnel lips
    for k in 0..6 {
        world.set(x0 + 2 - k, y0 - 1 - k, WALL, PROTECTED);
        world.set(x0 + body_w - 3 + k, y0 - 1 - k, WALL, PROTECTED);
    }
    // clear the air above the funnel
    for y in (y0 - 30).max(0)..y0 {
        for x in x0 - 6..x0 + body_w + 6 {
            let i = world.idx(x, y);
            if world.mat[i] != WALL {
                world.set(x, y, EMPTY, 0);
            }
        }
    }
    world.core = [x0, y0, body_w, body_h];
}
