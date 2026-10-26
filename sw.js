// Service worker do Minhas Finanças — modo offline (PWA)
const CACHE = 'financas-v1';
const PRE = ['./', './financas.html', './icon.svg', './manifest.webmanifest',
  './webicons/apple-touch-icon.png', './webicons/icon-192.png',
  './webicons/icon-512.png', './webicons/icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.all(PRE.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro (app sempre atualiza); sem rede, usa o cache
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(r => {
      if (r && r.ok) {
        const rc = r.clone();
        caches.open(CACHE).then(c => c.put(req, rc).catch(() => {}));
      }
      return r;
    }).catch(() =>
      caches.match(req).then(m => m || caches.match('./financas.html'))
    )
  );
});
