import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createNoahDataStore, noahDataOperatorAllowed, readNoahDataResult } from '../lib/noah-result-data.ts';
import { createNoahDataApi } from '../lib/noah-result-data-api.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
const now = Date.UTC(2026, 10, 20), digest = text => createHash('sha256').update(text).digest('hex');
const file = (name, text) => ({ name, base64: Buffer.from(text).toString('base64'), bytes: Buffer.byteLength(text), sha256: digest(text) });
const result = () => ({ agentId: 'agent-example', version: 'v1', completedAt: new Date(now).toISOString(), state: 'returned', prompt: 'private request', secret: 'never expose this', result: { text: '成果100%_調査', files: [file('report.csv', 'a,b\n1,2'), file('private.txt', 'private output')], exitCode: 0 } });
const share = (extra = {}) => ({ action: 'share', id: randomUUID(), workId: 'job', workRevision: 4, policyVersion: 'noah-quality-v1', includeText: true, files: [], consent: true, ...extra });
function fixture(t) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close());
  sql.exec('CREATE TABLE work_jobs(id TEXT PRIMARY KEY,user_id TEXT,payload TEXT,revision INTEGER,updated_at TEXT)');
  sql.exec(readFileSync(new URL('../drizzle/0045_noah_result_data.sql', import.meta.url), 'utf8'));
  const queries = [], hooks = {};
  const db = { prepare(query) {
    const statement = { args: [], bind(...args) { return { ...statement, args }; }, async first() { queries.push(query); return sql.prepare(query).get(...this.args) ?? null; }, async all() { queries.push(query); return { results: sql.prepare(query).all(...this.args) }; }, async run() { hooks.beforeRun?.(query); queries.push(query); return { meta: { changes: sql.prepare(query).run(...this.args).changes } }; } }; return statement;
  } };
  function add(id = 'job', owner = 'owner', execution = result(), revision = 4) { sql.prepare('INSERT INTO work_jobs VALUES(?,?,?,?,?)').run(id, owner, JSON.stringify({ id, revision, title: 'private title', noahExecution: execution }), revision, new Date(now).toISOString()); }
  add(); add('other', 'other-owner');
  return { db, sql, queries, hooks, add, store: createNoahDataStore(db, () => now), row: () => sql.prepare('SELECT * FROM noah_result_contributions').get() };
}
void test('owner list searches literal text and file names, pages all rows without exposing prompt or another account', async t => {
  const f = fixture(t); for (let n = 0; n < 45; n++) f.add(`page-${String(n).padStart(2, '0')}`);
  const ids = []; let cursor;
  do { const page = await f.store.list('owner', new URLSearchParams(cursor ? { cursor } : {})); assert.ok(page.items.length <= 20); ids.push(...page.items.map(i => i.id)); cursor = page.nextCursor; assert.doesNotMatch(JSON.stringify(page), /private request|private title|other-owner|private output/); } while (cursor);
  assert.equal(ids.length, 46); assert.equal(new Set(ids).size, 46); assert.equal(ids.includes('other'), false);
  for (const q of ['100%_', 'report.csv', 'agent-example']) assert.equal((await f.store.list('owner', new URLSearchParams({ q }))).items.length, 20);
  for (const q of ['100X_', 'private request', 'private title', '\\']) assert.equal((await f.store.list('owner', new URLSearchParams({ q }))).items.length, 0);
  await assert.rejects(f.store.list('owner', new URLSearchParams({ cursor: 'not-json' })), { status: 400 });
  await assert.rejects(f.store.list('owner', new URLSearchParams({ q: 'x'.repeat(81) })), { status: 400 });
});
void test('detail projects only verified file bytes and output fields; no other owner or unreturned work', async t => {
  const f = fixture(t); f.add('queued', 'owner', { ...result(), state: 'queued' });
  const detail = await f.store.detail('owner', 'job'); assert.equal(detail.revision, 4); assert.equal(detail.result.verification, 'host_observed_unverified'); assert.equal(detail.result.files.length, 2);
  assert.doesNotMatch(JSON.stringify(detail), /private request|private title|never expose this/);
  assert.equal((await f.store.list('owner', new URLSearchParams())).items.length, 1);
  for (const id of ['other', 'queued', 'missing']) await assert.rejects(f.store.detail('owner', id), { status: 404 });
  for (const modify of [r => r.files[0].sha256 = '0'.repeat(64), r => r.files[0].bytes++, r => r.files[0].name = '../escape', r => r.files[0].base64 = 'invalid!', r => r.files.push(r.files[0]), r => r.text = 'あ'.repeat(50000), r => r.files = [file('large', 'a'.repeat(32769))]]) {
    const execution = result(); modify(execution.result);
    await assert.rejects(readNoahDataResult(JSON.stringify({ noahExecution: execution })), { status: 409 });
  }
});
void test('sharing requires exact consent, selection, policy and source revision; client cannot supply contents or owner', async t => {
  const f = fixture(t);
  const invalid = [{ consent: false }, { consent: 'true' }, { includeText: false }, { policyVersion: 'other' }, { files: ['missing'] }, { files: ['report.csv', 'report.csv'] }, { text: 'injected' }, { ownerId: 'other' }, { workRevision: -1 }, { id: 'not-uuid' }];
  for (const value of invalid) await assert.rejects(f.store.mutate('owner', share(value)), { status: 400 });
  await assert.rejects(f.store.mutate('owner', share({ workRevision: 3 })), { status: 409 });
  await assert.rejects(f.store.mutate('owner', share({ workId: 'other' })), { status: 404 });
  assert.equal(f.row(), undefined);
});
void test('only selected text/files are copied; operator projections omit owner, request, work and unselected contents', async t => {
  const f = fixture(t), input = share({ includeText: false, files: ['report.csv'] });
  await f.store.mutate('owner', input);
  const detail = await f.store.detail('operator', input.id, true);
  assert.equal(detail.result.text, ''); assert.equal(detail.result.files.length, 1); assert.equal(detail.result.files[0].name, 'report.csv'); assert.equal(detail.policyVersion, 'noah-quality-v1'); assert.equal(detail.sourceSha256.length, 64);
  assert.doesNotMatch(JSON.stringify(detail), /private output|private request|private title|never expose this|ownerId|workId|work_revision|request_sha256/);
  assert.equal((await f.store.list('operator', new URLSearchParams({ q: 'private.txt' }), true)).items.length, 0);
  assert.equal((await f.store.list('operator', new URLSearchParams({ q: 'report.csv' }), true)).items.length, 1);
  assert.equal((await f.store.detail('owner', 'job')).contribution.id, input.id);
});
void test('same-ID retries are idempotent, payload changes conflict and one Work cannot be shared twice', async t => {
  const f = fixture(t), input = share(); const first = await f.store.mutate('owner', input);
  assert.deepEqual(await f.store.mutate('owner', input), first);
  await assert.rejects(f.store.mutate('owner', { ...input, files: ['report.csv'] }), { status: 409 });
  await assert.rejects(f.store.mutate('owner', share()), { status: 409 });
  await assert.rejects(f.store.mutate('other-owner', { ...input, workId: 'other' }), { status: 409 });
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM noah_result_contributions').get().n, 1);
});
void test('withdrawal scrubs snapshot, preserves Work, hides operator data and cannot be undone by replay', async t => {
  const f = fixture(t), input = share(); await f.store.mutate('owner', input);
  await assert.rejects(f.store.mutate('other-owner', { action: 'revoke', id: input.id }), { status: 404 });
  const revoked = await f.store.mutate('owner', { action: 'revoke', id: input.id });
  assert.equal(revoked.state, 'revoked'); assert.equal(revoked.revokedAt, now); assert.equal(f.row().snapshot, null);
  assert.deepEqual(await f.store.mutate('owner', { action: 'revoke', id: input.id }), revoked);
  assert.deepEqual(await f.store.mutate('owner', input), revoked);
  await assert.rejects(f.store.mutate('owner', share()), { status: 409 });
  await assert.rejects(f.store.detail('operator', input.id, true), { status: 404 });
  assert.equal((await f.store.list('operator', new URLSearchParams(), true)).items.length, 0);
  assert.equal((await f.store.detail('owner', 'job')).result.text, result().result.text);
});
void test('atomic source fence rejects changed or deleted Work between preview and insertion', async t => {
  for (const action of ['UPDATE work_jobs SET revision=5 WHERE id=\'job\'', 'DELETE FROM work_jobs WHERE id=\'job\'', 'UPDATE work_jobs SET payload=\'{}\' WHERE id=\'job\'']) {
    const f = fixture(t); f.hooks.beforeRun = query => { if (query.startsWith('INSERT')) f.sql.exec(action); };
    await assert.rejects(f.store.mutate('owner', share()), { status: 409 }); assert.equal(f.row(), undefined);
  }
});
void test('a concurrent duplicate arriving after withdrawal cannot restore the data', async t => {
  const f = fixture(t), input = share(); await f.store.mutate('owner', input);
  // Retry passes its first lookup before a competing request revokes; both observe a monotonic state.
  await f.store.mutate('owner', { action: 'revoke', id: input.id });
  const answers = await Promise.all([f.store.mutate('owner', input), f.store.mutate('owner', { action: 'revoke', id: input.id })]);
  assert.ok(answers.every(a => a.state === 'revoked')); assert.equal(f.row().snapshot, null);
});
void test('owner contribution limit includes tombstones; operator pagination uses stable contribution keys', async t => {
  const f = fixture(t), input = share(); await f.store.mutate('owner', input);
  f.sql.exec(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<9999) INSERT INTO noah_result_contributions SELECT 'extra-'||x,'owner','extra-work-'||x,4,request_sha256,source_sha256,policy_version,'revoked',NULL,created_at,created_at FROM n,noah_result_contributions WHERE id='${input.id}'`);
  f.add('new'); await assert.rejects(f.store.mutate('owner', share({ workId: 'new' })), { status: 409 });
  for (let n = 0; n < 24; n++) { f.add(`op-${n}`, 'other-owner'); await f.store.mutate('other-owner', share({ workId: `op-${n}` })); }
  const page = await f.store.list('operator', new URLSearchParams(), true); assert.equal(page.items.length, 20);
  const next = await f.store.list('operator', new URLSearchParams({ cursor: page.nextCursor }), true); assert.equal(next.items.length, 5); assert.equal(next.nextCursor, null);
  assert.equal(new Set([...page.items, ...next.items].map(i => i.id)).size, 25);
});
void test('operator allowlist is dedicated and fail-closed', () => {
  for (const value of [undefined, '', '{}', 'null', '[null]', '["owner",2]', '"owner"', JSON.stringify(Array(101).fill('owner'))]) assert.equal(noahDataOperatorAllowed('owner', value), false);
  assert.equal(noahDataOperatorAllowed('owner', '["owner"]'), true); assert.equal(noahDataOperatorAllowed('other', '["owner"]'), false);
});
void test('API enforces authentication, dedicated operator access, owner scope, Origin, JSON and bounded input', async t => {
  const f = fixture(t); let owner = 'owner'; const scope = await ownerScopeFor(owner);
  const api = createNoahDataApi({ db: f.db, authenticate: async () => { if (!owner) throw Error('UNAUTHORIZED'); return owner; }, operators: '["admin"]', now: () => now });
  const get = (query = '', headers = {}) => api(new Request('https://noah.test/api/noah/data' + query, { headers }));
  const post = (input, headers = {}) => api(new Request('https://noah.test/api/noah/data', { method: 'POST', body: typeof input === 'string' ? input : JSON.stringify(input), headers: { Origin: 'https://noah.test', 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': scope, ...headers } }));
  const response = await get(); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store, private'); assert.equal((await response.json()).operatorAllowed, false);
  assert.equal((await get('?view=operator')).status, 403); assert.equal((await get('?view=unknown')).status, 400);
  for (const [headers, status] of [[{ Origin: 'https://other.test' }, 403], [{ 'X-Rock-Owner-Scope': '' }, 409], [{ 'Content-Type': 'text/plain' }, 415], [{ 'Content-Type': 'application/jsonp' }, 415]]) assert.equal((await post(share(), headers)).status, status);
  assert.equal((await post('{')).status, 400); assert.equal((await post(' '.repeat(8193))).status, 413);
  const input = share(); assert.equal((await post(input)).status, 200);
  owner = 'admin'; assert.equal((await get('?view=operator')).status, 200); assert.equal((await get('?id=job')).status, 404);
  assert.equal((await get('?view=operator', { 'X-Rock-Owner-Scope': scope })).status, 409);
  assert.equal((await post({ action: 'revoke', id: input.id })).status, 409);
  owner = ''; assert.equal((await get()).status, 401);
});
void test('storage failure is not reported as an empty result or successful consent', async () => {
  const api = createNoahDataApi({ db: { prepare() { throw Error('synthetic storage failure'); } }, authenticate: async () => 'owner' });
  assert.equal((await api(new Request('https://noah.test/api/noah/data'))).status, 503);
});
