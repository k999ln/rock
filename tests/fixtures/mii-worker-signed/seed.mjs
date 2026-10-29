import { createA2AIntentDigests } from '../../../lib/a2a-authorization.ts';
import { a2aPriceQuoteDigest, a2aPriceQuoteSigningBytes, A2A_PRICE_QUOTE_SCHEMA } from '../../../lib/a2a-price-quote.ts';
import { a2aBrokerAuthorizationSigningBytes, A2A_BROKER_AUTHORIZATION_SCHEMA } from '../../../lib/a2a-broker-authorization.ts';
import { encryptA2AInput } from '../../../lib/a2a-input-crypto.ts';

export function makeSeed(env) {
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


return seedApprovedDelegation;
}
