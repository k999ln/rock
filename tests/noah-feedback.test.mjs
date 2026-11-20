import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from '../lib/owner-intent.ts';
import { createNoahFeedbackApi } from '../lib/noah-feedback.ts';
function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(
    'PRAGMA foreign_keys=ON; CREATE TABLE sky_social_profiles(id TEXT PRIMARY KEY,owner_id TEXT UNIQUE,name TEXT)',
  );
  for (const name of ['0043_noah_runner', '0046_noah_feedback'])
    sql.exec(
      readFileSync(
        new URL(`../drizzle-main/${name}.sql`, import.meta.url),
        'utf8',
      ),
    );
  sql
    .prepare('INSERT INTO sky_social_profiles VALUES(?,?,?)')
    .run('profile-a', 'owner-a', '試験作者A');
  sql
    .prepare('INSERT INTO sky_social_profiles VALUES(?,?,?)')
    .run('profile-b', 'owner-b', '試験作者B');
  const prepare = (q, args = []) => ({
    bind(...v) {
      return prepare(q, v);
    },
    async first() {
      return sql.prepare(q).get(...args) ?? null;
    },
    async all() {
      return { results: sql.prepare(q).all(...args) };
    },
    async run() {
      return { meta: { changes: Number(sql.prepare(q).run(...args).changes) } };
    },
  });
  let time = 10000;
  const deps = {
    db: { prepare },
    publicAgent: (id) => ['agent-one', 'agent-two'].includes(id),
    authenticate: async (r) => {
      const user = r.headers.get('x-test-user');
      if (!user) throw Error('UNAUTHORIZED');
      return user;
    },
    now: () => time,
    operators: ['operator'],
  };
  const api = createNoahFeedbackApi(deps);
  const get = (query = 'agent=agent-one', user) =>
    api(
      new Request(`https://noah.test/api/noah/feedback?${query}`, {
        headers: user ? { 'x-test-user': user } : {},
      }),
    );
  const post = async (body, user = 'owner-a', headers = {}) =>
    api(
      new Request('https://noah.test/api/noah/feedback', {
        method: 'POST',
        headers: {
          Origin: 'https://noah.test',
          'Content-Type': 'application/json',
          ...(user
            ? {
                'x-test-user': user,
                [OWNER_SCOPE_HEADER]: await ownerScopeFor(user),
              }
            : {}),
          ...headers,
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
  return { sql, deps, api, get, post, advance: () => time++ };
}
const crown = (extra = {}) => ({
  action: 'crown',
  agentId: 'agent-one',
  id: randomUUID(),
  enabled: true,
  revision: 0,
  ...extra,
});
const comment = (extra = {}) => ({
  action: 'comment',
  agentId: 'agent-one',
  id: randomUUID(),
  content: '試験用の見解。良かったところと惜しかったところ。',
  parentId: null,
  publicConsent: true,
  ...extra,
});
const maintenance = (extra = {}) => ({
  action: 'maintenance',
  agentId: 'agent-one',
  id: randomUUID(),
  objective: '試験用の改善依頼',
  repository: 'https://github.com/example/synthetic-agent',
  scopeVersion: 'noah-maintenance-v1',
  authorized: true,
  ...extra,
});
void test('public metrics count distinct observed run users, never registrations, connections, failures or work text', async (t) => {
  const f = fixture(t);
  f.sql
    .prepare('INSERT INTO noah_runner_devices VALUES(?,?,?,?,?,?,?,?,NULL)')
    .run(
      'device',
      'private-owner',
      'hash',
      'boot',
      'private-name',
      'mac',
      1,
      1,
    );
  for (const [owner, kind, state, id] of [
    ['a', 'run', 'succeeded', 'agent-one'],
    ['a', 'run', 'succeeded', 'agent-one'],
    ['b', 'run', 'succeeded', 'agent-one'],
    ['c', 'connect', 'succeeded', 'agent-one'],
    ['d', 'run', 'failed', 'agent-one'],
    ['e', 'run', 'unknown', 'agent-one'],
    ['f', 'run', 'succeeded', 'agent-two'],
  ])
    f.sql
      .prepare(
        'INSERT INTO noah_runner_commands(id,owner_id,device_id,boot_id,kind,state,request_sha256,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        randomUUID(),
        owner,
        'device',
        'boot',
        kind,
        state,
        'digest',
        JSON.stringify({
          pin: { agentId: id },
          prompt: 'private-work-content',
        }),
        1,
        1,
      );
  const r = await f.get(),
    d = await r.json();
  assert.equal(r.status, 200);
  assert.equal(d.summary.users, 2);
  assert.equal(d.summary.crowns, 0);
  assert.equal(d.authenticated, false);
  assert.doesNotMatch(
    JSON.stringify(d),
    /private-owner|private-name|private-work-content|owner_id/,
  );
  assert.match(r.headers.get('cache-control'), /no-store/);
  assert.equal((await f.get('agent=private-upload')).status, 404);
  assert.equal(
    (
      await f.get(
        'ids=' +
          Array(21)
            .fill(0)
            .map((_, i) => `id-${i}`)
            .join(','),
      )
    ).status,
    400,
  );
});
void test('one account has at most one crown; retries, concurrent writes, cancellation and stale updates preserve exact counts', async (t) => {
  const f = fixture(t),
    v = crown();
  const rs = await Promise.all([f.post(v), f.post(v)]);
  assert.ok(rs.every((r) => r.status === 200));
  assert.equal((await (await f.get()).json()).summary.crowns, 1);
  assert.equal((await f.post({ ...v, enabled: false })).status, 409);
  const cancel = crown({ enabled: false, revision: 1 });
  assert.equal((await f.post(cancel)).status, 200);
  assert.equal((await f.post(cancel)).status, 200);
  assert.equal((await (await f.get()).json()).summary.crowns, 0);
  assert.equal((await f.post(v)).status, 409);
  const race = await Promise.all([
    f.post(crown({ revision: 2 })),
    f.post(crown({ revision: 2 })),
  ]);
  assert.deepEqual(
    race.map((r) => r.status).sort((a, b) => a - b),
    [200, 409],
  );
  assert.equal((await f.post(crown(), 'owner-b')).status, 200);
  const d = await (await f.get('agent=agent-one', 'owner-a')).json();
  assert.equal(d.summary.crowns, 2);
  assert.equal(d.summary.crowned, true);
  assert.equal((await (await f.get()).json()).summary.crowned, false);
});
void test('mutation requires authenticated identity, same Origin, strict fields and a public target', async (t) => {
  const f = fixture(t);
  for (const [body, user, headers, status] of [
    [crown(), null, {}, 401],
    [crown(), 'owner-a', { Origin: 'https://evil.test' }, 403],
    [crown(), 'owner-a', { 'Content-Type': 'text/plain' }, 415],
    [crown({ ownerId: 'owner-b' }), 'owner-a', {}, 400],
    [crown({ agentId: 'private-upload' }), 'owner-a', {}, 404],
    ['{', 'owner-a', {}, 400],
    ['x'.repeat(12001), 'owner-a', {}, 413],
  ])
    assert.equal((await f.post(body, user, headers)).status, status);
  assert.equal(
    f.sql.prepare('SELECT COUNT(*) n FROM noah_agent_crowns').get().n,
    0,
  );
});
void test('comments preserve actual text, require explicit publication and a public name, and deduplicate identical retries', async (t) => {
  const f = fixture(t),
    v = comment({ content: '試験用\n<script>text only</script>' });
  assert.equal((await f.post(v, 'no-profile')).status, 409);
  assert.equal((await f.post({ ...v, publicConsent: false })).status, 400);
  assert.equal((await f.post({ ...v, content: 'x'.repeat(1001) })).status, 400);
  const rs = await Promise.all([f.post(v), f.post(v)]);
  assert.ok(rs.every((r) => r.status === 200));
  assert.equal((await f.post({ ...v, content: 'changed' })).status, 409);
  assert.equal((await f.post(v, 'owner-b')).status, 409);
  const d = await (await f.get()).json();
  assert.equal(d.comments.length, 1);
  assert.equal(d.comments[0].content, v.content);
  assert.equal(d.comments[0].author, '試験作者A');
  assert.equal(d.comments[0].mine, false);
  assert.equal(d.summary.comments, 1);
  assert.doesNotMatch(JSON.stringify(d), /owner-a|profile-a|content_sha256/);
});
void test('replies stay on their Agent; only the author can delete, deleted content stays redacted on retry', async (t) => {
  const f = fixture(t),
    root = comment();
  await f.post(root);
  f.advance();
  const reply = comment({ parentId: root.id, content: '試験用の返信' });
  assert.equal((await f.post({ ...reply, agentId: 'agent-two' })).status, 404);
  assert.equal((await f.post(reply, 'owner-b')).status, 200);
  assert.equal((await f.post(comment({ parentId: reply.id }))).status, 404);
  const del = { action: 'remove', agentId: 'agent-one', id: root.id };
  assert.equal((await f.post(del, 'owner-b')).status, 404);
  assert.equal((await f.post(del)).status, 200);
  assert.equal((await f.post(del)).status, 200);
  assert.equal((await f.post(root)).status, 200);
  const d = await (await f.get()).json();
  assert.equal(d.summary.comments, 1);
  assert.equal(d.comments.find((c) => c.id === root.id).content, '');
  assert.equal(d.comments.find((c) => c.id === reply.id).parentContent, '');
  assert.equal((await f.post(comment({ parentId: root.id }))).status, 404);
});
void test('hourly limit is atomic and deleting a comment cannot reset it', async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 19; i++)
    assert.equal((await f.post(comment())).status, 200);
  const rs = await Promise.all([f.post(comment()), f.post(comment())]);
  assert.deepEqual(
    rs.map((r) => r.status).sort((a, b) => a - b),
    [200, 429],
  );
  const id = f.sql
    .prepare('SELECT id FROM noah_agent_comments LIMIT 1')
    .get().id;
  await f.post({ action: 'remove', agentId: 'agent-one', id });
  assert.equal((await f.post(comment())).status, 429);
});
void test('comment pagination is stable at identical timestamps and rejects malformed cursors', async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 35; i++)
    await f.post(comment(), i < 18 ? 'owner-a' : 'owner-b');
  const first = await (await f.get()).json();
  assert.equal(first.comments.length, 30);
  assert.ok(first.cursor);
  const second = await (
    await f.get(`agent=agent-one&cursor=${encodeURIComponent(first.cursor)}`)
  ).json();
  assert.equal(second.comments.length, 5);
  assert.equal(second.cursor, null);
  assert.equal(
    new Set([...first.comments, ...second.comments].map((c) => c.id)).size,
    35,
  );
  assert.equal((await f.get('agent=agent-one&cursor=bad')).status, 400);
});
void test('maintenance inquiry is idempotent, private, and requires scope/authority without claiming code execution or payment', async (t) => {
  const f = fixture(t),
    v = maintenance();
  assert.equal((await f.post({ ...v, authorized: false })).status, 400);
  assert.equal(
    (
      await f.post({
        ...v,
        repository: 'https://user:secret@example.test/repo',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.post({
        ...v,
        repository: 'https://example.test/repo?token=secret',
      })
    ).status,
    400,
  );
  assert.equal((await f.post(v)).status, 201);
  assert.equal((await f.post(v)).status, 201);
  assert.equal((await f.post({ ...v, objective: 'changed' })).status, 409);
  assert.equal((await f.post(v, 'owner-b')).status, 409);
  assert.equal((await f.get('maintenance=mine')).status, 401);
  assert.equal(
    (await (await f.get('maintenance=mine', 'owner-b')).json()).requests.length,
    0,
  );
  const d = await (await f.get('maintenance=mine', 'owner-a')).json();
  assert.equal(d.requests.length, 1);
  assert.equal(d.requests[0].state, 'requested');
  assert.doesNotMatch(JSON.stringify(d), /owner-a|request_sha256/);
  assert.equal((await f.get('maintenance=operator', 'owner-a')).status, 403);
  assert.equal(
    (await (await f.get('maintenance=operator', 'operator')).json()).requests
      .length,
    1,
  );
});
void test('unavailable storage never becomes a zero count or a successful mutation', async (t) => {
  const f = fixture(t),
    api = createNoahFeedbackApi({
      ...f.deps,
      db: {
        prepare() {
          throw Error('private failure');
        },
      },
    });
  const r = await api(
    new Request('https://noah.test/api/noah/feedback?agent=agent-one'),
  );
  assert.equal(r.status, 503);
  assert.doesNotMatch(await r.text(), /private failure|"users":0/);
});

void test('an account switch cannot save a vote or inquiry from another account’s visible workspace', async (t) => {
  const f = fixture(t);
  assert.equal(
    (
      await f.post(crown(), 'owner-b', {
        [OWNER_SCOPE_HEADER]: await ownerScopeFor('owner-a'),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.post(maintenance(), 'owner-b', {
        [OWNER_SCOPE_HEADER]: await ownerScopeFor('owner-a'),
      })
    ).status,
    409,
  );
  assert.equal(
    f.sql.prepare('SELECT COUNT(*) n FROM noah_agent_crowns').get().n,
    0,
  );
});

void test('public opinion feed excludes replies, deleted comments and withdrawn Agents and preserves original text', async (t) => {
  const f = fixture(t),
    root = comment();
  await f.post(root);
  await f.post(comment({ parentId: root.id, content: 'reply' }), 'owner-b');
  const other = comment({ agentId: 'agent-two' });
  await f.post(other);
  let d = await (await f.get('feed=1')).json();
  assert.equal(d.entries.length, 2);
  assert.equal(d.entries.find((e) => e.id === root.id).replies, 1);
  assert.equal(d.entries.find((e) => e.id === root.id).content, root.content);
  f.deps.publicAgent = (id) => id === 'agent-one';
  d = await (await f.get('feed=1')).json();
  assert.equal(d.entries.length, 1);
  await f.post({ action: 'remove', agentId: 'agent-one', id: root.id });
  d = await (await f.get('feed=1')).json();
  assert.equal(d.entries.length, 0);
});
