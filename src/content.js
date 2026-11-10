/* QR-Coder – Inhalte (Payload) aus Formularfeldern bauen.
 * Klassisches Script: hängt sich an globalThis.QRC an (auch in Node nutzbar). */
(function (root) {
  'use strict';
  const QRC = root.QRC || (root.QRC = {});

  // WLAN-Format (ZXing "WIFI:"): \ ; , : " werden mit \ maskiert.
  function escWifi(s) {
    return String(s || '').replace(/([\\;,:"])/g, '\\$1');
  }
  // vCard 3.0 (RFC 2426): \ , ; und Zeilenumbruch maskieren.
  function escVcard(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n')
      .replace(/,/g, '\\,').replace(/;/g, '\\;');
  }
  function trim(s) { return String(s || '').trim(); }

  // Annahme: Eingaben wie "example.com/seite" ohne Schema bekommen https://.
  function normalizeUrl(u) {
    u = trim(u);
    if (!u) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
    if (/^[^\s/]+\.[^\s/]+/.test(u)) return 'https://' + u;
    return u;
  }

  const builders = {
    url: f => normalizeUrl(f.url),
    text: f => String(f.text || ''),
    wifi: f => {
      if (!trim(f.ssid)) return '';
      const t = f.auth || 'WPA';
      let s = 'WIFI:T:' + (t === 'nopass' ? 'nopass' : t) + ';S:' + escWifi(f.ssid) + ';';
      if (t !== 'nopass') s += 'P:' + escWifi(f.password) + ';';
      if (f.hidden) s += 'H:true;';
      return s + ';';
    },
    vcard: f => {
      const first = trim(f.firstName), last = trim(f.lastName);
      if (!first && !last && !trim(f.org)) return '';
      const L = ['BEGIN:VCARD', 'VERSION:3.0',
        'N:' + escVcard(last) + ';' + escVcard(first) + ';;;',
        'FN:' + escVcard([first, last].filter(Boolean).join(' ') || trim(f.org))];
      if (trim(f.org)) L.push('ORG:' + escVcard(f.org));
      if (trim(f.title)) L.push('TITLE:' + escVcard(f.title));
      if (trim(f.phone)) L.push('TEL;TYPE=CELL:' + escVcard(f.phone));
      if (trim(f.email)) L.push('EMAIL:' + escVcard(f.email));
      if (trim(f.web)) L.push('URL:' + escVcard(normalizeUrl(f.web)));
      if (trim(f.street) || trim(f.city) || trim(f.zip) || trim(f.country)) {
        L.push('ADR:;;' + [f.street, f.city, '', f.zip, f.country].map(x => escVcard(trim(x))).join(';'));
      }
      L.push('END:VCARD');
      return L.join('\r\n');
    },
    email: f => {
      if (!trim(f.to)) return '';
      const q = [];
      if (trim(f.subject)) q.push('subject=' + encodeURIComponent(f.subject));
      if (trim(f.body)) q.push('body=' + encodeURIComponent(f.body));
      return 'mailto:' + trim(f.to) + (q.length ? '?' + q.join('&') : '');
    },
    tel: f => trim(f.number) ? 'tel:' + trim(f.number).replace(/[^\d+*#]/g, '') : '',
    // SMSTO-Format, wie es ZXing-basierte Scanner erzeugen/verstehen.
    sms: f => trim(f.number) ? 'SMSTO:' + trim(f.number).replace(/[^\d+]/g, '') + ':' + String(f.message || '') : ''
  };

  QRC.buildPayload = function (content) {
    const b = builders[content.type] || builders.text;
    return b((content.fields && content.fields[content.type]) || {});
  };
  QRC.normalizeUrl = normalizeUrl;
  QRC.contentTypes = Object.keys(builders);
})(typeof globalThis !== 'undefined' ? globalThis : this);
