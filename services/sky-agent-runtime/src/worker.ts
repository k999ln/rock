import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { decryptRemoteAiTextInput } from '../../../lib/remote-ai-text-input';
import { RemoteAiTextStore } from '../../../lib/remote-ai-text-store';
import { executeReservedRemoteAiText } from '../../../lib/remote-ai-text-execution';
import { loadVerifiedRemoteAiTextRate } from '../../../lib/remote-ai-text-rate';
import { remoteAiPricingGateAccepted, remoteAiTextExecutionAvailable } from '../../../lib/remote-ai-pricing-gate';
import {
  a2aDelegationStore,
  A2ADelegationStoreError,
  type A2ADelegation,
} from '../../../lib/a2a-delegation-store';
import {
  a2aDelegationExecutionEnabled,
  a2aEgressOriginAllowed,
} from '../../../lib/a2a-authorization';
import { a2aAgentCardSha256, a2aAgentDirectory } from '../../../lib/a2a-agent-directory';
import {
  createA2AClient,
  parseA2AAgentCard,
  type A2AAgentCard,
  type A2APackageRuntimeInvocation,
  type A2ATask,
  type A2ATaskState,
} from '../../../lib/a2a-client';
import {
  decryptA2AInput,
  encryptA2AArtifact,
  type EncryptedA2AInput,
} from '../../../lib/a2a-input-crypto';
import { normalizeA2AArtifacts } from '../../../lib/a2a-artifacts';
import {
  verifyStoredA2ABrokerAuthorization,
} from '../../../lib/a2a-broker-authorization';
import { a2aBrokerDeviceKeyResolver } from '../../../lib/a2a-broker-trust';
import { trustedA2AUsageKeyResolver, verifyA2AUsageReceipt } from '../../../lib/a2a-usage-receipt';
import { a2aPriceQuoteDigest, verifyA2APriceQuote } from '../../../lib/a2a-price-quote';
import { verifySkyPackageRuntimeBindingForDispatch } from '../../../lib/sky-package-runtime-binding-dispatch';
import { parseStoredSkyPackageRuntimeBinding, SkyPackageRuntimeBindingStore } from '../../../lib/sky-package-runtime-binding-store';
import { skyToolPackageStore } from '../../../lib/sky-tool-package-store';
import { reconcileKnownEsimProviderOrders } from '../../../lib/esim-reconciliation-worker';
import { rockstarEntitlementStore } from '../../../lib/rockstar-entitlement-claim';

type DelegationParams = {
  ownerUserId: string;
  delegationId: string;
  operation?: 'dispatch' | 'reconcile';
};
type RemoteAiTextParams = { ownerUserId: string; executionId: string };
type AgentCardSnapshot = {
  name: string;
  description: string;
  version: string;
  cardSha256: string;
  capabilities?: {
    streaming?: boolean;
    pushNotifications?: boolean;
    extensions?: Array<{
      uri: string;
      description?: string;
      required?: boolean;
    }>;
  };
  supportedInterfaces: Array<{
    url: string;
    protocolBinding: string;
    protocolVersion: string;
  }>;
};
type TaskSnapshot = {
  id: string;
  contextId?: string;
  state: A2ATaskState;
  usageReceipt?: string;
};

function a2aFetchFor(env: Env): typeof fetch {
  // This optional service binding is supplied only by the local positive
  // integration test. Production uses the Workers global fetch with the same
  // HTTPS origin and Broker-proof checks enforced by A2AClient.
  const testOutbound = (env as Env & { A2A_TEST_OUTBOUND?: Fetcher }).A2A_TEST_OUTBOUND;
  if (
    !testOutbound &&
    (env as Env & { A2A_TEST_OUTBOUND_REQUIRED?: string }).A2A_TEST_OUTBOUND_REQUIRED === 'true'
  )
    throw new Error('The local A2A test outbound service binding is unavailable.');
  return testOutbound ? testOutbound.fetch.bind(testOutbound) : fetch;
}

const terminalRemoteStates = new Set<A2ATaskState>([
  'TASK_STATE_COMPLETED',
  'TASK_STATE_FAILED',
  'TASK_STATE_CANCELED',
  'TASK_STATE_REJECTED',
]);

async function captureTaskArtifacts(
  env: Env,
  store: ReturnType<typeof a2aDelegationStore>,
  ownerUserId: string,
  delegationId: string,
  task: A2ATask,
) {
  const current = await store.get(ownerUserId, delegationId);
  if (!current || current.remoteTaskId !== task.id)
    throw new NonRetryableError('Artifact task identity does not match delegation.');
  const document = normalizeA2AArtifacts(task.artifacts);
  if (document) {
    if (!env.A2A_INPUT_ENCRYPTION_KEY)
      throw new Error('A2A artifact encryption key is unavailable.');
    const serialized = JSON.stringify(document);
    const encrypted = await encryptA2AArtifact(
      serialized,
      env.A2A_INPUT_ENCRYPTION_KEY,
      ownerUserId,
      delegationId,
      task.id,
    );
    await store.saveArtifact(
      ownerUserId,
      delegationId,
      task.id,
      encrypted,
      new TextEncoder().encode(serialized).byteLength,
    );
  }
  if (terminalRemoteStates.has(task.status.state)) {
    const latest = await store.get(ownerUserId, delegationId);
    if (!latest) throw new Error('Delegation disappeared during artifact capture.');
    if (!latest.artifactsCaptured)
      await store.markArtifactsCaptured(
        ownerUserId,
        delegationId,
        task.id,
        latest.revision,
      );
  }
}

interface Env {
  DB: D1Database;
  A2A_INPUT_ENCRYPTION_KEY?: string;
  A2A_DELEGATION_EXECUTION_ENABLED?: string;
  ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string;
  A2A_EGRESS_ALLOWED_ORIGINS?: string;
  A2A_TRUSTED_BROKER_KEYS?: string;
  A2A_TRUSTED_USAGE_KEYS?: string;
  A2A_PRICE_QUOTES_REQUIRED?: string;
  SKY_PACKAGE_RUNTIME_BINDING_TRUSTED_KEYS?: string;
  SKY_PACKAGE_RUNTIME_EXTENSION_URI?: string;
  ESIMGO_API_KEY?: string;
  ESIMGO_PROFILE_HASH_SECRET?: string;
  ESIMGO_INSTALL_MATERIAL_KEY?: string;
  A2A_DELEGATION_WORKFLOW: Workflow<DelegationParams>;
  REMOTE_AI_TEXT_WORKFLOW: Workflow<RemoteAiTextParams>;
  REMOTE_AI_TEXT_INPUT_ENCRYPTION_KEY?: string;
  REMOTE_AI_TRUSTED_RATE_KEYS?: string;
  SKY_REMOTE_LLM_ENABLED?: string;
  OPENAI_API_KEY?: string;
}

function validRemoteAiTextParams(value: unknown): value is RemoteAiTextParams {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.ownerUserId === 'string' && candidate.ownerUserId.length > 0 &&
    candidate.ownerUserId.length <= 128 && typeof candidate.executionId === 'string' &&
    /^[A-Za-z0-9._:-]{1,128}$/.test(candidate.executionId);
}

async function cancelUnsentRemoteAiText(
  store: RemoteAiTextStore,
  ownerUserId: string,
  executionId: string,
  approvalDigest: string,
) {
  try {
    const row = await store.cancelBeforeSend(ownerUserId, executionId, approvalDigest);
    await store.deleteInputAfterTerminal(ownerUserId, executionId);
    return row?.state === 'cancelled';
  } catch { return false; }
}

/** Runs only previously approved, reserved requests with encrypted prompt material. */
export class RemoteAiTextWorkflow extends WorkflowEntrypoint<Env, RemoteAiTextParams> {
  async run(event: WorkflowEvent<RemoteAiTextParams>, step: WorkflowStep) {
    if (!validRemoteAiTextParams(event.payload))
      throw new NonRetryableError('Remote LLM workflow payload is invalid.');
    const { ownerUserId, executionId } = event.payload;
    const store = new RemoteAiTextStore(this.env.DB);
    if (!remoteAiPricingGateAccepted() || !remoteAiTextExecutionAvailable(this.env))
      return { outcome: 'execution_disabled' };
    const record = await store.get(ownerUserId, executionId);
    if (!record || record.state !== 'reserved')
      return { outcome: 'not_dispatchable' };
    if (this.env.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED === 'true' &&
      !(await rockstarEntitlementStore(this.env.DB).hasActiveScope(ownerUserId, 'rockstaros_access'))) {
      await cancelUnsentRemoteAiText(store, ownerUserId, executionId, record.approvalDigest);
      return { outcome: 'service_entitlement_required' };
    }
    const encrypted = await store.getInput(ownerUserId, executionId);
    if (!encrypted || encrypted.expiresAt <= Date.now() || !this.env.REMOTE_AI_TEXT_INPUT_ENCRYPTION_KEY)
      return { outcome: 'encrypted_input_unavailable' };
    let intent;
    try {
      intent = await step.do('decrypt-and-validate-approved-input', async () => {
        const current = await store.get(ownerUserId, executionId);
        if (!current || current.state !== 'reserved' || current.approvalDigest !== record.approvalDigest)
          return null;
        const input = await decryptRemoteAiTextInput(encrypted, this.env.REMOTE_AI_TEXT_INPUT_ENCRYPTION_KEY!, ownerUserId, executionId);
        if (input.requestId !== current.requestId || input.maximumBudgetMinor !== current.quote.approvedCapMinor ||
          input.model !== current.quote.ceiling.modelId) return null;
        return input;
      });
    } catch {
      await cancelUnsentRemoteAiText(store, ownerUserId, executionId, record.approvalDigest);
      return { outcome: 'approved-input-unavailable' };
    }
    if (!intent) {
      await cancelUnsentRemoteAiText(store, ownerUserId, executionId, record.approvalDigest);
      return { outcome: 'approved-input-mismatch' };
    }
    let verified;
    try {
      verified = await loadVerifiedRemoteAiTextRate(
        this.env.DB, this.env.REMOTE_AI_TRUSTED_RATE_KEYS, intent.model, record.quote.ceiling.currency,
      );
    } catch {
      await cancelUnsentRemoteAiText(store, ownerUserId, executionId, record.approvalDigest);
      return { outcome: 'signed-rate-card-unavailable' };
    }
    let result;
    try {
      result = await step.do('send-approved-remote-llm-once',
        { retries: { limit: 1, delay: '1 second' }, timeout: '5 minutes' },
        async () => executeReservedRemoteAiText({
          store, ownerId: ownerUserId, id: executionId, approvalDigest: record.approvalDigest,
          intent, verified, runtimeEnv: this.env,
          onOutputProgress: async ({ outputBytes, observedAt }) => {
            await store.updateLiveEstimate(ownerUserId, executionId, outputBytes, observedAt);
          },
        }).then(({ record: current, providerSubmission }) => ({ state: current?.state ?? 'missing', providerSubmission })),
      );
    } catch {
      const current = await store.get(ownerUserId, executionId);
      if (current?.state === 'reserved')
        await cancelUnsentRemoteAiText(store, ownerUserId, executionId, record.approvalDigest);
      else if (current?.state === 'sending')
        await store.markUnreconciled(ownerUserId, executionId, 'WORKFLOW_DISPATCH_INTERRUPTED');
      else if (current?.state === 'unreconciled')
        await store.deleteInputAfterTerminal(ownerUserId, executionId);
      return { outcome: current?.state === 'sending' ? 'usage_or_result_reconciliation_required' : 'dispatch_preflight_failed' };
    }
    if (result.state === 'completed' || result.state === 'unreconciled')
      await store.deleteInputAfterTerminal(ownerUserId, executionId);
    return { outcome: result.state, providerSubmission: result.providerSubmission };
  }
}

function providerUsageReceipt(task: A2ATask) {
  const metadata = task.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const value = (metadata as Record<string, unknown>)['org.rockstar.usageReceipt'];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  try {
    const serialized = JSON.stringify(value);
    return serialized.length <= 24_000 ? serialized : undefined;
  } catch { return undefined; }
}

async function settleProviderUsage(
  env: Env,
  store: ReturnType<typeof a2aDelegationStore>,
  ownerUserId: string,
  delegationId: string,
  taskId: string,
  serializedReceipt: string | undefined,
) {
  if (serializedReceipt === undefined) return 'missing';
  const current = await store.get(ownerUserId, delegationId);
  if (!current || current.remoteTaskId !== taskId ||
    !['remote_completed', 'remote_failed', 'remote_cancelled', 'remote_rejected'].includes(current.state))
    return 'not_terminal';
  let value: unknown;
  try { value = JSON.parse(serializedReceipt); } catch { return 'rejected'; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'rejected';
  const receipt = value as { amountMinor?: number; issuedAt?: number };
  const valid = await verifyA2AUsageReceipt(value, {
    ownerUserId,
    parentJobId: current.parentJobId,
    delegationId,
    taskId,
    agentOrigin: current.targetOrigin,
    agentName: current.targetAgentName,
    agentVersion: current.targetAgentVersion,
    currency: current.budgetCurrency,
    amountMinor: receipt?.amountMinor as number,
    issuedAt: receipt?.issuedAt as number,
    delegationCreatedAt: current.createdAt,
    delegationLimitMinor: current.budgetLimitMinor,
  }, trustedA2AUsageKeyResolver(env.A2A_TRUSTED_USAGE_KEYS));
  if (!valid) return 'rejected';
  await store.settleUsageReceipt(ownerUserId, delegationId, value as import('../../../lib/a2a-usage-receipt').A2AUsageReceipt);
  return 'settled';
}

async function verifyNativeApproval(
  env: Env,
  store: ReturnType<typeof a2aDelegationStore>,
  ownerUserId: string,
  delegationId: string,
  delegation: A2ADelegation,
  message: string,
  clientIntent?: {
    messageId: string;
    targetOrigin: string;
    targetAgentName: string;
    agentVersion: string;
    inputSha256: string;
    protocolVersion: string;
  },
  expectedLiveAgentCardSha256?: string,
) {
  if (delegation.continueWhileDeviceOffline !== true) return false;
  if (env.A2A_PRICE_QUOTES_REQUIRED === 'true' && !delegation.priceQuoteDigest) return false;
  if (delegation.priceQuoteDigest) {
    const quote = delegation.priceQuote;
    if (!quote || !env.A2A_TRUSTED_USAGE_KEYS ||
      quote.maxAmountMinor !== delegation.budgetLimitMinor ||
      quote.currency !== delegation.budgetCurrency ||
      await a2aPriceQuoteDigest(quote) !== delegation.priceQuoteDigest ||
      !(await verifyA2APriceQuote(quote, {
        agentOrigin: delegation.targetOrigin,
        agentName: delegation.targetAgentName,
        agentVersion: delegation.targetAgentVersion,
        requestSha256: delegation.inputSha256,
        currency: delegation.budgetCurrency,
        maximumBudgetMinor: delegation.budgetLimitMinor,
      }, trustedA2AUsageKeyResolver(env.A2A_TRUSTED_USAGE_KEYS)))) return false;
  }
  if (delegation.packageRuntimeBindingId || delegation.packageRuntimeBindingDigest) {
    const bindingStore = new SkyPackageRuntimeBindingStore(env.DB);
    const bindingRow = delegation.packageRuntimeBindingId
      ? await bindingStore.get(delegation.packageRuntimeBindingId)
      : null;
    const [agent, currentPackage] = await Promise.all([
      a2aAgentDirectory(env.DB).list(ownerUserId).then((agents) => agents.find((candidate) =>
        candidate.origin === delegation.targetOrigin &&
        candidate.agentName === delegation.targetAgentName &&
        candidate.agentVersion === delegation.targetAgentVersion) ?? null),
      bindingRow?.status === 'active'
        ? skyToolPackageStore(env.DB).verifiedRegistryPackage(bindingRow.packageKey, bindingRow.manifestSha256)
        : Promise.resolve(null),
    ]);
    if (!(await verifySkyPackageRuntimeBindingForDispatch({
      bindingRow,
      bindingId: delegation.packageRuntimeBindingId,
      bindingDigest: delegation.packageRuntimeBindingDigest,
      agent,
      package: currentPackage,
      priceQuote: delegation.priceQuote,
      trustedKeys: env.SKY_PACKAGE_RUNTIME_BINDING_TRUSTED_KEYS,
      runtimeExtensionUri: env.SKY_PACKAGE_RUNTIME_EXTENSION_URI,
      expectedLiveAgentCardSha256,
    }))) return false;
  }
  const [budget, reservation] = await Promise.all([
    store.getBudget(ownerUserId, delegation.parentJobId),
    store.getBudgetReservation(ownerUserId, delegationId),
  ]);
  if (
    !budget ||
    !reservation ||
    reservation.state !== 'held' ||
    budget.currency !== delegation.budgetCurrency ||
    budget.budgetLimitMinor !== delegation.parentBudgetLimitMinor ||
    reservation.parentJobId !== delegation.parentJobId ||
    reservation.currency !== delegation.budgetCurrency ||
    reservation.reservedMinor !== delegation.budgetLimitMinor ||
    budget.reservedMinor + budget.settledMinor > budget.budgetLimitMinor
  )
    return false;
  const storedProof = await store.getBrokerAuthorization(ownerUserId, delegationId);
  if (
    clientIntent &&
    (clientIntent.messageId !== delegation.messageId ||
      clientIntent.targetOrigin !== delegation.targetOrigin ||
      clientIntent.targetAgentName !== delegation.targetAgentName ||
      clientIntent.agentVersion !== delegation.targetAgentVersion ||
      clientIntent.inputSha256 !== delegation.inputSha256 ||
      clientIntent.protocolVersion !== delegation.protocolVersion)
  )
    return false;
  return verifyStoredA2ABrokerAuthorization(
    storedProof,
    {
      id: delegation.id,
      ownerUserId,
      deviceRef: storedProof?.deviceRef ?? '',
      parentJobId: delegation.parentJobId,
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
      priceQuoteDigest: delegation.priceQuoteDigest || undefined,
      packageRuntimeBindingDigest: delegation.packageRuntimeBindingDigest || undefined,
      message,
    },
    a2aBrokerDeviceKeyResolver(env.DB, env.A2A_TRUSTED_BROKER_KEYS),
  );
}

function validParams(value: unknown): value is DelegationParams {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.ownerUserId === 'string' &&
    candidate.ownerUserId.length > 0 &&
    candidate.ownerUserId.length <= 256 &&
    typeof candidate.delegationId === 'string' &&
    /^[0-9a-f-]{36}$/i.test(candidate.delegationId) &&
    (candidate.operation === undefined ||
      candidate.operation === 'dispatch' ||
      candidate.operation === 'reconcile')
  );
}

export class A2ADelegationWorkflow extends WorkflowEntrypoint<Env, DelegationParams> {
  async run(event: WorkflowEvent<DelegationParams>, step: WorkflowStep) {
    if (!validParams(event.payload))
      throw new NonRetryableError('A2A delegation workflow payload is invalid.');

    const { ownerUserId, delegationId } = event.payload;
    const store = a2aDelegationStore(this.env.DB);
    if (event.payload.operation === 'reconcile')
      return this.reconcile(ownerUserId, delegationId, step);
    if (!a2aDelegationExecutionEnabled(this.env.A2A_DELEGATION_EXECUTION_ENABLED))
      return { outcome: 'execution_disabled' };
    if (this.env.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED === 'true' &&
      !(await rockstarEntitlementStore(this.env.DB).hasActiveScope(ownerUserId, 'agents')))
      return { outcome: 'service_entitlement_required' };
    const initial = await store.get(ownerUserId, delegationId);
    if (
      !initial ||
      !a2aEgressOriginAllowed(
        initial.targetOrigin,
        this.env.A2A_EGRESS_ALLOWED_ORIGINS,
      )
    ) {
      if (initial?.state === 'dispatching')
        await store.markPreflightFailed(
          ownerUserId,
          delegationId,
          initial.revision,
        );
      return { outcome: 'egress_origin_not_allowed' };
    }
    if (!initial.priceQuoteDigest || !initial.priceQuote)
      return { outcome: 'price_quote_required' };
    const claimed = await step.do('claim-approved-delegation', async () => {
      const current = await store.get(ownerUserId, delegationId);
      if (!current) return null;
      // A Workflow retry may repeat this callback after D1 committed the claim
      // but before the step result was durably recorded. `dispatching` proves
      // the external-send marker has not yet been committed, so resume safely.
      if (current.state === 'dispatching')
        return { id: current.id, revision: current.revision, state: current.state };
      if (current.state !== 'prepared') return null;
      const value = await store.claimDispatch(ownerUserId, delegationId);
      return value
        ? { id: value.id, revision: value.revision, state: value.state }
        : null;
    });
    if (!claimed) return { outcome: 'not_dispatchable' };

    // Do not fetch even the remote Agent Card until a fresh native Broker
    // approval has been verified. Card discovery is also an external request.
    const brokerAuthorized = await step.do(
      'verify-native-broker-authorization-before-egress',
      async () => {
        const current = await store.get(ownerUserId, delegationId);
        if (
          !current ||
          current.state !== 'dispatching' ||
          current.revision !== claimed.revision ||
          current.deadlineAt <= Date.now() ||
          !this.env.A2A_INPUT_ENCRYPTION_KEY
        )
          return false;
        const stored = await store.getInput(ownerUserId, delegationId);
        if (
          !stored ||
          stored.expiresAt <= Date.now() ||
          stored.inputSha256 !== current.inputSha256 ||
          stored.keyVersion !== 'aes-256-gcm-v1'
        )
          return false;
        try {
          const message = await decryptA2AInput(
            {
              ciphertext: stored.ciphertext,
              nonce: stored.nonce,
              inputSha256: stored.inputSha256,
              keyVersion: 'aes-256-gcm-v1',
            },
            this.env.A2A_INPUT_ENCRYPTION_KEY,
            ownerUserId,
            delegationId,
          );
          return verifyNativeApproval(
            this.env,
            store,
            ownerUserId,
            delegationId,
            current,
            message,
          );
        } catch {
          return false;
        }
      },
    );
    if (!brokerAuthorized) {
      const current = await store.get(ownerUserId, delegationId);
      if (current?.state === 'dispatching')
        await store.markPreflightFailed(ownerUserId, delegationId, current.revision);
      return { outcome: 'broker_authorization_rejected_before_egress' };
    }

    let card: A2AAgentCard;
    let cardSnapshot: AgentCardSnapshot;
    try {
      const cardValue = await step.do(
        'discover-approved-agent',
        {
          retries: { limit: 2, delay: '15 seconds', backoff: 'exponential' },
          timeout: '30 seconds',
        },
        async () => {
          const current = await store.get(ownerUserId, delegationId);
          if (
            !current ||
            current.state !== 'dispatching' ||
            current.revision !== claimed.revision ||
            current.deadlineAt <= Date.now() ||
            !this.env.A2A_INPUT_ENCRYPTION_KEY
          )
            throw new NonRetryableError('Delegation is no longer dispatchable.');
          const approvedInput = await store.getInput(ownerUserId, delegationId);
          if (
            !approvedInput ||
            approvedInput.expiresAt <= Date.now() ||
            approvedInput.inputSha256 !== current.inputSha256 ||
            approvedInput.keyVersion !== 'aes-256-gcm-v1'
          )
            throw new NonRetryableError('Approved input is unavailable before discovery.');
          let approvedMessage: string;
          try {
            approvedMessage = await decryptA2AInput(
              {
                ciphertext: approvedInput.ciphertext,
                nonce: approvedInput.nonce,
                inputSha256: approvedInput.inputSha256,
                keyVersion: 'aes-256-gcm-v1',
              },
              this.env.A2A_INPUT_ENCRYPTION_KEY,
              ownerUserId,
              delegationId,
            );
          } catch {
            throw new NonRetryableError('Approved input could not be decrypted before discovery.');
          }
          if (!(await verifyNativeApproval(
            this.env,
            store,
            ownerUserId,
            delegationId,
            current,
            approvedMessage,
          )))
            throw new NonRetryableError('Broker proof expired or was revoked before discovery.');
          const client = createA2AClient({
            allowedOrigins: [current.targetOrigin],
            packageRuntimeExtensionUri: this.env.SKY_PACKAGE_RUNTIME_EXTENSION_URI,
            fetch: a2aFetchFor(this.env),
          });
          const discovered = await client.discoverAtOrigin(current.targetOrigin);
          if (
            discovered.name !== current.targetAgentName ||
            discovered.version !== current.targetAgentVersion
          )
            throw new NonRetryableError('The approved agent identity changed.');
          const snapshot: AgentCardSnapshot = {
            name: discovered.name,
            description: discovered.description,
            version: discovered.version,
            cardSha256: await a2aAgentCardSha256(discovered),
            ...(discovered.capabilities ? {
              capabilities: {
                ...(discovered.capabilities.streaming !== undefined
                  ? { streaming: discovered.capabilities.streaming } : {}),
                ...(discovered.capabilities.pushNotifications !== undefined
                  ? { pushNotifications: discovered.capabilities.pushNotifications } : {}),
                ...(discovered.capabilities.extensions ? {
                  extensions: discovered.capabilities.extensions.map(({ uri, description, required }) => ({
                    uri,
                    ...(description !== undefined ? { description } : {}),
                    ...(required !== undefined ? { required } : {}),
                  })),
                } : {}),
              },
            } : {}),
            supportedInterfaces: discovered.supportedInterfaces.map(
              ({ url, protocolBinding, protocolVersion }) => ({
                url,
                protocolBinding,
                protocolVersion,
              }),
            ),
          };
          return snapshot;
        },
      );
      cardSnapshot = cardValue as AgentCardSnapshot;
      card = parseA2AAgentCard(
        cardValue,
        this.env.SKY_PACKAGE_RUNTIME_EXTENSION_URI
          ? [this.env.SKY_PACKAGE_RUNTIME_EXTENSION_URI]
          : [],
      );
    } catch (error) {
      const current = await store.get(ownerUserId, delegationId);
      if (current?.state === 'dispatching')
        await store.markPreflightFailed(
          ownerUserId,
          delegationId,
          current.revision,
        );
      throw error;
    }

    return step.do(
      'submit-approved-message-once',
      { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' } },
      async () => {
        const current = await store.get(ownerUserId, delegationId);
        if (!current)
          throw new NonRetryableError('Delegation no longer exists.');
        if (current.state === 'dispatch_submitting') {
          await store.markIndeterminate(
            ownerUserId,
            delegationId,
            current.revision,
          );
          throw new NonRetryableError(
            'A prior send attempt is uncertain; automatic resend is forbidden.',
          );
        }
        if (current.state !== 'dispatching')
          return { outcome: 'state_already_advanced', state: current.state };
        if (current.revision !== claimed.revision || current.deadlineAt <= Date.now())
          throw new NonRetryableError('Delegation is no longer dispatchable.');
        if (!this.env.A2A_INPUT_ENCRYPTION_KEY) {
          await store.markPreflightFailed(
            ownerUserId,
            delegationId,
            current.revision,
          );
          throw new NonRetryableError('A2A input encryption key is unavailable.');
        }

        const stored = await store.getInput(ownerUserId, delegationId);
        if (
          !stored ||
          stored.expiresAt <= Date.now() ||
          stored.inputSha256 !== current.inputSha256 ||
          stored.keyVersion !== 'aes-256-gcm-v1'
        ) {
          await store.markPreflightFailed(
            ownerUserId,
            delegationId,
            current.revision,
          );
          throw new NonRetryableError('Approved input is unavailable.');
        }

        let message: string;
        const encrypted: EncryptedA2AInput = {
          ciphertext: stored.ciphertext,
          nonce: stored.nonce,
          inputSha256: stored.inputSha256,
          keyVersion: 'aes-256-gcm-v1',
        };
        try {
          message = await decryptA2AInput(
            encrypted,
            this.env.A2A_INPUT_ENCRYPTION_KEY,
            ownerUserId,
            delegationId,
          );
        } catch {
          await store.markPreflightFailed(
            ownerUserId,
            delegationId,
            current.revision,
          );
          throw new NonRetryableError('Approved input could not be decrypted.');
        }

        if (!(await verifyNativeApproval(
          this.env,
          store,
          ownerUserId,
          delegationId,
          current,
          message,
          undefined,
          cardSnapshot.cardSha256,
        ))) {
          await store.markPreflightFailed(ownerUserId, delegationId, current.revision);
          throw new NonRetryableError('A fresh trusted RockstarOS Broker proof is required.');
        }

        const sending = await store.beginRemoteSend(
          ownerUserId,
          delegationId,
          current.revision,
        );
        if (!sending)
          throw new NonRetryableError('A remote send was already claimed.');

        try {
          const client = createA2AClient({
            allowedOrigins: [current.targetOrigin],
            packageRuntimeExtensionUri: this.env.SKY_PACKAGE_RUNTIME_EXTENSION_URI,
            fetch: a2aFetchFor(this.env),
            authorizeDelegation: async (intent) => {
              const latest = await store.get(ownerUserId, delegationId);
              if (
                !latest ||
                latest.state !== 'dispatch_submitting' ||
                latest.deadlineAt <= Date.now() ||
                !(await verifyNativeApproval(
                  this.env,
                  store,
                  ownerUserId,
                  delegationId,
                  latest,
                  message,
                  intent,
                  cardSnapshot.cardSha256,
                ))
              )
                throw new Error('PERSISTED_APPROVAL_MISMATCH');
            },
          });
          let packageRuntimeInvocation: A2APackageRuntimeInvocation | undefined;
          if (current.packageRuntimeBindingId && current.packageRuntimeBindingDigest) {
            const row = await new SkyPackageRuntimeBindingStore(this.env.DB).get(current.packageRuntimeBindingId);
            const binding = row?.status === 'active' && row.digest === current.packageRuntimeBindingDigest
              ? parseStoredSkyPackageRuntimeBinding(row) : null;
            if (!row || !binding || binding.runtimeExtensionUri !== this.env.SKY_PACKAGE_RUNTIME_EXTENSION_URI)
              throw new NonRetryableError('The approved Package runtime binding is no longer available.');
            packageRuntimeInvocation = {
              runtimeExtensionUri: binding.runtimeExtensionUri,
              bindingId: binding.bindingId,
              bindingDigest: row.digest,
              packageKey: binding.packageKey,
              manifestSha256: binding.manifestSha256,
              operationId: binding.operationId,
              inputSchemaSha256: binding.inputSchemaSha256,
              outputSchemaSha256: binding.outputSchemaSha256,
              pricingVersion: binding.pricingVersion,
            };
          }
          const outcome = await client.sendMessage(
            card,
            current.messageId,
            message,
            packageRuntimeInvocation,
          );
          if (outcome.kind !== 'task') {
            const latest = await store.get(ownerUserId, delegationId);
            if (latest?.state === 'dispatch_submitting')
              await store.markIndeterminate(
                ownerUserId,
                delegationId,
                latest.revision,
              );
            return { outcome: 'indeterminate', reason: 'remote_message_without_task' };
          }
          const latest = await store.get(ownerUserId, delegationId);
          if (!latest || latest.state !== 'dispatch_submitting')
            return { outcome: 'indeterminate', reason: 'state_changed_after_send' };
          const received = await store.recordTaskReceipt(
            ownerUserId,
            delegationId,
            latest.revision,
            {
              id: outcome.task.id,
              contextId: outcome.task.contextId,
              state: outcome.task.status.state,
            },
          );
          if (
            received &&
            ['remote_cancelled', 'remote_completed', 'remote_failed', 'remote_rejected'].includes(
              received.state,
            )
          )
            await store.deleteInput(ownerUserId, delegationId);
          await captureTaskArtifacts(
            this.env,
            store,
            ownerUserId,
            delegationId,
            outcome.task,
          );
          const usageOutcome = await settleProviderUsage(
            this.env,
            store,
            ownerUserId,
            delegationId,
            outcome.task.id,
            providerUsageReceipt(outcome.task),
          );
          return {
            outcome: 'task_received',
            state: received?.state ?? 'indeterminate',
            usageOutcome,
          };
        } catch (error) {
          const latest = await store.get(ownerUserId, delegationId);
          if (latest?.state === 'dispatch_submitting') {
            await store.markIndeterminate(
              ownerUserId,
              delegationId,
              latest.revision,
            );
          } else if (latest?.state === 'dispatching') {
            await store.markPreflightFailed(
              ownerUserId,
              delegationId,
              latest.revision,
            );
          }
          throw new NonRetryableError(
            error instanceof Error ? error.message : 'A2A submission failed.',
          );
        }
      },
    );
  }

  private async reconcile(
    ownerUserId: string,
    delegationId: string,
    step: WorkflowStep,
  ) {
    const store = a2aDelegationStore(this.env.DB);
    const current = await step.do('read-local-task-for-reconciliation', async () => {
      const value = await store.get(ownerUserId, delegationId);
      return value?.remoteTaskId ? value : null;
    });
    if (!current) return { outcome: 'no_remote_task' };
    if (current.state === 'cancel_submitting') {
      await store.markCancelUnconfirmed(ownerUserId, delegationId, current.revision);
      return { outcome: 'cancel_unconfirmed_after_retry' };
    }
    if (['remote_completed', 'remote_failed', 'remote_cancelled', 'remote_rejected'].includes(current.state))
      return { outcome: 'not_dispatchable' };
    if (
      !a2aEgressOriginAllowed(
        current.targetOrigin,
        this.env.A2A_EGRESS_ALLOWED_ORIGINS,
      )
    )
      return { outcome: 'egress_origin_not_allowed' };

    const cardValue = await step.do(
      'discover-agent-for-reconciliation',
      {
        retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' },
        timeout: '30 seconds',
      },
      async () => {
        const latest = await store.get(ownerUserId, delegationId);
        if (
          !latest ||
          !latest.remoteTaskId ||
          latest.targetOrigin !== current.targetOrigin
        )
          throw new NonRetryableError('Remote task is no longer reconcilable.');
        const client = createA2AClient({
          allowedOrigins: [latest.targetOrigin],
          packageRuntimeExtensionUri: this.env.SKY_PACKAGE_RUNTIME_EXTENSION_URI,
          fetch: a2aFetchFor(this.env),
        });
        const discovered = await client.discoverAtOrigin(latest.targetOrigin);
        if (
          discovered.name !== latest.targetAgentName ||
          discovered.version !== latest.targetAgentVersion
        )
          throw new NonRetryableError('The approved agent identity changed.');
        const snapshot: AgentCardSnapshot = {
          name: discovered.name,
          description: discovered.description,
          version: discovered.version,
          cardSha256: await a2aAgentCardSha256(discovered),
          ...(discovered.capabilities ? {
            capabilities: {
              ...(discovered.capabilities.streaming !== undefined
                ? { streaming: discovered.capabilities.streaming } : {}),
              ...(discovered.capabilities.pushNotifications !== undefined
                ? { pushNotifications: discovered.capabilities.pushNotifications } : {}),
              ...(discovered.capabilities.extensions ? {
                extensions: discovered.capabilities.extensions.map(({ uri, description, required }) => ({
                  uri,
                  ...(description !== undefined ? { description } : {}),
                  ...(required !== undefined ? { required } : {}),
                })),
              } : {}),
            },
          } : {}),
          supportedInterfaces: discovered.supportedInterfaces.map(
            ({ url, protocolBinding, protocolVersion }) => ({
              url,
              protocolBinding,
              protocolVersion,
            }),
          ),
        };
        return snapshot;
      },
    );
    const card = parseA2AAgentCard(cardValue,
      this.env.SKY_PACKAGE_RUNTIME_EXTENSION_URI ? [this.env.SKY_PACKAGE_RUNTIME_EXTENSION_URI] : []);
    const client = createA2AClient({
      allowedOrigins: [current.targetOrigin],
      packageRuntimeExtensionUri: this.env.SKY_PACKAGE_RUNTIME_EXTENSION_URI,
      fetch: a2aFetchFor(this.env),
    });

    if (current.state === 'cancel_requested') {
      try {
        const task = await step.do(
          'cancel-remote-task-once',
          { retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' } },
          async () => {
            const latest = await store.get(ownerUserId, delegationId);
            if (latest?.state === 'cancel_submitting') {
              await store.markCancelUnconfirmed(
                ownerUserId,
                delegationId,
                latest.revision,
              );
              throw new NonRetryableError(
                'A prior remote cancel attempt is uncertain; automatic retry is forbidden.',
              );
            }
            if (
              !latest ||
              latest.state !== 'cancel_requested' ||
              !latest.remoteTaskId
            )
              throw new NonRetryableError('Remote cancel is no longer authorized.');
            const claimedCancel = await store.beginCancelAttempt(
              ownerUserId,
              delegationId,
              latest.revision,
            );
            if (!claimedCancel)
              throw new NonRetryableError('Remote cancel was already claimed.');
            try {
            const task = await client.cancelTask(card, latest.remoteTaskId);
            await captureTaskArtifacts(
              this.env,
              store,
              ownerUserId,
              delegationId,
              task,
            );
            const snapshot: TaskSnapshot = {
              id: task.id,
              contextId: task.contextId,
              state: task.status.state,
              usageReceipt: providerUsageReceipt(task),
            };
              return snapshot;
            } catch {
              const after = await store.get(ownerUserId, delegationId);
              if (after?.state === 'cancel_submitting')
                await store.markCancelUnconfirmed(
                  ownerUserId,
                  delegationId,
                  after.revision,
                );
              throw new NonRetryableError(
                'Remote cancel outcome is uncertain; do not send it again automatically.',
              );
            }
          },
        );
        const latest = await store.get(ownerUserId, delegationId);
        if (!latest || latest.state !== 'cancel_submitting')
          return { outcome: 'cancel_state_changed' };
        const confirmed = await store.confirmCancelResult(
          ownerUserId,
          delegationId,
          latest.revision,
          task.state,
        );
        if (!confirmed) return { outcome: 'cancel_state_changed' };
        const usageOutcome = await settleProviderUsage(
          this.env, store, ownerUserId, delegationId, task.id, task.usageReceipt,
        );
        if (
          ['remote_cancelled', 'remote_completed', 'remote_failed', 'remote_rejected'].includes(
            confirmed.state,
          )
        )
          await store.deleteInput(ownerUserId, delegationId);
        return { outcome: 'cancel_response_received', state: confirmed.state, usageOutcome };
      } catch (error) {
        const latest = await store.get(ownerUserId, delegationId);
        if (latest?.state === 'cancel_submitting')
          await store.markCancelUnconfirmed(
            ownerUserId,
            delegationId,
            latest.revision,
          );
        throw error;
      }
    }

    const task = await step.do(
      'read-remote-task-status',
      {
        retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' },
        timeout: '30 seconds',
      },
      async () => {
        const latest = await store.get(ownerUserId, delegationId);
        if (!latest?.remoteTaskId)
          throw new NonRetryableError('Remote task ID is unavailable.');
        const task = await client.getTask(card, latest.remoteTaskId);
        await captureTaskArtifacts(
          this.env,
          store,
          ownerUserId,
          delegationId,
          task,
        );
        const snapshot: TaskSnapshot = {
          id: task.id,
          contextId: task.contextId,
          state: task.status.state,
          usageReceipt: providerUsageReceipt(task),
        };
        return snapshot;
      },
    );
    const latest = await store.get(ownerUserId, delegationId);
    if (!latest) return { outcome: 'delegation_missing' };
    const reconciled = await store.reconcileRemoteTask(
      ownerUserId,
      delegationId,
      latest.revision,
      {
        id: task.id,
        contextId: task.contextId,
        state: task.state,
      },
    );
    const usageOutcome = await settleProviderUsage(
      this.env, store, ownerUserId, delegationId, task.id, task.usageReceipt,
    );
    if (
      reconciled &&
      ['remote_cancelled', 'remote_completed', 'remote_failed', 'remote_rejected'].includes(
        reconciled.state,
      )
    )
      await store.deleteInput(ownerUserId, delegationId);
    return { outcome: 'task_reconciled', state: reconciled?.state, usageOutcome };
  }
}

async function startReadyDelegations(env: Env) {
  const textStore = new RemoteAiTextStore(env.DB);
  await textStore.expireAllBeforeSend(Date.now());
  if (remoteAiPricingGateAccepted() && remoteAiTextExecutionAvailable(env)) {
    const preparedText = await textStore.listPrepared(25, Date.now());
    for (const execution of preparedText) {
      const id = `llm-${execution.id}`;
      try {
        await env.REMOTE_AI_TEXT_WORKFLOW.create({
          id,
          params: { ownerUserId: execution.ownerUserId, executionId: execution.id },
        });
      } catch {
        // The D1 record and deterministic Workflow ID make repeated scans safe.
        await env.REMOTE_AI_TEXT_WORKFLOW.get(id).catch(() => undefined);
      }
    }
  }
  const store = a2aDelegationStore(env.DB);
  const scheduledAt = Date.now();
  await store.purgeExpiredInputs(scheduledAt);
  await store.expireOverdueBeforeDispatch(scheduledAt, 50);
  const overdueRemoteTasks = await store.listOverdueRemoteTasks(scheduledAt, 50);
  for (const delegation of overdueRemoteTasks) {
    try {
      // A deadline triggers a cancellation request. The task remains unresolved
      // until the Agent reports a terminal state and usage is reconciled.
      await store.requestCancel(delegation.ownerUserId, delegation.id, scheduledAt);
    } catch (error) {
      if (!(error instanceof A2ADelegationStoreError) ||
        error.code !== 'delegation_revision_conflict') throw error;
      // A concurrent completion/cancel owns the newer revision; the next scan
      // will reconcile whatever state the durable store now contains.
    }
  }
  if (
    a2aDelegationExecutionEnabled(env.A2A_DELEGATION_EXECUTION_ENABLED) &&
    env.A2A_INPUT_ENCRYPTION_KEY
  ) {
    const prepared = await store.listPrepared(50);
    for (const delegation of prepared) {
      if (env.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED === 'true' &&
        !(await rockstarEntitlementStore(env.DB).hasActiveScope(delegation.ownerUserId, 'agents')))
        continue;
      if (
        !a2aEgressOriginAllowed(
          delegation.targetOrigin,
          env.A2A_EGRESS_ALLOWED_ORIGINS,
        )
      )
        continue;
      const id = `a2a-${delegation.id}`;
      try {
        await env.A2A_DELEGATION_WORKFLOW.create({
          id,
          params: {
            ownerUserId: delegation.ownerUserId,
            delegationId: delegation.id,
            operation: 'dispatch',
          },
        });
      } catch (createError) {
        // Only treat a failed create as an idempotent duplicate when the
        // deterministic instance can actually be retrieved. Surface storage,
        // binding, and configuration failures so scheduled dispatch is not
        // silently reported as successful while work remains queued.
        try {
          await env.A2A_DELEGATION_WORKFLOW.get(id);
        } catch {
          throw createError;
        }
      }
    }
  }
  const tasks = await store.listForReconciliation(25);
  const scanWindow = Math.floor(Date.now() / 60_000);
  for (const delegation of tasks) {
    if (
      !a2aEgressOriginAllowed(
        delegation.targetOrigin,
        env.A2A_EGRESS_ALLOWED_ORIGINS,
      )
    )
      continue;
    const id = `a2a-reconcile-${delegation.id}-${scanWindow}`;
    try {
      await env.A2A_DELEGATION_WORKFLOW.create({
        id,
        params: {
          ownerUserId: delegation.ownerUserId,
          delegationId: delegation.id,
          operation: 'reconcile',
        },
      });
    } catch {
      await env.A2A_DELEGATION_WORKFLOW.get(id).catch(() => undefined);
    }
  }
  await reconcileKnownEsimProviderOrders(env.DB, {
    apiKey: env.ESIMGO_API_KEY,
    profileHashSecret: env.ESIMGO_PROFILE_HASH_SECRET,
    installMaterialEncryptionKey: env.ESIMGO_INSTALL_MATERIAL_KEY,
  }, Date.now());
}

export default {
  fetch() {
    return new Response(null, { status: 404 });
  },
  scheduled(_event, env, context) {
    context.waitUntil(startReadyDelegations(env));
  },
} satisfies ExportedHandler<Env>;
