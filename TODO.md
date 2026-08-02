# TODO — Einmaleins-Bombenabwehr

Abgeleitet aus `SPEC.md`. Reihenfolge grob von Grundlage → spielbar → poliert.

## Phase 0 — Projektgrundlage

- [x] `index.html` mit Canvas, HUD, Antwort-Container, Game-Over-Overlay
- [x] `styles.css`: Layout full viewport, blauer Himmel, grasgrüner Boden, Button-/HUD-Styles
- [x] `game.js` Skeleton: Game-Loop (`requestAnimationFrame`), Resize, Start/Reset
- [x] Ordner `assets/` anlegen (optional für SVG/PNG)

## Phase 1 — Szene & Objekte zeichnen

- [x] Himmel + Boden auf Canvas (oder CSS-Hintergrund + Canvas darüber)
- [x] Bombe zeichnen (Silhouette wie Referenz: Körper, Flossen, Spitze)
- [x] Matheaufgabe als Text auf/über der Bombe (gut lesbar)
- [x] Laserkanone unten in ähnlichem Silhouetten-Stil
- [x] Partikelsystem: Antriebsspur hinter fallender Bombe
- [x] Explosionseffekt (Partikel-Burst)
- [x] Laser-Strahl-Animation (Kanone → Bombe)

## Phase 2 — Spiel-Logik Kern

- [x] Zufällige Aufgabe `a × b` mit a,b ∈ 1…20
- [x] Drei Distractoren erzeugen:
  - [x] Korrektes Produkt
  - [x] Faktor ±1 → neues Produkt (≠ korrekt)
  - [x] Nah dran ±1…3 (≠ den anderen)
- [x] Antworten mischen und in Buttons anzeigen
- [x] Bombe spawnen (oben, zufällige X), fallen lassen
- [x] Immer nur eine aktive Bombe
- [x] Richtige Antwort: Laser feuern, Bombe zerstören, Score +1, nächste Bombe
- [x] Falsche Antwort: visuelles Feedback, Bombe fällt weiter, Buttons bleiben nutzbar
- [x] Boden-Kollision: Explosion + Game Over
- [x] Game-Over-UI: Score + „Nochmal“-Button → Reset

## Phase 3 — Feinschliff

- [ ] Fallgeschwindigkeit kalibrieren (nicht zu schnell/langsam für Kinder)
- [ ] Buttons groß und touch-freundlich
- [ ] Score-HUD klar sichtbar
- [ ] Keine überlappenden UI-Elemente (Buttons vs. Kanone)
- [ ] Edge Cases: Faktor 1 bei −1, gleiche Distractoren vermeiden, Retry bis drei unique Antworten
- [ ] Kurzer Test in Chrome + Safari (oder Firefox)

## Phase 4 — Optional (nach v1 spielbar)

- [ ] Leichte Geschwindigkeitssteigerung mit Score
- [ ] Sounds (Fall, Laser, Boom, Fail)
- [ ] Highscore in `localStorage`
- [ ] Tasten 1/2/3 für Antworten
- [ ] Titel-Screen / kurze Anleitung vor dem ersten Start

## Definition of Done (v1)

- [x] Alle Akzeptanzkriterien aus `SPEC.md` erfüllt (Kern)
- [x] Spiel startet mit Doppelklick/`open` auf `index.html` ohne Build
- [x] Eine Runde spielbar: mehrere Bomben abschießen, dann Game Over am Boden, Neustart funktioniert
