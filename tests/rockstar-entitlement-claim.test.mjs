import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import {
  ROCKSTAR_ENTITLEMENT_CLAIM_SCHEMA,
  rockstarEntitlementClaimSigningBytes,
  rockstarEntitlementStore,
  sha256Hex,
  trustedRockstarEntitlementIssuerKeyResolver,
  verifyRockstarEntitlementClaim,
} from '../lib/rockstar-entitlement-claim.ts';
import { ROCKSTAR_ENTITLEMENT_EVENT_SCHEMA, rockstarEntitlementEventSigningBytes, rockstarEntitlementEventStore } from '../lib/rockstar-entitlement-event.ts';
import { encodeRockstarEntitlementHandoffFragment, parseRockstarEntitlementHandoffFragment, parseRockstarEntitlementPackage } from '../lib/rockstar-entitlement-package.ts';

const now = Date.now();
const issuerId = 'retailer-fixture';
const issuerKeyId = 'key-v1';
const claimCode = `rsk_${'q'.repeat(43)}`;
const pair = generateKeyPairSync('ed25519');
const publicJwk = pair.publicKey.export({ format: 'jwk' });
const publicKey = Buffer.from(publicJwk.x, 'base64url');
const configuration = JSON.stringify([{ issuerId, issuerKeyId, publicKeyHex: publicKey.toString('hex'), status: 'active' }]);

await test('seller package file parser accepts only a bounded claim and valid one-time code envelope', () => {
  const bundle = { claim: { schema: ROCKSTAR_ENTITLEMENT_CLAIM_SCHEMA }, claimCode };
  assert.deepEqual(parseRockstarEntitlementPackage(JSON.stringify(bundle)), bundle);
  assert.equal(parseRockstarEntitlementPackage('not json'), null);
  assert.equal(parseRockstarEntitlementPackage(JSON.stringify({ claim: [], claimCode })), null);
  assert.equal(parseRockstarEntitlementPackage(JSON.stringify({ claim: {}, claimCode: 'invalid' })), null);
  assert.equal(parseRockstarEntitlementPackage(`${' '.repeat(16_385)}`), null);
});

await test('seller handoff link keeps the claim code in a bounded URL fragment and never redeems it', () => {
  const bundle = { claim: { schema: ROCKSTAR_ENTITLEMENT_CLAIM_SCHEMA, offerId: 'physical-sim' }, claimCode };
  const fragment = encodeRockstarEntitlementHandoffFragment(bundle);
  assert.ok(fragment?.startsWith('#rockstar-claim='));
  assert.deepEqual(parseRockstarEntitlementHandoffFragment(fragment), bundle);
  assert.equal(parseRockstarEntitlementHandoffFragment('#rockstar-claim=%%%'), null);
  assert.equal(parseRockstarEntitlementHandoffFragment(`${fragment}${'a'.repeat(32_768)}`), null);
  assert.equal(parseRockstarEntitlementHandoffFragment('#wrong=claim'), null);
});

async function signedClaim(overrides = {}, code = claimCode) {
  const claim = {
    schema: ROCKSTAR_ENTITLEMENT_CLAIM_SCHEMA,
    issuerId,
    issuerKeyId,
    claimId: 'purchase-2026-001',
    offerId: 'rockstar-sim-standard-v1',
    purchaseReferenceSha256: 'a'.repeat(64),
    claimCodeSha256: await sha256Hex(code),
    formFactor: 'physical_sim',
    scopes: ['rockstaros_access', 'sky', 'zema', 'agents'],
    issuedAt: now,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    ...overrides,
    signature: '',
  };
  claim.signature = sign(null, rockstarEntitlementClaimSigningBytes(claim), pair.privateKey).toString('base64url');
  return claim;
}

await test('issuer trust inventory fails closed on duplicate, malformed, and revoked keys', async () => {
  const claim = await signedClaim();
  assert.ok(await verifyRockstarEntitlementClaim(claim, claimCode, trustedRockstarEntitlementIssuerKeyResolver(configuration), now));
  assert.equal(await verifyRockstarEntitlementClaim(claim, claimCode, trustedRockstarEntitlementIssuerKeyResolver('[]'), now), null);
  const revoked = JSON.stringify([{ issuerId, issuerKeyId, publicKeyHex: publicKey.toString('hex'), status: 'revoked' }]);
  assert.equal(await verifyRockstarEntitlementClaim(claim, claimCode, trustedRockstarEntitlementIssuerKeyResolver(revoked), now), null);
  assert.equal(await verifyRockstarEntitlementClaim(claim, claimCode, trustedRockstarEntitlementIssuerKeyResolver(`${configuration.slice(0, -1)},${configuration.slice(1)}`), now), null);
});

await test('claim verifier binds code, scope, form factor, time, exact fields, and signature', async () => {
  const resolver = trustedRockstarEntitlementIssuerKeyResolver(configuration);
  const claim = await signedClaim();
  assert.equal(await verifyRockstarEntitlementClaim(claim, `${claimCode}x`, resolver, now), null);
  assert.equal(await verifyRockstarEntitlementClaim({ ...claim, offerId: 'other-offer' }, claimCode, resolver, now), null);
  assert.equal(await verifyRockstarEntitlementClaim(await signedClaim({ formFactor: 'unknown' }), claimCode, resolver, now), null);
  assert.equal(await verifyRockstarEntitlementClaim(await signedClaim({ scopes: ['root_admin'] }), claimCode, resolver, now), null);
  assert.equal(await verifyRockstarEntitlementClaim(await signedClaim({ expiresAt: now - 1 }), claimCode, resolver, now), null);
  assert.equal(await verifyRockstarEntitlementClaim({ ...claim, extra: 'unexpected' }, claimCode, resolver, now), null);
});

await test('D1 claim is atomically bound to one account and repeat redemption is idempotent', async (t) => {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate: '2026-08-18',
    d1Databases: ['DB'],
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const migration = readFileSync(new URL('../drizzle/0039_rockstar_service_entitlements.sql', import.meta.url), 'utf8');
  for (const statement of migration.split('--> statement-breakpoint').filter((part) => part.trim())) await db.prepare(statement).run();
  const eventMigration = readFileSync(new URL('../drizzle/0040_rockstar_entitlement_events.sql', import.meta.url), 'utf8');
  for (const statement of eventMigration.split('--> statement-breakpoint').filter((part) => part.trim())) await db.prepare(statement).run();
  const oneTimePurchase = readFileSync(new URL('../drizzle/0050_rockstar_entitlement_purchase_once.sql', import.meta.url), 'utf8');
  for (const statement of oneTimePurchase.split('--> statement-breakpoint').filter((part) => part.trim())) await db.prepare(statement).run();
  const claim = await signedClaim();
  const verified = await verifyRockstarEntitlementClaim(claim, claimCode, trustedRockstarEntitlementIssuerKeyResolver(configuration), now);
  assert.ok(verified);
  const store = rockstarEntitlementStore(db);
  const first = await store.claim(verified, claimCode, 'account-a', now);
  assert.equal(first.alreadyClaimed, false);
  assert.equal(first.formFactor, 'physical_sim');
  assert.deepEqual(first.scopes, ['rockstaros_access', 'sky', 'zema', 'agents']);
  assert.equal(await store.hasActiveScope('account-a', 'agents', now), true);
  assert.equal(await store.hasActiveScope('account-b', 'agents', now), false);
  assert.equal(await store.hasActiveScope('account-a', 'unknown', now), false);
  assert.equal((await store.claim(verified, claimCode, 'account-a', now + 1)).alreadyClaimed, true);
  await assert.rejects(store.claim(verified, claimCode, 'account-b', now + 2), { message: 'CLAIM_ALREADY_USED' });
  const replacementCode = `rsk_${'z'.repeat(43)}`;
  const replacementClaim = await signedClaim({ claimId: 'purchase-2026-002' }, replacementCode);
  const verifiedReplacement = await verifyRockstarEntitlementClaim(replacementClaim, replacementCode,
    trustedRockstarEntitlementIssuerKeyResolver(configuration), now);
  assert.ok(verifiedReplacement);
  await assert.rejects(store.claim(verifiedReplacement, replacementCode, 'account-b', now + 3),
    { message: 'CLAIM_ALREADY_USED' });
  assert.equal((await store.list('account-a')).length, 1);
  assert.deepEqual(await store.list('account-b'), []);
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM rockstar_service_entitlements').first().then((row) => row.count), 1);
  const racePurchase = 'b'.repeat(64);
  const raceCodeA = `rsk_${'a'.repeat(43)}`;
  const raceCodeB = `rsk_${'b'.repeat(43)}`;
  const [raceClaimA, raceClaimB] = await Promise.all([
    signedClaim({ claimId: 'purchase-race-a', purchaseReferenceSha256: racePurchase }, raceCodeA),
    signedClaim({ claimId: 'purchase-race-b', purchaseReferenceSha256: racePurchase }, raceCodeB),
  ]);
  const [verifiedA, verifiedB] = await Promise.all([
    verifyRockstarEntitlementClaim(raceClaimA, raceCodeA, trustedRockstarEntitlementIssuerKeyResolver(configuration), now),
    verifyRockstarEntitlementClaim(raceClaimB, raceCodeB, trustedRockstarEntitlementIssuerKeyResolver(configuration), now),
  ]);
  assert.ok(verifiedA && verifiedB);
  const concurrentClaims = await Promise.allSettled([
    store.claim(verifiedA, raceCodeA, 'account-c', now + 4),
    store.claim(verifiedB, raceCodeB, 'account-d', now + 4),
  ]);
  assert.equal(concurrentClaims.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(concurrentClaims.filter((result) => result.status === 'rejected' && result.reason.message === 'CLAIM_ALREADY_USED').length, 1);
  assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM rockstar_service_entitlements').first().then((row) => row.count), 2);

  const pendingPurchase = 'c'.repeat(64);
  const pendingCode = `rsk_${'c'.repeat(43)}`;
  const pendingClaim = await signedClaim({ claimId: 'purchase-pending', purchaseReferenceSha256: pendingPurchase }, pendingCode);
  const verifiedPending = await verifyRockstarEntitlementClaim(pendingClaim, pendingCode,
    trustedRockstarEntitlementIssuerKeyResolver(configuration), now);
  assert.ok(verifiedPending);
  const eventStore = rockstarEntitlementEventStore(db);
  const cancellation = {
    schema: ROCKSTAR_ENTITLEMENT_EVENT_SCHEMA,
    issuerId,
    issuerKeyId,
    eventId: 'event-pending-revocation',
    claimId: pendingClaim.claimId,
    purchaseReferenceSha256: pendingPurchase,
    eventType: 'revoked',
    issuedAt: now + 5,
    signature: '',
  };
  cancellation.signature = sign(null, rockstarEntitlementEventSigningBytes(cancellation), pair.privateKey).toString('base64url');
  assert.deepEqual(await eventStore.apply(cancellation, now + 5), { alreadyApplied: false, eventId: cancellation.eventId });
  assert.deepEqual(await eventStore.apply(cancellation, now + 6), { alreadyApplied: true, eventId: cancellation.eventId });
  await assert.rejects(store.claim(verifiedPending, pendingCode, 'account-e', now + 7), { message: 'CLAIM_REVOKED' });
  const reissuedCode = `rsk_${'d'.repeat(43)}`;
  const replacement = await signedClaim({ claimId: 'purchase-pending-reissued', purchaseReferenceSha256: pendingPurchase }, reissuedCode);
  const verifiedReissued = await verifyRockstarEntitlementClaim(replacement, reissuedCode,
    trustedRockstarEntitlementIssuerKeyResolver(configuration), now);
  assert.ok(verifiedReissued);
  assert.equal((await store.claim(verifiedReissued, reissuedCode, 'account-e', now + 8)).alreadyClaimed, false);
  await db.prepare('UPDATE rockstar_service_entitlements SET expires_at = ? WHERE issuer_id = ? AND claim_id = ?')
    .bind(now - 1, issuerId, claim.claimId).run();
  assert.equal((await store.list('account-a'))[0].status, 'expired');
  assert.equal(await store.hasActiveScope('account-a', 'agents', now), false);
  await db.prepare('UPDATE rockstar_service_entitlements SET status = ? WHERE issuer_id = ? AND claim_id = ?')
    .bind('refunded', issuerId, claim.claimId).run();
  assert.equal(await store.hasActiveScope('account-a', 'agents', now), false);
  await db.prepare('UPDATE rockstar_service_entitlements SET status = ? WHERE issuer_id = ? AND claim_id = ?')
    .bind('revoked', issuerId, claim.claimId).run();
  assert.equal(await store.hasActiveScope('account-a', 'agents', now), false);
});
