/** Owner OAuth only. No cookie export, browser scripting, app-only token or undocumented X endpoints. */
import { xRetryAt } from './sky-x-feed.ts';
export const X_ACCOUNT_CONSENT = 'x-account-read-v1';
const SCOPES = 'tweet.read users.read offline.access',
  TTL = 15 * 60_000,
  STATE_TTL = 10 * 60_000;
type Db = Pick<D1Database, 'prepare' | 'batch'>;
type Env = Record<string, unknown>;
export type XAccountPost = {
  id: string;
  text: string;
  author: string;
  name: string;
  createdAt: string;
  url: string;
  protected: boolean;
};
type Config = {
  clientId: string;
  clientSecret: string;
  callback: string;
  key: string;
  daily: number;
};
type Account = {
  owner_id: string;
  remote_id: string | null;
  username: string | null;
  display_name: string | null;
  tokens: string | null;
  cache: string | null;
  status: string;
  revision: number;
  fetched_at: number;
  next_refresh_at: number;
  retry_at: number;
  lease_id: string | null;
  lease_until: number;
  window_day: string;
  request_count: number;
  error_code: string | null;
};
type Tokens = { access: string; refresh: string; expiresAt: number };
export class XAccountError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAt: number;
  constructor(code: string, status = 400, retryAt = 0) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryAt = retryAt;
  }
}
const stringValue = (value: unknown) =>
  typeof value === 'string' ? value : '';
export function xAccountConfig(
  env: Env,
  origin: string,
): { config: Config | null; missing: string[] } {
  const missing: string[] = [];
  const clientId = stringValue(env.SKY_X_OAUTH_CLIENT_ID),
    clientSecret = stringValue(env.SKY_X_OAUTH_CLIENT_SECRET),
    callback = stringValue(env.SKY_X_OAUTH_CALLBACK_URL),
    key = stringValue(env.SKY_X_ACCOUNT_KEY),
    daily = Number(env.SKY_X_USER_READS_PER_DAY);
  if (!/^[A-Za-z0-9._~-]{8,256}$/.test(clientId)) missing.push('client');
  if (
    !clientSecret ||
    clientSecret.length > 1024 ||
    /[\r\n]/.test(clientSecret)
  )
    missing.push('client_secret');
  try {
    const u = new URL(callback);
    if (
      u.origin !== origin ||
      u.pathname !== '/api/sky/x-account/callback' ||
      u.search ||
      u.hash ||
      (u.protocol !== 'https:' &&
        !['127.0.0.1', 'localhost'].includes(u.hostname))
    )
      throw Error();
  } catch {
    missing.push('callback');
  }
  if (!/^[a-f0-9]{64}$/i.test(key)) missing.push('encryption');
  if (
    env.SKY_X_USER_READ_APPROVED !== '1' ||
    !Number.isSafeInteger(daily) ||
    daily < 1 ||
    daily > 100
  )
    missing.push('approved_read_budget');
  return {
    config: missing.length
      ? null
      : { clientId, clientSecret, callback, key, daily },
    missing,
  };
}
const enc = new TextEncoder(),
  dec = new TextDecoder();
const b64 = (a: Uint8Array) => {
  let out = '';
  for (let i = 0; i < a.length; i += 8192)
    out += String.fromCharCode(...a.subarray(i, i + 8192));
  return btoa(out).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const bytes = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
    c.charCodeAt(0),
  );
const buffer = (v: Uint8Array) =>
  v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
async function digest(s: string) {
  return b64(
    new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))),
  );
}
function random() {
  return b64(crypto.getRandomValues(new Uint8Array(32)));
}
export function xAccountCipher(hex: string, owner: string) {
  if (!/^[a-f0-9]{64}$/i.test(hex))
    throw new XAccountError('setup-required', 503);
  const raw = Uint8Array.from(hex.match(/../g)!, (v) => parseInt(v, 16));
  const derived = (async () => {
    const k = await crypto.subtle.importKey('raw', buffer(raw), 'HKDF', false, [
      'deriveKey',
    ]);
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: enc.encode(owner),
        info: enc.encode('rockstar-x-account-v1'),
      },
      k,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  })();
  return {
    async seal(value: unknown, scope: string) {
      const iv = crypto.getRandomValues(new Uint8Array(12)),
        cipher = await crypto.subtle.encrypt(
          {
            name: 'AES-GCM',
            iv,
            additionalData: enc.encode(`${owner}\0${scope}`),
          },
          await derived,
          enc.encode(JSON.stringify(value)),
        );
      return JSON.stringify({
        v: 1,
        iv: b64(iv),
        cipher: b64(new Uint8Array(cipher)),
      });
    },
    async open<T>(text: string, scope: string): Promise<T> {
      try {
        const v = JSON.parse(text);
        if (v.v !== 1) throw Error();
        return JSON.parse(
          dec.decode(
            await crypto.subtle.decrypt(
              {
                name: 'AES-GCM',
                iv: buffer(bytes(v.iv)),
                additionalData: enc.encode(`${owner}\0${scope}`),
              },
              await derived,
              buffer(bytes(v.cipher)),
            ),
          ),
        );
      } catch {
        throw new XAccountError('key-unavailable', 503);
      }
    },
  };
}
export function parseXAccountPosts(raw: unknown): XAccountPost[] {
  if (!raw || typeof raw !== 'object')
    throw new XAccountError('invalid-response', 503);
  const v = raw as {
    data?: unknown;
    meta?: { result_count?: unknown };
    includes?: { users?: unknown };
  };
  if (!Array.isArray(v.data)) {
    if (v.meta?.result_count === 0) return [];
    throw new XAccountError('invalid-response', 503);
  }
  const authors = new Map<string, Record<string, unknown>>();
  if (Array.isArray(v.includes?.users))
    for (const u of v.includes.users) {
      if (
        u &&
        typeof u === 'object' &&
        typeof u.id === 'string' &&
        /^[A-Za-z0-9_]{1,15}$/.test(u.username)
      )
        authors.set(u.id, u);
    }
  const posts: XAccountPost[] = [];
  const seen = new Set<string>();
  for (const p of v.data.slice(0, 20)) {
    if (
      !p ||
      typeof p !== 'object' ||
      typeof p.id !== 'string' ||
      !/^\d{1,25}$/.test(p.id) ||
      typeof p.text !== 'string' ||
      !p.text ||
      typeof p.created_at !== 'string' ||
      !Number.isFinite(Date.parse(p.created_at))
    )
      continue;
    const a = authors.get(p.author_id);
    if (!a || typeof a.protected !== 'boolean' || seen.has(p.id)) continue;
    seen.add(p.id);
    posts.push({
      id: p.id,
      text: p.text.slice(0, 10000),
      author: stringValue(a.username),
      name: (stringValue(a.name) || stringValue(a.username)).slice(0, 100),
      createdAt: new Date(p.created_at).toISOString(),
      url: `https://x.com/${stringValue(a.username)}/status/${p.id}`,
      protected: a.protected === true,
    });
  }
  if (v.data.length && !posts.length)
    throw new XAccountError('invalid-response', 503);
  return posts;
}
async function boundedJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new XAccountError('invalid-response', 503);
  let n = 0,
    body = '';
  try {
    while (true) {
      const v = await reader.read();
      if (v.done) break;
      n += v.value.length;
      if (n > 256000) {
        await reader.cancel();
        throw new XAccountError('response-too-large', 503);
      }
      body += dec.decode(v.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(body + dec.decode()) as Record<string, unknown>;
  } catch {
    throw new XAccountError('invalid-response', 503);
  }
}
export function xAccountService(
  db: Db,
  owner: string,
  env: Env,
  origin: string,
  fetcher: typeof fetch = fetch,
  clock = Date.now,
) {
  const settings = xAccountConfig(env, origin),
    config = settings.config,
    cipher = config ? xAccountCipher(config.key, owner) : null;
  const row = () =>
    db
      .prepare('SELECT * FROM sky_x_accounts WHERE owner_id=?')
      .bind(owner)
      .first<Account>();
  const ensure = () =>
    db
      .prepare(
        'INSERT INTO sky_x_accounts(owner_id) VALUES(?) ON CONFLICT(owner_id) DO NOTHING',
      )
      .bind(owner)
      .run();
  function ready() {
    if (!config || !cipher) throw new XAccountError('setup-required', 503);
    return { ...config, cipher };
  }
  async function status() {
    const a = await row();
    let posts: XAccountPost[] = [];
    if (
      a?.status === 'connected' &&
      a.cache &&
      config &&
      clock() - a.fetched_at < TTL
    ) {
      posts = await ready().cipher.open<XAccountPost[]>(
        a.cache,
        `feed:${a.remote_id}`,
      );
    }
    return {
      configured: !!config,
      setupRequired: !config,
      missing: settings.missing,
      connected: a?.status === 'connected' && !!a.tokens,
      account: a?.remote_id
        ? { username: a.username, name: a.display_name }
        : null,
      status: a?.status ?? 'disconnected',
      revision: a?.revision ?? 0,
      posts,
      fetchedAt: a?.fetched_at ?? 0,
      retryAt: Math.max(a?.retry_at ?? 0, a?.next_refresh_at ?? 0),
      error: a?.error_code ?? null,
      source: 'following' as const,
      xForYouAvailable: false,
      readsUsedToday:
        a?.window_day === new Date(clock()).toISOString().slice(0, 10)
          ? a.request_count
          : 0,
      dailyReadLimit: config?.daily ?? 0,
    };
  }
  async function reserve() {
    const c = ready(),
      now = clock(),
      day = new Date(now).toISOString().slice(0, 10);
    await ensure();
    const a = await db
      .prepare(
        'UPDATE sky_x_accounts SET window_day=?,request_count=CASE WHEN window_day=? THEN request_count+1 ELSE 1 END WHERE owner_id=? AND (window_day<>? OR request_count<?)',
      )
      .bind(day, day, owner, day, c.daily)
      .run();
    if (a.meta.changes !== 1)
      throw new XAccountError(
        'read-budget-exhausted',
        429,
        Date.parse(day) + 86400000,
      );
    const global = '__oauth_user_reads__';
    await db
      .prepare(
        'INSERT INTO sky_x_feed_state(key) VALUES(?) ON CONFLICT(key) DO NOTHING',
      )
      .bind(global)
      .run();
    const g = await db
      .prepare(
        'UPDATE sky_x_feed_state SET window_day=?,request_count=CASE WHEN window_day=? THEN request_count+1 ELSE 1 END WHERE key=? AND retry_after<=? AND (window_day<>? OR request_count<?)',
      )
      .bind(day, day, global, now, day, c.daily)
      .run();
    if (g.meta.changes !== 1) {
      const gRow = await db
        .prepare('SELECT retry_after FROM sky_x_feed_state WHERE key=?')
        .bind(global)
        .first<{ retry_after: number }>();
      throw new XAccountError(
        'read-budget-exhausted',
        429,
        Math.max(Date.parse(day) + 86400000, gRow?.retry_after ?? 0),
      );
    }
  }
  async function api(path: string, token: string) {
    let r: Response;
    try {
      r = await fetcher(`https://api.x.com${path}`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new XAccountError('upstream-unavailable', 503, clock() + TTL);
    }
    if (r.status === 429) {
      const until = xRetryAt(r.headers, clock());
      await db
        .prepare(
          'UPDATE sky_x_feed_state SET retry_after=MAX(retry_after,?) WHERE key=?',
        )
        .bind(until, '__oauth_user_reads__')
        .run();
      throw new XAccountError('rate-limited', 429, until);
    }
    if (!r.ok)
      throw new XAccountError(
        r.status === 401 || r.status === 403
          ? 'reconnect-required'
          : r.status === 402
            ? 'provider-budget-required'
            : 'upstream-unavailable',
        r.status === 401 || r.status === 403 ? 401 : 503,
        clock() + TTL,
      );
    return boundedJson(r);
  }
  async function tokenRequest(params: URLSearchParams) {
    const c = ready();
    let r: Response;
    try {
      r = await fetcher('https://api.x.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${btoa(`${encodeURIComponent(c.clientId)}:${encodeURIComponent(c.clientSecret)}`)}`,
        },
        body: params.toString(),
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new XAccountError('reconnect-required', 401);
    }
    if (!r.ok) throw new XAccountError('reconnect-required', 401);
    const v = await boundedJson(r);
    if (
      typeof v.access_token !== 'string' ||
      v.access_token.length < 12 ||
      v.access_token.length > 8192 ||
      typeof v.refresh_token !== 'string' ||
      v.refresh_token.length < 12 ||
      v.refresh_token.length > 8192 ||
      stringValue(v.token_type).toLowerCase() !== 'bearer' ||
      typeof v.expires_in !== 'number' ||
      v.expires_in < 60 ||
      v.expires_in > 86400 ||
      typeof v.scope !== 'string' ||
      !SCOPES.split(' ').every((s) =>
        (v.scope as string).split(' ').includes(s),
      ) ||
      (v.scope as string)
        .split(' ')
        .some((scope) => !SCOPES.split(' ').includes(scope)) ||
      Object.values(v).some((t) => typeof t === 'string' && /[\r\n]/.test(t))
    )
      throw new XAccountError('invalid-token-response', 503);
    return {
      access: v.access_token,
      refresh: v.refresh_token,
      expiresAt: clock() + v.expires_in * 1000,
    } satisfies Tokens;
  }
  async function begin(consent: unknown) {
    const c = ready();
    if (consent !== X_ACCOUNT_CONSENT)
      throw new XAccountError('consent-required');
    await ensure();
    const a = (await row())!;
    const state = random(),
      verifier = random(),
      binding = random(),
      hash = await digest(state),
      cookieHash = await digest(binding);
    await db
      .prepare(
        'DELETE FROM sky_x_oauth_states WHERE expires_at<? OR owner_id=?',
      )
      .bind(clock(), owner)
      .run();
    await db
      .prepare(
        'INSERT INTO sky_x_oauth_states(state_hash,owner_id,cookie_hash,verifier,account_revision,expires_at) VALUES(?,?,?,?,?,?)',
      )
      .bind(
        hash,
        owner,
        cookieHash,
        await c.cipher.seal(verifier, `state:${hash}`),
        a.revision,
        clock() + STATE_TTL,
      )
      .run();
    const url = new URL('https://x.com/i/oauth2/authorize');
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: c.clientId,
      redirect_uri: c.callback,
      scope: SCOPES,
      state,
      code_challenge: await digest(verifier),
      code_challenge_method: 'S256',
    }).toString();
    return { authorizeUrl: url.toString(), binding };
  }
  async function callback(state: string, code: string, binding: string) {
    const c = ready();
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      !/^[A-Za-z0-9_-]{43}$/.test(binding) ||
      !code ||
      code.length > 2048
    )
      throw new XAccountError('invalid-state');
    const hash = await digest(state);
    const st = await db
      .prepare(
        'SELECT * FROM sky_x_oauth_states WHERE state_hash=? AND owner_id=? AND cookie_hash=? AND expires_at>? AND used_at=0',
      )
      .bind(hash, owner, await digest(binding), clock())
      .first<{ verifier: string; account_revision: number }>();
    if (!st) throw new XAccountError('invalid-state');
    const used = await db
      .prepare(
        'UPDATE sky_x_oauth_states SET used_at=? WHERE state_hash=? AND owner_id=? AND used_at=0 AND expires_at>?',
      )
      .bind(clock(), hash, owner, clock())
      .run();
    if (used.meta.changes !== 1) throw new XAccountError('invalid-state');
    const a = await row();
    if (!a || a.revision !== st.account_revision)
      throw new XAccountError('connection-changed', 409);
    await reserve();
    const verifier = await c.cipher.open<string>(st.verifier, `state:${hash}`);
    const tokens = await tokenRequest(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: c.callback,
        code_verifier: verifier,
      }),
    );
    const me = await api(
      '/2/users/me?user.fields=name,username',
      tokens.access,
    );
    const u = me.data as Record<string, unknown> | undefined;
    if (
      !u ||
      typeof u.id !== 'string' ||
      !/^\d{1,25}$/.test(u.id) ||
      typeof u.username !== 'string' ||
      !/^[A-Za-z0-9_]{1,15}$/.test(u.username)
    )
      throw new XAccountError('invalid-account', 503);
    const saved = await db
      .prepare(
        "UPDATE sky_x_accounts SET remote_id=?,username=?,display_name=?,tokens=?,cache=NULL,status='connected',revision=revision+1,fetched_at=0,next_refresh_at=0,retry_at=0,error_code=NULL,lease_id=NULL,lease_until=0 WHERE owner_id=? AND revision=?",
      )
      .bind(
        u.id,
        u.username,
        (stringValue(u.name) || u.username).slice(0, 100),
        await c.cipher.seal(tokens, `tokens:${u.id}`),
        owner,
        a.revision,
      )
      .run();
    if (saved.meta.changes !== 1)
      throw new XAccountError('connection-changed', 409);
    return status();
  }
  async function refresh() {
    const c = ready();
    const a = await row(),
      now = clock();
    if (!a || a.status !== 'connected' || !a.tokens)
      throw new XAccountError('reconnect-required', 401);
    if (a.retry_at > now || a.next_refresh_at > now) return status();
    const lease = crypto.randomUUID();
    const acquired = await db
      .prepare(
        "UPDATE sky_x_accounts SET lease_id=?,lease_until=? WHERE owner_id=? AND revision=? AND status='connected' AND lease_until<=? AND retry_at<=? AND next_refresh_at<=?",
      )
      .bind(lease, now + 60000, owner, a.revision, now, now, now)
      .run();
    if (acquired.meta.changes !== 1) return status();
    try {
      let tokens = await c.cipher.open<Tokens>(
        a.tokens,
        `tokens:${a.remote_id}`,
      );
      if (tokens.expiresAt < now + 60000) {
        tokens = await tokenRequest(
          new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: tokens.refresh,
          }),
        );
        const rotated = await db
          .prepare(
            "UPDATE sky_x_accounts SET tokens=? WHERE owner_id=? AND revision=? AND lease_id=? AND status='connected'",
          )
          .bind(
            await c.cipher.seal(tokens, `tokens:${a.remote_id}`),
            owner,
            a.revision,
            lease,
          )
          .run();
        if (rotated.meta.changes !== 1)
          throw new XAccountError('connection-changed', 409);
      }
      const active = await db
        .prepare(
          "SELECT revision FROM sky_x_accounts WHERE owner_id=? AND revision=? AND lease_id=? AND status='connected'",
        )
        .bind(owner, a.revision, lease)
        .first();
      if (!active) throw new XAccountError('connection-changed', 409);
      await reserve();
      const permitted = await db
        .prepare(
          "SELECT revision FROM sky_x_accounts WHERE owner_id=? AND revision=? AND lease_id=? AND status='connected'",
        )
        .bind(owner, a.revision, lease)
        .first();
      if (!permitted) throw new XAccountError('connection-changed', 409);
      const params = new URLSearchParams({
        max_results: '10',
        'tweet.fields': 'created_at,author_id',
        expansions: 'author_id',
        'user.fields': 'name,username,protected',
      });
      const posts = parseXAccountPosts(
        await api(
          `/2/users/${a.remote_id}/timelines/reverse_chronological?${params}`,
          tokens.access,
        ),
      );
      await db
        .prepare(
          "UPDATE sky_x_accounts SET cache=?,fetched_at=?,next_refresh_at=?,retry_at=0,error_code=NULL,lease_id=NULL,lease_until=0 WHERE owner_id=? AND revision=? AND lease_id=? AND status='connected'",
        )
        .bind(
          await c.cipher.seal(posts, `feed:${a.remote_id}`),
          clock(),
          clock() + TTL,
          owner,
          a.revision,
          lease,
        )
        .run();
    } catch (error) {
      const e =
        error instanceof XAccountError
          ? error
          : new XAccountError('upstream-unavailable', 503, clock() + TTL);
      await db
        .prepare(
          "UPDATE sky_x_accounts SET error_code=?,retry_at=?,cache=CASE WHEN ?='reconnect-required' THEN NULL ELSE cache END,status=CASE WHEN ?='reconnect-required' THEN 'reauth_required' ELSE status END,lease_id=NULL,lease_until=0 WHERE owner_id=? AND revision=? AND lease_id=?",
        )
        .bind(
          e.code,
          Math.max(e.retryAt, clock() + TTL),
          e.code,
          e.code,
          owner,
          a.revision,
          lease,
        )
        .run();
    }
    return status();
  }
  async function disconnect(revision: unknown) {
    await ensure();
    if (!Number.isSafeInteger(revision) || Number(revision) < 0)
      throw new XAccountError('invalid-revision');
    const result = await db
      .prepare(
        "UPDATE sky_x_accounts SET tokens=NULL,cache=NULL,status='disconnected',revision=revision+1,error_code=NULL,fetched_at=0,next_refresh_at=0,retry_at=0,lease_id=NULL,lease_until=0 WHERE owner_id=? AND revision=?",
      )
      .bind(owner, revision)
      .run();
    if (result.meta.changes !== 1)
      throw new XAccountError('connection-changed', 409);
    await db
      .prepare('DELETE FROM sky_x_oauth_states WHERE owner_id=?')
      .bind(owner)
      .run();
    return status();
  }
  return { status, begin, callback, refresh, disconnect };
}
