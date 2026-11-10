# Fremdbibliotheken (unverändert eingebunden)

| Datei | Bibliothek | Version | Lizenz |
|---|---|---|---|
| `qrcode.js` | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (Kazuhiko Arase) | 2.0.4 | MIT (Header in der Datei) |
| `jsQR.js` | [jsQR](https://github.com/cozmo/jsQR) | 1.4.0 | Apache 2.0 (`LICENSE-jsQR.txt`) |

Aus npm kopiert (`node_modules/<paket>/dist/`). Nur die erste Zeile von
`jsQR.js` (Lizenzhinweis) wurde ergänzt. Aktualisieren: Version in
`package.json` anheben, `npm ci`, Dateien neu kopieren, Tests laufen lassen.

"QR Code" ist eine eingetragene Marke der DENSO WAVE INCORPORATED.

| `zxing-reader.js` | [zxing-wasm](https://github.com/Sec-ant/zxing-wasm), Reader-Build (IIFE) | 3.1.6 | MIT (`LICENSE-zxing-wasm.txt`); enthält [ZXing-C++](https://github.com/zxing-cpp/zxing-cpp), Apache 2.0 |
| `zxing-reader-wasm.js` | `zxing_reader.wasm` aus demselben Paket, als Base64 in `window.ZXING_WASM_B64` | 3.1.6 | wie oben |

Die WASM-Datei liegt als Base64 in einer Script-Datei, damit sie auch beim Öffnen per `file://` lädt (dort ist `fetch` gesperrt).
