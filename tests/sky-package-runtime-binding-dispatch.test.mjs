import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { skyPackageSchemaSha256 } from '../lib/sky-package-runtime.ts';
import {
  SKY_PACKAGE_RUNTIME_BINDING_SCHEMA,
  skyPackageRuntimeBindingDigest,
  skyPackageRuntimeBindingSigningBytes,
} from '../lib/sky-package-runtime-binding.ts';
import { verifySkyPackageRuntimeBindingForDispatch } from '../lib/sky-package-runtime-binding-dispatch.ts';

const origin = 'https://agent.example.com';
const runtimeExtensionUri = 'https://rockstar.example/extensions/sky-package-runtime/v2';
const packageKey = 'publisher.tool@1.2.3';
const manifestSha256 = 'a'.repeat(64);
const cardJson = JSON.stringify({ name: 'Tool Agent', version: '1.0.0' });
const cardSha256 = createHash('sha256').update(cardJson).digest('hex');
const now = Date.now();
const schema = { type: 'object', properties: { task: { type: 'string' } } };
const pair = generateKeyPairSync('ed25519');
const publicKeyHex = pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
const binding = {
  schema: SKY_PACKAGE_RUNTIME_BINDING_SCHEMA,
  providerId: 'fixture-provider',
  keyId: 'fixture-key',
  bindingId: 'fixture-binding',
  agentOrigin: origin,
  agentName: 'Tool Agent',
  agentVersion: '1.0.0',
  agentCardSha256: cardSha256,
  packageKey,
  manifestSha256,
  operationId: 'run-tool',
  runtime: 'a2a-jsonrpc-1.0',
  runtimeExtensionUri,
  inputSchemaSha256: await skyPackageSchemaSha256(schema),
  outputSchemaSha256: await skyPackageSchemaSha256(schema),
  pricingVersion: 'rates-2026-10',
  requiredUsage: [{ meter: 'task', unit: 'request' }],
  issuedAt: now - 1_000,
  expiresAt: now + 60_000,
  signature: '',
};
binding.signature = sign(null, skyPackageRuntimeBindingSigningBytes(binding), pair.privateKey).toString('base64url');
const digest = await skyPackageRuntimeBindingDigest(binding);
const trustKeys = JSON.stringify([{
  providerId: binding.providerId,
  keyId: binding.keyId,
  agentOrigin: origin,
  publicKeyHex,
  packagePins: [{ packageKey, manifestSha256 }],
  status: 'active',
}]);
const agent = {
  id: 'agent-1', origin, cardUrl: `${origin}/.well-known/agent-card.json`,
  agentName: binding.agentName, agentVersion: binding.agentVersion, cardSha256, cardJson, discoveredAt: now,
};
const pkg = {
  packageKey, manifest: { io: { inputSchema: schema, outputSchema: schema } },
  manifestSha256, status: 'verified', installable: true, createdAt: now - 10_000, publishedAt: now - 5_000,
};
const priceQuote = {
  providerId: binding.providerId,
  pricingVersion: binding.pricingVersion,
  usage: [{ meter: 'task', unit: 'request' }],
};
const bindingRow = {
  bindingId: binding.bindingId, providerId: binding.providerId, keyId: binding.keyId,
  agentOrigin: origin, packageKey, manifestSha256, digest, bindingJson: JSON.stringify(binding),
  status: 'active', createdAt: now - 1_000, createdBy: 'operator', revokedAt: null, revokedBy: null,
};
const input = {
  bindingRow, bindingId: binding.bindingId, bindingDigest: digest, agent, package: pkg,
  priceQuote, trustedKeys: trustKeys, expectedLiveAgentCardSha256: cardSha256,
  runtimeExtensionUri,
};

void test('dispatch revalidates the active signed binding and exact current Agent, Package, schema, and quote', async () => {
  assert.equal(await verifySkyPackageRuntimeBindingForDispatch(input), true);
});

void test('dispatch fails closed when binding is revoked, Agent Card changes, Package review expires, or required meter disappears', async () => {
  assert.equal(await verifySkyPackageRuntimeBindingForDispatch({
    ...input, bindingRow: { ...bindingRow, status: 'revoked', revokedAt: now, revokedBy: 'operator' },
  }), false);
  assert.equal(await verifySkyPackageRuntimeBindingForDispatch({
    ...input, expectedLiveAgentCardSha256: 'b'.repeat(64),
  }), false);
  assert.equal(await verifySkyPackageRuntimeBindingForDispatch({
    ...input, package: { ...pkg, status: 'revoked' },
  }), false);
  assert.equal(await verifySkyPackageRuntimeBindingForDispatch({
    ...input, priceQuote: { ...priceQuote, usage: [] },
  }), false);
});

void test('unbound generic A2A tasks retain their existing policy while partial binding references are denied', async () => {
  assert.equal(await verifySkyPackageRuntimeBindingForDispatch({
    ...input, bindingRow: null, bindingId: '', bindingDigest: '',
  }), true);
  assert.equal(await verifySkyPackageRuntimeBindingForDispatch({
    ...input, bindingRow: null, bindingId: binding.bindingId, bindingDigest: '',
  }), false);
});
