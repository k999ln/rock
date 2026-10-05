import assert from 'node:assert/strict';
import { applyD1Migrations, introspectWorkflowInstance } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, it } from 'vitest';
import { createA2AIntentDigests } from '../../../lib/a2a-authorization.ts';
import { a2aPriceQuoteDigest, a2aPriceQuoteSigningBytes, A2A_PRICE_QUOTE_SCHEMA } from '../../../lib/a2a-price-quote.ts';
import { SKY_PACKAGE_RUNTIME_BINDING_SCHEMA, skyPackageRuntimeBindingDigest, skyPackageRuntimeBindingSigningBytes } from '../../../lib/sky-package-runtime-binding.ts';
import { a2aDelegationStore } from '../../../lib/a2a-delegation-store.ts';
import { a2aLiveUsageSigningBytes } from '../../../lib/a2a-live-usage.ts';
import {
  a2aBrokerAuthorizationSigningBytes,
  A2A_BROKER_AUTHORIZATION_SCHEMA,
} from '../../../lib/a2a-broker-authorization.ts';
import { decryptA2AArtifact, encryptA2AInput } from '../../../lib/a2a-input-crypto.ts';
import { buildA2AResultHandoffPrompt } from '../../../lib/a2a-result-handoff.ts';

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

async function createHashHex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64Url(value) {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

async function signedBrokerProof(now, digests, deadlineAt, selected = {}) {
  const selectedOrigin = selected.targetOrigin ?? targetOrigin;
  const selectedAgentName = selected.agentName ?? agentName;
  const selectedAgentVersion = selected.agentVersion ?? '1.0.0';
  const proof = {
    schema: A2A_BROKER_AUTHORIZATION_SCHEMA,
    authorityId,
    ownerUserId: owner,
    deviceRef,
    delegationId: selected.delegationId ?? delegationId,
    parentJobId: selected.parentJobId ?? parentJobId,
    messageId: selected.messageId ?? messageId,
    targetOrigin: selectedOrigin,
    targetAgentName: selectedAgentName,
    targetAgentVersion: selectedAgentVersion,
    protocolVersion: '1.0',
    inputSha256: digests.inputSha256,
    budgetCurrency: 'USD',
    budgetLimitMinor: selected.budgetLimitMinor ?? 0,
    continueWhileDeviceOffline: selected.continueWhileDeviceOffline ?? true,
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

async function seedPackageRuntimeBinding() {
  const now = Date.now();
  const manifest = JSON.parse(env.A2A_TEST_PACKAGE_MANIFEST_JSON);
  const binding = {
    schema: SKY_PACKAGE_RUNTIME_BINDING_SCHEMA,
    providerId: 'vitest-provider',
    keyId: 'vitest-package-key',
    bindingId: `vitest-package-binding-${crypto.randomUUID()}`,
    agentOrigin: targetOrigin,
    agentName,
    agentVersion: '1.0.0',
    agentCardSha256: env.A2A_TEST_AGENT_CARD_SHA256,
    packageKey: manifest.id + '@' + manifest.version,
    manifestSha256: env.A2A_TEST_PACKAGE_MANIFEST_SHA256,
    operationId: 'run-package',
    runtime: 'a2a-jsonrpc-1.0',
    runtimeExtensionUri: env.SKY_PACKAGE_RUNTIME_EXTENSION_URI,
    inputSchemaSha256: env.A2A_TEST_PACKAGE_INPUT_SCHEMA_SHA256,
    outputSchemaSha256: env.A2A_TEST_PACKAGE_OUTPUT_SCHEMA_SHA256,
    pricingVersion: 'vitest-rates-1',
    requiredUsage: [{ meter: 'task', unit: 'request' }],
    issuedAt: now - 1_000,
    expiresAt: now + 300_000,
    signature: '',
  };
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(env.A2A_TEST_PACKAGE_BINDING_PRIVATE_KEY_PKCS8), (value) => value.charCodeAt(0)),
    { name: 'Ed25519' }, false, ['sign'],
  );
  binding.signature = base64Url(await crypto.subtle.sign(
    { name: 'Ed25519' }, privateKey, skyPackageRuntimeBindingSigningBytes(binding),
  ));
  const digest = await skyPackageRuntimeBindingDigest(binding);
  const packageKey = binding.packageKey;
  const toolId = manifest.id;
  const version = manifest.version;
  const manifestJson = JSON.stringify(manifest);
  const cardJson = JSON.stringify({
    name: agentName,
    description: 'Controlled independent A2A fixture agent.',
    version: '1.0.0',
    supportedInterfaces: [{ url: `${targetOrigin}/rpc`, protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
    capabilities: { extensions: [{ uri: env.SKY_PACKAGE_RUNTIME_EXTENSION_URI, required: true }] },
  });
  await env.DB.prepare(`INSERT INTO sky_a2a_agent_connections
    (id, owner_user_id, origin, card_url, agent_name, agent_version, card_sha256, card_json, discovered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_user_id, origin, agent_name) DO UPDATE SET
      id = excluded.id, card_url = excluded.card_url, agent_version = excluded.agent_version,
      card_sha256 = excluded.card_sha256, card_json = excluded.card_json,
      discovered_at = excluded.discovered_at`)
    .bind(crypto.randomUUID(), owner, targetOrigin, `${targetOrigin}/.well-known/agent-card.json`,
      agentName, '1.0.0', env.A2A_TEST_AGENT_CARD_SHA256, cardJson, now).run();
  await env.DB.prepare(`INSERT INTO sky_tool_packages
    (package_key, tool_id, version, user_id, manifest, manifest_sha256, status, created_at, updated_at, published_at)
    VALUES (?, ?, ?, ?, ?, ?, 'verified', ?, ?, ?)
    ON CONFLICT(tool_id, version) DO UPDATE SET package_key = excluded.package_key,
      user_id = excluded.user_id, manifest = excluded.manifest,
      manifest_sha256 = excluded.manifest_sha256, status = excluded.status,
      updated_at = excluded.updated_at, published_at = excluded.published_at`)
    .bind(packageKey, toolId, version, owner, manifestJson, env.A2A_TEST_PACKAGE_MANIFEST_SHA256,
      now, now, now).run();
  await env.DB.prepare(`INSERT INTO sky_tool_package_reviews
    (id, package_key, manifest_sha256, reviewer_id, decision, source_revision, source_sha256,
     checks_json, evidence_json, notes, reviewed_at, expires_at)
    VALUES (?, ?, ?, ?, 'verified', NULL, NULL, '{}', '{}', 'local fixture', ?, NULL)`)
    .bind(crypto.randomUUID(), packageKey, env.A2A_TEST_PACKAGE_MANIFEST_SHA256, 'vitest-reviewer', now).run();
  await env.DB.prepare(`INSERT INTO sky_package_runtime_bindings
    (binding_id, provider_id, key_id, agent_origin, package_key, manifest_sha256,
     digest, binding_json, status, created_at, created_by, revoked_at, revoked_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL, NULL)`)
    .bind(binding.bindingId, binding.providerId, binding.keyId, binding.agentOrigin, packageKey,
      binding.manifestSha256, digest, JSON.stringify(binding), now, 'vitest-operator').run();
  return { bindingId: binding.bindingId, bindingDigest: digest };
}

async function seedApprovedDelegation(selected = {}) {
  const selectedDelegationId = selected.delegationId ?? delegationId;
  const selectedParentJobId = selected.parentJobId ?? parentJobId;
  const selectedMessageId = selected.messageId ?? messageId;
  const selectedMessage = selected.message ?? message;
  const selectedOrigin = selected.targetOrigin ?? targetOrigin;
  const selectedAgentName = selected.agentName ?? agentName;
  const selectedAgentVersion = selected.agentVersion ?? '1.0.0';
  const budgetLimitMinor = selected.budgetLimitMinor ?? 0;
  const parentBudgetLimitMinor = selected.parentBudgetLimitMinor ?? budgetLimitMinor;
  const continueWhileDeviceOffline = selected.continueWhileDeviceOffline ?? true;
  const now = Date.now();
  const deadlineAt = now + 600_000;
  const quoteIntent = {
    ownerUserId: owner,
    id: selectedDelegationId,
    parentJobId: selectedParentJobId,
    messageId: selectedMessageId,
    targetOrigin: selectedOrigin,
    targetAgentName: selectedAgentName,
    targetAgentVersion: selectedAgentVersion,
    protocolVersion: '1.0',
    budgetCurrency: 'USD',
    budgetLimitMinor,
    parentBudgetLimitMinor,
    continueWhileDeviceOffline,
    deadlineAt,
    message: selectedMessage,
    packageRuntimeBindingDigest: selected.packageRuntimeBindingDigest || undefined,
  };
  const baseDigests = await createA2AIntentDigests(quoteIntent);
  let priceQuoteDigest = selected.priceQuoteDigest ?? '';
  let priceQuote = selected.priceQuote ?? null;
  if (selected.priceQuoteDigest === undefined && selected.omitPriceQuote !== true) {
    const amountMinor = Math.min(37, budgetLimitMinor);
    priceQuote = {
      schema: A2A_PRICE_QUOTE_SCHEMA,
      providerId: 'vitest-provider',
      keyId: 'vitest-usage-key',
      quoteId: `quote-${crypto.randomUUID()}`,
      agentOrigin: selectedOrigin,
      agentName: selectedAgentName,
      agentVersion: selectedAgentVersion,
      requestSha256: baseDigests.inputSha256,
      pricingVersion: 'vitest-rates-1',
      pricingSha256: 'c'.repeat(64),
      currency: 'USD',
      estimateMinor: amountMinor,
      maxAmountMinor: budgetLimitMinor,
      issuedAt: now,
      expiresAt: now + 5 * 60_000,
      usage: [{ meter: 'task', quantity: 1, unit: 'request', unitPriceMinor: amountMinor, amountMinor }],
      signature: '',
    };
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      Uint8Array.from(atob(env.A2A_TEST_USAGE_PRIVATE_KEY_PKCS8), (value) => value.charCodeAt(0)),
      { name: 'Ed25519' }, false, ['sign'],
    );
    priceQuote.signature = base64Url(await crypto.subtle.sign(
      { name: 'Ed25519' }, privateKey, a2aPriceQuoteSigningBytes(priceQuote),
    ));
    priceQuoteDigest = await a2aPriceQuoteDigest(priceQuote);
  }
  const digests = priceQuoteDigest
    ? await createA2AIntentDigests({ ...quoteIntent, priceQuoteDigest })
    : baseDigests;
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
    targetOrigin: selectedOrigin,
    agentName: selectedAgentName,
    agentVersion: selectedAgentVersion,
    budgetLimitMinor,
    parentBudgetLimitMinor,
    continueWhileDeviceOffline,
  });
  const statements = [
    ...(selected.createParentPool === false ? [] : [
      `INSERT INTO agent_delegation_budget_pools (owner_user_id, parent_job_id, currency, budget_limit_minor, reserved_minor, settled_minor, revision, created_at, updated_at) VALUES (${[owner, selectedParentJobId, 'USD', parentBudgetLimitMinor, 0, 0, 0, now, now].map(sql).join(',')})`,
    ]),
    `INSERT INTO rockstar_service_entitlements (issuer_id, claim_id, owner_user_id, offer_id, purchase_reference_sha256, claim_code_sha256, form_factor, scopes_json, issuer_key_id, claim_signature, status, claimed_at, expires_at, revoked_at) VALUES (${['vitest-issuer', `claim-${selectedMessageId}`, owner, 'vitest-agent-access', 'a'.repeat(64), `b${selectedMessageId.replaceAll('-', '')}`.slice(0, 64).padEnd(64, 'b'), 'esim', '["agents"]', 'vitest-key', 'fixture-signature', 'active', now, null, null].map(sql).join(',')})`,
    `INSERT INTO agent_delegations (id, owner_user_id, parent_job_id, idempotency_key, message_id, target_origin, target_agent_name, target_agent_version, protocol_version, input_sha256, authorization_sha256, price_quote_digest, price_quote_json, package_runtime_binding_id, package_runtime_binding_digest, budget_currency, budget_limit_minor, parent_budget_limit_minor, continue_while_device_offline, deadline_at, state, revision, created_at, updated_at) VALUES (${[selectedDelegationId, owner, selectedParentJobId, `vitest-positive-${selectedMessageId}`, selectedMessageId, selectedOrigin, selectedAgentName, selectedAgentVersion, '1.0', digests.inputSha256, digests.authorizationSha256, priceQuoteDigest, priceQuote ? JSON.stringify(priceQuote) : null, selected.packageRuntimeBindingId ?? '', selected.packageRuntimeBindingDigest ?? '', 'USD', budgetLimitMinor, parentBudgetLimitMinor, continueWhileDeviceOffline ? 1 : 0, deadlineAt, 'prepared', 0, now, now].map(sql).join(',')})`,
    `INSERT INTO agent_delegation_budget_reservations (delegation_id, owner_user_id, parent_job_id, currency, reserved_minor, settled_minor, state, created_at, updated_at) VALUES (${[selectedDelegationId, owner, selectedParentJobId, 'USD', budgetLimitMinor, null, 'held', now, now].map(sql).join(',')})`,
    `INSERT INTO agent_delegation_inputs (delegation_id, owner_user_id, payload_ciphertext, nonce, input_sha256, key_version, expires_at, created_at) VALUES (${[selectedDelegationId, owner, encryptedInput.ciphertext, encryptedInput.nonce, encryptedInput.inputSha256, encryptedInput.keyVersion, deadlineAt, now].map(sql).join(',')})`,
    `INSERT INTO agent_delegation_broker_authorizations (delegation_id, owner_user_id, device_ref, authority_id, key_id, proof_json, expires_at, created_at) VALUES (${[selectedDelegationId, owner, deviceRef, authorityId, keyId, JSON.stringify(proof), proof.expiresAt, now].map(sql).join(',')})`,
  ];
  for (const statement of statements) await env.DB.prepare(statement).run();
}

beforeEach(async () => {
  await applyD1Migrations(env.DB, JSON.parse(env.A2A_TEST_MIGRATIONS_JSON));
});

it('does not dispatch a prepared delegation after its service entitlement is revoked', async () => {
  const testDelegationId = crypto.randomUUID();
  const testParentJobId = crypto.randomUUID();
  const testMessageId = crypto.randomUUID();
  await seedApprovedDelegation({
    delegationId: testDelegationId, parentJobId: testParentJobId, messageId: testMessageId,
    budgetLimitMinor: 100, parentBudgetLimitMinor: 200,
  });
  await env.DB.prepare(`UPDATE rockstar_service_entitlements SET status = 'refunded', revoked_at = ?
    WHERE owner_user_id = ? AND claim_id = ?`).bind(Date.now(), owner, `claim-${testMessageId}`).run();
  const instanceId = `a2a-entitlement-${crypto.randomUUID()}`;
  const workflow = await introspectWorkflowInstance(env.A2A_DELEGATION_WORKFLOW, instanceId);
  try {
    await env.A2A_DELEGATION_WORKFLOW.create({
      id: instanceId,
      params: { ownerUserId: owner, delegationId: testDelegationId, operation: 'dispatch' },
    });
    await workflow.waitForStatus('complete');
    const delegation = await env.DB.prepare(`SELECT state, remote_task_id AS remoteTaskId FROM agent_delegations WHERE id = ?`)
      .bind(testDelegationId).first();
    assert.equal(delegation.state, 'prepared');
    assert.equal(delegation.remoteTaskId, null);
  } finally {
    await workflow.dispose();
  }
});

it('rejects a prepared delegation with a tampered signed price quote before Agent discovery', async () => {
  const testDelegationId = crypto.randomUUID();
  const testParentJobId = crypto.randomUUID();
  const testMessageId = crypto.randomUUID();
  await seedApprovedDelegation({
    delegationId: testDelegationId, parentJobId: testParentJobId, messageId: testMessageId,
    budgetLimitMinor: 100, parentBudgetLimitMinor: 200, priceQuoteDigest: 'd'.repeat(64),
    priceQuote: {
      schema: 'rock-a2a-provider-price-quote/1', providerId: 'vitest-provider', keyId: 'vitest-usage-key',
      quoteId: 'tampered-quote', agentOrigin: targetOrigin, agentName, agentVersion: '1.0.0',
      requestSha256: 'a'.repeat(64), pricingVersion: 'rates-1', pricingSha256: 'b'.repeat(64),
      currency: 'USD', estimateMinor: 50, maxAmountMinor: 100, issuedAt: Date.now(),
      expiresAt: Date.now() + 60_000, usage: [{ meter: 'task', quantity: 1, unit: 'request', unitPriceMinor: 50, amountMinor: 50 }],
      signature: 'invalid',
    },
  });
  const instanceId = `a2a-price-quote-${crypto.randomUUID()}`;
  const workflow = await introspectWorkflowInstance(env.A2A_DELEGATION_WORKFLOW, instanceId);
  try {
    await env.A2A_DELEGATION_WORKFLOW.create({
      id: instanceId,
      params: { ownerUserId: owner, delegationId: testDelegationId, operation: 'dispatch' },
    });
    await workflow.waitForStatus('complete');
    assert.deepEqual(await workflow.getOutput(), { outcome: 'broker_authorization_rejected_before_egress' });
    const delegation = await env.DB.prepare(`SELECT state, remote_task_id AS remoteTaskId FROM agent_delegations WHERE id = ?`)
      .bind(testDelegationId).first();
    assert.equal(delegation.remoteTaskId, null);
    const sendClaims = await env.DB.prepare(`SELECT COUNT(*) AS count FROM agent_delegation_events
      WHERE delegation_id = ? AND event_type = 'remote_send_claimed'`).bind(testDelegationId).first();
    assert.equal(sendClaims.count, 0);
  } finally {
    await workflow.dispose();
  }
});

it('does not discover or send a Package delegation after its signed runtime binding is revoked', async () => {
  const binding = await seedPackageRuntimeBinding();
  const testDelegationId = crypto.randomUUID();
  const testParentJobId = crypto.randomUUID();
  const testMessageId = crypto.randomUUID();
  await seedApprovedDelegation({
    delegationId: testDelegationId,
    parentJobId: testParentJobId,
    messageId: testMessageId,
    budgetLimitMinor: 100,
    parentBudgetLimitMinor: 200,
    packageRuntimeBindingId: binding.bindingId,
    packageRuntimeBindingDigest: binding.bindingDigest,
  });
  await env.DB.prepare(`UPDATE sky_package_runtime_bindings
    SET status = 'revoked', revoked_at = ?, revoked_by = 'vitest-revocation'
    WHERE binding_id = ? AND status = 'active'`).bind(Date.now(), binding.bindingId).run();
  const instanceId = `a2a-package-binding-revoked-${crypto.randomUUID()}`;
  const workflow = await introspectWorkflowInstance(env.A2A_DELEGATION_WORKFLOW, instanceId);
  try {
    await env.A2A_DELEGATION_WORKFLOW.create({
      id: instanceId,
      params: { ownerUserId: owner, delegationId: testDelegationId, operation: 'dispatch' },
    });
    await workflow.waitForStatus('complete');
    assert.deepEqual(await workflow.getOutput(), { outcome: 'broker_authorization_rejected_before_egress' });
    const delegation = await env.DB.prepare(`SELECT remote_task_id AS remoteTaskId FROM agent_delegations WHERE id = ?`)
      .bind(testDelegationId).first();
    assert.equal(delegation.remoteTaskId, null);
    const claims = await env.DB.prepare(`SELECT COUNT(*) AS count FROM agent_delegation_events
      WHERE delegation_id = ? AND event_type = 'remote_send_claimed'`).bind(testDelegationId).first();
    assert.equal(claims.count, 0);
  } finally {
    await workflow.dispose();
  }
});

it('keeps legacy prepared work without a quote queued and does not dispatch it', async () => {
  const testDelegationId = crypto.randomUUID();
  const testParentJobId = crypto.randomUUID();
  const testMessageId = crypto.randomUUID();
  await seedApprovedDelegation({
    delegationId: testDelegationId, parentJobId: testParentJobId, messageId: testMessageId,
    budgetLimitMinor: 100, parentBudgetLimitMinor: 200, omitPriceQuote: true,
  });
  const instanceId = `a2a-price-quote-missing-${crypto.randomUUID()}`;
  const workflow = await introspectWorkflowInstance(env.A2A_DELEGATION_WORKFLOW, instanceId);
  try {
    await env.A2A_DELEGATION_WORKFLOW.create({
      id: instanceId,
      params: { ownerUserId: owner, delegationId: testDelegationId, operation: 'dispatch' },
    });
    await workflow.waitForStatus('complete');
    assert.deepEqual(await workflow.getOutput(), { outcome: 'price_quote_required' });
    const delegation = await env.DB.prepare(`SELECT state, remote_task_id AS remoteTaskId FROM agent_delegations WHERE id = ?`)
      .bind(testDelegationId).first();
    assert.equal(delegation.state, 'prepared');
    assert.equal(delegation.remoteTaskId, null);
  } finally {
    await workflow.dispose();
  }
});

it('discovers, authorizes, sends once, settles a signed usage receipt, and persists an encrypted completed result', async () => {
  await seedApprovedDelegation({ budgetLimitMinor: 100, parentBudgetLimitMinor: 200 });

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
    assert.deepEqual(await workflow.getOutput(), {
      outcome: 'task_received',
      state: 'remote_completed',
      usageOutcome: 'settled',
    });
    const reservation = await env.DB.prepare(`SELECT reserved_minor AS reservedMinor,
      settled_minor AS settledMinor, state FROM agent_delegation_budget_reservations
      WHERE delegation_id = ? AND owner_user_id = ?`).bind(delegationId, owner).first();
    assert.deepEqual(reservation, { reservedMinor: 100, settledMinor: 37, state: 'settled' });
    const parentPool = await env.DB.prepare(`SELECT reserved_minor AS reservedMinor,
      settled_minor AS settledMinor FROM agent_delegation_budget_pools
      WHERE owner_user_id = ? AND parent_job_id = ?`)
      .bind(owner, parentJobId).first();
    assert.deepEqual(parentPool, { reservedMinor: 0, settledMinor: 37 });
    const receiptRow = await env.DB.prepare(`SELECT provider_id AS providerId,
      provider_reference AS providerReference, currency, amount_minor AS amountMinor
      FROM a2a_usage_receipts WHERE delegation_id = ? AND owner_user_id = ?`)
      .bind(delegationId, owner).first();
    assert.deepEqual(receiptRow, {
      providerId: 'vitest-provider',
      providerReference: 'vitest-usage-receipt-1',
      currency: 'USD',
      amountMinor: 37,
    });

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

it('hands an encrypted result between two distinct Agents under one durable parent budget', async () => {
  const parentId = '22222222-2222-4222-8222-222222222016';
  const firstId = '11111111-1111-4111-8111-111111111016';
  const secondId = '11111111-1111-4111-8111-111111111017';
  const firstMessageId = '33333333-3333-4333-8333-333333333016';
  const secondMessageId = '33333333-3333-4333-8333-333333333017';
  const firstWorkflowId = 'a2a-two-agent-first';
  const secondWorkflowId = 'a2a-two-agent-second';
  const parentCap = 100;
  const childCap = 60;

  await seedApprovedDelegation({
    delegationId: firstId,
    parentJobId: parentId,
    messageId: firstMessageId,
    message: 'Research the approved question and return evidence.',
    budgetLimitMinor: childCap,
    parentBudgetLimitMinor: parentCap,
  });
  const first = await introspectWorkflowInstance(env.A2A_DELEGATION_WORKFLOW, firstWorkflowId);
  let second;
  try {
    await first.modify(async (modifier) => {
      await modifier.disableRetryDelays([{ name: 'discover-approved-agent' }]);
    });
    await env.A2A_DELEGATION_WORKFLOW.create({
      id: firstWorkflowId,
      params: { ownerUserId: owner, delegationId: firstId, operation: 'dispatch' },
    });
    await first.waitForStatus('complete');
    assert.deepEqual(await first.getOutput(), {
      outcome: 'task_received', state: 'remote_completed', usageOutcome: 'settled',
    });

    const firstRow = await a2aDelegationStore(env.DB).get(owner, firstId);
    assert.equal(firstRow?.targetOrigin, targetOrigin);
    assert.equal(firstRow?.targetAgentName, agentName);
    assert.equal(firstRow?.remoteTaskId, 'vitest-first-agent-task-1');
    assert.equal(firstRow?.artifactsCaptured, 1);
    const firstArtifactRow = await env.DB.prepare(`SELECT payload_ciphertext AS ciphertext, nonce,
      artifact_sha256 AS artifactSha256, key_version AS keyVersion, remote_task_id AS remoteTaskId
      FROM agent_delegation_artifacts WHERE delegation_id = ? AND owner_user_id = ?`)
      .bind(firstId, owner).first();
    const firstArtifact = JSON.parse(await decryptA2AArtifact(
      firstArtifactRow, inputKey, owner, firstId, 'vitest-first-agent-task-1',
    ));
    assert.deepEqual(firstArtifact, {
      schemaVersion: 1,
      artifacts: [{ name: 'research.txt', textParts: ['First Agent collected a controlled research result.'] }],
      omittedNonTextParts: 0,
      truncated: false,
    });
    const firstUsage = await a2aDelegationStore(env.DB).getUsageReceipt(owner, firstId);
    assert.equal(firstUsage?.amountMinor, 31);

    let parentPool = await a2aDelegationStore(env.DB).getBudget(owner, parentId);
    assert.equal(parentPool?.budgetLimitMinor, parentCap);
    assert.equal(parentPool?.reservedMinor, 0);
    assert.equal(parentPool?.settledMinor, 31);

    const firstDurable = await env.A2A_DELEGATION_WORKFLOW.get(firstWorkflowId);
    await firstDurable.restart();
    await first.waitForStatus('complete');
    assert.deepEqual(await first.getOutput(), { outcome: 'not_dispatchable' });
    const firstSendClaims = await env.DB.prepare(`SELECT COUNT(*) AS count
      FROM agent_delegation_events WHERE delegation_id = ? AND owner_user_id = ?
        AND event_type = 'remote_send_claimed'`).bind(firstId, owner).first();
    assert.equal(firstSendClaims.count, 1);

    const secondPrompt = buildA2AResultHandoffPrompt({
      sourceAgentName: agentName,
      sourceAgentVersion: '1.0.0',
      artifacts: firstArtifact.artifacts,
      omittedNonTextParts: firstArtifact.omittedNonTextParts,
      truncated: firstArtifact.truncated,
    });
    await seedApprovedDelegation({
      delegationId: secondId,
      parentJobId: parentId,
      messageId: secondMessageId,
      message: secondPrompt,
      targetOrigin: 'https://python.a2a.example.com',
      agentName: 'vitest-python-review-agent',
      agentVersion: '2.0.0',
      budgetLimitMinor: childCap,
      parentBudgetLimitMinor: parentCap,
      createParentPool: false,
    });
    parentPool = await a2aDelegationStore(env.DB).getBudget(owner, parentId);
    assert.equal(parentPool?.reservedMinor, childCap);
    assert.equal(parentPool?.settledMinor, 31);
    assert.ok(parentPool.reservedMinor + parentPool.settledMinor <= parentCap);

    second = await introspectWorkflowInstance(env.A2A_DELEGATION_WORKFLOW, secondWorkflowId);
    await second.modify(async (modifier) => {
      await modifier.disableRetryDelays([{ name: 'discover-approved-agent' }]);
    });
    await env.A2A_DELEGATION_WORKFLOW.create({
      id: secondWorkflowId,
      params: { ownerUserId: owner, delegationId: secondId, operation: 'dispatch' },
    });
    await second.waitForStatus('complete');
    assert.deepEqual(await second.getOutput(), {
      outcome: 'task_received', state: 'remote_completed', usageOutcome: 'settled',
    });

    const secondRow = await a2aDelegationStore(env.DB).get(owner, secondId);
    assert.equal(secondRow?.targetOrigin, 'https://python.a2a.example.com');
    assert.equal(secondRow?.targetAgentName, 'vitest-python-review-agent');
    assert.equal(secondRow?.targetAgentVersion, '2.0.0');
    assert.equal(secondRow?.remoteTaskId, 'vitest-second-agent-task-1');
    assert.equal(secondRow?.artifactsCaptured, 1);
    const secondUsage = await a2aDelegationStore(env.DB).getUsageReceipt(owner, secondId);
    assert.equal(secondUsage?.amountMinor, 29);

    parentPool = await a2aDelegationStore(env.DB).getBudget(owner, parentId);
    assert.equal(parentPool?.reservedMinor, 0);
    assert.equal(parentPool?.settledMinor, 60);
    assert.ok(parentPool.reservedMinor + parentPool.settledMinor <= parentCap);
    for (const id of [firstId, secondId]) {
      const sendClaims = await env.DB.prepare(`SELECT COUNT(*) AS count
        FROM agent_delegation_events WHERE delegation_id = ? AND owner_user_id = ?
          AND event_type = 'remote_send_claimed'`).bind(id, owner).first();
      assert.equal(sendClaims.count, 1);
    }

    const secondDurable = await env.A2A_DELEGATION_WORKFLOW.get(secondWorkflowId);
    await secondDurable.restart();
    await second.waitForStatus('complete');
    assert.deepEqual(await second.getOutput(), { outcome: 'not_dispatchable' });
    const sendsAfterRestart = await env.DB.prepare(`SELECT COUNT(*) AS count
      FROM agent_delegation_events WHERE owner_user_id = ? AND delegation_id IN (?, ?)
        AND event_type = 'remote_send_claimed'`).bind(owner, firstId, secondId).first();
    assert.equal(sendsAfterRestart.count, 2);
  } finally {
    await first.dispose();
    if (second) await second.dispose();
  }
}, 30_000);

it('executes a signed Package binding through the Provider-declared A2A extension and settles the result', async () => {
  const binding = await seedPackageRuntimeBinding();
  const testDelegationId = '11111111-1111-4111-8111-111111111015';
  const testParentJobId = '22222222-2222-4222-8222-222222222015';
  const testMessageId = '33333333-3333-4333-8333-333333333015';
  const text = 'Run the reviewed operation against the approved input.';
  await seedApprovedDelegation({
    delegationId: testDelegationId,
    parentJobId: testParentJobId,
    messageId: testMessageId,
    message: text,
    budgetLimitMinor: 100,
    parentBudgetLimitMinor: 200,
    packageRuntimeBindingId: binding.bindingId,
    packageRuntimeBindingDigest: binding.bindingDigest,
  });

  const instanceId = `a2a-package-execution-${crypto.randomUUID()}`;
  const workflow = await introspectWorkflowInstance(env.A2A_DELEGATION_WORKFLOW, instanceId);
  try {
    await workflow.modify(async (modifier) => {
      await modifier.disableRetryDelays([{ name: 'discover-approved-agent' }]);
    });
    await env.A2A_DELEGATION_WORKFLOW.create({
      id: instanceId,
      params: { ownerUserId: owner, delegationId: testDelegationId, operation: 'dispatch' },
    });
    await workflow.waitForStatus('complete');

    const delegation = await env.DB.prepare(`SELECT state, remote_state AS remoteState,
      remote_task_id AS remoteTaskId, artifacts_captured AS artifactsCaptured
      FROM agent_delegations WHERE id = ? AND owner_user_id = ?`)
      .bind(testDelegationId, owner).first();
    assert.deepEqual(delegation, {
      state: 'remote_completed', remoteState: 'TASK_STATE_COMPLETED',
      remoteTaskId: 'vitest-package-execution-task-1', artifactsCaptured: 1,
    });
    const artifact = await env.DB.prepare(`SELECT payload_ciphertext AS ciphertext, nonce,
      artifact_sha256 AS artifactSha256, key_version AS keyVersion,
      remote_task_id AS remoteTaskId FROM agent_delegation_artifacts
      WHERE delegation_id = ? AND owner_user_id = ?`).bind(testDelegationId, owner).first();
    const decrypted = JSON.parse(await decryptA2AArtifact(
      artifact, inputKey, owner, testDelegationId, 'vitest-package-execution-task-1',
    ));
    assert.equal(decrypted.artifacts[0].textParts[0],
      `Executed run-package using binding ${binding.bindingId} (${binding.bindingDigest}) with input ${await createHashHex(text)}`);
    assert.deepEqual(await env.DB.prepare(`SELECT state, settled_minor AS settledMinor
      FROM agent_delegation_budget_reservations WHERE delegation_id = ? AND owner_user_id = ?`)
      .bind(testDelegationId, owner).first(), { state: 'settled', settledMinor: 23 });
    assert.deepEqual(await env.DB.prepare(`SELECT provider_reference AS providerReference,
      amount_minor AS amountMinor FROM a2a_usage_receipts
      WHERE delegation_id = ? AND owner_user_id = ?`).bind(testDelegationId, owner).first(), {
      providerReference: 'vitest-package-execution-receipt-1', amountMinor: 23,
    });
    assert.deepEqual(await workflow.getOutput(), {
      outcome: 'task_received', state: 'remote_completed', usageOutcome: 'settled',
    });
  } finally {
    await workflow.dispose();
  }
}, 30_000);

it('reconciles a controlled A2A agent fixture from submitted through working to completed and settles only its signed final usage', async () => {
  const progressDelegationId = '11111111-1111-4111-8111-111111111012';
  const progressParentJobId = '22222222-2222-4222-8222-222222222012';
  const progressMessageId = '33333333-3333-4333-8333-333333333012';
  await seedApprovedDelegation({
    delegationId: progressDelegationId,
    parentJobId: progressParentJobId,
    messageId: progressMessageId,
    message: 'Independent A2A agent progress and completion fixture.',
    budgetLimitMinor: 100,
    parentBudgetLimitMinor: 200,
  });

  const runWorkflow = async (instanceId, operation) => {
    const workflow = await introspectWorkflowInstance(env.A2A_DELEGATION_WORKFLOW, instanceId);
    try {
      await workflow.modify(async (modifier) => {
        await modifier.disableRetryDelays([
          { name: operation === 'dispatch' ? 'discover-approved-agent' : 'discover-agent-for-reconciliation' },
        ]);
      });
      await env.A2A_DELEGATION_WORKFLOW.create({
        id: instanceId,
        params: { ownerUserId: owner, delegationId: progressDelegationId, operation },
      });
      await workflow.waitForStatus('complete');
      return await workflow.getOutput();
    } finally {
      await workflow.dispose();
    }
  };

  assert.deepEqual(
    await runWorkflow('a2a-progress-dispatch', 'dispatch'),
    { outcome: 'task_received', state: 'submitted', usageOutcome: 'missing' },
  );
  const submitted = await env.DB.prepare(`SELECT state, remote_state AS remoteState,
    remote_task_id AS remoteTaskId FROM agent_delegations WHERE id = ? AND owner_user_id = ?`)
    .bind(progressDelegationId, owner).first();
  assert.deepEqual(submitted, {
    state: 'submitted', remoteState: 'TASK_STATE_SUBMITTED', remoteTaskId: 'vitest-progress-task-1',
  });

  const liveUsageStore = a2aDelegationStore(env.DB);
  const liveUsageIssuedAt = Date.now();
  const liveUsage = {
    schema: 'rock-a2a-provider-live-usage/1', providerId: 'vitest-provider',
    keyId: 'vitest-usage-key', eventId: 'vitest-progress-meter-event-1', sequence: 1,
    ownerUserId: owner, parentJobId: progressParentJobId, delegationId: progressDelegationId,
    taskId: 'vitest-progress-task-1', agentOrigin: targetOrigin, agentName, agentVersion: '1.0.0',
    currency: 'USD', cumulativeAmountMinor: 21, pricingVersion: 'vitest-rates-1',
    issuedAt: liveUsageIssuedAt,
    usage: [{ meter: 'agent-operation', quantity: 1, unit: 'request', amountMinor: 21 }],
    signature: '',
  };
  const liveUsagePrivateKey = await crypto.subtle.importKey(
    'pkcs8', Uint8Array.from(atob(env.A2A_TEST_USAGE_PRIVATE_KEY_PKCS8), (value) => value.charCodeAt(0)),
    { name: 'Ed25519' }, false, ['sign'],
  );
  liveUsage.signature = base64Url(await crypto.subtle.sign(
    { name: 'Ed25519' }, liveUsagePrivateKey, a2aLiveUsageSigningBytes(liveUsage),
  ));
  const acceptedLiveUsage = await liveUsageStore.recordLiveUsageSnapshot(owner, progressDelegationId, liveUsage);
  assert.equal(acceptedLiveUsage.cumulativeAmountMinor, 21);
  assert.equal(acceptedLiveUsage.sequence, 1);
  await assert.rejects(liveUsageStore.recordLiveUsageSnapshot(owner, progressDelegationId, {
    ...liveUsage, eventId: 'vitest-progress-meter-event-2', sequence: 2, cumulativeAmountMinor: 20,
    issuedAt: liveUsageIssuedAt + 1,
  }));

  const workingInstanceId = 'a2a-progress-reconcile-working';
  const workingWorkflow = await introspectWorkflowInstance(env.A2A_DELEGATION_WORKFLOW, workingInstanceId);
  try {
    await workingWorkflow.modify(async (modifier) => {
      await modifier.disableRetryDelays([{ name: 'discover-agent-for-reconciliation' }]);
    });
    await env.A2A_DELEGATION_WORKFLOW.create({
      id: workingInstanceId,
      params: { ownerUserId: owner, delegationId: progressDelegationId, operation: 'reconcile' },
    });
    await workingWorkflow.waitForStatus('complete');
    assert.deepEqual(await workingWorkflow.getOutput(), {
      outcome: 'task_reconciled', state: 'working', usageOutcome: 'missing',
    });
    const heldWhileWorking = await env.DB.prepare(`SELECT reserved_minor AS reservedMinor,
      settled_minor AS settledMinor, state FROM agent_delegation_budget_reservations
      WHERE delegation_id = ? AND owner_user_id = ?`).bind(progressDelegationId, owner).first();
    assert.deepEqual(heldWhileWorking, { reservedMinor: 100, settledMinor: null, state: 'held' });
    const durableInstance = await env.A2A_DELEGATION_WORKFLOW.get(workingInstanceId);
    await durableInstance.restart();
    await workingWorkflow.waitForStatus('complete');
    assert.deepEqual(await workingWorkflow.getOutput(), {
      outcome: 'task_reconciled', state: 'remote_completed', usageOutcome: 'settled',
    });
  } finally {
    await workingWorkflow.dispose();
  }
  // Resume the same durable controller while the remote task is still
  // working. It must reconcile the persisted remote task ID instead of
  // claiming and sending a second task after a worker/controller restart.
  const completed = await env.DB.prepare(`SELECT state, remote_state AS remoteState,
    artifacts_captured AS artifactsCaptured FROM agent_delegations
    WHERE id = ? AND owner_user_id = ?`).bind(progressDelegationId, owner).first();
  assert.deepEqual(completed, {
    state: 'remote_completed', remoteState: 'TASK_STATE_COMPLETED', artifactsCaptured: 1,
  });
  const reservation = await env.DB.prepare(`SELECT reserved_minor AS reservedMinor,
    settled_minor AS settledMinor, state FROM agent_delegation_budget_reservations
    WHERE delegation_id = ? AND owner_user_id = ?`).bind(progressDelegationId, owner).first();
  assert.deepEqual(reservation, { reservedMinor: 100, settledMinor: 42, state: 'settled' });
  const receipt = await env.DB.prepare(`SELECT provider_reference AS providerReference,
    amount_minor AS amountMinor FROM a2a_usage_receipts
    WHERE delegation_id = ? AND owner_user_id = ?`).bind(progressDelegationId, owner).first();
  assert.deepEqual(receipt, { providerReference: 'vitest-progress-usage-receipt-1', amountMinor: 42 });
  const liveUsageRow = await env.DB.prepare(`SELECT sequence, cumulative_amount_minor AS amountMinor,
    pricing_version AS pricingVersion FROM a2a_live_usage_snapshots WHERE delegation_id = ?`)
    .bind(progressDelegationId).first();
  assert.deepEqual(liveUsageRow, { sequence: 1, amountMinor: 21, pricingVersion: 'vitest-rates-1' });
  const artifact = await env.DB.prepare(`SELECT payload_ciphertext AS ciphertext, nonce,
    artifact_sha256 AS artifactSha256, key_version AS keyVersion, remote_task_id AS remoteTaskId
    FROM agent_delegation_artifacts WHERE delegation_id = ? AND owner_user_id = ?`)
    .bind(progressDelegationId, owner).first();
  assert.deepEqual(
    JSON.parse(await decryptA2AArtifact(artifact, inputKey, owner, progressDelegationId, 'vitest-progress-task-1')),
    {
      schemaVersion: 1,
      artifacts: [{ name: 'result.txt', textParts: ['Verified asynchronous agent result.'] }],
      omittedNonTextParts: 0,
      truncated: false,
    },
  );
  const sendClaims = await env.DB.prepare(`SELECT COUNT(*) AS count FROM agent_delegation_events
    WHERE delegation_id = ? AND owner_user_id = ? AND event_type = 'remote_send_claimed'`)
    .bind(progressDelegationId, owner).first();
  assert.equal(sendClaims.count, 1);
  const reconciliations = await env.DB.prepare(`SELECT COUNT(*) AS count FROM agent_delegation_events
    WHERE delegation_id = ? AND owner_user_id = ? AND event_type = 'remote_task_reconciled'`)
    .bind(progressDelegationId, owner).first();
  assert.equal(reconciliations.count, 2);
}, 30_000);

it('does not start a cloud agent when offline continuation consent is missing', async () => {
  const noConsentDelegationId = '11111111-1111-4111-8111-111111111011';
  const noConsentParentJobId = '22222222-2222-4222-8222-222222222011';
  const noConsentMessageId = '33333333-3333-4333-8333-333333333011';
  await seedApprovedDelegation({
    delegationId: noConsentDelegationId,
    parentJobId: noConsentParentJobId,
    messageId: noConsentMessageId,
    continueWhileDeviceOffline: false,
  });
  const instanceId = `a2a-no-offline-consent-${crypto.randomUUID()}`;
  const workflow = await introspectWorkflowInstance(env.A2A_DELEGATION_WORKFLOW, instanceId);
  try {
    await workflow.modify(async (modifier) => {
      await modifier.disableRetryDelays([{ name: 'verify-native-broker-authorization-before-egress' }]);
    });
    await env.A2A_DELEGATION_WORKFLOW.create({
      id: instanceId,
      params: { ownerUserId: owner, delegationId: noConsentDelegationId, operation: 'dispatch' },
    });
    await workflow.waitForStatus('complete');
    const delegation = await env.DB.prepare(`SELECT state, remote_state AS remoteState
      FROM agent_delegations WHERE id = ? AND owner_user_id = ?`)
      .bind(noConsentDelegationId, owner).first();
    const claims = await env.DB.prepare(`SELECT COUNT(*) AS count
      FROM agent_delegation_events WHERE delegation_id = ? AND owner_user_id = ?
        AND event_type = 'remote_send_claimed'`)
      .bind(noConsentDelegationId, owner).first();
    const reservation = await env.DB.prepare(`SELECT state FROM agent_delegation_budget_reservations
      WHERE delegation_id = ? AND owner_user_id = ?`)
      .bind(noConsentDelegationId, owner).first();
    assert.equal(delegation.state, 'remote_failed');
    assert.equal(delegation.remoteState, 'PREFLIGHT_FAILED_BEFORE_SEND');
    assert.equal(claims.count, 0);
    assert.equal(reservation.state, 'released');
  } finally {
    await workflow.dispose();
  }
}, 30_000);

it('confirms remote cancellation, settles final signed usage, and never repeats cancellation after restart', async () => {
  const cancelDelegationId = '11111111-1111-4111-8111-111111111013';
  const cancelParentJobId = '22222222-2222-4222-8222-222222222013';
  const cancelMessageId = '33333333-3333-4333-8333-333333333013';
  await seedApprovedDelegation({
    delegationId: cancelDelegationId,
    parentJobId: cancelParentJobId,
    messageId: cancelMessageId,
    message: 'Cloudflare A2A cancellation and settlement fixture.',
    budgetLimitMinor: 50,
    parentBudgetLimitMinor: 80,
  });

  const dispatchId = 'a2a-cancel-dispatch';
  const dispatchWorkflow = await introspectWorkflowInstance(env.A2A_DELEGATION_WORKFLOW, dispatchId);
  try {
    await dispatchWorkflow.modify(async (modifier) => {
      await modifier.disableRetryDelays([{ name: 'discover-approved-agent' }]);
    });
    await env.A2A_DELEGATION_WORKFLOW.create({
      id: dispatchId,
      params: { ownerUserId: owner, delegationId: cancelDelegationId, operation: 'dispatch' },
    });
    await dispatchWorkflow.waitForStatus('complete');
    assert.deepEqual(await dispatchWorkflow.getOutput(), {
      outcome: 'task_received', state: 'working', usageOutcome: 'missing',
    });
  } finally {
    await dispatchWorkflow.dispose();
  }

  const store = a2aDelegationStore(env.DB);
  const requested = await store.requestCancel(owner, cancelDelegationId);
  assert.equal(requested.state, 'cancel_requested');

  const cancelWorkflowId = 'a2a-cancel-reconcile';
  const cancelWorkflow = await introspectWorkflowInstance(env.A2A_DELEGATION_WORKFLOW, cancelWorkflowId);
  try {
    await cancelWorkflow.modify(async (modifier) => {
      await modifier.disableRetryDelays([{ name: 'discover-agent-for-reconciliation' }]);
    });
    await env.A2A_DELEGATION_WORKFLOW.create({
      id: cancelWorkflowId,
      params: { ownerUserId: owner, delegationId: cancelDelegationId, operation: 'reconcile' },
    });
    await cancelWorkflow.waitForStatus('complete');
    assert.deepEqual(await cancelWorkflow.getOutput(), {
      outcome: 'cancel_response_received', state: 'remote_cancelled', usageOutcome: 'settled',
    });

    const delegation = await env.DB.prepare(`SELECT state, remote_state AS remoteState
      FROM agent_delegations WHERE id = ? AND owner_user_id = ?`)
      .bind(cancelDelegationId, owner).first();
    assert.deepEqual(delegation, { state: 'remote_cancelled', remoteState: 'TASK_STATE_CANCELED' });
    const reservation = await env.DB.prepare(`SELECT reserved_minor AS reservedMinor,
      settled_minor AS settledMinor, state FROM agent_delegation_budget_reservations
      WHERE delegation_id = ? AND owner_user_id = ?`).bind(cancelDelegationId, owner).first();
    assert.deepEqual(reservation, { reservedMinor: 50, settledMinor: 11, state: 'settled' });
    const receipt = await env.DB.prepare(`SELECT provider_reference AS providerReference,
      amount_minor AS amountMinor FROM a2a_usage_receipts
      WHERE delegation_id = ? AND owner_user_id = ?`).bind(cancelDelegationId, owner).first();
    assert.deepEqual(receipt, { providerReference: 'vitest-cancel-usage-receipt-1', amountMinor: 11 });
    const cancelClaims = await env.DB.prepare(`SELECT COUNT(*) AS count
      FROM agent_delegation_events WHERE delegation_id = ? AND owner_user_id = ?
        AND event_type = 'remote_cancel_claimed'`)
      .bind(cancelDelegationId, owner).first();
    assert.equal(cancelClaims.count, 1);

    const durable = await env.A2A_DELEGATION_WORKFLOW.get(cancelWorkflowId);
    await durable.restart();
    await cancelWorkflow.waitForStatus('complete');
    assert.deepEqual(await cancelWorkflow.getOutput(), { outcome: 'not_dispatchable' });
    const claimsAfterRestart = await env.DB.prepare(`SELECT COUNT(*) AS count
      FROM agent_delegation_events WHERE delegation_id = ? AND owner_user_id = ?
        AND event_type = 'remote_cancel_claimed'`)
      .bind(cancelDelegationId, owner).first();
    assert.equal(claimsAfterRestart.count, 1);
  } finally {
    await cancelWorkflow.dispose();
  }
}, 30_000);

it('preserves remote completion and its artifact when it wins a cancellation race', async () => {
  const raceDelegationId = '11111111-1111-4111-8111-111111111014';
  const raceParentJobId = '22222222-2222-4222-8222-222222222014';
  const raceMessageId = '33333333-3333-4333-8333-333333333014';
  await seedApprovedDelegation({
    delegationId: raceDelegationId,
    parentJobId: raceParentJobId,
    messageId: raceMessageId,
    message: 'Cloudflare A2A completion racing with cancellation fixture.',
    budgetLimitMinor: 50,
    parentBudgetLimitMinor: 80,
  });

  const dispatchId = 'a2a-race-dispatch';
  const dispatchWorkflow = await introspectWorkflowInstance(env.A2A_DELEGATION_WORKFLOW, dispatchId);
  try {
    await dispatchWorkflow.modify(async (modifier) => {
      await modifier.disableRetryDelays([{ name: 'discover-approved-agent' }]);
    });
    await env.A2A_DELEGATION_WORKFLOW.create({
      id: dispatchId,
      params: { ownerUserId: owner, delegationId: raceDelegationId, operation: 'dispatch' },
    });
    await dispatchWorkflow.waitForStatus('complete');
    assert.deepEqual(await dispatchWorkflow.getOutput(), {
      outcome: 'task_received', state: 'working', usageOutcome: 'missing',
    });
  } finally {
    await dispatchWorkflow.dispose();
  }

  const store = a2aDelegationStore(env.DB);
  assert.equal((await store.requestCancel(owner, raceDelegationId)).state, 'cancel_requested');
  const reconcileId = 'a2a-race-reconcile';
  const reconcileWorkflow = await introspectWorkflowInstance(env.A2A_DELEGATION_WORKFLOW, reconcileId);
  try {
    await reconcileWorkflow.modify(async (modifier) => {
      await modifier.disableRetryDelays([{ name: 'discover-agent-for-reconciliation' }]);
    });
    await env.A2A_DELEGATION_WORKFLOW.create({
      id: reconcileId,
      params: { ownerUserId: owner, delegationId: raceDelegationId, operation: 'reconcile' },
    });
    await reconcileWorkflow.waitForStatus('complete');
    assert.deepEqual(await reconcileWorkflow.getOutput(), {
      outcome: 'cancel_response_received', state: 'remote_completed', usageOutcome: 'settled',
    });

    const delegation = await env.DB.prepare(`SELECT state, remote_state AS remoteState,
      artifacts_captured AS artifactsCaptured FROM agent_delegations
      WHERE id = ? AND owner_user_id = ?`).bind(raceDelegationId, owner).first();
    assert.deepEqual(delegation, {
      state: 'remote_completed', remoteState: 'TASK_STATE_COMPLETED', artifactsCaptured: 1,
    });
    const reservation = await env.DB.prepare(`SELECT reserved_minor AS reservedMinor,
      settled_minor AS settledMinor, state FROM agent_delegation_budget_reservations
      WHERE delegation_id = ? AND owner_user_id = ?`).bind(raceDelegationId, owner).first();
    assert.deepEqual(reservation, { reservedMinor: 50, settledMinor: 9, state: 'settled' });
    const artifact = await env.DB.prepare(`SELECT payload_ciphertext AS ciphertext, nonce,
      artifact_sha256 AS artifactSha256, key_version AS keyVersion, remote_task_id AS remoteTaskId
      FROM agent_delegation_artifacts WHERE delegation_id = ? AND owner_user_id = ?`)
      .bind(raceDelegationId, owner).first();
    assert.deepEqual(
      JSON.parse(await decryptA2AArtifact(artifact, inputKey, owner, raceDelegationId, 'vitest-race-task-1')),
      {
        schemaVersion: 1,
        artifacts: [{ name: 'race-result.txt', textParts: ['Completed while cancellation was pending.'] }],
        omittedNonTextParts: 0,
        truncated: false,
      },
    );

    const claims = await env.DB.prepare(`SELECT COUNT(*) AS count
      FROM agent_delegation_events WHERE delegation_id = ? AND owner_user_id = ?
        AND event_type = 'remote_cancel_claimed'`).bind(raceDelegationId, owner).first();
    assert.equal(claims.count, 1);
    const durable = await env.A2A_DELEGATION_WORKFLOW.get(reconcileId);
    await durable.restart();
    await reconcileWorkflow.waitForStatus('complete');
    assert.deepEqual(await reconcileWorkflow.getOutput(), { outcome: 'not_dispatchable' });
    const claimsAfterRestart = await env.DB.prepare(`SELECT COUNT(*) AS count
      FROM agent_delegation_events WHERE delegation_id = ? AND owner_user_id = ?
        AND event_type = 'remote_cancel_claimed'`).bind(raceDelegationId, owner).first();
    assert.equal(claimsAfterRestart.count, 1);
  } finally {
    await reconcileWorkflow.dispose();
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
