//! The cellular automaton. One byte of material per cell, one byte of
//! variation/data, one byte of structure (pipes) and one byte of clock.
//!
//! `var` layout: bits 0..=4 colour noise, bits 5..=7 per-material data
//! (rock vein, steam lifetime, core protection flag).

use crate::materials::*;

pub const CS: i32 = 32; // chunk size
pub const PROTECTED: u8 = 7; // data value marking indestructible core cells

/// Tunable simulation parameters. Probabilities are out of 65536.
#[derive(Clone, Debug)]
pub struct Params {
    pub conv_p: u32,
    pub sieve_p: u32,
    pub heat_p: u32,
    pub heat_r: i32,
    pub glass_p: u32,
    pub mag_r: i32,
    pub mag_samples: u32,
    pub drill_p: u32,
    pub drill_r: i32,
    pub sun: u32,
    pub random_ticks: u32,
    pub tide_on: bool,
    pub tide_base: i32,
    pub tide_amp: i32,
    pub tide_period: u32,
    pub sludge_spawn: u32,
    pub sea_cols: i32,
    pub settle_p: u32,
}

impl Default for Params {
    fn default() -> Self {
        Params {
            conv_p: prob(0.5),
            sieve_p: prob(0.35),
            heat_p: prob(0.25),
            heat_r: 1,
            glass_p: prob(0.15),
            mag_r: 6,
            mag_samples: 6,
            drill_p: prob(0.04),
            drill_r: 2,
            sun: prob(0.08),
            random_ticks: 1500,
            tide_on: true,
            tide_base: 300,
            tide_amp: 12,
            tide_period: 60 * 90,
            sludge_spawn: prob(0.02),
            sea_cols: 3,
            settle_p: prob(0.35),
        }
    }
}

pub const fn prob(f: f32) -> u32 {
    (f * 65536.0) as u32
}

pub struct World {
    pub w: i32,
    pub h: i32,
    pub mat: Vec<u8>,
    pub var: Vec<u8>,
    pub st: Vec<u8>,
    clock: Vec<u8>,
    pub rgba: Vec<u32>,
    pub tick: u32,
    rng: u32,
    cw: i32,
    ch: i32,
    active: Vec<bool>,
    next: Vec<bool>,
    machines: Vec<u32>,
    machines_dirty: bool,
    pub absorbed: [u32; 32],
    pub taken: [u32; 32],
    pub params: Params,
    pub tide_level: i32,
    palette: Vec<u32>,
    pub core: [i32; 4],
    pub moved_last_tick: u32,
}

impl World {
    pub fn new(w: i32, h: i32, seed: u32) -> World {
        let n = (w * h) as usize;
        let cw = (w + CS - 1) / CS;
        let ch = (h + CS - 1) / CS;
        let mut world = World {
            w,
            h,
            mat: vec![EMPTY; n],
            var: vec![0; n],
            st: vec![0; n],
            clock: vec![0; n],
            rgba: vec![0; n],
            tick: 0,
            rng: seed.wrapping_mul(2654435761).wrapping_add(0x9E3779B9) | 1,
            cw,
            ch,
            active: vec![true; (cw * ch) as usize],
            next: vec![true; (cw * ch) as usize],
            machines: Vec::new(),
            machines_dirty: true,
            absorbed: [0; 32],
            taken: [0; 32],
            params: Params::default(),
            tide_level: 0,
            palette: build_palette(),
            core: [0; 4],
            moved_last_tick: 0,
        };
        world.tide_level = world.params.tide_base;
        world
    }

    // ---------------------------------------------------------------- utils

    #[inline(always)]
    pub fn rand(&mut self) -> u32 {
        let mut x = self.rng;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.rng = x;
        x
    }

    #[inline(always)]
    pub fn chance(&mut self, p: u32) -> bool {
        (self.rand() & 0xFFFF) < p
    }

    #[inline(always)]
    pub fn idx(&self, x: i32, y: i32) -> usize {
        (y * self.w + x) as usize
    }

    #[inline(always)]
    pub fn inb(&self, x: i32, y: i32) -> bool {
        x >= 0 && y >= 0 && x < self.w && y < self.h
    }

    pub fn get(&self, x: i32, y: i32) -> u8 {
        if self.inb(x, y) {
            self.mat[self.idx(x, y)]
        } else {
            BEDROCK
        }
    }

    #[inline(always)]
    pub fn data(&self, i: usize) -> u8 {
        self.var[i] >> 5
    }

    fn noise_byte(&mut self) -> u8 {
        (self.rand() & 31) as u8
    }

    /// Write a cell with fresh colour noise.
    pub fn set(&mut self, x: i32, y: i32, m: u8, data: u8) {
        if !self.inb(x, y) {
            return;
        }
        let i = self.idx(x, y);
        let old = self.mat[i];
        self.mat[i] = m;
        self.var[i] = self.noise_byte() | (data << 5);
        if is_machine(m) || is_machine(old) {
            self.machines_dirty = true;
        }
        self.wake(x, y);
    }

    /// Change material but keep the colour noise (reactions).
    fn transmute(&mut self, i: usize, m: u8) {
        self.mat[i] = m;
        self.var[i] &= 31;
        let x = (i as i32) % self.w;
        let y = (i as i32) / self.w;
        self.wake(x, y);
    }

    #[inline(always)]
    fn mark(&mut self, cx: i32, cy: i32) {
        if cx >= 0 && cy >= 0 && cx < self.cw && cy < self.ch {
            self.next[(cy * self.cw + cx) as usize] = true;
        }
    }

    #[inline(always)]
    pub fn wake(&mut self, x: i32, y: i32) {
        let cx = x / CS;
        let cy = y / CS;
        self.mark(cx, cy);
        let lx = x % CS;
        let ly = y % CS;
        let dx = if lx == 0 { -1 } else if lx == CS - 1 { 1 } else { 0 };
        let dy = if ly == 0 { -1 } else if ly == CS - 1 { 1 } else { 0 };
        if dx != 0 {
            self.mark(cx + dx, cy);
        }
        if dy != 0 {
            self.mark(cx, cy + dy);
        }
        if dx != 0 && dy != 0 {
            self.mark(cx + dx, cy + dy);
        }
    }

    pub fn wake_all(&mut self) {
        for a in self.next.iter_mut() {
            *a = true;
        }
        for a in self.active.iter_mut() {
            *a = true;
        }
        self.machines_dirty = true;
    }

    pub fn active_chunks(&self) -> u32 {
        self.active.iter().filter(|a| **a).count() as u32
    }

    // ------------------------------------------------------------- movement

    /// Can `mover` enter cell `j` coming from direction (dx, dy)?
    #[inline(always)]
    fn pipe_ok(&self, j: usize, dx: i32, dy: i32) -> bool {
        let s = self.st[j];
        if s == 0 {
            return true;
        }
        let (px, py) = pipe_dir(s);
        px * dx + py * dy >= 0
    }

    /// Returns 0 = blocked, 1 = empty (move), 2 = displace (swap).
    #[inline(always)]
    fn displace(&mut self, mover: u8, target: u8) -> u8 {
        if target == EMPTY {
            return 1;
        }
        let mp = props(mover);
        let tp = props(target);
        match tp.kind {
            Kind::Gas => {
                if mp.kind != Kind::Gas {
                    2
                } else {
                    0
                }
            }
            Kind::Liquid => {
                if (mp.kind == Kind::Powder || mp.kind == Kind::Liquid) && mp.density > tp.density {
                    let diff = (mp.density - tp.density) as u32;
                    let pr = (diff * 6554).min(65536);
                    if self.chance(pr) {
                        2
                    } else {
                        0
                    }
                } else {
                    0
                }
            }
            _ => 0,
        }
    }

    #[inline(always)]
    fn swap(&mut self, i: usize, j: usize, cur: u8) {
        self.mat.swap(i, j);
        self.var.swap(i, j);
        self.clock[i] = cur;
        self.clock[j] = cur;
        let w = self.w;
        self.wake((i as i32) % w, (i as i32) / w);
        self.wake((j as i32) % w, (j as i32) / w);
        self.moved_last_tick += 1;
    }

    /// Try to move the particle at (x,y) by (dx,dy). Returns true on success.
    #[inline(always)]
    fn try_move(&mut self, x: i32, y: i32, dx: i32, dy: i32, cur: u8) -> bool {
        let nx = x + dx;
        let ny = y + dy;
        if !self.inb(nx, ny) {
            return false;
        }
        let i = self.idx(x, y);
        let j = self.idx(nx, ny);
        if !self.pipe_ok(j, dx, dy) {
            return false;
        }
        let m = self.mat[i];
        let t = self.mat[j];
        if self.displace(m, t) != 0 {
            self.swap(i, j, cur);
            true
        } else {
            false
        }
    }

    fn update_pipe(&mut self, x: i32, y: i32, cur: u8) {
        let i = self.idx(x, y);
        let (dx, dy) = pipe_dir(self.st[i]);
        let nx = x + dx;
        let ny = y + dy;
        if !self.inb(nx, ny) {
            return;
        }
        let j = self.idx(nx, ny);
        let t = self.mat[j];
        if t == EMPTY || kind(t) == Kind::Gas {
            self.swap(i, j, cur);
        } else {
            // Keep the chunk awake while material is waiting in the pipe.
            self.wake(x, y);
        }
    }

    fn update_powder(&mut self, x: i32, y: i32, m: u8, cur: u8) {
        if self.try_move(x, y, 0, 1, cur) {
            return;
        }
        let below = self.get(x, y + 1);
        match below {
            CONV_L | CONV_R => {
                let d = if below == CONV_L { -1 } else { 1 };
                if self.chance(self.params.conv_p) {
                    if self.try_move(x, y, d, 0, cur) {
                        return;
                    }
                    // climb over a single obstacle
                    if self.try_move(x, y, d, -1, cur) {
                        return;
                    }
                }
                self.wake(x, y);
                return;
            }
            SIEVE => {
                if props(m).fine && self.sieve_through(x, y, m, cur) {
                    return;
                }
            }
            _ => {}
        }
        let slide = props(m).slide;
        if slide > 0 && (slide >= 65536 || self.chance(slide)) {
            let d = if self.rand() & 1 == 0 { -1 } else { 1 };
            if self.try_move(x, y, d, 1, cur) {
                return;
            }
            self.try_move(x, y, -d, 1, cur);
        }
    }

    fn sieve_through(&mut self, x: i32, y: i32, m: u8, cur: u8) -> bool {
        let mut p = self.params.sieve_p;
        if m == WETSAND {
            p /= 20; // sticky wet sand clogs screens
        }
        if !self.chance(p) {
            self.wake(x, y);
            return false;
        }
        let mut ty = y + 1;
        while ty < self.h && ty <= y + 4 && self.get(x, ty) == SIEVE {
            ty += 1;
        }
        if !self.inb(x, ty) {
            return false;
        }
        let i = self.idx(x, y);
        let j = self.idx(x, ty);
        let t = self.mat[j];
        if t == EMPTY || kind(t) == Kind::Gas || (kind(t) == Kind::Liquid && props(t).density < props(m).density) {
            self.swap(i, j, cur);
            return true;
        }
        false
    }

    fn update_liquid(&mut self, x: i32, y: i32, m: u8, cur: u8) {
        if self.try_move(x, y, 0, 1, cur) {
            return;
        }
        let below = self.get(x, y + 1);
        if below == SIEVE && self.sieve_through(x, y, m, cur) {
            return;
        }
        if (below == CONV_L || below == CONV_R) && self.chance(self.params.conv_p) {
            let d = if below == CONV_L { -1 } else { 1 };
            if self.try_move(x, y, d, 0, cur) {
                return;
            }
        }
        let d = if self.rand() & 1 == 0 { -1 } else { 1 };
        if self.try_move(x, y, d, 1, cur) || self.try_move(x, y, -d, 1, cur) {
            return;
        }
        let (disp, p) = if m == SLUDGE { (1, prob(0.2)) } else { (5, 65536) };
        if p < 65536 && !self.chance(p) {
            self.wake(x, y);
            return;
        }
        if self.flow_side(x, y, d, disp, cur) {
            return;
        }
        self.flow_side(x, y, -d, disp, cur);
    }

    fn flow_side(&mut self, x: i32, y: i32, d: i32, disp: i32, cur: u8) -> bool {
        let mut best = 0;
        for k in 1..=disp {
            let nx = x + d * k;
            if !self.inb(nx, y) {
                break;
            }
            let j = self.idx(nx, y);
            let t = self.mat[j];
            if (t == EMPTY || kind(t) == Kind::Gas) && self.pipe_ok(j, d, 0) {
                best = k;
                // prefer dropping into a hole
                if self.inb(nx, y + 1) && self.mat[self.idx(nx, y + 1)] == EMPTY {
                    break;
                }
            } else {
                break;
            }
        }
        if best > 0 {
            let i = self.idx(x, y);
            let j = self.idx(x + d * best, y);
            self.swap(i, j, cur);
            return true;
        }
        false
    }

    fn update_gas(&mut self, x: i32, y: i32, cur: u8) {
        let i = self.idx(x, y);
        // lifetime in data bits
        if self.chance(prob(0.02)) {
            let life = self.data(i);
            if life == 0 {
                if self.chance(prob(0.35)) {
                    self.transmute(i, WATER);
                } else {
                    self.transmute(i, EMPTY);
                }
                return;
            }
            self.var[i] = (self.var[i] & 31) | ((life - 1) << 5);
        }
        if y == 0 {
            self.transmute(i, EMPTY);
            return;
        }
        let d = if self.rand() & 1 == 0 { -1 } else { 1 };
        if self.gas_move(x, y, 0, -1, cur) || self.gas_move(x, y, d, -1, cur) || self.gas_move(x, y, -d, -1, cur) {
            return;
        }
        self.gas_move(x, y, d, 0, cur);
    }

    fn gas_move(&mut self, x: i32, y: i32, dx: i32, dy: i32, cur: u8) -> bool {
        let nx = x + dx;
        let ny = y + dy;
        if !self.inb(nx, ny) {
            return false;
        }
        let j = self.idx(nx, ny);
        if self.mat[j] == EMPTY && self.pipe_ok(j, dx, dy) {
            let i = self.idx(x, y);
            self.swap(i, j, cur);
            return true;
        }
        false
    }

    // -------------------------------------------------------------- systems

    fn update_tide(&mut self) {
        let p = &self.params;
        if !p.tide_on || p.sea_cols <= 0 {
            return;
        }
        let t = self.tick as f32 / p.tide_period.max(1) as f32 * core::f32::consts::TAU;
        let level = p.tide_base as f32 - fast_sin(t) * p.tide_amp as f32;
        self.tide_level = level as i32;
        let cols = p.sea_cols.min(self.w);
        let spawn = p.sludge_spawn;
        for x in 0..cols {
            for y in 0..self.h {
                let i = self.idx(x, y);
                let m = self.mat[i];
                if y >= self.tide_level {
                    if m == EMPTY || m == STEAM {
                        let nm = if y > self.tide_level + 6 && self.chance(spawn) { SLUDGE } else { WATER };
                        self.set(x, y, nm, 0);
                    }
                } else if m == WATER || m == SLUDGE {
                    self.set(x, y, EMPTY, 0);
                }
            }
            // keep the sea chunks awake
            let mut y = 0;
            while y < self.h {
                self.wake(x, y);
                y += CS;
            }
        }
    }

    fn rebuild_machines(&mut self) {
        self.machines.clear();
        for i in 0..self.mat.len() {
            if is_machine(self.mat[i]) {
                self.machines.push(i as u32);
            }
        }
        self.machines_dirty = false;
    }

    fn update_machines(&mut self, cur: u8) {
        if self.machines_dirty {
            self.rebuild_machines();
        }
        let n = self.machines.len();
        for k in 0..n {
            let i = self.machines[k] as usize;
            let x = (i as i32) % self.w;
            let y = (i as i32) / self.w;
            match self.mat[i] {
                INLET => self.inlet(x, y),
                DRYER => self.heat(x, y, false),
                FURNACE => self.heat(x, y, true),
                MAGNET => self.magnet(x, y, cur),
                DRILL => self.drill(x, y),
                _ => {}
            }
        }
    }

    fn inlet(&mut self, x: i32, y: i32) {
        for (dx, dy) in [(0, -1), (-1, 0), (1, 0), (0, 1)] {
            let nx = x + dx;
            let ny = y + dy;
            if !self.inb(nx, ny) {
                continue;
            }
            let j = self.idx(nx, ny);
            let m = self.mat[j];
            if is_loose(m) {
                self.absorbed[m as usize] += 1;
                self.set(nx, ny, EMPTY, 0);
            }
        }
    }

    fn heat(&mut self, x: i32, y: i32, furnace: bool) {
        let r = self.params.heat_r;
        let p = if furnace { self.params.heat_p * 2 } else { self.params.heat_p };
        if !self.chance(p) {
            return;
        }
        let side = 2 * r + 1;
        let dx = (self.rand() % side as u32) as i32 - r;
        let dy = (self.rand() % side as u32) as i32 - r;
        let nx = x + dx;
        let ny = y + dy;
        if !self.inb(nx, ny) {
            return;
        }
        let j = self.idx(nx, ny);
        match self.mat[j] {
            WETSAND => self.transmute(j, SAND),
            SLUDGE => self.transmute(j, WETSAND),
            WATER => {
                if self.chance(prob(0.22)) {
                    self.transmute(j, SALT);
                } else {
                    self.set(nx, ny, STEAM, 5);
                }
            }
            SAND if furnace => {
                if self.chance(self.params.glass_p) {
                    self.transmute(j, GLASS);
                }
            }
            _ => {}
        }
        self.wake(x, y);
    }

    fn magnet(&mut self, x: i32, y: i32, cur: u8) {
        let r = self.params.mag_r;
        let side = (2 * r + 1) as u32;
        for _ in 0..self.params.mag_samples {
            let dx = (self.rand() % side) as i32 - r;
            let dy = (self.rand() % side) as i32 - r;
            if dx == 0 && dy == 0 {
                continue;
            }
            let nx = x + dx;
            let ny = y + dy;
            if !self.inb(nx, ny) {
                continue;
            }
            let j = self.idx(nx, ny);
            if !props(self.mat[j]).magnetic {
                continue;
            }
            let (sx, sy) = if dx.abs() >= dy.abs() { (-dx.signum(), 0) } else { (0, -dy.signum()) };
            self.try_move(nx, ny, sx, sy, cur);
        }
        self.wake(x, y);
    }

    fn drill(&mut self, x: i32, y: i32) {
        if !self.chance(self.params.drill_p) {
            self.wake(x, y);
            return;
        }
        let r = self.params.drill_r;
        let side = (2 * r + 1) as u32;
        let dx = (self.rand() % side) as i32 - r;
        let dy = (self.rand() % side) as i32 - r;
        let nx = x + dx;
        let ny = y + dy;
        if self.inb(nx, ny) && self.mat[self.idx(nx, ny)] == ROCK {
            self.break_rock(nx, ny);
        }
        self.wake(x, y);
    }

    /// Turn a rock cell into its loose drop.
    pub fn break_rock(&mut self, x: i32, y: i32) {
        let i = self.idx(x, y);
        let vein = self.data(i);
        let r = self.rand() % 100;
        let drop = match vein {
            1 => {
                if r < 75 {
                    SHELL
                } else {
                    GRAVEL
                }
            }
            2 => {
                if r < 65 {
                    MAGNETITE
                } else {
                    GRAVEL
                }
            }
            3 => SAND,
            _ => {
                if r < 70 {
                    GRAVEL
                } else {
                    SAND
                }
            }
        };
        self.set(x, y, drop, 0);
    }

    fn random_tick(&mut self) {
        let n = self.mat.len() as u32;
        for _ in 0..self.params.random_ticks {
            let i = (self.rand() % n) as usize;
            let m = self.mat[i];
            match m {
                SLUDGE | SAND | WETSAND | SALT => {}
                _ => continue,
            }
            let x = (i as i32) % self.w;
            let y = (i as i32) / self.w;
            let (nx, ny) = match self.rand() & 3 {
                0 => (x, y - 1),
                1 => (x, y + 1),
                2 => (x - 1, y),
                _ => (x + 1, y),
            };
            let nb = self.get(nx, ny);
            match m {
                SLUDGE => {
                    let below = self.get(x, y + 1);
                    let resting = below != EMPTY && below != WATER;
                    if resting && self.chance(self.params.settle_p) {
                        let r = self.rand() % 100;
                        let out = if r < 72 {
                            WETSAND
                        } else if r < 86 {
                            SHELL
                        } else if r < 93 {
                            MAGNETITE
                        } else {
                            GRAVEL
                        };
                        self.transmute(i, out);
                        if self.get(x, y - 1) == EMPTY && self.rand() & 1 == 0 {
                            self.set(x, y - 1, WATER, 0);
                        }
                    }
                }
                SAND => {
                    if nb == WATER && self.chance(prob(0.3)) {
                        self.transmute(i, WETSAND);
                        let j = self.idx(nx, ny);
                        self.transmute(j, EMPTY);
                    }
                }
                WETSAND => {
                    if self.get(x, y - 1) == EMPTY && nb != WATER && self.chance(self.params.sun) {
                        self.transmute(i, SAND);
                    }
                }
                SALT => {
                    if nb == WATER && self.chance(prob(0.25)) {
                        self.transmute(i, EMPTY);
                    }
                }
                _ => {}
            }
        }
    }

    // ------------------------------------------------------------------ step

    pub fn step(&mut self) {
        self.tick = self.tick.wrapping_add(1);
        let cur = (self.tick & 0xFF) as u8;
        core::mem::swap(&mut self.active, &mut self.next);
        for a in self.next.iter_mut() {
            *a = false;
        }
        self.moved_last_tick = 0;

        self.update_tide();
        self.update_machines(cur);
        self.random_tick();

        let ltr = self.tick & 1 == 0;
        let w = self.w;
        for y in (0..self.h).rev() {
            let row = (y / CS) * self.cw;
            for n in 0..w {
                let x = if ltr { n } else { w - 1 - n };
                if !self.active[(row + x / CS) as usize] {
                    continue;
                }
                let i = (y * w + x) as usize;
                if self.clock[i] == cur {
                    continue;
                }
                let m = self.mat[i];
                let k = kind(m);
                if k == Kind::Empty || k == Kind::Static {
                    continue;
                }
                if self.st[i] != 0 {
                    self.update_pipe(x, y, cur);
                    continue;
                }
                match k {
                    Kind::Powder => self.update_powder(x, y, m, cur),
                    Kind::Liquid => self.update_liquid(x, y, m, cur),
                    Kind::Gas => self.update_gas(x, y, cur),
                    _ => {}
                }
            }
        }
    }

    // ---------------------------------------------------------------- render

    pub fn render(&mut self, x0: i32, y0: i32, x1: i32, y1: i32) {
        let x0 = x0.clamp(0, self.w);
        let x1 = x1.clamp(0, self.w);
        let y0 = y0.clamp(0, self.h);
        let y1 = y1.clamp(0, self.h);
        for y in y0..y1 {
            let base = (y * self.w) as usize;
            for x in x0..x1 {
                let i = base + x as usize;
                let m = self.mat[i] as usize;
                let v = self.var[i];
                let mut c = self.palette[m * 32 + (v & 31) as usize];
                if m == ROCK as usize {
                    let vein = v >> 5;
                    if vein != 0 {
                        c = blend(c, vein_color(vein), 0.55);
                    }
                }
                if m == CONV_L as usize || m == CONV_R as usize {
                    // animated chevrons
                    let dir: i32 = if m == CONV_L as usize { 1 } else { -1 };
                    let phase = ((x + dir * (self.tick as i32 / 3)).rem_euclid(4)) as u32;
                    if phase == 0 {
                        c = blend(c, 0xd8d8d8, 0.5);
                    }
                }
                let s = self.st[i];
                if s != 0 {
                    c = if m == 0 { 0x30383f } else { blend(c, 0x30383f, 0.35) };
                    let along = if s == 1 || s == 3 { x } else { y };
                    if along.rem_euclid(4) == 0 {
                        c = blend(c, 0x9aa7b0, 0.6);
                    }
                }
                // ABGR little-endian for ImageData
                self.rgba[i] = if m == 0 && s == 0 {
                    0
                } else {
                    0xFF00_0000 | ((c & 0xFF) << 16) | (c & 0xFF00) | ((c >> 16) & 0xFF)
                };
            }
        }
    }

    // ----------------------------------------------------------- player API

    /// Remove up to `max` loose particles in a circle; counts land in `taken`.
    pub fn vacuum(&mut self, cx: i32, cy: i32, r: i32, max: u32, mask: u32) -> u32 {
        self.taken = [0; 32];
        let mut got = 0;
        let r2 = r * r;
        for y in (cy - r)..=(cy + r) {
            for x in (cx - r)..=(cx + r) {
                if got >= max {
                    return got;
                }
                if !self.inb(x, y) {
                    continue;
                }
                let dx = x - cx;
                let dy = y - cy;
                if dx * dx + dy * dy > r2 {
                    continue;
                }
                let i = self.idx(x, y);
                let m = self.mat[i];
                if is_loose(m) && mask & (1 << m) != 0 {
                    self.taken[m as usize] += 1;
                    self.set(x, y, EMPTY, 0);
                    got += 1;
                }
            }
        }
        got
    }

    /// Place up to `count` particles of `m` in empty cells of a circle.
    pub fn emit(&mut self, cx: i32, cy: i32, r: i32, m: u8, count: u32) -> u32 {
        let mut placed = 0;
        let r2 = r * r;
        // centre outwards so small counts form a tight stream
        for rr in 0..=r {
            for y in (cy - rr)..=(cy + rr) {
                for x in (cx - rr)..=(cx + rr) {
                    if placed >= count {
                        return placed;
                    }
                    let dx = x - cx;
                    let dy = y - cy;
                    let d2 = dx * dx + dy * dy;
                    if d2 > r2 || dx.abs().max(dy.abs()) != rr || !self.inb(x, y) {
                        continue;
                    }
                    let i = self.idx(x, y);
                    if self.mat[i] == EMPTY {
                        self.set(x, y, m, if m == STEAM { 5 } else { 0 });
                        placed += 1;
                    }
                }
            }
        }
        placed
    }

    /// Break rock in a circle with probability `p` per cell.
    pub fn drill_area(&mut self, cx: i32, cy: i32, r: i32, p: u32) -> u32 {
        let mut n = 0;
        let r2 = r * r;
        for y in (cy - r)..=(cy + r) {
            for x in (cx - r)..=(cx + r) {
                let dx = x - cx;
                let dy = y - cy;
                if dx * dx + dy * dy > r2 || !self.inb(x, y) {
                    continue;
                }
                if self.mat[self.idx(x, y)] == ROCK && self.chance(p) {
                    self.break_rock(x, y);
                    n += 1;
                }
            }
        }
        n
    }

    /// Place a structure cell. Only empty, liquid or gas cells can be built on.
    pub fn place(&mut self, x: i32, y: i32, m: u8) -> bool {
        if !self.inb(x, y) || !props(m).structure {
            return false;
        }
        let i = self.idx(x, y);
        let t = self.mat[i];
        if !(t == EMPTY || matches!(kind(t), Kind::Liquid | Kind::Gas)) {
            return false;
        }
        self.st[i] = 0;
        self.set(x, y, m, 0);
        true
    }

    pub fn place_pipe(&mut self, x: i32, y: i32, dir: u8) -> bool {
        if !self.inb(x, y) || dir == 0 || dir > 4 {
            return false;
        }
        let i = self.idx(x, y);
        let t = self.mat[i];
        if kind(t) == Kind::Static || self.st[i] != 0 {
            return false;
        }
        self.st[i] = dir;
        self.wake(x, y);
        true
    }

    /// Remove a structure or pipe. Returns the material id, 100+dir for pipes, 0 if nothing.
    pub fn deconstruct(&mut self, x: i32, y: i32) -> u32 {
        if !self.inb(x, y) {
            return 0;
        }
        let i = self.idx(x, y);
        let m = self.mat[i];
        if props(m).structure {
            if self.data(i) == PROTECTED {
                return 0;
            }
            self.set(x, y, EMPTY, 0);
            return m as u32;
        }
        if self.st[i] != 0 {
            let d = self.st[i];
            self.st[i] = 0;
            self.wake(x, y);
            return 100 + d as u32;
        }
        0
    }

    pub fn count(&self, m: u8) -> u32 {
        self.mat.iter().filter(|c| **c == m).count() as u32
    }

    pub fn clear(&mut self) {
        for c in self.mat.iter_mut() {
            *c = EMPTY;
        }
        for c in self.st.iter_mut() {
            *c = 0;
        }
        self.wake_all();
    }
}

#[inline(always)]
pub fn pipe_dir(s: u8) -> (i32, i32) {
    match s {
        1 => (0, -1),
        2 => (1, 0),
        3 => (0, 1),
        4 => (-1, 0),
        _ => (0, 0),
    }
}

fn vein_color(v: u8) -> u32 {
    match v {
        1 => 0xe6dcc3,
        2 => 0x23262e,
        3 => 0xc9a86a,
        _ => 0x6b6560,
    }
}

pub fn blend(a: u32, b: u32, t: f32) -> u32 {
    let ch = |s: u32| -> (f32, f32, f32) { (((s >> 16) & 255) as f32, ((s >> 8) & 255) as f32, (s & 255) as f32) };
    let (ar, ag, ab) = ch(a);
    let (br, bg, bb) = ch(b);
    let r = (ar + (br - ar) * t) as u32;
    let g = (ag + (bg - ag) * t) as u32;
    let bl = (ab + (bb - ab) * t) as u32;
    (r.min(255) << 16) | (g.min(255) << 8) | bl.min(255)
}

fn build_palette() -> Vec<u32> {
    let mut pal = vec![0u32; MAT_COUNT * 32];
    for m in 0..MAT_COUNT {
        let base = PROPS[m].rgb;
        for n in 0..32 {
            let f = 0.88 + (n as f32 / 31.0) * 0.24;
            let r = ((((base >> 16) & 255) as f32) * f).min(255.0) as u32;
            let g = ((((base >> 8) & 255) as f32) * f).min(255.0) as u32;
            let b = (((base & 255) as f32) * f).min(255.0) as u32;
            pal[m * 32 + n] = (r << 16) | (g << 8) | b;
        }
    }
    pal
}

/// Parabolic sine approximation, good enough for tides and free of libm.
pub fn fast_sin(x: f32) -> f32 {
    let tau = core::f32::consts::TAU;
    let pi = core::f32::consts::PI;
    let mut x = x % tau;
    if x > pi {
        x -= tau;
    } else if x < -pi {
        x += tau;
    }
    let y = (4.0 / pi) * x - (4.0 / (pi * pi)) * x * if x < 0.0 { -x } else { x };
    0.225 * (y * if y < 0.0 { -y } else { y } - y) + y
}
