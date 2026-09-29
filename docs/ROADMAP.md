# Abyssal Drift – Roadmap & Meilensteine

Stand: Alpha 0.1 · Plattform: **Browser zuerst** (PC), Mobile vorbereitet · Tech: **Rust → WebAssembly** (Simulation) + **TypeScript/Vite** (Spiel, UI, Rendering)

Legende: ✅ fertig · 🟡 teilweise · ⬜ offen

---

## Architektur-Entscheidungen

| Thema | Entscheidung | Begründung / Umstieg später |
|---|---|---|
| Simulation | Zellulärer Automat in Rust, CPU, 32×32-Chunks mit Schlafmodus | Einfach zu debuggen. GPU-Compute kann später hinter derselben API ersetzt werden |
| Welt | 1024×512 Zellen, eine Karte (Küste) | Größe ist in `data/balance.ts` konfigurierbar (Mobile: kleiner) |
| Rendering | Rust schreibt RGBA-Puffer, Canvas2D skaliert pixelgenau | WebGL-Shader (Licht, Wasser) bei Bedarf in M9 |
| Spiellogik | TypeScript, reine Funktionen in `game/state.ts` | Unit-testbar ohne Browser |
| Daten | Materialwerte, Kosten, Forschung, Aufträge als Tabellen in `web/src/data` | Balancing ohne Codeänderung |
| Eingabe | Pointer Events (Maus + Touch), Tastatur optional | Mobile-Steuerung ist bereits angelegt |
| Speichern | localStorage, RLE-komprimiert (~50 KB), 3 Slots + Autosave, Export/Import als Datei | IndexedDB/Cloud später möglich |
| Audio | Prozedural per WebAudio (keine Dateien) | Echte Musik/Samples in der Beta |

Das 2-Gitter-Modell aus dem GDD (Euler-Strömungsfeld + Partikel) ist **bewusst verschoben** (M8). Die Alpha nutzt Dichte-Tausch und gerichtete Rohre, das ist deutlich einfacher und performanter.

---

## M0 – Projekt-Setup ✅
- ✅ Rust-Crate `sim/` (cdylib → wasm32, ohne Abhängigkeiten, 75 KB)
- ✅ Vite + TypeScript Frontend `web/`
- ✅ Tests: `cargo test` (Physik), `vitest` (Logik), Playwright-Smoke-Test mit Screenshots
- ✅ GitHub-Actions: Tests + Build, Einzeldatei-Download als Artefakt, Deployment auf GitHub Pages (vom Hauptbranch)
- ✅ Einzeldatei-Build (`npm run build:single`) zum Teilen ohne Server

**Abnahme:** `npm run check` ist grün.

## M1 – Sand & Wasser ✅
- ✅ Pulver (Schüttwinkel je Material), Flüssigkeiten (Dispersion), Gase (Lebensdauer, Kondensation)
- ✅ Dichte: Schweres sinkt durch Leichtes (Sand in Wasser, Schlick unter Wasser)
- ✅ Chunk-Schlafmodus, abwechselnde Scan-Richtung gegen Drift
- ✅ Kamera (Zoom, Pan, Pinch), pixelgenaues Rendering

**Abnahme:** Masse bleibt erhalten (Test), Wasser nivelliert sich (Test), 60 FPS bei 1024×512.

## M2 – Schlick, Feuchte & Gezeiten ✅
- ✅ Rohschlick setzt sich ab → nasser Sand + Schill/Magnetit/Kies + Wasser
- ✅ Nasser Sand: klebrig (steile Hänge), verstopft Siebe, trocknet in der Sonne (Tag/Nacht)
- ✅ Sand wird nass bei Wasserkontakt; Salz löst sich in Wasser
- ✅ Gezeiten am linken Rand (Ebbe/Flut, spült Schlick an)
- ✅ „Random Ticks“ für langsame Reaktionen (auch in schlafenden Chunks)

## M3 – Welt & Werkzeuge ✅
- ✅ Prozedurale Küste: Meer → Watt → Strand → Dünen → Klippen, Gesteinsadern (Schill, Magnetit, Sandstein), Höhlen
- ✅ Basis mit Annahmetrichter (unzerstörbar)
- ✅ Sauger (Tank, Radius, Filter „Wasser mitsaugen“), Auswerfen, Handbohrer

## M4 – Fabrikstrukturen ✅
- ✅ Treibholz-Wand, Förderband (beide Richtungen), Rüttelsieb (schüttelt Grobes ab, nasser Sand verstopft), Trockner, Schmelzofen, Magnetabscheider, Förderbohrer (Schacht bis 40/80 tief, fördert Gestein oder Dünensand nach oben, Rückstau ohne Abtransport), Rohrleitung (4 Richtungen, auch Steigrohr), zusätzliche Annahmetrichter (nehmen nur von oben an)
- ✅ Bauen per Pinsel/Linie/Stempel, Richtung aus Ziehrichtung, Abriss mit 50 % Erstattung
- ✅ Baukosten, Vorschau (rot = nicht möglich)

## M5 – Progression ✅
- ✅ Wirtschaft: Credits + Forschungspunkte pro geliefertem Material
- ✅ 9 Hauptaufträge (zugleich Tutorial mit Hinweisen)
- ✅ Skilltree: 23 Knoten in 4 Zweigen (Werkzeuge, Logistik, Verarbeitung, Wirtschaft), Abhängigkeiten, Finale „Schelf-Expedition“ = Alpha-Ende
- ✅ Kreativmodus (alles frei, unbegrenzte Credits)

## M6 – Alpha-Rahmen ✅
- ✅ Hauptmenü, Pause, Speichern/Laden (3 Slots + Autosave + Export/Import)
- ✅ Einstellungen: Sprache (DE/EN), Lautstärken, UI-Skalierung, FPS, Nachtabdunklung, reduzierte Animationen, Simulationsgeschwindigkeit, Autosave-Intervall, Randscrollen, Tutorial-Hinweise
- ✅ Prozedurales Audio (Meer, Pad-Musik, Effekte)
- ✅ HUD: Ressourcen, Tank, Tag/Nacht, Gezeiten, Auftrag, Werkzeugleiste, Bau-Palette
- ✅ Steuerungshilfe, Statistik, Alpha-Abschlussbildschirm, Debug-Overlay (F3)

## M7 – Balancing & QA 🟡 *(laufend)*
- ✅ Balancing-Tabellen + automatischer Balancing-Test (Forschung/Credits reichen für den Pfad zum Finale)
- ✅ Browser-Smoke-Test (Saugen → Liefern → Bauen → Forschung → Speichern → automatische Fabrik → Nacht) mit Screenshots
- ✅ Weltgenerator-Statistik (`cargo run --release --example stats`): alle Rohstoffe erreichbar, ~2 ms/Tick
- ⬜ Echte Spieltests: Zeit bis zum Alpha-Ende messen (Ziel 60–120 min)
- ⬜ Feinschliff der Physik-Parameter nach Feedback
- ⬜ Performance-Budget auf schwachen Laptops / Handys messen

---

## Geplant (Beta)

### M8 – Phase 2: Das Schelf ⬜
- Zweite Karte / erweiterte Welt nach rechts unten ins Flachmeer
- Vereinfachtes Strömungsfeld (grobes Gitter 1/8), das Schwebstoffe mitnimmt
- Neue Maschinen: Hydrozyklon, Flotationszelle, Spiralkonzentrator, Mammutpumpe mit Luft
- Neue Risiken: Trübungswolken, Kavitation, Korrosion (Salzwasser)
- Energie-System (Generatoren, Leitungen)

### M9 – Präsentation ⬜
- WebGL-Renderer mit Licht (Trockner/Öfen glühen nachts), Wasser-Transparenz, Partikel-Effekte
- Echte Musik & Soundeffekte, Pixel-Art-Sprites für Maschinen
- Onboarding-Tutorial mit Hervorhebungen

### M10 – Mobile ⬜
- Touch-UI finalisieren (größere Buttons, Radial-Menü)
- Kleinere Welt / Performance-Profil für Handys
- Verpackung mit Capacitor (Android/iOS), PWA (offline spielbar)

### M11 – Phase 3: Tiefsee ⬜
- Druck, Methanhydrat (explosive Dekompression), Black Smoker, Solebecken
- Druckschleusen, Schlot-Wärmetauscher

### M12 – Release ⬜
- Desktop-Build mit Tauri (Steam), Achievements, Cloud-Saves, Lokalisierung weiterer Sprachen
