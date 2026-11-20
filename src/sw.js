/* Service Worker - GestioneTralci PWA
 * Garantisce il funzionamento 100% offline su qualsiasi dispositivo (Chromebook, PC, Mac, Tablet, Smartphone).
 */
const CACHE = 'gestione-tralci-pwa-v2.4';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'pwa.js',
  'localDbEngine.js',
  'driveClient.js',
  'printTemplates.js',
  'default-db.json',
  'WIKI.md',
  'logo.png',
  'icon.png',
  'icon-192.png',
  'icon-512.png',
  'qrcode.png',
  'qrcode.svg',
  'qrcode-brand.png',
  'qrcode-flyer.png',
  'favicon.ico',
  'manifest.webmanifest'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(err => {
      console.warn('[SW] Caching shell fallback:', err);
    })
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => (k.startsWith('gestione-tralci-') || k.startsWith('gestionale-tralci-') || k.startsWith('registro-chiesa-')) && k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Richieste esterne (Google APIs, Google Identity, ecc.): sempre direttamente in rete
  if (url.origin !== location.origin) return;

  // Stale-While-Revalidate / Network-First con fallback alla cache per funzionamento offline immediato
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(cached => cached || caches.match('index.html'))
      )
  );
});

