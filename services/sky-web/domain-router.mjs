const MINI_ORIGIN = 'https://avocadomini.noellesugar1.chatgpt.site';

const SKY_PREFIXES = [
  '/_next', '/api', '/activity', '/chat', '/coconala-team', '/csv', '/fitness',
  '/fund', '/income', '/market', '/os', '/polymarket', '/settings', '/sky', '/studio',
  '/wallet', '/work', '/zema', '/rock-icon-', '/loop-icon-', '/toolkits',
];

const isPath = (path, prefix) => path === prefix || path.startsWith(`${prefix}/`);

export function routesToSky(path) {
  if (isPath(path, '/api/preorders') || isPath(path, '/api/admin')) return false;
  if (path === '/sw.js') return true;
  return SKY_PREFIXES.some((prefix) => prefix.endsWith('-')
    ? path.startsWith(prefix)
    : isPath(path, prefix));
}

async function proxyMini(request, upstreamFetch) {
  const source = new URL(request.url);
  const destination = new URL(`${source.pathname}${source.search}`, MINI_ORIGIN);
  const headers = new Headers(request.headers);
  for (const name of [
    'host', 'cookie', 'oai-authenticated-user-id', 'oai-authenticated-user-email',
    'oai-authenticated-user-full-name', 'x-dispatched-app',
  ]) headers.delete(name);

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    const webhook = source.pathname === '/api/preorders/webhook';
    if ((!origin && !webhook) || (origin && origin !== source.origin))
      return Response.json({ error: 'invalid_origin' }, { status: 403 });
    if (origin) headers.set('origin', MINI_ORIGIN);
  }

  const upstream = await upstreamFetch(new Request(destination, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
    ...(request.body ? { duplex: 'half' } : {}),
  }));
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('set-cookie');
  const location = responseHeaders.get('location');
  if (location) {
    const redirect = new URL(location, MINI_ORIGIN);
    if (redirect.origin === MINI_ORIGIN) {
      redirect.protocol = source.protocol;
      redirect.host = source.host;
      responseHeaders.set('location', redirect.href);
    }
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export function withMiniSite(skyWorker, upstreamFetch = fetch) {
  return {
    fetch(request, env, context) {
      const source = new URL(request.url);
      const path = source.pathname;
      if (source.hostname === 'avoado.si' && isPath(path, '/sky')) {
        source.pathname = `/os${path}`;
        return Response.redirect(source.href, 308);
      }
      if (source.hostname === 'avoado.si' && isPath(path, '/os/sky')) {
        source.pathname = path.slice(3);
        return skyWorker.fetch(new Request(source, request), env, context);
      }
      if (path === '/sw.js' && source.hostname === 'avoado.si')
        return new Response('self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));', {
          headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' },
        });
      return routesToSky(path)
        ? skyWorker.fetch(request, env, context)
        : proxyMini(request, upstreamFetch);
    },
    scheduled(event, env, context) {
      return skyWorker.scheduled?.(event, env, context);
    },
  };
}
