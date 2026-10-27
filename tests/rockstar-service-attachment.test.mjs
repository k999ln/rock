import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  SERVICE_ATTACHMENT_SCHEMA,
  serviceAttachmentSigningBytes,
  verifyServiceAttachment,
} from '../lib/rockstar-service-attachment.ts';
import { createServiceSetup, acceptServiceSetup, serviceAccessEvaluator } from '../lib/rockstar-service-setup.ts';

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
  // Reuse the repository's PUBLIC RFC8032 vector; never generate a new key.
  const vector = JSON.parse(readFileSync(new URL(
    '../android/core/src/test/resources/a2a-wallet-handoff-request-v1.json', import.meta.url,
  ), 'utf8'));
  const privateKey = await crypto.subtle.importKey('pkcs8', Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    Buffer.from(vector.testPrivateKeySeedHex, 'hex'),
  ]), 'Ed25519', false, ['sign']);
  const raw = Uint8Array.from(Buffer.from(
    'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'hex',
  ));
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
      'Ed25519', privateKey, serviceAttachmentSigningBytes(value),
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
  assert.deepEqual(await verifyServiceAttachment(child, childFacts, f.resolveKey, now), child);
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

function pendingVerification(t, stage, value, currentFacts, resolveKey) {
  let entered;
  let resume;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { resume = resolve; });
  const calls = [];
  const resolver = async (issuerId, keyId) => {
    calls.push([issuerId, keyId]);
    const raw = await resolveKey(issuerId, keyId);
    if (stage === 'resolveKey') {
      entered();
      await gate;
    }
    return raw;
  };
  if (stage !== 'resolveKey') {
    const original = crypto.subtle[stage].bind(crypto.subtle);
    t.mock.method(crypto.subtle, stage, async (...args) => {
      // Real WebCrypto consumes its original arguments before this suspension.
      const result = original(...args);
      entered();
      await gate;
      return result;
    });
  }
  t.after(() => resume());
  const result = verifyServiceAttachment(value, currentFacts, resolver, now);
  return {
    entered: Promise.race([
      enteredPromise,
      result.then(() => { throw new Error(`Verifier completed before ${stage} gate`); }),
    ]),
    resume,
    result,
    calls,
  };
}

void test('async binding never verifies later scope fields against an earlier allowlist', async t => {
  for (const stage of ['resolveKey', 'importKey']) await t.test(stage, async child => {
    const f = await fixture();
    const currentFacts = { ...facts, allowedScopes: ['sky'] };
    const wider = await f.signed({ ...f.attachment, scope: ['sky', 'zema'] });
    // The later signature must not authorize data that passed the earlier check.
    const input = { ...f.attachment, scope: ['sky'], signature: wider.signature };
    const pending = pendingVerification(child, stage, input, currentFacts, f.resolveKey);
    await pending.entered;
    input.scope.push('zema');
    pending.resume();
    const result = await pending.result;
    child.diagnostic(JSON.stringify({ stage, returnedScope: result?.scope ?? null, allowedScopes: currentFacts.allowedScopes }));
    assert.equal(result, null);
    assert.deepEqual(pending.calls, [['issuer-1', 'key-1']]);
  });
});

void test('async binding keeps the signed issuer/key pair bound to the resolver call', async t => {
  const f = await fixture();
  const swapped = await f.signed({ ...f.attachment, issuerId: 'issuer-2', keyId: 'key-2' });
  const input = { ...f.attachment, scope: ['sky'], signature: swapped.signature };
  const pending = pendingVerification(t, 'resolveKey', input, facts, f.resolveKey);
  await pending.entered;
  input.issuerId = 'issuer-2';
  input.keyId = 'key-2';
  pending.resume();
  const result = await pending.result;
  t.diagnostic(JSON.stringify({ resolved: pending.calls, returned: result && [result.issuerId, result.keyId] }));
  assert.deepEqual(pending.calls, [['issuer-1', 'key-1']]);
  assert.equal(result, null);
});

void test('async binding returns the verified snapshot when the caller mutates during verify', async t => {
  const f = await fixture();
  const input = await f.signed(f.attachment);
  const entry = structuredClone(input);
  const wider = await f.signed({ ...f.attachment, scope: ['sky', 'zema'] });
  const pending = pendingVerification(t, 'verify', input, { ...facts, allowedScopes: ['sky'] }, f.resolveKey);
  await pending.entered;
  input.scope.push('zema');
  input.signature = wider.signature;
  pending.resume();
  const result = await pending.result;
  t.diagnostic(JSON.stringify({ stage: 'verify', returnedScope: result?.scope ?? null, entryScope: entry.scope }));
  assert.deepEqual(result, entry);
  assert.notEqual(result, input);
  assert.notEqual(result.scope, input.scope);
});

void test('async binding rechecks passed authority facts after crypto awaits', async t => {
  const cases = [
    ['resolveKey', 'parent epoch', value => { value.parentEntitlementEpoch++; }],
    ['importKey', 'owner authentication', value => { value.ownerAuthenticated = false; }],
    ['verify', 'device revocation', value => { value.deviceRevoked = true; }],
    ['verify', 'scope withdrawal', value => { value.allowedScopes.splice(0, 1); }],
  ];
  for (const [stage, name, mutate] of cases) await t.test(name, async child => {
    const f = await fixture();
    const input = await f.signed(f.attachment);
    const currentFacts = { ...facts, allowedScopes: ['sky'] };
    const pending = pendingVerification(child, stage, input, currentFacts, f.resolveKey);
    await pending.entered;
    mutate(currentFacts);
    pending.resume();
    const result = await pending.result;
    child.diagnostic(JSON.stringify({ stage, changedFact: name, accepted: result !== null }));
    assert.equal(result, null);
  });
});

void test('async binding result cannot be changed through the caller input alias after success', async () => {
  const f = await fixture();
  const input = await f.signed(f.attachment);
  const entry = structuredClone(input);
  const result = await verifyServiceAttachment(input, facts, f.resolveKey, now);
  input.ownerRef = 'another-owner';
  input.scope.push('zema');
  assert.deepEqual(result, entry);
  assert.notEqual(result, input);
  assert.notEqual(result.scope, input.scope);
});

void test('setup eligibility accepts the snapshot and denies raced facts without erasing retained access', async () => {
  const f = await fixture();
  const terms = {
    schema: 'sky.linux-terms/1', version: facts.contractVersion, currency: 'USD',
    baseMinor: 1600, cpuUnitMs: 1000, cpuUnitMinor: 1, includedCpuMs: 1000,
    monthlyCapMinor: 2000, graceDays: 3, leaseSeconds: 30, retentionDays: 90,
    termsUrl: 'https://example.com/fixture-only-terms',
  };
  let setup = await createServiceSetup(facts.ownerRef, 'order-1', 'parent-device', terms, now);
  setup = await acceptServiceSetup(setup, setup.quoteDigest, true, true, now);
  setup.workspaceId = facts.workspaceId;
  setup.billing.verifiedAt = now;
  setup.runtime.verifiedAt = now;
  setup.runtime.receiptDigest = hash('d');
  const request = {
    ownerId: facts.ownerRef, workspaceId: facts.workspaceId,
    deviceKeyThumbprint: facts.deviceKeyThumbprint, requiredScope: 'sky', requestDigest: hash('e'),
  };
  const snapshot = {
    schema: 'rockstar.service-access-authorities/1', revision: 1,
    observedAt: now, validUntil: now + 30000, ownerId: facts.ownerRef, workspaceId: facts.workspaceId,
    telecom: 'offline', profile: 'not_required', client: 'supported', setup,
    setupFacts: { readiness: { enabled: true, osReady: true, reason: null },
      currentGrant: true, workspaceMatches: true, linuxCanExecute: true, linuxReason: null },
    attachment: await f.signed(f.attachment), attachmentFacts: structuredClone(facts),
    agreementDigest: setup.agreementDigest, payment: 'current', pricePolicy: 'resolved',
    budget: { state: 'reserved', requestDigest: request.requestDigest },
    retained: { ownerId: facts.ownerRef, workspaceId: facts.workspaceId, read: true, export: true },
  };
  const eligible = serviceAccessEvaluator({ readCurrent: async () => snapshot, resolveKey: f.resolveKey });
  assert.deepEqual(await eligible(request, now), { canDispatch: true, canRead: true, canExport: true, revision: 1 });
  const raced = serviceAccessEvaluator({
    readCurrent: async () => snapshot,
    resolveKey: async (issuerId, keyId) => {
      snapshot.attachmentFacts.deviceRevoked = true;
      return f.resolveKey(issuerId, keyId);
    },
  });
  const result = await raced(request, now);
  assert.deepEqual(result, { canDispatch: false, canRead: true, canExport: true, revision: 1 });
});
