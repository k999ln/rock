import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  a2aDelegationStore,
  A2ADelegationStoreError,
} from '../lib/a2a-delegation-store.ts';
import { workStore } from '../lib/work-store.ts';
import { createWorkJob } from '../lib/workflow.ts';

const migrationFiles = readdirSync(new URL('../drizzle/', import.meta.url))
  .filter((name) => name.endsWith('.sql') && !name.startsWith('._'))
  .sort();

function makeDb(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of migrationFiles)
    sqlite.exec(
      readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'),
    );
  return {
    sqlite,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              return sqlite.prepare(sql).get(...values) ?? null;
            },
            async all() {
              return { results: sqlite.prepare(sql).all(...values) };
            },
            runSync() {
              return {
                meta: {
                  changes: Number(sqlite.prepare(sql).run(...values).changes),
                },
              };
            },
            async run() {
              return this.runSync();
            },
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map((statement) => statement.runSync());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

const parentId = '00000000-0000-4000-8000-000000000001';
const baseInput = {
  id: '00000000-0000-4000-8000-000000000002',
  parentJobId: parentId,
  idempotencyKey: 'zema:parent-1:child-1',
  messageId: 'child-message-1',
  targetOrigin: 'https://agent.example.test',
  targetAgentName: 'Fixture agent',
  targetAgentVersion: '2.1',
  protocolVersion: '1.0',
  inputSha256: 'a'.repeat(64),
  authorizationSha256: 'b'.repeat(64),
  budgetCurrency: 'USD',
  budgetLimitMinor: 500,
  parentBudgetLimitMinor: 900,
  continueWhileDeviceOffline: true,
  deadlineAt: 2_000,
};
const encryptedInput = (input = baseInput) => ({
  ciphertext: 'fixture-ciphertext',
  nonce: 'fixture-nonce',
  inputSha256: input.inputSha256,
  keyVersion: 'aes-256-gcm-v1',
});

async function setup(t) {
  const db = makeDb(t);
  const jobs = workStore(db);
  await jobs.create(
    'alice',
    createWorkJob(
      { id: parentId, title: 'collect sources', templateId: 'article' },
      new Date(1000).toISOString(),
    ),
  );
  return { db, store: a2aDelegationStore(db) };
}

async function approved(store, input = baseInput, now = 1_050) {
  const draft = await store.prepare('alice', input, 1_000);
  return {
    delegation: await store.approve(
      'alice',
      draft.delegation.id,
      input.authorizationSha256,
      encryptedInput(input),
      now,
    ),
  };
}

async function completedAndCaptured(store, input, now = 1_100) {
  const prepared = await approved(store, input, now - 50);
  const claimed = await store.claimDispatch('alice', prepared.delegation.id, now);
  const sending = await store.beginRemoteSend('alice', claimed.id, claimed.revision, now + 1);
  const completed = await store.recordTaskReceipt('alice', sending.id, sending.revision,
    { id: `remote-${input.id}`, state: 'TASK_STATE_COMPLETED' }, now + 2);
  await store.saveArtifact('alice', completed.id, completed.remoteTaskId, {
    ciphertext: 'fixture-ciphertext', nonce: 'fixture-nonce',
    artifactSha256: 'e'.repeat(64), keyVersion: 'aes-256-gcm-v1',
  }, 24, now + 3);
  return store.markArtifactsCaptured('alice', completed.id, completed.remoteTaskId,
    completed.revision, now + 4);
}

function childInput(sequence, overrides = {}) {
  const suffix = String(sequence).padStart(12, '0');
  return {
    ...baseInput,
    id: `00000000-0000-4000-8000-${suffix}`,
    idempotencyKey: `zema:parent-1:child-${sequence}`,
    messageId: `child-message-${sequence}`,
    inputSha256: String(sequence).repeat(64).slice(0, 64),
    authorizationSha256: String((sequence % 9) + 1).repeat(64),
    ...overrides,
  };
}

void test('cloud delegation cannot be queued without affirmative offline-continuation consent', async (t) => {
  const { store } = await setup(t);
  await assert.rejects(
    store.prepare('alice', childInput(8, { continueWhileDeviceOffline: false }), 1_000),
    (error) => error instanceof A2ADelegationStoreError &&
      error.code === 'invalid_offline_continuation_consent',
  );
});

void test('lost draft responses can be recovered only by owner, parent, key, and input hash', async (t) => {
  const { store } = await setup(t);
  const input = childInput(1);
  const prepared = await store.prepare('alice', input, 1_000);
  assert.equal(
    (await store.getByIdempotency('alice', parentId, input.idempotencyKey, input.inputSha256)).id,
    prepared.delegation.id,
  );
  assert.equal(await store.getByIdempotency('alice', parentId, input.idempotencyKey, 'f'.repeat(64)), null);
  assert.equal(await store.getByIdempotency('bob', parentId, input.idempotencyKey, input.inputSha256), null);
  assert.equal(await store.getByIdempotency('alice', '00000000-0000-4000-8000-000000000099', input.idempotencyKey, input.inputSha256), null);
});

void test('Zema persists a reviewed result-to-successor edge once under the same owner and parent', async (t) => {
  const { db, store } = await setup(t);
  const predecessor = await completedAndCaptured(store, childInput(16, { deadlineAt: 5_000 }));
  const successorInput = childInput(17, {
    deadlineAt: 6_000,
    predecessorDelegationId: predecessor.id,
  });
  const successor = await store.prepare('alice', successorInput, 1_200);
  assert.equal(successor.created, true);
  assert.equal(successor.delegation.predecessorDelegationId, predecessor.id);
  assert.equal((await store.listForParent('alice', parentId))
    .find((item) => item.id === successor.delegation.id).predecessorDelegationId, predecessor.id);
  const recovered = await store.prepare('alice', successorInput, 1_201);
  assert.equal(recovered.created, false);
  assert.equal(recovered.delegation.id, successor.delegation.id);

  await assert.rejects(
    store.prepare('alice', childInput(18, {
      deadlineAt: 6_000,
      predecessorDelegationId: predecessor.id,
    }), 1_202),
    (error) => error instanceof A2ADelegationStoreError && error.code === 'a2a_predecessor_conflict',
  );
  const unreviewed = await store.prepare('alice', childInput(19), 1_203);
  await assert.rejects(
    store.prepare('alice', childInput(20, {
      deadlineAt: 6_000,
      predecessorDelegationId: unreviewed.delegation.id,
    }), 1_204),
    (error) => error instanceof A2ADelegationStoreError && error.code === 'a2a_predecessor_conflict',
  );

  const root = await completedAndCaptured(store, childInput(21, {
    deadlineAt: 8_000, budgetLimitMinor: 100,
  }), 1_300);
  const middle = await completedAndCaptured(store, childInput(22, {
    deadlineAt: 9_000,
    budgetLimitMinor: 100,
    predecessorDelegationId: root.id,
  }), 1_400);
  await assert.rejects(
    store.prepare('alice', childInput(23, {
      deadlineAt: 10_000,
      budgetLimitMinor: 100,
      predecessorDelegationId: middle.id,
    }), 1_500),
    (error) => error instanceof A2ADelegationStoreError && error.code === 'a2a_predecessor_depth_exceeded',
  );
  assert.throws(() => db.sqlite.prepare(`INSERT INTO agent_delegations (
    id, owner_user_id, parent_job_id, predecessor_delegation_id, idempotency_key,
    message_id, target_origin, target_agent_name, target_agent_version, protocol_version,
    input_sha256, authorization_sha256, budget_currency, budget_limit_minor,
    parent_budget_limit_minor, continue_while_device_offline, deadline_at, state,
    revision, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
    .run('00000000-0000-4000-8000-000000000023', 'alice', parentId, middle.id,
      'zema:parent-1:child-23-raw', 'child-message-23-raw', 'https://agent.example.test',
      'Fixture agent', '2.1', '1.0', 'f'.repeat(64), 'e'.repeat(64), 'USD', 500,
      900, 1, 10_000, 'awaiting_approval', 1_500, 1_500),
    /A2A_PARENT_PREDECESSOR_NOT_REVIEWABLE/,
  );
});

void test('approvals reserve child caps from one owner-scoped parent budget', async (t) => {
  const { store } = await setup(t);
  const firstInput = childInput(2, { budgetLimitMinor: 300 });
  const secondInput = childInput(3, { budgetLimitMinor: 400 });
  const first = await approved(store, firstInput);
  const second = await approved(store, secondInput);

  assert.deepEqual({ ...await store.getBudget('alice', parentId) }, {
    ownerUserId: 'alice',
    parentJobId: parentId,
    currency: 'USD',
    budgetLimitMinor: 900,
    reservedMinor: 700,
    settledMinor: 0,
    revision: 2,
    createdAt: 1_050,
    updatedAt: 1_050,
  });
  assert.equal(
    (await store.getBudgetReservation('alice', first.delegation.id)).state,
    'held',
  );
  assert.equal(
    (await store.getBudgetReservation('alice', second.delegation.id)).reservedMinor,
    400,
  );
  assert.equal(await store.getBudget('bob', parentId), null);
  assert.equal((await store.listBudgetReservations('alice', parentId)).length, 2);
  assert.deepEqual(await store.listBudgetReservations('bob', parentId), []);
});

void test('parallel approvals cannot reserve more than the shared parent cap', async (t) => {
  const { store } = await setup(t);
  const firstInput = childInput(4, { budgetLimitMinor: 600, parentBudgetLimitMinor: 1_000 });
  const secondInput = childInput(5, { budgetLimitMinor: 600, parentBudgetLimitMinor: 1_000 });
  const drafts = await Promise.all([
    store.prepare('alice', firstInput, 1_000),
    store.prepare('alice', secondInput, 1_000),
  ]);
  const results = await Promise.allSettled(drafts.map((draft, index) =>
    store.approve(
      'alice',
      draft.delegation.id,
      [firstInput, secondInput][index].authorizationSha256,
      encryptedInput([firstInput, secondInput][index]),
      1_050,
    ),
  ));

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejection = results.find((result) => result.status === 'rejected');
  assert.equal(rejection.reason.code, 'parent_budget_exceeded');
  assert.equal((await store.getBudget('alice', parentId)).reservedMinor, 600);
  assert.equal((await store.listBudgetReservations('alice', parentId)).length, 1);
});

void test('pre-send cancellation and failure release held budget; uncertain remote work keeps it held', async (t) => {
  const { store } = await setup(t);
  const cancelInput = childInput(6, { budgetLimitMinor: 200 });
  const canceled = await approved(store, cancelInput);
  assert.equal((await store.getBudget('alice', parentId)).reservedMinor, 200);
  await store.requestCancel('alice', canceled.delegation.id, 1_100);
  assert.equal((await store.getBudgetReservation('alice', canceled.delegation.id)).state, 'released');
  assert.equal((await store.getBudget('alice', parentId)).reservedMinor, 0);

  const failedInput = childInput(7, { budgetLimitMinor: 250 });
  const failed = await approved(store, failedInput);
  const failedClaim = await store.claimDispatch('alice', failed.delegation.id, 1_100);
  await store.markPreflightFailed('alice', failed.delegation.id, failedClaim.revision, 1_150);
  assert.equal((await store.getBudgetReservation('alice', failed.delegation.id)).state, 'released');
  assert.equal((await store.getBudget('alice', parentId)).reservedMinor, 0);

  const uncertainInput = childInput(8, { budgetLimitMinor: 300 });
  const uncertain = await approved(store, uncertainInput);
  const claim = await store.claimDispatch('alice', uncertain.delegation.id, 1_200);
  const sending = await store.beginRemoteSend('alice', claim.id, claim.revision, 1_210);
  await store.markIndeterminate('alice', sending.id, sending.revision, 1_220);
  assert.equal((await store.getBudgetReservation('alice', uncertain.delegation.id)).state, 'held');
  assert.equal((await store.getBudget('alice', parentId)).reservedMinor, 300);
});

void test('final provider usage receipt settles the held child cap once and keeps parent accounting exact', async (t) => {
  const { store } = await setup(t);
  const prepared = await approved(store, childInput(9, { budgetLimitMinor: 300 }));
  const claim = await store.claimDispatch('alice', prepared.delegation.id, 1_100);
  const sending = await store.beginRemoteSend('alice', claim.id, claim.revision, 1_110);
  const received = await store.recordTaskReceipt('alice', sending.id, sending.revision, {
    id: 'remote-task-9', state: 'TASK_STATE_COMPLETED',
  }, 1_120);
  assert.equal(received.state, 'remote_completed');
  const receipt = {
    schema: 'rock-a2a-provider-usage-receipt/1', providerId: 'provider-x', keyId: 'usage-key',
    receiptId: 'usage-9', ownerUserId: 'alice', parentJobId: parentId,
    delegationId: prepared.delegation.id, taskId: 'remote-task-9',
    agentOrigin: prepared.delegation.targetOrigin, agentName: prepared.delegation.targetAgentName,
    agentVersion: prepared.delegation.targetAgentVersion, currency: 'USD', amountMinor: 47,
    pricingVersion: 'fixture-1', issuedAt: 1_120,
    usage: [{ meter: 'tokens', quantity: 300, unit: 'token', amountMinor: 47 }], signature: 's'.repeat(86),
  };
  const settled = await store.settleUsageReceipt('alice', prepared.delegation.id, receipt, 1_130);
  assert.equal(settled.reservation.state, 'settled');
  assert.equal(settled.reservation.settledMinor, 47);
  assert.equal(JSON.parse(settled.receipt.receiptJson).receiptId, 'usage-9');
  assert.deepEqual(
    { reserved: (await store.getBudget('alice', parentId)).reservedMinor, settled: (await store.getBudget('alice', parentId)).settledMinor },
    { reserved: 0, settled: 47 },
  );
  const replay = await store.settleUsageReceipt('alice', prepared.delegation.id, receipt, 1_140);
  assert.equal(replay.reservation.settledMinor, 47);
  await assert.rejects(
    store.settleUsageReceipt('alice', prepared.delegation.id, { ...receipt, receiptId: 'different-receipt', amountMinor: 48 }, 1_150),
    (error) => error instanceof A2ADelegationStoreError && error.code === 'usage_receipt_conflict',
  );
  assert.equal(await store.getUsageReceipt('bob', prepared.delegation.id), null);
});

void test('budget cannot be settled without a persisted matching usage receipt or above the reservation', async (t) => {
  const { store } = await setup(t);
  const prepared = await approved(store, childInput(10, { budgetLimitMinor: 300 }));
  await assert.rejects(
    store.settleUsageReceipt('alice', prepared.delegation.id, {
      providerId: 'provider-x', receiptId: 'no-task', signature: 's'.repeat(86),
      currency: 'USD', amountMinor: 1, issuedAt: 1_100,
    }, 1_100),
    (error) => error instanceof A2ADelegationStoreError && error.code === 'invalid_usage_receipt',
  );
  const claim = await store.claimDispatch('alice', prepared.delegation.id, 1_100);
  const sending = await store.beginRemoteSend('alice', claim.id, claim.revision, 1_110);
  await store.recordTaskReceipt('alice', sending.id, sending.revision, { id: 'remote-task-10', state: 'TASK_STATE_COMPLETED' }, 1_120);
  const overCap = {
    schema: 'rock-a2a-provider-usage-receipt/1', providerId: 'provider-x', keyId: 'usage-key',
    receiptId: 'usage-10', ownerUserId: 'alice', parentJobId: parentId,
    delegationId: prepared.delegation.id, taskId: 'remote-task-10', agentOrigin: prepared.delegation.targetOrigin,
    agentName: prepared.delegation.targetAgentName, agentVersion: prepared.delegation.targetAgentVersion,
    currency: 'USD', amountMinor: 301, pricingVersion: 'fixture-1', issuedAt: 1_120,
    usage: [{ meter: 'tokens', quantity: 1, unit: 'token', amountMinor: 301 }], signature: 's'.repeat(86),
  };
  await assert.rejects(
    store.settleUsageReceipt('alice', prepared.delegation.id, overCap, 1_130),
    (error) => error instanceof A2ADelegationStoreError && error.code === 'invalid_usage_receipt',
  );
  const reservation = await store.getBudgetReservation('alice', prepared.delegation.id);
  assert.equal(reservation.state, 'held');
  assert.equal((await store.getBudget('alice', parentId)).reservedMinor, 300);
});

void test('delegation is persisted per owner and idempotency conflicts preserve original task', async (t) => {
  const { store } = await setup(t);
  const first = await store.prepare('alice', baseInput, 1_000);
  assert.equal(first.created, true);
  assert.equal(first.delegation.state, 'awaiting_approval');
  assert.equal(first.delegation.parentJobId, parentId);
  assert.equal(await store.get('bob', baseInput.id), null);
  assert.deepEqual(await store.listForParent('bob', parentId), []);
  assert.deepEqual(
    (await store.listEvents('alice', baseInput.id)).map(
      (event) => event.eventType,
    ),
    ['approval_requested'],
  );
  assert.deepEqual(await store.listEvents('bob', baseInput.id), []);

  const replay = await store.prepare('alice', baseInput, 1_500);
  assert.equal(replay.delegation.id, baseInput.id);
  assert.equal(replay.delegation.createdAt, 1_000);
  await assert.rejects(
    store.prepare('alice', { ...baseInput, targetAgentVersion: '2.2' }, 1_500),
    (error) =>
      error instanceof A2ADelegationStoreError &&
      error.code === 'delegation_idempotency_conflict',
  );
  assert.equal((await store.listForParent('alice', parentId)).length, 1);
});

void test('dispatch claim is one-shot and uncertain sends can only be reconciled, never claimed again', async (t) => {
  const { store } = await setup(t);
  const prepared = await approved(store);
  const claimed = await store.claimDispatch(
    'alice',
    prepared.delegation.id,
    1_100,
  );
  assert.equal(claimed.state, 'dispatching');
  assert.equal(
    await store.claimDispatch('alice', prepared.delegation.id, 1_200),
    null,
  );
  const sending = await store.beginRemoteSend(
    'alice',
    claimed.id,
    claimed.revision,
    1_250,
  );

  const uncertain = await store.markIndeterminate(
    'alice',
    sending.id,
    sending.revision,
    1_300,
  );
  assert.equal(uncertain.state, 'indeterminate');
  assert.equal(
    await store.claimDispatch('alice', prepared.delegation.id, 1_400),
    null,
  );

  const reconciled = await store.reconcileRemoteTask(
    'alice',
    uncertain.id,
    uncertain.revision,
    {
      id: 'provider-task-99',
      contextId: 'provider-context',
      state: 'TASK_STATE_WORKING',
    },
    1_500,
  );
  assert.equal(reconciled.state, 'working');
  assert.equal(reconciled.remoteTaskId, 'provider-task-99');
  assert.equal(reconciled.remoteContextId, 'provider-context');
  assert.deepEqual(
    (await store.listEvents('alice', prepared.delegation.id)).map(
      (event) => event.toState,
    ),
    [
      'awaiting_approval',
      'prepared',
      'dispatching',
      'dispatch_submitting',
      'indeterminate',
      'working',
    ],
  );
});

void test('owner approval atomically stores encrypted input and expiry removes it', async (t) => {
  const { store } = await setup(t);
  const prepared = await approved(store);
  const input = await store.getInput('alice', prepared.delegation.id);
  assert.equal(input.inputSha256, baseInput.inputSha256);
  assert.equal(input.expiresAt, baseInput.deadlineAt);
  assert.equal(await store.getInput('bob', prepared.delegation.id), null);
  assert.equal((await store.purgeExpiredInputs(baseInput.deadlineAt - 1)).meta.changes, 0);
  assert.equal((await store.purgeExpiredInputs(baseInput.deadlineAt)).meta.changes, 1);
  assert.equal(await store.getInput('alice', prepared.delegation.id), null);
});

void test('remote send has its own one-shot marker so workflow retries cannot submit twice', async (t) => {
  const { store } = await setup(t);
  const prepared = await approved(store);
  const claim = await store.claimDispatch('alice', prepared.delegation.id, 1_100);
  assert.equal(claim.state, 'dispatching');
  const sending = await store.beginRemoteSend(
    'alice',
    claim.id,
    claim.revision,
    1_101,
  );
  assert.equal(sending.state, 'dispatch_submitting');
  await assert.rejects(
    store.beginRemoteSend('alice', claim.id, claim.revision, 1_102),
    (error) =>
      error instanceof A2ADelegationStoreError &&
      error.code === 'delegation_revision_conflict',
  );
  const recovered = await store.markIndeterminate(
    'alice',
    sending.id,
    sending.revision,
    1_103,
  );
  assert.equal(recovered.state, 'indeterminate');
  assert.equal(
    await store.claimDispatch('alice', prepared.delegation.id, 1_104),
    null,
  );
});

void test('agent discovery failure before the one-shot send is terminal but not mislabeled indeterminate', async (t) => {
  const { store } = await setup(t);
  const prepared = await approved(store);
  const claimed = await store.claimDispatch('alice', prepared.delegation.id, 1_100);
  const failed = await store.markPreflightFailed(
    'alice',
    prepared.delegation.id,
    claimed.revision,
    1_200,
  );
  assert.equal(failed.state, 'remote_failed');
  assert.equal(failed.remoteState, 'PREFLIGHT_FAILED_BEFORE_SEND');
  assert.equal(
    await store.claimDispatch('alice', prepared.delegation.id, 1_300),
    null,
  );
});

void test('cancel during discovery closes locally before any remote send marker exists', async (t) => {
  const { store } = await setup(t);
  const prepared = await approved(store);
  await store.claimDispatch('alice', prepared.delegation.id, 1_100);
  const canceled = await store.requestCancel(
    'alice',
    prepared.delegation.id,
    1_200,
  );
  assert.equal(canceled.state, 'cancelled_before_dispatch');
  assert.equal(canceled.remoteState, 'NOT_DISPATCHED');
  assert.equal(
    await store.claimDispatch('alice', prepared.delegation.id, 1_300),
    null,
  );
});

void test('durable reconciliation polls remote tasks and sends cancellation once', async (t) => {
  const { store } = await setup(t);
  const prepared = await approved(store);
  const claimed = await store.claimDispatch('alice', prepared.delegation.id, 1_100);
  const sending = await store.beginRemoteSend(
    'alice',
    claimed.id,
    claimed.revision,
    1_101,
  );
  const received = await store.recordTaskReceipt(
    'alice',
    sending.id,
    sending.revision,
    { id: 'remote-task-1', contextId: 'remote-context-1', state: 'TASK_STATE_WORKING' },
    1_102,
  );
  assert.equal(received.state, 'working');
  assert.equal((await store.listForReconciliation()).length, 1);

  const requested = await store.requestCancel('alice', received.id, 1_200);
  const canceling = await store.beginCancelAttempt(
    'alice',
    requested.id,
    requested.revision,
    1_201,
  );
  assert.equal(canceling.state, 'cancel_submitting');
  await assert.rejects(
    store.beginCancelAttempt('alice', requested.id, requested.revision, 1_202),
    (error) =>
      error instanceof A2ADelegationStoreError &&
      error.code === 'delegation_revision_conflict',
  );
  const uncertain = await store.markCancelUnconfirmed(
    'alice',
    canceling.id,
    canceling.revision,
    1_203,
  );
  assert.equal(uncertain.state, 'cancel_unconfirmed');
  const stillRunning = await store.reconcileRemoteTask(
    'alice',
    uncertain.id,
    uncertain.revision,
    { id: 'remote-task-1', contextId: 'remote-context-1', state: 'TASK_STATE_WORKING' },
    1_204,
  );
  assert.equal(stillRunning.state, 'cancel_unconfirmed');
  const canceled = await store.confirmCancelResult(
    'alice',
    stillRunning.id,
    stillRunning.revision,
    'TASK_STATE_CANCELED',
    1_205,
  );
  assert.equal(canceled.state, 'remote_cancelled');
  assert.equal((await store.listForReconciliation()).length, 1);
  const captured = await store.markArtifactsCaptured(
    'alice',
    canceled.id,
    'remote-task-1',
    canceled.revision,
    1_206,
  );
  assert.equal(captured.artifactsCaptured, 1);
  assert.deepEqual(await store.listForReconciliation(), []);
});

void test('scheduled deadline cleanup expires pre-send work and releases its held budget', async (t) => {
  const { store } = await setup(t);
  const overdueApproval = await store.prepare('alice', childInput(13, { deadlineAt: 1_100 }), 1_000);
  const overduePrepared = await approved(store, childInput(14, { deadlineAt: 1_100, budgetLimitMinor: 200 }), 1_050);
  assert.equal((await store.getBudget('alice', parentId)).reservedMinor, 200);

  assert.equal(await store.expireOverdueBeforeDispatch(1_100), 2);
  assert.equal((await store.get('alice', overdueApproval.delegation.id)).state, 'expired');
  assert.equal((await store.get('alice', overduePrepared.delegation.id)).state, 'expired');
  assert.equal((await store.getBudgetReservation('alice', overduePrepared.delegation.id)).state, 'released');
  assert.equal((await store.getBudget('alice', parentId)).reservedMinor, 0);
  assert.equal(await store.expireOverdueBeforeDispatch(1_101), 0);
});

void test('deadline scan requests cancellation for overdue remote work without claiming it stopped', async (t) => {
  const { store } = await setup(t);
  const prepared = await approved(store, childInput(15, { deadlineAt: 2_000 }), 1_050);
  const claimed = await store.claimDispatch('alice', prepared.delegation.id, 1_100);
  const sending = await store.beginRemoteSend('alice', claimed.id, claimed.revision, 1_101);
  const running = await store.recordTaskReceipt('alice', sending.id, sending.revision,
    { id: 'remote-deadline-task', state: 'TASK_STATE_WORKING' }, 1_102);
  const overdue = await store.listOverdueRemoteTasks(2_000);
  assert.deepEqual(overdue.map((item) => item.id), [running.id]);

  const requested = await store.requestCancel('alice', running.id, 2_000);
  assert.equal(requested.state, 'cancel_requested');
  assert.equal(requested.remoteState, 'TASK_STATE_WORKING');
  assert.equal((await store.getBudgetReservation('alice', running.id)).state, 'held');
});

void test('terminal remote tasks stay reconcilable until their encrypted result is captured', async (t) => {
  const { store } = await setup(t);
  const prepared = await approved(store);
  const claimed = await store.claimDispatch('alice', prepared.delegation.id, 1_100);
  const sending = await store.beginRemoteSend('alice', claimed.id, claimed.revision, 1_101);
  const completed = await store.recordTaskReceipt(
    'alice',
    sending.id,
    sending.revision,
    { id: 'remote-task-result', state: 'TASK_STATE_COMPLETED' },
    1_102,
  );
  assert.equal(completed.state, 'remote_completed');
  assert.equal(completed.artifactsCaptured, 0);
  assert.equal((await store.listForReconciliation()).length, 1);

  const encrypted = {
    ciphertext: 'fixture-ciphertext',
    nonce: 'fixture-nonce',
    artifactSha256: 'c'.repeat(64),
    keyVersion: 'aes-256-gcm-v1',
  };
  assert.equal(
    await store.saveArtifact(
      'alice',
      completed.id,
      'remote-task-result',
      encrypted,
      24,
      1_103,
    ),
    true,
  );
  assert.equal(
    await store.saveArtifact(
      'alice',
      completed.id,
      'remote-task-result',
      encrypted,
      24,
      1_104,
    ),
    false,
  );
  assert.equal((await store.listArtifacts('bob', completed.id)).length, 0);
  assert.equal((await store.listArtifacts('alice', completed.id)).length, 1);
  const captured = await store.markArtifactsCaptured(
    'alice',
    completed.id,
    'remote-task-result',
    completed.revision,
    1_105,
  );
  assert.equal(captured.artifactsCaptured, 1);
  assert.deepEqual(await store.listForReconciliation(), []);
  assert.equal(
    (await store.listEvents('alice', completed.id)).at(-1).eventType,
    'remote_artifacts_captured',
  );
});

void test('dispatch requires owner approval of the exact persisted intent', async (t) => {
  const { store } = await setup(t);
  const draft = await store.prepare('alice', baseInput, 1_000);
  assert.equal(draft.delegation.state, 'awaiting_approval');
  assert.equal(
    await store.claimDispatch('alice', draft.delegation.id, 1_100),
    null,
  );
  await assert.rejects(
    store.approve('alice', draft.delegation.id, 'c'.repeat(64), encryptedInput(), 1_100),
    (error) =>
      error instanceof A2ADelegationStoreError &&
      error.code === 'approval_digest_mismatch',
  );
  assert.equal(
    (await store.get('alice', draft.delegation.id)).state,
    'awaiting_approval',
  );
  assert.equal(
    await store.approve(
      'bob',
      draft.delegation.id,
      baseInput.authorizationSha256,
      encryptedInput(),
      1_100,
    ),
    null,
  );
  assert.equal(
    (
      await store.approve(
        'alice',
        draft.delegation.id,
        baseInput.authorizationSha256,
        encryptedInput(),
        1_100,
      )
    ).state,
    'prepared',
  );
  assert.deepEqual(
    (await store.listEvents('alice', draft.delegation.id)).map(
      (event) => event.eventType,
    ),
    ['approval_requested', 'user_approved'],
  );
  await assert.rejects(
    store.approve(
      'alice',
      draft.delegation.id,
      baseInput.authorizationSha256,
      encryptedInput(),
      1_200,
    ),
    (error) =>
      error instanceof A2ADelegationStoreError &&
      error.code === 'delegation_not_awaiting_approval',
  );
});

void test('expired approval and cancellation remain non-dispatchable', async (t) => {
  const { store } = await setup(t);
  const expiredInput = { ...baseInput, deadlineAt: 1_050 };
  const expired = await store.prepare('alice', expiredInput, 1_000);
  assert.equal(
    (
      await store.approve(
        'alice',
        expired.delegation.id,
        baseInput.authorizationSha256,
        encryptedInput(expiredInput),
        1_060,
      )
    ).state,
    'expired',
  );
  assert.equal(
    await store.claimDispatch('alice', expired.delegation.id, 1_070),
    null,
  );
  const cancelInput = {
    ...baseInput,
    id: '00000000-0000-4000-8000-000000000003',
    idempotencyKey: 'cancel-before-approval',
    messageId: 'cancel-before-approval',
  };
  const draft = await store.prepare('alice', cancelInput, 1_000);
  assert.equal(
    (await store.requestCancel('alice', draft.delegation.id, 1_020)).state,
    'cancelled_before_dispatch',
  );
  assert.equal(
    await store.claimDispatch('alice', draft.delegation.id, 1_030),
    null,
  );
});

void test('concurrent dispatch claims cannot create two remote send attempts', async (t) => {
  const { store } = await setup(t);
  const prepared = await approved(store);
  const claims = await Promise.allSettled([
    store.claimDispatch('alice', prepared.delegation.id, 1_100),
    store.claimDispatch('alice', prepared.delegation.id, 1_100),
  ]);
  const successful = claims.filter(
    (result) =>
      result.status === 'fulfilled' && result.value?.state === 'dispatching',
  );
  assert.equal(successful.length, 1);
  assert.deepEqual(
    (await store.listEvents('alice', prepared.delegation.id)).map(
      (event) => event.toState,
    ),
    ['awaiting_approval', 'prepared', 'dispatching'],
  );
});

void test('cancel request remains unconfirmed until remote task reports cancellation', async (t) => {
  const { store } = await setup(t);
  const prepared = await approved(store);
  const claimed = await store.claimDispatch(
    'alice',
    prepared.delegation.id,
    1_100,
  );
  const submitted = await store.recordTaskReceipt(
    'alice',
    claimed.id,
    claimed.revision,
    {
      id: 'provider-task-100',
      state: 'TASK_STATE_SUBMITTED',
    },
    1_200,
  );
  const requested = await store.requestCancel('alice', submitted.id, 1_300);
  assert.equal(requested.state, 'cancel_requested');
  const stillWorking = await store.confirmCancelResult(
    'alice',
    requested.id,
    requested.revision,
    'TASK_STATE_WORKING',
    1_400,
  );
  assert.equal(stillWorking.state, 'cancel_unconfirmed');
  const canceled = await store.confirmCancelResult(
    'alice',
    stillWorking.id,
    stillWorking.revision,
    'TASK_STATE_CANCELED',
    1_500,
  );
  assert.equal(canceled.state, 'remote_cancelled');
  assert.equal(canceled.remoteState, 'TASK_STATE_CANCELED');
});

void test('unspecified A2A state is retained as indeterminate and cannot enable redispatch', async (t) => {
  const { store } = await setup(t);
  const prepared = await approved(store);
  const claimed = await store.claimDispatch(
    'alice',
    prepared.delegation.id,
    1_100,
  );
  const unknown = await store.recordTaskReceipt(
    'alice',
    claimed.id,
    claimed.revision,
    {
      id: 'provider-task-unknown',
      state: 'TASK_STATE_UNSPECIFIED',
    },
    1_200,
  );
  assert.equal(unknown.state, 'indeterminate');
  assert.equal(unknown.remoteTaskId, 'provider-task-unknown');
  assert.equal(await store.claimDispatch('alice', unknown.id, 1_300), null);
});

void test('unsubmitted cancel closes locally, foreign/nonexistent parent and expired new dispatch are rejected', async (t) => {
  const { store } = await setup(t);
  const prepared = await store.prepare('alice', baseInput, 1_000);
  const locallyCanceled = await store.requestCancel(
    'alice',
    prepared.delegation.id,
    1_100,
  );
  assert.equal(locallyCanceled.state, 'cancelled_before_dispatch');
  assert.equal(locallyCanceled.remoteState, 'NOT_DISPATCHED');
  assert.equal(
    await store.claimDispatch('alice', prepared.delegation.id, 1_200),
    null,
  );

  assert.equal(
    (
      await store.prepare(
        'bob',
        { ...baseInput, idempotencyKey: 'bob-key', messageId: 'bob-message' },
        1_000,
      )
    ).delegation,
    null,
  );
  const expiredInput = {
    ...baseInput,
    id: '00000000-0000-4000-8000-000000000004',
    idempotencyKey: 'expired',
    messageId: 'expired-msg',
    deadlineAt: 1_000,
  };
  const expired = await store.prepare('alice', expiredInput, 500);
  await store.approve(
    'alice',
    expired.delegation.id,
    expiredInput.authorizationSha256,
    encryptedInput(expiredInput),
    900,
  );
  assert.equal(
    await store.claimDispatch('alice', expired.delegation.id, 1_000),
    null,
  );
  assert.equal(
    (await store.get('alice', expired.delegation.id)).state,
    'expired',
  );
});
