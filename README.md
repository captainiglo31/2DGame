# Abyssal Drift

Ein Fabrik- und Partikelsimulationsspiel im Stil von *Sandustry*: Jedes Sandkorn, jeder Tropfen und jedes Stück Schlick wird simuliert. Du baust an der Küste Sauger, Förderbänder, Siebe, Trockner und Öfen und arbeitest dich über Forschung und Aufträge zur Schelf-Expedition vor.

**Status:** Alpha 0.1 (Phase 1: Küste), spielbar im Browser.
Details: [Roadmap](docs/ROADMAP.md) · [Game Design Document](docs/GDD.md) · [Balancing](docs/BALANCING.md)

## Spielen

- **Einzeldatei (sofort):** Jeder CI-Lauf legt das Artefakt `abyssal-drift-single-file` ab (*Actions → Lauf → Artifacts*). Entpacken und `index.html` per Doppelklick im Browser öffnen, ein Server ist nicht nötig. Lokal erzeugt `npm run build:single` dieselbe Datei.
- **Online:** Pushes auf `main` werden automatisch auf GitHub Pages veröffentlicht. Einmalig einrichten: *Settings → Pages → Source: GitHub Actions*.
- **Lokal:** siehe unten (`npm run dev`).

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

## Sprachen

Das Spiel ist komplett auf **Deutsch** und **Englisch** verfügbar. Beim ersten Start richtet es sich nach der Browsersprache: Deutsch für `de-*`, sonst Englisch. Umschalten geht jederzeit über den Sprachschalter oben rechts im Hauptmenü oder unter *Einstellungen → Sprache*, die Wahl wird gespeichert.

Weitere Sprache hinzufügen:
1. `web/src/i18n/de.ts` nach z. B. `fr.ts` kopieren und übersetzen.
2. In `web/src/i18n/index.ts` die Tabelle registrieren (`Lang`-Typ + `tables`).
3. In `web/src/ui/menus.ts` bei `LANGS` den Eintrag `['fr', 'Français']` ergänzen.

`npm test` prüft automatisch, dass alle Sprachen dieselben Schlüssel haben und jeder im Code verwendete Text existiert.

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
