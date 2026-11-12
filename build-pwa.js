'use strict';
/**
 * GestionaleTralci PWA - Script di compilazione e pubblicazione
 * Progetto 100% autonomo: compila e copia i sorgenti da /src a /docs (servita da GitHub Pages o server statico).
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'docs');

if (!fs.existsSync(SRC)) {
  console.error('❌ Cartella src non trovata!');
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const files = fs.readdirSync(SRC);
for (const f of files) {
  const srcFile = path.join(SRC, f);
  const destFile = path.join(OUT, f);
  if (fs.statSync(srcFile).isFile()) {
    fs.copyFileSync(srcFile, destFile);
  }
}

// Assicura file .nojekyll per GitHub Pages
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

console.log('✅ PWA generata con successo in /docs (' + fs.readdirSync(OUT).length + ' file):');
fs.readdirSync(OUT).forEach(f => console.log('  -', f));

