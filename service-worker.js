// Service Worker do "Crônicas da Rotina".
// Estratégia: network-first para o HTML (pra você sempre pegar a versão mais nova
// quando estiver online), com fallback pro cache quando estiver offline.
// Os ícones/manifest usam cache-first (eles quase não mudam).

const CACHE_NAME = 'cronicas-da-rotina-v2'; // <- aumente esse número (v2, v3...) toda vez que publicar uma atualização importante
const APP_SHELL = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // Network-first: tenta buscar a versão mais nova; se falhar (offline), usa o cache.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req).then((res) => res || caches.match('./index.html')))
    );
  } else {
    // Cache-first para o resto (ícones, manifest).
    event.respondWith(
      caches.match(req).then((res) => res || fetch(req))
    );
  }
});
