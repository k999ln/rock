import test from 'node:test';
import assert from 'node:assert/strict';
import { a2aApprovalReadiness } from '../lib/a2a-approval-readiness.ts';
async function fixture() {
  const request = { id: 'test-child', parentJobId: 'test-parent', idempotencyKey: 'key-1', messageId: 'message-1', targetOrigin: 'https://agent.example.com', targetAgentName: 'fixture', targetAgentVersion: '1.0.0', message: 'Synthetic material only', budgetCurrency: 'USD', budgetLimitMinor: 10, parentBudgetLimitMinor: 20, continueWhileDeviceOffline: true, deadlineAt: 2000, priceQuote: { expiresAt: 1500 } };
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(request.message))).toString('hex');
  const review = { request, delegationId: request.id, authorizationSha256: 'a'.repeat(64) };
  const status = { delegation: { ...request, inputSha256: hash, authorizationSha256: review.authorizationSha256, state: 'awaiting_approval' }, executionEnabled: true, brokerAuthorization: { registered: true, expiresAt: 1400 } };
  return { review, status };
}
void test('approval UI guidance accepts only the same unexpired persisted intent and active registered metadata', async () => {
  const { review, status } = await fixture();
  assert.equal((await a2aApprovalReadiness(review, status, 1000)).ready, true);
  for (const field of ['id', 'parentJobId', 'messageId', 'idempotencyKey', 'targetOrigin', 'targetAgentName', 'targetAgentVersion', 'inputSha256', 'authorizationSha256', 'budgetCurrency', 'budgetLimitMinor', 'parentBudgetLimitMinor', 'continueWhileDeviceOffline', 'deadlineAt']) {
    const changed = structuredClone(status);
    changed.delegation[field] = typeof changed.delegation[field] === 'number' ? changed.delegation[field] + 1 : typeof changed.delegation[field] === 'boolean' ? false : 'changed';
    assert.equal((await a2aApprovalReadiness(review, changed, 1000)).ready, false, field);
  }
});
void test('missing gate, missing or expired Broker metadata, expired quote and deadline never enable approval', async () => {
  const { review, status } = await fixture();
  for (const patch of [{ executionEnabled: false }, { executionEnabled: undefined }, { brokerAuthorization: undefined }, { brokerAuthorization: { registered: false } }, { brokerAuthorization: { registered: true, expiresAt: 1000 } }, { brokerAuthorization: { registered: true, expiresAt: NaN } }]) {
    assert.equal((await a2aApprovalReadiness(review, { ...status, ...patch }, 1000)).ready, false);
  }
  assert.equal((await a2aApprovalReadiness(review, status, 2000)).ready, false);
  assert.equal((await a2aApprovalReadiness({ ...review, request: { ...review.request, priceQuote: undefined } }, status, 1000)).ready, false);
  assert.equal((await a2aApprovalReadiness({ ...review, request: { ...review.request, priceQuote: { expiresAt: 1000 } } }, status, 1000)).ready, false);
});
void test('lost approval response can only guide a state read; prepared, running, unknown and stopped states do not enable another approval', async () => {
  const { review, status } = await fixture();
  for (const state of ['prepared', 'dispatch_submitting', 'working', 'indeterminate', 'cancel_requested', 'cancelled_before_dispatch', 'remote_completed']) {
    assert.equal((await a2aApprovalReadiness(review, { ...status, delegation: { ...status.delegation, state } }, 1000)).ready, false);
  }
});
