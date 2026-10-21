const MINI_ORIGIN = 'https://avocadomini.noellesugar1.chatgpt.site';
const MINI_PUBLIC_HOST = 'avoado.si';
const COLUMBIA_HOST = 'columbia.avoado.si';
const GENERATED_SITE_SUFFIX = '.chatgpt.site';

const JENNIFER_PRIVATE_API_PREFIXES = [
  '/api/jennifer',
  '/api/amc',
  '/api/jobs',
  '/api/work-jobs',
  '/api/runs',
  '/api/operations',
  '/api/agent-control-plane',
  '/api/sky/a2a-delegations',
];

const SKY_PREFIXES = [
  '/_next',
  '/api',
  '/activity',
  '/chat',
  '/coconala-team',
  '/connect',
  '/csv',
  '/fitness',
  '/fund',
  '/income',
  '/market',
  '/os',
  '/polymarket',
  '/settings',
  '/sky',
  '/studio',
  '/wallet',
  '/work',
  '/zema',
  '/manifest.webmanifest',
  '/rock-icon-',
  '/loop-icon-',
  '/toolkits',
];

const isPath = (path, prefix) =>
  path === prefix || path.startsWith(`${prefix}/`);
const usesCanonicalSkyPrefix = (hostname) =>
  hostname === MINI_PUBLIC_HOST || hostname.endsWith(`.${MINI_PUBLIC_HOST}`);
const isJenniferPrivateApi = (path) =>
  JENNIFER_PRIVATE_API_PREFIXES.some((prefix) => isPath(path, prefix));
const isJenniferPrivateUi = (path) =>
  isPath(path, '/chat') || isPath(path, '/work') || isPath(path, '/zema');

function canonicalPrivateResponse(source) {
  return Response.json({
    error: 'canonical_origin_required',
    canonicalOrigin: MINI_PUBLIC_HOST,
    path: source.pathname,
  }, {
    status: 409,
    headers: { 'cache-control': 'no-store' },
  });
}

function columbiaSkyDestination(source) {
  if (source.hostname !== COLUMBIA_HOST) return null;
  const path = source.pathname;
  const campusHome = isPath(path, '/os/sky/campus/columbia');
  const localCard = /^\/os\/sky\/tools\/(mr-citations|rockstar-amc|rockstar-patent-assistant)$/.test(path)
    && source.searchParams.get('entry') === 'columbia-card';
  if (campusHome || localCard) return null;
  if (!isPath(path, '/os/sky') && !isPath(path, '/chat') &&
      !isPath(path, '/work') && !isPath(path, '/zema') &&
      path !== '/signin-with-chatgpt') return null;
  const destination = new URL(source);
  destination.hostname = MINI_PUBLIC_HOST;
  return destination.href;
}

export function routesToSky(path) {
  if (isPath(path, '/api/preorders') || isPath(path, '/api/admin'))
    return false;
  if (path === '/sw.js') return true;
  return SKY_PREFIXES.some((prefix) =>
    prefix.endsWith('-') ? path.startsWith(prefix) : isPath(path, prefix),
  );
}

async function proxyMini(request, upstreamFetch) {
  const source = new URL(request.url);
  const destination = new URL(
    `${source.pathname}${source.search}`,
    MINI_ORIGIN,
  );
  const headers = new Headers(request.headers);
  for (const name of [
    'host',
    'cookie',
    'oai-authenticated-user-id',
    'oai-authenticated-user-email',
    'oai-authenticated-user-full-name',
    'x-dispatched-app',
  ])
    headers.delete(name);

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    const webhook = source.pathname === '/api/preorders/webhook';
    if ((!origin && !webhook) || (origin && origin !== source.origin))
      return Response.json({ error: 'invalid_origin' }, { status: 403 });
    if (origin) headers.set('origin', MINI_ORIGIN);
  }

  const upstream = await upstreamFetch(
    new Request(destination, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
      ...(request.body ? { duplex: 'half' } : {}),
    }),
  );
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

async function canonicalManifest(response, path) {
  if (!response.headers.get('content-type')?.includes('text/html'))
    return response;
  const campus = path.match(
    /^\/os\/sky\/campus\/(nyu|fit|columbia|fordham|johnjay)(?:\/|$)/,
  );
  const manifest = campus
    ? `/os/sky/campus/${campus[1]}/manifest.webmanifest`
    : isPath(path, '/os/sky')
      ? '/os/sky/manifest.webmanifest'
      : '/os/manifest.webmanifest';
  const html = await response.text();
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('etag');
  return new Response(
    html.replaceAll('href="/manifest.webmanifest"', `href="${manifest}"`),
    {
      status: response.status,
      statusText: response.statusText,
      headers,
    },
  );
}

export function withMiniSite(skyWorker, upstreamFetch = fetch) {
  return {
    fetch(request, env, context) {
      const source = new URL(request.url);
      const path = source.pathname;
      if (source.hostname.endsWith(GENERATED_SITE_SUFFIX) &&
          (isJenniferPrivateUi(path) || isJenniferPrivateApi(path))) {
        if (['GET', 'HEAD'].includes(request.method) && isJenniferPrivateUi(path)) {
          source.hostname = MINI_PUBLIC_HOST;
          source.protocol = 'https:';
          source.port = '';
          return Response.redirect(source.href, 307);
        }
        return canonicalPrivateResponse(source);
      }
      if (source.hostname === COLUMBIA_HOST && isJenniferPrivateApi(path))
        return canonicalPrivateResponse(source);
      const columbiaDestination = columbiaSkyDestination(source);
      if (columbiaDestination && ['GET', 'HEAD'].includes(request.method))
        return Response.redirect(columbiaDestination, 307);
      if (usesCanonicalSkyPrefix(source.hostname) && isPath(path, '/sky')) {
        source.pathname = `/os${path}`;
        return Response.redirect(source.href, 308);
      }
      if (usesCanonicalSkyPrefix(source.hostname) && isPath(path, '/os/sky')) {
        source.pathname = path.slice(3);
        return Promise.resolve(
          skyWorker.fetch(new Request(source, request), env, context),
        ).then((response) => canonicalManifest(response, path));
      }
      if (source.hostname !== MINI_PUBLIC_HOST)
        return skyWorker.fetch(request, env, context);
      if (path === '/sw.js')
        return new Response(
          'self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));',
          {
            headers: {
              'content-type': 'application/javascript; charset=utf-8',
              'cache-control': 'no-store',
            },
          },
        );
      if (path === '/os')
        return Promise.resolve(skyWorker.fetch(request, env, context)).then(
          (response) => canonicalManifest(response, path),
        );
      return routesToSky(path)
        ? skyWorker.fetch(request, env, context)
        : proxyMini(request, upstreamFetch);
    },
    scheduled(event, env, context) {
      return skyWorker.scheduled?.(event, env, context);
    },
  };
}
