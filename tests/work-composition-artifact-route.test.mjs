import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { workStore } from '../lib/work-store.ts';
import { createWorkJob, updateComposedWork } from '../lib/workflow.ts';
import {
  parseCompositionPlan,
  suggestComposition,
} from '../lib/work-composition.ts';
import { executeCompositionNode } from '../lib/work-composition-executor.ts';

const dataModule = (text) =>
  `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
async function fixture(t, { kind = 'text', input, minChars = 1 } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((n) => n.endsWith('.sql') && !n.startsWith('._'))
    .sort())
    sqlite.exec(
      readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'),
    );
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              return sqlite.prepare(sql).get(...values) ?? null;
            },
            async run() {
              return {
                meta: {
                  changes: Number(sqlite.prepare(sql).run(...values).changes),
                },
              };
            },
          };
        },
      };
    },
  };
  const key = `composition-artifact-readonly-${randomUUID()}`;
  globalThis[key] = { db };
  t.after(() => delete globalThis[key]);
  const ref = `globalThis[${JSON.stringify(key)}]`;
  // Synthetic fixture identity only: production requestUser is reused by the handler.
  // The stores, business reducer, output validation and SQL are real.
  const imports = new Map([
    [
      '@/lib/fund-store',
      dataModule(
        `export function database(){return ${ref}.db;} export async function requestUser(r){const user=r.headers.get('x-fixture-user');if(!user)throw new Error('UNAUTHORIZED');return user;}`,
      ),
    ],
    ...['work-store', 'work-job-view', 'workflow'].map((n) => [
      `@/lib/${n}`,
      new URL(`../lib/${n}.ts`, import.meta.url).href,
    ]),
  ]);
  const source = stripTypeScriptTypes(
    readFileSync(
      new URL(
        '../app/api/work-jobs/composition/artifact/route.ts',
        import.meta.url,
      ),
      'utf8',
    ),
    { mode: 'strip' },
  );
  const route = await import(
    dataModule(
      source.replace(/\bfrom\s+(['"])([^'"]+)\1/g, (_m, _q, n) => {
        assert.ok(imports.has(n), `unmapped route import ${n}`);
        return `from ${JSON.stringify(imports.get(n))}`;
      }),
    )
  );
  const store = workStore(db);
  const plan = parseCompositionPlan({
    ...suggestComposition(kind === 'csv' ? 'CSVを整える' : '引用を整理', kind),
    acceptance: 'Synthetic read-only result acceptance',
  });
  const material =
    input ??
    (kind === 'csv'
      ? 'name,value\nAlice,1\nBob,2\n'
      : '本人用素材。（出典: [Example](https://example.test/source)）');
  plan.nodes.at(-1).config.minChars = minChars;
  let job = createWorkJob({
    id: randomUUID(),
    title: 'PRIVATE-OWNER-PURPOSE',
    templateId: 'composition',
    plan,
  });
  for (const node of plan.nodes) {
    const result = await executeCompositionNode(
      job.composition,
      node,
      material,
    );
    job = updateComposedWork(job, {
      id: randomUUID(),
      fingerprint: 'a'.repeat(64),
      revision: job.revision,
      action: 'run',
      stepId: node.id,
      source: material,
      result,
    });
  }
  await store.create('alice', job);
  const url = (patch = {}) => {
    const values = {
      jobId: job.id,
      nodeId: job.composition.plan.nodes.at(-1).id,
      revision: String(job.revision),
      ...patch,
    };
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(values))
      if (value !== undefined) params.append(name, value);
    return `https://fixture.invalid/api/work-jobs/composition/artifact?${params}`;
  };
  const call = (patch = {}, owner = 'alice', explicitUrl) =>
    route.GET(
      new Request(explicitUrl ?? url(patch), {
        headers: { 'x-fixture-user': owner },
      }),
    );
  const snapshot = () =>
    sqlite
      .prepare(
        'SELECT payload, revision, updated_at FROM work_jobs WHERE id = ?',
      )
      .get(job.id);
  return { sqlite, db, route, store, job, url, call, snapshot };
}
function safeHeaders(response) {
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(
    response.headers.get('content-security-policy'),
    "default-src 'none'; sandbox",
  );
}
void test('owner downloads exact saved UTF8 bytes with neutral attachment filename and no state mutation', async (t) => {
  const f = await fixture(t),
    before = f.snapshot();
  const response = await f.call();
  assert.equal(response.status, 200);
  safeHeaders(response);
  assert.equal(
    response.headers.get('content-type'),
    'text/plain; charset=utf-8',
  );
  assert.equal(
    response.headers.get('content-disposition'),
    `attachment; filename="zema-step-s2-r${f.job.revision}.txt"`,
  );
  assert.equal(
    response.headers.get('content-disposition').includes(f.job.title),
    false,
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual(
    bytes,
    new TextEncoder().encode(f.job.composition.artifacts.s2.text),
  );
  assert.deepEqual(f.snapshot(), before);
});
void test('CSV download uses saved transform bytes, correct media type and CSV extension', async (t) => {
  const f = await fixture(t, { kind: 'csv' }),
    response = await f.call();
  assert.equal(response.status, 200);
  safeHeaders(response);
  assert.equal(response.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.match(response.headers.get('content-disposition'), /\.csv"$/);
  assert.equal(await response.text(), f.job.composition.artifacts.s2.text);
});
void test('needs-review result is downloadable without being promoted to passed or completed', async (t) => {
  const f = await fixture(t, { minChars: 1000 }),
    before = f.snapshot();
  assert.equal(f.job.composition.artifacts.s2.status, 'needs_review');
  const response = await f.call();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), f.job.composition.artifacts.s2.text);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.job.status, 'active');
});
void test('401 and another owner never receive private bytes, filename or attachment headers', async (t) => {
  const f = await fixture(t),
    before = f.snapshot();
  for (const [owner, expected] of [
    ['', 401],
    ['bob', 404],
  ]) {
    const response = await f.call({}, owner);
    assert.equal(response.status, expected);
    safeHeaders(response);
    assert.equal(response.headers.get('content-disposition'), null);
    const body = await response.text();
    assert.equal(body.includes('本人用素材'), false);
    assert.equal(body.includes(f.job.title), false);
  }
  assert.deepEqual(f.snapshot(), before);
});
void test('stale displayed revision refuses a different saved version with 409', async (t) => {
  const f = await fixture(t),
    before = f.snapshot(),
    response = await f.call({ revision: String(f.job.revision - 1) });
  assert.equal(response.status, 409);
  safeHeaders(response);
  assert.equal(response.headers.get('content-disposition'), null);
  assert.deepEqual(f.snapshot(), before);
});
void test('erasure wins: old and current download links return 404 without restoring deleted outputs', async (t) => {
  const f = await fixture(t);
  const cleared = updateComposedWork(f.job, {
    id: randomUUID(),
    fingerprint: 'b'.repeat(64),
    revision: f.job.revision,
    action: 'clear',
  });
  assert.equal(await f.store.update('alice', cleared, f.job.revision), true);
  const before = f.snapshot();
  for (const revision of [f.job.revision, cleared.revision]) {
    const response = await f.call({ revision: String(revision) });
    assert.equal(response.status, 404);
    safeHeaders(response);
  }
  assert.deepEqual(f.snapshot(), before);
});
void test('bounded query validation rejects duplicates, unknown keys, header injection and missing fields', async (t) => {
  const f = await fixture(t),
    before = f.snapshot();
  for (const patch of [
    { jobId: 'invalid' },
    { nodeId: 's1\r\nInjected: yes' },
    { nodeId: 's123456789' },
    { nodeId: '../source' },
    { revision: '-1' },
    { revision: '01' },
    { revision: '1.5' },
    { revision: '9007199254740992' },
    { revision: undefined },
    { nodeId: undefined },
    { jobId: undefined },
    { source: 'PRIVATE-UNEXPECTED' },
    { nodeId: 's'.repeat(400) },
  ])
    assert.equal((await f.call(patch)).status, 400);
  assert.equal((await f.call({}, 'alice', `${f.url()}&nodeId=s1`)).status, 400);
  assert.deepEqual(f.snapshot(), before);
});
void test('unavailable node returns 404 and malformed stored evidence fails closed', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call({ nodeId: 's999' })).status, 404);
  const bad = structuredClone(f.job);
  bad.composition.artifacts.s2.kind = 'html';
  f.sqlite
    .prepare('UPDATE work_jobs SET payload = ? WHERE id = ?')
    .run(JSON.stringify(bad), bad.id);
  const response = await f.call();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('content-disposition'), null);
});
void test('HTML-looking material is served as plain text attachment, never as an executable document', async (t) => {
  const input =
    '<script>throw new Error("synthetic-script")</script>\n本文です。（出典: [Example](https://example.test/source)）';
  const f = await fixture(t, { input }),
    response = await f.call();
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get('content-type'),
    'text/plain; charset=utf-8',
  );
  safeHeaders(response);
  assert.match(response.headers.get('content-disposition'), /^attachment;/);
  assert.equal((await response.text()).includes('<script>'), true);
});
