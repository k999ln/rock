const SITE_HOST_SUFFIX = '.chatgpt.site';
const SITE_DISPATCH_PREFIX = 'site---';

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

/** Match the same identity precedence used by requestUser before applying cloud-only scopes. */
export function requestUsesEsimCloudIdentity(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  if (authorization.startsWith('Bearer rock_esim_')) return true;
  if (authorization.startsWith('Bearer rock_session_') || request.headers.get('oai-authenticated-user-id')?.trim()) return false;
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase() ?? '';
  const trustedEmail = new URL(request.url).hostname.endsWith(SITE_HOST_SUFFIX) &&
    (request.headers.get('x-dispatched-app') ?? '').startsWith(SITE_DISPATCH_PREFIX) && validEmail(email);
  return !trustedEmail && Boolean(request.headers.get('cookie')?.includes('rock_esim_access='));
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

  sameOrigin(request);

  const id = request.headers.get('oai-authenticated-user-id')?.trim();
  if (id) {
    if (id.length > 256) throw new Error('UNAUTHORIZED');
    return id;
  }

  const url = new URL(request.url);
  const dispatch = request.headers.get('x-dispatched-app') ?? '';
  const email =
    request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase() ??
    '';
  if (
    !url.hostname.endsWith(SITE_HOST_SUFFIX) ||
    !dispatch.startsWith(SITE_DISPATCH_PREFIX) ||
    !validEmail(email)
  ) {
    if (request.headers.get('cookie')?.includes('rock_esim_access=')) {
      const [{ env }, access] = await Promise.all([import('cloudflare:workers'), import('./esim-cloud-access.ts')]);
      const db = (env as unknown as { DB?: D1Database }).DB;
      if (!db) throw new Error('AUTH_UNAVAILABLE');
      return access.authenticateEsimCloudRequest(request, db, env);
    }
    throw new Error('UNAUTHORIZED');
  }

  return pseudonymousEmailId(email);
}
