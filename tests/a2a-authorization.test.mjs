import assert from 'node:assert/strict';
import test from 'node:test';
import {
  a2aDelegationExecutionEnabled,
  a2aEgressOriginAllowed,
  createA2AIntentDigests,
} from '../lib/a2a-authorization.ts';

const base = {
  ownerUserId: 'owner-a',
  id: '00000000-0000-4000-8000-000000000001',
  parentJobId: '00000000-0000-4000-8000-000000000002',
  messageId: '00000000-0000-4000-8000-000000000003',
  targetOrigin: 'https://agent.example.test',
  targetAgentName: 'Research Agent',
  targetAgentVersion: '1.0.0',
  protocolVersion: '1.0',
  message: 'Summarize these sources.',
  budgetCurrency: 'USD',
  budgetLimitMinor: 250,
  parentBudgetLimitMinor: 1000,
  continueWhileDeviceOffline: true,
  deadlineAt: 1_800_000_000_000,
};

void test('approval digest binds owner, exact instruction, agent identity, budget and deadline', async () => {
  const baseline = await createA2AIntentDigests(base);
  assert.match(baseline.inputSha256, /^[a-f0-9]{64}$/);
  assert.match(baseline.authorizationSha256, /^[a-f0-9]{64}$/);
  for (const changed of [
    { message: 'Summarize different sources.' },
    { ownerUserId: 'owner-b' },
    { targetOrigin: 'https://other.example.test' },
    { targetAgentVersion: '1.0.1' },
    { budgetLimitMinor: 251 },
    { parentBudgetLimitMinor: 1001 },
    { continueWhileDeviceOffline: false },
    { deadlineAt: base.deadlineAt + 1 },
  ]) {
    const candidate = await createA2AIntentDigests({ ...base, ...changed });
    assert.notEqual(
      candidate.authorizationSha256,
      baseline.authorizationSha256,
    );
  }
});

void test('A2A execution stays disabled unless an operator explicitly enables the exact flag', () => {
  assert.equal(a2aDelegationExecutionEnabled(undefined), false);
  assert.equal(a2aDelegationExecutionEnabled('false'), false);
  assert.equal(a2aDelegationExecutionEnabled('TRUE'), false);
  assert.equal(a2aDelegationExecutionEnabled(true), false);
  assert.equal(a2aDelegationExecutionEnabled('true'), true);
});

void test('A2A egress requires an exact operator-allowlisted public HTTPS origin', () => {
  const allowed = 'https://agent.vendor.com,https://cloud.vendor.net';
  assert.equal(a2aEgressOriginAllowed('https://agent.vendor.com', allowed), true);
  assert.equal(a2aEgressOriginAllowed('https://agent.vendor.com', 'https://other.vendor.com'), false);
  assert.equal(a2aEgressOriginAllowed('https://agent.vendor.com:8443', allowed), false);
  assert.equal(a2aEgressOriginAllowed('https://127.0.0.1', 'https://127.0.0.1'), false);
  assert.equal(a2aEgressOriginAllowed('https://metadata.internal', 'https://metadata.internal'), false);
  assert.equal(a2aEgressOriginAllowed('https://agent.vendor.com', ''), false);
  assert.equal(a2aEgressOriginAllowed('https://agent.vendor.com', 'https://allowed.vendor.com,'), false);
  assert.equal(a2aEgressOriginAllowed('https://agent.vendor.com', 'https://user@agent.vendor.com'), false);
});
