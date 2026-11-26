const CACHE_PREFIX = 'noah-offline-';
const CACHE = CACHE_PREFIX + '__OFFLINE_REVISION__';
const OFFLINE_PAGE = '/noah-offline.html';

self.addEventListener('install', (event) => {
  const page = new Request(new URL(OFFLINE_PAGE, self.location.origin), {
    cache: 'reload',
    credentials: 'omit',
    redirect: 'error',
  });
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(page)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    request.mode !== 'navigate' ||
    url.origin !== self.location.origin ||
    (url.pathname !== '/noah' && !url.pathname.startsWith('/noah/')) ||
    url.searchParams.has('_rsc')
  ) return;

  event.respondWith(fetch(request).catch(async () =>
    await caches.match(OFFLINE_PAGE, { cacheName: CACHE }) ?? Response.error(),
  ));
});
