const CACHE_NAME = 'quickmemo-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './lib/auth.js',
  './lib/drive.js',
  './lib/gemini.js',
  './lib/storage.js',
  './lib/offline.js',
  './lib/i18n.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // API calls: network only
  if (e.request.url.includes('googleapis.com') || e.request.url.includes('generativelanguage.googleapis.com')) {
    return;
  }

  // App assets: cache first, fallback to network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      });
    })
  );
});
