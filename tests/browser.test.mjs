// Browser-Tests (Playwright + Chromium): App lädt per file:// ohne Fehler, jede Vorlage
// und eine Auswahl an Kombinationen wird gerendert und mit ZXing-C++ zurückgelesen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openApp, readPreview, ROOT } from './helpers.mjs';

const LONG = 'https://www.example.org/ein/recht/langer/pfad/zur/seite?mit=parametern&und=noch&mehr=1234567890';

async function withApp(file, fn) {
  const app = await openApp(file);
  try { await fn(app); } finally { await app.browser.close(); }
  assert.deepEqual(app.errors, [], 'Fehler in der Seite');
}

async function expectReadable(page, label) {
  const r = await readPreview(page);
  assert.equal(r.text, r.payload, label + ': nicht lesbar');
}

test('alle Vorlagen sind mit ZXing lesbar (kurz und lang)', async () => {
  await withApp('index.html', async ({ page }) => {
    const ids = await page.evaluate(() => window.QRCApp.presets);
    assert.ok(ids.length >= 10);
    for (const url of ['https://example.com', LONG]) {
      await page.evaluate(u => window.QRCApp.setState({ content: { type: 'url', fields: { url: { url: u } } } }), url);
      for (const id of ids) {
        await page.evaluate(i => window.QRCApp.applyPreset(i), id);
        await expectReadable(page, id + ' ' + url.length);
      }
    }
  });
});

test('Formen, Eckmarken, Bildmodi, Inhaltsarten', async () => {
  await withApp('index.html', async ({ page }) => {
    const load = (content, patch) => page.evaluate(([c, p]) => { window.QRCApp.setState({ content: c }); window.QRCApp.load(p); }, [content, patch]);
    const url = { type: 'url', fields: { url: { url: LONG } } };
    for (const shape of ['square', 'soft', 'fluid', 'dots', 'diamond', 'vertical', 'horizontal']) {
      await load(url, { modules: { shape, scale: 0.8 } });
      await expectReadable(page, shape);
    }
    for (const outer of ['square', 'rounded', 'circle', 'leaf', 'drop']) {
      await load(url, { finder: { outer, inner: outer === 'square' ? 'diamond' : outer }, modules: { shape: 'dots', scale: 0.8 } });
      await expectReadable(page, 'finder ' + outer);
    }
    for (const mode of ['dots', 'halftone']) {
      await load(url, { image: { enabled: true, mode } });
      await expectReadable(page, 'image ' + mode);
    }
    await load(url, { logo: { enabled: true, kind: 'image', size: 0.25, shape: 'circle' }, modules: { shape: 'fluid' } });
    await expectReadable(page, 'logo');
    const contents = [
      { type: 'text', fields: { text: { text: 'Grüße aus Köln – 😀' } } },
      { type: 'wifi', fields: { wifi: { ssid: 'Heimnetz', password: 'geheim;123', auth: 'WPA' } } },
      { type: 'vcard', fields: { vcard: { firstName: 'Erika', lastName: 'Mustermann', phone: '+49 30 1234', email: 'erika@example.com' } } },
      { type: 'email', fields: { email: { to: 'info@example.com', subject: 'Hallo' } } },
      { type: 'tel', fields: { tel: { number: '+49 30 1234567' } } },
      { type: 'sms', fields: { sms: { number: '+49 170 1234567', message: 'Hallo!' } } }
    ];
    for (const c of contents) {
      await load(c, { modules: { shape: 'soft', scale: 0.9 } });
      await expectReadable(page, c.type);
    }
  });
});

test('Oberfläche: Bedienelemente ändern die Vorschau, Datei-Upload, Download', async () => {
  await withApp('index.html', async ({ page }) => {
    const svg0 = await page.evaluate(() => window.QRCApp.current().svg);
    await page.click('summary:has-text("Form")');
    await page.selectOption('#sec-shape select >> nth=0', 'dots');
    const svg1 = await page.evaluate(() => window.QRCApp.current().svg);
    assert.notEqual(svg0, svg1);
    // Logo per Datei
    await page.click('summary:has-text("Logo")');
    await page.check('#sec-logo input[type=checkbox] >> nth=0');
    await page.selectOption('#sec-logo select >> nth=0', 'image');
    const logo = path.join(ROOT, 'tests', 'fixtures', 'logo.svg');
    await page.setInputFiles('#sec-logo input[type=file]', logo);
    await page.waitForFunction(() => window.QRCApp.getState().logo.image.startsWith('data:image/svg'));
    await expectReadable(page, 'upload logo');
    // Download (Rückfall ohne "Speichern unter"-Dialog)
    await page.evaluate(() => { window.showSaveFilePicker = undefined; });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-svg')]);
    const file = await dl.path();
    const txt = fs.readFileSync(file, 'utf8');
    assert.match(txt, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<svg /);
    assert.match(txt, /<metadata id="qr-coder-settings"><!--\{"app":"qr-coder"/);
    assert.match(dl.suggestedFilename(), /^qr-.*\.svg$/);
    // Lesbarkeitsanzeige
    await page.waitForFunction(() => ['ok', 'hard'].includes(window.QRCApp.scanState()), null, { timeout: 10000 });
  });
});

test('Mini-Vorschau: erscheint beim Scrollen am Handy, lässt sich aus- und wieder einschalten', async () => {
  const app = await openApp('index.html', { width: 390, height: 844 });
  const { page, browser, errors } = app;
  try {
    const visible = () => page.evaluate(() => window.QRCApp.miniVisible());
    assert.equal(await visible(), false, 'oben: keine Mini-Vorschau');
    await page.click('summary:has-text("Farben")');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForFunction(() => window.QRCApp.miniVisible());
    // Änderung unten wirkt sofort in der Mini-Vorschau
    await page.evaluate(() => window.QRCApp.setState({ colors: { fg: '#c92a2a' } }));
    assert.match(await page.innerHTML('#mini-svg'), /#c92a2a/);
    assert.ok(!(await page.innerHTML('#mini-svg')).includes('id="pv-'), 'eigene IDs');
    // wegklicken
    await page.click('#mini-close');
    assert.equal(await visible(), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('qrc.miniPreview')), 'off');
    // über "Darstellung" wieder einschalten
    await page.click('#btn-theme');
    await page.check('#opt-mini');
    await page.waitForFunction(() => window.QRCApp.miniVisible());
    // Tipp auf die Mini-Vorschau springt zur großen Vorschau, Mini verschwindet
    await page.keyboard.press('Escape');
    await page.click('#mini-open');
    await page.waitForFunction(() => !window.QRCApp.miniVisible());
  } finally { await browser.close(); }
  assert.deepEqual(errors, []);
});

test('Mini-Vorschau: am Desktop nicht nötig (große Vorschau bleibt stehen)', async () => {
  await withApp('index.html', async ({ page }) => {
    for (const s of await page.$$('details.sec')) await s.evaluate(d => { d.open = true; });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.QRCApp.miniVisible()), false);
  });
});

test('SVG speichern: "Speichern unter"-Dialog, wenn der Browser ihn hat', async () => {
  const init = () => {
    window.__written = null;
    window.showSaveFilePicker = async (opts) => ({
      name: 'gewaehlt.svg',
      createWritable: async () => ({ write: async b => { window.__written = { opts, text: await b.text() }; }, close: async () => {} })
    });
  };
  const app = await openApp('index.html', undefined, init);
  try {
    await app.page.click('#btn-svg');
    await app.page.waitForFunction(() => window.__written);
    const w = await app.page.evaluate(() => window.__written);
    assert.match(w.opts.suggestedName, /^qr-.*\.svg$/);
    assert.match(w.text, /^<\?xml/);
  } finally { await app.browser.close(); }
  assert.deepEqual(app.errors, []);
});

test('Teilen: PNG und SVG als Datei, wenn der Browser Dateien teilen kann', async () => {
  const init = () => {
    window.__shared = [];
    navigator.canShare = () => true;
    navigator.share = async d => { window.__shared.push(d.files.map(f => ({ name: f.name, type: f.type, size: f.size }))); };
  };
  const app = await openApp('index.html', { width: 390, height: 844 }, init);
  try {
    const { page } = app;
    assert.equal(await page.isVisible('#btn-share'), true);
    await page.click('#btn-share');
    await page.click('#share-menu [data-type="image/png"]');
    await page.waitForFunction(() => window.__shared.length === 1);
    await page.click('#btn-share');
    await page.click('#share-menu [data-type="image/svg+xml"]');
    await page.waitForFunction(() => window.__shared.length === 2);
    const sh = await page.evaluate(() => window.__shared);
    assert.equal(sh[0][0].type, 'image/png'); assert.match(sh[0][0].name, /\.png$/); assert.ok(sh[0][0].size > 1000);
    assert.equal(sh[1][0].type, 'image/svg+xml'); assert.match(sh[1][0].name, /\.svg$/);
  } finally { await app.browser.close(); }
  assert.deepEqual(app.errors, []);
});

test('Teilen-Knopf fehlt, wenn der Browser keine Dateien teilen kann', async () => {
  const app = await openApp('index.html', undefined, () => { navigator.canShare = undefined; });
  try { assert.equal(await app.page.isVisible('#btn-share'), false); } finally { await app.browser.close(); }
});

test('Betrachter: gespeichertes SVG öffnen, Inhalt lesen, im Editor weiterbearbeiten', async () => {
  await withApp('index.html', async ({ page }) => {
    // Code mit Logo-Bild und eigenem Inhalt erzeugen und als Datei "speichern"
    const logo = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'logo.svg')).toString('base64');
    await page.evaluate(l => {
      window.QRCApp.setState({ content: { type: 'text', fields: { text: { text: 'Hallo Betrachter' } } } });
      window.QRCApp.applyPreset('logo');
      window.QRCApp.setState({ logo: { image: l } });
    }, logo);
    await page.evaluate(() => window.QRCApp.ready());
    const svg = await page.evaluate(() => window.QRCApp.svgFile());
    const file = path.join(os.tmpdir(), 'qrc-viewer-test.svg');
    fs.writeFileSync(file, svg);
    // anderen Zustand herstellen
    await page.evaluate(() => window.QRCApp.setState({ content: { type: 'url', fields: { url: { url: 'https://example.com' } } } }));
    await page.evaluate(() => window.QRCApp.applyPreset('classic'));
    // öffnen
    await page.setInputFiles('#open-file', file);
    await page.waitForFunction(() => { const v = window.QRCApp.viewer(); return v && v.open && v.text !== null; }, null, { timeout: 15000 });
    const v = await page.evaluate(() => window.QRCApp.viewer());
    assert.equal(v.text, 'Hallo Betrachter');
    assert.equal(v.hasState, true);
    assert.equal(await page.isVisible('#viewer-edit'), true);
    await page.click('#viewer-edit');
    const st = await page.evaluate(() => window.QRCApp.getState());
    assert.equal(st.content.type, 'text');
    assert.equal(st.logo.enabled, true);
    assert.equal(st.logo.image, logo, 'Logo-Bild aus dem SVG wiederhergestellt');
    assert.equal(await page.evaluate(() => document.getElementById('viewer').open), false);
    await expectReadable(page, 'nach Übernahme');
  });
});

test('Betrachter: fremdes Bild ohne Einstellungen – Inhalt wird gelesen, kein Bearbeiten', async () => {
  await withApp('index.html', async ({ page }) => {
    const r = await readPreview(page); // PNG-Screenshot der aktuellen Vorschau als "fremde" Datei
    const file = path.join(os.tmpdir(), 'qrc-viewer-test.png');
    fs.writeFileSync(file, r.png);
    await page.setInputFiles('#open-file', file);
    await page.waitForFunction(() => { const v = window.QRCApp.viewer(); return v && v.open && v.text !== null; }, null, { timeout: 15000 });
    const v = await page.evaluate(() => window.QRCApp.viewer());
    assert.equal(v.text, r.payload);
    assert.equal(v.hasState, false);
    assert.equal(await page.isVisible('#viewer-edit'), false);
  });
});

test('Einzeldatei-Build funktioniert ohne weitere Dateien', async (t) => {
  const single = path.join(ROOT, 'dist', 'qr-coder.html');
  if (!fs.existsSync(single)) { t.skip('dist/qr-coder.html fehlt – vorher npm run build'); return; }
  await withApp('dist/qr-coder.html', async ({ page }) => {
    await page.evaluate(() => window.QRCApp.applyPreset('halftone'));
    await expectReadable(page, 'single halftone');
    await page.waitForFunction(() => ['ok', 'hard'].includes(window.QRCApp.scanState()), null, { timeout: 10000 });
  });
});
