/**
 * Muestras Web — Service Worker
 */
const CACHE_NAME = 'muestras-web-v79-fecha-hoy';
const ASSETS = [
  './',
  './index.html',
  './historial.html',
  './packing.html',
  './recomendaciones.html',
  './catalogos.json',
  './icono.png',
  './favicon.ico',
  './favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './styles.css',
  './script.js',
  './network.js',
  './app.js',
  './manifest.json',
  './librerias/lucide.min.js',
  './librerias/sweetalert2.all.min.js',
  './librerias/sweetalert2.min.css',
  './librerias/flatpickr.min.js',
  './librerias/flatpickr.min.css',
  './librerias/flatpickr-l10n-es.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin.includes('script.google.com') || url.origin.includes('googleusercontent.com')) {
    return;
  }
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
