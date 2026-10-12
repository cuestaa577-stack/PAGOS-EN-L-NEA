/* =============================================================================
   sw.js — Service Worker (PWA)
   -----------------------------------------------------------------------------
   Estrategia:
   - App shell (HTML/CSS/JS/iconos/manifest): cache-first con actualización en
     segundo plano (stale-while-revalidate). Permite abrir la app sin conexión.
   - Llamadas a la API (/api/*) y pagos: SIEMPRE a la red (nunca se cachean,
     para no mostrar estados viejos ni datos sensibles).
   ============================================================================= */

const CACHE = 'pagos-v4';
const APP_SHELL = [
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Cachea cada recurso por separado e ignora los que fallen, para que la
      // instalación de la app NUNCA se aborte por un solo archivo faltante.
      Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Nunca cachear la API ni peticiones externas.
  if (url.pathname.includes('/api/') || url.origin !== self.location.origin) {
    return; // deja que el navegador lo maneje directo
  }

  // App shell: cache-first con revalidación.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copia = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copia));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
