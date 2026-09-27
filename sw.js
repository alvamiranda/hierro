/* Service worker: deja la app disponible sin conexión (cache-first del "shell"). */
const CACHE = 'hierro-v2';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/util.js', 'js/icons.js', 'js/store.js', 'js/stats.js', 'js/charts.js', 'js/app.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return;
  // red primero (versión más nueva); si no hay conexión o tarda, la copia en caché
  const fromCache = () => caches.match(e.request, { ignoreSearch: true })
    .then(hit => hit || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()));
  const net = fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  });
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500));
  e.respondWith(Promise.race([net, timeout]).catch(fromCache));
});
