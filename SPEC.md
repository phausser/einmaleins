# Einmaleins-Bombenabwehr

## Überblick

Browser-Spiel (HTML, CSS, JavaScript) zum Üben des Einmaleins. Bomben fallen vom Himmel; auf jeder Bombe steht eine Multiplikationsaufgabe. Der Spieler wählt aus drei Antworten die richtige. Bei richtiger Antwort richtet sich eine Laserkanone aus und zerstört die Bombe. Erreicht eine Bombe den Boden, explodiert sie und das Spiel endet.

Zielgruppe: Kinder, die das Einmaleins (1×1 bis 20×20) üben.

## Visuelles Konzept

### Stil
- Flache, klare Silhouetten (schwarz/gefüllt), analog zur Bomben-Referenzgrafik
- Kein fotorealistischer Look; spielerisch, gut lesbar, hoher Kontrast
- Bomben: klassische Fliegerbombe mit Heckflossen und spitzer Nase (siehe Referenzbild)
- Laserkanone unten: gleicher Silhouetten-Stil (z. B. Lafette + Lauf, schwarz)

### Szene
| Bereich | Darstellung |
|--------|-------------|
| Himmel | Blauer Verlauf (z. B. hellblau oben → etwas dunkler) |
| Boden | Grasgrünes Band am unteren Bildschirmrand |
| Bomben | Schwarze Silhouette, weiße/helle Matheaufgabe darauf |
| Partikel | Antriebsspur hinter der Bombe (Rauch/Funken nach oben) |
| Laser | Sichtbarer Strahl von Kanone zur Bombe bei Treffer |
| Explosion | Kurzer Partikel-/Blitz-Effekt bei Zerstörung oder Boden-Treffer |

### Referenz
- Bombenform: `assets/` bzw. mitgelieferte Referenzgrafik (drei Bomben-Silhouetten)

## Spielablauf

1. **Start**: Titel/Intro optional; Spiel startet mit erster Bombe.
2. **Bombe erscheint** oben (zufällige X-Position im spielbaren Bereich) und fällt nach unten.
3. **Aufgabe** auf der Bombe: `a × b` mit `a, b ∈ {1…20}`.
4. **Drei Antwortbuttons** werden eingeblendet (sobald die Bombe aktiv ist):
   - **Richtig**: exaktes Produkt `a * b`
   - **Faktor-Fehler**: ein Faktor um ±1 verändert (z. B. `(a±1)×b` oder `a×(b±1)`), Ergebnis daraus
   - **Nah dran**: richtiges Ergebnis ± 1, 2 oder 3 (nicht identisch mit den anderen beiden)
5. **Spieler klickt** eine Antwort:
   - **Richtig**: Laser zielt auf die Bombe, feuert, Bombe wird zerstört (Explosion/Partikel). Score +1. Nächste Bombe.
   - **Falsch**: gewählter Button rot; **richtige** Antwort blinkt grün auf; **keine weitere Eingabe** für diese Bombe. Bombe fällt weiter bis Boden → Game Over.
6. **Bombe erreicht Boden** → große Explosion → **Game Over**. Anzeige Score + Neustart-Button.
7. Bomben kommen **nacheinander** (immer nur eine aktive Bombe).

## Regeln im Detail

### Multiplikation
- Bereich: Faktoren 1–20 (also bis 20×20).
- Anzeige auf der Bombe: z. B. `7 × 8` (nicht das Ergebnis).

### Ablenkantworten (Distractors)
| Typ | Regel |
|-----|--------|
| Korrekt | `a * b` |
| Faktor ±1 | Wähle zufällig einen Faktor und ±1 (Faktor bleibt im sinnvollen Bereich 1–21 wo nötig); Ergebnis = neues Produkt. Muss ≠ korrekt sein. |
| Nah dran | `korrekt + d` mit `d ∈ {-3,-2,-1,1,2,3}`, so dass Ergebnis positiv und ≠ den anderen beiden Antworten. |

Antworten werden in **zufälliger Reihenfolge** angezeigt (nicht immer „richtig“ an fester Position).

### Physik / Timing
- Fallgeschwindigkeit: startet moderat, kann mit Score leicht steigen (optional in v1).
- Partikelspur: kontinuierlich während des Falls (kleine Kreise/Quadrate, Transparenz abnehmend).
- Laser: kurze Animation (Ausrichten + Strahl + Treffer), dann nächste Bombe spawnen.

### Game Over
- Bombe y-Position erreicht Bodenlinie → Explosion → Overlay: „Game Over“, Punkte, Button „Nochmal“.

## Technischer Stack

| Teil | Wahl |
|------|------|
| Markup | HTML5 (`index.html`) |
| Stil | CSS3 (`styles.css`) — Layout, Himmel, Boden, UI |
| Logik | Vanilla JavaScript (`game.js`) — kein Framework nötig |
| Rendering | Canvas 2D **oder** DOM + CSS; **Empfehlung: Canvas** für Bomben, Partikel, Laser, Explosionen; DOM für Antwort-Buttons und HUD |
| Assets | SVG oder Canvas-gezeichnete Silhouetten (Bomben + Kanone); optional PNG der Referenz |
| Deployment | Statische Dateien, lokal im Browser öffnen oder beliebiger Static Host |

### Dateistruktur (Ziel)

```
einmaleins/
├── index.html
├── styles.css
├── game.js
├── assets/          # optional: bomb.svg, cannon.svg, sounds
└── SPEC.md
```

## UI-Elemente

- **HUD**: aktueller Score (getroffene Bomben)
- **Antwortbereich**: drei große, klick-/touch-freundliche Buttons (unterer Bildschirmbereich über oder neben der Kanone)
- **Game-Over-Overlay**: Score, Neustart
- Optional v1: Anzeige der aktuellen Aufgabe auch im HUD (Lesbarkeit auf kleiner Bombe)

## Steuerung

- Mausklick / Touch auf Antwortbutton
- Keine Tastatur nötig für Kernspiel (optional: 1/2/3 für Antworten)

## Nicht-Ziele (v1)

- Keine Highscore-Persistenz (kann später localStorage)
- Kein Multiplayer
- Keine Sounds zwingend (nice-to-have)
- Kein Login / Backend
- Keine anderen Rechenarten (nur Multiplikation)

## Akzeptanzkriterien

1. Himmel blau, Boden grasgrün, Bomben und Kanone im Silhouetten-Stil.
2. Bomben fallen von oben mit sichtbarer Partikel-/Antriebsspur.
3. Auf jeder Bombe steht eine Aufgabe `a × b` (1–20).
4. Genau drei Antworten: korrekt, Faktor±1-Produkt, nah dran (±1…3); Reihenfolge zufällig.
5. Richtige Antwort → Laser trifft Bombe → Zerstörung → Score +1 → nächste Bombe.
6. Falsche Antwort → richtige Lösung blinkt auf, Eingabe gesperrt; Bombe fällt weiter bis Game Over.
7. Bombe am Boden → Explosion → Game Over mit Score und Neustart.
8. Immer nur eine Bombe gleichzeitig.
9. Läuft in modernen Browsern (Chrome, Firefox, Safari) ohne Build-Schritt.

## Offene Punkte / spätere Erweiterungen

- Schwierigkeit: Fallgeschwindigkeit / Faktorenbereich nach Level
- Sound: Fall, Laser, Explosion, falsche Antwort
- localStorage Highscore
- Tastatursteuerung
- Barrierefreiheit: größere Buttons, Screenreader-Labels
- Mobile-Vollbild / Landscape-Hinweis
