// A 100-person synthetic cohort through the same handlers as the phone UI.
// No external accounts, network traffic, production rows or quota changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fixture } from './fixtures/noah/intake.mjs';
import { world, familyId, hostOf, uuid } from './fixtures/noah/connect-world.mjs';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { createNoahExternalAccountStore } from '../lib/noah-external-account-store.ts';
import { AGENTBOARD_PROVIDER, createNoahNativeRegistration } from '../lib/noah-registration-native.ts';
import { createNoahRegistrationApi } from '../lib/noah-registration.ts';
import { createNoahRegisteredMcpFetch } from '../lib/noah-registered-mcp.ts';
import { noahMcpHandshake, noahMcpCall } from '../lib/noah-mouth-mcp-remote.ts';

const settle = async (waiting) => { for (let seen = -1; seen !== waiting.length;) { seen = waiting.length; await Promise.all(waiting); } };

void test('100 registrations survive duplicate taps, finish without polling, isolate issued credentials and return private results', async (t) => {
  const started = performance.now(), f = fixture(t), objects = new Map(), waiting = [], credentials = new Map();
  let writes = 0, registrations = 0, calls = 0;
  const bucket = {
    get: async (key) => { const value = objects.get(key); return value ? { ...value, size: value.value.length, text: async () => value.value } : null; },
    put: async (key, value, options) => {
      const old = objects.get(key);
      if (options?.onlyIf?.etagMatches && old?.etag !== options.onlyIf.etagMatches) return null;
      if (options?.onlyIf?.etagDoesNotMatch === '*' && old) return null;
      const record = { value, etag: String(++writes) }; objects.set(key, record); return record;
    },
  };
  const store = createNoahExternalAccountStore(bucket, { active: 'test', keys: { test: randomBytes(32).toString('hex') } });
  const authenticate = async (request) => { const owner = request.headers.get('x-test-owner'); if (!owner) throw Error('UNAUTHORIZED'); return owner; };
  const fetcher = async (url, init) => {
    assert.equal(init.redirect, 'manual');
    if (String(url).endsWith('/api/agents/register')) {
      registrations++; const { name } = JSON.parse(init.body), credential = `agb_${randomBytes(32).toString('hex')}`;
      credentials.set(credential, name); return Response.json({ credential, agent: { id: name, status: 'active' } });
    }
    const name = credentials.get(init.headers.Authorization?.replace('Bearer ', ''));
    assert.ok(name); return Response.json({ agent: { id: name, status: 'active' } });
  };
  const api = createNoahRegistrationApi({ db: f.db, providers: [AGENTBOARD_PROVIDER], token: randomBytes(32).toString('hex'), executor: createNoahNativeRegistration({ store, authenticate, fetcher }), waitUntil: (p) => waiting.push(p) });
  const people = await Promise.all(Array.from({ length: 100 }, async (_, index) => {
    const owner = `cohort-${index}`, id = randomUUID(), key = randomBytes(32).toString('hex');
    const headers = { Origin: 'https://noah.test', 'Content-Type': 'application/json', 'x-test-owner': owner, 'X-Rock-Owner-Scope': await ownerScopeFor(owner), 'X-Noah-Registration-Key': key };
    const body = JSON.stringify({ action: 'start', id, providerId: 'agentboard', agentId: AGENTBOARD_PROVIDER.agentIds[0], revision: 1, termsVersion: AGENTBOARD_PROVIDER.termsVersion, values: { name: owner }, consent: true, termsAccepted: true });
    return { owner, id, headers, start: () => api(new Request('https://noah.test/api/noah/registration', { method: 'POST', headers, body })) };
  }));
  const accepted = await Promise.all(people.flatMap((p) => [p.start(), p.start()]));
  assert.ok(accepted.every((r) => [200, 202].includes(r.status)));
  await settle(waiting); // No status polling is needed to complete registration.
  assert.equal(registrations, 100); assert.equal(objects.size, 100);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, 100);
  const identityTool = tool('whoami', true, { inputSchema: { type: 'object', required: ['credential'], properties: { credential: { type: 'string' } } } });
  const upstream = mcpServer({ tools: [identityTool], call: (params) => { calls++; return { content: [{ type: 'text', text: credentials.get(params.arguments.credential) ?? 'wrong owner' }] }; } });
  await Promise.all(people.map(async (person, index) => {
    const response = await api(new Request(`https://noah.test/api/noah/registration?job=${person.id}`, { headers: person.headers }));
    assert.equal((await response.json()).job.state, 'completed');
    const other = people[(index + 1) % people.length];
    assert.equal((await api(new Request(`https://noah.test/api/noah/registration?job=${person.id}`, { headers: other.headers }))).status, 404);
    const wrapped = await createNoahRegisteredMcpFetch({ owner: person.owner, url: 'https://www.agentboard.ai/mcp', store, fetcher: upstream.fetch });
    const ctx = { fetch: wrapped }, connected = await noahMcpHandshake('https://www.agentboard.ai/mcp', ctx);
    assert.deepEqual(connected.tools[0].inputSchema.required, []);
    const result = await noahMcpCall(connected.session, 'whoami', {}, ctx);
    assert.equal(result.ok, true); assert.match(JSON.stringify(result), new RegExp(`"${person.owner}"`));
  }));
  assert.equal(calls, 100);
  const persisted = JSON.stringify([...objects.values(), ...f.sql.prepare('SELECT payload FROM work_jobs').all()]);
  for (const key of credentials.keys()) assert.equal(persisted.includes(key), false);
  t.diagnostic(`100 owners, 200 taps, 100 registrations, 100 private calls; ${Math.round(performance.now() - started)}ms locally. Synthetic, not production capacity.`);
});

void test('100 people receive and retain their own results across ten providers, without a device or keeping the screen open', async (t) => {
  const definition = tool('lookup', true, { inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } } });
  const servers = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [hostOf(index + 1), mcpServer({ tools: [definition], call: (params) => ({ content: [{ type: 'text', text: `result:${params.arguments.query}` }] }) })]));
  const w = await world(t, servers), waiting = [];
  // Real D1 batches are atomic; serialize the in-memory fixture's transactions.
  const batch = w.f.db.batch.bind(w.f.db); let last = Promise.resolve();
  w.f.db.batch = (statements) => { const next = last.then(() => batch(statements)); last = next.catch(() => {}); return next; };
  const people = Array.from({ length: 100 }, (_, index) => ({ index, person: w.as(`cohort-${index}`, { waitUntil: (p) => waiting.push(p) }), agent: familyId(index % 10 + 1), connection: uuid(index + 1), job: uuid(index + 1001) }));
  for (const group of [people.slice(0, 50), people.slice(50)]) {
    await Promise.all(group.map(async (p) => {
      const connected = await p.person.connect(p.agent, p.connection);
      assert.equal(connected.body.state, 'connected', JSON.stringify(connected.body));
      const menu = await p.person.tools(p.connection, 'lookup');
      const item = menu.body.tools[0];
      const accepted = await p.person.ask({ id: p.job, connectionId: p.connection, form: { tool: item.name, toolSha256: item.sha256, input: { query: `person-${p.index}` } }, screen: 'narrow' });
      assert.equal(accepted.status, 202, JSON.stringify(accepted.body));
    }));
    await settle(waiting);
  }
  for (const p of people) {
    const result = await p.person.askGet(p.job);
    assert.equal(result.body.state, 'succeeded', JSON.stringify(result.body));
    assert.equal(result.body.result.text, `result:person-${p.index}`);
    assert.equal((await people[(p.index + 1) % 100].person.askGet(p.job)).status, 404);
    const connection = await p.person.get(p.connection);
    assert.equal((await p.person.act(p.connection, 'disconnect', connection.body.revision)).status, 200);
    assert.equal((await p.person.askGet(p.job)).body.result.text, `result:person-${p.index}`);
  }
  assert.equal(w.f.sql.prepare('SELECT COUNT(*) AS n FROM noah_runner_devices').get().n, 0);
  assert.equal(w.f.sql.prepare('SELECT COUNT(*) AS n FROM noah_asks WHERE state=?').get('succeeded').n, 100);
  t.diagnostic('100 owners, 10 providers, 100 saved results and 100 cross-owner denials. Synthetic throughput; external provider limits are unchanged.');
});
