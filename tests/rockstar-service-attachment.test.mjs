import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SERVICE_ATTACHMENT_SCHEMA,
  serviceAttachmentSigningBytes,
  verifyServiceAttachment,
} from '../lib/rockstar-service-attachment.ts';

const now = Date.UTC(2026, 9, 20);
const hash = (letter) => letter.repeat(64);
const facts = {
  ownerAuthenticated: true,
  deviceApproved: true,
  deviceProofVerified: true,
  deviceRevoked: false,
  contractStatus: 'active',
  issuerProfileActive: true,
  ownerRef: 'owner-1',
  contractId: 'contract-1',
  contractVersion: 'terms-3',
  workspaceId: 'workspace-1',
  deviceKeyThumbprint: hash('a'),
  parentEntitlementId: 'entitlement-1',
  parentEntitlementEpoch: 7,
  audience: 'rockstar-broker',
  allowedScopes: ['sky', 'zema'],
  requiredScope: 'sky',
  capabilityProfileHash: hash('b'),
  manifestHash: hash('c'),
};

async function fixture() {
  const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  const attachment = {
    schema: SERVICE_ATTACHMENT_SCHEMA,
    issuerId: 'issuer-1',
    keyId: 'key-1',
    attachmentId: 'attachment-1',
    ownerRef: facts.ownerRef,
    contractId: facts.contractId,
    contractVersion: facts.contractVersion,
    workspaceId: facts.workspaceId,
    deviceKeyThumbprint: facts.deviceKeyThumbprint,
    parentEntitlementId: facts.parentEntitlementId,
    parentEntitlementEpoch: facts.parentEntitlementEpoch,
    scope: ['sky'],
    capabilityProfileHash: facts.capabilityProfileHash,
    manifestHash: facts.manifestHash,
    audience: facts.audience,
    issuedAt: now,
    expiresAt: now + 60_000,
    nonce: 'nonce-1',
  };
  async function signed(value) {
    const bytes = new Uint8Array(await crypto.subtle.sign(
      'Ed25519', keys.privateKey, serviceAttachmentSigningBytes(value),
    ));
    return {
      ...value,
      signature: Buffer.from(bytes).toString('base64url'),
    };
  }
  return { attachment, signed, resolveKey: async () => raw };
}

void test('valid binding works for an approved eSIM-free child device under one contract', async () => {
  const f = await fixture();
  const child = await f.signed({
    ...f.attachment,
    attachmentId: 'child-pc',
    deviceKeyThumbprint: hash('d'),
  });
  const childFacts = {
    ...facts,
    deviceKeyThumbprint: hash('d'),
  };
  assert.equal(await verifyServiceAttachment(child, childFacts, f.resolveKey, now), child);
  assert.equal(child.contractId, facts.contractId);
  assert.equal(child.workspaceId, facts.workspaceId);
});

void test('live authority changes block new access even when the signature remains valid', async () => {
  const f = await fixture();
  const attachment = await f.signed(f.attachment);
  const changes = [
    { ownerAuthenticated: false }, { deviceApproved: false },
    { deviceProofVerified: false }, { requiredScope: 'zema' },
    { deviceRevoked: true }, { contractStatus: 'restricted' },
    { issuerProfileActive: false }, { parentEntitlementEpoch: 8 },
    { contractVersion: 'terms-4' }, { deviceKeyThumbprint: hash('d') },
    { allowedScopes: ['zema'] }, { audience: 'other-service' },
    { workspaceId: 'other-workspace' },
  ];
  for (const change of changes) {
    assert.equal(await verifyServiceAttachment(
      attachment, { ...facts, ...change }, f.resolveKey, now,
    ), null, JSON.stringify(change));
  }
  assert.equal(await verifyServiceAttachment(attachment, facts, f.resolveKey, now + 60_000), null);
});

void test('tampering, extra fields, untrusted keys and overlong leases fail closed', async () => {
  const f = await fixture();
  const valid = await f.signed(f.attachment);
  assert.equal(await verifyServiceAttachment({ ...valid, scope: ['zema'] }, facts, f.resolveKey, now), null);
  assert.equal(await verifyServiceAttachment({ ...valid, bearer: 'secret' }, facts, f.resolveKey, now), null);
  assert.equal(await verifyServiceAttachment(valid, facts, async () => null, now), null);
  assert.equal(await verifyServiceAttachment(await f.signed({
    ...f.attachment, expiresAt: now + 16 * 60_000,
  }), facts, f.resolveKey, now), null);
  assert.equal(await verifyServiceAttachment(await f.signed({
    ...f.attachment, scope: ['sky', 'sky'],
  }), facts, f.resolveKey, now), null);
});
