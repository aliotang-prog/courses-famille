// Service worker : fonctionnement hors ligne + réception des fichiers partagés (Android).
const CACHE = 'plt-viewer-v1';
const ASSETS = ['./', 'index.html', 'app.js', 'hpgl.js', 'style.css', 'manifest.webmanifest',
  'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'exemple.plt'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'plt-share').map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.pathname.endsWith('/share')) {
    e.respondWith((async () => {
      const form = await req.formData();
      const cache = await caches.open('plt-share');
      let k = 0;
      for (const f of form.getAll('files')) {
        if (!(f instanceof File)) continue;
        await cache.put(`shared-${Date.now()}-${k++}`, new Response(f, { headers: { 'x-name': encodeURIComponent(f.name) } }));
      }
      return Response.redirect(new URL('./?share=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // Réseau d'abord (mises à jour), cache en secours (hors ligne).
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./'))));
});
