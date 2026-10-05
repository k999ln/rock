import {
  A2A_MAX_ACTIVE_DELEGATIONS_PER_PARENT_JOB,
  A2A_MAX_DELEGATIONS_PER_PARENT_JOB,
  type A2ABudgetReservation,
  type A2ADelegation,
  type A2AParentBudget,
} from './a2a-delegation-store.ts';

export type A2AParentControllerState =
  | 'not_started'
  | 'awaiting_approval'
  | 'dispatch_pending'
  | 'running'
  | 'reconciliation_required'
  | 'review_results'
  | 'needs_attention';

export type A2AParentControllerSnapshot = {
  schemaVersion: 1;
  ownerUserId: string;
  parentJobId: string;
  state: A2AParentControllerState;
  stepCount: number;
  awaitingApprovalCount: number;
  dispatchPendingCount: number;
  runningCount: number;
  reconciliationRequiredCount: number;
  resultReadyCount: number;
  failedCount: number;
  cancelledCount: number;
  expiredCount: number;
  childLimit: number;
  activeChildLimit: number;
  budget: null | {
    currency: string;
    capMinor: number;
    reservedMinor: number;
    usageRecordedMinor: number;
    availableMinor: number;
    usageIsInvoice: false;
    invariantViolation: boolean;
  };
  nextAction:
    | 'choose_agent'
    | 'approve_each_paid_task'
    | 'wait_for_cloud_dispatch'
    | 'monitor_same_tasks'
    | 'reconcile_before_retry'
    | 'review_result_or_prepare_sibling'
    | 'review_failure_or_cancellation'
    | 'none';
};

const reconciliationStates = new Set([
  'indeterminate',
  'cancel_requested',
  'cancel_submitting',
  'cancel_unconfirmed',
]);
const runningStates = new Set([
  'dispatching',
  'dispatch_submitting',
  'submitted',
  'working',
  'awaiting_remote_input',
]);
const failedStates = new Set(['remote_failed', 'remote_rejected']);
const expiredStates = new Set(['expired']);
const cancelledStates = new Set(['cancelled_before_dispatch', 'remote_cancelled']);

/**
 * Derive a user-visible parent status from durable child rows and budget records.
 * This is deliberately read-only: it never starts, repeats, approves or cancels work.
 */
export function buildA2AParentControllerSnapshot(input: {
  ownerUserId: string;
  parentJobId: string;
  delegations: readonly A2ADelegation[];
  budget: A2AParentBudget | null;
  reservations: readonly A2ABudgetReservation[];
}): A2AParentControllerSnapshot {
  const { ownerUserId, parentJobId, delegations, budget, reservations } = input;
  if (!ownerUserId || !parentJobId || delegations.length > A2A_MAX_DELEGATIONS_PER_PARENT_JOB)
    throw new Error('INVALID_A2A_PARENT_CONTROLLER_INPUT');
  const delegationIds = new Set<string>();
  for (const delegation of delegations) {
    if (delegation.ownerUserId !== ownerUserId || delegation.parentJobId !== parentJobId ||
        delegationIds.has(delegation.id))
      throw new Error('A2A_PARENT_CONTROLLER_SCOPE_MISMATCH');
    delegationIds.add(delegation.id);
  }
  for (const reservation of reservations) {
    if (reservation.ownerUserId !== ownerUserId || reservation.parentJobId !== parentJobId ||
        !delegationIds.has(reservation.delegationId))
      throw new Error('A2A_PARENT_CONTROLLER_SCOPE_MISMATCH');
  }
  if (budget && (budget.ownerUserId !== ownerUserId || budget.parentJobId !== parentJobId ||
      !Number.isSafeInteger(budget.budgetLimitMinor) || budget.budgetLimitMinor < 0 ||
      !Number.isSafeInteger(budget.reservedMinor) || budget.reservedMinor < 0 ||
      !Number.isSafeInteger(budget.settledMinor) || budget.settledMinor < 0 || !budget.currency))
    throw new Error('A2A_PARENT_CONTROLLER_BUDGET_INVALID');

  const awaitingApprovalCount = delegations.filter((row) => row.state === 'awaiting_approval').length;
  const dispatchPendingCount = delegations.filter((row) => row.state === 'prepared').length;
  const runningCount = delegations.filter((row) => runningStates.has(row.state)).length;
  const reconciliationRequiredCount = delegations.filter((row) => reconciliationStates.has(row.state) ||
    (row.state === 'remote_completed' && row.artifactsCaptured !== 1)).length;
  const resultReadyCount = delegations.filter((row) => row.state === 'remote_completed' && row.artifactsCaptured === 1).length;
  const failedCount = delegations.filter((row) => failedStates.has(row.state)).length;
  const expiredCount = delegations.filter((row) => expiredStates.has(row.state)).length;
  const cancelledCount = delegations.filter((row) => cancelledStates.has(row.state)).length;
  const budgetInvariantViolation = Boolean(budget && budget.reservedMinor + budget.settledMinor > budget.budgetLimitMinor);

  let state: A2AParentControllerState;
  let nextAction: A2AParentControllerSnapshot['nextAction'];
  if (budgetInvariantViolation || reconciliationRequiredCount > 0) {
    state = budgetInvariantViolation ? 'needs_attention' : 'reconciliation_required';
    nextAction = budgetInvariantViolation ? 'review_failure_or_cancellation' : 'reconcile_before_retry';
  } else if (awaitingApprovalCount > 0) {
    state = 'awaiting_approval';
    nextAction = 'approve_each_paid_task';
  } else if (runningCount > 0) {
    state = 'running';
    nextAction = 'monitor_same_tasks';
  } else if (dispatchPendingCount > 0) {
    state = 'dispatch_pending';
    nextAction = 'wait_for_cloud_dispatch';
  } else if (delegations.length === 0) {
    state = 'not_started';
    nextAction = 'choose_agent';
  } else if (failedCount > 0 || cancelledCount > 0 || expiredCount > 0) {
    state = 'needs_attention';
    nextAction = 'review_failure_or_cancellation';
  } else if (resultReadyCount > 0) {
    state = 'review_results';
    nextAction = 'review_result_or_prepare_sibling';
  } else {
    state = 'needs_attention';
    nextAction = 'review_failure_or_cancellation';
  }

  return {
    schemaVersion: 1,
    ownerUserId,
    parentJobId,
    state,
    stepCount: delegations.length,
    awaitingApprovalCount,
    dispatchPendingCount,
    runningCount,
    reconciliationRequiredCount,
    resultReadyCount,
    failedCount,
    cancelledCount,
    expiredCount,
    childLimit: A2A_MAX_DELEGATIONS_PER_PARENT_JOB,
    activeChildLimit: A2A_MAX_ACTIVE_DELEGATIONS_PER_PARENT_JOB,
    budget: budget ? {
      currency: budget.currency,
      capMinor: budget.budgetLimitMinor,
      reservedMinor: budget.reservedMinor,
      usageRecordedMinor: budget.settledMinor,
      availableMinor: Math.max(0, budget.budgetLimitMinor - budget.reservedMinor - budget.settledMinor),
      usageIsInvoice: false,
      invariantViolation: budgetInvariantViolation,
    } : null,
    nextAction,
  };
}
