import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { requestUser } from '../lib/request-auth.ts';
import * as ownerIntent from '../lib/owner-intent.ts';
const ts = createRequire(import.meta.url)('typescript');
const source = ts.transpileModule(readFileSync(new URL('../app/api/csv-jobs/route.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function fixture() {
  const calls = [], exports = {};
  class CsvJobError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
  const modules = new Map([
    ['@/lib/owner-intent', ownerIntent], ['@/lib/request-auth', { requestUser }],
    ['cloudflare:workers', { env: { DB: {} } }],
    ['@/lib/csv-request-limit', { limitCsvRequest: async (_db, user) => calls.push(['limit', user]) }],
    ['@/lib/csv-trial-payment', { csvTrialPayments: () => ({ availability: () => ({ available: false, mode: null }) }) }],
    ['@/lib/csv-transform', { CSV_LIMITS: { bytes: 10000000 } }],
    ['@/lib/csv-job-store', {
      CsvJobError, acceptCsvJob() {},
      listCsvJobs: async user => { calls.push(['list', user]); return []; },
      createCsvJob: async (user, input) => { calls.push(['create', user, input]); return { id: input.id }; },
      csvApiError: error => Response.json({ error: error.message }, { status: error.status ?? (error.message === 'UNAUTHORIZED' ? 401 : error.message === 'ORIGIN' ? 403 : 500) }),
    }],
  ]);
  runInNewContext(source, { exports, File, Response, Uint8Array, require: id => { assert.ok(modules.has(id), id); return modules.get(id); } });
  async function call(method, user = 'alice', scope, origin = 'https://local.test') {
    const headers = { origin, ...(user ? { 'oai-authenticated-user-id': user } : {}), ...(scope === undefined ? {} : { [ownerIntent.OWNER_SCOPE_HEADER]: scope }) };
    const body = new FormData(); body.set('id', '123e4567-e89b-12d3-a456-426614174000'); body.set('file', new File(['name\nTest\n'], 'input.csv')); body.set('specification', '{}');
    // Materialize multipart bytes: Node's streamed FormData encoder can emit a
    // late unhandled rejection when the real owner guard cancels unread input.
    const encoded = new Response(body), bytes = await encoded.arrayBuffer();
    headers['content-type'] = encoded.headers.get('content-type');
    return exports[method](new Request('https://local.test/api/csv-jobs', { method, headers, ...(method === 'GET' ? {} : { body: bytes }) }));
  }
  return { calls, call };
}
void test('CSV history provides the authenticated owner intent and refuses unauthenticated reads', async () => {
  const f = fixture(), a = await (await f.call('GET')).json(), b = await (await f.call('GET', 'bob')).json();
  assert.equal(a.ownerScope, await ownerIntent.ownerScopeFor('alice')); assert.notEqual(a.ownerScope, b.ownerScope);
  assert.equal((await f.call('GET', null)).status, 401);
  assert.deepEqual(f.calls, [['list', 'alice'], ['list', 'bob']]);
});
void test('CSV changed/malformed owner intents are rejected before upload or storage work', async () => {
  const f = fixture(), scope = await ownerIntent.ownerScopeFor('alice');
  for (const [user, expected] of [['bob', scope], ['alice', ''], ['alice', 'invalid']]) {
    const response = await f.call('POST', user, expected);
    assert.equal(response.status, 409); assert.equal((await response.json()).code, ownerIntent.OWNER_CHANGED);
  }
  assert.deepEqual(f.calls, []);
});
void test('CSV matching owner and existing clients without intent remain compatible', async () => {
  const f = fixture(), scope = await ownerIntent.ownerScopeFor('alice');
  assert.equal((await f.call('POST', 'alice', scope)).status, 201);
  assert.equal((await f.call('POST', 'bob')).status, 201);
  assert.deepEqual(f.calls.filter(call => call[0] === 'create').map(call => call[1]), ['alice', 'bob']);
});
void test('CSV owner intent cannot replace authentication or same-origin protection', async () => {
  const f = fixture(), scope = await ownerIntent.ownerScopeFor('alice');
  assert.equal((await f.call('POST', null, scope)).status, 401);
  assert.equal((await f.call('POST', 'alice', scope, 'https://other.test')).status, 403);
  assert.deepEqual(f.calls, []);
});
