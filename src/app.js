/* QR-Coder – Oberfläche. Baut die Bedienelemente aus einer Beschreibung,
 * hält den Zustand und rendert Vorschau, Vorlagen, Prüfung und Export. */
(function () {
  'use strict';
  const QRC = window.QRC;
  const t = QRC.t;
  QRC.lang = QRC.pickLang(navigator.languages || [navigator.language]);
  document.documentElement.lang = QRC.lang;

  const STORE_KEY = 'qrc.state.v1', THEME_KEY = 'qrc.theme';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };
  const $ = (sel, el) => (el || document).querySelector(sel);
  const h = (tag, attrs, kids) => {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    for (const c of [].concat(kids || [])) if (c != null) el.append(c);
    return el;
  };
  const debounce = (fn, ms) => { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; };
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setPath = (o, p, v) => {
    const ks = p.split('.'); let a = o;
    for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null || typeof a[ks[i]] !== 'object') a[ks[i]] = {}; a = a[ks[i]]; }
    a[ks[ks.length - 1]] = v;
  };

  // ------------------------------------------------------------ Zustand

  function defaultState() {
    const s = QRC.defaults();
    s.content = {
      type: 'url',
      fields: {
        url: { url: 'https://example.com' }, text: { text: '' },
        wifi: { ssid: '', password: '', auth: 'WPA', hidden: false },
        vcard: {}, email: {}, tel: {}, sms: {}
      }
    };
    s.finder.own = false;
    return s;
  }
  let state = defaultState();
  try {
    const saved = JSON.parse(store.get(STORE_KEY) || 'null');
    if (saved) state = QRC.merge(defaultState(), saved);
  } catch (e) { /* ungültiger Speicherstand → Standard */ }

  // ------------------------------------------------------------ Bilder

  const DEMO_LOGO = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<circle cx="12" cy="12" r="12" fill="#e03131"/><path fill="#fff" transform="translate(4.2 4.6) scale(.65)" ' +
    'd="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 ' +
    '19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>');

  // Eigenes, gezeichnetes Beispielbild (keine fremden Rechte).
  function makeDemoImage() {
    const c = document.createElement('canvas'); c.width = c.height = 480;
    const x = c.getContext('2d');
    const sky = x.createLinearGradient(0, 0, 0, 480);
    sky.addColorStop(0, '#ffd8a8'); sky.addColorStop(0.55, '#ff922b'); sky.addColorStop(1, '#862e9c');
    x.fillStyle = sky; x.fillRect(0, 0, 480, 480);
    x.fillStyle = '#fff4e6'; x.beginPath(); x.arc(300, 190, 92, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#5f3dc4';
    x.beginPath(); x.moveTo(0, 360); x.lineTo(120, 230); x.lineTo(210, 320); x.lineTo(330, 200); x.lineTo(480, 350);
    x.lineTo(480, 480); x.lineTo(0, 480); x.fill();
    x.fillStyle = '#212529';
    x.beginPath(); x.moveTo(0, 420); x.quadraticCurveTo(160, 360, 280, 410); x.quadraticCurveTo(380, 450, 480, 400);
    x.lineTo(480, 480); x.lineTo(0, 480); x.fill();
    return c.toDataURL('image/jpeg', 0.88);
  }
  let DEMO_IMAGE = '';

  const imgCache = new Map();
  function loadImage(src) {
    if (!src) return Promise.reject(new Error('no src'));
    if (imgCache.has(src)) return imgCache.get(src);
    const p = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    imgCache.set(src, p);
    p.then(img => { p.img = img; });
    return p;
  }
  const loadedImage = src => { const p = imgCache.get(src); return p && p.img; };

  /** Datei lesen; Rasterbilder auf maxPx verkleinern (SVG bleibt Vektor). */
  function readImageFile(file, maxPx, keepAlpha) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onerror = rej;
      fr.onload = () => {
        const src = fr.result;
        if (/^data:image\/svg/.test(src)) return res(src);
        const img = new Image();
        img.onerror = rej;
        img.onload = () => {
          const k = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
          if (k === 1 && src.length < 600000) return res(src);
          const c = document.createElement('canvas');
          c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res(keepAlpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85));
        };
        img.src = src;
      };
      fr.readAsDataURL(file);
    });
  }

  const htCache = new Map();
  function halftoneFor(src, n, im) {
    const img = loadedImage(src);
    if (!img) return null;
    const key = src.length + ':' + src.slice(-64) + ':' + n + ':' + im.contrast + ':' + im.brightness + ':' + im.dither;
    if (htCache.has(key)) return htCache.get(key);
    const w = n * 3;
    const c = document.createElement('canvas'); c.width = c.height = w;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, w);
    const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1, side = Math.min(iw, ih);
    x.drawImage(img, (iw - side) / 2, (ih - side) / 2, side, side, 0, 0, w, w); // mittig zuschneiden (wie "slice")
    const d = x.getImageData(0, 0, w, w).data;
    const luma = new Float32Array(w * w);
    for (let i = 0; i < luma.length; i++) luma[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    const res = { w, h: w, bits: QRC.ditherLuma(luma, w, w, im) };
    if (htCache.size > 20) htCache.clear();
    htCache.set(key, res);
    return res;
  }

  // ------------------------------------------------------------ Erzeugen

  function resolved(s) {
    const o = QRC.merge(s, {});
    if (!s.finder.own) { o.finder = Object.assign({}, s.finder, { outerColor: '', innerColor: '' }); }
    if (o.logo.enabled && o.logo.kind === 'image' && !o.logo.image) o.logo = Object.assign({}, o.logo, { image: DEMO_LOGO });
    if (o.image.enabled && !o.image.src) o.image = Object.assign({}, o.image, { src: DEMO_IMAGE });
    return o;
  }

  function generate(s, payload, idPrefix) {
    const o = resolved(s);
    if (!payload) return { error: 'empty' };
    const ecc = QRC.effectiveEcc(o);
    const bytes = QRC.utf8Length(payload);
    if (bytes > QRC.maxBytes[ecc]) return { error: 'too-long', ecc };
    let m;
    try { m = QRC.makeMatrix(payload, ecc); } catch (e) { return { error: 'too-long', ecc }; }
    const assets = {};
    let pending = [];
    if (o.image.enabled) {
      assets.imageHref = o.image.src;
      if (!loadedImage(o.image.src)) pending.push(loadImage(o.image.src));
      else if (o.image.mode === 'halftone') assets.halftone = halftoneFor(o.image.src, m.n, o.image);
    }
    if (o.logo.enabled && o.logo.kind === 'image') {
      const li = loadedImage(o.logo.image);
      if (li) assets.logoAspect = (li.naturalWidth || 1) / (li.naturalHeight || 1);
      else pending.push(loadImage(o.logo.image));
    }
    const r = QRC.renderSVG(m, o, assets, idPrefix);
    r.bytes = bytes; r.pending = pending; r.options = o;
    return r;
  }

  // ------------------------------------------------------------ Vorlagen

  const PRESETS = [
    { id: 'classic', patch: {} },
    { id: 'fluid', patch: { modules: { shape: 'fluid' }, finder: { outer: 'rounded', inner: 'rounded' }, colors: { fg: '#1d3557' } } },
    { id: 'dots', patch: { modules: { shape: 'dots', scale: 0.86 }, finder: { outer: 'circle', inner: 'circle', own: true, outerColor: '#5f3dc4', innerColor: '#e8590c' }, colors: { fg: '#343a40' } } },
    { id: 'gradient', patch: { modules: { shape: 'soft', scale: 0.92 }, finder: { outer: 'drop', inner: 'drop' }, colors: { fg: '#0b7285', gradient: { enabled: true, type: 'linear', color2: '#5f3dc4', angle: 45 } } } },
    { id: 'lines', patch: { modules: { shape: 'vertical', scale: 0.78 }, finder: { outer: 'leaf', inner: 'leaf' }, colors: { fg: '#2b2d42' } } },
    { id: 'logo', patch: { modules: { shape: 'fluid' }, finder: { outer: 'rounded', inner: 'circle' }, colors: { fg: '#212529' }, logo: { enabled: true, kind: 'image', size: 0.24, shape: 'circle', padding: 0.8, clear: true } } },
    { id: 'banner', patch: { modules: { shape: 'square' }, colors: { fg: '#111111' }, margin: 2, frame: { style: 'banner', color: '#111111', width: 1.2, radius: 2.5 }, text: { bottom: '@p.banner.text', color: '#ffffff', size: 3.6, bold: true, font: 'sans' } } },
    { id: 'textlogo', patch: { modules: { shape: 'dots', scale: 0.9 }, finder: { outer: 'rounded', inner: 'rounded' }, colors: { fg: '#2f9e44' }, margin: 2, logo: { enabled: true, kind: 'text', text: 'QR', textColor: '#2f9e44', size: 0.26, padding: 0.5, font: 'rounded' }, frame: { style: 'border', color: '#2f9e44', width: 0.8, radius: 3, padding: 0.5 }, text: { top: '@p.textlogo.top', color: '#2f9e44', size: 3, font: 'rounded', bold: true } } },
    { id: 'halftone', patch: { colors: { fg: '#1b1b1b' }, finder: { outer: 'rounded', inner: 'rounded' }, image: { enabled: true, mode: 'halftone', contrast: 1.1, brightness: 0.05, dither: true } } },
    { id: 'imagedots', patch: { colors: { fg: '#141414' }, finder: { outer: 'circle', inner: 'circle' }, modules: { shape: 'dots' }, image: { enabled: true, mode: 'dots', dotSize: 0.5, veil: 0.12 } } }
  ];
  function presetState(p, base) {
    const fresh = defaultState();
    fresh.content = base.content;
    // eigene Bilder des Nutzers in Vorlagen weiterverwenden
    if (base.logo.image) fresh.logo.image = base.logo.image;
    if (base.image.src) fresh.image.src = base.image.src;
    fresh.export = base.export;
    const s = QRC.merge(fresh, p.patch);
    for (const k of ['top', 'bottom']) if (/^@/.test(s.text[k])) s.text[k] = t(s.text[k].slice(1));
    return s;
  }

  // ------------------------------------------------------------ Bedienelemente

  const opt = (prefix, values) => values.map(v => [v, prefix + v]);
  const FONTS = opt('font.', ['sans', 'serif', 'mono', 'rounded']);
  const CONTENT_FIELDS = {
    url: [{ k: 'url', type: 'url', label: 'f.url' }],
    text: [{ k: 'text', type: 'textarea', label: 'f.text', rows: 4 }],
    wifi: [{ k: 'ssid', label: 'f.ssid' }, { k: 'password', label: 'f.password' },
      { k: 'auth', type: 'select', label: 'f.auth', options: [['WPA', 'WPA/WPA2/WPA3'], ['WEP', 'WEP'], ['nopass', 'f.auth.nopass']] },
      { k: 'hidden', type: 'checkbox', label: 'f.hidden' }],
    vcard: [{ k: 'firstName', label: 'f.firstName', half: 1 }, { k: 'lastName', label: 'f.lastName', half: 1 },
      { k: 'org', label: 'f.org', half: 1 }, { k: 'title', label: 'f.title', half: 1 },
      { k: 'phone', type: 'tel', label: 'f.phone', half: 1 }, { k: 'email', type: 'email', label: 'f.email', half: 1 },
      { k: 'web', type: 'url', label: 'f.web' }, { k: 'street', label: 'f.street' },
      { k: 'zip', label: 'f.zip', half: 1 }, { k: 'city', label: 'f.city', half: 1 }, { k: 'country', label: 'f.country' }],
    email: [{ k: 'to', type: 'email', label: 'f.to' }, { k: 'subject', label: 'f.subject' },
      { k: 'body', type: 'textarea', label: 'f.body', rows: 3 }],
    tel: [{ k: 'number', type: 'tel', label: 'f.number' }],
    sms: [{ k: 'number', type: 'tel', label: 'f.number' }, { k: 'message', type: 'textarea', label: 'f.message', rows: 3 }]
  };

  const SECTIONS = [
    { id: 'shape', title: 'sec.shape', fields: [
      { k: 'modules.shape', type: 'select', label: 'modules', options: opt('shape.', QRC.moduleShapes) },
      { k: 'modules.scale', type: 'range', label: 'modules.scale', min: 0.4, max: 1, step: 0.02, pct: 1,
        when: s => s.modules.shape !== 'fluid' && !s.image.enabled },
      { k: 'finder.outer', type: 'select', label: 'finder.outer', options: opt('fs.', QRC.finderOuterShapes), half: 1 },
      { k: 'finder.inner', type: 'select', label: 'finder.inner', options: opt('fs.', QRC.finderInnerShapes), half: 1 },
      { k: 'ecc', type: 'select', label: 'ecc', options: [['auto', 'ecc.auto'], ['L', 'ecc.L'], ['M', 'ecc.M'], ['Q', 'ecc.Q'], ['H', 'ecc.H']], half: 1 },
      { k: 'margin', type: 'range', label: 'margin', min: 0, max: 8, step: 1, half: 1 }
    ] },
    { id: 'colors', title: 'sec.colors', fields: [
      { k: 'colors.fg', type: 'color', label: 'c.fg', half: 1 },
      { k: 'colors.bg', type: 'color', label: 'c.bg', half: 1 },
      { k: 'colors.transparent', type: 'checkbox', label: 'c.transparent' },
      { k: 'colors.gradient.enabled', type: 'checkbox', label: 'c.gradient' },
      { k: 'colors.gradient.type', type: 'select', label: 'c.gradType', options: [['linear', 'c.linear'], ['radial', 'c.radial']], half: 1, when: s => s.colors.gradient.enabled },
      { k: 'colors.gradient.color2', type: 'color', label: 'c.color2', half: 1, when: s => s.colors.gradient.enabled },
      { k: 'colors.gradient.angle', type: 'range', label: 'c.angle', min: 0, max: 360, step: 5, unit: '°', when: s => s.colors.gradient.enabled && s.colors.gradient.type === 'linear' },
      { k: 'finder.own', type: 'checkbox', label: 'c.finderOwn' },
      { k: 'finder.outerColor', type: 'color', label: 'c.finderOuter', half: 1, when: s => s.finder.own },
      { k: 'finder.innerColor', type: 'color', label: 'c.finderInner', half: 1, when: s => s.finder.own }
    ] },
    { id: 'logo', title: 'sec.logo', fields: [
      { k: 'logo.enabled', type: 'checkbox', label: 'logo.enabled' },
      { k: 'logo.kind', type: 'select', label: 'logo.kind', options: [['text', 'logo.kind.text'], ['image', 'logo.kind.image']], when: s => s.logo.enabled },
      { k: 'logo.image', type: 'file', label: 'logo.file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', maxPx: 512, alpha: true, when: s => s.logo.enabled && s.logo.kind === 'image' },
      { k: 'logo.text', label: 'logo.text', half: 1, when: s => s.logo.enabled && s.logo.kind === 'text' },
      { k: 'logo.textColor', type: 'color', label: 'logo.textColor', half: 1, when: s => s.logo.enabled && s.logo.kind === 'text' },
      { k: 'logo.font', type: 'select', label: 'logo.font', options: FONTS, when: s => s.logo.enabled && s.logo.kind === 'text' },
      { k: 'logo.size', type: 'range', label: 'logo.size', min: 0.1, max: 0.35, step: 0.01, pct: 1, when: s => s.logo.enabled },
      { k: 'logo.shape', type: 'select', label: 'logo.shape', options: [['square', 'logo.shape.square'], ['circle', 'logo.shape.circle']], half: 1, when: s => s.logo.enabled },
      { k: 'logo.padding', type: 'range', label: 'logo.padding', min: 0, max: 3, step: 0.1, half: 1, when: s => s.logo.enabled },
      { k: 'logo.clear', type: 'checkbox', label: 'logo.clear', when: s => s.logo.enabled },
      { k: 'logo.bgEnabled', type: 'checkbox', label: 'logo.bgEnabled', when: s => s.logo.enabled },
      { k: 'logo.bg', type: 'color', label: 'logo.bg', when: s => s.logo.enabled && s.logo.bgEnabled }
    ] },
    { id: 'image', title: 'sec.image', fields: [
      { k: 'image.enabled', type: 'checkbox', label: 'image.enabled' },
      { k: 'image.src', type: 'file', label: 'image.file', accept: 'image/png,image/jpeg,image/webp', maxPx: 768, hint: 'image.demo', when: s => s.image.enabled },
      { k: 'image.mode', type: 'select', label: 'image.mode', options: [['dots', 'image.mode.dots'], ['halftone', 'image.mode.halftone']], when: s => s.image.enabled },
      { k: 'image.dotSize', type: 'range', label: 'image.dotSize', min: 0.25, max: 0.8, step: 0.01, pct: 1, when: s => s.image.enabled && s.image.mode === 'dots' },
      { k: 'image.veil', type: 'range', label: 'image.veil', min: 0, max: 0.8, step: 0.01, pct: 1, when: s => s.image.enabled && s.image.mode === 'dots' },
      { k: 'image.contrast', type: 'range', label: 'image.contrast', min: 0.4, max: 2.5, step: 0.05, when: s => s.image.enabled && s.image.mode === 'halftone' },
      { k: 'image.brightness', type: 'range', label: 'image.brightness', min: -0.4, max: 0.4, step: 0.01, when: s => s.image.enabled && s.image.mode === 'halftone' },
      { k: 'image.dither', type: 'checkbox', label: 'image.dither', when: s => s.image.enabled && s.image.mode === 'halftone' }
    ] },
    { id: 'frame', title: 'sec.frame', fields: [
      { k: 'text.top', type: 'textarea', rows: 1, label: 'text.top', half: 1 },
      { k: 'text.bottom', type: 'textarea', rows: 1, label: 'text.bottom', half: 1 },
      { k: 'text.color', type: 'color', label: 'text.color', half: 1, when: s => s.text.top || s.text.bottom },
      { k: 'text.size', type: 'range', label: 'text.size', min: 1.5, max: 7, step: 0.1, half: 1, when: s => s.text.top || s.text.bottom },
      { k: 'text.font', type: 'select', label: 'text.font', options: FONTS, half: 1, when: s => s.text.top || s.text.bottom },
      { k: 'text.bold', type: 'checkbox', label: 'text.bold', half: 1, when: s => s.text.top || s.text.bottom },
      { k: 'frame.style', type: 'select', label: 'frame.style', options: [['none', 'frame.none'], ['border', 'frame.border'], ['banner', 'frame.banner']], half: 1 },
      { k: 'frame.color', type: 'color', label: 'frame.color', half: 1, when: s => s.frame.style !== 'none' },
      { k: 'frame.width', type: 'range', label: 'frame.width', min: 0.3, max: 3, step: 0.1, half: 1, when: s => s.frame.style !== 'none' },
      { k: 'frame.radius', type: 'range', label: 'frame.radius', min: 0, max: 8, step: 0.1, half: 1, when: s => s.frame.style !== 'none' },
      { k: 'frame.padding', type: 'range', label: 'frame.padding', min: 0, max: 4, step: 0.1, when: s => s.frame.style !== 'none' }
    ] }
  ];

  const controls = []; // {field, el, wrap, read(), write()}
  let uid = 0;

  function fieldControl(f, path) {
    const id = 'f' + (++uid);
    const label = h('label', { for: id, text: t(f.label) });
    let input, valueOut = null;
    const type = f.type || 'text';
    if (type === 'select') {
      input = h('select', { id }, f.options.map(([v, l]) => h('option', { value: v, text: /\./.test(l) ? t(l) : l })));
    } else if (type === 'textarea') {
      input = h('textarea', { id, rows: f.rows || 2, spellcheck: 'false' });
    } else if (type === 'checkbox') {
      input = h('input', { id, type: 'checkbox' });
    } else if (type === 'range') {
      input = h('input', { id, type: 'range', min: f.min, max: f.max, step: f.step });
      valueOut = h('output', { for: id });
    } else if (type === 'color') {
      input = h('input', { id, type: 'color' });
    } else if (type === 'file') {
      input = h('input', { id, type: 'file', accept: f.accept });
    } else {
      input = h('input', { id, type, autocomplete: 'off', spellcheck: 'false' });
    }
    const fmt = v => f.pct ? Math.round(v * 100) + ' %' : (f.unit ? v + f.unit : String(v));
    const ctl = { f, path, input, valueOut };
    let wrap;
    if (type === 'checkbox') {
      wrap = h('div', { class: 'field check' + (f.half ? ' half' : '') }, [input, label]);
    } else if (type === 'file') {
      const clearBtn = h('button', { type: 'button', class: 'icon-btn small', 'aria-label': t('remove'), 'data-tip': t('remove'),
        onclick: () => { setPath(state, path, ''); input.value = ''; changed(); } });
      clearBtn.innerHTML = ICONS.close;
      ctl.clearBtn = clearBtn;
      wrap = h('div', { class: 'field file' }, [label, h('div', { class: 'row' }, [input, clearBtn]),
        f.hint ? h('small', { class: 'hint', text: t(f.hint) }) : null]);
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try { setPath(state, path, await readImageFile(file, f.maxPx, !!f.alpha)); changed(); } catch (e) { toast(String(e)); }
      });
    } else {
      wrap = h('div', { class: 'field' + (f.half ? ' half' : '') }, [h('div', { class: 'label-row' }, [label, valueOut]), input]);
    }
    if (type !== 'file') {
      input.addEventListener('input', () => {
        let v;
        if (type === 'checkbox') v = input.checked;
        else if (type === 'range') v = parseFloat(input.value);
        else v = input.value;
        setPath(state, path, v);
        if (valueOut) valueOut.textContent = fmt(v);
        changed();
      });
    }
    ctl.write = () => {
      const v = getPath(state, path);
      if (type === 'checkbox') input.checked = !!v;
      else if (type === 'file') ctl.clearBtn.hidden = !v;
      else if (type === 'color') input.value = /^#[0-9a-f]{6}$/i.test(v || '') ? v : '#000000';
      else if (document.activeElement !== input) input.value = v == null ? '' : v;
      if (valueOut) valueOut.textContent = fmt(v);
    };
    ctl.wrap = wrap;
    controls.push(ctl);
    return wrap;
  }

  function buildContentSection() {
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    const panes = h('div');
    for (const type of QRC.contentTypes) {
      const b = h('button', { type: 'button', role: 'tab', class: 'tab', 'data-type': type, text: t('type.' + type),
        onclick: () => { state.content.type = type; changed(); } });
      tabs.append(b);
      const pane = h('div', { class: 'grid', 'data-pane': type });
      for (const f of CONTENT_FIELDS[type]) pane.append(fieldControl(f, 'content.fields.' + type + '.' + f.k));
      panes.append(pane);
    }
    const payload = h('div', { class: 'payload' }, [h('span', { class: 'label', text: t('payload') }), h('code', { id: 'payload' })]);
    return section('content', 'sec.content', [tabs, panes, payload], true);
  }

  function section(id, title, kids, open) {
    const d = h('details', { class: 'sec', id: 'sec-' + id, open: !!open }, [h('summary', { text: t(title) }), h('div', { class: 'sec-body' }, kids)]);
    return d;
  }

  // ------------------------------------------------------------ Icons (Material Icons, Apache 2.0)

  const ic = d => '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + d + '"/></svg>';
  const ICONS = {
    download: ic('M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z'),
    image: ic('M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z'),
    copy: ic('M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z'),
    theme: ic('M20 15.31L23.31 12 20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69zM12 18V6c3.31 0 6 2.69 6 6s-2.69 6-6 6z'),
    reset: ic('M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z'),
    close: ic('M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z')
  };

  // ------------------------------------------------------------ Aufbau

  function build() {
    $('#app-title').textContent = t('app.title');
    $('#app-tagline').textContent = t('app.tagline');
    document.title = t('app.title');
    for (const el of document.querySelectorAll('[data-icon]')) el.insertAdjacentHTML('afterbegin', ICONS[el.dataset.icon]);
    for (const el of document.querySelectorAll('[data-tip-key]')) {
      el.setAttribute('data-tip', t(el.dataset.tipKey)); el.setAttribute('aria-label', t(el.dataset.tipKey));
    }
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);

    const ctl = $('#controls');
    ctl.append(buildContentSection());
    for (const sec of SECTIONS) {
      const grid = h('div', { class: 'grid' });
      for (const f of sec.fields) grid.append(fieldControl(f, f.k));
      ctl.append(section(sec.id, sec.title, [grid], false));
    }
    // Exportgröße
    const sizeIn = $('#export-size');
    sizeIn.value = state.export.size;
    sizeIn.addEventListener('input', () => { const v = parseInt(sizeIn.value, 10); if (v >= 16 && v <= 8192) { state.export.size = v; changed(); } });

    $('#btn-svg').addEventListener('click', downloadSVG);
    $('#btn-png').addEventListener('click', downloadPNG);
    $('#btn-copy').addEventListener('click', copySVG);
    $('#btn-reset').addEventListener('click', resetAll);
    setupTheme();

    // Vorlagen
    const pr = $('#presets');
    for (const p of PRESETS) {
      const b = h('button', { type: 'button', class: 'preset', 'data-preset': p.id, title: t('p.' + p.id),
        onclick: () => { state = presetState(p, state); changed(true); } },
      [h('span', { class: 'thumb' }), h('span', { class: 'name', text: t('p.' + p.id) })]);
      pr.append(b);
    }
  }

  // ------------------------------------------------------------ Darstellung (D-07)

  function applyTheme(v) {
    if (v === 'light' || v === 'dark') document.documentElement.setAttribute('data-theme', v);
    else document.documentElement.removeAttribute('data-theme');
  }
  function setupTheme() {
    const cur = store.get(THEME_KEY) || 'system';
    applyTheme(cur);
    const menu = $('#theme-menu');
    for (const v of ['light', 'dark', 'system']) {
      const id = 'theme-' + v;
      const r = h('input', { type: 'radio', name: 'theme', id, value: v, checked: v === cur });
      r.addEventListener('change', () => { applyTheme(v); store.set(THEME_KEY, v); closeMenu(); });
      menu.append(h('div', { class: 'menu-item' }, [r, h('label', { for: id, text: t('theme.' + v) })]));
    }
    const btn = $('#btn-theme');
    const closeMenu = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', e => {
      e.stopPropagation();
      menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden));
      if (!menu.hidden) { const c = menu.querySelector('input:checked'); if (c) c.focus(); }
    });
    document.addEventListener('click', e => { if (!menu.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  }

  // ------------------------------------------------------------ Aktualisieren

  let last = null;
  function syncControls() {
    for (const c of controls) {
      c.write();
      const w = c.f.when;
      c.wrap.hidden = w ? !w(state) : false;
    }
    for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.type === state.content.type));
    for (const p of document.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== state.content.type;
    $('#export-size').value = state.export.size;
  }

  function renderPreview() {
    const payload = QRC.buildPayload(state.content);
    $('#payload').textContent = payload.length > 400 ? payload.slice(0, 400) + ' …' : payload;
    const r = generate(state, payload, 'pv');
    last = { r, payload };
    const pv = $('#preview'), info = $('#info'), warn = $('#warnings');
    warn.replaceChildren();
    if (r.error) {
      pv.innerHTML = '';
      pv.append(h('p', { class: 'empty', text: r.error === 'empty' ? t('err.empty') : t('err.too-long', { ecc: r.ecc, max: QRC.maxBytes[r.ecc] }) }));
      info.textContent = '';
      setScan('idle');
      setExportEnabled(false);
      return;
    }
    pv.innerHTML = r.svg;
    setExportEnabled(true);
    info.textContent = t('info', { v: r.stats.version, n: r.stats.n, ecc: r.stats.ecc, bytes: r.bytes });
    const ws = [];
    if (r.stats.clearedRatio > 0.15) ws.push(t('warn.cleared', { p: Math.round(r.stats.clearedRatio * 100) }));
    const o = r.options;
    if ((o.logo.enabled || o.image.enabled) && r.stats.ecc !== 'H') ws.push(t('warn.ecc', { ecc: r.stats.ecc }));
    if (!o.image.enabled) {
      const bgc = o.colors.transparent ? '#ffffff' : o.colors.bg;
      const cr = contrastRatio(o.colors.fg, bgc);
      if (o.colors.gradient.enabled) {
        const cr2 = contrastRatio(o.colors.gradient.color2, bgc);
        if (cr2 < cr) checkContrast(cr2, ws); else checkContrast(cr, ws);
      } else checkContrast(cr, ws);
      if (luminance(o.colors.fg) > luminance(bgc)) ws.push(t('warn.inverted'));
    }
    for (const w of ws) warn.append(h('li', { text: w }));
    if (r.pending.length) Promise.all(r.pending).then(() => renderPreview(), () => {});
    else scheduleScan();
  }
  function checkContrast(cr, ws) { if (cr < 3) ws.push(t('warn.contrast', { r: cr.toFixed(1) })); }

  function hexRgb(hx) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hx || ''); if (!m) return [0, 0, 0];
    const v = parseInt(m[1], 16); return [v >> 16 & 255, v >> 8 & 255, v & 255];
  }
  function luminance(hx) {
    const [r, g, b] = hexRgb(hx).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrastRatio(a, b) { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }

  const renderThumbs = debounce(() => {
    const payload = QRC.buildPayload(state.content) || 'https://example.com';
    for (const p of PRESETS) {
      const el = document.querySelector('[data-preset="' + p.id + '"] .thumb');
      const s = presetState(p, state);
      s.export = { size: 120 };
      const r = generate(s, payload, 'th-' + p.id);
      if (r.error) { el.innerHTML = ''; continue; }
      el.innerHTML = r.svg;
      if (r.pending.length) Promise.all(r.pending).then(renderThumbs, () => {});
    }
  }, 300);

  const saveState = debounce(() => {
    if (!store.set(STORE_KEY, JSON.stringify(state))) {
      // z. B. Speicher voll durch große Bilder → ohne Bilder speichern
      const lite = QRC.merge(state, { logo: { image: '' }, image: { src: '' } });
      store.set(STORE_KEY, JSON.stringify(lite));
    }
  }, 400);

  let lastPayload = null;
  // Design D-04: Vorschau sofort, teure Folgearbeit (Prüfung, Speichern, Vorschaubilder) entprellt.
  function changed(all) {
    syncControls();
    renderPreview();
    saveState();
    const p = QRC.buildPayload(state.content);
    if (all || p !== lastPayload) { lastPayload = p; renderThumbs(); }
  }

  // ------------------------------------------------------------ Lesbarkeit

  let scanSeq = 0;
  function setScan(kind, note) {
    const el = $('#scan');
    el.dataset.state = kind;
    $('#scan-text').textContent = kind === 'idle' ? '' : t('scan.' + kind);
    $('#scan-note').textContent = note || '';
  }
  const scheduleScan = debounce(runScan, 350);
  async function runScan() {
    if (!last || last.r.error) return;
    const seq = ++scanSeq;
    const { r, payload } = last;
    setScan('checking');
    try {
      const canvas = await rasterize(r.svg, r.width, r.height, 640, '#ffffff');
      if (seq !== scanSeq) return;
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // Zwei Prüfungen: ZXing-C++ (robust, verbreitet) und jsQR (einfacher) –
      // besteht nur ZXing, ist der Code lesbar, aber anspruchsvoll für schwächere Scanner.
      let zx = null, js = null;
      const zxing = await getZXing();
      if (zxing) {
        try {
          const res = await zxing.readBarcodes(data, { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 });
          zx = res.length ? res[0].text : null;
        } catch (e) { zx = undefined; }
      }
      if (window.jsQR) {
        const res = window.jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' });
        js = res ? res.data : null;
      }
      if (seq !== scanSeq) return;
      const okZ = zx === payload, okJ = js === payload;
      let kind;
      if (okZ && okJ) kind = 'ok';
      else if (okZ || okJ) kind = 'hard';
      else if ((zx && zx !== payload) || (js && js !== payload)) kind = 'mismatch';
      else kind = 'fail';
      const mark = (name, v) => name + ' ' + (v === undefined ? '–' : v === payload ? '✓' : '✗');
      setScan(kind, t('scan.note', { engine: [zxing ? mark('ZXing', zx) : 'ZXing –', mark('jsQR', js)].join(', ') }));
    } catch (e) {
      if (seq === scanSeq) setScan('idle');
    }
  }

  let zxingPromise = null;
  function getZXing() {
    if (zxingPromise) return zxingPromise;
    const Z = window.ZXingWASM, b64 = window.ZXING_WASM_B64;
    if (!Z || !b64) return (zxingPromise = Promise.resolve(null));
    const bin = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
    zxingPromise = Promise.resolve(Z.prepareZXingModule({ overrides: { wasmBinary: bin.buffer }, fireImmediately: true }))
      .then(() => Z, () => null);
    return zxingPromise;
  }

  function rasterize(svg, w, hgt, target, bgFill) {
    return new Promise((res, rej) => {
      const k = target / w;
      const c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(hgt * k);
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      img.onload = () => {
        const x = c.getContext('2d');
        if (bgFill) { x.fillStyle = bgFill; x.fillRect(0, 0, c.width, c.height); }
        x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c);
      };
      img.onerror = e => { URL.revokeObjectURL(url); rej(e); };
      img.src = url;
    });
  }

  // ------------------------------------------------------------ Export

  function setExportEnabled(on) { for (const id of ['btn-svg', 'btn-png', 'btn-copy']) $('#' + id).disabled = !on; }
  function baseName() {
    const p = (last && last.payload) || 'qr';
    const slug = p.replace(/^[a-z]+:\/\//i, '').replace(/^(WIFI|SMSTO|mailto|tel):/i, '').replace(/[^a-z0-9äöüß]+/gi, '-')
      .replace(/^-+|-+$/g, '').slice(0, 40).toLowerCase();
    return 'qr-' + (slug || 'code');
  }
  function svgFile() { return '<?xml version="1.0" encoding="UTF-8"?>\n' + last.r.svg; }
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(t('saved', { name }));
  }
  function downloadSVG() {
    if (!last || last.r.error) return;
    saveBlob(new Blob([svgFile()], { type: 'image/svg+xml' }), baseName() + '.svg');
  }
  async function downloadPNG() {
    if (!last || last.r.error) return;
    const r = last.r;
    const c = await rasterize(r.svg, r.width, r.height, r.width, null);
    c.toBlob(b => saveBlob(b, baseName() + '.png'), 'image/png');
  }
  async function copySVG() {
    if (!last || last.r.error) return;
    try { await navigator.clipboard.writeText(svgFile()); toast(t('copied')); } catch (e) { toast(t('copy.failed')); }
  }

  let undoState = null;
  function resetAll() {
    undoState = JSON.parse(JSON.stringify(state));
    state = defaultState();
    state.export = undoState.export;
    changed(true);
    toast(t('tip.reset') + ' ✓', { label: '↶', action: () => { if (undoState) { state = undoState; undoState = null; changed(true); } } });
  }

  let toastTimer;
  function toast(msg, act) {
    const el = $('#toast');
    el.replaceChildren(h('span', { text: msg }));
    if (act) el.append(h('button', { type: 'button', class: 'toast-act', text: act.label, onclick: () => { act.action(); el.hidden = true; } }));
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, act ? 6000 : 2500);
  }

  // ------------------------------------------------------------ Start

  DEMO_IMAGE = makeDemoImage();
  build();
  changed(true);
  // Testschnittstelle (Playwright): Zustand setzen und SVG abholen
  window.QRCApp = {
    presets: PRESETS.map(p => p.id),
    applyPreset(id) { state = presetState(PRESETS.find(p => p.id === id), state); changed(true); },
    setState(patch) { state = QRC.merge(state, patch); changed(true); },
    /** Von den Standardwerten aus (Inhalt bleibt) einen Zustand herstellen. */
    load(patch) { state = presetState({ patch }, state); changed(true); },
    getState() { return JSON.parse(JSON.stringify(state)); },
    current() { return last ? { svg: last.r.svg, payload: last.payload, error: last.r.error, pending: last.r.pending && last.r.pending.length, stats: last.r.stats } : null },
    ready() { return Promise.all([...imgCache.values()]).then(() => { renderPreview(); }); },
    scanState() { return $('#scan').dataset.state; }
  };
})();
