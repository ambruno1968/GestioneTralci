'use strict';
// Server statico minimo per provare GestioneTralci PWA sul PC in locale: http://localhost:5210
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'docs');
const PORT = process.env.PORT || 5210;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const f = path.join(root, path.normalize(p));

  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 Not Found');
  }

  const ext = path.extname(f).toLowerCase();
  res.writeHead(200, {
    'Content-Type': types[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache'
  });
  fs.createReadStream(f).pipe(res);
});

server.listen(PORT, () => {
  console.log(`\n⛪ GestioneTralci PWA attivo su: http://localhost:${PORT}`);
  console.log('Premi CTRL+C per arrestare il server locale.\n');
});

