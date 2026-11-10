# qr-coder – App-spezifische Designentscheidungen

Gilt **nur für diese App** und wird **nicht** ins allgemeine Register
übernommen. Ergänzt per Kommando `/da`. Allgemeine Entscheidungen stehen
in `design-decisions.md` (Kopie, Stand siehe `../SYNC.md`); bei
Widerspruch gilt in dieser App der Eintrag hier.

## Leitidee

Webapp (keine Android-App). "die ganze Vielfalt von Möglichkeiten von einem
einfachen qr code bis zu einem bildgestalteten code, mit und ohne Bereiche für
Text und Logos" (Nutzer, /i, 2026-11-10). Werkzeug-Charakter: links große
Vorschau, rechts Vorlagen und aufklappbare Einstellungsabschnitte.

## Einträge

<!-- Format:
### A-xx: <Kurztitel>
- **Entscheidung:**
- **Begründung:**
- **Abweichung von:** <D-xx | – >
- **Quelle:** <wörtliche Vorgabe (/da) | abgeleitet aus …>, <Datum>
- **Status:** <bestätigt (Datum) | abgeleitet | ersetzt durch A-yy>
-->

### A-01: Allgemeine Entscheidungen sinngemäß im Web
- **Entscheidung:** D-01 Aktionen als Icon-Button mit Tooltip (CSS-Tooltip +
  `aria-label`; Speichern-Buttons zusätzlich mit Kürzel "SVG"/"PNG", weil zwei
  Download-Icons sonst verwechselbar wären). D-04 Vorschau sofort, Prüfung/
  Speichern/Vorlagenbilder entprellt. D-06 Deutsch Standard, Englisch nur bei
  englischer Browsersprache, kein Umschalter. D-07 Menü Hell/Dunkel/System,
  Standard System, in `localStorage` gespeichert.
  D-02, D-03, D-05 sind Android-spezifisch und hier ohne Entsprechung.
- **Begründung:** Register ist für Android formuliert; Übertragung ins Web.
- **Abweichung von:** – (Übertragung, keine Abweichung)
- **Quelle:** abgeleitet (Claude), 2026-11-10
- **Status:** abgeleitet

### A-02: Neutrale eigene Palette mit Indigo-Akzent
- **Entscheidung:** Grau-neutrale Flächen, Akzent `#3b5bdb` (hell) /
  `#91a7ff` (dunkel). Die QR-Farben selbst wählt der Nutzer frei.
- **Begründung:** F-02 (Farbwelt) ist offen; im Web gibt es keine
  dynamischen Systemfarben (D-03).
- **Abweichung von:** D-03 (nicht anwendbar)
- **Quelle:** abgeleitet (Claude), 2026-11-10
- **Status:** abgeleitet

### A-03: App-Symbol (Favicon) ist ein echter kleiner QR-Code
- **Entscheidung:** Favicon/App-Symbol = lesbarer QR-Code, Version 1
  (21×21 Module), Inhalt "QR-Coder", quadratische Module in Fast-Schwarz,
  abgerundete Eckmarken in der Akzentfarbe `#3b5bdb`, weiße Kachel mit runden
  Ecken. Erzeugt mit dem eigenen Renderer (`npm run icons`), als SVG sowie
  PNG 32 und 180 px.
- **Begründung:** "Ein kleiner qr Code würde sich hier anbieten" (Nutzer,
  2026-11-10). Version 1 und eckige Module, damit es bei 16 px erkennbar bleibt
  (Ableitung von Claude).
- **Abweichung von:** – (berührt die offene allgemeine Frage F-08 Launcher-Icon)
- **Quelle:** Vorgabe des Nutzers (ohne /da) für die Grundidee, Umsetzung
  abgeleitet, 2026-11-10
- **Status:** bestätigt (Grundidee, 2026-11-10), Umsetzung abgeleitet

## Offene Designfragen dieser App

- [ ] Akzentfarbe/Farbwelt der App (F-02) bestätigen
- [ ] Sollen Formen als Bild-Auswahl statt Auswahlliste erscheinen?
