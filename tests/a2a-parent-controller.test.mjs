import assert from 'node:assert/strict';
import test from 'node:test';
import { buildA2AParentControllerSnapshot } from '../lib/a2a-parent-controller.ts';

const ownerUserId = 'owner-1';
const parentJobId = 'parent-1';
const baseDelegation = (overrides = {}) => ({
  id: 'child-1', ownerUserId, parentJobId, state: 'awaiting_approval',
  artifactsCaptured: 0, ...overrides,
});
const budget = (overrides = {}) => ({
  ownerUserId, parentJobId, currency: 'USD', budgetLimitMinor: 100,
  reservedMinor: 0, settledMinor: 0, ...overrides,
});

void test('empty parent asks the user to choose an Agent without inventing a budget', () => {
  const snapshot = buildA2AParentControllerSnapshot({
    ownerUserId, parentJobId, delegations: [], budget: null, reservations: [],
  });
  assert.equal(snapshot.state, 'not_started');
  assert.equal(snapshot.nextAction, 'choose_agent');
  assert.equal(snapshot.stepCount, 0);
  assert.equal(snapshot.budget, null);
});

void test('paid approval wait stays explicit and exposes no dispatch action', () => {
  const snapshot = buildA2AParentControllerSnapshot({
    ownerUserId, parentJobId, delegations: [baseDelegation()], budget: null, reservations: [],
  });
  assert.equal(snapshot.state, 'awaiting_approval');
  assert.equal(snapshot.nextAction, 'approve_each_paid_task');
  assert.equal(snapshot.awaitingApprovalCount, 1);
});

void test('running and prepared child tasks stay distinguishable for progress tracking', () => {
  const prepared = baseDelegation({ id: 'child-2', state: 'prepared' });
  const running = baseDelegation({ id: 'child-1', state: 'working', remoteTaskId: 'remote-1' });
  const snapshot = buildA2AParentControllerSnapshot({
    ownerUserId, parentJobId, delegations: [prepared, running], budget: budget(), reservations: [],
  });
  assert.equal(snapshot.state, 'running');
  assert.equal(snapshot.runningCount, 1);
  assert.equal(snapshot.dispatchPendingCount, 1);
  assert.equal(snapshot.nextAction, 'monitor_same_tasks');
});

void test('uncertain delivery and unconfirmed cancellation require reconciliation before retry', () => {
  for (const state of ['indeterminate', 'cancel_requested', 'cancel_unconfirmed']) {
    const snapshot = buildA2AParentControllerSnapshot({
      ownerUserId, parentJobId,
      delegations: [baseDelegation({ state, remoteTaskId: 'possibly-accepted' })],
      budget: budget({ reservedMinor: 40 }), reservations: [],
    });
    assert.equal(snapshot.state, 'reconciliation_required');
    assert.equal(snapshot.nextAction, 'reconcile_before_retry');
  }
});

void test('captured task results wait for user review; receipt usage is not presented as an invoice', () => {
  const completed = baseDelegation({ state: 'remote_completed', artifactsCaptured: 1 });
  const snapshot = buildA2AParentControllerSnapshot({
    ownerUserId, parentJobId, delegations: [completed],
    budget: budget({ settledMinor: 31 }),
    reservations: [{ delegationId: completed.id, ownerUserId, parentJobId,
      currency: 'USD', reservedMinor: 60, settledMinor: 31, state: 'settled' }],
  });
  assert.equal(snapshot.state, 'review_results');
  assert.equal(snapshot.nextAction, 'review_result_or_prepare_sibling');
  assert.equal(snapshot.resultReadyCount, 1);
  assert.equal(snapshot.budget.availableMinor, 69);
  assert.equal(snapshot.budget.usageRecordedMinor, 31);
  assert.equal(snapshot.budget.usageIsInvoice, false);
});

void test('completed remote task without a captured artifact is not declared complete', () => {
  const snapshot = buildA2AParentControllerSnapshot({
    ownerUserId, parentJobId,
    delegations: [baseDelegation({ state: 'remote_completed', artifactsCaptured: 0, remoteTaskId: 'remote-1' })],
    budget: budget({ reservedMinor: 60 }), reservations: [],
  });
  assert.equal(snapshot.state, 'reconciliation_required');
  assert.equal(snapshot.reconciliationRequiredCount, 1);
});

void test('budget overflow is raised as attention and never shows spendable room', () => {
  const snapshot = buildA2AParentControllerSnapshot({
    ownerUserId, parentJobId, delegations: [baseDelegation({ state: 'working' })],
    budget: budget({ reservedMinor: 80, settledMinor: 30 }), reservations: [],
  });
  assert.equal(snapshot.state, 'needs_attention');
  assert.equal(snapshot.budget.availableMinor, 0);
  assert.equal(snapshot.budget.invariantViolation, true);
});

void test('foreign or mismatched child/reservation rows are rejected', () => {
  assert.throws(() => buildA2AParentControllerSnapshot({
    ownerUserId, parentJobId,
    delegations: [baseDelegation({ ownerUserId: 'other-owner' })], budget: null, reservations: [],
  }), { message: 'A2A_PARENT_CONTROLLER_SCOPE_MISMATCH' });
  assert.throws(() => buildA2AParentControllerSnapshot({
    ownerUserId, parentJobId, delegations: [baseDelegation()], budget: null,
    reservations: [{ delegationId: 'foreign-child', ownerUserId, parentJobId,
      currency: 'USD', reservedMinor: 1, settledMinor: null, state: 'held' }],
  }), { message: 'A2A_PARENT_CONTROLLER_SCOPE_MISMATCH' });
});

void test('failure and cancellation are surfaced as attention, while partial results invite review', () => {
  const failed = buildA2AParentControllerSnapshot({
    ownerUserId, parentJobId,
    delegations: [baseDelegation({ state: 'remote_failed' })], budget: budget(), reservations: [],
  });
  assert.equal(failed.state, 'needs_attention');
  assert.equal(failed.nextAction, 'review_failure_or_cancellation');

  const partial = buildA2AParentControllerSnapshot({
    ownerUserId, parentJobId,
    delegations: [baseDelegation({ state: 'remote_completed', artifactsCaptured: 1 }),
      baseDelegation({ id: 'child-2', state: 'remote_cancelled' })], budget: budget(), reservations: [],
  });
  assert.equal(partial.state, 'needs_attention');
  assert.equal(partial.resultReadyCount, 1);

  const expired = buildA2AParentControllerSnapshot({
    ownerUserId, parentJobId,
    delegations: [baseDelegation({ state: 'expired' })], budget: budget(), reservations: [],
  });
  assert.equal(expired.state, 'needs_attention');
  assert.equal(expired.expiredCount, 1);
});
