import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  xAccountConfig,
  xAccountCipher,
  xAccountService,
  X_ACCOUNT_CONSENT,
  parseXAccountPosts,
} from '../lib/sky-x-account.ts';
const origin = 'http://127.0.0.1:3016';
const address = (url) =>
  typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
const env = {
  SKY_X_OAUTH_CLIENT_ID: 'fixture-client-only',
  SKY_X_OAUTH_CLIENT_SECRET: 'fixture-secret-not-real',
  SKY_X_OAUTH_CALLBACK_URL: origin + '/api/sky/x-account/callback',
  SKY_X_ACCOUNT_KEY: 'ab'.repeat(32),
  SKY_X_USER_READ_APPROVED: '1',
  SKY_X_USER_READS_PER_DAY: '10',
};
const user = {
  data: { id: '1234', username: 'fixture_owner', name: '合成アカウント' },
};
const payload = {
  data: [
    {
      id: '5678',
      author_id: '8888',
      text: 'Fixture X post; synthetic only.',
      created_at: '2026-10-21T05:00:00Z',
    },
  ],
  includes: {
    users: [
      {
        id: '8888',
        username: 'fixture_author',
        name: '合成の作者',
        protected: true,
      },
    ],
  },
};
const tokens = {
  access_token: 'fixture-access-not-real',
  token_type: 'bearer',
  refresh_token: 'fixture-refresh-not-real',
  scope: 'tweet.read users.read offline.access',
  expires_in: 7200,
};
function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  for (const file of [
    '0025_sky_x_feed_state.sql',
    '0029_sky_x_account_oauth.sql',
  ])
    sql.exec(
      readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'),
    );
  const prepare = (q, args = []) => ({
    bind(...v) {
      return prepare(q, v);
    },
    async first() {
      return sql.prepare(q).get(...args) ?? null;
    },
    async run() {
      return { meta: { changes: Number(sql.prepare(q).run(...args).changes) } };
    },
    async all() {
      return { results: sql.prepare(q).all(...args) };
    },
  });
  const db = {
    prepare,
    async batch(items) {
      return Promise.all(items.map((i) => i.run()));
    },
  };
  return { db, sql };
}
async function connect(s) {
  const start = await s.begin(X_ACCOUNT_CONSENT);
  const u = new URL(start.authorizeUrl);
  await s.callback(u.searchParams.get('state'), 'fixture-code', start.binding);
  return { start, u };
}
void test('X account use requires full app/callback/key and explicit bounded read approval', () => {
  assert.equal(xAccountConfig({}, origin).config, null);
  assert.equal(xAccountConfig(env, origin).config.daily, 10);
  for (const change of [
    { SKY_X_USER_READ_APPROVED: '0' },
    { SKY_X_ACCOUNT_KEY: 'bad' },
    { SKY_X_USER_READS_PER_DAY: '100000' },
    { SKY_X_OAUTH_CALLBACK_URL: 'https://evil.invalid/callback' },
    { SKY_X_OAUTH_CLIENT_ID: { id: 'not-a-string' } },
  ])
    assert.equal(xAccountConfig({ ...env, ...change }, origin).config, null);
});
void test('token/cache cipher binds owner, purpose, authentication tag and handles large Unicode payloads', async () => {
  const a = xAccountCipher(env.SKY_X_ACCOUNT_KEY, 'alice'),
    b = xAccountCipher(env.SKY_X_ACCOUNT_KEY, 'bob'),
    value = { body: '日本語'.repeat(50000) };
  const sealed = await a.seal(value, 'feed:123');
  assert.doesNotMatch(sealed, /日本語/);
  assert.deepEqual(await a.open(sealed, 'feed:123'), value);
  await assert.rejects(b.open(sealed, 'feed:123'), /key-unavailable/);
  await assert.rejects(a.open(sealed, 'tokens:123'), /key-unavailable/);
  const v = JSON.parse(sealed);
  v.cipher = 'A' + v.cipher.slice(1);
  await assert.rejects(
    a.open(JSON.stringify(v), 'feed:123'),
    /key-unavailable/,
  );
});
void test('OAuth state is private, owner/cookie/expiry bound, one-use and read-only PKCE', async (t) => {
  const { db, sql } = fixture(t);
  let calls = 0,
    verifier = '';
  const s = xAccountService(db, 'alice', env, origin, async (url, init) => {
    calls++;
    if (address(url).endsWith('/token')) {
      verifier = new URLSearchParams(init.body).get('code_verifier');
      return Response.json(tokens);
    }
    return Response.json(user);
  });
  const start = await s.begin(X_ACCOUNT_CONSENT),
    u = new URL(start.authorizeUrl),
    state = u.searchParams.get('state');
  assert.equal(u.origin, 'https://x.com');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(
    u.searchParams.get('scope'),
    'tweet.read users.read offline.access',
  );
  assert.doesNotMatch(u.search, /write|dm.read|dm.write|fixture-secret/);
  await assert.rejects(
    s.callback(state, 'code', 'a'.repeat(43)),
    /invalid-state/,
  );
  await assert.rejects(
    xAccountService(db, 'bob', env, origin).callback(
      state,
      'code',
      start.binding,
    ),
    /invalid-state/,
  );
  assert.equal(calls, 0);
  await s.callback(state, 'code', start.binding);
  assert.equal(calls, 2);
  assert.ok(verifier.length >= 43);
  assert.doesNotMatch(
    sql.prepare('SELECT verifier FROM sky_x_oauth_states').get().verifier,
    new RegExp(verifier),
  );
  await assert.rejects(
    s.callback(state, 'code', start.binding),
    /invalid-state/,
  );
  assert.equal(calls, 2);
  const status = await s.status();
  assert.equal(status.connected, true);
  assert.equal(status.account.username, 'fixture_owner');
  assert.doesNotMatch(
    JSON.stringify(status),
    /fixture-access|fixture-secret|fixture-refresh/,
  );
});
void test('real provider-shaped following posts are encrypted, cached, owner private and never called For You', async (t) => {
  const { db, sql } = fixture(t),
    seen = [];
  let now = Date.parse('2026-10-21T05:00:00Z');
  const s = xAccountService(
    db,
    'alice',
    env,
    origin,
    async (url, init) => {
      seen.push({ url: address(url), init });
      return Response.json(
        address(url).endsWith('/token')
          ? tokens
          : address(url).includes('/users/me')
            ? user
            : payload,
      );
    },
    () => now,
  );
  await connect(s);
  const v = await s.refresh();
  assert.equal(v.posts.length, 1);
  assert.equal(v.posts[0].protected, true);
  assert.equal(v.posts[0].url, 'https://x.com/fixture_author/status/5678');
  assert.equal(v.source, 'following');
  assert.equal(v.xForYouAvailable, false);
  assert.ok(
    seen.at(-1).url.includes('/2/users/1234/timelines/reverse_chronological'),
  );
  assert.equal(seen.at(-1).init.redirect, 'error');
  assert.equal(
    seen.at(-1).init.headers.Authorization,
    'Bearer fixture-access-not-real',
  );
  await s.refresh();
  assert.equal(seen.length, 3);
  const stored = sql.prepare('SELECT tokens,cache FROM sky_x_accounts').get();
  assert.doesNotMatch(
    JSON.stringify(stored),
    /fixture-access|fixture-refresh|Fixture X post|fixture_author/,
  );
  assert.equal(
    (await xAccountService(db, 'bob', env, origin).status()).posts.length,
    0,
  );
  now += 16 * 60000;
  assert.equal((await s.status()).posts.length, 0);
});
void test('concurrent refreshes use one lease and share bounded account/app read reservations', async (t) => {
  const { db } = fixture(t);
  let reads = 0;
  const s = xAccountService(db, 'alice', env, origin, async (url) => {
    if (address(url).endsWith('/token')) return Response.json(tokens);
    if (address(url).includes('/users/me')) return Response.json(user);
    reads++;
    await new Promise((r) => setTimeout(r, 10));
    return Response.json(payload);
  });
  await connect(s);
  await Promise.all([s.refresh(), s.refresh(), s.refresh()]);
  assert.equal(reads, 1);
  assert.equal((await s.status()).readsUsedToday, 2);
});
void test('429 and approved read budget stop provider reads without fabricated cached content', async (t) => {
  const { db } = fixture(t);
  const now = Date.parse('2026-10-21T05:00:00Z');
  let reads = 0;
  const s = xAccountService(
    db,
    'alice',
    env,
    origin,
    async (url) => {
      if (address(url).endsWith('/token')) return Response.json(tokens);
      if (address(url).includes('/users/me')) return Response.json(user);
      reads++;
      return new Response(null, {
        status: 429,
        headers: { 'retry-after': '3600' },
      });
    },
    () => now,
  );
  await connect(s);
  const v = await s.refresh();
  assert.equal(v.error, 'rate-limited');
  assert.equal(v.posts.length, 0);
  assert.equal(v.retryAt, now + 3600000);
  await s.refresh();
  assert.equal(reads, 1);
  const f = fixture(t);
  const limited = xAccountService(
    f.db,
    'alice',
    { ...env, SKY_X_USER_READS_PER_DAY: '1' },
    origin,
    async (url) =>
      Response.json(address(url).endsWith('/token') ? tokens : user),
    () => now,
  );
  await connect(limited);
  const exhausted = await limited.refresh();
  assert.equal(exhausted.error, 'read-budget-exhausted');
  assert.equal(exhausted.posts.length, 0);
});
void test('disconnect fences pending OAuth and in-flight results while removing cached private text and tokens', async (t) => {
  const { db, sql } = fixture(t);
  let release;
  const wait = new Promise((r) => (release = r));
  const s = xAccountService(db, 'alice', env, origin, async (url) => {
    if (address(url).endsWith('/token')) return Response.json(tokens);
    if (address(url).includes('/users/me')) return Response.json(user);
    await wait;
    return Response.json(payload);
  });
  await connect(s);
  const pending = s.refresh();
  await new Promise((r) => setTimeout(r, 10));
  const before = await s.status();
  await s.disconnect(before.revision);
  release();
  await pending;
  const a = sql.prepare('SELECT status,tokens,cache FROM sky_x_accounts').get();
  assert.equal(a.status, 'disconnected');
  assert.equal(a.tokens, null);
  assert.equal(a.cache, null);
  assert.equal((await s.status()).posts.length, 0);
  await assert.rejects(s.disconnect(before.revision), /connection-changed/);
  const start = await s.begin(X_ACCOUNT_CONSENT);
  await s.disconnect((await s.status()).revision);
  await assert.rejects(
    s.callback(
      new URL(start.authorizeUrl).searchParams.get('state'),
      'fixture-code',
      start.binding,
    ),
    /invalid-state/,
  );
});
void test('refresh token rotation stays encrypted and API 401 requires reconnect', async (t) => {
  const { db } = fixture(t);
  let now = Date.parse('2026-10-21T05:00:00Z'),
    rotated = 0;
  const s = xAccountService(
    db,
    'alice',
    env,
    origin,
    async (url, init) => {
      if (address(url).endsWith('/token')) {
        if (
          new URLSearchParams(init.body).get('grant_type') === 'refresh_token'
        )
          rotated++;
        return Response.json({ ...tokens, expires_in: 61 });
      }
      if (address(url).includes('/users/me')) return Response.json(user);
      return new Response(null, { status: 401 });
    },
    () => now,
  );
  await connect(s);
  now += 62000;
  const v = await s.refresh();
  assert.equal(rotated, 1);
  assert.equal(v.connected, false);
  assert.equal(v.status, 'reauth_required');
  assert.equal(v.posts.length, 0);
  await assert.rejects(s.refresh(), /reconnect-required/);
});
void test('invalid/expired state, malformed provider content and unsafe usernames are refused', async (t) => {
  const { db } = fixture(t);
  let now = Date.now();
  const s = xAccountService(db, 'alice', env, origin, undefined, () => now);
  const start = await s.begin(X_ACCOUNT_CONSENT);
  now += 11 * 60000;
  await assert.rejects(
    s.callback(
      new URL(start.authorizeUrl).searchParams.get('state'),
      'code',
      start.binding,
    ),
    /invalid-state/,
  );
  assert.throws(
    () => parseXAccountPosts({ data: [{ id: 'fake' }] }),
    /invalid-response/,
  );
  assert.deepEqual(parseXAccountPosts({ meta: { result_count: 0 } }), []);
  assert.throws(
    () =>
      parseXAccountPosts({
        ...payload,
        includes: { users: [{ id: '8888', username: '@evil/host' }] },
      }),
    /invalid-response/,
  );
  await assert.rejects(
    xAccountService(db, 'alice', {}, origin).begin(X_ACCOUNT_CONSENT),
    /setup-required/,
  );
});

void test('provider cannot widen the read-only token scopes', async (t) => {
  const { db } = fixture(t);
  const s = xAccountService(db, 'alice', env, origin, async () =>
    Response.json({ ...tokens, scope: tokens.scope + ' tweet.write' }),
  );
  const start = await s.begin(X_ACCOUNT_CONSENT);
  await assert.rejects(
    s.callback(
      new URL(start.authorizeUrl).searchParams.get('state'),
      'fixture-code',
      start.binding,
    ),
    /invalid-token-response/,
  );
  assert.equal((await s.status()).connected, false);
});
