import assert from 'node:assert/strict';
import { applyD1Migrations, introspectWorkflowInstance } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, it } from 'vitest';
import { createA2AIntentDigests } from '../../../lib/a2a-authorization.ts';
import {
  a2aBrokerAuthorizationSigningBytes,
  A2A_BROKER_AUTHORIZATION_SCHEMA,
} from '../../../lib/a2a-broker-authorization.ts';
import { decryptA2AArtifact, encryptA2AInput } from '../../../lib/a2a-input-crypto.ts';

const targetOrigin = 'https://a2a.example.com';
const owner = 'vitest-owner';
const deviceRef = 'vitest-device';
const authorityId = 'vitest-authority';
const keyId = 'vitest-key';
const agentName = 'vitest-a2a-agent';
const message = 'Cloudflare Workers Vitest controlled A2A success fixture.';
const delegationId = '11111111-1111-4111-8111-111111111009';
const parentJobId = '22222222-2222-4222-8222-222222222009';
const messageId = '33333333-3333-4333-8333-333333333009';
const remoteTaskId = 'vitest-remote-task-1';
const inputKey = 'b'.repeat(64);

function sql(value) {
  if (typeof value === 'number') return String(value);
  if (value === null) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function base64Url(value) {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

async function signedBrokerProof(now, digests, deadlineAt, selected = {}) {
  const proof = {
    schema: A2A_BROKER_AUTHORIZATION_SCHEMA,
    authorityId,
    ownerUserId: owner,
    deviceRef,
    delegationId: selected.delegationId ?? delegationId,
    parentJobId: selected.parentJobId ?? parentJobId,
    messageId: selected.messageId ?? messageId,
    targetOrigin,
    targetAgentName: agentName,
    targetAgentVersion: '1.0.0',
    protocolVersion: '1.0',
    inputSha256: digests.inputSha256,
    budgetCurrency: 'USD',
    budgetLimitMinor: selected.budgetLimitMinor ?? 0,
    deadlineAt,
    authorizationSha256: digests.authorizationSha256,
    issuedAt: now,
    expiresAt: now + 300_000,
    keyId,
    signature: '',
  };
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(env.A2A_TEST_PRIVATE_KEY_PKCS8), (value) => value.charCodeAt(0)),
    { name: 'Ed25519' },
    false,
    ['sign'],
  );
  proof.signature = base64Url(
    await crypto.subtle.sign(
      { name: 'Ed25519' },
      privateKey,
      a2aBrokerAuthorizationSigningBytes(proof),
    ),
  );
  return proof;
}

async function seedApprovedDelegation(selected = {}) {
  const selectedDelegationId = selected.delegationId ?? delegationId;
  const selectedParentJobId = selected.parentJobId ?? parentJobId;
  const selectedMessageId = selected.messageId ?? messageId;
  const selectedMessage = selected.message ?? message;
  const budgetLimitMinor = selected.budgetLimitMinor ?? 0;
  const parentBudgetLimitMinor = selected.parentBudgetLimitMinor ?? budgetLimitMinor;
  const now = Date.now();
  const deadlineAt = now + 600_000;
  const digests = await createA2AIntentDigests({
    ownerUserId: owner,
    id: selectedDelegationId,
    parentJobId: selectedParentJobId,
    messageId: selectedMessageId,
    targetOrigin,
    targetAgentName: agentName,
    targetAgentVersion: '1.0.0',
    protocolVersion: '1.0',
    budgetCurrency: 'USD',
    budgetLimitMinor,
    parentBudgetLimitMinor,
    deadlineAt,
    message: selectedMessage,
  });
  const encryptedInput = await encryptA2AInput(
    selectedMessage,
    inputKey,
    owner,
    selectedDelegationId,
    digests.inputSha256,
  );
  const proof = await signedBrokerProof(now, digests, deadlineAt, {
    delegationId: selectedDelegationId,
    parentJobId: selectedParentJobId,
    messageId: selectedMessageId,
    budgetLimitMinor,
    parentBudgetLimitMinor,
  });
  const statements = [
    `INSERT INTO agent_delegation_budget_pools (owner_user_id, parent_job_id, currency, budget_limit_minor, reserved_minor, settled_minor, revision, created_at, updated_at) VALUES (${[owner, selectedParentJobId, 'USD', parentBudgetLimitMinor, 0, 0, 0, now, now].map(sql).join(',')})`,
    `INSERT INTO agent_delegations (id, owner_user_id, parent_job_id, idempotency_key, message_id, target_origin, target_agent_name, target_agent_version, protocol_version, input_sha256, authorization_sha256, budget_currency, budget_limit_minor, parent_budget_limit_minor, deadline_at, state, revision, created_at, updated_at) VALUES (${[selectedDelegationId, owner, selectedParentJobId, `vitest-positive-${selectedMessageId}`, selectedMessageId, targetOrigin, agentName, '1.0.0', '1.0', digests.inputSha256, digests.authorizationSha256, 'USD', budgetLimitMinor, parentBudgetLimitMinor, deadlineAt, 'prepared', 0, now, now].map(sql).join(',')})`,
    `INSERT INTO agent_delegation_budget_reservations (delegation_id, owner_user_id, parent_job_id, currency, reserved_minor, settled_minor, state, created_at, updated_at) VALUES (${[selectedDelegationId, owner, selectedParentJobId, 'USD', budgetLimitMinor, null, 'held', now, now].map(sql).join(',')})`,
    `INSERT INTO agent_delegation_inputs (delegation_id, owner_user_id, payload_ciphertext, nonce, input_sha256, key_version, expires_at, created_at) VALUES (${[selectedDelegationId, owner, encryptedInput.ciphertext, encryptedInput.nonce, encryptedInput.inputSha256, encryptedInput.keyVersion, deadlineAt, now].map(sql).join(',')})`,
    `INSERT INTO agent_delegation_broker_authorizations (delegation_id, owner_user_id, device_ref, authority_id, key_id, proof_json, expires_at, created_at) VALUES (${[selectedDelegationId, owner, deviceRef, authorityId, keyId, JSON.stringify(proof), proof.expiresAt, now].map(sql).join(',')})`,
  ];
  for (const statement of statements) await env.DB.prepare(statement).run();
}

beforeEach(async () => {
  await applyD1Migrations(env.DB, JSON.parse(env.A2A_TEST_MIGRATIONS_JSON));
});

it('discovers, authorizes, sends once, and persists an encrypted completed result', async () => {
  await seedApprovedDelegation();

  const instanceId = `a2a-positive-${crypto.randomUUID()}`;
  const workflow = await introspectWorkflowInstance(env.A2A_DELEGATION_WORKFLOW, instanceId);
  try {
    await workflow.modify(async (modifier) => {
      await modifier.disableRetryDelays([{ name: 'discover-approved-agent' }]);
    });
    await env.A2A_DELEGATION_WORKFLOW.create({
      id: instanceId,
      params: { ownerUserId: owner, delegationId, operation: 'dispatch' },
    });
    await workflow.waitForStatus('complete');

    const delegation = await env.DB.prepare(`SELECT state, remote_state AS remoteState,
      remote_task_id AS remoteTaskId, artifacts_captured AS artifactsCaptured
      FROM agent_delegations WHERE id = ? AND owner_user_id = ?`)
      .bind(delegationId, owner).first();
    const events = await env.DB.prepare(`SELECT event_type AS eventType
      FROM agent_delegation_events WHERE delegation_id = ? AND owner_user_id = ?
      ORDER BY revision`).bind(delegationId, owner).all();
    const artifacts = await env.DB.prepare(`SELECT payload_ciphertext AS ciphertext, nonce,
      artifact_sha256 AS artifactSha256, key_version AS keyVersion,
      remote_task_id AS remoteTaskId FROM agent_delegation_artifacts
      WHERE delegation_id = ? AND owner_user_id = ?`).bind(delegationId, owner).all();

    assert.equal(delegation.state, 'remote_completed');
    assert.equal(delegation.remoteState, 'TASK_STATE_COMPLETED');
    assert.equal(delegation.remoteTaskId, remoteTaskId);
    assert.equal(delegation.artifactsCaptured, 1);
    assert.deepEqual(events.results.map((event) => event.eventType).filter((event) => event === 'remote_send_claimed'), ['remote_send_claimed']);
    assert.equal(events.results.some((event) => event.eventType === 'remote_task_received'), true);
    assert.equal(artifacts.results.length, 1);
    assert.deepEqual(
      JSON.parse(await decryptA2AArtifact(artifacts.results[0], inputKey, owner, delegationId, remoteTaskId)),
      {
        schemaVersion: 1,
        artifacts: [{ name: 'result.txt', textParts: ['Controlled Cloudflare Workflow result.'] }],
        omittedNonTextParts: 0,
        truncated: false,
      },
    );

    // A durable Workflow restart must observe the terminal D1 state and must
    // not rediscover or resubmit the already-completed external task.
    const durableInstance = await env.A2A_DELEGATION_WORKFLOW.get(instanceId);
    await durableInstance.restart();
    await workflow.waitForStatus('complete');
    assert.deepEqual(await workflow.getOutput(), { outcome: 'not_dispatchable' });
    const claimsAfterRestart = await env.DB.prepare(`SELECT COUNT(*) AS count
      FROM agent_delegation_events WHERE delegation_id = ? AND owner_user_id = ?
        AND event_type = 'remote_send_claimed'`)
      .bind(delegationId, owner).first();
    assert.equal(claimsAfterRestart.count, 1);
  } finally {
    await workflow.dispose();
  }
}, 30_000);

it('holds an ambiguous remote send and does not replay it after Workflow restart', async () => {
  const uncertainDelegationId = '11111111-1111-4111-8111-111111111010';
  const uncertainParentJobId = '22222222-2222-4222-8222-222222222010';
  const uncertainMessageId = '33333333-3333-4333-8333-333333333010';
  const uncertainMessage = 'Cloudflare A2A response-loss fixture.';
  await seedApprovedDelegation({
    delegationId: uncertainDelegationId,
    parentJobId: uncertainParentJobId,
    messageId: uncertainMessageId,
    message: uncertainMessage,
    budgetLimitMinor: 25,
    parentBudgetLimitMinor: 25,
  });

  const instanceId = `a2a-uncertain-${crypto.randomUUID()}`;
  const workflow = await introspectWorkflowInstance(env.A2A_DELEGATION_WORKFLOW, instanceId);
  try {
    await workflow.modify(async (modifier) => {
      await modifier.disableRetryDelays([{ name: 'discover-approved-agent' }]);
    });
    await env.A2A_DELEGATION_WORKFLOW.create({
      id: instanceId,
      params: { ownerUserId: owner, delegationId: uncertainDelegationId, operation: 'dispatch' },
    });
    await workflow.waitForStatus('errored');

    let delegation = await env.DB.prepare(`SELECT state FROM agent_delegations
      WHERE id = ? AND owner_user_id = ?`).bind(uncertainDelegationId, owner).first();
    assert.equal(delegation.state, 'indeterminate');
    let reservation = await env.DB.prepare(`SELECT reserved_minor AS reservedMinor,
      settled_minor AS settledMinor, state FROM agent_delegation_budget_reservations
      WHERE delegation_id = ? AND owner_user_id = ?`)
      .bind(uncertainDelegationId, owner).first();
    assert.equal(reservation.reservedMinor, 25);
    assert.equal(reservation.settledMinor, null);
    assert.equal(reservation.state, 'held');
    let claims = await env.DB.prepare(`SELECT COUNT(*) AS count FROM agent_delegation_events
      WHERE delegation_id = ? AND owner_user_id = ? AND event_type = 'remote_send_claimed'`)
      .bind(uncertainDelegationId, owner).first();
    assert.equal(claims.count, 1);

    const durableInstance = await env.A2A_DELEGATION_WORKFLOW.get(instanceId);
    await durableInstance.restart();
    await workflow.waitForStatus('complete');
    assert.deepEqual(await workflow.getOutput(), { outcome: 'not_dispatchable' });
    delegation = await env.DB.prepare(`SELECT state FROM agent_delegations
      WHERE id = ? AND owner_user_id = ?`).bind(uncertainDelegationId, owner).first();
    claims = await env.DB.prepare(`SELECT COUNT(*) AS count FROM agent_delegation_events
      WHERE delegation_id = ? AND owner_user_id = ? AND event_type = 'remote_send_claimed'`)
      .bind(uncertainDelegationId, owner).first();
    assert.equal(delegation.state, 'indeterminate');
    assert.equal(claims.count, 1);
    reservation = await env.DB.prepare(`SELECT reserved_minor AS reservedMinor,
      settled_minor AS settledMinor, state FROM agent_delegation_budget_reservations
      WHERE delegation_id = ? AND owner_user_id = ?`)
      .bind(uncertainDelegationId, owner).first();
    assert.equal(reservation.reservedMinor, 25);
    assert.equal(reservation.settledMinor, null);
    assert.equal(reservation.state, 'held');
  } finally {
    await workflow.dispose();
  }
}, 30_000);
