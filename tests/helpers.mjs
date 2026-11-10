// Gemeinsame Helfer für Browser-Tests: Seite laden, Zustand setzen, Vorschau mit ZXing-C++ lesen.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { readBarcodes, prepareZXingModule } from 'zxing-wasm/reader';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let prepared = false;
export async function decodePng(png) {
  if (!prepared) {
    const wasm = fs.readFileSync(path.join(ROOT, 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'));
    await prepareZXingModule({
      overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) },
      fireImmediately: true
    });
    prepared = true;
  }
  const res = await readBarcodes(new Uint8Array(png), { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 });
  return res.length ? res[0].text : null;
}

export async function openApp(file = 'index.html', viewport = { width: 1280, height: 900 }) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport, locale: 'de-DE' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(pathToFileURL(path.join(ROOT, file)).href);
  await page.waitForFunction(() => window.QRCApp && window.QRCApp.current());
  return { browser, page, errors };
}

/** Aktuelle Vorschau als PNG (Bildschirmfoto des SVG) mit ZXing lesen. */
export async function readPreview(page) {
  await page.evaluate(() => window.QRCApp.ready());
  const el = await page.$('#preview svg');
  if (!el) return { text: null, payload: null };
  const png = await el.screenshot();
  const cur = await page.evaluate(() => window.QRCApp.current());
  return { text: await decodePng(png), payload: cur.payload, png };
}
