/* QR-Coder – QR-Matrix erzeugen und als SVG rendern.
 * Reine Funktionen ohne DOM: läuft im Browser und in Node (Tests).
 * Einheit aller Koordinaten: 1 = ein QR-Modul. */
(function (root) {
  'use strict';
  const QRC = root.QRC || (root.QRC = {});

  function getQrcodeLib() {
    if (root.qrcode) return root.qrcode;
    if (typeof require === 'function') return require('../vendor/qrcode.js');
    throw new Error('qrcode-generator fehlt');
  }

  // ---------------------------------------------------------------- Matrix

  /** Liefert {n, version, ecc, dark:Uint8Array(n*n)} oder wirft bei Überlauf. */
  QRC.makeMatrix = function (text, ecc) {
    const qrcode = getQrcodeLib();
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const qr = qrcode(0, ecc || 'M');
    qr.addData(text, 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    const dark = new Uint8Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dark[r * n + c] = qr.isDark(r, c) ? 1 : 0;
    return { n, version: (n - 17) / 4, ecc: ecc || 'M', dark };
  };

  /** Größte Version 40: Bytes-Kapazität je Stufe (ISO/IEC 18004, Byte-Modus). */
  QRC.maxBytes = { L: 2953, M: 2331, Q: 1663, H: 1273 };

  QRC.utf8Length = function (s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; } else n += 3;
    }
    return n;
  };

  // Ausrichtungsmuster-Positionen je Version (ISO/IEC 18004, Anhang E;
  // identisch mit PATTERN_POSITION_TABLE in qrcode-generator).
  const ALIGN = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46],
    [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74],
    [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98],
    [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118],
    [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134],
    [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146], [6, 30, 54, 78, 102, 126, 150],
    [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162],
    [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170]];

  // Funktionsmuster-Karte: 0 Daten, 1 Eckmarke+Trennlinie, 2 Format, 3 Taktlinie,
  // 4 Ausrichtungsmuster, 5 Versionsinfo.
  const F_FINDER = 1, F_FORMAT = 2, F_TIMING = 3, F_ALIGN = 4, F_VERSION = 5;
  QRC.functionMap = function (n, version) {
    const m = new Uint8Array(n * n);
    const set = (r, c, v) => { if (r >= 0 && c >= 0 && r < n && c < n && !m[r * n + c]) m[r * n + c] = v; };
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      set(r, c, F_FINDER); set(r, n - 1 - c, F_FINDER); set(n - 1 - r, c, F_FINDER);
    }
    for (let i = 0; i < 9; i++) { set(8, i, F_FORMAT); set(i, 8, F_FORMAT); }
    for (let i = 0; i < 8; i++) { set(8, n - 1 - i, F_FORMAT); set(n - 1 - i, 8, F_FORMAT); }
    for (let i = 0; i < n; i++) { set(6, i, F_TIMING); set(i, 6, F_TIMING); }
    const pos = ALIGN[version] || [];
    const last = pos[pos.length - 1];
    for (const r of pos) for (const c of pos) {
      if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const i = (r + dr) * n + (c + dc);
        m[i] = F_ALIGN; // überschreibt Taktlinie innerhalb des Musters
      }
    }
    if (version >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      set(i, n - 11 + j, F_VERSION); set(n - 11 + j, i, F_VERSION);
    }
    return m;
  };
  QRC.F = { FINDER: F_FINDER, FORMAT: F_FORMAT, TIMING: F_TIMING, ALIGN: F_ALIGN, VERSION: F_VERSION };

  // ------------------------------------------------------------- Optionen

  QRC.defaults = function () {
    return {
      ecc: 'auto',            // 'auto' | 'L' | 'M' | 'Q' | 'H'
      margin: 4,              // Ruhezone in Modulen (Norm: 4)
      modules: { shape: 'square', scale: 1 },
      finder: { outer: 'square', inner: 'square', outerColor: '', innerColor: '' },
      colors: { fg: '#111111', bg: '#ffffff', transparent: false,
        gradient: { enabled: false, type: 'linear', color2: '#3b5bdb', angle: 45 } },
      logo: { enabled: false, kind: 'text', image: '', text: 'QR', textColor: '#111111', font: 'sans',
        size: 0.22, shape: 'square', padding: 1, clear: true, bgEnabled: false, bg: '#ffffff' },
      image: { enabled: false, mode: 'dots', src: '', dotSize: 0.45, veil: 0.15,
        contrast: 1, brightness: 0, dither: true },
      frame: { style: 'none', color: '#111111', width: 1, radius: 2, padding: 0 },
      text: { top: '', bottom: '', color: '#111111', size: 3, font: 'sans', bold: true },
      export: { size: 1024 }
    };
  };

  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  QRC.merge = function merge(base, patch) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!isObj(patch)) return out;
    for (const k of Object.keys(patch)) {
      out[k] = isObj(patch[k]) && isObj(base[k]) ? merge(base[k], patch[k]) : patch[k];
    }
    return out;
  };

  /** Effektive Fehlerkorrektur: 'auto' → H bei Logo oder Bild, sonst M. */
  QRC.effectiveEcc = function (o) {
    if (o.ecc && o.ecc !== 'auto') return o.ecc;
    return (o.logo.enabled || o.image.enabled) ? 'H' : 'M';
  };

  // ------------------------------------------------------------- Helfer

  const f = x => String(Math.round(x * 1000) / 1000);
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /** Rechteck mit Eckradien [oben-links, oben-rechts, unten-rechts, unten-links]. */
  function rr(x, y, w, h, rad) {
    const [a, b, c, d] = rad;
    let p = 'M' + f(x + a) + ' ' + f(y) + 'H' + f(x + w - b);
    if (b) p += 'A' + f(b) + ' ' + f(b) + ' 0 0 1 ' + f(x + w) + ' ' + f(y + b);
    p += 'V' + f(y + h - c);
    if (c) p += 'A' + f(c) + ' ' + f(c) + ' 0 0 1 ' + f(x + w - c) + ' ' + f(y + h);
    p += 'H' + f(x + d);
    if (d) p += 'A' + f(d) + ' ' + f(d) + ' 0 0 1 ' + f(x) + ' ' + f(y + h - d);
    p += 'V' + f(y + a);
    if (a) p += 'A' + f(a) + ' ' + f(a) + ' 0 0 1 ' + f(x + a) + ' ' + f(y);
    return p + 'Z';
  }
  function circle(cx, cy, r) {
    return 'M' + f(cx - r) + ' ' + f(cy) + 'a' + f(r) + ' ' + f(r) + ' 0 1 0 ' + f(2 * r) + ' 0a' +
      f(r) + ' ' + f(r) + ' 0 1 0 ' + f(-2 * r) + ' 0Z';
  }
  function diamond(cx, cy, h) {
    return 'M' + f(cx) + ' ' + f(cy - h) + 'L' + f(cx + h) + ' ' + f(cy) + 'L' + f(cx) + ' ' + f(cy + h) +
      'L' + f(cx - h) + ' ' + f(cy) + 'Z';
  }

  /** Eckradien für Eckmarken-Formen. corner: 'tl'|'tr'|'bl' (für "Tropfen"). */
  function finderRadii(shape, s, corner) {
    // Blatt/Tropfen: Radius 35 % der Kante. Mit 50 % las ZXing Codes mit Punkt-Modulen
    // in Tests oft nicht mehr (19/32 gegenüber 32/32 bei 35 %, 2026-11-10).
    const h = s * 0.35;
    switch (shape) {
      case 'rounded': { const r = s * 0.28; return [r, r, r, r]; }
      case 'circle': return [s / 2, s / 2, s / 2, s / 2];
      case 'leaf': return [h, 0, h, 0];
      case 'drop': // spitze Ecke zeigt zur Codemitte
        return corner === 'tl' ? [h, h, 0, h] : corner === 'tr' ? [h, h, h, 0] : [h, 0, h, h];
      default: return [0, 0, 0, 0];
    }
  }

  QRC.moduleShapes = ['square', 'soft', 'fluid', 'dots', 'diamond', 'vertical', 'horizontal'];
  QRC.finderOuterShapes = ['square', 'rounded', 'circle', 'leaf', 'drop'];
  QRC.finderInnerShapes = ['square', 'rounded', 'circle', 'leaf', 'drop', 'diamond'];

  const FONTS = {
    sans: "system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    mono: "'Courier New', Courier, monospace",
    rounded: "'Arial Rounded MT Bold', 'Nunito', 'Varela Round', system-ui, sans-serif"
  };
  QRC.fonts = FONTS;

  // ------------------------------------------------------------- Halbton

  /** Luminanz (0..255, Float32Array w*h) → Bits (1 = dunkel), optional Floyd-Steinberg. */
  QRC.ditherLuma = function (luma, w, h, opt) {
    const contrast = opt && opt.contrast != null ? opt.contrast : 1;
    const bright = opt && opt.brightness != null ? opt.brightness : 0;
    const v = new Float32Array(w * h);
    for (let i = 0; i < v.length; i++) v[i] = (luma[i] - 128) * contrast + 128 + bright * 255;
    const bits = new Uint8Array(w * h);
    const dither = !opt || opt.dither !== false;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = v[i];
      const nv = old < 128 ? 0 : 255;
      bits[i] = nv === 0 ? 1 : 0;
      if (!dither) continue;
      const e = old - nv;
      if (x + 1 < w) v[i + 1] += e * 7 / 16;
      if (y + 1 < h) {
        if (x > 0) v[i + w - 1] += e * 3 / 16;
        v[i + w] += e * 5 / 16;
        if (x + 1 < w) v[i + w + 1] += e * 1 / 16;
      }
    }
    return bits;
  };

  // ------------------------------------------------------------- Rendering

  /**
   * matrix: Ergebnis von makeMatrix. o: Optionen (siehe defaults).
   * assets: { imageHref?, halftone?: {w,h,bits} (w = h = 3n), logoAspect? }
   * Liefert { svg, width, height, stats }.
   */
  QRC.renderSVG = function (matrix, o, assets, idPrefix) {
    assets = assets || {};
    const id = (idPrefix || 'qr') + '-';
    const n = matrix.n, dark = matrix.dark;
    const fmap = QRC.functionMap(n, matrix.version);
    const q = Math.max(0, +o.margin || 0);
    const S = n + 2 * q;

    // --- Layout: Rahmen und Textbänder
    const fr = o.frame, tx = o.text;
    const framed = fr.style === 'border' || fr.style === 'banner';
    const bw = framed ? Math.max(0.2, +fr.width || 1) : 0;
    const pad = framed ? Math.max(0, +fr.padding || 0) : 0;
    const P = bw + pad;
    const fs = Math.max(1, +tx.size || 3);
    const lineH = fs * 1.25;
    const lines = s => String(s || '').split('\n').filter(l => l.trim() !== '');
    const topLines = lines(tx.top), botLines = lines(tx.bottom);
    const band = L => L.length ? L.length * lineH + fs * 0.5 : 0;
    const topH = band(topLines), botH = band(botLines);
    const W = S + 2 * P, H = topH + S + botH + 2 * P;
    const cx0 = P, cy0 = P + topH;          // linke obere Ecke des Codefelds (inkl. Ruhezone)
    const ox = cx0 + q, oy = cy0 + q;       // linke obere Ecke der Module

    const c = o.colors;
    const bg = c.bg || '#ffffff';
    const out = [];
    const defs = [];
    const grad = c.gradient && c.gradient.enabled;
    let fill = c.fg;
    if (grad) {
      const g = c.gradient;
      const mx = ox + n / 2, my = oy + n / 2;
      if (g.type === 'radial') {
        defs.push('<radialGradient id="' + id + 'g" gradientUnits="userSpaceOnUse" cx="' + f(mx) + '" cy="' + f(my) +
          '" r="' + f(n * 0.72) + '"><stop offset="0" stop-color="' + esc(c.fg) + '"/><stop offset="1" stop-color="' +
          esc(g.color2) + '"/></radialGradient>');
      } else {
        const a = (+g.angle || 0) * Math.PI / 180, L = n / 2;
        defs.push('<linearGradient id="' + id + 'g" gradientUnits="userSpaceOnUse" x1="' + f(mx - Math.cos(a) * L) +
          '" y1="' + f(my - Math.sin(a) * L) + '" x2="' + f(mx + Math.cos(a) * L) + '" y2="' + f(my + Math.sin(a) * L) +
          '"><stop offset="0" stop-color="' + esc(c.fg) + '"/><stop offset="1" stop-color="' + esc(g.color2) +
          '"/></linearGradient>');
      }
      fill = 'url(#' + id + 'g)';
    }

    // --- Hintergrund, Rahmen
    if (fr.style === 'banner') {
      const rad = Math.max(0, +fr.radius || 0);
      out.push('<path fill="' + esc(fr.color) + '" d="' + rr(0, 0, W, H, [rad, rad, rad, rad]) + '"/>');
      const ir = Math.max(0, rad - bw);
      const yTop = topH ? cy0 - pad : bw;
      const yBot = botH ? cy0 + S + pad : H - bw;
      const r4 = [topH ? 0 : ir, topH ? 0 : ir, botH ? 0 : ir, botH ? 0 : ir];
      if (!c.transparent) out.push('<path fill="' + esc(bg) + '" d="' + rr(bw, yTop, W - 2 * bw, yBot - yTop, r4) + '"/>');
    } else if (fr.style === 'border') {
      const rad = Math.max(0, +fr.radius || 0);
      const ins = bw / 2;
      out.push('<path fill="' + (c.transparent ? 'none' : esc(bg)) + '" stroke="' + esc(fr.color) + '" stroke-width="' +
        f(bw) + '" d="' + rr(ins, ins, W - bw, H - bw, [rad, rad, rad, rad].map(r => Math.max(0, r - ins))) + '"/>');
    } else if (!c.transparent) {
      out.push('<rect width="' + f(W) + '" height="' + f(H) + '" fill="' + esc(bg) + '"/>');
    }

    // --- Logo-Aussparung bestimmen
    const lg = o.logo;
    const cleared = new Uint8Array(n * n);
    let clearedCount = 0;
    let logoBox = null;
    if (lg.enabled && (lg.kind === 'text' ? String(lg.text || '').trim() : lg.image)) {
      const size = Math.min(0.4, Math.max(0.05, +lg.size || 0.2)) * n;
      const aspect = lg.kind === 'image' && assets.logoAspect ? assets.logoAspect : 1; // Breite/Höhe
      let lw = size, lh = size;
      if (lg.shape !== 'circle') { if (aspect >= 1) lh = size / aspect; else lw = size * aspect; }
      const padM = Math.max(0, +lg.padding || 0);
      const mid = n / 2;
      let cw = lw + 2 * padM, ch = lh + 2 * padM;
      if (lg.shape !== 'circle') { // auf ganze Module runden, symmetrisch zur Mitte
        const snap = v => { let k = Math.ceil(v); if ((n - k) % 2) k++; return Math.min(n, k); };
        cw = snap(cw); ch = snap(ch);
      }
      logoBox = { x: ox + mid - lw / 2, y: oy + mid - lh / 2, w: lw, h: lh, cw, ch, mid };
      if (lg.clear) {
        for (let r = 0; r < n; r++) for (let cc = 0; cc < n; cc++) {
          const i = r * n + cc;
          if (fmap[i] === F_FINDER || fmap[i] === F_ALIGN || fmap[i] === F_TIMING) continue;
          const px = cc + 0.5 - mid, py = r + 0.5 - mid;
          const inside = lg.shape === 'circle' ? px * px + py * py <= (cw / 2) * (cw / 2)
            : Math.abs(px) < cw / 2 && Math.abs(py) < ch / 2;
          if (inside) { cleared[i] = 1; if (fmap[i] === 0) clearedCount++; }
        }
      }
    }

    // --- Module
    const im = o.image;
    const mode = im.enabled ? (im.mode === 'halftone' && assets.halftone ? 'halftone'
      : im.mode === 'dots' ? 'dots' : 'normal') : 'normal';
    const isFinderZone = (r, cc) => (r < 7 && cc < 7) || (r < 7 && cc >= n - 7) || (r >= n - 7 && cc < 7);
    const drawn = (r, cc) => r >= 0 && cc >= 0 && r < n && cc < n && dark[r * n + cc] &&
      !cleared[r * n + cc] && !isFinderZone(r, cc);

    if (mode === 'dots' && assets.imageHref) {
      out.push('<image x="' + f(ox) + '" y="' + f(oy) + '" width="' + n + '" height="' + n +
        '" preserveAspectRatio="xMidYMid slice" data-role="image" xlink:href="' + esc(assets.imageHref) + '"/>');
      if (+im.veil > 0) out.push('<rect x="' + f(ox) + '" y="' + f(oy) + '" width="' + n + '" height="' + n +
        '" fill="' + esc(bg) + '" opacity="' + f(Math.min(1, +im.veil)) + '"/>');
    }

    const shape = o.modules.shape;
    let s = Math.min(1, Math.max(0.2, +o.modules.scale || 1));
    if (shape === 'fluid') s = 1;
    const pathFor = (r, cc, sz, shp, isDrawn) => {
      const x = ox + cc, y = oy + r, d = (1 - sz) / 2;
      switch (shp) {
        case 'dots': return circle(x + 0.5, y + 0.5, sz / 2);
        case 'diamond': return diamond(x + 0.5, y + 0.5, sz / 2 * 1.08);
        case 'soft': { const k = sz * 0.32; return rr(x + d, y + d, sz, sz, [k, k, k, k]); }
        case 'fluid': {
          const up = isDrawn(r - 1, cc), dn = isDrawn(r + 1, cc), lf = isDrawn(r, cc - 1), rt = isDrawn(r, cc + 1);
          const k = 0.5;
          return rr(x, y, 1, 1, [!up && !lf ? k : 0, !up && !rt ? k : 0, !dn && !rt ? k : 0, !dn && !lf ? k : 0]);
        }
        default: return 'M' + f(x + d) + ' ' + f(y + d) + 'h' + f(sz) + 'v' + f(sz) + 'h' + f(-sz) + 'z';
      }
    };

    const darkPath = [];
    const lightPath = [];
    const ringPath = []; // evenodd: Ausrichtungsmuster als Ring + Mitte
    if (mode === 'halftone') {
      // Chu et al. (2013): jedes Modul in 3×3 Teilmodule; das mittlere trägt das
      // QR-Bit, die übrigen zeigen das (gerasterte) Bild.
      const hb = assets.halftone, u = 1 / 3;
      const solid = [];
      for (let r = 0; r < n; r++) {
        for (let sr = 0; sr < 3; sr++) {
          let run = -1;
          const flush = endCol => {
            if (run >= 0) { darkPath.push('M' + f(ox + run * u) + ' ' + f(oy + r + sr * u) + 'h' + f((endCol - run) * u) + 'v' + f(u) + 'h' + f(-(endCol - run) * u) + 'z'); run = -1; }
          };
          for (let cc = 0; cc < n; cc++) {
            const i = r * n + cc;
            const t = fmap[i];
            const protectedMod = isFinderZone(r, cc) || t === F_ALIGN || t === F_TIMING || t === F_FORMAT || t === F_VERSION || cleared[i];
            for (let sc = 0; sc < 3; sc++) {
              let on;
              if (protectedMod) on = false;
              else if (sr === 1 && sc === 1) on = !!dark[i];
              else on = !!hb.bits[(r * 3 + sr) * hb.w + cc * 3 + sc];
              const col = cc * 3 + sc;
              if (on) { if (run < 0) run = col; } else flush(col);
            }
          }
          flush(n * 3);
        }
        for (let cc = 0; cc < n; cc++) {
          const i = r * n + cc, t = fmap[i];
          if (!isFinderZone(r, cc) && !cleared[i] && dark[i] &&
            (t === F_ALIGN || t === F_TIMING || t === F_FORMAT || t === F_VERSION)) solid.push(r, cc);
        }
      }
      for (let k = 0; k < solid.length; k += 2) darkPath.push(pathFor(solid[k], solid[k + 1], 1, 'square'));
    } else if (mode === 'dots') {
      const sz = Math.min(1, Math.max(0.2, +im.dotSize || 0.45));
      const shp = shape === 'fluid' || shape === 'vertical' || shape === 'horizontal' ? 'dots' : shape;
      for (let r = 0; r < n; r++) for (let cc = 0; cc < n; cc++) {
        const i = r * n + cc;
        if (isFinderZone(r, cc) || cleared[i]) continue;
        if (fmap[i] === F_ALIGN) continue; // wird massiv gezeichnet
        (dark[i] ? darkPath : lightPath).push(pathFor(r, cc, sz, shp));
      }
      // Ausrichtungsmuster massiv auf hellem Grund (Robustheit)
      const pos = ALIGN[matrix.version] || [], last = pos[pos.length - 1];
      for (const ar of pos) for (const ac of pos) {
        if ((ar === 6 && ac === 6) || (ar === 6 && ac === last) || (ar === last && ac === 6)) continue;
        lightPath.push('M' + f(ox + ac - 2) + ' ' + f(oy + ar - 2) + 'h5v5h-5z');
        ringPath.push('M' + f(ox + ac - 2) + ' ' + f(oy + ar - 2) + 'h5v5h-5z', 'M' + f(ox + ac - 1) + ' ' + f(oy + ar - 1) + 'h3v3h-3z',
          'M' + f(ox + ac) + ' ' + f(oy + ar) + 'h1v1h-1z');
      }
    } else if (shape === 'vertical' || shape === 'horizontal') {
      const vert = shape === 'vertical';
      for (let a = 0; a < n; a++) {
        let start = -1;
        for (let b = 0; b <= n; b++) {
          const on = b < n && (vert ? drawn(b, a) : drawn(a, b));
          if (on && start < 0) start = b;
          if (!on && start >= 0) {
            const len = b - start, d = (1 - s) / 2, k = s / 2;
            darkPath.push(vert ? rr(ox + a + d, oy + start + d, s, len - 2 * d, [k, k, k, k])
              : rr(ox + start + d, oy + a + d, len - 2 * d, s, [k, k, k, k]));
            start = -1;
          }
        }
      }
    } else if (shape === 'square' && s === 1) {
      for (let r = 0; r < n; r++) {
        let start = -1;
        for (let cc = 0; cc <= n; cc++) {
          const on = cc < n && drawn(r, cc);
          if (on && start < 0) start = cc;
          if (!on && start >= 0) { darkPath.push('M' + f(ox + start) + ' ' + f(oy + r) + 'h' + (cc - start) + 'v1h' + (start - cc) + 'z'); start = -1; }
        }
      }
    } else {
      for (let r = 0; r < n; r++) for (let cc = 0; cc < n; cc++) if (drawn(r, cc)) darkPath.push(pathFor(r, cc, s, shape, drawn));
    }

    if (mode !== 'normal') {
      // helle Unterlage für die Eckmarken (inkl. Trennlinie), damit sie auf Bildern sicher erkannt werden
      for (const [r, cc] of [[0, 0], [0, n - 8], [n - 8, 0]]) {
        lightPath.push('M' + f(ox + cc) + ' ' + f(oy + r) + 'h8v8h-8z');
      }
      if (!c.transparent || mode === 'dots') out.push('<path fill="' + esc(bg) + '" d="' + lightPath.join('') + '"/>');
    }
    if (darkPath.length) out.push('<path fill="' + fill + '" d="' + darkPath.join('') + '"/>');
    if (ringPath.length) out.push('<path fill="' + fill + '" fill-rule="evenodd" d="' + ringPath.join('') + '"/>');

    // --- Eckmarken
    const finders = [[0, 0, 'tl'], [0, n - 7, 'tr'], [n - 7, 0, 'bl']];
    const oc = o.finder.outerColor || fill, ic = o.finder.innerColor || fill;
    let ring = '', core = '';
    for (const [r, cc, corner] of finders) {
      const x = ox + cc, y = oy + r;
      const R = finderRadii(o.finder.outer, 7, corner);
      ring += rr(x, y, 7, 7, R) + rr(x + 1, y + 1, 5, 5, R.map(v => Math.max(0, v - 1)));
      if (o.finder.inner === 'diamond') core += diamond(x + 3.5, y + 3.5, 1.9);
      else core += rr(x + 2, y + 2, 3, 3, o.finder.inner === 'rounded' ? [0.8, 0.8, 0.8, 0.8] : finderRadii(o.finder.inner, 3, corner));
    }
    out.push('<path fill="' + esc(oc) + '" fill-rule="evenodd" d="' + ring + '"/>');
    out.push('<path fill="' + esc(ic) + '" d="' + core + '"/>');

    // --- Logo
    if (logoBox) {
      const b = logoBox, mx = ox + b.mid, my = oy + b.mid;
      if (lg.bgEnabled) {
        out.push('<path fill="' + esc(lg.bg) + '" d="' + (lg.shape === 'circle' ? circle(mx, my, b.cw / 2)
          : rr(mx - b.cw / 2, my - b.ch / 2, b.cw, b.ch, [0.6, 0.6, 0.6, 0.6])) + '"/>');
      }
      if (lg.kind === 'image') {
        let clip = '';
        if (lg.shape === 'circle') {
          defs.push('<clipPath id="' + id + 'lc"><circle cx="' + f(mx) + '" cy="' + f(my) + '" r="' + f(b.w / 2) + '"/></clipPath>');
          clip = ' clip-path="url(#' + id + 'lc)"';
        }
        out.push('<image x="' + f(b.x) + '" y="' + f(b.y) + '" width="' + f(b.w) + '" height="' + f(b.h) + '"' + clip +
          ' preserveAspectRatio="xMidYMid ' + (lg.shape === 'circle' ? 'slice' : 'meet') + '" data-role="logo" xlink:href="' + esc(lg.image) + '"/>');
      } else {
        const t = String(lg.text).trim();
        const fsz = Math.min(b.h * 0.62, b.w * 0.92 / Math.max(1, t.length * 0.62));
        out.push('<text x="' + f(mx) + '" y="' + f(my) + '" text-anchor="middle" dominant-baseline="central" font-family="' +
          esc(FONTS[lg.font] || FONTS.sans) + '" font-weight="700" font-size="' + f(fsz) + '" fill="' + esc(lg.textColor) + '">' +
          esc(t) + '</text>');
      }
    }

    // --- Texte
    const textColor = tx.color;
    const textEl = (L, yStart) => L.map((l, k) => '<text x="' + f(W / 2) + '" y="' + f(yStart + fs * 0.25 + lineH * k + lineH / 2) +
      '" text-anchor="middle" dominant-baseline="central" font-family="' + esc(FONTS[tx.font] || FONTS.sans) +
      '" font-weight="' + (tx.bold ? 700 : 400) + '" font-size="' + f(fs) + '" fill="' + esc(textColor) + '">' + esc(l) + '</text>').join('');
    if (topLines.length) out.push(textEl(topLines, P));
    if (botLines.length) out.push(textEl(botLines, cy0 + S));

    const px = Math.max(16, Math.round(+o.export.size || 1024));
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' +
      f(W) + ' ' + f(H) + '" width="' + px + '" height="' + Math.round(px * H / W) + '">' +
      (defs.length ? '<defs>' + defs.join('') + '</defs>' : '') + out.join('') + '</svg>';
    let dataModules = 0;
    for (let i = 0; i < n * n; i++) if (fmap[i] === 0) dataModules++;
    return {
      svg, width: px, height: Math.round(px * H / W),
      stats: { n, version: matrix.version, ecc: matrix.ecc, clearedRatio: dataModules ? clearedCount / dataModules : 0 }
    };
  };

  /** Komfort: Payload + Optionen → Render-Ergebnis (oder {error}). */
  QRC.generate = function (payload, o, assets, idPrefix) {
    if (!payload) return { error: 'empty' };
    const ecc = QRC.effectiveEcc(o);
    if (QRC.utf8Length(payload) > QRC.maxBytes[ecc]) return { error: 'too-long', ecc };
    let m;
    try { m = QRC.makeMatrix(payload, ecc); } catch (e) { return { error: 'too-long', ecc }; }
    const res = QRC.renderSVG(m, o, assets, idPrefix);
    res.matrix = m;
    return res;
  };

  if (typeof module === 'object' && module.exports) module.exports = QRC;
})(typeof globalThis !== 'undefined' ? globalThis : this);
