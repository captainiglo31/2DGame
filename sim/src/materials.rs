//! Material table. The ids are mirrored in `web/src/sim/materials.ts`;
//! a test on the TypeScript side checks both tables stay in sync.

pub const EMPTY: u8 = 0;
pub const ROCK: u8 = 1;
pub const BEDROCK: u8 = 2;
pub const SAND: u8 = 3;
pub const WETSAND: u8 = 4;
pub const SLUDGE: u8 = 5;
pub const WATER: u8 = 6;
pub const GRAVEL: u8 = 7;
pub const SHELL: u8 = 8;
pub const MAGNETITE: u8 = 9;
pub const SALT: u8 = 10;
pub const STEAM: u8 = 11;
pub const GLASS: u8 = 12;
pub const WALL: u8 = 13;
pub const CONV_L: u8 = 14;
pub const CONV_R: u8 = 15;
pub const SIEVE: u8 = 16;
pub const DRYER: u8 = 17;
pub const FURNACE: u8 = 18;
pub const MAGNET: u8 = 19;
pub const INLET: u8 = 20;
pub const DRILL: u8 = 21;

pub const MAT_COUNT: usize = 22;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Empty,
    Static,
    Powder,
    Liquid,
    Gas,
}

#[derive(Clone, Copy)]
pub struct Props {
    pub kind: Kind,
    /// Relative density (water = 10).
    pub density: u8,
    /// Fine grains pass through sieves.
    pub fine: bool,
    pub magnetic: bool,
    /// Probability (out of 65536) that a powder slides diagonally. Low = sticky / steep piles.
    pub slide: u32,
    /// Player-built structure (can be deconstructed).
    pub structure: bool,
    /// Base colour 0xRRGGBB.
    pub rgb: u32,
}

const fn p(kind: Kind, density: u8, fine: bool, magnetic: bool, slide: f32, structure: bool, rgb: u32) -> Props {
    Props { kind, density, fine, magnetic, slide: (slide * 65536.0) as u32, structure, rgb }
}

use Kind::*;

pub const PROPS: [Props; MAT_COUNT] = [
    p(Empty, 0, false, false, 0.0, false, 0x000000),   // EMPTY
    p(Static, 255, false, false, 0.0, false, 0x6b6560), // ROCK
    p(Static, 255, false, false, 0.0, false, 0x2e2a2b), // BEDROCK
    p(Powder, 16, true, false, 1.0, false, 0xe2c98f),   // SAND
    p(Powder, 19, true, false, 0.07, false, 0xa88a5a),  // WETSAND
    p(Liquid, 15, true, false, 0.0, false, 0x5e5140),   // SLUDGE
    p(Liquid, 10, true, false, 0.0, false, 0x2f6fa8),   // WATER
    p(Powder, 18, false, false, 0.85, false, 0x8e8a84), // GRAVEL
    p(Powder, 13, false, false, 0.6, false, 0xe9e1d0),  // SHELL
    p(Powder, 25, true, true, 0.9, false, 0x3a3f4a),    // MAGNETITE
    p(Powder, 12, true, false, 0.8, false, 0xf4f4f0),   // SALT
    p(Gas, 1, true, false, 0.0, false, 0xc8d4dc),       // STEAM
    p(Powder, 17, false, false, 0.9, false, 0x9fe3e0),  // GLASS
    p(Static, 255, false, false, 0.0, true, 0x7a5332),  // WALL
    p(Static, 255, false, false, 0.0, true, 0x4a4f57),  // CONV_L
    p(Static, 255, false, false, 0.0, true, 0x4a4f57),  // CONV_R
    p(Static, 255, false, false, 0.0, true, 0xb5a27a),  // SIEVE
    p(Static, 255, false, false, 0.0, true, 0xc2512e),  // DRYER
    p(Static, 255, false, false, 0.0, true, 0xf08a24),  // FURNACE
    p(Static, 255, false, false, 0.0, true, 0x8b3fb8),  // MAGNET
    p(Static, 255, false, false, 0.0, true, 0x3fd0a0),  // INLET
    p(Static, 255, false, false, 0.0, true, 0xd4b21f),  // DRILL
];

#[inline(always)]
pub fn props(m: u8) -> &'static Props {
    &PROPS[m as usize]
}

#[inline(always)]
pub fn kind(m: u8) -> Kind {
    PROPS[m as usize].kind
}

/// Loose particles can be moved, vacuumed and absorbed.
#[inline(always)]
pub fn is_loose(m: u8) -> bool {
    matches!(kind(m), Powder | Liquid)
}

/// Machines that need a per-tick update.
#[inline(always)]
pub fn is_machine(m: u8) -> bool {
    matches!(m, DRYER | FURNACE | MAGNET | INLET | DRILL)
}
