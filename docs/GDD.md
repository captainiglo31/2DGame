# Game Design Document (GDD)
# Projekt: Abyssal Drift (Arbeitstitel)

*Ein phänomenologisches Fabrik- und Partikelsimulationsspiel an der Schnittstelle von Küste und Tiefsee.*

---

## 1. Executive Summary & Vision

### 1.1 High Concept
*Abyssal Drift* ist ein Automations- und Aufbauspiel im Stil von *Sandustry* und *Factorio*, kombiniert mit der granularen Physik von zellulären Automaten (*The Powder Toy*, *Noita*). Anstelle von starren Fließbändern und Blackbox-Fabriken basiert die Logistik auf frei fließender Materie: Schlamm, Sand, Gase, Sole und Schwebstoffe. 

Die Reise verläuft vertikal: Beginnend am Brandungsstrand gewinnt der Spieler erste Rohstoffe aus nassen Sedimenten, baut Trocknungs- und Siebanlagen und expandiert schrittweise über Offshore-Plattformen bis in die kilometerweit abfallende abyssale Tiefsee.

### 1.2 Die drei Säulen (Core Pillars)
1. **Materie als Physik, nicht als Icon:** Ressourcen existieren physisch als Partikel im Gitter. Sie kleben, verklumpen, sedimentieren, erodieren und reagieren mit ihrer Umgebung.
2. **Der Mediumswechsel (Luft vs. Wasser):** In der Luft dominiert Schwerkraft und Verdunstung; im Ozean bestimmen Auftrieb, Strömung, hydrostatischer Druck und Dichteschichten das Verhalten aller Stoffe.
3. **Konstruktives Chaos & Prozessbeherrschung:** Jedes Verarbeitungsverfahren birgt Risiken: Trübungswolken behindern die Technik, feuchter Sand verstopft Rinnen, Salzwasser korrodiert ungeschützte Metalle, und instabile Gashydrate dekomprimieren explosiv bei schnellem Aufstieg.

---

## 2. Simulationsmodell & Physikalische Grundlagen

### 2.1 Das Dual-Grid-System
Die Simulation arbeitet mit zwei gekoppelten Berechnungsschichten:

1. **Eulerian Fluid Grid (Makro-Schicht, geringere Auflösung):**
   * Berechnet kontinuierliche Größen: Strömungsvektorfeld $\vec{v}(x,y)$, Wasserdruck $p$, Temperatur $T$ und Salinität $S$.
   * Nutzt vereinfachte Navier-Stokes-Gleichungen oder gitterbasierte Druckausgleichsalgorithmen.
2. **Cellular Automata Partikel-Grid (Mikro-Schicht, native Auflösung):**
   * Diskrete Partikelzellen (z. B. Sand, Erzschlamm, Gasbläschen, Schlacke).
   * Partikel bewegen sich primär nach zellulären Regeln (Schwerkraft, Freiwinkel/Schüttwinkel), werden jedoch durch die Geschwindigkeitsvektoren $\vec{v}$ des Fluid-Layers mitgerissen (Advektion).

### 2.2 Zustands- und Phasenmodell
Partikel besitzen dynamische Attribute:
* **Masse & Dichte ($\rho$):** Bestimmt das Absinken oder Aufsteigen im umgebenden Fluid.
  * $\rho_{Partikel} > \rho_{Wasser} \implies$ Sedimentation nach unten.
  * $\rho_{Partikel} < \rho_{Wasser} \implies$ Auftrieb nach oben (z. B. Methanblasen, Lipidschleim).
* **Feuchtigkeitsgehalt ($w$):**
  * $w = 0$: Trockenes Pulver (hoher Reibungswinkel, staubempfindlich bei Wind).
  * $0 < w < w_{sat}$: Halbtrocken/Pastös (klebrig, hoher Rollwiderstand, Neigung zu Blockaden).
  * $w \ge w_{sat}$: Slurry / Suspension (fließt wie viskoses Fluid, pumpfähig).
* **Salzkrusten-Potential:** Verdunsten Wassertropfen an freier Luft, schlägt sich festes Meersalz nieder, das Rinnen verengt.

---

## 3. Ressourcen & Reaktionsmatrix

### 3.1 Primäre Stoffgruppen

| Stoff | Medium-Verhalten | Reaktionen / Eigenschaften | Primärer Nutzen |
| :--- | :--- | :--- | :--- |
| **Rohschlick (Sludge)** | Zähflüssig; trennt sich langsam in Wasser und Feststoff | Verklumpt bei Stauung; blockiert Trockensiebe | Ausgangsmaterial für alle Frühphasen-Minerale |
| **Quarzsand** | Rieselfähig in Luft; sinkt mäßig schnell im Wasser | Kann zu Glas geschmolzen oder als Filterpackung genutzt werden | Baudekoration, Glasrohre, Optiken |
| **Muschelkalk / Schill** | Feinkörnig, leicht | Löst sich in Säuren auf; gebrannt entsteht Brandkalk | Zementproduktion, pH-Pufferung |
| **Schwermineralsand (Ilmenit/Magnetit)** | Hohe Dichte, sinkt rapide; magnetisch beeinflussbar | Lässt sich durch Magnetabscheider im Fluss umlenken | Eisen-, Titan- und Legierungsgewinnung |
| **Sole (Heavy Brine)** | Extrem dichtes Salzwasser; bildet Unterwasserseen | Mischt sich nur bei starker Strömung; extrem korrosiv | Chemische Aufbereitung, elektrochemische Zellen |
| **Methanhydrat (Fire Ice)** | Fest bei hohem Druck und Kälte; schwimmt im Wasser | Sublimiert schlagartig zu Gas bei Druckabfall / Wärme | Hocheffizienter Treibstoff & Kohlenstoffquelle |
| **Biolumineszenter Schleim** | Organisch, viskos, neutraler Auftrieb | Erhellt Tiefseebecken; zersetzt sich bei Hitze | Beleuchtung, biochemische Katalysatoren |

### 3.2 Beispiel-Reaktionen

```
[Rohschlick] + Schwerkraft / Rütteln 
   ──> [Klares Abwasser] + [Entwässerter Basissand]

[Entwässerter Basissand] + [Trockenhitze > 60°C] 
   ──> [Trockener Schüttsand] + [Wasserdampf]

[Trockener Schüttsand] + [Rüttelsieb 2mm] 
   ──> Grobkorn (Kies) + Feinkorn (Quarz & Schwermineralien)

[Feinkorn] + [Wasserstrom] + [Permanentmagnet-Spule] 
   ──> Abgelenkt: [Magnetitsand] | Geradeaus: [Quarzsand]

[Methanhydrat] + [Druckverlust ohne Kühlung] 
   ──> [Gasförmiges Methan (Expansionsfaktor 160x)] (Explosionsgefahr)
```

---

## 4. Progressions- und Expansionsphasen

```
      [ Küstenlinie ] ──────────> [ Flachwasser-Schelf ] ──────────> [ Abyssaler Tiefseegraben ]
   Trockene Schütttechnik          Hydrozyklone & Flotation             Druckkapselung & Thermik
```

### Phase 1: Die Brandung (Küste & Gezeitenwatt)
* **Spielbereich:** Dünenkamm, Strand, Gezeitenzone.
* **Kernmechanik:**
  * Schöpfwerke und Gezeitenbecken sammeln periodisch nassen Strandschlick.
  * Schwerkraftrinnen aus Treibholz leiten das Material in Absetzbecken.
  * Trocknung über Sonnenwärme und Wind; Bautätigkeit konzentriert sich auf das Verhindern von Versandung.
* **Typische Fehler:** Gezeitenwellen schwemmen offene Lagerstätten weg; Siebe setzen sich mit klebrigem Sand zu.

### Phase 2: Das Schelf (Plattformen & Schlammpumpen)
* **Spielbereich:** Flachmeer (10–100 m Tiefe), Offshore-Stelzenkonstruktionen.
* **Kernmechanik:**
  * Tiefensauger und Airlift-Mammutpumpen befördern kontinuierlich Sedimente nach oben.
  * Nassklassierung: Hydrozyklone nutzen Wirbelströme zur Trennung schwerer Mineralien ohne bewegliche Siebe.
  * Flotationszellen nutzen Schaumblasen, um feine Erze an die Wasseroberfläche zu tragen.
  * Entsalzung von Meerwasser, um Korrosionsschäden an Präzisionsmaschinen zu verhindern.
* **Typische Fehler:** Kavitationsbildung in Saugleitungen; Sedimentwolken reduzieren die Sicht und beschädigen Ansaugstutzen.

### Phase 3: Die abyssale Tiefe (Black Smoker & Druckkapseln)
* **Spielbereich:** Abyssale Ebene und Tiefseegräben (1.000–4.000 m Tiefe).
* **Kernmechanik:**
  * Das Fördern von Feststoffen an die Oberfläche wird energetisch ineffizient; die Fabrik verlagert sich auf den Meeresboden.
  * Nutzung geothermischer Gradienten hydrothermaler Quellen (400 °C Schlot-Fluid vs. 2 °C Meerwasser).
  * Abbau von polymetallischen Knollen und Methanhydrat unter extremem Umgebungsdruck.
  * Kontrolle dichter Unterwasser-Solebecken (*Brine Pools*), die als natürliche flüssige Auffangwannen dienen.
* **Typische Fehler:** Ungewollte Phasenübergänge (Hydrat-Explosionen); Dammbrüche schwerer Sole überfluten sensible Tiefsee-Elektronik.

---

## 5. Maschinen- & Infrastrukturkatalog

### 5.1 Mechanische Trennung & Klassierung
* **Schüttelrinne (Shaker Screen):** Geneigte Siebfläche; trennt Feststoffe nach Partikelgröße. Benötigt Trockenheit oder kontrollierten Wasserfluss.
* **Hydrozyklon:** Konischer Abscheider ohne bewegliche Teile. Trennt Partikel im Wasserwirbel nach Dichte (Schwermineralien unten, Schlamm oben).
* **Spiralkonzentrator:** Wendelrutsche zur Schwerkraftabscheidung feiner Erze im fließenden Wasserfilm.
* **Flotationskammer:** Bläst Mikroluftblasen durch eine Trübe. Hydrophobe Partikel steigen mit dem Schaum auf.

### 5.2 Fluidik & Fördertechnik
* **Mammutpumpe (Airlift):** Injiziert Pressluft am Fuß eines Steigrohrs. Die Dichteverringerung reißt Schlamm schonend nach oben (wartungsarm, keine Verstopfung durch Steine).
* **Sole-Ejektor:** Nutzt Hochdruck-Wasserstrahlen, um viskosen Schlick aus Trichtern anzusaugen.
* **Sedimentschürze (Geotextil-Vorhang):** Verhindert das unkontrollierte Ausbreiten von Schwebstoffwolken in benachbarte Becken.
* **Druckschleuse (Pneumatische Kaskade):** Bringt Tiefseematerialien schrittweise in Niederdruckzonen, ohne Dekompressionsschäden zu riskieren.

### 5.3 Thermische & Chemische Reaktoren
* **Verdampfungspfanne (Saline):** Breites, flaches Freiluftbecken; nutzt Sonnenwärme zur Kristallisation von Natriumchlorid und Mineralsalzen.
* **Drehtrommeltrockner:** Rotierender, beheizter Zylinder; befreit feuchten Schlick kontinuierlich von Restfeuchte.
* **Schlot-Wärmetauscher:** Gewinnt mechanische Energie und Prozesswärme direkt aus thermalen Quellen.

---

## 6. Risiken, Störfälle & Havarien

Um das Improvisations- und Optimierungsgefühl zu sichern, erfordern Fehlplanungen aktive Gegenmaßnahmen:

1. **Sedimentstau & Verbacken:**
   * Steht feuchter Sand in einem Trichter still, verliert er Fließfähigkeit. 
   * *Gegenmaßnahme:* Einbau von Rüttlern, Klopfhämmern oder Not-Spüldüsen.
2. **Kavitation & Rohrkollaps:**
   * Zu hohe Pumpraten bei dichten Schlämmen erzeugen Dampfblasen und zerstören Laufräder oder lassen flexible Schläuche kollabieren.
   * *Gegenmaßnahme:* Drosselklappen, Puffertanks, Verdünnungsventile.
3. **Trübung & Biosphären-Reaktion:**
   * Ungefilterte Abwässer trüben das Wasser ein. Strömungssensoren erblinden, und Tiefsee-Fauna setzt sich als Biofouling an verstopften Filtern fest.
   * *Gegenmaßnahme:* Absetzbecken, Flockungsmitteldosierung.
4. **Hydrat-Dekompression:**
   * Steigt gefrorenes Methanhydrat unkontrolliert in wärmere/flachere Schichten, dehnt sich das Gas schlagartig um das 160-fache aus. Das führt zu Rohrbruch oder Plattformkenterung durch Dichteverlust des aufgeschäumten Wassers.
   * *Gegenmaßnahme:* Druckfeste Kühlkapseln oder Direktverstromung am Grund.

---

## 7. Technische Architektur & Prototypen-Fahrplan

### 7.1 Technische Spezifikation
* **Zielumgebung:** PC / Desktop (Maus- und Tastatursteuerung).
* **Mögliche Engines:** 
  * *Godot 4.x:* Hohe Flexibilität mit Compute Shadern (`RenderingDevice`), Open-Source.
  * *Unity:* Bewährt für GPU-Buffer-Management (`ComputeBuffer`, HLSL-Compute-Shader).
  * *Custom WebGPU / C++:* Maximale Kontrolle über Cache-Lokalität und Bit-Packing.

### 7.2 Partikel-Datenstruktur (Compute Shader Layout)
Jedes Partikel im zellulären Automaten wird über eine kompakte Bitmaske (32 bis 64 Bit) beschrieben:

```c
struct Cell {
    uint8_t  type_id;      // 0: Leer, 1: Sand, 2: Schlamm, 3: Sole, etc.
    uint8_t  moisture;     // 0 (vollkommen trocken) bis 255 (gesättigt)
    uint8_t  temperature;  // Für Phasenübergänge & Schmelzprozesse
    uint8_t  flags;        // Bit 0: Schlafflag (Optimierung), Bit 1: IsSolid, etc.
};
```

### 7.3 Meilenstein-Plan

```
[ Meilenstein 1: Sand & Wasser ] 
  ──> 2D-Partikelgitter mit Schwerkraft, Schüttwinkel und einfachem Flüssigkeitsausgleich.

[ Meilenstein 2: Zweistoff-Schlamm & Trocknung ] 
  ──> Partikel enthalten Feuchtigkeit; Trennung in trockenes Sediment und Wasser über Rinnen.

[ Meilenstein 3: Strömungsfeld (Fluid-Kopplung) ] 
  ──> Eulerian-Gitter interagiert mit Schwebstoffen; Auftrieb und Strömungsmitnahme.

[ Meilenstein 4: Fabrikstrukturen ] 
  ──> Platzierbare Maschinen: Rüttelsiebe, Mammutpumpen, Hydrozyklone, Rinnen.

[ Meilenstein 5: Vertikaler Progressionsloop ] 
  ──> Küstenbiom -> Flachwasser -> Tiefseegraben mit Druck- und Methanmechanik.
```