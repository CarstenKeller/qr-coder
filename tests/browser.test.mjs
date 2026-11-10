// Browser-Tests (Playwright + Chromium): App lädt per file:// ohne Fehler, jede Vorlage
// und eine Auswahl an Kombinationen wird gerendert und mit ZXing-C++ zurückgelesen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
    // Download
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-svg')]);
    const file = await dl.path();
    const txt = fs.readFileSync(file, 'utf8');
    assert.match(txt, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<svg /);
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

test('Einzeldatei-Build funktioniert ohne weitere Dateien', async (t) => {
  const single = path.join(ROOT, 'dist', 'qr-coder.html');
  if (!fs.existsSync(single)) { t.skip('dist/qr-coder.html fehlt – vorher npm run build'); return; }
  await withApp('dist/qr-coder.html', async ({ page }) => {
    await page.evaluate(() => window.QRCApp.applyPreset('halftone'));
    await expectReadable(page, 'single halftone');
    await page.waitForFunction(() => ['ok', 'hard'].includes(window.QRCApp.scanState()), null, { timeout: 10000 });
  });
});
