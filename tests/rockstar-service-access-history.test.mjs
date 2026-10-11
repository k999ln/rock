import * as ownerIntent from '../lib/owner-intent.ts';
import * as boundedStream from '../lib/bounded-stream.ts';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { loadRouteFixture } from './route-fixture.mjs';
import * as workflow from '../lib/workflow.ts';
import { workStore } from '../lib/work-store.ts';
import { a2aDelegationStore } from '../lib/a2a-delegation-store.ts';
import { requestUser } from '../lib/request-auth.ts';
import * as access from '../lib/rockstar-service-access.ts';
import { McpInspectionError } from '../lib/mcp-inspection.ts';
import {
  ROCKSTAR_ENTITLEMENT_CLAIM_SCHEMA, rockstarEntitlementClaimSigningBytes,
  rockstarEntitlementStore, verifyRockstarEntitlementClaim, sha256Hex,
} from '../lib/rockstar-entitlement-claim.ts';
import {
  ROCKSTAR_ENTITLEMENT_EVENT_SCHEMA, rockstarEntitlementEventSigningBytes,
  rockstarEntitlementEventStore, verifyRockstarEntitlementEvent,
} from '../lib/rockstar-entitlement-event.ts';

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  class Statement {
    constructor(sql, values = []) { Object.assign(this, { sql, values }); }
    bind(...values) { return new Statement(this.sql, values); }
    first() { return sqlite.prepare(this.sql).get(...this.values) ?? null; }
    all() { return { results: sqlite.prepare(this.sql).all(...this.values) }; }
    run() { return { meta: { changes: Number(sqlite.prepare(this.sql).run(...this.values).changes) } }; }
  }
  return {
    prepare(sql) { return new Statement(sql); },
    batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const results = statements.map(statement => statement.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}

for (const [scope, newerScope] of [['zema', 'sky'], ['sky', 'zema']]) {
  void test(`old ${scope} scope remains usable after 100 newer ${newerScope}-only purchases`, async t => {
    const db = database(t), store = rockstarEntitlementStore(db);
    const owner = 'synthetic-account-a', base = Date.now();
    let clock = base, inspections = 0;
    t.mock.method(Date, 'now', () => clock);
    const pair = generateKeyPairSync('ed25519');
    const publicKey = Buffer.from(pair.publicKey.export({ format: 'jwk' }).x, 'base64url');
    const env = { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'true' };
    const dependencies = new Map([
      ['cloudflare:workers', { env }],
      ['@/lib/owner-intent', ownerIntent],
      ['@/lib/bounded-stream', boundedStream],
      ['@/lib/a2a-delegation-store', { a2aDelegationStore }],
      ['@/lib/fund-store', { database: () => db, requestUser }],
      ['@/lib/work-store', { workStore }],
      ['@/lib/rockstar-service-access', access],
      ['@/lib/workflow', workflow],
      ['@/lib/mcp-inspection', { McpInspectionError, inspectRemoteMcp: async () => {
        inspections++;
        return { status: 'ready', toolCount: 1 };
      } }],
    ]);
    const path = scope === 'zema' ? 'work-jobs' : 'sky/mcp/inspect';
    const route = loadRouteFixture(new URL(`../app/api/${path}/route.ts`, import.meta.url), dependencies);
    async function request(user = owner) {
      return route.POST(new Request(`https://scope-fixture.chatgpt.site/api/${path}`, {
        method: 'POST', headers: { Origin: 'https://scope-fixture.chatgpt.site',
          'oai-authenticated-user-id': user, 'Content-Type': 'application/json' },
        body: JSON.stringify(scope === 'zema'
          ? { id: randomUUID(), templateId: 'article', title: 'Synthetic scope boundary' }
          : { endpointUrl: 'https://synthetic.invalid/mcp' }),
      }));
    }
    async function claim(index, scopes) {
      const code = `rsk_${String(index).padStart(43, '0')}`;
      const value = {
        schema: ROCKSTAR_ENTITLEMENT_CLAIM_SCHEMA, issuerId: 'synthetic-issuer', issuerKeyId: 'fixture-key',
        claimId: `synthetic-purchase-${index}`, offerId: `offer-${index === 0 ? scope : newerScope}`,
        purchaseReferenceSha256: await sha256Hex(`synthetic-purchase-${index}`),
        claimCodeSha256: await sha256Hex(code), formFactor: 'service_only', scopes,
        issuedAt: base - 20_000, expiresAt: base + (index === 0 ? 1_000 : 86_400_000), signature: '',
      };
      value.signature = sign(null, rockstarEntitlementClaimSigningBytes(value), pair.privateKey).toString('base64url');
      const verified = await verifyRockstarEntitlementClaim(value, code, async () => publicKey, base);
      assert.ok(verified);
      if (index === 0)
        assert.equal(await verifyRockstarEntitlementClaim({ ...value, scopes: [newerScope] }, code, async () => publicKey, base), null);
      await store.claim(verified, code, owner, base - 10_000 + index);
      return { verified, code };
    }

    const original = await claim(0, [scope]);
    const success = scope === 'zema' ? 201 : 200;
    assert.equal((await request()).status, success);
    for (let index = 1; index <= 100; index++) await claim(index, [newerScope]);
    assert.equal((await store.list(owner)).some(row => row.claimId === original.verified.claimId), false);
    assert.equal((await store.activeOffers(owner, [{ issuerId: 'synthetic-issuer', offerId: `offer-${scope}` }])).length, 1);
    assert.equal((await store.claim(original.verified, original.code, owner)).alreadyClaimed, true);
    assert.equal(await store.hasActiveScope(owner, scope), true);
    assert.equal((await request()).status, success);
    assert.equal(await store.hasActiveScope('synthetic-account-b', scope), false);
    assert.equal((await request('synthetic-account-b')).status, 403);
    assert.equal(await store.hasActiveScope(owner, 'agents'), false);

    clock = original.verified.expiresAt;
    assert.equal(await store.hasActiveScope(owner, scope), false);
    assert.equal((await request()).status, 403);
    clock = base;
    const event = {
      schema: ROCKSTAR_ENTITLEMENT_EVENT_SCHEMA, issuerId: 'synthetic-issuer', issuerKeyId: 'fixture-key',
      eventId: 'synthetic-revocation', claimId: original.verified.claimId,
      purchaseReferenceSha256: original.verified.purchaseReferenceSha256,
      eventType: 'revoked', issuedAt: base, signature: '',
    };
    event.signature = sign(null, rockstarEntitlementEventSigningBytes(event), pair.privateKey).toString('base64url');
    const verifiedEvent = await verifyRockstarEntitlementEvent(event, async () => publicKey);
    assert.ok(verifiedEvent);
    await rockstarEntitlementEventStore(db).apply(verifiedEvent);
    assert.equal(await store.hasActiveScope(owner, scope), false);
    const revoked = await request();
    assert.equal(revoked.status, 403);
    assert.equal((await revoked.json()).code, 'SERVICE_ENTITLEMENT_REQUIRED');
    assert.equal(await store.hasActiveScope(owner, newerScope), true);
    if (scope === 'sky') assert.equal(inspections, 2, 'rejected scopes never reach the synthetic upstream');
  });
}

void test('scope lookup refuses malformed JSON and non-array or non-string scope values', async t => {
  const db = database(t), store = rockstarEntitlementStore(db);
  const row = [
    'synthetic-issuer', 'synthetic-invalid-scope', 'synthetic-owner', 'synthetic-offer',
    'a'.repeat(64), 'b'.repeat(64), 'service_only', '[]', 'fixture-key', 'synthetic-signature',
    'active', Date.now(), null, null,
  ];
  db.prepare('INSERT INTO rockstar_service_entitlements VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...row).run();
  for (const json of ['{broken', '{}', '{"scope":"zema"}', '"zema"', '[null,42,{"scope":"zema"}]']) {
    db.prepare('UPDATE rockstar_service_entitlements SET scopes_json = ?').bind(json).run();
    assert.equal(await store.hasActiveScope('synthetic-owner', 'zema'), false, json);
  }
});
