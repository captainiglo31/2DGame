# Abyssal Drift

Ein Fabrik- und Partikelsimulationsspiel im Stil von *Sandustry*: Jedes Sandkorn, jeder Tropfen und jedes Stück Schlick wird simuliert. Du baust an der Küste Sauger, Förderbänder, Siebe, Trockner und Öfen und arbeitest dich über Forschung und Aufträge zur Schelf-Expedition vor.

**Status:** Alpha 0.1 (Phase 1: Küste), spielbar im Browser.
Details: [Roadmap](docs/ROADMAP.md) · [Game Design Document](docs/GDD.md) · [Balancing](docs/BALANCING.md)

## Spielen

- **Online:** Nach jedem Push baut GitHub Actions das Spiel und veröffentlicht es auf GitHub Pages. Einmalig einrichten: *Settings → Pages → Source: GitHub Actions*.
- **Lokal:** siehe unten (`npm run dev`).
- **Einzeldatei:** `npm run build:single` erzeugt `dist-single/index.html`. Die Datei läuft per Doppelklick ohne Server.

## Entwicklung

Voraussetzungen: Node 20+, Rust (stable) mit `rustup target add wasm32-unknown-unknown`.

```bash
npm install
npm run dev          # baut WASM und startet den Dev-Server (http://localhost:5173)
npm run check        # Rust-Tests, Unit-Tests, Build, Browser-Smoke-Test
```

| Befehl | Zweck |
|---|---|
| `npm run wasm` | Rust-Simulation → `web/src/sim/sim.wasm` |
| `npm run test:rust` | Physik-Tests (`sim/tests`) |
| `npm test` | Logik-, Balancing-, Speicher- und i18n-Tests (Vitest) |
| `npm run build` | Produktions-Build nach `dist/` |
| `npm run e2e` | Headless-Chromium spielt eine Runde und legt Screenshots in `test-results/` ab |

## Aufbau

```
sim/                 Rust: zellulärer Automat (→ WebAssembly)
  src/materials.rs   Materialtabelle (Dichte, Schüttwinkel, Farben)
  src/world.rs       Simulation, Maschinen, Gezeiten, Werkzeuge
  src/gen.rs         Weltgenerator (Küste)
web/src/
  data/              Balancing-Tabellen: Werte, Kosten, Forschung, Aufträge
  game/              Spiellogik (state.ts = pure Funktionen) + Game.ts (Loop, Kamera, Werkzeuge, Rendering)
  ui/                HUD, Menüs, Forschungsbaum
  save/              Speichern/Laden (RLE + Base64, localStorage, Export/Import)
  audio/             Prozeduraler Sound (WebAudio)
  i18n/              Deutsch & Englisch
```
