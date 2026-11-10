// Baut dist/qr-coder.html: index.html mit allen Skripten und Styles eingebettet.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, p) => '<style>\n' + read(p) + '\n</style>');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, p) => {
  const js = read(p).replace(/<\/script/gi, '<\\/script');
  return '<script>\n' + js + '\n</script>';
});
const rev = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : 'lokal';
html = html.replace('</title>', '</title>\n<meta name="generator" content="qr-coder ' + rev + '">');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'qr-coder.html'), html);
console.log('dist/qr-coder.html', Math.round(html.length / 1024) + ' kB');

// Variante für claude.ai-Artifacts: ohne doctype/html/head/body (das Gerüst setzt der Dienst).
const head = /<head>([\s\S]*?)<\/head>/.exec(html)[1].replace(/<meta (charset|name="viewport")[^>]*>\n?/g, '');
const body = /<body>([\s\S]*)<\/body>/.exec(html)[1];
fs.writeFileSync(path.join(root, 'dist', 'qr-coder-artifact.html'), head.trim() + '\n' + body.trim() + '\n');
