const SITE_HOST_SUFFIX = '.chatgpt.site';
const SITE_DISPATCH_PREFIX = 'site---';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const RESERVED_FIXTURE_SUFFIXES = ['.invalid', '.test'];
const TRUSTED_SITES_CUSTOM_HOSTS = new Set([
  'avoado.si',
  'columbia.avoado.si',
]);

function localOrFixtureHost(hostname: string) {
  return LOOPBACK_HOSTS.has(hostname) || RESERVED_FIXTURE_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function sameOrigin(request: Request) {
  if (request.method === 'GET') return;
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin)
    throw new Error('ORIGIN');
}

function validEmail(value: string) {
  return (
    value.length >= 3 &&
    value.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

async function pseudonymousEmailId(email: string) {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `sites-email-sha256:${hex}`;
}

export function configuredLocalDevelopmentUser(
  request: Request,
  configuredId: unknown,
) {
  const host = new URL(request.url).hostname.toLowerCase();
  if (!LOOPBACK_HOSTS.has(host) || typeof configuredId !== 'string') return null;
  const id = configuredId.trim();
  return /^local-preview:[A-Za-z0-9._@-]{1,120}$/.test(id) ? id : null;
}

/** Match the same identity precedence used by requestUser before applying cloud-only scopes. */
export function requestUsesEsimCloudIdentity(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  if (authorization.startsWith('Bearer rock_esim_')) return true;
  if (authorization.startsWith('Bearer rock_session_') || request.headers.get('oai-authenticated-user-id')?.trim() ||
      request.headers.get('cookie')?.includes('jennifer_access=')) return false;
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase() ?? '';
  const trustedEmail = new URL(request.url).hostname.endsWith(SITE_HOST_SUFFIX) &&
    (request.headers.get('x-dispatched-app') ?? '').startsWith(SITE_DISPATCH_PREFIX) && validEmail(email);
  return !trustedEmail && Boolean(request.headers.get('cookie')?.includes('rock_esim_access='));
}

/** Sites identity is retained only as the bootstrap/recovery authority for Jennifer passkeys. */
export async function requestGatewayUser(request: Request): Promise<string> {
  sameOrigin(request);
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(hostname)) {
    // Local API fixtures and development servers have no Sites dispatch layer.
    // This exception never applies to a non-loopback production host.
    const localGatewayId = request.headers.get('oai-authenticated-user-id')?.trim();
    if (localGatewayId && localGatewayId.length <= 256) return localGatewayId;
    const { env } = await import('cloudflare:workers');
    const localUser = configuredLocalDevelopmentUser(
      request,
      (env as unknown as { ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID?: string })
        .ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID,
    );
    if (localUser) return localUser;
  }
  if (RESERVED_FIXTURE_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    const fixtureGatewayId = request.headers.get('oai-authenticated-user-id')?.trim();
    if (fixtureGatewayId && fixtureGatewayId.length <= 256) return fixtureGatewayId;
  }
  const dispatch = request.headers.get('x-dispatched-app') ?? '';
  const generatedSitesHost = hostname.endsWith(SITE_HOST_SUFFIX);
  const customSitesHost = TRUSTED_SITES_CUSTOM_HOSTS.has(hostname);
  if (!customSitesHost && !generatedSitesHost)
    throw new Error('UNAUTHORIZED');
  const id = request.headers.get('oai-authenticated-user-id')?.trim();
  if (id) {
    // The generated Sites hostname is itself a platform-owned dispatch surface.
    // Every custom hostname additionally requires the Sites dispatch marker.
    if (customSitesHost && !dispatch.startsWith(SITE_DISPATCH_PREFIX)) throw new Error('UNAUTHORIZED');
    if (id.length > 256) throw new Error('UNAUTHORIZED');
    return id;
  }
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase() ?? '';
  if (!generatedSitesHost || !dispatch.startsWith(SITE_DISPATCH_PREFIX) || !validEmail(email))
    throw new Error('UNAUTHORIZED');
  return pseudonymousEmailId(email);
}

export async function requestUser(request: Request): Promise<string> {
  const authorization = request.headers.get('authorization') ?? '';
  if (authorization.startsWith('Bearer rock_esim_')) {
    const [{ env }, access] = await Promise.all([import('cloudflare:workers'), import('./esim-cloud-access.ts')]);
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) throw new Error('AUTH_UNAVAILABLE');
    return access.authenticateEsimCloudRequest(request, db, env);
  }
  if (authorization.startsWith('Bearer rock_session_')) {
    const [runtime, sessions] = await Promise.all([
      import('cloudflare:workers'),
      import('./rockstar-device-link.ts'),
    ]);
    const db = (runtime.env as unknown as { DB?: D1Database }).DB;
    if (!db) throw new Error('AUTH_UNAVAILABLE');
    return sessions.rockstarDeviceLinkStore(db).authenticate(
      authorization.slice('Bearer '.length),
    );
  }
  if (request.headers.get('cookie')?.includes('jennifer_access=')) {
    sameOrigin(request);
    const [{ env }, passkeys] = await Promise.all([
      import('cloudflare:workers'), import('./jennifer-passkey.ts'),
    ]);
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) throw new Error('AUTH_UNAVAILABLE');
    try { return await passkeys.jenniferPasskeyStore(db).authenticateSession(request); }
    catch (error) { if (!(error instanceof Error) || error.message !== 'UNAUTHORIZED') throw error; }
  }
  try {
    const gatewayUser = await requestGatewayUser(request);
    const hostname = new URL(request.url).hostname.toLowerCase();
    if (localOrFixtureHost(hostname) || hostname !== 'avoado.si') return gatewayUser;
    const [{ env }, passkeys] = await Promise.all([
      import('cloudflare:workers'), import('./jennifer-passkey.ts'),
    ]);
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) throw new Error('AUTH_UNAVAILABLE');
    // Once this owner opts into Jennifer Access, Sites is recovery-only on the
    // canonical Jennifer host. Other hosts cannot reach Jennifer private APIs.
    if (await passkeys.jenniferPasskeyStore(db).hasCredential(gatewayUser))
      throw new Error('UNAUTHORIZED');
    return gatewayUser;
  }
  catch (error) {
    if (!(error instanceof Error) || !['UNAUTHORIZED', 'ORIGIN'].includes(error.message)) throw error;
    if (error.message === 'ORIGIN') throw error;
  }
  if (request.headers.get('cookie')?.includes('rock_esim_access=')) {
    const [{ env }, access] = await Promise.all([import('cloudflare:workers'), import('./esim-cloud-access.ts')]);
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) throw new Error('AUTH_UNAVAILABLE');
    return access.authenticateEsimCloudRequest(request, db, env);
  }
  throw new Error('UNAUTHORIZED');
}
