import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { parseEsimCloudPolicies } from '../lib/esim-cloud-grant.ts';
import { readEsimCloudRequest, esimCloudCookie, esimCloudRequestScope, esimCloudRequestToken, authenticateEsimCloudRequest } from '../lib/esim-cloud-access.ts';
import { requestUsesEsimCloudIdentity } from '../lib/request-auth.ts';
import { rockstarServiceScopeAllowed } from '../lib/rockstar-service-access.ts';

const policy = { packageKey: 'esim-fixture', manifestSha256: 'a'.repeat(64), accessDurationDays: 60,
  scopes: ['rockstaros_access', 'sky', 'zema', 'agents'] };
const secret = `rock_esim_${'a'.repeat(43)}`;
const request = (path = '/api/rockstar/device-home', options = {}) => new Request(`https://rock.test${path}`, options);

void test('cloud policies fail closed without explicit bounded service terms and known scopes', () => {
  assert.deepEqual(parseEsimCloudPolicies(JSON.stringify([policy])), [policy]);
  for (const value of [undefined, '', '{}', '[]', 'x'.repeat(32769),
    JSON.stringify([policy, policy]), ...[
      { accessDurationDays: 0 }, { accessDurationDays: 367 }, { accessDurationDays: 1.5 },
      { scopes: ['payments'] }, { scopes: ['sky'] }, { scopes: ['rockstaros_access', 'rockstaros_access'] },
      { manifestSha256: 'wrong' }, { packageKey: '../../secret' }, { price: 0 },
    ].map((patch) => JSON.stringify([{ ...policy, ...patch }]))])
    assert.deepEqual(parseEsimCloudPolicies(value), []);
});

void test('cloud credentials use one HttpOnly cookie and never authorize unknown, payment or key-management routes', async () => {
  const cookie = esimCloudCookie(request(), secret, Date.now() + 60000);
  assert.match(cookie, /Path=\/api; HttpOnly; SameSite=Strict; Max-Age=\d+; Secure$/);
  assert.match(esimCloudCookie(request(), null), /Max-Age=0/);
  assert.throws(() => esimCloudCookie(new Request('http://public.example/api'), secret), /HTTPS_REQUIRED/);
  assert.doesNotThrow(() => esimCloudCookie(new Request('http://localhost:3000/api'), secret));
  assert.equal(esimCloudRequestToken(request('/', { headers: { cookie: `rock_esim_access=${secret}` } })), secret);
  assert.equal(esimCloudRequestToken(request('/', { headers: { cookie: `rock_esim_access=${secret}; rock_esim_access=${secret}` } })), null);
  assert.equal(esimCloudRequestScope(request()), 'rockstaros_access');
  assert.equal(esimCloudRequestScope(request('/api/sky/a2a-agents')), 'agents');
  assert.equal(esimCloudRequestScope(request('/api/work-jobs', { method: 'POST' })), 'zema');
  assert.equal(esimCloudRequestScope(request('/api/sky/a2a-delegations/task-id', { method: 'PATCH' })), 'agents');
  assert.equal(esimCloudRequestScope(request('/api/sky/a2a-delegations/task-id/artifacts')), 'agents');
  assert.equal(esimCloudRequestScope(request('/api/llm/text/future-path')), null);
  assert.equal(esimCloudRequestScope(request('/api/work-jobs/future-path')), null);
  for (const path of ['/api/esim/orders/x/cloud-access', '/api/stripe/webhook', '/api/admin', '/api/amc', '/api/sky/library', '/api/sky/payments', '/api/sky/purchases', '/api/llm/quotes/x/anything'])
    assert.equal(esimCloudRequestScope(request(path)), null);
  const unusedDb = { prepare() { throw new Error('must not query'); } };
  await assert.rejects(authenticateEsimCloudRequest(request('/api/admin', { headers: { authorization: `Bearer ${secret}` } }), unusedDb, {}), /UNAUTHORIZED/);
  await assert.rejects(authenticateEsimCloudRequest(request('/api/work-jobs', { method: 'POST', headers: { cookie: `rock_esim_access=${secret}` } }), unusedDb, {}), /ORIGIN/);
});

void test('cloud identity precedence cannot inherit preview permissions or broader account scopes', async () => {
  const headers = { cookie: `rock_esim_access=${secret}`, 'oai-authenticated-user-email': 'untrusted@example.invalid' };
  assert.equal(requestUsesEsimCloudIdentity(request('/', { headers })), true);
  assert.equal(requestUsesEsimCloudIdentity(request('/', { headers: { ...headers, 'oai-authenticated-user-id': 'alice' } })), false);
  assert.equal(requestUsesEsimCloudIdentity(request('/', { headers: { ...headers, authorization: `Bearer ${secret}`, 'oai-authenticated-user-id': 'alice' } })), true);
  const db = { prepare() { return { bind() { return { async first() { return null; } }; } }; } };
  assert.equal(await rockstarServiceScopeAllowed(db, 'alice', 'sky', 'false', {}, request('/', { headers })), false);
  assert.equal(await rockstarServiceScopeAllowed(db, 'alice', 'sky', 'false', {}), true);
});

void test('database enforces one active key per order and rejects nullable active slots', (t) => {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../drizzle/0060_esim_cloud_access_keys.sql', import.meta.url), 'utf8'));
  const insert = sqlite.prepare(`INSERT INTO esim_cloud_access_keys
    (id,sky_order_id,owner_user_id,device_ref,entitlement_receipt_sha256,token_sha256,scopes_json,created_at,expires_at,active_slot)
    VALUES (?,'order','alice','device',?,?,'["rockstaros_access"]',1,100,?)`);
  assert.throws(() => insert.run('invalid', 'a'.repeat(64), 'b'.repeat(64), null), /CHECK constraint/);
  insert.run('first', 'a'.repeat(64), 'b'.repeat(64), 'order');
  assert.throws(() => insert.run('second', 'a'.repeat(64), 'c'.repeat(64), 'order'), /UNIQUE constraint/);
  sqlite.exec("UPDATE esim_cloud_access_keys SET revoked_at=2,active_slot=NULL WHERE id='first'");
  insert.run('second', 'a'.repeat(64), 'c'.repeat(64), 'order');
});

void test('cloud management stops oversized chunked bodies without draining the upload', async () => {
  let reads = 0; let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { reads++; controller.enqueue(new Uint8Array(600)); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  await assert.rejects(readEsimCloudRequest(new Request('https://rock.test/api', {
    method: 'POST', body: stream, duplex: 'half',
  })), /CLOUD_ACCESS_BODY_TOO_LARGE/);
  assert.equal(reads, 2);
  assert.equal(cancelled, true);
  const exact = 'a'.repeat(1024);
  assert.equal(await readEsimCloudRequest(new Request('https://rock.test/api', { method: 'POST', body: exact })), exact);
});
