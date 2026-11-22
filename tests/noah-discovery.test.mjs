import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  createDiscoveryStore,
  DISCOVERY_INTERVAL,
  DISCOVERY_LEASE,
  DISCOVERY_FRESH,
} from '../lib/noah-discovery-store.ts';
import {
  normalizeDiscovery,
  discoveryIdentity,
  discoveryDigest,
} from '../lib/noah-discovery-provider.ts';
import { createDiscoveryApi } from '../lib/noah-discovery-api.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
const repo = (id = 1) => ({
  id,
  full_name: `maker/agent${id}`,
  name: `Agent ${id}`,
  private: false,
  fork: false,
  archived: false,
  default_branch: 'main',
  topics: ['agent'],
  description: 'Synthetic public repository',
  license: { spdx_id: 'MIT' },
});
function fixture(t, publicTags = () => []) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(
    readFileSync(
      new URL('../drizzle/0041_noah_discovery.sql', import.meta.url),
      'utf8',
    ),
  );
  sql.exec(
    'CREATE TABLE noah_feed_preferences(owner_id TEXT,kind TEXT,subject TEXT,PRIMARY KEY(owner_id,kind,subject))',
  );
  sql.exec(readFileSync(new URL('../drizzle/0042_noah_recommendations.sql', import.meta.url), 'utf8'));
  const hooks = {},
    db = {
      prepare(query) {
        const statement = {
          bind(...args) {
            return {
              async first() {
                return sql.prepare(query).get(...args) ?? null;
              },
              async all() {
                return { results: sql.prepare(query).all(...args) };
              },
              async run() {
                return {
                  meta: {
                    changes: Number(sql.prepare(query).run(...args).changes),
                  },
                };
              },
              query,
              args,
            };
          },
          async first() {
            return statement.bind().first();
          },
          async all() {
            return statement.bind().all();
          },
          async run() {
            return statement.bind().run();
          },
        };
        return statement;
      },
      async batch(statements) {
        sql.exec('BEGIN');
        try {
          const result = [];
          for (const s of statements) {
            if (hooks.failBatch?.(s.query)) throw Error('batch failure');
            result.push({
              meta: {
                changes: Number(sql.prepare(s.query).run(...s.args).changes),
              },
            });
          }
          sql.exec('COMMIT');
          return result;
        } catch (e) {
          sql.exec('ROLLBACK');
          throw e;
        }
      },
    };
  const time = { value: 1800000000000 },
    upstream = { ids: [1], sha: 'a'.repeat(40), private: false },
    calls = [];
  const fetcher = async (url, init) => {
    calls.push(url);
    if (hooks.fetch) return hooks.fetch(url, init);
    if (url.startsWith('https://huggingface.co/')) return Response.json([]);
    if (url.includes('/search/'))
      return Response.json({ items: upstream.ids.map(repo) });
    if (url.includes('/git/ref/'))
      return Response.json({ object: { sha: upstream.sha } });
    const id = Number(url.split('agent').at(-1));
    return Response.json({ ...repo(id), private: upstream.private });
  };
  const options = { db, fetcher, publicTags, now: () => time.value },
    store = createDiscoveryStore(options);
  async function seed(id, stamp = time.value, revision = 1, extra = {}) {
    const metadata = {
        ...normalizeDiscovery('github', repo(id), 'b'.repeat(40)),
        ...extra,
      },
      key = await discoveryIdentity('github', String(id)),
      digest = await discoveryDigest(metadata);
    sql
      .prepare(
        "INSERT INTO noah_discovery_candidates VALUES(?,?,?,?,?,'active',?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,digest=excluded.digest,changed_at=excluded.changed_at,checked_at=excluded.checked_at",
      )
      .run(
        key,
        'github',
        String(id),
        metadata.repository,
        digest,
        revision,
        stamp,
        stamp,
        stamp,
      );
    sql
      .prepare("INSERT INTO noah_discovery_versions VALUES(?,?,?,?,'active',?)")
      .run(key, revision, digest, JSON.stringify(metadata), stamp);
    return key;
  }
  return { sql, db, hooks, time, upstream, calls, options, store, seed };
}
void test('persistent due checks deduplicate equal metadata, create fixed changed versions and survive host recreation', async (t) => {
  const f = fixture(t);
  assert.deepEqual(await f.store.sync(), {
    github: 'updated',
    huggingface: 'updated',
  });
  assert.equal(f.calls.length, 4);
  assert.deepEqual(await createDiscoveryStore(f.options).sync(), {
    github: 'not_due',
    huggingface: 'not_due',
  });
  assert.equal(f.calls.length, 4);
  f.time.value += DISCOVERY_INTERVAL;
  await f.store.sync();
  assert.equal(
    f.sql.prepare('SELECT COUNT(*) n FROM noah_discovery_versions').get().n,
    1,
  );
  f.upstream.sha = 'b'.repeat(40);
  f.time.value += DISCOVERY_INTERVAL;
  await f.store.sync();
  const page = await f.store.list('alice', new URLSearchParams());
  assert.equal(page.entries[0].revision, 2);
  assert.equal((await f.store.detail(page.entries[0].id)).versions.length, 2);
  assert.equal(JSON.stringify(page).includes('cursor_key'), false);
});
void test('two hosts claim once, late callbacks are fenced and an expired lease can be recovered', async (t) => {
  const f = fixture(t);
  let release, started;
  const entered = new Promise((r) => (started = r));
  f.hooks.fetch = async (url) => {
    if (url.includes('/search/')) {
      started();
      return new Promise((r) => (release = r));
    }
    return Response.json(
      url.includes('huggingface')
        ? []
        : url.includes('/git/ref/')
          ? { object: { sha: 'a'.repeat(40) } }
          : repo(),
    );
  };
  const first = f.store.sync();
  await entered;
  const other = await createDiscoveryStore(f.options).sync();
  assert.equal(other.github, 'not_due');
  f.time.value += DISCOVERY_LEASE + 1;
  f.sql
    .prepare(
      "UPDATE noah_discovery_sources SET lease_id='replacement',lease_until=? WHERE id='github'",
    )
    .run(f.time.value + DISCOVERY_LEASE);
  release(Response.json({ items: [repo()] }));
  assert.equal((await first).github, 'lease_lost');
  assert.equal(
    f.sql.prepare('SELECT COUNT(*) n FROM noah_discovery_candidates').get().n,
    0,
  );
  assert.equal(
    f.sql
      .prepare("SELECT lease_id FROM noah_discovery_sources WHERE id='github'")
      .get().lease_id,
    'replacement',
  );
  f.hooks.fetch = null;
  f.time.value += DISCOVERY_LEASE + 1;
  assert.equal((await f.store.sync()).github, 'updated');
});
void test('atomic candidate and version storage rolls back together on write failure', async (t) => {
  const f = fixture(t);
  f.hooks.failBatch = (q) =>
    q.startsWith('INSERT INTO noah_discovery_versions');
  assert.equal((await f.store.sync()).github, 'unavailable');
  assert.equal(
    f.sql.prepare('SELECT COUNT(*) n FROM noah_discovery_candidates').get().n,
    0,
  );
});
void test('partial fetch failure preserves verified rows, last success and next allowed time without retry', async (t) => {
  const f = fixture(t);
  await f.store.sync();
  const success = f.sql
    .prepare(
      "SELECT last_success_at FROM noah_discovery_sources WHERE id='github'",
    )
    .get().last_success_at;
  f.time.value += DISCOVERY_INTERVAL;
  f.hooks.fetch = async () =>
    new Response(null, { status: 429, headers: { 'retry-after': '14400' } });
  await f.store.sync();
  const row = f.sql
    .prepare("SELECT * FROM noah_discovery_sources WHERE id='github'")
    .get();
  assert.equal(row.last_success_at, success);
  assert.equal(row.next_run_at, f.time.value + 14400000);
  assert.equal(row.error_code, 'rate_limited');
  const count = f.calls.length;
  await f.store.sync();
  assert.equal(f.calls.length, count);
  assert.equal(
    (await f.store.list(null, new URLSearchParams())).entries.length,
    1,
  );
});
void test('withdrawal removes a current candidate even from a prior cursor; a reappearance gets another version', async (t) => {
  const f = fixture(t);
  await f.store.sync();
  const id = (await f.store.list(null, new URLSearchParams())).entries[0].id;
  f.time.value += DISCOVERY_INTERVAL;
  f.upstream.private = true;
  await f.store.sync();
  assert.equal(
    (await f.store.list(null, new URLSearchParams())).entries.length,
    0,
  );
  await assert.rejects(f.store.detail(id), (e) => e.status === 404);
  f.time.value += DISCOVERY_INTERVAL;
  f.upstream.private = false;
  await f.store.sync();
  assert.equal((await f.store.detail(id)).currentRevision, 3);
  f.time.value += DISCOVERY_FRESH + 1;
  assert.equal(
    (await f.store.list(null, new URLSearchParams())).entries.length,
    0,
  );
  await assert.rejects(f.store.detail(id), (e) => e.status === 409);
});
void test('cursor is a stable version snapshot even for writes in the same millisecond, and rejects owner/query/preferences/expiry/forgery', async (t) => {
  const f = fixture(t);
  for (let id = 1; id <= 25; id++) await f.seed(id);
  const first = await f.store.list('alice', new URLSearchParams());
  assert.equal(first.entries.length, 20);
  assert.ok(first.nextCursor);
  const remaining = f.sql
    .prepare('SELECT external_id,id FROM noah_discovery_candidates')
    .all()
    .filter((x) => !first.entries.some((e) => e.id === x.id));
  await f.seed(Number(remaining[0].external_id), f.time.value, 2, {
    summary: 'changed later in same millisecond',
  });
  await f.seed(999);
  const next = await f.store.list(
    'alice',
    new URLSearchParams({ cursor: first.nextCursor }),
  );
  assert.equal(next.entries.length, 5);
  assert.ok(next.entries.every((e) => e.revision === 1));
  assert.equal(
    new Set([...first.entries, ...next.entries].map((e) => e.id)).size,
    25,
  );
  for (const [owner, p] of [
    ['bob', { cursor: first.nextCursor }],
    ['alice', { cursor: first.nextCursor, q: 'agent' }],
    ['alice', { cursor: first.nextCursor + 'x' }],
  ])
    await assert.rejects(
      f.store.list(owner, new URLSearchParams(p)),
      (e) => e.status === 409,
    );
  f.sql
    .prepare(
      "INSERT INTO noah_feed_preferences VALUES('alice','interest','agent')",
    )
    .run();
  await assert.rejects(
    f.store.list('alice', new URLSearchParams({ cursor: first.nextCursor })),
    (e) => e.status === 409,
  );
  f.sql.exec('DELETE FROM noah_feed_preferences');
  f.time.value += 900001;
  await assert.rejects(
    f.store.list('alice', new URLSearchParams({ cursor: first.nextCursor })),
    (e) => e.status === 409,
  );
});
void test('recommendation uses explicit consent/interests/follows, hide is owner specific, and turning it off returns latest', async (t) => {
  const f = fixture(t);
  const older = await f.seed(1, f.time.value - 1000),
    newer = await f.seed(2, f.time.value, 1, {
      tags: ['different'],
      authorId: 'github:someone',
    });
  f.sql.exec(
    "INSERT INTO noah_feed_preferences VALUES('alice','personalize','enabled'),('alice','interest','agent'),('alice','follow','github:maker')",
  );
  const ranked = await f.store.list('alice', new URLSearchParams());
  assert.equal(ranked.entries[0].id, older);
  assert.equal(ranked.entries[0].reason, '選んだ興味に関連');
  f.sql.exec("DELETE FROM noah_feed_preferences WHERE kind='personalize'");
  assert.equal(
    (await f.store.list('alice', new URLSearchParams())).entries[0].id,
    newer,
  );
  assert.equal(
    (await f.store.list('alice', new URLSearchParams({ order: 'following' })))
      .entries[0].id,
    older,
  );
  f.sql
    .prepare("INSERT INTO noah_feed_preferences VALUES('alice','hide',?)")
    .run(older);
  assert.equal(
    (await f.store.list('alice', new URLSearchParams())).entries.length,
    1,
  );
  assert.equal(
    (await f.store.list('bob', new URLSearchParams())).entries.length,
    2,
  );
});
void test('pruning retains the boundary revision needed by live cursors and otherwise bounds history', async (t) => {
  const f = fixture(t);
  const id = await f.seed(1, f.time.value - 10000000);
  for (let n = 2; n <= 23; n++) await f.seed(1, f.time.value - 500000 + n, n);
  await f.store.sync();
  assert.ok(
    f.sql
      .prepare(
        'SELECT 1 FROM noah_discovery_versions WHERE candidate_id=? AND revision=1',
      )
      .get(id),
  );
  f.time.value += 1000000;
  await f.store.sync();
  assert.equal(
    f.sql
      .prepare(
        'SELECT COUNT(*) n FROM noah_discovery_versions WHERE candidate_id=?',
      )
      .get(id).n,
    20,
  );
});
void test('API reads may be anonymous but sync requires authenticated same origin and owner intent, with no custom sources', async (t) => {
  const f = fixture(t),
    api = createDiscoveryApi({
      ...f.options,
      authenticate: async (r) => {
        const owner = r.headers.get('test-owner');
        if (!owner) throw Error('UNAUTHORIZED');
        return owner;
      },
    }),
    scope = await ownerScopeFor('alice');
  const request = (body, headers = {}) =>
    new Request('https://noah.test/api/noah/discovery', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://noah.test',
        'test-owner': 'alice',
        'X-Rock-Owner-Scope': scope,
        ...headers,
      },
      body,
    });
  assert.equal(
    (await api(new Request('https://noah.test/api/noah/discovery'))).status,
    200,
  );
  assert.equal((await api(request('{}', { 'test-owner': '' }))).status, 401);
  assert.equal(
    (await api(request('{}', { origin: 'https://evil.test' }))).status,
    403,
  );
  assert.equal(
    (await api(request('{}', { 'X-Rock-Owner-Scope': 'other' }))).status,
    409,
  );
  assert.equal((await api(request('{"url":"https://evil.test"}'))).status, 400);
  assert.equal(f.calls.length, 0);
  const result = await api(request('{}'));
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(data.ownerScope, scope);
  assert.equal(JSON.stringify(data).includes('cursor_key'), false);
  assert.ok(f.calls.length > 0);
});

void test('discovered candidates use consented public history tags without treating unknown runtime as compatible', async t => {
  const f = fixture(t, id => id === 'known' ? ['agent'] : []);
  f.sql.exec('CREATE TABLE work_jobs(id TEXT PRIMARY KEY,user_id TEXT,payload TEXT)');
  for(let id=1;id<=25;id++) await f.seed(id);
  f.sql.prepare('INSERT INTO noah_feed_preferences VALUES(?,?,?)').run('alice','personalize','enabled');
  f.sql.prepare('INSERT INTO noah_recommendation_settings VALUES(?,1,1,?,?,?)').run('alice',f.time.value-100,'headless',f.time.value);
  f.sql.prepare('INSERT INTO work_jobs VALUES(?,?,?)').run('success','alice',JSON.stringify({noahExecution:{agentId:'known',state:'returned',startedAt:f.time.value-50,completedAt:f.time.value-20,result:{exitCode:0}}}));
  const first=await f.store.list('alice',new URLSearchParams());
  assert.equal(first.entries.length,20);
  assert.ok(first.entries.every(e=>e.reason.includes('履歴')||e.reason.includes('利用した')));
  assert.ok(first.entries.every(e=>!e.reason.includes('実行方法')));
  const second=await f.store.list('alice',new URLSearchParams({cursor:first.nextCursor}));
  assert.equal(second.entries.length,5);
  assert.equal(new Set([...first.entries,...second.entries].map(e=>e.id)).size,25);
  f.sql.prepare('UPDATE noah_recommendation_settings SET revision=2,history_since=? WHERE owner_id=?').run(f.time.value,'alice');
  await assert.rejects(f.store.list('alice',new URLSearchParams({cursor:first.nextCursor})),e=>e.status===409);
  const cleared=await f.store.list('alice',new URLSearchParams());
  assert.ok(cleared.entries.every(e=>!e.reason.includes('利用した')));
  const bob=await f.store.list('bob',new URLSearchParams());
  assert.ok(bob.entries.every(e=>!e.reason.includes('利用した')));
});
