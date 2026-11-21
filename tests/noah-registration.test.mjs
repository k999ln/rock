import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { createNoahRegistrationApi, parseRegistrationProviders, registrationFingerprint } from '../lib/noah-registration.ts';
import { normalizeWorkJob } from '../lib/workflow.ts';
const NOW = Date.UTC(2026, 10, 20), key = () => randomBytes(32).toString('hex');
const provider = () => ({ id: 'example', name: 'Example Service', agentIds: ['agent-one'], revision: 1, providerOrigin: 'https://provider.example.com', verificationUrl: 'https://provider.example.com/verify', termsUrl: 'https://provider.example.com/terms', termsVersion: 'v1', executorName: 'Registration Agent', executorUrl: 'https://registration.example.com/run', fields: [{ key: 'email', label: 'メール', type: 'email', required: true, maxLength: 200 }, { key: 'password', label: 'パスワード', type: 'password', required: true, maxLength: 200 }] });
const input = (extra = {}) => ({ action: 'start', id: randomUUID(), providerId: 'example', agentId: 'agent-one', revision: 1, termsVersion: 'v1', values: { email: 'synthetic-user@example.test', password: 'synthetic-private-password' }, consent: true, termsAccepted: true, ...extra });
function fixture(t, extra = {}) {
  const sql = new DatabaseSync(':memory:'); t.after(() => sql.close()); sql.exec('CREATE TABLE work_jobs(id TEXT PRIMARY KEY,user_id TEXT,payload TEXT,revision INTEGER,updated_at TEXT)');
  const db = { prepare(query) { const s = { args: [], bind(...args) { return { ...s, args }; }, async first() { return sql.prepare(query).get(...this.args) ?? null; }, async run() { return { meta: { changes: Number(sql.prepare(query).run(...this.args).changes) } }; } }; return s; } };
  let time = NOW, state = 'needs_user'; const calls = [];
  const deps = { db, providers: parseRegistrationProviders(JSON.stringify([provider()])), token: 'synthetic-only-test-authorization-'.repeat(2), now: () => time, fetcher: async (url, init) => { const body = JSON.parse(init.body); calls.push({ url, init, body }); return Response.json({ id: body.id, state, password: 'must-not-store-response-secret', url: 'https://attacker.example/' }); }, ...extra };
  const api = createNoahRegistrationApi(deps);
  const request = (body, ticket, headers = {}) => new Request('https://noah.test/api/noah/registration', { method: 'POST', headers: { Origin: 'https://noah.test', 'Content-Type': 'application/json', 'X-Noah-Registration-Key': ticket, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { deps, api, sql, calls, request, advance: ms => { time += ms; }, state: s => { state = s; },
    start: (body, ticket, headers) => api(request(body, ticket, headers)), get: (id, ticket) => api(new Request('https://noah.test/api/noah/registration' + (id ? `?job=${id}` : ''), { headers: ticket ? { 'X-Noah-Registration-Key': ticket } : {} })), row: () => sql.prepare('SELECT * FROM work_jobs').get() };
}
void test('configuration only permits declared HTTPS destinations and unique bounded fields; no arbitrary URL from input', () => {
  assert.equal(parseRegistrationProviders(JSON.stringify([provider()])).length, 1);
  for (const change of [{ executorUrl: 'http://registration.example.com/run' }, { providerOrigin: 'https://127.0.0.1' }, { verificationUrl: 'https://attacker.example.com' }, { termsUrl: 'https://provider.example.com/terms?secret=x' }, { revision: 0 }, { fields: [{ key: '__proto__', label: 'bad', type: 'text', required: true, maxLength: 10 }] }, { fields: [provider().fields[0], provider().fields[0]] }, { agentIds: [] }]) assert.deepEqual(parseRegistrationProviders(JSON.stringify([{ ...provider(), ...change }])), []);
  assert.deepEqual(parseRegistrationProviders('invalid'), []);
});
void test('anonymous users see fields and recipients but not executor credentials or private URL path', async t => {
  const f = fixture(t); const response = await f.get(); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store, private'); assert.equal(body.providers[0].fields[1].type, 'password');
  assert.equal(body.providers[0].executorOrigin, 'https://registration.example.com'); assert.doesNotMatch(JSON.stringify(body), /executorUrl|\/run|synthetic-only-test/);
  const disabled = createNoahRegistrationApi({ ...f.deps, token: undefined }); assert.deepEqual(await (await disabled(new Request('https://noah.test/api/noah/registration'))).json(), { providers: [] });
});
void test('actual registration invocation receives approved fields exactly once and Work contains no raw credentials', async t => {
  const f = fixture(t), ticket = key(), body = input(); const response = await f.start(body, ticket); const data = await response.json();
  assert.equal(response.status, 202); assert.equal(data.job.state, 'needs_user'); assert.equal(data.job.verificationUrl, provider().verificationUrl); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].body.action, 'register'); assert.deepEqual(f.calls[0].body.values, body.values); assert.equal(f.calls[0].body.providerOrigin, provider().providerOrigin);
  assert.equal(f.calls[0].url, provider().executorUrl); assert.equal(f.calls[0].init.redirect, 'manual'); assert.match(f.calls[0].init.headers.Authorization, /^Bearer /);
  const raw = JSON.stringify(f.row()); for (const value of [ticket, body.values.email, body.values.password, 'must-not-store-response-secret', 'attacker.example']) assert.equal(raw.includes(value), false, value);
  const work = JSON.parse(f.row().payload); assert.equal(normalizeWorkJob(work), work); assert.equal(work.steps.length, 0); assert.equal(work.noahRegistration.verification, 'registration_agent_reported');
  assert.doesNotMatch(JSON.stringify(data), /synthetic-private|synthetic-user|requestDigest|providerDigest/);
});
void test('consent, exact field set, schema version, same Origin and capability are required before sending', async t => {
  const f = fixture(t), ticket = key();
  for (const [change, status] of [[{ consent: false }, 400], [{ termsAccepted: false }, 400], [{ revision: 2 }, 409], [{ termsVersion: 'v0' }, 409], [{ providerId: 'unknown' }, 404], [{ agentId: 'other' }, 404], [{ values: { email: 'bad' } }, 400], [{ values: { ...input().values, callbackUrl: 'https://evil.example' } }, 400], [{ values: { ...input().values, password: 'x'.repeat(201) } }, 400], [{ executorUrl: 'https://evil.example' }, 400]]) assert.equal((await f.start(input(change), ticket)).status, status);
  assert.equal((await f.start(input(), ticket, { Origin: 'https://evil.example' })).status, 403); assert.equal((await f.start(input(), '', {})).status, 401); assert.equal((await f.start(input(), ticket, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await f.start('x'.repeat(8193), ticket)).status, 413); assert.equal((await f.start('{', ticket)).status, 400);
  assert.equal(f.calls.length, 0); assert.equal(f.row(), undefined);
});
void test('same-ID replays do not rerun; changed fields conflict and another browser cannot read or reuse the work', async t => {
  const f = fixture(t), ticket = key(), body = input(); await f.start(body, ticket);
  assert.equal((await f.start(body, ticket)).status, 200); assert.equal(f.calls.length, 1);
  assert.equal((await f.start({ ...body, values: { ...body.values, password: 'different' } }, ticket)).status, 409);
  assert.equal((await f.get(body.id, key())).status, 404); assert.equal((await f.get(body.id)).status, 401);
  assert.equal((await f.start(body, key())).status, 429); assert.equal(f.calls.length, 1);
  const digest1 = await registrationFingerprint(ticket, body.values), digest2 = await registrationFingerprint(key(), body.values); assert.notEqual(digest1, digest2);
});
void test('concurrent submissions claim the work atomically and run registration once', async t => {
  const f = fixture(t), ticket = key(), body = input(); const responses = await Promise.all([f.start(body, ticket), f.start(body, ticket)]);
  assert.ok(responses.every(r => [200, 202].includes(r.status))); assert.equal(f.calls.filter(c => c.body.action === 'register').length, 1);
});
void test('needs-user continues through status-only calls; completed report never becomes verified Work', async t => {
  const f = fixture(t), ticket = key(), body = input(); await f.start(body, ticket);
  await f.get(body.id, ticket); assert.equal(f.calls.length, 1);
  f.advance(21000); f.state('completed'); const response = await f.get(body.id, ticket); const data = await response.json();
  assert.equal(f.calls.length, 2); assert.equal(f.calls[1].body.action, 'status'); assert.equal('values' in f.calls[1].body, false);
  assert.equal(data.job.state, 'completed'); assert.equal(data.job.verificationUrl, null); assert.equal(data.job.returnTo, '/noah/agents/agent-one');
  const job = JSON.parse(f.row().payload); assert.equal(job.status, 'review'); assert.equal(job.steps.length, 0);
  f.advance(6000); await f.get(body.id, ticket); assert.equal(f.calls.length, 2);
});
void test('changed provider configuration cannot reroute previously approved registration or verification links', async t => {
  const f = fixture(t), ticket = key(), body = input(); await f.start(body, ticket); f.advance(21000);
  f.deps.providers[0].executorUrl = 'https://changed.example/run'; f.deps.providers[0].verificationUrl = 'https://changed.example/verify';
  const data = await (await f.get(body.id, ticket)).json(); assert.equal(f.calls.length, 1); assert.equal(data.job.verificationUrl, null);
});
void test('unknown transport result is retained and checked without resubmission; oversized or mismatched replies fail closed', async t => {
  for (const mode of ['network', 'id', 'size', 'status']) {
    let calls = 0;
    const f = fixture(t, { fetcher: async (_url, init) => { calls++; const b = JSON.parse(init.body); if (mode === 'network') throw Error('sensitive synthetic upstream failure'); if (mode === 'size') return new Response('x'.repeat(8193)); if (mode === 'status') return Response.json({ id: b.id, state: 'approved' }); return Response.json({ id: 'other', state: 'completed' }); } });
    const ticket = key(), body = input(); const response = await f.start(body, ticket); assert.equal((await response.json()).job.state, 'unknown'); await f.start(body, ticket); assert.equal(calls, 1);
    assert.doesNotMatch(f.row().payload, /sensitive synthetic|synthetic-user|synthetic-private/);
  }
});
void test('per-browser and global caps precede dispatch; expired capability is not restored', async t => {
  const f = fixture(t), ticket = key(); let first;
  for (let n = 0; n < 10; n++) { const b = input(); first ??= b.id; assert.equal((await f.start(b, ticket)).status, 202); }
  assert.equal((await f.start(input(), ticket)).status, 429); assert.equal(f.calls.length, 10);
  const row = f.row(); f.sql.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify({ ...JSON.parse(row.payload), noahRegistration: { ...JSON.parse(row.payload).noahRegistration, expiresAt: NOW - 1 } }), row.id);
  assert.equal((await f.get(row.id, ticket)).status, 410);
  const f2 = fixture(t); const b = input(); await f2.start(b, key());
  f2.sql.exec(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<199) INSERT INTO work_jobs SELECT 'extra-'||x,'other-'||x,payload,revision,updated_at FROM n,work_jobs WHERE id='${b.id}'`);
  assert.equal((await f2.start(input(), key())).status, 429); assert.equal(f2.calls.length, 1);
});
void test('background dispatch is registered before response; refresh never starts another registration', async t => {
  const tasks = []; const f = fixture(t, { waitUntil: promise => tasks.push(promise) }), ticket = key(), body = input();
  assert.equal((await f.start(body, ticket)).status, 202); await Promise.all(tasks); assert.equal(f.calls.length, 1); assert.equal(tasks.length, 1);
  assert.equal((await (await f.get(body.id, ticket)).json()).job.state, 'needs_user');
});
