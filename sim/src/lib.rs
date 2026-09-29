//! WebAssembly entry points. The JS side reads the cell buffers directly
//! from linear memory through the `*_ptr` exports.
#![allow(static_mut_refs)]
#![allow(clippy::missing_safety_doc)]

pub mod gen;
pub mod materials;
pub mod world;

use world::World;

static mut WORLD: Option<World> = None;

fn w() -> &'static mut World {
    unsafe { WORLD.as_mut().expect("world not initialised") }
}

#[no_mangle]
pub extern "C" fn init(width: i32, height: i32, seed: u32) {
    unsafe {
        WORLD = Some(World::new(width, height, seed));
    }
}

#[no_mangle]
pub extern "C" fn generate(seed: u32) {
    gen::generate(w(), seed);
}

#[no_mangle]
pub extern "C" fn clear_world() {
    w().clear();
}

#[no_mangle]
pub extern "C" fn step(n: u32) {
    let world = w();
    for _ in 0..n {
        world.step();
    }
}

#[no_mangle]
pub extern "C" fn render(x0: i32, y0: i32, x1: i32, y1: i32) {
    w().render(x0, y0, x1, y1);
}

#[no_mangle]
pub extern "C" fn pack(y0: i32, y1: i32) {
    w().pack(y0, y1);
}

#[no_mangle]
pub extern "C" fn mat_ptr() -> *const u8 {
    w().mat.as_ptr()
}
#[no_mangle]
pub extern "C" fn var_ptr() -> *const u8 {
    w().var.as_ptr()
}
#[no_mangle]
pub extern "C" fn st_ptr() -> *const u8 {
    w().st.as_ptr()
}
#[no_mangle]
pub extern "C" fn rgba_ptr() -> *const u32 {
    w().rgba.as_ptr()
}
#[no_mangle]
pub extern "C" fn absorbed_ptr() -> *const u32 {
    w().absorbed.as_ptr()
}
#[no_mangle]
pub extern "C" fn taken_ptr() -> *const u32 {
    w().taken.as_ptr()
}
#[no_mangle]
pub extern "C" fn reset_absorbed() {
    w().absorbed = [0; 32];
}

#[no_mangle]
pub extern "C" fn mat_count() -> u32 {
    materials::MAT_COUNT as u32
}
#[no_mangle]
pub extern "C" fn mat_rgb(m: u32) -> u32 {
    materials::PROPS[m as usize].rgb
}
#[no_mangle]
pub extern "C" fn mat_kind(m: u32) -> u32 {
    materials::PROPS[m as usize].kind as u32
}

#[no_mangle]
pub extern "C" fn set_param(id: u32, v: i32) {
    let p = &mut w().params;
    let u = v.max(0) as u32;
    match id {
        0 => p.conv_p = u,
        1 => p.sieve_p = u,
        2 => p.heat_p = u,
        3 => p.heat_r = v.clamp(1, 4),
        4 => p.glass_p = u,
        5 => p.mag_r = v.clamp(1, 16),
        6 => p.mag_samples = u.min(64),
        7 => p.drill_p = u,
        8 => p.drill_r = v.clamp(1, 256),
        9 => p.sun = u,
        10 => p.random_ticks = u.min(50_000),
        11 => p.tide_on = v != 0,
        12 => p.tide_base = v,
        13 => p.tide_amp = v,
        14 => p.tide_period = u.max(1),
        15 => p.sludge_spawn = u,
        16 => p.sea_cols = v,
        17 => p.settle_p = u,
        _ => {}
    }
}

#[no_mangle]
pub extern "C" fn get_tick() -> u32 {
    w().tick
}
#[no_mangle]
pub extern "C" fn set_tick(t: u32) {
    w().tick = t;
}
#[no_mangle]
pub extern "C" fn tide_level() -> i32 {
    w().tide_level
}
#[no_mangle]
pub extern "C" fn core_rect(i: u32) -> i32 {
    w().core[(i as usize).min(3)]
}
#[no_mangle]
pub extern "C" fn set_core_rect(x: i32, y: i32, cw: i32, ch: i32) {
    w().core = [x, y, cw, ch];
}
#[no_mangle]
pub extern "C" fn active_chunks() -> u32 {
    w().active_chunks()
}
#[no_mangle]
pub extern "C" fn wake_all() {
    w().wake_all();
}

#[no_mangle]
pub extern "C" fn get_cell(x: i32, y: i32) -> u32 {
    w().get(x, y) as u32
}
#[no_mangle]
pub extern "C" fn get_pipe(x: i32, y: i32) -> u32 {
    let world = w();
    if world.inb(x, y) {
        world.st[world.idx(x, y)] as u32
    } else {
        0
    }
}
#[no_mangle]
pub extern "C" fn vacuum(cx: i32, cy: i32, r: i32, max: u32, mask: u32) -> u32 {
    w().vacuum(cx, cy, r, max, mask)
}
#[no_mangle]
pub extern "C" fn emit(cx: i32, cy: i32, r: i32, m: u32, count: u32) -> u32 {
    w().emit(cx, cy, r, m as u8, count)
}
#[no_mangle]
pub extern "C" fn drill_area(cx: i32, cy: i32, r: i32, p: u32) -> u32 {
    w().drill_area(cx, cy, r, p)
}
#[no_mangle]
pub extern "C" fn place(x: i32, y: i32, m: u32) -> u32 {
    w().place(x, y, m as u8) as u32
}
#[no_mangle]
pub extern "C" fn place_pipe(x: i32, y: i32, dir: u32) -> u32 {
    w().place_pipe(x, y, dir as u8) as u32
}
#[no_mangle]
pub extern "C" fn deconstruct(x: i32, y: i32) -> u32 {
    w().deconstruct(x, y)
}
#[no_mangle]
pub extern "C" fn set_cell(x: i32, y: i32, m: u32, data: u32) {
    w().set(x, y, m as u8, data as u8);
}
#[no_mangle]
pub extern "C" fn count_mat(m: u32) -> u32 {
    w().count(m as u8)
}
