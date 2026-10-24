import assert from 'node:assert/strict';
import test from 'node:test';
import { makeLinuxContractSnapshot } from '../lib/sky-linux-billing.ts';
import { bindAgentMonthlyContract } from '../lib/sky-agent-monthly-statement.ts';
const workspace = { id: 'contract-test', ownerId: 'alice', contractDigest: 'a'.repeat(64), serviceStartAt: 1,
  terms: { schema: 'sky.linux-terms/1', version: 'test', currency: 'USD', baseMinor: 1600, cpuUnitMs: 1000, cpuUnitMinor: 1, includedCpuMs: 1000, monthlyCapMinor: 5000, graceDays: 3, leaseSeconds: 60, retentionDays: 30, termsUrl: 'https://example.test/terms' } };
const policy = { offerId: 'test-only', priceVersion: 'test-only', contractTextSha256: null, timezone: 'UTC', billingDay: 1, proration: null, tax: null, externalCosts: null, byok: null, additionalMeters: null, jobCapMinor: null };
const saved = () => ({ revision: 3, statement: { schema: 'sky.agent-monthly-statement/1', id: 'agent-monthly:test', ownerId: 'alice', period: '2026-09', currency: 'USD', mode: 'test', state: 'draft_unreconciled', baseMinor: 0, invoice: 'not_created', collection: 'disabled', customerPayment: 'unconfirmed', amountMinor: 100, observedMinor: 100, authorGrossMinor: 100, commissionMinor: 10, authorPayableMinor: 90, otherUsageMinor: 0, items: [{ sourceId:'existing-source', amountMinor:100 }] } });
const expected = e => ({ ownerId: 'alice', contractId: workspace.id, contractDigest: workspace.contractDigest, digest: e.digest, revision: 3 });
void test('async binding uses one detached statement, revision, envelope and consent snapshot', async () => {
  const originalEnvelope = await makeLinuxContractSnapshot(workspace, policy);
  const baseline = await bindAgentMonthlyContract(saved(), originalEnvelope, expected(originalEnvelope));
  for (const pauseAt of [1, 2]) {
    const envelope = structuredClone(originalEnvelope), document = saved(), consent = expected(envelope);
    const digest = Reflect.get(crypto.subtle, 'digest');
    let calls = 0, release, reached;
    const paused = new Promise(resolve => { reached = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    crypto.subtle.digest = async function (...args) {
      const bytes = new Uint8Array(args[1]).slice();
      if (++calls === pauseAt) { reached(); await gate; }
      return digest.call(this, args[0], bytes);
    };
    try {
      const pending = bindAgentMonthlyContract(document, envelope, consent);
      await paused;
      document.revision = 99; document.statement.currency = 'JPY'; document.statement.period = '2026-08';
      document.statement.items[0].amountMinor = 999;
      envelope.digest = 'f'.repeat(64); envelope.snapshot.ownerId = 'bob';
      consent.ownerId = 'bob'; consent.revision = 99; consent.digest = 'f'.repeat(64);
      release();
      assert.deepEqual(await pending, baseline);
      assert.equal(document.revision, 99, 'caller is not frozen or rewritten');
    } finally { release(); crypto.subtle.digest = digest; }
  }
});
void test('contract sidecar keeps pending terms, base0, all draft/author amounts and repeated document bytes unchanged', async () => {
  const e = await makeLinuxContractSnapshot(workspace, policy), original = saved(), bytes = JSON.stringify(original);
  const result = await bindAgentMonthlyContract(original, e, expected(e));
  assert.equal(result.state, 'pending'); assert.equal(result.baseIncluded, false);
  assert.equal(result.invoiceCreated, false); assert.equal(result.collectionEnabled, false);
  assert.equal(JSON.stringify(original), bytes);
  assert.deepEqual(await bindAgentMonthlyContract(original, e, expected(e)), result);
});
void test('contract binding rejects wrong owner/currency, stale revision and promoted draft before any financial side effect', async () => {
  const e = await makeLinuxContractSnapshot(workspace, policy);
  for (const change of [d => d.revision++, d => d.statement.ownerId = 'bob', d => d.statement.currency = 'JPY',
    d => d.statement.baseMinor = 1600, d => d.statement.mode = 'live', d => d.statement.invoice = 'created',
    d => d.statement.collection = 'enabled', d => d.statement.amountMinor = -1, d => d.statement.period = '2026-13']) {
    const d = saved(); change(d);
    await assert.rejects(bindAgentMonthlyContract(d, e, expected(e)));
  }
  const altered = structuredClone(e); altered.snapshot.policy.priceVersion = 'changed';
  await assert.rejects(bindAgentMonthlyContract(saved(), altered, expected(e)));
});
