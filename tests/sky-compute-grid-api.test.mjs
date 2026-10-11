import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, beforeEach } from 'node:test';
import {
  b64,
  DATA_KEY,
  deviceBody,
  enrollDevice,
  lexicalOffer,
  openGridDatabase,
  orderInput,
  sha256,
  START,
} from './sky-compute-grid-live-fixture.mjs';
import { loadRouteFixture } from './route-fixture.mjs';
import * as api from '../lib/sky-compute-grid-api.ts';
import * as deviceLink from '../lib/rockstar-device-link.ts';
import { lexicalEmbedding } from '../lib/sky-compute-grid-skus.ts';

const { db, reset, dispose } = await openGridDatabase();
beforeEach(reset);
after(dispose);

const ORIGIN = 'https://rock.example';
const BASE = `${ORIGIN}/api/sky/compute-grid`;
const GOOD = { charging: true, deviceIdle: true, unmeteredNetwork: true, thermalStatus: 'none' };

/**
 * The API exactly as the Worker routes build it, except for the D1 binding,
 * the clock, and (when a test needs a refusal) the entitlement answer. The
 * session is the real `requestRockstarUser` with the platform identity header.
 */
function gridApi({ mode = 'owner_pool', dataKey = DATA_KEY, allowed = true } = {}) {
  let now = START;
  const grid = api.computeGridApi({
    db,
    configuration: { SKY_COMPUTE_GRID_MODE: mode, SKY_COMPUTE_GRID_DATA_KEY: dataKey },
    authenticate: (request) => deviceLink.requestRockstarUser(request, db),
    scopeAllowed: async () => allowed,
    now: () => now,
  });
  const request = (path, { method = 'GET', owner = 'owner-a', body, raw, headers = {} } = {}) => new Request(`${BASE}${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(owner ? { 'oai-authenticated-user-id': owner } : {}),
      ...(method === 'GET' || method === 'DELETE' ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined && raw === undefined ? {} : { body: raw ?? JSON.stringify(body) }),
  });
  const read = async (response) => {
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    return { status: response.status, body: await response.json() };
  };
  return {
    grid,
    request,
    read,
    at(time) { now = time; },
    now: () => now,
    device: async (device, action, fields, options = {}) => read(await grid.device(request('/device', {
      method: 'POST', owner: device.ownerUserId, body: deviceBody(device, action, fields, { now, ...options }),
    }))),
  };
}

function receipt(lease, now) {
  const results = [];
  const outputs = {};
  for (const lot of lease.lots) {
    const input = Buffer.from(lot.input, 'base64');
    const output = lexicalEmbedding(JSON.parse(input.toString('utf8')).items);
    results.push({ lotId: lot.lotId, inputSha256: sha256(input), outputSha256: sha256(output), outputBytes: output.byteLength });
    outputs[lot.lotId] = b64(output);
  }
  return [{
    leaseId: lease.leaseId, startedAt: now - 1_000, completedAt: now,
    runtimeArtifactSha256: lease.runtimeArtifactSha256, modelSha256: lease.modelSha256,
    tokenizerSha256: lease.tokenizerSha256,
    deviceEvidence: { chargingThroughout: true, deviceIdleThroughout: true, unmeteredThroughout: true, maximumThermalStatus: 'none' },
    results,
  }, outputs];
}

void test('over HTTP: order, device offer, claim, signed receipt, results, and deletion', async () => {
  const t = gridApi();
  const phone = await enrollDevice(db, 'owner-a');

  const status = await t.read(await t.grid.status(t.request('/status')));
  assert.equal(status.status, 200);
  assert.deepEqual([status.body.mode, status.body.offers, status.body.orders], ['owner_pool', [], []]);
  assert.deepEqual(status.body.skus.map((sku) => [sku.skuId, sku.status, sku.referenceComputation]), [
    ['text-lexical-embedding-v1', 'dispatchable', true], ['public-text-embedding-v1', 'fixture_only', false],
  ]);
  assert.equal(status.body.account.redeemable, false);

  const offered = await t.device(phone, 'offer', { offer: lexicalOffer() });
  assert.equal(offered.status, 200);
  assert.equal(offered.body.offer.trustTier, 'hardware_backed');
  assert.equal(JSON.stringify(offered.body).includes('owner-a'), false);

  const input = orderInput();
  const created = await t.read(await t.grid.createOrder(t.request('/orders', { method: 'POST', body: input })));
  assert.deepEqual([created.status, created.body.order.state, created.body.order.lots.pending], [201, 'open', 2]);
  // The response to a retried creation is the stored order, not a second one.
  const retried = await t.read(await t.grid.createOrder(t.request('/orders', { method: 'POST', body: input })));
  assert.deepEqual([retried.status, retried.body.order.orderId], [200, input.orderId]);
  assert.equal((await t.read(await t.grid.listOrders(t.request('/orders')))).body.orders.length, 1);

  const claimed = await t.device(phone, 'claim', { skuId: 'text-lexical-embedding-v1', conditions: GOOD });
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.lease.lots.length, 2);
  t.at(START + 5_000);
  const [fields, outputs] = receipt(claimed.body.lease, t.now());
  const requestId = randomUUID();
  const done = await t.device(phone, 'receipt', fields, { outputs, requestId });
  assert.equal(done.status, 200);
  assert.deepEqual([done.body.receipt.state, done.body.receipt.lots.map((lot) => lot.state)], ['accepted', ['verified', 'verified']]);
  // The same signed receipt again: same answer.
  assert.deepEqual((await t.device(phone, 'receipt', fields, { outputs, requestId })).body, done.body);
  // A different receipt for the same lease: refused.
  t.at(START + 6_000);
  const [later, laterOutputs] = receipt(claimed.body.lease, t.now());
  assert.deepEqual(await t.device(phone, 'receipt', later, { outputs: laterOutputs }),
    { status: 409, body: { code: 'receipt_conflict', error: '入力内容を確認してください。' } });

  const detail = await t.read(await t.grid.getOrder(t.request(`/orders/${input.orderId}`), input.orderId));
  assert.deepEqual([detail.status, detail.body.order.state, detail.body.order.lots.verified], [200, 'completed', 2]);
  const results = await t.read(await t.grid.results(t.request(`/orders/${input.orderId}/results`), input.orderId));
  assert.equal(results.status, 200);
  assert.equal(results.body.results[0].output, b64(lexicalEmbedding(input.lots[0].items)));
  assert.deepEqual(results.body.output, { encoding: 'i8-vectors/1', dimensions: 256 });

  // Another account gets "not found" for everything about this order.
  for (const call of [
    t.grid.getOrder(t.request(`/orders/${input.orderId}`, { owner: 'owner-b' }), input.orderId),
    t.grid.results(t.request(`/orders/${input.orderId}/results`, { owner: 'owner-b' }), input.orderId),
    t.grid.cancelOrder(t.request(`/orders/${input.orderId}`, { owner: 'owner-b', method: 'DELETE' }), input.orderId),
    t.grid.purgeOrder(t.request(`/orders/${input.orderId}/results`, { owner: 'owner-b', method: 'DELETE' }), input.orderId),
  ]) assert.deepEqual([(await t.read(await call)).status], [404]);

  const purged = await t.read(await t.grid.purgeOrder(t.request(`/orders/${input.orderId}/results`, { method: 'DELETE' }), input.orderId));
  assert.equal(purged.body.order.purgedAt, START + 6_000);
  const afterPurge = await t.read(await t.grid.results(t.request(`/orders/${input.orderId}/results`), input.orderId));
  assert.deepEqual([afterPurge.body.purged, afterPurge.body.results[0].output], [true, null]);
});

void test('over HTTP: every refusal is a status and a code, never a stack trace or a partial write', async () => {
  const t = gridApi();
  const phone = await enrollDevice(db, 'owner-a');
  const codeOf = async (response) => { const { status, body } = await t.read(await response); return [status, body.code]; };

  assert.deepEqual(await codeOf(t.grid.status(t.request('/status', { owner: null }))), [401, 'sign_in_required']);
  assert.deepEqual(await codeOf(t.grid.createOrder(t.request('/orders', { method: 'POST', body: orderInput(), headers: { origin: 'https://evil.example' } }))), [403, 'origin_rejected']);
  assert.deepEqual(await codeOf(t.grid.createOrder(t.request('/orders', { method: 'POST', raw: '{"orderId":', }))), [400, 'invalid_request']);
  assert.deepEqual(await codeOf(t.grid.createOrder(t.request('/orders', { method: 'POST', body: orderInput(), headers: { 'content-type': 'text/plain' } }))), [400, 'invalid_request']);
  assert.deepEqual(await codeOf(t.grid.createOrder(t.request('/orders', { method: 'POST', raw: 'x'.repeat(2 * 1024 * 1024 + 1) }))), [413, 'request_too_large']);
  assert.deepEqual(await codeOf(t.grid.createOrder(t.request('/orders', { method: 'POST', body: orderInput({ skuId: 'arbitrary-container-v1' }) }))), [400, 'sku_not_reviewed']);
  assert.deepEqual(await codeOf(t.grid.createOrder(t.request('/orders', { method: 'POST', body: orderInput({ pool: 'public', dataClass: 'public', validation: { method: 'independent_reference', quorum: 1 } }) }))), [403, 'public_pool_not_enabled']);
  assert.deepEqual(await codeOf(t.grid.getOrder(t.request('/orders/not-a-uuid'), 'not-a-uuid')), [400, 'order_id_invalid']);
  assert.deepEqual(await codeOf(t.grid.getOrder(t.request(`/orders/${randomUUID()}`), randomUUID())), [404, 'order_not_found']);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM sky_compute_orders').first()).n, 0);

  // Device endpoint: unsigned, wrongly signed, unenrolled, stale, and unregistered.
  assert.deepEqual(await codeOf(t.grid.device(t.request('/device', { method: 'POST', body: { payload: '{}', signature: 'x' } }))), [400, 'device_request_schema_invalid']);
  const stranger = await enrollDevice(db, 'owner-b');
  const claim = { skuId: 'text-lexical-embedding-v1', conditions: GOOD };
  assert.deepEqual([(await t.device(phone, 'claim', claim, { signer: stranger })).status, (await t.device(phone, 'claim', claim, { signer: stranger })).body.code],
    [401, 'device_signature_invalid']);
  const borrowed = await t.read(await t.grid.device(t.request('/device', { method: 'POST', owner: 'owner-b', body: deviceBody(phone, 'claim', claim, { now: START }) })));
  assert.deepEqual([borrowed.status, borrowed.body.code], [403, 'device_key_not_enrolled']);
  const stale = await t.read(await t.grid.device(t.request('/device', { method: 'POST', body: deviceBody(phone, 'claim', claim, { now: START - 10 * 60_000 }) })));
  assert.deepEqual([stale.status, stale.body.code], [401, 'device_request_stale']);
  const unregistered = await t.device(phone, 'claim', claim);
  assert.deepEqual([unregistered.status, unregistered.body.code], [409, 'offer_not_registered']);
  const unknownLease = await t.device(phone, 'release', { leaseId: randomUUID(), reason: 'owner_active' });
  assert.deepEqual([unknownLease.status, unknownLease.body.code], [404, 'lease_not_found']);
});

void test('over HTTP: the grid answers nothing but its status until the deployment enables it', async () => {
  const off = gridApi({ mode: null });
  const status = await off.read(await off.grid.status(off.request('/status')));
  assert.deepEqual([status.status, status.body.mode, status.body.account], [200, 'disabled', null]);
  const phone = await enrollDevice(db, 'owner-a');
  for (const call of [
    off.grid.listOrders(off.request('/orders')),
    off.grid.createOrder(off.request('/orders', { method: 'POST', body: orderInput() })),
    off.grid.device(off.request('/device', { method: 'POST', body: deviceBody(phone, 'offer', { offer: lexicalOffer() }) })),
  ]) {
    const { status: code, body } = await off.read(await call);
    assert.deepEqual([code, body.code], [503, 'compute_grid_disabled']);
  }
  // Any other value of the switch is "off" as well.
  for (const mode of ['true', 'enabled', 'public', 'OWNER_POOL', 1])
    assert.equal((await off.read(await gridApi({ mode }).grid.status(off.request('/status')))).body.mode, 'disabled');

  // Enabled, but without the storage key: nothing can be stored.
  const keyless = gridApi({ dataKey: null });
  const created = await keyless.read(await keyless.grid.createOrder(keyless.request('/orders', { method: 'POST', body: orderInput() })));
  assert.deepEqual([created.status, created.body.code], [503, 'compute_grid_data_key_unavailable']);
  // Enabled, but the account has no Sky entitlement.
  const denied = gridApi({ allowed: false });
  const refused = await denied.read(await denied.grid.status(denied.request('/status')));
  assert.deepEqual([refused.status, refused.body.code], [403, 'service_entitlement_required']);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM sky_compute_orders').first()).n, 0);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM sky_compute_offers').first()).n, 0);
});

void test('the Worker routes call the handlers with the deployment configuration and the route id', async () => {
  const configuration = { SKY_COMPUTE_GRID_MODE: 'owner_pool', SKY_COMPUTE_GRID_DATA_KEY: DATA_KEY };
  const scopes = [];
  const wiring = loadRouteFixture(new URL('../lib/sky-compute-grid-route.ts', import.meta.url), new Map([
    ['cloudflare:workers', { env: configuration }],
    ['./fund-store', { database: () => db }],
    ['./rockstar-device-link', deviceLink],
    ['./rockstar-service-access', {
      rockstarServiceScopeAllowed: async (database, owner, scope, enforcement) => {
        scopes.push([database === db, owner, scope, enforcement]);
        return owner !== 'no-entitlement';
      },
    }],
    ['./sky-compute-grid-api', api],
  ]));
  const route = (path) => loadRouteFixture(new URL(`../app/api/sky/compute-grid/${path}/route.ts`, import.meta.url),
    new Map([['@/lib/sky-compute-grid-route', wiring]]));
  const call = (path, { method = 'GET', owner = 'owner-a', body } = {}) => new Request(`${BASE}${path}`, {
    method,
    headers: { origin: ORIGIN, 'oai-authenticated-user-id': owner, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const context = (id) => ({ params: Promise.resolve({ id }) });

  assert.deepEqual(Object.keys(route('status')), ['GET']);
  assert.deepEqual(Object.keys(route('orders')).sort(), ['GET', 'POST']);
  assert.deepEqual(Object.keys(route('orders/[id]')).sort(), ['DELETE', 'GET']);
  assert.deepEqual(Object.keys(route('orders/[id]/results')).sort(), ['DELETE', 'GET']);
  assert.deepEqual(Object.keys(route('device')), ['POST']);

  assert.equal((await (await route('status').GET(call('/status'))).json()).mode, 'owner_pool');
  assert.deepEqual(scopes.at(-1), [true, 'owner-a', 'sky', undefined]);
  assert.equal((await route('status').GET(call('/status', { owner: 'no-entitlement' }))).status, 403);

  const input = orderInput({ deadlineAt: Date.now() + 30 * 60_000 });
  assert.equal((await route('orders').POST(call('/orders', { method: 'POST', body: input }))).status, 201);
  assert.equal((await (await route('orders').GET(call('/orders'))).json()).orders[0].orderId, input.orderId);
  assert.equal((await (await route('orders/[id]').GET(call(`/orders/${input.orderId}`), context(input.orderId))).json()).order.lots.total, 2);
  assert.deepEqual((await (await route('orders/[id]/results').GET(call(`/orders/${input.orderId}/results`), context(input.orderId))).json()).results, []);
  const phone = await enrollDevice(db, 'owner-a');
  const now = Date.now();
  const offered = await route('device').POST(call('/device', { method: 'POST', body: deviceBody(phone, 'offer', { offer: lexicalOffer({}, now) }, { now }) }));
  assert.equal(offered.status, 200);
  assert.equal((await (await route('orders/[id]').DELETE(call(`/orders/${input.orderId}`, { method: 'DELETE' }), context(input.orderId))).json()).order.state, 'cancelled');
  assert.equal(typeof (await (await route('orders/[id]/results').DELETE(call(`/orders/${input.orderId}/results`, { method: 'DELETE' }), context(input.orderId))).json()).order.purgedAt, 'number');
});
