// Node-Tests ohne Browser: Inhalte, Matrix, Funktionsmuster, SVG-Grundstruktur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const QRC = require('../src/render.js');
require('../src/content.js');
require('../src/i18n.js');

const content = (type, f) => ({ type, fields: { [type]: f } });

test('URL ohne Schema bekommt https://', () => {
  assert.equal(QRC.buildPayload(content('url', { url: 'example.com/a' })), 'https://example.com/a');
  assert.equal(QRC.buildPayload(content('url', { url: 'http://x.de' })), 'http://x.de');
  assert.equal(QRC.buildPayload(content('url', { url: '  ' })), '');
});

test('WLAN maskiert Sonderzeichen', () => {
  assert.equal(QRC.buildPayload(content('wifi', { ssid: 'My;Net', password: 'a:b"c\\', auth: 'WPA', hidden: true })),
    'WIFI:T:WPA;S:My\\;Net;P:a\\:b\\"c\\\\;H:true;;');
  assert.equal(QRC.buildPayload(content('wifi', { ssid: 'Open', auth: 'nopass' })), 'WIFI:T:nopass;S:Open;;');
});

test('vCard 3.0 mit CRLF und Maskierung', () => {
  const v = QRC.buildPayload(content('vcard', { firstName: 'Erika', lastName: 'Muster', org: 'A, B; C', phone: '+49 1', email: 'e@x.de' }));
  assert.match(v, /^BEGIN:VCARD\r\nVERSION:3\.0\r\nN:Muster;Erika;;;\r\nFN:Erika Muster\r\n/);
  assert.match(v, /ORG:A\\, B\\; C\r\n/);
  assert.match(v, /END:VCARD$/);
});

test('E-Mail, Telefon, SMS', () => {
  assert.equal(QRC.buildPayload(content('email', { to: 'a@b.de', subject: 'Hi du', body: 'x&y' })), 'mailto:a@b.de?subject=Hi%20du&body=x%26y');
  assert.equal(QRC.buildPayload(content('tel', { number: '+49 (0)30 123' })), 'tel:+49030123');
  assert.equal(QRC.buildPayload(content('sms', { number: '+49 170', message: 'Hallo' })), 'SMSTO:+49170:Hallo');
});

test('Matrix: Version wächst mit Inhalt, UTF-8', () => {
  const a = QRC.makeMatrix('https://example.com', 'M');
  assert.equal(a.n, 17 + 4 * a.version);
  const b = QRC.makeMatrix('x'.repeat(500), 'M');
  assert.ok(b.version > a.version);
  assert.equal(QRC.utf8Length('äöü€😀'), 2 * 3 + 3 + 4);
});

test('Eckmarken in der Matrix stehen dort, wo das Rendering sie erwartet', () => {
  const m = QRC.makeMatrix('Test', 'H');
  const n = m.n, d = (r, c) => m.dark[r * n + c];
  for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let i = 0; i < 7; i++) {
      assert.equal(d(r0, c0 + i), 1); assert.equal(d(r0 + 6, c0 + i), 1);
      assert.equal(d(r0 + i, c0), 1); assert.equal(d(r0 + i, c0 + 6), 1);
    }
    assert.equal(d(r0 + 1, c0 + 1), 0); assert.equal(d(r0 + 3, c0 + 3), 1);
  }
});

test('Funktionsmuster-Karte: Ausrichtungsmuster stimmen mit der Matrix überein', () => {
  for (const len of [10, 100, 400, 1200]) {
    const m = QRC.makeMatrix('a'.repeat(len), 'L');
    const fm = QRC.functionMap(m.n, m.version);
    // Jedes Ausrichtungsmuster: Mitte dunkel, Ring 1 hell, Rand dunkel
    let centers = 0;
    for (let r = 2; r < m.n - 2; r++) for (let c = 2; c < m.n - 2; c++) {
      if (fm[r * m.n + c] !== QRC.F.ALIGN) continue;
      const allAlign = [-2, -1, 0, 1, 2].every(dr => [-2, -1, 0, 1, 2].every(dc => fm[(r + dr) * m.n + c + dc] === QRC.F.ALIGN));
      if (!allAlign) continue;
      centers++;
      assert.equal(m.dark[r * m.n + c], 1);
      assert.equal(m.dark[(r - 1) * m.n + c], 0);
      assert.equal(m.dark[(r - 2) * m.n + c], 1);
    }
    const expected = m.version === 1 ? 0 : (() => { const k = Math.floor(m.version / 7) + 2; return k * k - 3; })();
    assert.equal(centers, expected, 'Version ' + m.version);
  }
});

test('effektive Fehlerkorrektur', () => {
  const o = QRC.defaults();
  assert.equal(QRC.effectiveEcc(o), 'M');
  o.logo.enabled = true; assert.equal(QRC.effectiveEcc(o), 'H');
  o.ecc = 'Q'; assert.equal(QRC.effectiveEcc(o), 'Q');
});

test('zu langer Inhalt wird gemeldet', () => {
  const r = QRC.generate('x'.repeat(3000), QRC.defaults());
  assert.equal(r.error, 'too-long');
  assert.equal(QRC.generate('', QRC.defaults()).error, 'empty');
});

test('SVG: alle Formen und Optionen erzeugen wohlgeformte Ausgabe', () => {
  const m = QRC.makeMatrix('https://example.com', 'H');
  const shapes = QRC.moduleShapes;
  for (const shape of shapes) for (const outer of QRC.finderOuterShapes) {
    const o = QRC.merge(QRC.defaults(), {
      modules: { shape, scale: 0.8 }, finder: { outer, inner: 'diamond' },
      logo: { enabled: true, kind: 'text', text: 'A&B <x>' },
      frame: { style: 'banner' }, text: { top: 'Oben', bottom: 'Zeile 1\nZeile 2' },
      colors: { gradient: { enabled: true } }
    });
    const { svg, width, height } = QRC.renderSVG(m, o, {}, 't');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.ok(svg.endsWith('</svg>'));
    assert.ok(!/NaN|undefined/.test(svg), shape + '/' + outer);
    assert.ok(svg.includes('A&amp;B &lt;x&gt;'));
    assert.ok(height > width);
    // einfache Wohlgeformtheit: Tags ausgeglichen
    const open = (svg.match(/<(?!\/)[a-zA-Z][^>]*[^/]>/g) || []).length;
    const close = (svg.match(/<\/[a-zA-Z]+>/g) || []).length;
    assert.equal(open, close);
  }
});

test('Logo-Aussparung entfernt Datenmodule, aber keine Funktionsmuster', () => {
  const m = QRC.makeMatrix('https://example.com/pfad', 'H');
  const o = QRC.merge(QRC.defaults(), { logo: { enabled: true, kind: 'text', text: 'X', size: 0.3, clear: true } });
  const r = QRC.renderSVG(m, o, {}, 't');
  assert.ok(r.stats.clearedRatio > 0.03 && r.stats.clearedRatio < 0.25, String(r.stats.clearedRatio));
});

test('Halbton: Dithering liefert gemischte Bits', () => {
  const w = 30, luma = new Float32Array(w * w).fill(128);
  const bits = QRC.ditherLuma(luma, w, w, { dither: true });
  const dark = bits.reduce((a, b) => a + b, 0);
  assert.ok(dark > w * w * 0.3 && dark < w * w * 0.7);
  const flat = QRC.ditherLuma(luma.fill(200), w, w, { dither: false });
  assert.equal(flat.reduce((a, b) => a + b, 0), 0);
});

test('Texte: Deutsch Standard, Englisch nur bei englischer Browsersprache, gleiche Schlüssel', () => {
  assert.equal(QRC.pickLang(['fr-FR']), 'de');
  assert.equal(QRC.pickLang(['en-GB', 'de']), 'en');
  assert.equal(QRC.pickLang(['de-AT', 'en']), 'de');
  const de = Object.keys(QRC.strings.de), en = Object.keys(QRC.strings.en);
  const missing = de.filter(k => !en.includes(k) && !/^ecc\.[LMQH]$|^app\.title$/.test(k));
  assert.deepEqual(missing, []);
});
