# Balancing

Alle Zahlen stehen in `web/src/data/` (TypeScript) und in `sim/src/world.rs` → `Params::default()` (Physik).
`web/src/data/balance.test.ts` prüft Leitplanken automatisch.

## Materialwerte (pro Zelle)

| Material | Credits | Forschung | Herkunft |
|---|---:|---:|---|
| Rohschlick | 0,2 | – | Watt, Gezeiten |
| Nasser Sand | 0,4 | 0,002 | Strand, absetzender Schlick |
| Quarzsand | 1 | 0,01 | Dünen, getrockneter nasser Sand |
| Kies | 1,5 | 0,015 | Fels (Bohrer) |
| Muschelschill | 3 | 0,05 | helle Felsbänder, Schlick |
| Magnetit | 5 | 0,1 | dunkle Adern (tief/Klippe), Schlick |
| Meersalz | 6 | 0,08 | Trockner + Meerwasser |
| Glasgranulat | 12 | 0,25 | Schmelzofen + trockener Sand |

Grundsatz: Veredelung lohnt sich immer (Glas ≈ 12× Sand), und Forschungspunkte kommen vor allem aus veredelten Stoffen und Aufträgen.

## Werkzeuge (Startwerte → max.)

| Wert | Start | Upgrades |
|---|---|---|
| Tank | 300 | 600 / 1200 / 2500 |
| Saugradius | 6 | 8 / 11 |
| Saugrate (Zellen/Tick) | 14 | 22 / 36 |
| Handbohrer (Chance je Zelle/Tick) | 2 % | 5 % / 12 % |

Eine Tankladung Sand (300) bringt am Anfang 300 Credits. Eine Runde „Saugen → zur Basis → Auswerfen“ dauert etwa 10–15 s.

## Baukosten

| Struktur | Kosten | Freischaltung |
|---|---:|---|
| Treibholz-Wand | 1/Zelle | Start |
| Förderband | 4/Zelle | Förderbänder (2 FP) |
| Rüttelsieb | 5/Zelle | Rüttelsieb (3 FP) |
| Rohrleitung | 6/Zelle | Rohrleitungen (12 FP) |
| Trockner | 30/Zelle | Trockner (5 FP) |
| Schmelzofen | 120/Zelle | Schmelzofen (15 FP) |
| Magnetabscheider (3×3) | 60/Zelle | Magnetabscheider (8 FP) |
| Auto-Bohrer (3×3) | 80/Zelle | Auto-Bohrer (10 FP) |
| Annahmetrichter | 400/Zelle | Außenannahme (20 FP) |

Abriss erstattet 50 %.

## Progression

- **Aufträge** geben zusammen 85 FP + ~6.200 Credits als Belohnung, dazu ~116 FP aus den geforderten Lieferungen.
- **Pflichtpfad** zum Finale (Förderband, Sieb, Trockner, Schmelzofen, Magnet, Rohre, Expedition): 105 FP.
- **Gesamter Baum:** 279 FP. Etwa 70 % davon sind über die Aufträge erreichbar, der Rest durch freie Produktion.
- Zielspielzeit bis zum Alpha-Ende: **60–120 Minuten** (muss in Spieltests bestätigt werden).

## Physik-Parameter (Rust)

| Parameter | Wert | Wirkung |
|---|---|---|
| `conv_p` | 0,5 (0,85) | Förderband-Geschwindigkeit (Zellen/Tick) |
| `sieve_p` | 0,35 | Siebdurchlass; nasser Sand ÷20 (verstopft) |
| `heat_p` / `heat_r` | 0,25 / 1 (0,45 / 2) | Trockner-Rate / Reichweite, Ofen ×2 |
| `glass_p` | 0,15 | Chance Sand → Glas pro Ofen-Treffer |
| Wasser → Salz | 22 % | Rest wird Dampf (35 % kondensiert zurück) |
| `settle_p` | 0,35 | Schlick setzt sich ab: 72 % nasser Sand, 14 % Schill, 7 % Magnetit, 7 % Kies |
| `sun` | 0,08 (0,18) | Trocknung nasser Sand an der Luft (nur tagsüber) |
| Gezeiten | ±12 Zellen, 90 s Periode | Flutet das Watt, spült Schlick an |
| `drill_p` / `drill_r` | 0,04 / 40 (0,12 / 80) | Förderbohrer: Chance je Kopfspalte/Tick / Schachttiefe. Ein 3×3-Bohrer liefert ~7 Zellen/s (~18 mit Bohrtürmen) |
