// Erzeugt das App-Symbol (Favicon) als echten kleinen QR-Code mit dem eigenen Renderer.
//   node tools/make-icons.mjs  →  icons/favicon.svg, icons/icon-32.png, icons/icon-180.png
// Version 1 (21×21 Module), damit das Symbol auch bei 16 px noch als QR-Code erkennbar ist.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const QRC = require('../src/render.js');

const TEXT = 'QR-Coder';
const ACCENT = '#3b5bdb', DARK = '#1b1e23';
const m = QRC.makeMatrix(TEXT, 'L');
if (m.version !== 1) throw new Error('Version ' + m.version + ' statt 1');
const o = QRC.merge(QRC.defaults(), {
  margin: 2,
  modules: { shape: 'square', scale: 1 }, // scharf bei 16 px, kleine Datei
  finder: { outer: 'rounded', inner: 'rounded', outerColor: ACCENT, innerColor: ACCENT },
  colors: { fg: DARK, transparent: true },
  export: { size: 64 }
});
const { svg } = QRC.renderSVG(m, o, {}, 'ic');
const S = m.n + 2 * o.margin;
// weiße Kachel mit runden Ecken als Hintergrund (auch im dunklen Tab gut sichtbar)
const icon = svg.replace(/^(<svg[^>]*>)/, '$1<rect width="' + S + '" height="' + S + '" rx="' + (S * 0.18) + '" fill="#ffffff"/>')
  .replace(/ width="64" height="64"/, '');
fs.mkdirSync(path.join(root, 'icons'), { recursive: true });
fs.writeFileSync(path.join(root, 'icons', 'favicon.svg'), icon + '\n');

const browser = await chromium.launch();
const page = await browser.newPage();
for (const px of [32, 180]) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent('<style>html,body{margin:0;background:transparent}svg{display:block;width:' + px + 'px;height:' + px + 'px}</style>' + icon);
  await page.screenshot({ path: path.join(root, 'icons', 'icon-' + px + '.png'), omitBackground: true });
}
await browser.close();
console.log('icons/: favicon.svg, icon-32.png, icon-180.png');
