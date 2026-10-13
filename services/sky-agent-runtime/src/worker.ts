import {
  A2AClientError,
  A2ARequestIndeterminateError,
  createA2AClient,
  type A2AAgentCard,
  type A2ADelegationReceiptContext,
  type A2APackageRuntimeInvocation,
  type A2ATask,
} from '../../../lib/a2a-client.ts';
import {
  a2aDelegationStore,
  A2ADelegationStoreError,
  type A2ADelegation,
} from '../../../lib/a2a-delegation-store.ts';
import {
  a2aAgentCardSha256,
  a2aAgentDirectory,
  parseStoredA2AAgent,
  type StoredA2AAgent,
} from '../../../lib/a2a-agent-directory.ts';
import {
  a2aDelegationExecutionEnabled,
  a2aEgressOriginAllowed,
  createA2AIntentDigests,
} from '../../../lib/a2a-authorization.ts';
import { verifyStoredA2ABrokerAuthorization } from '../../../lib/a2a-broker-authorization.ts';
import { a2aBrokerDeviceKeyResolver } from '../../../lib/a2a-broker-trust.ts';
import { normalizeA2AArtifacts } from '../../../lib/a2a-artifacts.ts';
import {
  decryptA2AInput,
  encryptA2AArtifact,
  type EncryptedA2AInput,
} from '../../../lib/a2a-input-crypto.ts';
import { a2aPriceQuoteDigest, verifyA2APriceQuote } from '../../../lib/a2a-price-quote.ts';
import {
  trustedA2AUsageKeyResolver,
  verifyA2AUsageReceipt,
  type A2AUsageReceipt,
} from '../../../lib/a2a-usage-receipt.ts';
import { verifySkyPackageRuntimeBindingForDispatch } from '../../../lib/sky-package-runtime-binding-dispatch.ts';
import {
  parseStoredSkyPackageRuntimeBinding,
  SkyPackageRuntimeBindingStore,
} from '../../../lib/sky-package-runtime-binding-store.ts';
import { skyToolPackageStore } from '../../../lib/sky-tool-package-store.ts';

type RuntimeEnv = {
  DB: D1Database;
  A2A_DELEGATION_EXECUTION_ENABLED?: string;
  A2A_EGRESS_ALLOWED_ORIGINS?: string;
  A2A_INPUT_ENCRYPTION_KEY?: string;
  A2A_TRUSTED_BROKER_KEYS?: string;
  A2A_TRUSTED_USAGE_KEYS?: string;
  A2A_PRICE_QUOTE_EXTENSION_URI?: string;
  SKY_PACKAGE_RUNTIME_EXTENSION_URI?: string;
  SKY_PACKAGE_RUNTIME_BINDING_TRUSTED_KEYS?: string;
  ROCKSTAR_PUBLIC_ORIGIN?: string;
};

type RuntimeOptions = {
  fetcher?: typeof fetch;
  now?: () => number;
  limit?: number;
};

type DispatchContext = {
  delegation: A2ADelegation;
  message: string;
  storedAgent: StoredA2AAgent;
  liveCard: A2AAgentCard;
  liveCardSha256: string;
  packageInvocation?: A2APackageRuntimeInvocation;
};

const terminalStates = new Set([
  'TASK_STATE_COMPLETED',
  'TASK_STATE_FAILED',
  'TASK_STATE_CANCELED',
  'TASK_STATE_REJECTED',
]);

function safeLimit(value: number | undefined) {
  return Math.min(Math.max(Math.trunc(value ?? 12), 1), 25);
}

function publicOrigin(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value && url.pathname === '/' &&
      !url.username && !url.password && !url.search && !url.hash
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function inputRecord(value: Awaited<ReturnType<ReturnType<typeof a2aDelegationStore>['getInput']>>) {
  if (!value || value.keyVersion !== 'aes-256-gcm-v1') return null;
  return value as EncryptedA2AInput & { expiresAt: number };
}

function intentFor(delegation: A2ADelegation, message: string) {
  return {
    id: delegation.id,
    parentJobId: delegation.parentJobId,
    predecessorDelegationId: delegation.predecessorDelegationId,
    messageId: delegation.messageId,
    targetOrigin: delegation.targetOrigin,
    targetAgentName: delegation.targetAgentName,
    targetAgentVersion: delegation.targetAgentVersion,
    protocolVersion: delegation.protocolVersion,
    budgetCurrency: delegation.budgetCurrency,
    budgetLimitMinor: delegation.budgetLimitMinor,
    parentBudgetLimitMinor: delegation.parentBudgetLimitMinor,
    continueWhileDeviceOffline: delegation.continueWhileDeviceOffline,
    deadlineAt: delegation.deadlineAt,
    ownerUserId: delegation.ownerUserId,
    message,
    ...(delegation.priceQuoteDigest ? { priceQuoteDigest: delegation.priceQuoteDigest } : {}),
    ...(delegation.packageRuntimeBindingDigest
      ? { packageRuntimeBindingDigest: delegation.packageRuntimeBindingDigest }
      : {}),
  };
}

async function currentAuthorization(
  env: RuntimeEnv,
  expected: A2ADelegation,
  message: string,
  allowedStates: string[],
) {
  const store = a2aDelegationStore(env.DB);
  const current = await store.get(expected.ownerUserId, expected.id);
  if (!current || !allowedStates.includes(current.state) || current.revision < expected.revision ||
      current.deadlineAt <= Date.now() ||
      current.inputSha256 !== expected.inputSha256 ||
      current.authorizationSha256 !== expected.authorizationSha256 ||
      current.priceQuoteDigest !== expected.priceQuoteDigest ||
      current.packageRuntimeBindingDigest !== expected.packageRuntimeBindingDigest ||
      !a2aEgressOriginAllowed(current.targetOrigin, env.A2A_EGRESS_ALLOWED_ORIGINS))
    throw new Error('A2A_DISPATCH_CONTRACT_CHANGED');

  const [storedInput, authorization, reservation, connectedAgents] = await Promise.all([
    store.getInput(current.ownerUserId, current.id),
    store.getBrokerAuthorization(current.ownerUserId, current.id),
    store.getBudgetReservation(current.ownerUserId, current.id),
    a2aAgentDirectory(env.DB).list(current.ownerUserId),
  ]);
  const encrypted = inputRecord(storedInput);
  if (!encrypted || encrypted.expiresAt <= Date.now() || !env.A2A_INPUT_ENCRYPTION_KEY ||
      encrypted.inputSha256 !== current.inputSha256 ||
      !reservation || reservation.state !== 'held' ||
      reservation.parentJobId !== current.parentJobId ||
      reservation.currency !== current.budgetCurrency ||
      reservation.reservedMinor !== current.budgetLimitMinor)
    throw new Error('A2A_DISPATCH_PREFLIGHT_INVALID');

  const decrypted = await decryptA2AInput(
    encrypted,
    env.A2A_INPUT_ENCRYPTION_KEY,
    current.ownerUserId,
    current.id,
  );
  if (decrypted !== message) throw new Error('A2A_DISPATCH_INPUT_CHANGED');
  const digests = await createA2AIntentDigests(intentFor(current, message));
  if (digests.inputSha256 !== current.inputSha256 ||
      digests.authorizationSha256 !== current.authorizationSha256)
    throw new Error('A2A_DISPATCH_DIGEST_CHANGED');

  const brokerValid = await verifyStoredA2ABrokerAuthorization(
    authorization,
    { ...intentFor(current, message), deviceRef: authorization?.deviceRef ?? '' },
    a2aBrokerDeviceKeyResolver(env.DB, env.A2A_TRUSTED_BROKER_KEYS),
  );
  if (!brokerValid) throw new Error('A2A_BROKER_AUTHORIZATION_INVALID');

  if (!current.priceQuote || !env.A2A_TRUSTED_USAGE_KEYS ||
      await a2aPriceQuoteDigest(current.priceQuote) !== current.priceQuoteDigest ||
      !(await verifyA2APriceQuote(current.priceQuote, {
        agentOrigin: current.targetOrigin,
        agentName: current.targetAgentName,
        agentVersion: current.targetAgentVersion,
        requestSha256: current.inputSha256,
        currency: current.budgetCurrency,
        maximumBudgetMinor: current.budgetLimitMinor,
      }, trustedA2AUsageKeyResolver(env.A2A_TRUSTED_USAGE_KEYS))) ||
      current.priceQuote.maxAmountMinor !== current.budgetLimitMinor)
    throw new Error('A2A_PRICE_QUOTE_INVALID');

  const storedAgent = connectedAgents.find((agent) =>
    agent.origin === current.targetOrigin &&
    agent.agentName === current.targetAgentName &&
    agent.agentVersion === current.targetAgentVersion);
  if (!storedAgent) throw new Error('A2A_AGENT_NOT_CONNECTED');
  parseStoredA2AAgent(storedAgent.cardJson, [
    env.A2A_PRICE_QUOTE_EXTENSION_URI,
    env.SKY_PACKAGE_RUNTIME_EXTENSION_URI,
  ].filter((value): value is string => Boolean(value)));
  return { current, storedAgent };
}

async function packageInvocation(
  env: RuntimeEnv,
  delegation: A2ADelegation,
  storedAgent: StoredA2AAgent,
  liveCardSha256: string,
) {
  if (!delegation.packageRuntimeBindingId && !delegation.packageRuntimeBindingDigest)
    return undefined;
  const bindingRow = await new SkyPackageRuntimeBindingStore(env.DB)
    .get(delegation.packageRuntimeBindingId);
  const binding = bindingRow ? parseStoredSkyPackageRuntimeBinding(bindingRow) : null;
  const pkg = binding
    ? await skyToolPackageStore(env.DB)
      .verifiedRegistryPackage(binding.packageKey, binding.manifestSha256)
    : null;
  const valid = await verifySkyPackageRuntimeBindingForDispatch({
    bindingRow,
    bindingId: delegation.packageRuntimeBindingId,
    bindingDigest: delegation.packageRuntimeBindingDigest,
    agent: storedAgent,
    package: pkg,
    priceQuote: delegation.priceQuote,
    trustedKeys: env.SKY_PACKAGE_RUNTIME_BINDING_TRUSTED_KEYS,
    runtimeExtensionUri: env.SKY_PACKAGE_RUNTIME_EXTENSION_URI,
    expectedLiveAgentCardSha256: liveCardSha256,
  });
  if (!valid || !binding) throw new Error('A2A_PACKAGE_BINDING_INVALID');
  return {
    runtimeExtensionUri: binding.runtimeExtensionUri,
    bindingId: binding.bindingId,
    bindingDigest: delegation.packageRuntimeBindingDigest,
    packageKey: binding.packageKey,
    manifestSha256: binding.manifestSha256,
    operationId: binding.operationId,
    inputSchemaSha256: binding.inputSchemaSha256,
    outputSchemaSha256: binding.outputSchemaSha256,
    pricingVersion: binding.pricingVersion,
  } satisfies A2APackageRuntimeInvocation;
}

async function dispatchPreflight(env: RuntimeEnv, delegation: A2ADelegation, fetcher: typeof fetch) {
  const store = a2aDelegationStore(env.DB);
  const storedInput = inputRecord(await store.getInput(delegation.ownerUserId, delegation.id));
  if (!storedInput || !env.A2A_INPUT_ENCRYPTION_KEY)
    throw new Error('A2A_INPUT_UNAVAILABLE');
  const message = await decryptA2AInput(
    storedInput,
    env.A2A_INPUT_ENCRYPTION_KEY,
    delegation.ownerUserId,
    delegation.id,
  );
  const { current, storedAgent } = await currentAuthorization(env, delegation, message, ['prepared']);
  const client = createA2AClient({
    allowedOrigins: [current.targetOrigin],
    fetch: fetcher,
    timeoutMs: 10_000,
    priceQuoteExtensionUri: env.A2A_PRICE_QUOTE_EXTENSION_URI,
    packageRuntimeExtensionUri: env.SKY_PACKAGE_RUNTIME_EXTENSION_URI,
  });
  const liveCard = await client.discoverAtOrigin(current.targetOrigin);
  const liveCardSha256 = await a2aAgentCardSha256(liveCard);
  if (liveCard.name !== storedAgent.agentName || liveCard.version !== storedAgent.agentVersion ||
      liveCardSha256 !== storedAgent.cardSha256)
    throw new Error('A2A_AGENT_CARD_CHANGED');
  return {
    delegation: current,
    message,
    storedAgent,
    liveCard,
    liveCardSha256,
    packageInvocation: await packageInvocation(env, current, storedAgent, liveCardSha256),
  } satisfies DispatchContext;
}

function receiptContext(env: RuntimeEnv, delegation: A2ADelegation): A2ADelegationReceiptContext {
  const origin = publicOrigin(env.ROCKSTAR_PUBLIC_ORIGIN);
  return {
    schema: 'rockstar-a2a-delegation-context/1',
    ownerUserId: delegation.ownerUserId,
    parentJobId: delegation.parentJobId,
    delegationId: delegation.id,
    currency: delegation.budgetCurrency,
    budgetLimitMinor: delegation.budgetLimitMinor,
    ...(origin ? {
      receiptCallbackUrl: `${origin}/api/sky/a2a-delegations/${delegation.id}/usage-receipt`,
    } : {}),
  };
}

function taskReceipt(value: unknown): A2AUsageReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const task = value as Record<string, unknown>;
  const metadata = task.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const receipt = (metadata as Record<string, unknown>)['org.rockstar.a2a-usage-receipt.v1'];
  return receipt && typeof receipt === 'object' && !Array.isArray(receipt)
    ? receipt as A2AUsageReceipt
    : null;
}

async function settleTaskReceipt(env: RuntimeEnv, delegation: A2ADelegation, task: A2ATask, now: number) {
  const receipt = taskReceipt(task);
  if (!receipt || !env.A2A_TRUSTED_USAGE_KEYS || !delegation.priceQuote ||
      receipt.pricingVersion !== delegation.priceQuote.pricingVersion)
    return false;
  const valid = await verifyA2AUsageReceipt(receipt, {
    ownerUserId: delegation.ownerUserId,
    parentJobId: delegation.parentJobId,
    delegationId: delegation.id,
    taskId: task.id,
    agentOrigin: delegation.targetOrigin,
    agentName: delegation.targetAgentName,
    agentVersion: delegation.targetAgentVersion,
    currency: delegation.budgetCurrency,
    amountMinor: receipt.amountMinor,
    issuedAt: receipt.issuedAt,
    delegationCreatedAt: delegation.createdAt,
    delegationLimitMinor: delegation.budgetLimitMinor,
  }, trustedA2AUsageKeyResolver(env.A2A_TRUSTED_USAGE_KEYS), now);
  if (!valid) return false;
  await a2aDelegationStore(env.DB).settleUsageReceipt(
    delegation.ownerUserId,
    delegation.id,
    receipt,
    now,
  );
  return true;
}

async function captureTask(env: RuntimeEnv, delegation: A2ADelegation, task: A2ATask, now: number) {
  const store = a2aDelegationStore(env.DB);
  let current = await store.get(delegation.ownerUserId, delegation.id);
  if (!current || !current.remoteTaskId) return;
  if (current.artifactsCaptured === 0) {
    const normalized = normalizeA2AArtifacts(task.artifacts);
    if (normalized && env.A2A_INPUT_ENCRYPTION_KEY) {
      const content = JSON.stringify(normalized);
      const encrypted = await encryptA2AArtifact(
        content,
        env.A2A_INPUT_ENCRYPTION_KEY,
        current.ownerUserId,
        current.id,
        current.remoteTaskId,
      );
      await store.saveArtifact(
        current.ownerUserId,
        current.id,
        current.remoteTaskId,
        encrypted,
        new TextEncoder().encode(content).byteLength,
        now,
      );
    }
    current = await store.get(current.ownerUserId, current.id);
    if (current && current.remoteTaskId && current.artifactsCaptured === 0)
      await store.markArtifactsCaptured(
        current.ownerUserId,
        current.id,
        current.remoteTaskId,
        current.revision,
        now,
      );
  }
  const terminal = await store.get(delegation.ownerUserId, delegation.id);
  if (terminal) await settleTaskReceipt(env, terminal, task, now);
}

async function dispatchOne(env: RuntimeEnv, listed: A2ADelegation, fetcher: typeof fetch, now: number) {
  const store = a2aDelegationStore(env.DB);
  let preflight: DispatchContext;
  try {
    preflight = await dispatchPreflight(env, listed, fetcher);
  } catch {
    const claimed = await store.claimDispatch(listed.ownerUserId, listed.id, now);
    if (claimed) await store.markPreflightFailed(claimed.ownerUserId, claimed.id, claimed.revision, now);
    return 'preflight_failed' as const;
  }
  const claimed = await store.claimDispatch(listed.ownerUserId, listed.id, now);
  if (!claimed) return 'skipped' as const;
  try {
    await currentAuthorization(env, claimed, preflight.message, ['dispatching']);
  } catch {
    await store.markPreflightFailed(claimed.ownerUserId, claimed.id, claimed.revision, now);
    return 'preflight_failed' as const;
  }
  const sending = await store.beginRemoteSend(claimed.ownerUserId, claimed.id, claimed.revision, now);
  if (!sending) return 'skipped' as const;
  const client = createA2AClient({
    allowedOrigins: [sending.targetOrigin],
    fetch: fetcher,
    timeoutMs: 20_000,
    priceQuoteExtensionUri: env.A2A_PRICE_QUOTE_EXTENSION_URI,
    packageRuntimeExtensionUri: env.SKY_PACKAGE_RUNTIME_EXTENSION_URI,
    authorizeDelegation: async (clientIntent) => {
      const { current, storedAgent } = await currentAuthorization(
        env,
        sending,
        preflight.message,
        ['dispatch_submitting'],
      );
      if (clientIntent.messageId !== current.messageId ||
          clientIntent.targetOrigin !== current.targetOrigin ||
          clientIntent.targetAgentName !== current.targetAgentName ||
          clientIntent.agentVersion !== current.targetAgentVersion ||
          clientIntent.inputSha256 !== current.inputSha256 ||
          storedAgent.cardSha256 !== preflight.liveCardSha256)
        throw new Error('A2A_SEND_AUTHORIZATION_CHANGED');
    },
  });
  try {
    const outcome = await client.sendMessage(
      preflight.liveCard,
      sending.messageId,
      preflight.message,
      preflight.packageInvocation,
      receiptContext(env, sending),
    );
    if (outcome.kind !== 'task') {
      await store.markIndeterminate(sending.ownerUserId, sending.id, sending.revision, now);
      return 'indeterminate' as const;
    }
    const recorded = await store.recordTaskReceipt(
      sending.ownerUserId,
      sending.id,
      sending.revision,
      {
        id: outcome.task.id,
        contextId: outcome.task.contextId,
        state: outcome.task.status.state,
      },
      now,
    );
    if (recorded && terminalStates.has(outcome.task.status.state))
      await captureTask(env, recorded, outcome.task, now);
    return 'dispatched' as const;
  } catch (error) {
    // Once `beginRemoteSend` is durable, neither a transport ambiguity nor a
    // definitive provider error authorizes a second SendMessage.
    try { await store.markIndeterminate(sending.ownerUserId, sending.id, sending.revision, now); }
    catch (stateError) {
      if (!(stateError instanceof A2ADelegationStoreError) ||
          stateError.code !== 'delegation_revision_conflict') throw stateError;
    }
    if (error instanceof A2ARequestIndeterminateError || error instanceof A2AClientError)
      return 'indeterminate' as const;
    return 'indeterminate' as const;
  }
}

async function reconciliationCard(env: RuntimeEnv, delegation: A2ADelegation, fetcher: typeof fetch) {
  if (!a2aEgressOriginAllowed(delegation.targetOrigin, env.A2A_EGRESS_ALLOWED_ORIGINS))
    throw new Error('A2A_EGRESS_NOT_ALLOWED');
  const stored = (await a2aAgentDirectory(env.DB).list(delegation.ownerUserId)).find((agent) =>
    agent.origin === delegation.targetOrigin && agent.agentName === delegation.targetAgentName &&
    agent.agentVersion === delegation.targetAgentVersion);
  if (!stored) throw new Error('A2A_AGENT_NOT_CONNECTED');
  const client = createA2AClient({
    allowedOrigins: [delegation.targetOrigin],
    fetch: fetcher,
    timeoutMs: 15_000,
    priceQuoteExtensionUri: env.A2A_PRICE_QUOTE_EXTENSION_URI,
    packageRuntimeExtensionUri: env.SKY_PACKAGE_RUNTIME_EXTENSION_URI,
  });
  const card = await client.discoverAtOrigin(delegation.targetOrigin);
  if (card.name !== stored.agentName || card.version !== stored.agentVersion ||
      await a2aAgentCardSha256(card) !== stored.cardSha256)
    throw new Error('A2A_AGENT_CARD_CHANGED');
  return { card, client };
}

async function reconcileOne(env: RuntimeEnv, listed: A2ADelegation, fetcher: typeof fetch, now: number) {
  if (!listed.remoteTaskId) return 'skipped' as const;
  const store = a2aDelegationStore(env.DB);
  try {
    const { card, client } = await reconciliationCard(env, listed, fetcher);
    if (listed.state === 'cancel_requested') {
      const cancelling = await store.beginCancelAttempt(
        listed.ownerUserId,
        listed.id,
        listed.revision,
        now,
      );
      if (!cancelling) return 'skipped' as const;
      try {
        const task = await client.cancelTask(card, listed.remoteTaskId);
        const updated = await store.confirmCancelResult(
          cancelling.ownerUserId,
          cancelling.id,
          cancelling.revision,
          task.status.state,
          now,
        );
        if (updated && terminalStates.has(task.status.state))
          await captureTask(env, updated, task, now);
        return 'cancelled' as const;
      } catch {
        await store.markCancelUnconfirmed(
          cancelling.ownerUserId,
          cancelling.id,
          cancelling.revision,
          now,
        );
        return 'unconfirmed' as const;
      }
    }
    const task = await client.getTask(card, listed.remoteTaskId);
    let current = listed;
    if (!['remote_completed', 'remote_failed', 'remote_cancelled', 'remote_rejected'].includes(listed.state)) {
      const reconciled = await store.reconcileRemoteTask(
        listed.ownerUserId,
        listed.id,
        listed.revision,
        { id: task.id, contextId: task.contextId, state: task.status.state },
        now,
      );
      if (reconciled) current = reconciled;
    }
    if (terminalStates.has(task.status.state)) await captureTask(env, current, task, now);
    return 'reconciled' as const;
  } catch (error) {
    if (error instanceof A2ADelegationStoreError && error.code === 'delegation_revision_conflict')
      return 'skipped' as const;
    return 'unconfirmed' as const;
  }
}

export async function runA2AAgentRuntime(env: RuntimeEnv, options: RuntimeOptions = {}) {
  if (!a2aDelegationExecutionEnabled(env.A2A_DELEGATION_EXECUTION_ENABLED))
    return { enabled: false, dispatched: 0, reconciled: 0, unfinished: 0 };
  if (!env.DB || !env.A2A_INPUT_ENCRYPTION_KEY || !env.A2A_TRUSTED_BROKER_KEYS ||
      !env.A2A_TRUSTED_USAGE_KEYS || !env.A2A_EGRESS_ALLOWED_ORIGINS)
    throw new Error('A2A_RUNTIME_CONFIGURATION_INCOMPLETE');
  const store = a2aDelegationStore(env.DB);
  const fetcher = options.fetcher ?? fetch;
  const now = options.now?.() ?? Date.now();
  const limit = safeLimit(options.limit);
  await Promise.all([
    store.expireOverdueBeforeDispatch(now, limit),
    store.purgeExpiredInputs(now),
  ]);
  let dispatched = 0;
  for (const delegation of await store.listPrepared(limit)) {
    const result = await dispatchOne(env, delegation, fetcher, now);
    if (result === 'dispatched') dispatched += 1;
  }
  let reconciled = 0;
  let unfinished = 0;
  for (const delegation of await store.listForReconciliation(limit)) {
    const result = await reconcileOne(env, delegation, fetcher, now);
    if (result === 'reconciled' || result === 'cancelled') reconciled += 1;
    else if (result === 'unconfirmed') unfinished += 1;
  }
  return { enabled: true, dispatched, reconciled, unfinished };
}

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health')
      return Response.json({ service: 'rockstar-sky-agent-runtime', status: 'ok' }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    return new Response('Not found', { status: 404 });
  },
  async scheduled(_controller: ScheduledController, env: RuntimeEnv, context: ExecutionContext) {
    context.waitUntil(runA2AAgentRuntime(env));
  },
};
