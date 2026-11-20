import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, entry, page, NOW, markListed } from './fixtures/noah/intake.mjs';
void test('full sweep stores three pages, advances checkpoint only after completion, then uses a stable overlap', async t => {
  const urls = []; let fail = false;
  const f = fixture(t, async (url, init) => {
    urls.push(url); assert.equal(init.redirect, 'manual'); assert.match(init.headers['User-Agent'], /^NoahBot\/1/);
    const p = new URL(url), c = p.searchParams.get('cursor');
    if (c === 'two' && fail) throw Error('offline');
    return c === null ? page([entry(1)], 'two') : c === 'two' ? page([entry(2)], 'three') : page([entry(3)]);
  });
  assert.deepEqual(await f.store.sync(), { pages: 3, seen: 3, changed: 3, more: false });
  assert.equal(f.source().checkpoint_at, NOW); assert.equal(f.source().last_full_at, NOW); assert.equal(f.source().cursor, null);
  assert.equal(f.check().auth, 'unknown'); assert.equal(f.check().level, 0); assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM noah_intake_families').get().n, 3);
  assert.equal((await f.store.sync()).pages, 0);
  f.advance(3600000); fail = true;
  assert.equal((await f.store.sync()).error, 'unavailable'); assert.equal(f.source().cursor, 'two'); assert.equal(f.source().checkpoint_at, NOW);
  const since = f.source().updated_since; assert.equal(since, new Date(NOW - 600000).toISOString());
  fail = false; assert.equal((await f.store.sync()).pages, 0); f.advance(120001);
  assert.equal((await f.store.sync()).pages, 2); assert.equal(f.source().checkpoint_at, NOW + 3600000);
  for (const url of urls.slice(3)) assert.equal(new URL(url).searchParams.get('updated_since'), since);
  assert.equal(f.candidate().revision, 1); assert.equal(f.candidate().seen_at, NOW + 3600000);
});
void test('changed requirements and same-hash upstream deletions immediately remove a listed family', async t => {
  let record = entry(1); const f = fixture(t, async () => page([record])); await f.store.sync(); markListed(f, 1, 2);
  record = entry(1, { version: '2.0.0', remotes: [{ type: 'streamable-http', url: 'https://changed.example.com/mcp' }] }); f.advance(3600000);
  await f.store.sync(); assert.equal(f.candidate().revision, 2); assert.equal(f.check().level, 0); assert.equal(f.check().tools_sha256, null); assert.equal((await f.store.list(null, new URLSearchParams())).items.length, 0);
  markListed(f, 1, 2); record._meta['io.modelcontextprotocol.registry/official'].status = 'deleted'; f.advance(3600000);
  await f.store.sync(); assert.equal(f.candidate().state, 'withdrawn'); assert.equal(f.candidate().revision, 3); assert.equal((await f.store.list(null, new URLSearchParams())).items.length, 0);
  record._meta['io.modelcontextprotocol.registry/official'].status = 'active'; f.advance(3600000); await f.store.sync(); assert.equal(f.check().level, 0);
});
void test('weekly full sweep requires 90% coverage before withdrawing missing candidates; incremental absence never withdraws', async t => {
  let count = 10; const f = fixture(t, async () => page(Array.from({ length: count }, (_, i) => entry(i)))); await f.store.sync();
  count = 5; f.advance(3600000); await f.store.sync(); assert.equal(f.candidate(9).state, 'active');
  f.advance(7 * 86400000); await f.store.sync(); assert.equal(f.candidate(9).state, 'active'); assert.equal(f.source().error_code, null);
  count = 9; f.advance(7 * 86400000); await f.store.sync(); assert.equal(f.candidate(9).state, 'withdrawn');
});
void test('lease excludes concurrent wakes and page budget resumes without waiting an hour', async t => {
  let calls = 0, concurrent;
  const f = fixture(t, async () => { calls++; if (calls === 1) concurrent = await f.store.sync(); return page([entry(calls)], `cursor-${calls}`); });
  const first = await f.store.sync(); assert.equal(first.pages, 10); assert.equal(first.more, true); assert.equal(concurrent.pages, 0); assert.equal(f.source().checkpoint_at, null);
  assert.equal((await f.store.sync()).pages, 10); assert.equal(calls, 20); assert.equal(f.source().observed, 20);
  assert.ok(f.batches.every(b => b.length <= 50));
});
void test('partial page writes replay safely without advancing cursor or multiplying observed counts', async t => {
  const f = fixture(t, async () => page(Array.from({ length: 40 }, (_, i) => entry(i)))); let batches = 0;
  f.hooks.beforeBatch = statements => { if (statements.some(s => s.query.includes('INSERT INTO noah_intake_candidates')) && ++batches === 2) throw Error('D1 interrupted'); };
  assert.equal((await f.store.sync()).error, 'unavailable'); assert.equal(f.source().checkpoint_at, null); assert.equal(f.source().observed, 0);
  f.hooks.beforeBatch = null; f.advance(120001); await f.store.sync(); assert.equal(f.source().observed, 40);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM noah_intake_checks').get().n, 40); assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM noah_intake_families').get().n, 40);
});
void test('fencing rejects a stale worker after fetch, without overwriting the new owner', async t => {
  const f = fixture(t, async () => { f.sql.prepare("UPDATE noah_intake_sources SET lease_id='new-owner',lease_until=?").run(NOW + 120000); return page([entry(1)]); });
  assert.equal((await f.store.sync()).error, 'unavailable'); assert.equal(f.candidate(), undefined); assert.equal(f.source().lease_id, 'new-owner');
});
void test('regroup and shuffle run only on full sweep or first completion of a UTC day', async t => {
  const f = fixture(t, async () => page([entry(1)])); await f.store.sync();
  const regroupCount = () => f.batches.flat().filter(q => q.includes('WHERE listed = 1 AND level = 1;')).length;
  assert.equal(regroupCount(), 1); f.advance(3600000); await f.store.sync(); f.advance(3600000); await f.store.sync(); assert.equal(regroupCount(), 1);
  f.advance(86400000); await f.store.sync(); assert.equal(regroupCount(), 2);
});
void test('429 obeys Retry-After, redirects/oversize/malformed responses never advance checkpoint', async t => {
  for (const response of [new Response('', { status: 429, headers: { 'Retry-After': '900' } }), new Response('', { status: 302 }), new Response('x', { headers: { 'content-length': String(5 * 1024 * 1024) } }), Response.json({ servers: [null], metadata: {} })]) {
    const f = fixture(t, async () => response); const result = await f.store.sync(); assert.ok(result.error); assert.equal(f.source().checkpoint_at, null);
    if (response.status === 429) { assert.equal(result.error, 'rate_limited'); assert.equal(f.source().next_run_at, NOW + 900000); }
  }
});
void test('oversize UTF-8 records retain original digest but never persist published credentials', async t => {
  const big = entry(1, { description: 'あ'.repeat(24000) });
  const sensitive = entry(2, { remotes: [{ type: 'streamable-http', url: 'https://agent.example.com/mcp', headers: [{ name: 'Authorization', isRequired: true, value: ['Bearer', 'synthetic1234567890'].join(' ') }] }] });
  const f = fixture(t, async () => page([big, sensitive])); assert.equal((await f.store.sync()).seen, 2);
  assert.ok(Buffer.byteLength(f.candidate().record_json) <= 65536); assert.equal(JSON.parse(f.candidate().record_json).oversize, true); assert.equal(f.check().connect_sha256.length, 64);
  assert.equal(f.candidate(2).reason, 'published_secret'); assert.ok(!f.candidate(2).record_json.includes('synthetic1234567890'));
});
void test('list crosses ran/new boundary without duplication; literal search, moderation and owner details are safe', async t => {
  const f = fixture(t, async () => page(Array.from({ length: 28 }, (_, i) => entry(i, i === 0 ? { title: '100% tool' } : {})))); await f.store.sync();
  for (let i = 0; i < 28; i++) markListed(f, i, i < 3 ? 2 : 1);
  const first = await f.store.list(null, new URLSearchParams()), second = await f.store.list(null, new URLSearchParams({ cursor: first.nextCursor }));
  assert.equal(first.items.length, 20); assert.equal(second.items.length, 8); assert.equal(first.items.filter(i => i.section === 'ran').length, 3); assert.equal(new Set([...first.items, ...second.items].map(i => i.id)).size, 28);
  assert.deepEqual(first.counts, { ran: 3, new: 25 });
  assert.equal((await f.store.list(null, new URLSearchParams({ q: '100%' }))).items.length, 1);
  const id = 'mcp-registry:test.provider/agent-0', detail = await f.store.detail(id, 'owner-a', false); assert.equal(detail.connection, null);
  await f.store.moderate('withdraw', id, detail.revision); await assert.rejects(f.store.detail(id, null, false), e => e.status === 404);
  await assert.rejects(f.store.moderate('restore', id, detail.revision), e => e.status === 409);
  assert.equal((await f.store.list(null, new URLSearchParams({ q: '100%' }))).items.length, 0);
  await f.store.moderate('restore', id, detail.revision + 1); assert.equal((await f.store.detail(id, null, false)).id, id);
  for (const cursor of ['oops', 'n:NaN:abc', 'r:9007199254740992:abc', 's:0']) await assert.rejects(f.store.list(null, new URLSearchParams({ cursor })), e => e.status === 400);
  assert.equal((await f.store.list(null, new URLSearchParams({ limit: '0' }))).items.length, 0);
});
void test('retry repairs a published family after checks reset but touch was interrupted', async t => {
  const f = fixture(t, async () => page([entry(1)])); await f.store.sync(); markListed(f, 1);
  // Model an already-committed candidate/check batch before a later touch batch failed.
  f.sql.exec("UPDATE noah_intake_checks SET level=0,result='unchecked',tools_sha256=NULL,l1_at=NULL,l2_at=NULL");
  f.advance(3600000); await f.store.sync();
  assert.equal(f.sql.prepare('SELECT listed FROM noah_intake_families').get().listed, 0);
});
void test('status distinguishes setup/ready mouths and shows reviewer filters with bounded pagination', async t => {
  const f = fixture(t, async () => page([entry(1), entry(2, { remotes: [{ type: 'streamable-http', url: 'https://example.com/mcp', headers: [{ name: 'Authorization', isRequired: true, isSecret: true }] }] }), entry(3, { remotes: [], packages: [] })])); await f.store.sync();
  const status = await f.store.status(); assert.deepEqual(status.mouths, { remote: 2, terminal: 0, remoteReady: 1, terminalReady: 0 }); assert.equal(status.unsupported.no_endpoint, 1); assert.equal(status.reasons.needs_key, 1);
  assert.equal((await f.store.status(new URLSearchParams({ mouth: 'mcp-remote', q: 'Agent 2' }))).families.length, 1);
  await assert.rejects(f.store.status(new URLSearchParams({ offset: '-1' })), e => e.status === 400);
});
void test('short optional declared secrets are not persisted even when the remote needs no setup', async t => {
  const f = fixture(t, async () => page([entry(1, { remotes: [{ type: 'streamable-http', url: 'https://example.com/mcp', headers: [{ name: 'X-Optional', isSecret: true, value: 'tiny-value' }] }] })]));
  await f.store.sync(); assert.equal(f.candidate().state, 'active'); assert.equal(f.candidate().record_json.includes('tiny-value'), false);
});
void test('time budget yields before page writes without failure backoff or advancing the checkpoint', async t => {
  let slow = true;
  const f = fixture(t, async () => { if (slow) f.advance(26000); return page([entry(1)]); });
  const first = await f.store.sync(); assert.equal(first.error, undefined); assert.equal(first.more, true); assert.equal(f.candidate(), undefined);
  assert.equal(f.source().failure_count, 0); assert.equal(f.source().checkpoint_at, null);
  slow = false; assert.equal((await f.store.sync()).seen, 1); assert.equal(f.source().checkpoint_at, NOW);
});
