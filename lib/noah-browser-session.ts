import type { ProfileKeys } from './noah-profile-store.ts';

export const NOAH_BROWSER_COOKIE = '__Host-noah_access';
export const NOAH_BROWSER_SESSION_SECONDS = 180 * 24 * 60 * 60;
const encoder = new TextEncoder();
const unauthorized = (): never => { throw Error('UNAUTHORIZED'); };

/** Browser ownership is confined to Noah's customer APIs, never account/admin/payment APIs. */
export function noahBrowserRequestAllowed(request: Request): boolean {
  const path = new URL(request.url).pathname, method = request.method;
  if (method === 'GET' && [
    '/api/noah/intake', '/api/noah/pins', '/api/noah/discover', '/api/noah/shelf', '/api/noah/usage',
    '/api/noah/connect-plan', '/api/noah/library', '/api/noah/invites',
    '/api/noah/agents', '/api/noah/public-catalog', '/api/noah/feed',
  ].includes(path)) return true;
  // Private source intake shares this browser's owner; review/publish/runner APIs remain excluded. Mac grants and user commands have their own explicit routes.
  if (method === 'GET' && path === '/api/noah/drafts') return true;
  if (method === 'POST' && ['/api/noah/import', '/api/noah/agents', '/api/noah/revenue/work'].includes(path)) return true;
  if (['GET', 'POST'].includes(method) && path === '/api/noah/drafts/storage') return true;
  const uploadId = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
  if (['GET', 'PUT', 'DELETE'].includes(method) && new RegExp(`^/api/noah/drafts/${uploadId}$`, 'i').test(path)) return true;
  if (method === 'POST' && new RegExp(`^/api/noah/drafts/${uploadId}/restore$`, 'i').test(path)) return true;
  if (['GET', 'DELETE'].includes(method) && new RegExp(`^/api/noah/agents/${uploadId}$`, 'i').test(path)) return true;
  if (method === 'GET' && new RegExp(`^/api/noah/(drafts|agents)/${uploadId}/source$`, 'i').test(path)) return true;
  if (['GET', 'POST'].includes(method) && [
    '/api/noah/devices', '/api/noah/launch', '/api/noah/session', '/api/noah/connect', '/api/noah/ask', '/api/noah/provider', '/api/noah/profile', '/api/noah/cloud-agents',
    '/api/noah/registration', '/api/noah/registration/browser',
    '/api/noah/data', '/api/noah/feedback', '/api/noah/boards',
  ].includes(path)) return true;
  if (['GET', 'POST'].includes(method) && /^\/api\/noah\/(connect|ask)\/[A-Za-z0-9._:-]{1,160}$/.test(path)) return true;
  if (method === 'GET' && /^\/api\/noah\/connect\/[A-Za-z0-9._:-]{1,160}\/tools$/.test(path)) return true;
  if (method === 'POST' && path === '/api/noah/profile/documents') return true;
  return method === 'GET' && /^\/api\/noah\/profile\/documents\/[A-Za-z0-9._:-]{1,160}$/.test(path);
}

function tokenOf(request: Request): string | null {
  const values = (request.headers.get('cookie') ?? '').split(';').map(v => v.trim())
    .filter(v => v.startsWith(`${NOAH_BROWSER_COOKIE}=`));
  if (!values.length) return null;
  if (values.length !== 1) return unauthorized();
  return values[0].slice(NOAH_BROWSER_COOKIE.length + 1);
}

async function signingKey(secret: string): Promise<CryptoKey> {
  const master = await crypto.subtle.importKey('raw', Uint8Array.from(secret.match(/../g)!, v => parseInt(v, 16)), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('noah-browser-session-v1'), info: encoder.encode('cookie-signing-only') }, master,
    { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify']);
}
const hex = (bytes: Uint8Array) => Array.from(bytes, v => v.toString(16).padStart(2, '0')).join('');
const bytes = (value: string) => Uint8Array.from(value.match(/../g)!, v => parseInt(v, 16));

export function createNoahBrowserSessions(keys: ProfileKeys | null, now = Date.now) {
  async function read(request: Request): Promise<{ owner: string; expires: number } | null> {
    const token = tokenOf(request);
    if (token === null) return null;
    if (!keys) throw Error('AUTH_UNAVAILABLE');
    const match = /^v1\.([a-z0-9_-]{1,24})\.([a-f0-9]{64})\.([0-9]{10})\.([a-f0-9]{64})$/.exec(token);
    if (!match || !Object.hasOwn(keys.keys, match[1])) return unauthorized();
    const [, kid, id, expiry, signature] = match, expires = Number(expiry), seconds = Math.floor(now() / 1000);
    if (expires <= seconds || expires > seconds + NOAH_BROWSER_SESSION_SECONDS + 300) return unauthorized();
    const payload = `noah-browser/1\0${new URL(request.url).origin}\0${kid}\0${id}\0${expiry}`;
    if (!await crypto.subtle.verify('HMAC', await signingKey(keys.keys[kid]), bytes(signature), encoder.encode(payload))) return unauthorized();
    return { owner: `noah-browser:${id}`, expires };
  }
  async function issue(request: Request, owner?: string): Promise<string> {
    if (!keys) throw Error('AUTH_UNAVAILABLE');
    const url = new URL(request.url);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('AUTH_UNAVAILABLE');
    if (owner && !/^noah-browser:[a-f0-9]{64}$/.test(owner)) throw Error('AUTH_UNAVAILABLE');
    const id = owner?.slice('noah-browser:'.length) ?? hex(crypto.getRandomValues(new Uint8Array(32)));
    const kid = keys.active, expires = Math.floor(now() / 1000) + NOAH_BROWSER_SESSION_SECONDS;
    const payload = `noah-browser/1\0${url.origin}\0${kid}\0${id}\0${expires}`;
    const signature = hex(new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(keys.keys[kid]), encoder.encode(payload))));
    return `${NOAH_BROWSER_COOKIE}=v1.${kid}.${id}.${expires}.${signature}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${NOAH_BROWSER_SESSION_SECONDS}`;
  }
  async function authenticate(request: Request): Promise<string> {
    if (!noahBrowserRequestAllowed(request) || request.headers.has('authorization')) return unauthorized();
    if (request.method !== 'GET' && request.headers.get('origin') !== new URL(request.url).origin) throw Error('ORIGIN');
    const session = await read(request);
    return session?.owner ?? unauthorized();
  }
  return { read, issue, authenticate, hasCookie: (request: Request) => tokenOf(request) !== null };
}

export function createNoahBrowserSessionApi(deps: {
  authenticate: (request: Request) => Promise<string>;
  sessions: ReturnType<typeof createNoahBrowserSessions>;
}) {
  return async (request: Request): Promise<Response> => {
    const headers = new Headers({ 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization', 'X-Content-Type-Options': 'nosniff' });
    const json = (body: object, status = 200) => Response.json(body, { status, headers });
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    if (request.method === 'POST' && (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site'))
      return json({ error: 'ORIGIN' }, 403);
    try {
      let owner: string | null = null;
      try { owner = await deps.authenticate(request); }
      catch (error) { if (!(error instanceof Error) || error.message !== 'UNAUTHORIZED') throw error; }
      if (owner) {
        // Renew the same browser owner; never replace an existing account or expose its identity.
        if (request.method === 'POST' && owner.startsWith('noah-browser:')) headers.set('Set-Cookie', await deps.sessions.issue(request, owner));
        return json({ connected: true, created: false });
      }
      if (request.method === 'GET') return json({ connected: false }, 401);
      // A bad/expired capability must not silently orphan stored results by minting a different owner.
      if (deps.sessions.hasCookie(request) || request.headers.has('authorization')) return json({ error: 'SAVED_ACCESS_UNAVAILABLE' }, 409);
      headers.set('Set-Cookie', await deps.sessions.issue(request));
      return json({ connected: true, created: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'ORIGIN' }, 403);
      return json({ error: 'SAVED_ACCESS_UNAVAILABLE' }, 503);
    }
  };
}
