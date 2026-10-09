import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { parseCodeDraft, codeSourceHash, codeDiff } from '../lib/sky-code.ts';
import { codeSecurityRegistry } from '../lib/sky-code-security.ts';
import { skyCodeStore, CodeBlockedError } from '../lib/sky-code-store.ts';
import { handleSkyCode } from '../lib/sky-code-api.ts';

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    readFileSync(
      new URL('../drizzle/0060_sky_code_timeline.sql', import.meta.url),
      'utf8',
    ),
  );
  t.after(() => sqlite.close());
  function prepare(sql, values = []) {
    return {
      bind(...v) {
        return prepare(sql, v);
      },
      first() {
        return sqlite.prepare(sql).get(...values) ?? null;
      },
      all() {
        return { results: sqlite.prepare(sql).all(...values) };
      },
      run() {
        const result = sqlite.prepare(sql).run(...values);
        return {
          success: true,
          results: [],
          meta: { changes: Number(result.changes) },
        };
      },
    };
  }
  return {
    sqlite,
    prepare,
    batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = statements.map((s) => s.run());
        sqlite.exec('COMMIT');
        return Promise.resolve(result);
      } catch (e) {
        sqlite.exec('ROLLBACK');
        return Promise.reject(e);
      }
    },
  };
}
function draft(overrides = {}) {
  return parseCodeDraft({
    id: crypto.randomUUID(),
    repoId: crypto.randomUUID(),
    expectedRevision: 0,
    title: 'Greeting agent',
    author: 'Fixture developer',
    description: 'Returns a greeting.',
    license: 'MIT',
    message: 'Initial version',
    files: [
      {
        path: 'agent.js',
        source: 'export function run() { return "hello"; }\n',
      },
    ],
    publishConfirmed: true,
    ...overrides,
  });
}
const origin = 'https://code.example.chatgpt.site';
function api(
  db,
  method = 'GET',
  body,
  owner = 'alice',
  query = '',
  requestOrigin = origin,
) {
  return handleSkyCode(
    new Request(origin + '/api/sky/code' + query, {
      method,
      headers: {
        ...(owner ? { 'oai-authenticated-user-id': owner } : {}),
        ...(method === 'GET'
          ? {}
          : { origin: requestOrigin, 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    db,
  );
}
void test('default SPIDER checks the actual source on every publish and does not trust client receipts', async (t) => {
  const db = database(t),
    payload = draft({ files: [{ path: 'agent.js', source: 'eval(input);' }] });
  const response = await api(db, 'POST', {
    ...payload,
    inspection: { status: 'passed' },
  });
  assert.equal(response.status, 422);
  assert.equal((await skyCodeStore(db).list(null)).length, 0);
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) AS n FROM sky_code_commits').get().n,
    0,
  );
});
void test('secret and metadata findings contain positions, not the detected secret values', async (t) => {
  const store = skyCodeStore(database(t));
  const secret = 'fixture-secret-value-555';
  for (const payload of [
    draft({
      files: [{ path: 'agent.js', source: `const password = "${secret}";` }],
    }),
    draft({ description: `password = "${secret}"` }),
  ]) {
    await assert.rejects(
      () => store.publish('alice', payload),
      (e) => {
        assert.ok(e instanceof CodeBlockedError);
        assert.ok(!JSON.stringify(e.inspection).includes(secret));
        return true;
      },
    );
  }
});
void test('clean commits survive a new store and have immutable parent-linked history and workflow receipt', async (t) => {
  const db = database(t),
    store = skyCodeStore(db),
    first = draft();
  const a = await store.publish('alice', first);
  assert.equal(a.workflow.status, 'completed');
  assert.equal(a.inspection.provider, 'spider');
  const b = await store.publish(
    'alice',
    draft({
      ...first,
      id: crypto.randomUUID(),
      expectedRevision: 1,
      message: 'Update greeting',
      files: [
        {
          path: 'agent.js',
          source: 'export function run() { return "hi"; }\n',
        },
      ],
    }),
  );
  const restored = await skyCodeStore(db).detail(first.repoId, null);
  assert.equal(restored.commit.id, b.id);
  assert.equal(restored.parent.id, a.id);
  assert.equal(restored.history.length, 2);
  assert.equal(
    (await store.detail(first.repoId, null, 1)).commit.files[0].source,
    first.files[0].source,
  );
  assert.throws(
    () => db.sqlite.exec("UPDATE sky_code_commits SET payload='{}'"),
    /immutable/,
  );
  assert.throws(
    () => db.sqlite.exec('DELETE FROM sky_code_commits'),
    /immutable/,
  );
});
void test('owner checks protect update/hide and public data does not expose the private authentication ID', async (t) => {
  const db = database(t),
    store = skyCodeStore(db),
    input = draft();
  await store.publish('private-auth-owner', input);
  await assert.rejects(
    () =>
      store.publish(
        'bob',
        draft({ ...input, id: crypto.randomUUID(), expectedRevision: 1 }),
      ),
    /所有者/,
  );
  await assert.rejects(() => store.hide('bob', input.repoId, 1), /所有者/);
  const publicList = await store.list(null);
  assert.equal(publicList[0].canEdit, false);
  assert.equal(publicList[0].files, undefined);
  assert.ok(!JSON.stringify(publicList).includes('private-auth-owner'));
  assert.ok(
    !JSON.stringify(await store.detail(input.repoId, null)).includes(
      'private-auth-owner',
    ),
  );
});
void test('removal is explicit, replacement records its narrower scope, and restoring SPIDER rescans', async (t) => {
  const store = skyCodeStore(database(t)),
    input = draft();
  await store.publish('alice', input);
  const unsafe = draft({
    ...input,
    id: crypto.randomUUID(),
    expectedRevision: 1,
    files: [{ path: 'agent.js', source: 'eval(input);' }],
    protector: 'none',
  });
  await assert.rejects(() => store.publish('alice', unsafe), /確認/);
  const b = await store.publish('alice', {
    ...unsafe,
    protectionChangeConfirmed: true,
  });
  assert.equal(b.inspection.status, 'disabled');
  const c = await store.publish(
    'alice',
    draft({
      ...unsafe,
      id: crypto.randomUUID(),
      expectedRevision: 2,
      protector: 'secret-check',
      protectionChangeConfirmed: true,
    }),
  );
  assert.equal(c.inspection.provider, 'secret-check');
  assert.equal(c.inspection.status, 'passed');
  assert.match(c.inspection.scope, /動作は検査しません/);
  await assert.rejects(
    () =>
      store.publish(
        'alice',
        draft({
          ...unsafe,
          id: crypto.randomUUID(),
          expectedRevision: 3,
          protector: 'spider',
          protectionChangeConfirmed: true,
        }),
      ),
    CodeBlockedError,
  );
  assert.equal((await store.detail(input.repoId, 'alice')).commit.id, c.id);
});
void test('unknown scanners and incomplete scans fail closed; secret-only still blocks secrets', async (t) => {
  const store = skyCodeStore(database(t));
  await assert.rejects(
    () =>
      store.publish(
        'alice',
        draft({ protector: 'pretend-vendor', protectionChangeConfirmed: true }),
      ),
    /接続されていません/,
  );
  await assert.rejects(
    () =>
      store.publish(
        'alice',
        draft({
          files: [{ path: 'agent.js', source: 'const x = `hello ${input}`;' }],
        }),
      ),
    CodeBlockedError,
  );
  await assert.rejects(
    () =>
      store.publish(
        'alice',
        draft({
          protector: 'secret-check',
          protectionChangeConfirmed: true,
          files: [
            { path: 'agent.py', source: 'password = "fixture-only-password"' },
          ],
        }),
      ),
    CodeBlockedError,
  );
});
void test('same id retries are idempotent and changed payload reuse is rejected', async (t) => {
  const db = database(t),
    store = skyCodeStore(db),
    input = draft();
  const a = await store.publish('alice', input);
  const b = await store.publish('alice', input);
  assert.deepEqual(b, a);
  await assert.rejects(
    () => store.publish('alice', { ...input, message: 'different' }),
    /使用済み/,
  );
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) AS n FROM sky_code_commits').get().n,
    1,
  );
});
void test('competing writers cannot both advance the head', async (t) => {
  const db = database(t),
    store = skyCodeStore(db),
    input = draft();
  await store.publish('alice', input);
  const results = await Promise.allSettled(
    ['first', 'second'].map((message) =>
      store.publish(
        'alice',
        draft({
          ...input,
          id: crypto.randomUUID(),
          expectedRevision: 1,
          message,
        }),
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await store.detail(input.repoId, null)).history.length, 2);
});
void test('hide removes all versions from anonymous and other-owner reads, owner can republish after fresh scan', async (t) => {
  const db = database(t),
    store = skyCodeStore(db),
    input = draft();
  await store.publish('alice', input);
  await store.hide('alice', input.repoId, 1);
  assert.equal((await store.list(null)).length, 0);
  for (const owner of [null, 'bob'])
    await assert.rejects(() => store.detail(input.repoId, owner, 1), /非公開/);
  assert.equal((await store.detail(input.repoId, 'alice')).repoRevision, 2);
  await store.publish('alice', input);
  assert.equal((await store.list(null)).length, 0, 'retry cannot unhide');
  await assert.rejects(
    () =>
      store.publish(
        'alice',
        draft({ ...input, id: crypto.randomUUID(), expectedRevision: 1 }),
      ),
    /更新/,
  );
  await store.publish(
    'alice',
    draft({ ...input, id: crypto.randomUUID(), expectedRevision: 2 }),
  );
  assert.equal((await store.list(null)).length, 1);
});
void test('API requires authentication, same origin, publishing confirmation and exact revisions', async (t) => {
  const db = database(t),
    input = draft();
  assert.equal((await api(db, 'POST', input, null)).status, 401);
  assert.equal(
    (await api(db, 'POST', input, 'alice', '', 'https://foreign.example'))
      .status,
    403,
  );
  assert.equal(
    (await api(db, 'POST', { ...input, publishConfirmed: false })).status,
    400,
  );
  assert.equal((await api(db, 'POST', input)).status, 201);
  assert.equal(
    (await api(db, 'POST', { ...input, id: crypto.randomUUID() })).status,
    409,
  );
  assert.equal((await api(db, 'GET', undefined, null, '?mine=1')).status, 401);
  assert.equal(
    (
      await api(
        db,
        'GET',
        undefined,
        null,
        '?repo=' + input.repoId + '&revision=1',
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api(
        db,
        'PATCH',
        { repoId: input.repoId, action: 'hide', expectedRevision: 1 },
        'bob',
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api(db, 'PATCH', {
        repoId: input.repoId,
        action: 'hide',
        expectedRevision: 1,
      })
    ).status,
    200,
  );
  assert.equal(
    (await api(db, 'GET', undefined, null, '?repo=' + input.repoId)).status,
    404,
  );
});
void test('bad inputs, paths, duplicated files, huge bytes/lines and too many files are rejected', () => {
  for (const files of [
    [{ path: '../agent.js', source: 'a' }],
    [{ path: 'a//b.js', source: 'a' }],
    [{ path: 'index.html', source: 'a' }],
    [{ path: 'a.js', source: '\0' }],
    [{ path: 'a.js', source: 'a'.repeat(65537) }],
    [{ path: 'a.py', source: 'x\n'.repeat(2001) }],
    Array.from({ length: 9 }, (_, i) => ({ path: `${i}.js`, source: 'a' })),
    [
      { path: 'a.js', source: 'a' },
      { path: 'A.js', source: 'b' },
    ],
  ])
    assert.throws(() => draft({ files }));
  const input = draft({ files: [{ path: 'a.py', source: 'x\r\ny\rz' }] });
  assert.equal(input.files[0].source, 'x\ny\nz');
});
void test('metadata and filenames are included in the stable source digest', async () => {
  const input = draft();
  const hash = await codeSourceHash(input);
  for (const change of [
    { message: 'New message' },
    { license: 'Apache-2.0' },
    { files: [{ ...input.files[0], path: 'other.js' }] },
  ])
    assert.notEqual(await codeSourceHash({ ...input, ...change }), hash);
});
void test('server-installed adapter contract binds results to the exact content and provider version', async (t) => {
  let bad = false;
  const adapter = {
    id: 'fixture-scanner',
    label: 'Fixture scanner',
    scope: 'Synthetic test only',
    version: '7',
    async inspect(input, sourceSha256) {
      return {
        provider: this.id,
        label: this.label,
        scope: this.scope,
        version: this.version,
        sourceSha256: bad ? '0'.repeat(64) : sourceSha256,
        status: 'passed',
        findings: [],
      };
    },
  };
  const registry = codeSecurityRegistry([adapter]);
  const store = skyCodeStore(database(t), registry);
  const saved = await store.publish(
    'alice',
    draft({ protector: adapter.id, protectionChangeConfirmed: true }),
  );
  assert.equal(saved.inspection.version, '7');
  bad = true;
  await assert.rejects(
    () =>
      store.publish(
        'alice',
        draft({ protector: adapter.id, protectionChangeConfirmed: true }),
      ),
    /一致/,
  );
  assert.throws(
    () => codeSecurityRegistry([{ ...adapter, id: 'spider' }]),
    /INVALID/,
  );
});
void test('scanner failures cannot create commits', async (t) => {
  const db = database(t);
  const store = skyCodeStore(
    db,
    codeSecurityRegistry([
      {
        id: 'failed-scanner',
        label: 'Fixture',
        version: '1',
        scope: 'Fixture',
        async inspect() {
          throw new Error('source must not escape');
        },
      },
    ]),
  );
  await assert.rejects(
    () =>
      store.publish(
        'alice',
        draft({ protector: 'failed-scanner', protectionChangeConfirmed: true }),
      ),
    (e) => {
      assert.ok(!e.message.includes('source must not escape'));
      return true;
    },
  );
  assert.equal(
    db.sqlite.prepare('SELECT COUNT(*) AS n FROM sky_code_commits').get().n,
    0,
  );
});
void test('line diff represents additions/removals without interpreting HTML or executing code', () => {
  const diff = codeDiff('one\nold\nend', 'one\n<script>input</script>\nend');
  assert.deepEqual(
    diff.map((l) => l.kind),
    ['same', 'removed', 'added', 'same'],
  );
  assert.equal(diff[2].text, '<script>input</script>');
  assert.ok(codeDiff('same', 'same').every((l) => l.kind === 'same'));
});
