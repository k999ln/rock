/** Persisted delegation contracts and pure input/idempotency checks. */
import type { A2APriceQuote } from './a2a-price-quote.ts';

export type A2ADelegationState =
  | 'awaiting_approval'
  | 'prepared'
  | 'dispatching'
  | 'dispatch_submitting'
  | 'indeterminate'
  | 'submitted'
  | 'working'
  | 'awaiting_remote_input'
  | 'cancel_requested'
  | 'cancel_submitting'
  | 'cancel_unconfirmed'
  | 'cancelled_before_dispatch'
  | 'expired'
  | 'remote_cancelled'
  | 'remote_completed'
  | 'remote_failed'
  | 'remote_rejected';

export type A2ADelegation = {
  id: string;
  ownerUserId: string;
  parentJobId: string;
  predecessorDelegationId: string | null;
  idempotencyKey: string;
  messageId: string;
  targetOrigin: string;
  targetAgentName: string;
  targetAgentVersion: string;
  protocolVersion: '1.0';
  inputSha256: string;
  authorizationSha256: string;
  priceQuoteDigest: string;
  priceQuote: A2APriceQuote | null;
  packageRuntimeBindingId: string;
  packageRuntimeBindingDigest: string;
  budgetCurrency: string;
  budgetLimitMinor: number;
  parentBudgetLimitMinor: number;
  continueWhileDeviceOffline: boolean;
  deadlineAt: number;
  state: A2ADelegationState;
  remoteTaskId: string | null;
  remoteContextId: string | null;
  remoteState: string | null;
  artifactsCaptured: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
};

export type A2ADelegationInput = Omit<
  A2ADelegation,
  | 'ownerUserId'
  | 'predecessorDelegationId'
  | 'state'
  | 'remoteTaskId'
  | 'remoteContextId'
  | 'remoteState'
  | 'artifactsCaptured'
  | 'revision'
  | 'createdAt'
  | 'updatedAt'
> & { predecessorDelegationId?: string | null; priceQuoteDigest?: string; priceQuote?: A2APriceQuote | null;
  packageRuntimeBindingId?: string; packageRuntimeBindingDigest?: string };

export type A2AStoredInput = {
  ciphertext: string;
  nonce: string;
  inputSha256: string;
  keyVersion: string;
};

export type StoredA2ABrokerAuthorization = {
  proofJson: string;
  deviceRef: string;
  authorityId: string;
  keyId: string;
  expiresAt: number;
};

export type A2AParentBudget = {
  ownerUserId: string;
  parentJobId: string;
  currency: string;
  budgetLimitMinor: number;
  reservedMinor: number;
  settledMinor: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
};

export type A2ABudgetReservation = {
  delegationId: string;
  ownerUserId: string;
  parentJobId: string;
  currency: string;
  reservedMinor: number;
  settledMinor: number | null;
  state: 'held' | 'released' | 'settled';
  createdAt: number;
  updatedAt: number;
};

export type A2AUsageReceiptRecord = {
  delegationId: string;
  ownerUserId: string;
  parentJobId: string;
  providerId: string;
  providerReference: string;
  receiptJson: string;
  currency: string;
  amountMinor: number;
  issuedAt: number;
  receivedAt: number;
};

export type A2ALiveUsageSnapshotRecord = {
  delegationId: string;
  sequence: number;
  ownerUserId: string;
  parentJobId: string;
  providerId: string;
  providerEventId: string;
  snapshotJson: string;
  currency: string;
  cumulativeAmountMinor: number;
  pricingVersion: string;
  issuedAt: number;
  receivedAt: number;
};

export class A2ADelegationStoreError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export const A2A_MAX_DELEGATIONS_PER_PARENT_JOB = 8;
export const A2A_MAX_ACTIVE_DELEGATIONS_PER_PARENT_JOB = 4;
export const A2A_MAX_REDELEGATION_DEPTH = 1;

export const delegationDigestPattern = /^[a-f0-9]{64}$/i;
export function validateDelegationInput(input: A2ADelegationInput) {
  if (
    !/^[0-9a-f-]{36}$/i.test(input.id) ||
    !/^[0-9a-f-]{36}$/i.test(input.parentJobId)
  )
    throw new A2ADelegationStoreError(
      '親jobまたは委任IDの形式が不正です。',
      'invalid_id',
    );
  if (input.predecessorDelegationId !== undefined && input.predecessorDelegationId !== null &&
    !/^[0-9a-f-]{36}$/i.test(input.predecessorDelegationId))
    throw new A2ADelegationStoreError('前段委任IDの形式が不正です。', 'invalid_predecessor_id');
  if (
    !/^[A-Za-z0-9._:-]{1,128}$/.test(input.idempotencyKey) ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(input.messageId)
  )
    throw new A2ADelegationStoreError(
      '重複防止IDの形式が不正です。',
      'invalid_idempotency_key',
    );
  let origin: URL;
  try {
    origin = new URL(input.targetOrigin);
  } catch {
    throw new A2ADelegationStoreError(
      '接続先originが不正です。',
      'invalid_target_origin',
    );
  }
  if (
    origin.protocol !== 'https:' ||
    origin.origin !== input.targetOrigin ||
    origin.username ||
    origin.password
  )
    throw new A2ADelegationStoreError(
      '接続先はHTTPS originで指定してください。',
      'invalid_target_origin',
    );
  if (
    !input.targetAgentName.trim() ||
    input.targetAgentName.length > 120 ||
    !input.targetAgentVersion.trim() ||
    input.targetAgentVersion.length > 80
  )
    throw new A2ADelegationStoreError(
      '委任先agentの識別情報が不正です。',
      'invalid_agent_identity',
    );
  if (
    input.protocolVersion !== '1.0' ||
    !delegationDigestPattern.test(input.inputSha256) ||
    !delegationDigestPattern.test(input.authorizationSha256)
  )
    throw new A2ADelegationStoreError(
      'protocol版またはdigestが不正です。',
      'invalid_delegation_digest',
    );
  const priceQuoteDigest = input.priceQuoteDigest ?? '';
  const priceQuote = input.priceQuote ?? null;
  if ((priceQuoteDigest !== '' && !delegationDigestPattern.test(priceQuoteDigest)) || Boolean(priceQuote) !== Boolean(priceQuoteDigest))
    throw new A2ADelegationStoreError('価格見積のdigestまたは保存内容が不正です。', 'invalid_price_quote');
  const packageBindingId = input.packageRuntimeBindingId ?? '';
  const packageBindingDigest = input.packageRuntimeBindingDigest ?? '';
  if ((packageBindingId === '') !== (packageBindingDigest === '') ||
    (packageBindingId !== '' && (!/^[A-Za-z0-9._:-]{1,128}$/.test(packageBindingId) || !delegationDigestPattern.test(packageBindingDigest))))
    throw new A2ADelegationStoreError('Package runtime bindingのIDまたはdigestが不正です。', 'invalid_package_runtime_binding');
  if (
    !/^[A-Z]{3}$/.test(input.budgetCurrency) ||
    !Number.isSafeInteger(input.budgetLimitMinor) ||
    input.budgetLimitMinor < 0
  )
    throw new A2ADelegationStoreError(
      '予算上限の通貨または金額が不正です。',
      'invalid_budget_limit',
    );
  if (
    !Number.isSafeInteger(input.parentBudgetLimitMinor) ||
    input.parentBudgetLimitMinor < input.budgetLimitMinor
  )
    throw new A2ADelegationStoreError(
      '親jobの共通予算は子Agentの上限以上にしてください。',
      'invalid_parent_budget_limit',
    );
  if (input.continueWhileDeviceOffline !== true)
    throw new A2ADelegationStoreError(
      '端末圏外中の継続許可が明示されていないため、クラウド委任を作成できません。',
      'invalid_offline_continuation_consent',
    );
  if (!Number.isSafeInteger(input.deadlineAt) || input.deadlineAt <= 0)
    throw new A2ADelegationStoreError(
      '委任期限が不正です。',
      'invalid_deadline',
    );
}

export function sameDelegationIntent(existing: A2ADelegation, input: A2ADelegationInput) {
  return (
    existing.id === input.id &&
    existing.parentJobId === input.parentJobId &&
    existing.predecessorDelegationId === (input.predecessorDelegationId ?? null) &&
    existing.messageId === input.messageId &&
    existing.targetOrigin === input.targetOrigin &&
    existing.targetAgentName === input.targetAgentName &&
    existing.targetAgentVersion === input.targetAgentVersion &&
    existing.protocolVersion === input.protocolVersion &&
    existing.inputSha256.toLowerCase() === input.inputSha256.toLowerCase() &&
    existing.authorizationSha256.toLowerCase() ===
      input.authorizationSha256.toLowerCase() &&
    (existing.priceQuoteDigest ?? '') === (input.priceQuoteDigest ?? '') &&
    existing.packageRuntimeBindingId === (input.packageRuntimeBindingId ?? '') &&
    existing.packageRuntimeBindingDigest === (input.packageRuntimeBindingDigest ?? '') &&
    existing.budgetCurrency === input.budgetCurrency &&
    existing.budgetLimitMinor === input.budgetLimitMinor &&
    existing.parentBudgetLimitMinor === input.parentBudgetLimitMinor &&
    existing.continueWhileDeviceOffline === input.continueWhileDeviceOffline &&
    existing.deadlineAt === input.deadlineAt
  );
}

