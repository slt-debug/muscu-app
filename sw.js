'use strict';
// Cache de l'appli : elle s'ouvre sans réseau. Stratégie "cache d'abord, mise à jour en arrière-plan".
const CACHE = 'muscu-v44';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'program.js', 'library.js', 'catalog.js', 'reminder.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  // cache: 'reload' : on ignore le cache HTTP du navigateur (GitHub Pages en garde 10 min) pour ne pas figer d'anciens fichiers.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  // La page relais Withings n'est jamais mise en cache : son contenu doit toujours être le dernier publié.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin || req.url.includes('withings-callback')) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
