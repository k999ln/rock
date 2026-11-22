import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createNoahFeedApi } from '../lib/noah-feed.ts';
import { createSkyToolPackageDraft } from '../lib/sky-tool-package.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';

function fixture(t, publicTags = () => []) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  for (const file of ['0021_sites_schema_convergence.sql','0036_noah_feed_preferences.sql','0042_noah_recommendations.sql']) db.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  let time = 1800000000000;
  const api = createNoahFeedApi({ publicTags, clock: () => time, authenticate: async request => { const owner = request.headers.get('test-owner'); if (!owner) throw new Error('UNAUTHORIZED'); return owner; }, db: { prepare(sql) { return { bind(...args) { return { async all() { return { results: db.prepare(sql).all(...args) }; } }; } }; } } });
  function publish(n, { author = 'author-a', status = 'verified', expires = time + 100000, reviewHash = 'hash', published = time - n, category = 'development', review = true } = {}) {
    const manifest = createSkyToolPackageDraft({ sourceKind: 'github', sourceUrl: 'https://github.com/example/agent', developerId: author, developerName: author, license: 'MIT', name: `Agent ${n}` });
    manifest.id = `dev.example.agent-${n}`; manifest.fund.categories = [category]; manifest.fund.tags = ['automation'];
    const key = `${manifest.id}@0.1.0`;
    db.prepare('INSERT INTO sky_tool_packages(package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at,published_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(key, manifest.id, '0.1.0', author, JSON.stringify(manifest), 'hash', status, time - 1000, time, published);
    if (review) db.prepare('INSERT INTO sky_tool_package_reviews(id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(), key, reviewHash, 'reviewer', 'verified', '{}', '{}', '', time - 1000, expires);
    return key;
  }
  return { api, db, publish, time: () => time, advance: n => { time += n; } };
}
const getRequest = (query = '', owner = 'alice') => new Request('https://noah.example/api/noah/feed?' + query, { headers: owner ? { 'test-owner': owner } : {} });
async function setRequest(value, owner = 'alice', override = {}) {
  return new Request('https://noah.example/api/noah/feed', { method: 'PUT', headers: { origin: 'https://noah.example', 'content-type': 'application/json', 'test-owner': owner, 'x-rock-owner-scope': await ownerScopeFor(owner), ...override }, body: JSON.stringify(value) });
}
void test('public feed only contains currently reviewed publications, never draft, expired, revoked or changed digest', async t => {
  const { api, publish, advance } = fixture(t);
  const publicKey = publish(1); publish(2, { status: 'submitted' }); publish(3, { status: 'revoked' }); publish(4, { expires: 1 }); publish(5, { reviewHash: 'different' }); publish(6, { review: false }); publish(7, { published: null });
  const data = await (await api.get(getRequest('', null))).json();
  assert.deepEqual(data.entries.map(e => e.packageKey), [publicKey]); assert.equal(data.ownerScope, null); assert.deepEqual(data.preferences, []);
  advance(100001); assert.equal((await (await api.get(getRequest())).json()).entries.length, 0);
});
void test('keyset pagination is deterministic at equal timestamps; new arrivals and revocations are handled without duplication', async t => {
  const { api, publish, db, time } = fixture(t); for (let n = 1; n <= 25; n++) publish(n, { published: time() - 1 });
  const first = await (await api.get(getRequest('order=latest'))).json(); assert.equal(first.entries.length, 20); assert.ok(first.nextCursor);
  const unseen = Array.from({length:25},(_,i)=>`dev.example.agent-${i+1}@0.1.0`).find(k => !first.entries.some(e => e.packageKey === k));
  assert.ok(unseen); db.prepare("UPDATE sky_tool_packages SET status='revoked' WHERE package_key=?").run(unseen);
  publish(26, { published: time() + 1 });
  const last = await (await api.get(getRequest('order=latest&cursor=' + encodeURIComponent(first.nextCursor)))).json();
  assert.equal(last.entries.length, 4); assert.equal(last.nextCursor, null);
  const all = [...first.entries, ...last.entries].map(e => e.packageKey); assert.equal(new Set(all).size, 24); assert.ok(!all.includes(unseen));
});
void test('explicit interests and follows change order only when enabled; preferences are owner isolated', async t => {
  const { api, publish } = fixture(t); publish(1, { author: 'new-publisher' }); const related = publish(2, { author: 'followed-publisher', category: 'writing' });
  for (const [kind, subject] of [['follow','followed-publisher'],['interest','writing']]) assert.equal((await api.set(await setRequest({ kind, subject, active: true }))).status, 200);
  assert.notEqual((await (await api.get(getRequest())).json()).entries[0].packageKey, related);
  await api.set(await setRequest({ kind: 'personalize', subject: 'enabled', active: true }));
  const ranked = await (await api.get(getRequest())).json(); assert.equal(ranked.entries[0].packageKey, related); assert.equal(ranked.entries[0].reason, 'フォロー中の提供元');
  const following = await (await api.get(getRequest('order=following'))).json(); assert.deepEqual(following.entries.map(e => e.packageKey), [related]);
  const bob = await (await api.get(getRequest('', 'bob'))).json(); assert.deepEqual(bob.preferences, []); assert.notEqual(bob.entries[0].packageKey, related);
  await api.set(await setRequest({ kind: 'hide', subject: 'dev.example.agent-2', active: true }));
  assert.equal((await (await api.get(getRequest())).json()).entries.length, 1);
  assert.equal((await (await api.get(getRequest('', 'bob'))).json()).entries.length, 2);
});
void test('stale and cross-owner cursors fail and do not silently reuse another recommendation context', async t => {
  const { api, publish } = fixture(t); for (let n = 1; n <= 25; n++) publish(n);
  const first = await (await api.get(getRequest())).json(), query = 'cursor=' + encodeURIComponent(first.nextCursor);
  assert.equal((await api.get(getRequest(query, 'bob'))).status, 400);
  await api.set(await setRequest({ kind: 'interest', subject: 'writing', active: true }));
  assert.equal((await api.get(getRequest(query))).status, 400);
});
void test('preference writes require authenticated same-origin current owner, remain idempotent and bounded', async t => {
  const { api, db } = fixture(t), value = { kind: 'follow', subject: 'publisher', active: true };
  assert.equal((await api.set(await setRequest(value, ''))).status, 401);
  assert.equal((await api.set(await setRequest(value, 'alice', { origin: 'https://evil.example' }))).status, 403);
  assert.equal((await api.set(await setRequest(value, 'alice', { 'x-rock-owner-scope': await ownerScopeFor('bob') }))).status, 409);
  assert.equal((await api.set(await setRequest(value))).status, 200); assert.equal((await api.set(await setRequest(value))).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM noah_feed_preferences').get().n, 1);
  for (let n = 1; n < 256; n++) db.prepare('INSERT INTO noah_feed_preferences VALUES(?,?,?,?)').run('alice','follow',`p${n}`,1);
  assert.equal((await api.set(await setRequest({ ...value, subject: 'too-many' }))).status, 429);
  assert.equal((await api.set(await setRequest(value))).status, 200);
  assert.equal((await api.set(await setRequest({ ...value, active: false }))).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM noah_feed_preferences').get().n, 255);
});

void test('published recommendations use opted-in successful owner history and supported runtime, and reset changes invalidate cursors', async t => {
  const f = fixture(t, id => id === 'known' ? ['automation'] : []);
  for (let n = 1; n <= 25; n++) f.publish(n);
  await f.api.set(await setRequest({kind:'personalize',subject:'enabled',active:true}));
  f.db.prepare('INSERT INTO noah_recommendation_settings VALUES(?,1,1,?,?,?)').run('alice',f.time()-100,'headless',f.time());
  f.db.prepare("INSERT INTO work_jobs(id,user_id,payload,updated_at) VALUES(?,?,?,'2027-01-15')").run('success','alice',JSON.stringify({noahExecution:{agentId:'known',state:'returned',startedAt:f.time()-50,completedAt:f.time()-20,result:{exitCode:0}}}));
  const ranked = await (await f.api.get(getRequest())).json();
  assert.equal(ranked.entries.length,20);
  assert.ok(ranked.entries.every(e=>e.reason==='同意後に利用したAgentの公開タグに関連'));
  const other = await (await f.api.get(getRequest('', 'bob'))).json();
  assert.ok(other.entries.every(e=>!e.reason.includes('履歴')));
  f.db.prepare('UPDATE noah_recommendation_settings SET revision=2,history_since=? WHERE owner_id=?').run(f.time(),'alice');
  assert.equal((await f.api.get(getRequest('cursor='+encodeURIComponent(ranked.nextCursor)))).status,400);
  const cleared = await (await f.api.get(getRequest())).json();
  assert.ok(cleared.entries.every(e=>!e.reason.includes('履歴')));
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM work_jobs').get().n,1);
});
