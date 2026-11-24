// PaperKit service worker: makes Kit work offline and receives files shared from other apps.
const V = 'pk-v2';
const CORE = [
  '/', '/assets/app.css?v=2', '/assets/app.js?v=2', '/assets/kit.js', '/assets/engine.js', '/assets/tools.js',
  '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png',
  '/vendor/pdf-lib.min.js', '/vendor/pdfjs/pdf.min.mjs', '/vendor/pdfjs/pdf.worker.min.mjs',
  '/vendor/qpdf/qpdf.js', '/vendor/qpdf/qpdf.wasm', '/vendor/heic2any.min.js',
  '/vendor/tesseract/tesseract.min.js', '/vendor/tesseract/worker.min.js',
  '/vendor/fonts/bricolage-grotesque-latin-wght-normal.woff2',
  '/vendor/fonts/jetbrains-mono-latin-500-normal.woff2', '/vendor/fonts/jetbrains-mono-latin-700-normal.woff2',
];
const KEEP = [V, 'pk-share', 'pk-runtime'];

self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function receiveShare(req) {
  const form = await req.formData();
  const files = form.getAll('files').filter(f => f && typeof f !== 'string');
  const cache = await caches.open('pk-share');
  for (const k of await cache.keys()) await cache.delete(k);
  await Promise.all(files.map((f, i) => cache.put(new Request(`/__shared/${i}`), new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name || `shared-${i + 1}`) } }))));
  return Response.redirect('/?shared=1', 303);
}

// app code: fresh from the network when online, cached copy when offline
async function networkFirst(req, key = req) {
  const cache = await caches.open(V);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch { return (await cache.match(key)) || new Response('Offline', { status: 503 }); }
}
// libraries: big and rarely change, so cache first
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = (await cache.match(req)) || (await caches.match(req));
  if (hit) return hit;
  const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res;
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method === 'POST' && url.origin === location.origin && url.pathname === '/share') { e.respondWith(receiveShare(req)); return; }
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) {
    if (req.mode === 'navigate') { e.respondWith(networkFirst(new Request('/'), '/')); return; }
    if (url.pathname.startsWith('/__shared/')) return;
    e.respondWith(url.pathname.startsWith('/vendor/') ? cacheFirst(req, 'pk-runtime') : networkFirst(req));
    return;
  }
  if (url.hostname === 'cdn.jsdelivr.net') e.respondWith(caches.open('pk-runtime').then(async c => (await c.match(req)) || fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; })));
});
