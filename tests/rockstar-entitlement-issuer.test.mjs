import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import {
  trustedRockstarEntitlementIssuerKeyResolver,
  verifyRockstarEntitlementClaim,
} from '../lib/rockstar-entitlement-claim.ts';
import { verifyRockstarEntitlementEvent } from '../lib/rockstar-entitlement-event.ts';
import {
  issueRockstarEntitlementClaim,
  issueRockstarEntitlementEvent,
  replaceRockstarEntitlementClaim,
  replaceRockstarEntitlementClaimWithAcknowledgement,
} from '../lib/rockstar-entitlement-issuer.ts';

const now = Date.now();
const issuerId = 'distribution-channel';
const issuerKeyId = 'ed25519-2026-01';
const purchaseReferenceSha256 = 'e'.repeat(64);
const pair = generateKeyPairSync('ed25519');
const privateKey = await crypto.subtle.importKey('pkcs8', pair.privateKey.export({ format: 'der', type: 'pkcs8' }),
  { name: 'Ed25519' }, false, ['sign']);
const exportablePrivateKey = await crypto.subtle.importKey('pkcs8', pair.privateKey.export({ format: 'der', type: 'pkcs8' }),
  { name: 'Ed25519' }, true, ['sign']);
const publicKey = Buffer.from(pair.publicKey.export({ format: 'jwk' }).x, 'base64url');
const resolver = trustedRockstarEntitlementIssuerKeyResolver(JSON.stringify([
  { issuerId, issuerKeyId, publicKeyHex: publicKey.toString('hex'), status: 'active' },
]));

await test('seller issuer creates a verifiable one-time claim with channel-neutral purchase terms', async () => {
  const issued = await issueRockstarEntitlementClaim({
    issuerId,
    issuerKeyId,
    offerId: 'physical-sim-lifeline-v1',
    purchaseReferenceSha256,
    formFactor: 'physical_sim',
    scopes: ['rockstaros_access', 'sky', 'zema', 'agents'],
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
  }, privateKey, now);
  assert.match(issued.claimCode, /^rsk_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(issued.claim.claimCodeSha256, issued.claimCode);
  assert.ok(await verifyRockstarEntitlementClaim(issued.claim, issued.claimCode, resolver, now));
  assert.equal(await verifyRockstarEntitlementClaim(issued.claim, `${issued.claimCode}x`, resolver, now), null);
});

await test('replacement material signs cancellation for the old claim before replacement delivery', async () => {
  const replacement = await replaceRockstarEntitlementClaim({
    issuerId,
    issuerKeyId,
    offerId: 'esim-developer-v1',
    purchaseReferenceSha256,
    formFactor: 'esim',
    scopes: ['rockstaros_access', 'sky', 'agents'],
    replacedClaimId: 'claim-old-package',
  }, privateKey, now);
  assert.equal(replacement.cancellation.eventType, 'revoked');
  assert.equal(replacement.cancellation.claimId, 'claim-old-package');
  assert.equal(replacement.cancellation.purchaseReferenceSha256, purchaseReferenceSha256);
  assert.ok(await verifyRockstarEntitlementEvent(replacement.cancellation, resolver, now));
  assert.ok(await verifyRockstarEntitlementClaim(replacement.replacement.claim, replacement.replacement.claimCode, resolver, now));
  assert.notEqual(replacement.replacement.claim.claimId, replacement.cancellation.claimId);
});

await test('seller replacement handoff delivers only after the exact signed cancellation is acknowledged', async () => {
  let acknowledged = false;
  let issuedPackage;
  const material = await replaceRockstarEntitlementClaim({
    issuerId,
    issuerKeyId,
    offerId: 'physical-sim-lifeline-v1',
    purchaseReferenceSha256,
    formFactor: 'physical_sim',
    scopes: ['rockstaros_access', 'sky', 'zema'],
    replacedClaimId: 'claim-to-replace',
  }, privateKey, now);
  const result = await replaceRockstarEntitlementClaimWithAcknowledgement({
    ...material,
  }, {
    async submitCancellation(event, idempotencyKey) {
      assert.equal(idempotencyKey, event.eventId);
      assert.equal(event.eventType, 'revoked');
      assert.ok(await verifyRockstarEntitlementEvent(event, resolver, now));
      acknowledged = true;
      return { eventId: event.eventId, status: 'revoked', alreadyApplied: false };
    },
    async deliverReplacement(packageValue, idempotencyKey) {
      assert.equal(acknowledged, true);
      assert.equal(idempotencyKey, packageValue.claim.claimId);
      issuedPackage = packageValue;
    },
  });
  assert.deepEqual(issuedPackage, result.replacement);
  assert.equal(result.deliveryIdempotencyKey, issuedPackage.claim.claimId);
  assert.ok(await verifyRockstarEntitlementClaim(issuedPackage.claim, issuedPackage.claimCode, resolver, now));
});

await test('seller replacement handoff fails closed when cancellation acknowledgement is missing or mismatched', async () => {
  let deliveries = 0;
  for (const acknowledgement of [
    null,
    { eventId: 'different-event', status: 'revoked', alreadyApplied: false },
    { eventId: 'same-event', status: 'refunded', alreadyApplied: true },
  ]) {
    const material = await replaceRockstarEntitlementClaim({
      issuerId,
      issuerKeyId,
      offerId: 'esim-developer-v1',
      purchaseReferenceSha256,
      formFactor: 'esim',
      scopes: ['rockstaros_access', 'agents'],
      replacedClaimId: 'claim-old',
    }, privateKey, now);
    await assert.rejects(replaceRockstarEntitlementClaimWithAcknowledgement({
      ...material,
    }, {
      async submitCancellation(event) {
        return acknowledgement === null ? null : { ...acknowledgement, eventId: acknowledgement.eventId === 'same-event' ? event.eventId : acknowledgement.eventId };
      },
      async deliverReplacement() { deliveries++; },
    }), { message: 'ISSUER_CANCELLATION_UNCONFIRMED' });
  }
  assert.equal(deliveries, 0);
});

await test('retrying a retained replacement package reuses the same cancellation and delivery idempotency keys', async () => {
  const material = await replaceRockstarEntitlementClaim({
    issuerId,
    issuerKeyId,
    offerId: 'esim-developer-v1',
    purchaseReferenceSha256,
    formFactor: 'esim',
    scopes: ['rockstaros_access', 'agents'],
    replacedClaimId: 'claim-to-replace-on-retry',
  }, privateKey, now);
  const submitted = [];
  const delivered = [];
  let alreadyApplied = false;
  const callbacks = {
    async submitCancellation(event, idempotencyKey) {
      submitted.push({ event, idempotencyKey });
      const acknowledgement = { eventId: event.eventId, status: 'revoked', alreadyApplied };
      alreadyApplied = true;
      return acknowledgement;
    },
    async deliverReplacement(packageValue, idempotencyKey) {
      delivered.push({ packageValue, idempotencyKey });
    },
  };
  await replaceRockstarEntitlementClaimWithAcknowledgement(material, callbacks);
  await replaceRockstarEntitlementClaimWithAcknowledgement(material, callbacks);
  assert.equal(submitted.length, 2);
  assert.equal(submitted[0].idempotencyKey, submitted[1].idempotencyKey);
  assert.deepEqual(submitted[0].event, submitted[1].event);
  assert.equal(delivered.length, 2);
  assert.equal(delivered[0].idempotencyKey, delivered[1].idempotencyKey);
  assert.deepEqual(delivered[0].packageValue, delivered[1].packageValue);
});

await test('issuer SDK refuses invalid offers, broad scopes, expired claims, and non-signing keys', async () => {
  await assert.rejects(issueRockstarEntitlementClaim({
    issuerId,
    issuerKeyId,
    offerId: 'bad',
    purchaseReferenceSha256,
    formFactor: 'esim',
    scopes: ['root_admin'],
  }, privateKey, now), { message: 'ISSUER_CLAIM_INPUT_INVALID' });
  await assert.rejects(issueRockstarEntitlementClaim({
    issuerId,
    issuerKeyId,
    offerId: 'esim-v1',
    purchaseReferenceSha256,
    formFactor: 'esim',
    scopes: ['sky'],
    expiresAt: now,
  }, privateKey, now), { message: 'ISSUER_CLAIM_EXPIRY_INVALID' });
  await assert.rejects(issueRockstarEntitlementEvent({
    issuerId, issuerKeyId, claimId: 'claim-1', purchaseReferenceSha256, eventType: 'refunded',
  }, pair.publicKey, now), { message: 'ISSUER_SIGNING_KEY_INVALID' });
  await assert.rejects(issueRockstarEntitlementClaim({
    issuerId,
    issuerKeyId,
    offerId: 'esim-v1',
    purchaseReferenceSha256,
    formFactor: 'esim',
    scopes: ['rockstaros_access'],
  }, exportablePrivateKey, now), { message: 'ISSUER_SIGNING_KEY_INVALID' });
});

await test('signed refund/revocation event is owner-independent and rejects malformed inputs', async () => {
  const event = await issueRockstarEntitlementEvent({
    issuerId, issuerKeyId, claimId: 'claim-any-state', purchaseReferenceSha256, eventType: 'refunded',
  }, privateKey, now);
  assert.ok(await verifyRockstarEntitlementEvent(event, resolver, now));
  assert.equal(await verifyRockstarEntitlementEvent({ ...event, eventType: 'revoked' }, resolver, now), null);
  await assert.rejects(issueRockstarEntitlementEvent({
    issuerId, issuerKeyId, claimId: 'claim-1', purchaseReferenceSha256: 'invalid', eventType: 'revoked',
  }, privateKey, now), { message: 'ISSUER_EVENT_INPUT_INVALID' });
});
