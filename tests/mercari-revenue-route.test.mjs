import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { loadRouteFixture } from './route-fixture.mjs';
import * as auth from '../lib/request-auth.ts';
import * as operations from '../lib/operations.ts';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const value = (id = randomUUID()) => ({
  id, channel: 'consumer_assisted', title: 'Synthetic owned stock', condition: 'Checked fixture',
  facts: 'Local fixture only.', priceJPY: 3000, marketplaceFeeJPY: 300, shippingJPY: 750,
  itemCostJPY: 0, otherCostJPY: 0, ownsStock: true, accurate: true, prohibitedChecked: true,
});
async function setup(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter((name) => name.endsWith('.sql') && !name.startsWith('._')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
  const db = { prepare(sql) { return { bind(...args) { return {
    async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
  }; } }; } };
  // Only the Cloudflare DB binding is substituted; the real auth, streamed body
  // parser, route, normalization, owner-scoped store and SQLite statements run.
  const fund = { database: () => db, requestUser: auth.requestUser };
  const api = loadRouteFixture(new URL('../lib/operations-api.ts', import.meta.url),
    new Map([['./fund-store', fund], ['./operations', operations]]));
  const route = loadRouteFixture(new URL('../app/api/revenue/mercari/route.ts', import.meta.url), new Map([
    ['@/lib/fund-store', fund], ['@/lib/operations-api', api], ['@/lib/operations', operations], ['@/lib/request-auth', auth],
    ...await Promise.all(['owner-intent', 'mercari-revenue', 'mercari-revenue-store'].map(async (name) =>
      [`@/lib/${name}`, await import(new URL(`../lib/${name}.ts`, import.meta.url).href)])),
  ]));
  async function call(method, input, { owner = 'alice', origin = 'https://fixture.invalid', contentType = 'application/json', raw } = {}) {
    const headers = { origin, 'content-type': contentType, ...(owner ? { 'oai-authenticated-user-id': owner } : {}) };
    const response = await route[method](new Request('https://fixture.invalid/api/revenue/mercari', {
      method, headers, ...(method === 'GET' ? {} : { body: raw ?? JSON.stringify(input) }),
    }));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, body: await response.json() };
  }
  const rows = () => sqlite.prepare('SELECT * FROM mercari_revenue_plans ORDER BY id').all();
  return { sqlite, route, call, rows };
}

void test('real Mercari handler replays a committed creation without resetting saved state', async (t) => {
  const f = await setup(t), input = value();
  const first = await f.call('POST', input);
  assert.equal(first.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const snapshot = f.rows();
  const retry = await f.call('POST', input); // First response may have been lost in transport.
  assert.equal(retry.status, 200); assert.deepEqual(retry.body, first.body);
  assert.deepEqual(f.rows(), snapshot, 'no timestamp/revision rewrite on retry');
  const approved = await f.call('PATCH', { id: input.id, action: 'approve', expectedRevision: 0 });
  assert.equal(approved.status, 200);
  assert.deepEqual((await f.call('POST', input)).body, approved.body);
  assert.deepEqual((await f.call('GET')).body.plans, [approved.body]);
  assert.equal((await f.call('POST', { ...input, priceJPY: 3001 })).status, 409);
  assert.equal((await f.call('PATCH', { id: input.id, action: 'cancel', expectedRevision: 0 })).status, 409);
  assert.equal(f.rows().length, 1);
});

void test('real handler keeps ownership, authentication and origin boundaries on retries', async (t) => {
  const f = await setup(t), input = value();
  assert.equal((await f.call('POST', input)).status, 200);
  const before = f.rows();
  assert.deepEqual((await f.call('GET', undefined, { owner: 'bob' })).body.plans, []);
  const foreign = await f.call('POST', input, { owner: 'bob' });
  assert.equal(foreign.status, 409); assert.deepEqual(Object.keys(foreign.body), ['error']);
  assert.equal((await f.call('PATCH', { id: input.id, action: 'approve', expectedRevision: 0 }, { owner: 'bob' })).status, 404);
  assert.equal((await f.call('POST', input, { owner: '' })).status, 401);
  assert.equal((await f.call('POST', input, { origin: 'https://other.invalid' })).status, 403);
  assert.deepEqual(f.rows(), before);
});

void test('real handler rejects oversized, corrupt and invalid inputs before saving', async (t) => {
  const f = await setup(t);
  const input = value(), json = JSON.stringify(input);
  assert.equal((await f.call('POST', input, { raw: json + ' '.repeat(4096 - Buffer.byteLength(json)) })).status, 200);
  const before = f.rows();
  for (const options of [{ raw: json + ' '.repeat(4097 - Buffer.byteLength(json)) }, { raw: ' '.repeat(4097) }])
    assert.equal((await f.call('POST', input, options)).status, 413);
  for (const raw of ['{broken', new Uint8Array([0xff, 0xfe])])
    assert.equal((await f.call('POST', input, { raw })).status, 400);
  assert.equal((await f.call('POST', input, { contentType: 'text/plain' })).status, 415);
  for (const patch of [{ priceJPY: 299 }, { facts: 'x'.repeat(1201) }, { ownsStock: false }, { verified: true }])
    assert.equal((await f.call('POST', { ...input, ...patch })).status, 400);
  assert.deepEqual(f.rows(), before);
});

void test('precommit failure leaves no row and retry safely saves once', async (t) => {
  const f = await setup(t), input = value();
  f.sqlite.exec("CREATE TRIGGER fixture_fail BEFORE INSERT ON mercari_revenue_plans BEGIN SELECT RAISE(ABORT, 'fixture unavailable'); END");
  assert.equal((await f.call('POST', input)).status, 503); assert.equal(f.rows().length, 0);
  f.sqlite.exec('DROP TRIGGER fixture_fail');
  const saved = await f.call('POST', input);
  assert.equal(saved.status, 200); assert.deepEqual((await f.call('GET')).body.plans, [saved.body]);
  assert.equal((await f.call('POST', input)).status, 200); assert.equal(f.rows().length, 1);
});

void test('concurrent identical handler requests converge and replay works at the 100-plan limit', async (t) => {
  const f = await setup(t), input = value();
  const [a, b] = await Promise.all([f.call('POST', input), f.call('POST', input)]);
  assert.equal(a.status, 200); assert.equal(b.status, 200); assert.deepEqual(a.body, b.body);
  for (let i = 1; i < 100; i++) assert.equal((await f.call('POST', value())).status, 200);
  assert.equal((await f.call('POST', value())).status, 409);
  assert.deepEqual((await f.call('POST', input)).body, a.body);
  assert.equal(f.rows().length, 100);
  assert.equal((await f.call('GET')).body.plans.length, 50, 'existing list window unchanged');
});
