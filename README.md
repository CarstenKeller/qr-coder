# QR-Coder

Webapp zum Gestalten von QR-Codes und Speichern als **SVG** (auch PNG) –
vom schlichten Schwarz-Weiß-Code bis zum bildgestalteten Code, mit oder ohne
Logo und Textbereiche. Alles läuft lokal im Browser, es werden keine Daten
verschickt.

## Benutzen

- **Direkt:** `index.html` im Browser öffnen (funktioniert auch per `file://`).
- **Als eine Datei:** jeder CI-Lauf legt ein Release `build-<hash>` mit
  `qr-coder-<hash>.html` an – herunterladen, öffnen, fertig.
- Lokal mit Server: `npm run serve` → http://localhost:8000

## Funktionen

- Inhalte: Webseite, Text, WLAN, Kontakt (vCard 3.0), E-Mail, Telefon, SMS
- Fehlerkorrektur L/M/Q/H oder automatisch (H bei Logo/Bild), Ruhezone
- 7 Modulformen, Eckmarken (Ring und Kern getrennt, 5 bzw. 6 Formen, eigene Farben)
- Farben, transparenter Hintergrund, linearer/kreisförmiger Verlauf
- Logo als Bild (PNG/JPG/SVG) oder Text, mit Aussparung
- Bildmodi: „Bild hinter Punkten“ und „Halbton“ (3×3-Teilmodule nach Chu et al., 2013)
- Textbereiche oben/unten, Rahmen als Linie oder Banner
- 10 Vorlagen, Lesbarkeitsprüfung im Browser (ZXing-C++ und jsQR), Warnungen
- Deutsch/Englisch (nach Browsersprache), Hell/Dunkel/System

Die Lesbarkeitsprüfung ist ein Hinweis, kein Beweis: vor dem Druck immer mit
mehreren Handys testen.

## Entwicklung

```bash
npm ci
npm run build   # dist/qr-coder.html
npm test        # Node-Tests + Browser-Tests (Playwright/Chromium, Rücklesen mit ZXing)
```

Aufbau: `src/render.js` (Matrix → SVG, reine Funktionen), `src/content.js`
(Inhalte), `src/i18n.js` (Texte), `src/app.js` (Oberfläche), `vendor/`
(Fremdbibliotheken, siehe `vendor/README.md`). Plan und Annahmen: `plan.md`.
Design: `.claude/skills/design-qr-coder/`.

## Lizenzen

Eigener Code: Lizenz noch nicht festgelegt. Fremdbibliotheken: siehe `vendor/README.md`.
„QR Code“ ist eine eingetragene Marke der DENSO WAVE INCORPORATED.
