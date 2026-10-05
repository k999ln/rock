import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { issueRockstarEntitlementClaim } from '../lib/rockstar-entitlement-issuer.ts';
import { handleRockstarEntitlementDeliveryRequest, ROCKSTAR_ENTITLEMENT_DELIVERY_REQUESTS_PER_MINUTE }
  from '../lib/rockstar-entitlement-delivery-http.ts';

const issuerId = 'online-retailer';
const issuerKeyId = 'online-retailer-2026';
const token = `seller_${'t'.repeat(40)}`;
const encryptionKey = 'e'.repeat(64);
const purchaseReferenceSha256 = 'c'.repeat(64);
const pair = generateKeyPairSync('ed25519');
const privateKey = await crypto.subtle.importKey('pkcs8', pair.privateKey.export({ format: 'der', type: 'pkcs8' }),
  { name: 'Ed25519' }, false, ['sign']);
const publicKey = Buffer.from(pair.publicKey.export({ format: 'jwk' }).x, 'base64url');
const keyConfig = JSON.stringify([{ issuerId, issuerKeyId, publicKeyHex: publicKey.toString('hex'), status: 'active' }]);
const keyringConfig = JSON.stringify({ currentKeyId: 'delivery-key-v1', keys: { 'delivery-key-v1': encryptionKey } });
const sellerConfig = JSON.stringify([{ issuerId, tokenSha256: createHash('sha256').update(token).digest('hex') }]);
const config = {
  ROCKSTAR_ENTITLEMENT_DELIVERY_SELLERS: sellerConfig,
  ROCKSTAR_SERVICE_CLAIM_ISSUERS: keyConfig,
  ROCKSTAR_ENTITLEMENT_DELIVERY_CODE_KEYS: keyringConfig,
};
const idem = 'web-shop-order-line-20261002-0007';

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter((name) => name.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const db = { prepare(sql) { return { bind(...values) { return {
    async first() { return sqlite.prepare(sql).get(...values) ?? null; },
    async run() { const result = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
  }; } }; } };
  return { db, sqlite };
}

function request(method, body, options = {}) {
  const headers = new Headers(options.headers);
  if (!options.noToken) headers.set('authorization', `Bearer ${options.token ?? token}`);
  if (options.idempotency !== false) headers.set('idempotency-key', options.idempotency ?? idem);
  if (body !== undefined) headers.set('content-type', options.contentType ?? 'application/json');
  return new Request('https://rockstar.test/api/internal/rockstar/entitlement-deliveries', {
    method, headers, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

async function issue(purchase = purchaseReferenceSha256) {
  return issueRockstarEntitlementClaim({ issuerId, issuerKeyId, offerId: 'rockstaros-service-lifeline-v1',
    purchaseReferenceSha256: purchase, formFactor: 'esim',
    scopes: ['rockstaros_access', 'sky', 'zema', 'agents'], expiresAt: Date.now() + 86_400_000 }, privateKey);
}

void test('seller delivery endpoint registers a verified package and retrieves the same encrypted-at-rest code', async (t) => {
  const f = fixture(t);
  const packageValue = await issue();
  const post = await handleRockstarEntitlementDeliveryRequest(request('POST', packageValue), f.db, config);
  assert.equal(post.status, 201);
  assert.deepEqual(await post.json(), { issuerId, claimId: packageValue.claim.claimId, state: 'prepared', replayed: false });
  const stored = f.sqlite.prepare('SELECT * FROM rockstar_entitlement_issuer_deliveries').get();
  assert.equal(stored.claim_json.includes(packageValue.claimCode), false);
  assert.notEqual(stored.claim_code_ciphertext, packageValue.claimCode);
  const get = await handleRockstarEntitlementDeliveryRequest(request('GET'), f.db, config);
  assert.equal(get.status, 200);
  assert.deepEqual((await get.json()).package, packageValue);
  const replay = await handleRockstarEntitlementDeliveryRequest(request('POST', packageValue), f.db, config);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).replayed, true);
});

void test('seller endpoint scopes credentials to one issuer and checks request package signature and idempotency', async (t) => {
  const f = fixture(t);
  const authFailure = await handleRockstarEntitlementDeliveryRequest(request('POST', {}, { token: `seller_${'x'.repeat(40)}` }), f.db, config);
  assert.equal(authFailure.status, 401);
  const wrongKey = await issue();
  const tampered = await handleRockstarEntitlementDeliveryRequest(request('POST', {
    claim: { ...wrongKey.claim, signature: `${wrongKey.claim.signature[0] === 'A' ? 'B' : 'A'}${wrongKey.claim.signature.slice(1)}` },
    claimCode: wrongKey.claimCode,
  }), f.db, config);
  assert.equal(tampered.status, 400);
  const valid = await issue();
  assert.equal((await handleRockstarEntitlementDeliveryRequest(request('POST', valid), f.db, config)).status, 201);
  const changed = await issue('d'.repeat(64));
  const conflict = await handleRockstarEntitlementDeliveryRequest(request('POST', changed), f.db, config);
  assert.equal(conflict.status, 409);
});

void test('seller endpoint requires explicit idempotency and bounded JSON requests', async (t) => {
  const f = fixture(t);
  const noIdem = await handleRockstarEntitlementDeliveryRequest(request('GET', undefined, { idempotency: false }), f.db, config);
  assert.equal(noIdem.status, 400);
  const tooLarge = await handleRockstarEntitlementDeliveryRequest(request('POST', ' '.repeat(16_385)), f.db, config);
  assert.equal(tooLarge.status, 413);
  const wrongType = await handleRockstarEntitlementDeliveryRequest(request('POST', '{}', { contentType: 'text/plain' }), f.db, config);
  assert.equal(wrongType.status, 415);
});

void test('delivery ack clears claim code and subsequent retrieval is status-only', async (t) => {
  const f = fixture(t);
  const packageValue = await issue();
  await handleRockstarEntitlementDeliveryRequest(request('POST', packageValue), f.db, config);
  const ack = await handleRockstarEntitlementDeliveryRequest(request('PATCH', { claimId: packageValue.claim.claimId }), f.db, config);
  assert.equal(ack.status, 200);
  const row = f.sqlite.prepare('SELECT state,claim_code_ciphertext,claim_code_nonce FROM rockstar_entitlement_issuer_deliveries').get();
  assert.equal(row.state, 'delivered');
  assert.equal(row.claim_code_ciphertext, null);
  assert.equal(row.claim_code_nonce, null);
  const get = await handleRockstarEntitlementDeliveryRequest(request('GET'), f.db, config);
  assert.deepEqual(await get.json(), { issuerId, claimId: packageValue.claim.claimId, state: 'delivered', package: null });
});

void test('missing seller/key configuration fails closed without exposing submitted package', async (t) => {
  const f = fixture(t);
  const packageValue = await issue();
  const missingSeller = await handleRockstarEntitlementDeliveryRequest(request('POST', packageValue), f.db,
    { ...config, ROCKSTAR_ENTITLEMENT_DELIVERY_SELLERS: undefined });
  assert.equal(missingSeller.status, 503);
  assert.equal((await missingSeller.json()).code, 'SELLER_REGISTRY_UNCONFIGURED');
  const missingKeys = await handleRockstarEntitlementDeliveryRequest(request('POST', packageValue), f.db,
    { ...config, ROCKSTAR_ENTITLEMENT_DELIVERY_CODE_KEYS: undefined });
  assert.equal(missingKeys.status, 503);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM rockstar_entitlement_issuer_deliveries').get().n, 0);
});

void test('seller rate limits are atomic per issuer, return Retry-After, and reset in the next minute', async (t) => {
  const f = fixture(t);
  const now = 1_800_000_000_000;
  for (let index = 0; index < ROCKSTAR_ENTITLEMENT_DELIVERY_REQUESTS_PER_MINUTE; index++) {
    const response = await handleRockstarEntitlementDeliveryRequest(request('GET'), f.db, config, now);
    assert.equal(response.status, 404);
  }
  const limited = await handleRockstarEntitlementDeliveryRequest(request('GET'), f.db, config, now);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), String(Math.ceil((Math.floor(now / 60_000) * 60_000 + 60_000 - now) / 1000)));
  assert.equal((await limited.json()).code, 'SELLER_RATE_LIMITED');

  const otherToken = `seller_${'u'.repeat(40)}`;
  const otherIssuerConfig = {
    ...config,
    ROCKSTAR_ENTITLEMENT_DELIVERY_SELLERS: JSON.stringify([
      ...JSON.parse(sellerConfig),
      { issuerId: 'second-retailer', tokenSha256: createHash('sha256').update(otherToken).digest('hex') },
    ]),
  };
  const otherSellerRequest = request('GET', undefined, { token: otherToken });
  assert.equal((await handleRockstarEntitlementDeliveryRequest(otherSellerRequest, f.db, otherIssuerConfig, now)).status, 404);
  const nextMinute = Math.floor(now / 60_000) * 60_000 + 60_000;
  assert.equal((await handleRockstarEntitlementDeliveryRequest(request('GET'), f.db, config, nextMinute)).status, 404);
  const counters = f.sqlite.prepare('SELECT issuer_id,window_started_at,request_count FROM rockstar_entitlement_issuer_rate_limits ORDER BY issuer_id').all();
  assert.equal(counters.length, 2);
  assert.deepEqual(counters.map((row) => row.issuer_id), ['online-retailer', 'second-retailer']);
  assert.equal(counters[0].request_count, 1);
});
