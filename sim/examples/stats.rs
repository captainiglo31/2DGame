use abyssal_sim::{gen, materials::*, world::World};
fn main() {
    for seed in [1u32, 2, 3, 12345] {
        let mut w = World::new(1024, 512, seed);
        gen::generate(&mut w, seed);
        let mut veins = [0u32; 8];
        let mut shallow = [0u32; 8];
        let l = gen::layout(1024, 512);
        for i in 0..w.mat.len() {
            if w.mat[i] == ROCK {
                let d = (w.var[i] >> 5) as usize;
                veins[d] += 1;
                let x = (i % 1024) as i32; let y = (i / 1024) as i32;
                // within 80 cells of the core horizontally and 60 below surface
                if (x - l.core_x).abs() < 150 && y < 330 { shallow[d] += 1; }
            }
        }
        println!("seed {seed}: rock veins {:?} near-core {:?} sludge {} water {} core {:?}", &veins[..4], &shallow[..4], w.count(SLUDGE), w.count(WATER), w.core);
        let t = std::time::Instant::now();
        for _ in 0..600 { w.step(); }
        println!("  600 ticks in {:?} ({:.2} ms/tick), sludge after {}", t.elapsed(), t.elapsed().as_secs_f64()*1000.0/600.0, w.count(SLUDGE));
    }
}
