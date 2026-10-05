import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesA2ADelegationRecovery } from '../lib/a2a-delegation-recovery.ts';

const request = {
  id: 'delegation-1',
  parentJobId: 'parent-1',
  predecessorDelegationId: 'source-1',
  idempotencyKey: 'zema:parent-1:request-1',
  messageId: 'message-1',
  targetOrigin: 'https://agent.example.com',
  targetAgentName: 'Research agent',
  targetAgentVersion: '1.2.0',
  message: 'Summarize the material.',
  budgetCurrency: 'USD',
  budgetLimitMinor: 250,
  parentBudgetLimitMinor: 1000,
  continueWhileDeviceOffline: true,
  deadlineAt: 2_000,
};
const inputSha256 = 'a'.repeat(64);
const record = {
  id: request.id,
  parentJobId: request.parentJobId,
  predecessorDelegationId: request.predecessorDelegationId,
  idempotencyKey: request.idempotencyKey,
  messageId: request.messageId,
  targetOrigin: request.targetOrigin,
  targetAgentName: request.targetAgentName,
  targetAgentVersion: request.targetAgentVersion,
  inputSha256,
  authorizationSha256: 'b'.repeat(64),
  state: 'awaiting_approval',
  budgetCurrency: request.budgetCurrency,
  budgetLimitMinor: request.budgetLimitMinor,
  parentBudgetLimitMinor: request.parentBudgetLimitMinor,
  continueWhileDeviceOffline: request.continueWhileDeviceOffline,
  deadlineAt: request.deadlineAt,
};

void test('recovery accepts only the exact persisted authorization intent', () => {
  assert.equal(matchesA2ADelegationRecovery(request, record, inputSha256), true);
  assert.equal(matchesA2ADelegationRecovery(request, null, inputSha256), false);
  assert.equal(matchesA2ADelegationRecovery(request, record, 'f'.repeat(64)), false);
  assert.equal(matchesA2ADelegationRecovery(request, record, 'bad-hash'), false);

  for (const [field, value] of Object.entries({
    id: 'delegation-2',
    parentJobId: 'parent-2',
    predecessorDelegationId: 'other-source',
    idempotencyKey: 'zema:other',
    messageId: 'message-2',
    targetOrigin: 'https://other.example.com',
    targetAgentName: 'Different agent',
    targetAgentVersion: '9.0',
    inputSha256: 'c'.repeat(64),
    authorizationSha256: 'invalid',
    state: '',
    budgetCurrency: 'EUR',
    budgetLimitMinor: 251,
    parentBudgetLimitMinor: 1001,
    continueWhileDeviceOffline: false,
    deadlineAt: 2_001,
  })) {
    assert.equal(
      matchesA2ADelegationRecovery(request, { ...record, [field]: value }, inputSha256),
      false,
      `${field} must remain bound to the retained request`,
    );
  }
});
