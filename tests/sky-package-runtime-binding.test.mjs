import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SKY_PACKAGE_RUNTIME_BINDING_SCHEMA,
  packageRuntimeQuoteRequirementsMatch,
  skyPackageRuntimeBindingSigningBytes,
  trustedSkyPackageRuntimeBindingKeyResolver,
  verifySkyPackageRuntimeBinding,
} from '../lib/sky-package-runtime-binding.ts';
import { skyPackageSchemaSha256 } from '../lib/sky-package-runtime.ts';

const now = 1_800_000_000_000;
const agentOrigin = 'https://agent.example.com';
const runtimeExtensionUri = 'https://rockstar.example/extensions/sky-package-runtime/v2';
const agentCardSha256 = 'a'.repeat(64);
const manifestSha256 = 'b'.repeat(64);
const inputSchema = { type: 'object', properties: { prompt: { type: 'string' } } };
const outputSchema = { type: 'object', properties: { result: { type: 'string' } } };
const packageKey = 'health.local-guide@1.2.3';

async function signedBinding() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const binding = {
    schema: SKY_PACKAGE_RUNTIME_BINDING_SCHEMA,
    providerId: 'agent-host', keyId: 'key-2026-1', bindingId: 'bind-health-1',
    agentOrigin, agentName: 'Health Agent', agentVersion: '2.1.0', agentCardSha256,
    packageKey, manifestSha256, operationId: 'health.local-guide.run', runtime: 'a2a-jsonrpc-1.0', runtimeExtensionUri,
    inputSchemaSha256: await skyPackageSchemaSha256(inputSchema),
    outputSchemaSha256: await skyPackageSchemaSha256(outputSchema),
    pricingVersion: 'usage-2026-10', requiredUsage: [
      { meter: 'agent_tokens', unit: 'token' },
      { meter: 'author_runtime', unit: 'request' },
    ], issuedAt: now - 1000, expiresAt: now + 60_000, signature: '',
  };
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, pair.privateKey, skyPackageRuntimeBindingSigningBytes(binding));
  binding.signature = Buffer.from(signature).toString('base64url');
  const publicKeyHex = [...publicKey].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const configuration = JSON.stringify([{ providerId: binding.providerId, keyId: binding.keyId,
    agentOrigin, publicKeyHex, packagePins: [{ packageKey, manifestSha256 }], status: 'active' }]);
  return { binding, configuration };
}

function intent(binding) {
  return Object.fromEntries(['agentOrigin', 'agentName', 'agentVersion', 'agentCardSha256', 'packageKey',
    'manifestSha256', 'runtimeExtensionUri', 'inputSchemaSha256', 'outputSchemaSha256'].map((key) => [key, binding[key]]));
}

void test('trusted Ed25519 binding pins one exact Agent Card, Package manifest, operation and schemas', async () => {
  const { binding, configuration } = await signedBinding();
  const verified = await verifySkyPackageRuntimeBinding(binding, intent(binding),
    trustedSkyPackageRuntimeBindingKeyResolver(configuration), now);
  assert.equal(verified?.operationId, 'health.local-guide.run');
  assert.deepEqual(verified?.requiredUsage, [
    { meter: 'agent_tokens', unit: 'token' }, { meter: 'author_runtime', unit: 'request' },
  ]);
});

void test('binding rejects signature tampering, Agent or Package changes, expiry and excessive lifetime', async () => {
  const { binding, configuration } = await signedBinding();
  const resolver = trustedSkyPackageRuntimeBindingKeyResolver(configuration);
  assert.equal(await verifySkyPackageRuntimeBinding({ ...binding, operationId: 'other.operation' }, intent(binding), resolver, now), null);
  assert.equal(await verifySkyPackageRuntimeBinding(binding, { ...intent(binding), agentCardSha256: 'c'.repeat(64) }, resolver, now), null);
  assert.equal(await verifySkyPackageRuntimeBinding(binding, { ...intent(binding), manifestSha256: 'c'.repeat(64) }, resolver, now), null);
  assert.equal(await verifySkyPackageRuntimeBinding({ ...binding, expiresAt: now }, intent(binding), resolver, now), null);
  assert.equal(await verifySkyPackageRuntimeBinding({ ...binding, expiresAt: binding.issuedAt + 31 * 24 * 60 * 60 * 1000 }, intent(binding), resolver, now), null);
});

void test('binding trust keys are package-scoped, revocable and fail closed on malformed configuration', async () => {
  const { binding, configuration } = await signedBinding();
  const unauthorized = JSON.parse(configuration);
  unauthorized[0].packagePins = [{ packageKey: 'dev.other.tool@1.0.0', manifestSha256 }];
  assert.equal(await verifySkyPackageRuntimeBinding(binding, intent(binding), trustedSkyPackageRuntimeBindingKeyResolver(JSON.stringify(unauthorized)), now), null);
  const wrongVersionHash = JSON.parse(configuration);
  wrongVersionHash[0].packagePins[0].manifestSha256 = 'c'.repeat(64);
  assert.equal(await verifySkyPackageRuntimeBinding(binding, intent(binding), trustedSkyPackageRuntimeBindingKeyResolver(JSON.stringify(wrongVersionHash)), now), null);
  const revoked = JSON.parse(configuration);
  revoked[0].status = 'revoked';
  assert.equal(await verifySkyPackageRuntimeBinding(binding, intent(binding), trustedSkyPackageRuntimeBindingKeyResolver(JSON.stringify(revoked)), now), null);
  const malformed = trustedSkyPackageRuntimeBindingKeyResolver('{broken');
  assert.equal(await verifySkyPackageRuntimeBinding(binding, intent(binding), malformed, now), null);
  const extraField = { ...binding, unrecognized: true };
  assert.equal(await verifySkyPackageRuntimeBinding(extraField, intent(binding), trustedSkyPackageRuntimeBindingKeyResolver(configuration), now), null);
});

void test('quoted execution must include every signed required usage meter and pricing version', async () => {
  const { binding } = await signedBinding();
  assert.equal(packageRuntimeQuoteRequirementsMatch(binding, { pricingVersion: binding.pricingVersion,
    usage: binding.requiredUsage }), true);
  assert.equal(packageRuntimeQuoteRequirementsMatch(binding, { pricingVersion: 'old-version',
    usage: binding.requiredUsage }), false);
  assert.equal(packageRuntimeQuoteRequirementsMatch(binding, { pricingVersion: binding.pricingVersion,
    usage: [{ meter: 'agent_tokens', unit: 'token' }] }), false);
});
