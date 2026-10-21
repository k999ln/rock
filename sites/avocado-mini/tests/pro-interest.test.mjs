import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from '../worker/index.js';

const origin = 'https://avocadopro.si';
const migrations = readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()
  .map(name => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'));
function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const sql of migrations) sqlite.exec(sql);
  return {
    sqlite,
    prepare(sql) {
      return {
        bind(...values) {
          const statement = sqlite.prepare(sql);
          return {
            async run() { const result = statement.run(...values); return { meta: { changes: result.changes } }; },
            async first() { return statement.get(...values) || null; },
            async all() { return { results: statement.all(...values) }; },
          };
        },
        async all() { return { results: sqlite.prepare(sql).all() }; },
      };
    },
  };
}
const configuration = { kit: 'value', gpu: '5060ti', ram: '64', ssd: '2', chassis: 'studio' };
const environment = (db, more = {}) => ({ DB: db, PARTICIPATION_ABUSE_KEY: 'test-only-secret', PREORDER_ADMIN_TOKEN: 'test-only-admin-token-long-enough', ...more });
function request(body = {}, host = origin, headers = {}) {
  return new Request(`${host}/api/pro-interest/submissions`, { method: 'POST',
    headers: { origin: host, 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.5', ...headers },
    body: JSON.stringify({ email: 'buyer@example.com', region: 'Japan', note: 'Local models', configuration, contactConsent: true, consentVersion: '2026-10-19.1', ...body }),
  });
}

test('purchase interest opens only with database and abuse protection', async t => {
  const db = database(); t.after(() => db.sqlite.close());
  const closed = await worker.fetch(new Request(`${origin}/api/pro-interest/availability`), environment(db, { PARTICIPATION_ABUSE_KEY: '' }));
  assert.deepEqual(await closed.json(), { open: false });
  const open = await worker.fetch(new Request(`${origin}/api/pro-interest/availability`), environment(db));
  assert.deepEqual(await open.json(), { open: true, consentVersion: '2026-10-19.1' });
});

test('valid configuration is received privately and removable with receipt', async t => {
  const db = database(); t.after(() => db.sqlite.close());
  const response = await worker.fetch(request(), environment(db));
  assert.equal(response.status, 201);
  const receipt = await response.json();
  const row = db.sqlite.prepare('SELECT * FROM pro_purchase_interests WHERE id = ?').get(receipt.id);
  assert.equal(row.email, 'buyer@example.com');
  assert.deepEqual(JSON.parse(row.configuration_json), configuration);
  assert.equal(row.status, 'received');
  assert.equal(JSON.stringify(row).includes(receipt.removalCode), false);
  assert.equal(JSON.stringify(row).includes('203.0.113.5'), false);
  const removal = await worker.fetch(new Request(`${origin}/api/pro-interest/submissions`, {
    method: 'DELETE', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(receipt),
  }), environment(db));
  assert.deepEqual(await removal.json(), { removed: true });
  assert.equal(db.sqlite.prepare('SELECT id FROM pro_purchase_interests WHERE id = ?').get(receipt.id), undefined);
});

test('invalid configurations, origins, and excessive attempts fail closed', async t => {
  const db = database(); t.after(() => db.sqlite.close());
  const env = environment(db);
  assert.equal((await worker.fetch(request({ configuration: { ...configuration, gpu: '5090' } }), env)).status, 400);
  assert.equal((await worker.fetch(request({ contactConsent: false }), env)).status, 400);
  assert.equal((await worker.fetch(request({ email: 'bad' }), env)).status, 400);
  assert.equal((await worker.fetch(request({}, 'https://avocadomini.si'), env)).status, 404);
  assert.equal((await worker.fetch(request({}, origin, { origin: 'https://evil.example' }), env)).status, 403);
  for (let i = 0; i < 5; i++) assert.equal((await worker.fetch(request({ note: `Model use ${i}` }), env)).status, 201);
  assert.equal((await worker.fetch(request(), env)).status, 429);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM pro_purchase_interests').get().n, 5);
});
