import assert from 'node:assert/strict';
import test from 'node:test';
import { NOAH_CLOUD_MODEL, NOAH_CLOUD_PROFILES, noahCloudDigest } from '../lib/noah-cloud-contract.ts';
import { noahManagedWorkDetail } from '../lib/noah-managed-work.ts';

const op = { name: 'read_graph', ok: true, inputSha256: '1'.repeat(64), resultSha256: '2'.repeat(64) };

async function workWithManifest(profile, changeManifest = {}) {
  const { version, sha256 } = NOAH_CLOUD_PROFILES[profile];
  const runtime = profile === 'time' ? 'official-python-workers' : 'official-mcp-workers';
  const text = JSON.stringify({ profile, version, distribution: sha256, runtime, operations: [op, { ...op, ok: false }], ...changeManifest });
  const file = { name: 'noah-execution.json', base64: Buffer.from(text).toString('base64'), bytes: Buffer.byteLength(text), sha256: await noahCloudDigest(text) };
  return {
    id: 'sample', revision: 2, createdAt: '2026-11-23T00:00:00Z', updatedAt: '2026-11-23T00:00:03Z',
    noahRemote: { state: 'returned', verification: 'relay_observed_unverified', digest: sha256, chargeMinor: 0,
      connectionId: 'connection', toolCalls: 1, modelCalls: 3, cloud: { profile, projectId: 'project', version, freeTier: true, files: [file] } },
  };
}

void test('common result counts the recorded tool attempts in official JS and Python receipts', async () => {
  for (const profile of ['memory', 'time']) {
    const work = await workWithManifest(profile);
    const { usageReceipt } = await noahManagedWorkDetail(work);
    assert.equal(usageReceipt.metrics.toolCalls, 2);
    assert.equal(usageReceipt.metrics.modelCalls, 3);
  }
});

void test('an unbound, corrupt or mismatched attachment never establishes a rate or a tool count', async () => {
  const work = await workWithManifest('memory');
  delete work.noahRemote.cloud.freeTier;
  const old = await noahManagedWorkDetail(work);
  assert.equal(old.usageReceipt.metrics.toolCalls, null);
  assert.equal(old.usageReceipt.pricingBasis, null);
  work.noahRemote.cloud.usage = { inputTokens: 100, outputTokens: 3, neurons: 2 };
  assert.equal((await noahManagedWorkDetail(work)).usageReceipt.metrics.toolCalls, 2);
  work.noahRemote.cloud.files[0].sha256 = 'a'.repeat(64);
  assert.equal((await noahManagedWorkDetail(work)).usageReceipt.metrics.toolCalls, null);
  for (const invalid of [{ profile: 'time' }, { version: 'other' }, { distribution: 'a'.repeat(64) },
    { runtime: 'custom' }, { operations: [{ name: 'mock', ok: true }] }]) {
    const corrupt = await workWithManifest('memory', invalid);
    assert.equal((await noahManagedWorkDetail(corrupt)).usageReceipt.metrics.toolCalls, null);
  }
});

void test('owner-account turns do not become measured model calls', async () => {
  const { noahLocalUsageReceipt } = await import('../lib/noah-work-usage-receipt.ts');
  const execution = { state: 'returned', version: '1.0', chargeMinor: 0, verification: 'host_observed_unverified', model: 'codex-account', calls: 1, provider: { metric: 'provider_turns' } };
  assert.equal(noahLocalUsageReceipt(execution).metrics.modelCalls, null);
  assert.equal(noahLocalUsageReceipt(execution).metrics.providerTurns, 1);
  assert.equal(noahLocalUsageReceipt({ ...execution, calls: 9 }).metrics.providerTurns, null);
});

void test('only received Eve designs establish zero tools and model use in the common result receipt', async () => {
  const work = await workWithManifest('hermes');
  const remote = work.noahRemote;
  remote.cloud = { ...remote.cloud, runtimePurpose: 'eve-combination-advice', runtimeModel: NOAH_CLOUD_MODEL,
    reportedModelCalls: 1, files: [], proposal: { steps: [{role:'Read'}, {role:'Write'}], deliverable:'Report' } };
  remote.modelCalls = 1;
  remote.toolCalls = 0;
  const { usageReceipt, tool } = await noahManagedWorkDetail(work);
  assert.equal(tool, 'Eve');
  assert.equal(usageReceipt.model, NOAH_CLOUD_MODEL);
  assert.equal(usageReceipt.agentVersion, null);
  assert.equal(usageReceipt.metrics.toolCalls, 0);
  remote.state = 'failed';
  delete remote.cloud.proposal;
  const failed = await noahManagedWorkDetail(work);
  assert.equal(failed.usageReceipt.model, NOAH_CLOUD_MODEL);
  assert.equal(failed.usageReceipt.metrics.toolCalls, null);
  remote.cloud.reportedModelCalls = 0;
  assert.equal((await noahManagedWorkDetail(work)).usageReceipt.model, undefined);
  delete remote.cloud.runtimePurpose;
  delete remote.cloud.runtimeModel;
  const earlier = await noahManagedWorkDetail(work);
  assert.equal(earlier.tool, NOAH_CLOUD_PROFILES.hermes.name);
  assert.equal(earlier.usageReceipt.agentVersion, NOAH_CLOUD_PROFILES.hermes.version);
  assert.equal(earlier.usageReceipt.model, undefined);
});
