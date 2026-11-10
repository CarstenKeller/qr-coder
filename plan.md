# QR-Coder – Feature- und Umsetzungsplan

Webapp, die QR-Codes erzeugt und als SVG speichert – vom einfachen
Schwarz-Weiß-Code bis zum bildgestalteten Code, mit und ohne Bereiche für
Text und Logo.

Auftrag (`/i`, 2026-11-10): "Heute bauen wir eine Webapp, mit der wir
QR-codes aus html Seiten erstellen und als svg speichern können. Ich möchte
hier die ganze Vielfalt von Möglichkeiten von einem einfachen qr code bis zu
einem bildgestalteten code, mit und ohne Bereiche für Text und Logos."

## Annahmen (nicht mit dem Nutzer geklärt – bitte korrigieren, falls falsch)

- **A1 "aus html Seiten":** verstanden als *die App ist eine HTML-Seite*, und
  der Inhalt ist typischerweise eine Webadresse. Zusätzlich gibt es Text,
  WLAN, Kontakt, E-Mail, Telefon, SMS. (Falls gemeint war, eine HTML-Datei
  selbst in den Code zu packen: geht nur für sehr kleine Seiten, max. ~2,9 kB.)
- **A2 Plattform:** reine statische Webapp ohne Server und ohne Build-Schritt.
  `index.html` läuft direkt aus dem Repo/Dateisystem; zusätzlich baut CI eine
  **einzelne HTML-Datei** (`qr-coder.html`, alles eingebettet) als Release.
  Alles läuft lokal im Browser, es werden keine Daten verschickt.
- **A3 Hosting:** vorläufig GitHub Pages (Vorgabe des Nutzers, 2026-11-10;
  muss in den Repo-Einstellungen einmalig aktiviert werden), zusätzlich
  Release-Datei je CI-Lauf. Keine claude.ai-Artifacts.
- **A4 Design:** Register aus `context-plus-skills` gilt sinngemäß fürs Web
  (es ist Android-formuliert): D-01 Icon + Tooltip, D-04 Entprellen,
  D-06 DE/EN (Deutsch Standard, Sprache aus der Browsereinstellung, kein
  Umschalter), D-07 Hell/Dunkel/System (Standard System, gespeichert).
  D-02/D-03/D-05 sind Android-spezifisch; Farbwelt (F-02) offen → neutrale
  eigene Palette.
- **A5 Lesbarkeitsprüfung:** in der App mit jsQR (und, falls der Browser es
  kann, `BarcodeDetector`). Das ist ein Hinweis, keine Garantie –
  Handy-Scanner verhalten sich anders. In CI zusätzlich mit ZXing-C++
  (`zxing-wasm`).

## Technische Grundentscheidungen

- Vanilla JS als klassische `<script>`-Dateien (keine ES-Module), damit die
  Seite auch per `file://` funktioniert.
- QR-Matrix: `qrcode-generator` 2.0.4 (MIT, gepflegt, letzte Version 2025).
  UTF-8-Kodierung, ohne ECI-Kennung (übliche Praxis; Scanner erkennen UTF-8
  in aller Regel – nicht für jeden Scanner geprüft).
- Eigenes SVG-Rendering (`src/render.js`, reine Funktion, auch in Node
  testbar): Modulformen, Eckmarken, Farben/Verlauf, Logo-Aussparung,
  Bildmodi, Rahmen und Text.
- Tests: Node (`node --test`) für Kodierung/Rendering, Playwright + Chromium
  für Rendern aller Vorlagen und Rück-Lesen mit ZXing-C++ und jsQR.

## Offene technische Unsicherheiten

- Bildgestaltete Codes (Halbton, Bild hinter Punkten) sind je nach Bild
  unterschiedlich gut lesbar → In-App-Prüfung + Handy-Test.
- Text im SVG nutzt Systemschriften; auf anderen Rechnern kann die Schrift
  anders aussehen (keine Umwandlung in Pfade).

## Phase 1 – MVP (diese Sitzung)

- [x] Inhalte: URL, Text, WLAN, Kontakt (vCard 3.0), E-Mail, Telefon, SMS
- [x] Fehlerkorrektur L/M/Q/H + Automatik (H bei Logo/Bild), Ruhezone
- [x] Modulformen: Quadrat, weich, fließend, Punkte, Raute, vertikale/horizontale Linien; Modulgröße
- [x] Eckmarken: Ring- und Kernform getrennt, eigene Farben
- [x] Farben, Hintergrund transparent, linearer/radialer Verlauf
- [x] Logo: Bild oder Text, Größe, Form, Aussparung, Hintergrund
- [x] Bildmodi: "Bild hinter Punkten", "Halbton" (3×3-Teilmodule nach Chu et al.)
- [x] Textbereiche oben/unten, Rahmen, Banner
- [x] Vorlagen-Galerie (einfach → bildgestaltet)
- [x] Export SVG (Download, Kopieren), PNG
- [x] Lesbarkeitsprüfung mit Anzeige
- [x] DE/EN, Hell/Dunkel/System, Einstellungen bleiben erhalten
- [x] CI: Tests + Einzeldatei-Build + Release mit Commit-Hash

## Phase 2 – Ideen

- [ ] Einstellungen als JSON exportieren/importieren, eigene Vorlagen
- [ ] Text in Pfade umwandeln (schriftunabhängiges SVG)
- [ ] Logo frei positionierbar, mehrere Textfelder
- [ ] Farbiger Halbton, Bildausschnitt wählen
- [ ] Stapel-Erzeugung (CSV → viele SVGs)
- [x] GitHub Pages: Deploy-Job eingerichtet (2026-11-10), Aktivierung durch Nutzer ausstehend

## Fortschritt

- 2026-11-10: MVP vollständig umgesetzt. Lokal geprüft (Chromium/Playwright):
  17 Tests grün; alle 10 Vorlagen (kurze und lange URL), alle Modulformen,
  Eckmarken, beide Bildmodi, Logo-Upload und alle Inhaltsarten werden von
  ZXing-C++ zurückgelesen. Belastungstest mit 200 Kombinationen: nur
  erwartbare Fehlschläge (Logo 35 % bei kleinem Code; Logo bei Fehlerkorrektur L/M)
  – die App warnt in diesen Fällen.
- Korrektur aus dem Test: Eckmarken "Blatt"/"Tropfen" mit Radius 50 % waren
  zusammen mit Punkt-Modulen oft unlesbar → Radius 35 %.
- **Nicht geprüft:** echte Handy-Scanner, Firefox/Safari, Download im
  Darstellung des SVG in Grafikprogrammen (Inkscape, Illustrator).
