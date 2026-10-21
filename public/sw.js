const CACHE = 'rockstaros-shell-v4';
const CACHE_PREFIXES = ['rockstaros-shell-', 'loop-app-'];
self.addEventListener('message', (event) => {
  if (
    event.origin !== self.location.origin ||
    event.data?.type !== 'ROCKSTAROS_ACTIVATE_UPDATE' ||
    event.source?.type !== 'window' ||
    typeof event.source.id !== 'string' ||
    !event.source.id
  )
    return;

  // A waiting worker can receive the update request from a page controlled by
  // the previous worker. Resolve the sender without requiring this controller.
  event.waitUntil(
    self.clients
      .get(event.source.id)
      .then((client) => {
        if (
          client?.type !== 'window' ||
          new URL(client.url).origin !== self.location.origin
        )
          return;
        return self.skipWaiting();
      })
      // A closed client, failed lookup or invalid URL cannot authorize activation.
      .catch(() => {}),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
                key !== CACHE,
            )
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
