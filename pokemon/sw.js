const CACHE = 'pokemon-leo-v8';
const ASSETS = [
  './index.html', './app.js', './sizes.js',
  './lib/refdata.js', './lib/analysis.js', './lib/render.js', './lib/sort.js', './lib/meta/match.js',
  './colecao.json', './manifest.json',
  './data/species.json', './data/moves.json', './data/moves_pt.json',
  './data/pvp_ranks.json', './data/meta.json',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  const isData = url.pathname.endsWith('colecao.json') || url.pathname.includes('/data/');

  if (isHTML || isData) {
    // Network-first: sempre tenta o mais novo; cai no cache se offline.
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }
  // Cache-first para o resto (ícones, libs, etc.)
  e.respondWith(caches.match(req).then(cached => cached || fetch(req)));
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
