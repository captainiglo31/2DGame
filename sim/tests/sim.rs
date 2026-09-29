use abyssal_sim::gen;
use abyssal_sim::materials::*;
use abyssal_sim::world::{prob, World};

/// A closed box with no tide and no random reactions.
fn boxed(w: i32, h: i32) -> World {
    let mut world = World::new(w, h, 42);
    world.params.tide_on = false;
    world.params.random_ticks = 0;
    for x in 0..w {
        world.set(x, h - 1, BEDROCK, 0);
    }
    for y in 0..h {
        world.set(0, y, BEDROCK, 0);
        world.set(w - 1, y, BEDROCK, 0);
    }
    world
}

fn run(world: &mut World, n: u32) {
    for _ in 0..n {
        world.step();
    }
}

#[test]
fn sand_falls_to_the_floor() {
    let mut w = boxed(16, 32);
    w.set(8, 2, SAND, 0);
    run(&mut w, 60);
    assert_eq!(w.get(8, 30), SAND);
    assert_eq!(w.count(SAND), 1);
}

#[test]
fn sand_forms_a_pile_and_mass_is_conserved() {
    let mut w = boxed(64, 64);
    for y in 5..25 {
        for x in 30..34 {
            w.set(x, y, SAND, 0);
        }
    }
    run(&mut w, 400);
    assert_eq!(w.count(SAND), 80);
    // the pile spreads wider than the source column
    let bottom: Vec<u8> = (1..63).map(|x| w.get(x, 62)).collect();
    let width = bottom.iter().filter(|m| **m == SAND).count();
    assert!(width > 6, "pile width {width}");
}

#[test]
fn water_levels_out() {
    let mut w = boxed(40, 20);
    for y in 2..16 {
        for x in 1..6 {
            w.set(x, y, WATER, 0);
        }
    }
    run(&mut w, 800);
    assert_eq!(w.count(WATER), 70);
    // 70 cells over 38 columns -> no column should hold more than 3
    for x in 1..39 {
        let col = (0..19).filter(|y| w.get(x, *y) == WATER).count();
        assert!(col <= 3, "column {x} has {col}");
    }
}

#[test]
fn sand_sinks_through_water() {
    let mut w = boxed(8, 20);
    for y in 10..19 {
        for x in 1..7 {
            w.set(x, y, WATER, 0);
        }
    }
    w.set(3, 2, SAND, 0);
    run(&mut w, 200);
    assert!((1..7).any(|x| w.get(x, 18) == SAND));
}

#[test]
fn sieve_separates_fine_from_coarse() {
    let mut w = boxed(20, 30);
    for x in 1..19 {
        w.place(x, 15, SIEVE);
    }
    for x in 8..12 {
        w.set(x, 3, SAND, 0);
        w.set(x, 2, GRAVEL, 0);
    }
    run(&mut w, 600);
    let below = |m: u8| (16..29).flat_map(|y| (1..19).map(move |x| (x, y))).filter(|(x, y)| w.get(*x, *y) == m).count();
    assert_eq!(below(SAND), 4);
    assert_eq!(below(GRAVEL), 0);
}

#[test]
fn conveyor_moves_sand_right() {
    let mut w = boxed(40, 12);
    for x in 1..30 {
        w.place(x, 8, CONV_R);
    }
    w.set(3, 7, SAND, 0);
    run(&mut w, 300);
    // it has travelled off the belt end and dropped down
    assert!((1..30).all(|x| w.get(x, 7) != SAND));
    assert_eq!(w.count(SAND), 1);
}

#[test]
fn dryer_turns_wet_sand_dry() {
    let mut w = boxed(12, 12);
    w.params.heat_p = 65536;
    w.place(5, 10, DRYER);
    w.set(4, 10, WETSAND, 0);
    w.set(6, 10, WETSAND, 0);
    run(&mut w, 300);
    assert_eq!(w.count(WETSAND), 0);
    assert_eq!(w.count(SAND), 2);
}

#[test]
fn inlet_absorbs_particles() {
    let mut w = boxed(12, 12);
    for x in 1..11 {
        w.place(x, 10, INLET);
    }
    for x in 3..8 {
        w.set(x, 2, SAND, 0);
    }
    w.set(5, 1, MAGNETITE, 0);
    run(&mut w, 100);
    assert_eq!(w.absorbed[SAND as usize], 5);
    assert_eq!(w.absorbed[MAGNETITE as usize], 1);
    assert_eq!(w.count(SAND), 0);
}

#[test]
fn pipe_lifts_water() {
    let mut w = boxed(20, 30);
    // pool at the bottom, riser from y=27 up to y=5, then right to x=15
    for y in 22..29 {
        for x in 1..8 {
            w.set(x, y, WATER, 0);
        }
    }
    for y in 5..28 {
        w.place_pipe(4, y, 1);
    }
    for x in 4..15 {
        w.place_pipe(x, 4, 2);
    }
    // basin on the right to catch it
    for y in 10..29 {
        w.place(12, y, WALL);
    }
    run(&mut w, 1500);
    let right = (13..19).flat_map(|x| (0..29).map(move |y| (x, y))).filter(|(x, y)| w.get(*x, *y) == WATER).count();
    assert!(right > 10, "only {right} cells lifted");
}

#[test]
fn magnet_attracts_magnetite() {
    let mut w = boxed(30, 20);
    w.params.mag_samples = 32;
    w.place(15, 18, MAGNET);
    w.set(10, 18, MAGNETITE, 0);
    w.set(20, 18, MAGNETITE, 0);
    run(&mut w, 400);
    assert_eq!(w.get(14, 18), MAGNETITE);
    assert_eq!(w.get(16, 18), MAGNETITE);
}

#[test]
fn drill_digs_a_shaft_and_outputs_on_top() {
    let mut w = boxed(60, 40);
    w.params.drill_p = 65536;
    for y in 10..39 {
        for x in 1..59 {
            w.set(x, y, ROCK, 2);
        }
    }
    // 3x3 drill sitting on the rock surface
    for y in 7..10 {
        for x in 29..32 {
            w.place(x, y, DRILL);
        }
    }
    // a belt at head height carries the output away
    for x in 32..58 {
        w.place(x, 7, CONV_R);
    }
    for x in 2..29 {
        w.place(x, 7, CONV_L);
    }
    w.params.conv_p = 65536;
    let rock0 = w.count(ROCK);
    run(&mut w, 600);
    let dug = rock0 - w.count(ROCK);
    assert!(dug >= 80, "dug {dug}"); // 3 columns x 29 rows of rock
    // the shaft below the drill is open, everything came out on top
    assert_eq!(w.count(MAGNETITE) + w.count(GRAVEL), dug);
    for y in 10..20 {
        assert_eq!(w.get(30, y), EMPTY);
    }
}

#[test]
fn drill_pumps_loose_sand_up() {
    let mut w = boxed(40, 30);
    w.params.drill_p = 65536;
    for y in 10..29 {
        for x in 1..39 {
            w.set(x, y, WETSAND, 0);
        }
    }
    for x in 19..22 {
        w.place(x, 9, DRILL);
    }
    for x in 22..39 {
        w.place(x, 9, CONV_R);
    }
    for x in 1..19 {
        w.place(x, 9, CONV_L);
    }
    w.params.conv_p = 65536;
    let before = w.count(WETSAND);
    run(&mut w, 600);
    assert_eq!(w.count(WETSAND), before, "sand is conserved");
    // sand has been lifted above the surface
    let above = (0..9).flat_map(|y| (1..39).map(move |x| (x, y))).filter(|(x, y)| w.get(*x, *y) == WETSAND).count();
    assert!(above >= 60, "lifted {above}");
}

#[test]
fn flat_sieve_shakes_coarse_grains_off() {
    let mut w = boxed(30, 30);
    for x in 10..20 {
        w.place(x, 15, SIEVE);
    }
    for x in 13..17 {
        w.set(x, 14, GRAVEL, 0);
        w.set(x, 13, GRAVEL, 0);
    }
    run(&mut w, 2000);
    let on_sieve = (0..15).flat_map(|y| (10..20).map(move |x| (x, y))).filter(|(x, y)| w.get(*x, *y) == GRAVEL).count();
    assert!(on_sieve < 8, "{on_sieve} still on the sieve");
}

#[test]
fn vacuum_and_emit_round_trip() {
    let mut w = boxed(20, 20);
    for x in 5..10 {
        w.set(x, 18, SAND, 0);
    }
    let got = w.vacuum(7, 18, 4, 100, !0);
    assert_eq!(got, 5);
    assert_eq!(w.taken[SAND as usize], 5);
    let placed = w.emit(10, 5, 3, SAND, 5);
    assert_eq!(placed, 5);
    assert_eq!(w.count(SAND), 5);
}

#[test]
fn core_is_protected() {
    let mut w = World::new(512, 256, 7);
    gen::generate(&mut w, 7);
    let [x, y, _, _] = w.core;
    assert_eq!(w.deconstruct(x + 5, y), 0);
    assert_eq!(w.get(x + 5, y), INLET);
}

#[test]
fn worldgen_is_deterministic_and_sane() {
    let mut a = World::new(512, 256, 1);
    let mut b = World::new(512, 256, 1);
    gen::generate(&mut a, 1);
    gen::generate(&mut b, 1);
    assert_eq!(a.mat, b.mat);
    assert!(a.count(WATER) > 1000);
    assert!(a.count(SLUDGE) > 100);
    assert!(a.count(ROCK) > 10000);
    assert!(a.count(INLET) > 10);
    // runs for a while without panicking
    for _ in 0..300 {
        a.step();
    }
}

#[test]
fn sludge_settles_into_minerals() {
    let mut w = boxed(20, 20);
    w.params.random_ticks = 400;
    w.params.settle_p = prob(1.0);
    for y in 14..19 {
        for x in 1..19 {
            w.set(x, y, SLUDGE, 0);
        }
    }
    run(&mut w, 600);
    assert!(w.count(SLUDGE) < 20);
    assert!(w.count(WETSAND) > 30);
}

#[test]
fn render_writes_opaque_pixels_for_matter() {
    let mut w = boxed(8, 8);
    w.set(3, 3, SAND, 0);
    w.render(0, 0, 8, 8);
    assert_eq!(w.rgba[w.idx(3, 3)] >> 24, 0xFF);
    assert_eq!(w.rgba[w.idx(3, 2)], 0);
}
