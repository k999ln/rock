const CACHE = 'loop-app-v3';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('loop-app-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/signin') ||
    url.pathname.startsWith('/signout') ||
    url.searchParams.has('_rsc')
  )
    return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (
          response.ok &&
          !response.redirected &&
          !(response.headers.get('Cache-Control') || '').match(/no-store|private/i) &&
          ((request.mode === 'navigate' &&
            url.pathname === '/' &&
            !url.search) ||
            url.pathname.startsWith('/_next/static/') ||
            url.pathname.startsWith('/assets/') ||
            url.pathname.startsWith('/loop-icon-') ||
            url.pathname.startsWith('/rock-icon-'))
        ) {
          const copy = response.clone();
          event.waitUntil(
            caches
              .open(CACHE)
              .then((cache) => cache.put(request, copy))
              .catch(() => {}),
          );
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || Response.error()),
      ),
  );
});
