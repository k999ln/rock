import assert from 'node:assert/strict';
import test from 'node:test';
import { compatibleLocalPackageRuntimes, isFreshMcpObservation } from '../lib/sky-package-runtime.ts';
import { createSkyToolPackageDraft } from '../lib/sky-tool-package.ts';

const packageManifest = (change = {}) => ({
  ...createSkyToolPackageDraft({
    sourceKind: 'github', sourceUrl: 'https://github.com/example/local-tool',
    developerName: 'Example', developerId: 'example', license: 'MIT',
  }),
  ...change,
});

const serverFor = (overrides = {}) => ({
  id: 'local-mcp', name: 'Local MCP', description: '', transport: 'stdio', state: 'connected',
  passport: { observationId: crypto.randomUUID(), observedAt: Date.now(), observationExpiresAt: Date.now() + 29_000, tools: [{
    name: 'execute_capability', title: 'Execute capability', description: '',
    inputSchema: { additionalProperties: false, properties: {}, type: 'object' },
    outputSchema: { additionalProperties: true, properties: {}, type: 'object' },
    pricing: { model: 'free', note: 'owner local tool' },
  }] },
  ...overrides,
});

void test('Package binds only to an explicitly owner-selected PC stdio tool with exact input and output schemas', () => {
  const manifest = packageManifest();
  const candidates = compatibleLocalPackageRuntimes(manifest, [serverFor()]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].server.id, 'local-mcp');
  assert.equal(candidates[0].tool.name, 'execute_capability');
  assert.deepEqual(compatibleLocalPackageRuntimes(manifest, [serverFor({ transport: 'streamable_http' })]), []);
  assert.deepEqual(compatibleLocalPackageRuntimes(manifest, [serverFor({ state: 'available' })]), []);
});

void test('Package-to-runtime binding rejects non-PC, paid, remote and schema-mismatched candidates', () => {
  const base = packageManifest();
  const paidPackage = packageManifest({ pricing: { ...base.pricing, model: 'usage' } });
  const nonPcPackage = packageManifest({ capabilities: { ...base.capabilities, executionTargets: ['cloud'] } });
  assert.deepEqual(compatibleLocalPackageRuntimes(paidPackage, [serverFor()]), []);
  assert.deepEqual(compatibleLocalPackageRuntimes(nonPcPackage, [serverFor()]), []);
  assert.deepEqual(compatibleLocalPackageRuntimes(base, [serverFor({ passport: { tools: [{
    ...serverFor().passport.tools[0], inputSchema: { type: 'object', properties: { prompt: { type: 'string' } } },
  }] } })]), []);
  assert.deepEqual(compatibleLocalPackageRuntimes(base, [serverFor({ passport: { tools: [{
    ...serverFor().passport.tools[0], outputSchema: undefined,
  }] } })]), []);
  assert.deepEqual(compatibleLocalPackageRuntimes(base, [serverFor({ passport: { tools: [{
    ...serverFor().passport.tools[0], pricing: { model: 'usage', note: 'metered' },
  }] } })]), []);
});

void test('SDK local HTTP runtime is a candidate only for matching local transport and exact schemas', () => {
  const original = packageManifest();
  const local = packageManifest({ adapter: { ...original.adapter, connectionType: 'mcp_streamable_http', endpointUrl: 'https://example.invalid/mcp' } });
  const localServer = serverFor({ transport: 'local_http' });
  assert.equal(compatibleLocalPackageRuntimes(local, [localServer]).length, 1);
  assert.equal(compatibleLocalPackageRuntimes(local, [serverFor({ transport: 'streamable_http' })]).length, 0);
  assert.equal(compatibleLocalPackageRuntimes(local, [serverFor({ transport: 'stdio' })]).length, 0);
  assert.equal(compatibleLocalPackageRuntimes(original, [localServer]).length, 0);
  const mismatched = { ...localServer, passport: { tools: [{ ...localServer.passport.tools[0], outputSchema: { type: 'object', properties: { wrong: { type: 'string' } } } }] } };
  assert.equal(compatibleLocalPackageRuntimes(local, [mismatched]).length, 0);
});

void test('unobserved, future, expired and excessive observation windows cannot be candidates', () => {
  const manifest = packageManifest(), base = serverFor(), now = Date.now();
  for (const stamp of [
    { observedAt: undefined, observationExpiresAt: undefined },
    { observedAt: now + 1_000, observationExpiresAt: now + 2_000 },
    { observedAt: now - 31_000, observationExpiresAt: now - 1 },
    { observedAt: now - 1, observationExpiresAt: now + 60_000 },
  ]) assert.deepEqual(compatibleLocalPackageRuntimes(manifest, [{ ...base, passport: { ...base.passport, ...stamp } }]), []);
});

void test('clock rollback and expiration cannot revive a previously observed passport, including copied readbacks', () => {
  const passport = { ...serverFor().passport, observationId: crypto.randomUUID(), observedAt: 1_000, observationExpiresAt: 31_000 };
  assert.equal(isFreshMcpObservation(passport, 1_000), true);
  assert.equal(isFreshMcpObservation({ ...passport }, 3_000), true);
  assert.equal(isFreshMcpObservation({ ...passport }, 2_000), false);
  assert.equal(isFreshMcpObservation({ ...passport }, 4_000), false);
  const next = { ...passport, observationId: crypto.randomUUID() };
  assert.equal(isFreshMcpObservation(next, 31_000), false);
  assert.equal(isFreshMcpObservation({ ...next }, 2_000), false);
  assert.equal(isFreshMcpObservation({ ...next, observationId: crypto.randomUUID() }, 2_000), true);
});

void test('rollback noticed by another observation invalidates the previous passport', () => {
  const base = serverFor().passport, first = { ...base, observationId: crypto.randomUUID(), observedAt: 1_000, observationExpiresAt: 30_000 };
  const second = { ...base, observationId: crypto.randomUUID(), observedAt: 1_000, observationExpiresAt: 30_000 };
  assert.equal(isFreshMcpObservation(first, 1_000), true);
  assert.equal(isFreshMcpObservation(second, 3_000), true);
  assert.equal(isFreshMcpObservation(first, 2_000), false);
});
