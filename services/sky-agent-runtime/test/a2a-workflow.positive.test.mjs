import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, test } from 'vitest';
import { a2aAgentCardSha256 } from '../../../lib/a2a-agent-directory.ts';
import {
  A2A_BROKER_AUTHORIZATION_SCHEMA,
  a2aBrokerAuthorizationSigningBytes,
} from '../../../lib/a2a-broker-authorization.ts';
import { createA2AIntentDigests } from '../../../lib/a2a-authorization.ts';
import { a2aDelegationStore } from '../../../lib/a2a-delegation-store.ts';
import { encryptA2AInput } from '../../../lib/a2a-input-crypto.ts';
import {
  A2A_PRICE_QUOTE_SCHEMA,
  a2aPriceQuoteDigest,
  a2aPriceQuoteSigningBytes,
} from '../../../lib/a2a-price-quote.ts';
import {
  A2A_USAGE_RECEIPT_SCHEMA,
  a2aUsageReceiptSigningBytes,
} from '../../../lib/a2a-usage-receipt.ts';
import { workStore } from '../../../lib/work-store.ts';
import { createWorkJob } from '../../../lib/workflow.ts';
import { runA2AAgentRuntime } from '../src/worker.ts';

const migrations = readdirSync(new URL('../../../drizzle/', import.meta.url))
  .filter((name) => name.endsWith('.sql') && !name.startsWith('._'))
  .sort();
const databases = [];
afterEach(() => {
  while (databases.length) databases.pop().close();
});

function database() {
  const sqlite = new DatabaseSync(':memory:');
  databases.push(sqlite);
  for (const file of migrations)
    sqlite.exec(readFileSync(new URL(`../../../drizzle/${file}`, import.meta.url), 'utf8'));
  return {
    sqlite,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() { return sqlite.prepare(sql).get(...values) ?? null; },
            async all() { return { results: sqlite.prepare(sql).all(...values) }; },
            runSync() {
              return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } };
            },
            async run() { return this.runSync(); },
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = statements.map((statement) => statement.runSync());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

function rawPublicKey(key) {
  return new Uint8Array(key.export({ type: 'spki', format: 'der' }).subarray(-32));
}

function hex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

function signBase64Url(bytes, privateKey) {
  return sign(null, bytes, privateKey).toString('base64url');
}

test('owner-approved Jennifer leaf is sent once, captured, receipted and left for independent review', async () => {
  const db = database();
  const store = a2aDelegationStore(db);
  const now = Date.now();
  const owner = 'alice';
  const parentJobId = '00000000-0000-4000-8000-000000000001';
  const delegationId = '00000000-0000-4000-8000-000000000002';
  const messageId = '00000000-0000-4000-8000-000000000003';
  const origin = 'https://agent.example';
  const message = 'Implement only the approved Jennifer leaf and return evidence.';
  const taskId = 'remote-jennifer-leaf-1';
  const encryptionKey = '11'.repeat(32);
  const brokerKeys = generateKeyPairSync('ed25519');
  const usageKeys = generateKeyPairSync('ed25519');
  const card = {
    name: 'Jennifer Specialist Agent',
    description: 'Executes one bounded implementation leaf.',
    version: '1.0.0',
    supportedInterfaces: [
      { url: `${origin}/a2a`, protocolBinding: 'JSONRPC', protocolVersion: '1.0' },
    ],
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: 'implementation', name: 'Implementation', description: 'Bounded repository work.' }],
  };
  const cardSha256 = await a2aAgentCardSha256(card);

  await workStore(db).create(owner, createWorkJob({
    id: parentJobId,
    title: 'Jennifer leaf execution',
    templateId: 'cloud-agent',
  }, new Date(now).toISOString()));
  await db.prepare(`INSERT INTO sky_a2a_agent_connections (
    id, owner_user_id, origin, card_url, agent_name, agent_version,
    card_sha256, card_json, discovered_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    '00000000-0000-4000-8000-000000000004', owner, origin,
    `${origin}/.well-known/agent-card.json`, card.name, card.version,
    cardSha256, JSON.stringify(card), now,
  ).run();

  const priceQuote = {
    schema: A2A_PRICE_QUOTE_SCHEMA,
    providerId: 'fixture-provider',
    keyId: 'usage-key-1',
    quoteId: 'quote-1',
    agentOrigin: origin,
    agentName: card.name,
    agentVersion: card.version,
    requestSha256: createHash('sha256').update(message).digest('hex'),
    pricingVersion: 'fixture-rates-1',
    pricingSha256: 'a'.repeat(64),
    currency: 'USD',
    estimateMinor: 47,
    maxAmountMinor: 50,
    issuedAt: now - 1_000,
    expiresAt: now + 3 * 60_000,
    usage: [{ meter: 'task', quantity: 1, unit: 'leaf', unitPriceMinor: 47, amountMinor: 47 }],
    signature: '',
  };
  priceQuote.signature = signBase64Url(a2aPriceQuoteSigningBytes(priceQuote), usageKeys.privateKey);
  const priceQuoteDigest = await a2aPriceQuoteDigest(priceQuote);
  const intent = {
    id: delegationId,
    parentJobId,
    messageId,
    targetOrigin: origin,
    targetAgentName: card.name,
    targetAgentVersion: card.version,
    protocolVersion: '1.0',
    budgetCurrency: 'USD',
    budgetLimitMinor: 50,
    parentBudgetLimitMinor: 100,
    continueWhileDeviceOffline: true,
    deadlineAt: now + 4 * 60_000,
  };
  const digests = await createA2AIntentDigests({
    ...intent,
    ownerUserId: owner,
    message,
    priceQuoteDigest,
  });
  const prepared = await store.prepare(owner, {
    ...intent,
    idempotencyKey: 'jennifer:task-leaf:worker:fixture',
    ...digests,
    priceQuote,
    priceQuoteDigest,
  }, now);
  expect(prepared.delegation.state).toBe('awaiting_approval');

  const proof = {
    schema: A2A_BROKER_AUTHORIZATION_SCHEMA,
    authorityId: 'fixture-rockstaros',
    ownerUserId: owner,
    deviceRef: 'device-a',
    delegationId,
    parentJobId,
    messageId,
    targetOrigin: origin,
    targetAgentName: card.name,
    targetAgentVersion: card.version,
    protocolVersion: '1.0',
    inputSha256: digests.inputSha256,
    budgetCurrency: 'USD',
    budgetLimitMinor: 50,
    continueWhileDeviceOffline: true,
    deadlineAt: intent.deadlineAt,
    authorizationSha256: digests.authorizationSha256,
    issuedAt: now - 500,
    expiresAt: now + 2 * 60_000,
    keyId: 'broker-key-1',
    signature: '',
  };
  proof.signature = signBase64Url(
    a2aBrokerAuthorizationSigningBytes(proof),
    brokerKeys.privateKey,
  );
  await store.saveBrokerAuthorization(owner, delegationId, {
    proofJson: JSON.stringify(proof),
    deviceRef: proof.deviceRef,
    authorityId: proof.authorityId,
    keyId: proof.keyId,
    expiresAt: proof.expiresAt,
  }, now);
  await store.approve(owner, delegationId, digests.authorizationSha256,
    await encryptA2AInput(message, encryptionKey, owner, delegationId, digests.inputSha256), now);

  const usageReceipt = {
    schema: A2A_USAGE_RECEIPT_SCHEMA,
    providerId: priceQuote.providerId,
    keyId: priceQuote.keyId,
    receiptId: 'receipt-1',
    ownerUserId: owner,
    parentJobId,
    delegationId,
    taskId,
    agentOrigin: origin,
    agentName: card.name,
    agentVersion: card.version,
    currency: 'USD',
    amountMinor: 47,
    pricingVersion: priceQuote.pricingVersion,
    issuedAt: now,
    usage: [{ meter: 'task', quantity: 1, unit: 'leaf', amountMinor: 47 }],
    signature: '',
  };
  usageReceipt.signature = signBase64Url(
    a2aUsageReceiptSigningBytes(usageReceipt),
    usageKeys.privateKey,
  );
  let sends = 0;
  const fetcher = async (input, init = {}) => {
    const url = new URL(input);
    if (init.method === 'GET' && url.pathname === '/.well-known/agent-card.json')
      return Response.json(card);
    const request = JSON.parse(init.body);
    expect(request.method).toBe('SendMessage');
    sends += 1;
    expect(request.params.message.metadata['org.rockstar.a2a-delegation.v1']).toMatchObject({
      ownerUserId: owner,
      parentJobId,
      delegationId,
      budgetLimitMinor: 50,
    });
    return Response.json({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        task: {
          id: taskId,
          status: { state: 'TASK_STATE_COMPLETED' },
          artifacts: [{ name: 'result', parts: [{ text: 'implemented and tested' }] }],
          metadata: { 'org.rockstar.a2a-usage-receipt.v1': usageReceipt },
        },
      },
    });
  };
  const env = {
    DB: db,
    A2A_DELEGATION_EXECUTION_ENABLED: 'true',
    A2A_EGRESS_ALLOWED_ORIGINS: origin,
    A2A_INPUT_ENCRYPTION_KEY: encryptionKey,
    A2A_TRUSTED_BROKER_KEYS: JSON.stringify([{
      authorityId: proof.authorityId,
      ownerUserId: owner,
      deviceRef: proof.deviceRef,
      keyId: proof.keyId,
      publicKeyHex: hex(rawPublicKey(brokerKeys.publicKey)),
      status: 'active',
    }]),
    A2A_TRUSTED_USAGE_KEYS: JSON.stringify([{
      providerId: priceQuote.providerId,
      keyId: priceQuote.keyId,
      agentOrigin: origin,
      publicKeyHex: hex(rawPublicKey(usageKeys.publicKey)),
      status: 'active',
    }]),
    ROCKSTAR_PUBLIC_ORIGIN: 'https://rockstar.example',
  };
  const result = await runA2AAgentRuntime(env, { fetcher, now: () => now, limit: 4 });
  expect(result).toMatchObject({ enabled: true, dispatched: 1, unfinished: 0 });
  expect(sends).toBe(1);
  const completed = await store.get(owner, delegationId);
  expect(completed.state).toBe('remote_completed');
  expect(completed.artifactsCaptured).toBe(1);
  expect(await store.listArtifacts(owner, delegationId)).toHaveLength(1);
  expect((await store.getUsageReceipt(owner, delegationId)).amountMinor).toBe(47);
  expect(await store.getBudgetReservation(owner, delegationId)).toMatchObject({
    state: 'settled',
    settledMinor: 47,
  });
});

test('runtime remains fail-closed until deployment explicitly enables execution', async () => {
  await expect(runA2AAgentRuntime({ A2A_DELEGATION_EXECUTION_ENABLED: 'false' }))
    .resolves.toEqual({ enabled: false, dispatched: 0, reconciled: 0, unfinished: 0 });
});
