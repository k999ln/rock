import type { A2AUsageReceipt } from './a2a-usage-receipt.ts';
import type { A2ALiveUsageSnapshot } from './a2a-live-usage.ts';
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

type A2ADelegationRow = Omit<A2ADelegation, 'continueWhileDeviceOffline' | 'priceQuote'> & {
  continueWhileDeviceOffline: number | boolean;
  priceQuoteJson: string | null;
};

function normalizeDelegation(row: A2ADelegationRow | null): A2ADelegation | null {
  if (!row) return null;
  const { priceQuoteJson, ...delegation } = row;
  let priceQuote: A2APriceQuote | null = null;
  try { priceQuote = priceQuoteJson ? JSON.parse(priceQuoteJson) as A2APriceQuote : null; } catch { /* fail closed at dispatch */ }
  return {
    ...delegation,
    predecessorDelegationId: delegation.predecessorDelegationId ?? null,
    priceQuoteDigest: delegation.priceQuoteDigest ?? '',
    priceQuote,
    packageRuntimeBindingId: delegation.packageRuntimeBindingId ?? '',
    packageRuntimeBindingDigest: delegation.packageRuntimeBindingDigest ?? '',
    continueWhileDeviceOffline: row.continueWhileDeviceOffline === 1 || row.continueWhileDeviceOffline === true,
  };
}

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

const hash = /^[a-f0-9]{64}$/i;
const terminal = new Set<A2ADelegationState>([
  'cancelled_before_dispatch',
  'expired',
  'remote_cancelled',
  'remote_completed',
  'remote_failed',
  'remote_rejected',
]);
const remoteToLocal: Record<string, A2ADelegationState> = {
  TASK_STATE_UNSPECIFIED: 'indeterminate',
  TASK_STATE_SUBMITTED: 'submitted',
  TASK_STATE_WORKING: 'working',
  TASK_STATE_INPUT_REQUIRED: 'awaiting_remote_input',
  TASK_STATE_AUTH_REQUIRED: 'awaiting_remote_input',
  TASK_STATE_CANCELED: 'remote_cancelled',
  TASK_STATE_COMPLETED: 'remote_completed',
  TASK_STATE_FAILED: 'remote_failed',
  TASK_STATE_REJECTED: 'remote_rejected',
};

function validate(input: A2ADelegationInput) {
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
    !hash.test(input.inputSha256) ||
    !hash.test(input.authorizationSha256)
  )
    throw new A2ADelegationStoreError(
      'protocol版またはdigestが不正です。',
      'invalid_delegation_digest',
    );
  const priceQuoteDigest = input.priceQuoteDigest ?? '';
  const priceQuote = input.priceQuote ?? null;
  if ((priceQuoteDigest !== '' && !hash.test(priceQuoteDigest)) || Boolean(priceQuote) !== Boolean(priceQuoteDigest))
    throw new A2ADelegationStoreError('価格見積のdigestまたは保存内容が不正です。', 'invalid_price_quote');
  const packageBindingId = input.packageRuntimeBindingId ?? '';
  const packageBindingDigest = input.packageRuntimeBindingDigest ?? '';
  if ((packageBindingId === '') !== (packageBindingDigest === '') ||
    (packageBindingId !== '' && (!/^[A-Za-z0-9._:-]{1,128}$/.test(packageBindingId) || !hash.test(packageBindingDigest))))
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

function sameIntent(existing: A2ADelegation, input: A2ADelegationInput) {
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

export function a2aDelegationStore(db: Pick<D1Database, 'prepare' | 'batch'>) {
  async function get(ownerUserId: string, id: string) {
    return db
      .prepare(`SELECT id, owner_user_id AS ownerUserId, parent_job_id AS parentJobId,
      predecessor_delegation_id AS predecessorDelegationId,
      idempotency_key AS idempotencyKey, message_id AS messageId, target_origin AS targetOrigin,
      target_agent_name AS targetAgentName, target_agent_version AS targetAgentVersion,
      protocol_version AS protocolVersion, input_sha256 AS inputSha256,
      authorization_sha256 AS authorizationSha256, price_quote_digest AS priceQuoteDigest,
      price_quote_json AS priceQuoteJson, package_runtime_binding_id AS packageRuntimeBindingId,
      package_runtime_binding_digest AS packageRuntimeBindingDigest, budget_currency AS budgetCurrency,
      budget_limit_minor AS budgetLimitMinor,
      parent_budget_limit_minor AS parentBudgetLimitMinor,
      continue_while_device_offline AS continueWhileDeviceOffline,
      deadline_at AS deadlineAt, state,
      remote_task_id AS remoteTaskId, remote_context_id AS remoteContextId,
      remote_state AS remoteState, artifacts_captured AS artifactsCaptured,
      revision, created_at AS createdAt, updated_at AS updatedAt
      FROM agent_delegations WHERE owner_user_id = ? AND id = ?`)
      .bind(ownerUserId, id)
      .first<A2ADelegationRow>()
      .then(normalizeDelegation);
  }

  async function getPredecessorDepth(ownerUserId: string, delegation: A2ADelegation) {
    let depth = 0;
    let current = delegation;
    const seen = new Set([delegation.id]);
    while (current.predecessorDelegationId) {
      depth += 1;
      if (depth > A2A_MAX_REDELEGATION_DEPTH || seen.has(current.predecessorDelegationId))
        return A2A_MAX_REDELEGATION_DEPTH + 1;
      seen.add(current.predecessorDelegationId);
      const previous = await get(ownerUserId, current.predecessorDelegationId);
      if (!previous || previous.parentJobId !== delegation.parentJobId)
        return A2A_MAX_REDELEGATION_DEPTH + 1;
      current = previous;
    }
    return depth;
  }

  async function getByIdempotency(
    ownerUserId: string,
    parentJobId: string,
    idempotencyKey: string,
    inputSha256: string,
  ) {
    if (
      !/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey) ||
      !hash.test(inputSha256)
    )
      return null;
    return db
      .prepare(`SELECT id, owner_user_id AS ownerUserId, parent_job_id AS parentJobId,
      predecessor_delegation_id AS predecessorDelegationId,
      idempotency_key AS idempotencyKey, message_id AS messageId, target_origin AS targetOrigin,
      target_agent_name AS targetAgentName, target_agent_version AS targetAgentVersion,
      protocol_version AS protocolVersion, input_sha256 AS inputSha256,
      authorization_sha256 AS authorizationSha256, price_quote_digest AS priceQuoteDigest,
      price_quote_json AS priceQuoteJson, package_runtime_binding_id AS packageRuntimeBindingId,
      package_runtime_binding_digest AS packageRuntimeBindingDigest, budget_currency AS budgetCurrency,
      budget_limit_minor AS budgetLimitMinor,
      parent_budget_limit_minor AS parentBudgetLimitMinor,
      continue_while_device_offline AS continueWhileDeviceOffline,
      deadline_at AS deadlineAt, state,
      remote_task_id AS remoteTaskId, remote_context_id AS remoteContextId,
      remote_state AS remoteState, artifacts_captured AS artifactsCaptured,
      revision, created_at AS createdAt, updated_at AS updatedAt
      FROM agent_delegations
      WHERE owner_user_id = ? AND parent_job_id = ? AND idempotency_key = ? AND input_sha256 = ?`)
      .bind(ownerUserId, parentJobId, idempotencyKey, inputSha256.toLowerCase())
      .first<A2ADelegationRow>()
      .then(normalizeDelegation);
  }

  async function getBrokerAuthorization(ownerUserId: string, id: string) {
    const row = await db
      .prepare(`SELECT proof_json AS proofJson, device_ref AS deviceRef,
        authority_id AS authorityId, key_id AS keyId, expires_at AS expiresAt
        FROM agent_delegation_broker_authorizations
        WHERE owner_user_id = ? AND delegation_id = ?`)
      .bind(ownerUserId, id)
      .first<StoredA2ABrokerAuthorization>();
    return row;
  }

  async function getBudget(ownerUserId: string, parentJobId: string) {
    return db
      .prepare(`SELECT owner_user_id AS ownerUserId, parent_job_id AS parentJobId,
        currency, budget_limit_minor AS budgetLimitMinor,
        reserved_minor AS reservedMinor, settled_minor AS settledMinor,
        revision, created_at AS createdAt, updated_at AS updatedAt
        FROM agent_delegation_budget_pools
        WHERE owner_user_id = ? AND parent_job_id = ?`)
      .bind(ownerUserId, parentJobId)
      .first<A2AParentBudget>();
  }

  async function getBudgetReservation(ownerUserId: string, id: string) {
    return db
      .prepare(`SELECT delegation_id AS delegationId, owner_user_id AS ownerUserId,
        parent_job_id AS parentJobId, currency,
        reserved_minor AS reservedMinor, settled_minor AS settledMinor,
        state, created_at AS createdAt, updated_at AS updatedAt
        FROM agent_delegation_budget_reservations
        WHERE owner_user_id = ? AND delegation_id = ?`)
      .bind(ownerUserId, id)
      .first<A2ABudgetReservation>();
  }

  async function getUsageReceipt(ownerUserId: string, id: string) {
    return db.prepare(`SELECT delegation_id AS delegationId, owner_user_id AS ownerUserId,
      parent_job_id AS parentJobId, provider_id AS providerId,
      provider_reference AS providerReference, receipt_json AS receiptJson,
      currency, amount_minor AS amountMinor, issued_at AS issuedAt,
      received_at AS receivedAt FROM a2a_usage_receipts
      WHERE owner_user_id = ? AND delegation_id = ?`)
      .bind(ownerUserId, id)
      .first<A2AUsageReceiptRecord>();
  }

  async function getLatestLiveUsageSnapshot(ownerUserId: string, id: string) {
    return db.prepare(`SELECT delegation_id AS delegationId, sequence,
      owner_user_id AS ownerUserId, parent_job_id AS parentJobId,
      provider_id AS providerId, provider_event_id AS providerEventId,
      snapshot_json AS snapshotJson, currency,
      cumulative_amount_minor AS cumulativeAmountMinor,
      pricing_version AS pricingVersion, issued_at AS issuedAt,
      received_at AS receivedAt FROM a2a_live_usage_snapshots
      WHERE owner_user_id = ? AND delegation_id = ? ORDER BY sequence DESC LIMIT 1`)
      .bind(ownerUserId, id).first<A2ALiveUsageSnapshotRecord>();
  }

  async function listBudgetReservations(ownerUserId: string, parentJobId: string) {
    const rows = await db
      .prepare(`SELECT delegation_id AS delegationId, owner_user_id AS ownerUserId,
        parent_job_id AS parentJobId, currency,
        reserved_minor AS reservedMinor, settled_minor AS settledMinor,
        state, created_at AS createdAt, updated_at AS updatedAt
        FROM agent_delegation_budget_reservations
        WHERE owner_user_id = ? AND parent_job_id = ? ORDER BY created_at, delegation_id`)
      .bind(ownerUserId, parentJobId)
      .all<A2ABudgetReservation>();
    return rows.results;
  }

  async function update(
    ownerUserId: string,
    id: string,
    revision: number,
    allowedFrom: A2ADelegationState[],
    eventType: string,
    values: {
      state: A2ADelegationState;
      updatedAt: number;
      remoteTaskId?: string | null;
      remoteContextId?: string | null;
      remoteState?: string | null;
    },
  ) {
    const current = await get(ownerUserId, id);
    if (
      !current ||
      current.revision !== revision ||
      !allowedFrom.includes(current.state)
    )
      throw new A2ADelegationStoreError(
        '状態が他の操作で更新されたか、委任がありません。',
        'delegation_revision_conflict',
      );
    const statements = [
      db
        .prepare(`UPDATE agent_delegations SET state = ?,
      remote_task_id = COALESCE(?, remote_task_id),
      remote_context_id = COALESCE(?, remote_context_id),
      remote_state = COALESCE(?, remote_state), revision = revision + 1, updated_at = ?
      WHERE owner_user_id = ? AND id = ? AND revision = ? AND state = ?`)
        .bind(
          values.state,
          values.remoteTaskId ?? null,
          values.remoteContextId ?? null,
          values.remoteState ?? null,
          values.updatedAt,
          ownerUserId,
          id,
          revision,
          current.state,
        ),
      db
        .prepare(`INSERT INTO agent_delegation_events (
        id, delegation_id, owner_user_id, revision, event_type, from_state, to_state, remote_state, created_at
      ) SELECT ?, id, owner_user_id, ?, ?, ?, ?, ?, ? FROM agent_delegations
        WHERE owner_user_id = ? AND id = ? AND revision = ? AND state = ?`)
        .bind(
          crypto.randomUUID(),
          revision + 1,
          eventType,
          current.state,
          values.state,
          values.remoteState ?? current.remoteState,
          values.updatedAt,
          ownerUserId,
          id,
          revision + 1,
          values.state,
        ),
    ];
    let results: Awaited<ReturnType<typeof db.batch>>;
    try {
      results = await db.batch(statements);
    } catch {
      throw new A2ADelegationStoreError(
        '同時更新のため状態遷移を確定できません。再読込して照合してください。',
        'delegation_revision_conflict',
      );
    }
    // D1 may include changes made by AFTER triggers in metadata. The guarded
    // delegation UPDATE is successful when it changed at least its own row.
    if ((results[0]?.meta.changes ?? 0) < 1)
      throw new A2ADelegationStoreError(
        '状態が他の操作で更新されたか、委任がありません。',
        'delegation_revision_conflict',
      );
    if (results[1]?.meta.changes !== 1)
      throw new A2ADelegationStoreError(
        '状態遷移の監査記録を保存できません。',
        'delegation_event_write_failed',
      );
    return get(ownerUserId, id);
  }

  return {
    get,
    getByIdempotency,
    getBudget,
    getBudgetReservation,
    listBudgetReservations,
    getUsageReceipt,
    getLatestLiveUsageSnapshot,
    async getLiveUsageSnapshotByEvent(providerId: string, eventId: string) {
      return db.prepare(`SELECT delegation_id AS delegationId, sequence,
        owner_user_id AS ownerUserId, parent_job_id AS parentJobId,
        provider_id AS providerId, provider_event_id AS providerEventId,
        snapshot_json AS snapshotJson, currency,
        cumulative_amount_minor AS cumulativeAmountMinor,
        pricing_version AS pricingVersion, issued_at AS issuedAt,
        received_at AS receivedAt FROM a2a_live_usage_snapshots
        WHERE provider_id = ? AND provider_event_id = ?`)
        .bind(providerId, eventId).first<A2ALiveUsageSnapshotRecord>();
    },
    async recordLiveUsageSnapshot(ownerUserId: string, id: string, snapshot: A2ALiveUsageSnapshot, now = Date.now()) {
      const current = await get(ownerUserId, id);
      const previous = await getLatestLiveUsageSnapshot(ownerUserId, id);
      const reservation = await getBudgetReservation(ownerUserId, id);
      const terminalStates = new Set<A2ADelegationState>([
        'cancelled_before_dispatch', 'expired', 'remote_cancelled', 'remote_completed', 'remote_failed', 'remote_rejected',
      ]);
      if (!current || current.ownerUserId !== snapshot.ownerUserId || current.parentJobId !== snapshot.parentJobId ||
        current.remoteTaskId !== snapshot.taskId || terminalStates.has(current.state) ||
        current.deadlineAt <= now ||
        !current.priceQuote || current.priceQuote.providerId !== snapshot.providerId ||
        current.priceQuote.pricingVersion !== snapshot.pricingVersion ||
        current.budgetCurrency !== snapshot.currency || !reservation || reservation.state !== 'held' ||
        snapshot.sequence !== (previous?.sequence ?? 0) + 1 ||
        snapshot.cumulativeAmountMinor > reservation.reservedMinor ||
        snapshot.cumulativeAmountMinor < (previous?.cumulativeAmountMinor ?? 0) ||
        snapshot.issuedAt <= (previous?.issuedAt ?? 0))
        throw new A2ADelegationStoreError('実行中の利用量snapshotが委任・価格・予約条件と一致しません。', 'live_usage_snapshot_mismatch');
      const snapshotJson = JSON.stringify(snapshot);
      try {
        await db.prepare(`INSERT INTO a2a_live_usage_snapshots (
          delegation_id, sequence, owner_user_id, parent_job_id, provider_id,
          provider_event_id, snapshot_json, currency, cumulative_amount_minor,
          pricing_version, issued_at, received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(id, snapshot.sequence, ownerUserId, current.parentJobId, snapshot.providerId,
            snapshot.eventId, snapshotJson, snapshot.currency, snapshot.cumulativeAmountMinor,
            snapshot.pricingVersion, snapshot.issuedAt, now).run();
      } catch {
        throw new A2ADelegationStoreError('利用量snapshotが重複したか、予約額・順序条件を超えています。', 'live_usage_snapshot_conflict');
      }
      const stored = await getLatestLiveUsageSnapshot(ownerUserId, id);
      if (!stored || stored.sequence !== snapshot.sequence || stored.providerEventId !== snapshot.eventId || stored.snapshotJson !== snapshotJson)
        throw new A2ADelegationStoreError('利用量snapshotを一意に保存できませんでした。', 'live_usage_snapshot_conflict');
      return stored;
    },
    getBrokerAuthorization,
    async settleUsageReceipt(
      ownerUserId: string,
      id: string,
      receipt: A2AUsageReceipt,
      now = Date.now(),
    ) {
      const current = await get(ownerUserId, id);
      if (!current || !current.remoteTaskId ||
        !['remote_completed', 'remote_failed', 'remote_cancelled', 'remote_rejected'].includes(current.state) ||
        !/^[A-Za-z0-9._:-]{1,128}$/.test(receipt.providerId) ||
        !/^[A-Za-z0-9._:-]{1,128}$/.test(receipt.receiptId) ||
        !/^[A-Z]{3}$/.test(receipt.currency) || receipt.currency !== current.budgetCurrency ||
        !Number.isSafeInteger(receipt.amountMinor) || receipt.amountMinor < 0 ||
        receipt.amountMinor > current.budgetLimitMinor || !Number.isSafeInteger(receipt.issuedAt) ||
        typeof receipt.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(receipt.signature))
        throw new A2ADelegationStoreError('確定済み委任に対応する利用量receiptが不正です。', 'invalid_usage_receipt');
      const receiptJson = JSON.stringify(receipt);
      const latestLiveUsage = await getLatestLiveUsageSnapshot(ownerUserId, id);
      if (latestLiveUsage) {
        let liveSnapshot: A2ALiveUsageSnapshot;
        try { liveSnapshot = JSON.parse(latestLiveUsage.snapshotJson) as A2ALiveUsageSnapshot; }
        catch { throw new A2ADelegationStoreError('保存済み実行中meter記録を読めません。', 'live_usage_snapshot_invalid'); }
        if (latestLiveUsage.providerId !== receipt.providerId || latestLiveUsage.currency !== receipt.currency ||
          latestLiveUsage.pricingVersion !== receipt.pricingVersion ||
          latestLiveUsage.cumulativeAmountMinor > receipt.amountMinor || latestLiveUsage.issuedAt > receipt.issuedAt ||
          liveSnapshot.taskId !== receipt.taskId)
          throw new A2ADelegationStoreError('最終receiptが実行中meterの確定値と矛盾します。', 'usage_receipt_live_meter_mismatch');
      }
      try {
        await db.batch([
          db.prepare(`INSERT INTO a2a_usage_receipts (
            delegation_id, owner_user_id, parent_job_id, provider_id,
            provider_reference, receipt_json, currency, amount_minor, issued_at, received_at
          ) SELECT d.id, d.owner_user_id, d.parent_job_id, ?, ?, ?, ?, ?, ?, ?
          FROM agent_delegations d JOIN agent_delegation_budget_reservations r
            ON r.owner_user_id = d.owner_user_id AND r.delegation_id = d.id
          WHERE d.owner_user_id = ? AND d.id = ? AND d.remote_task_id = ?
            AND d.state IN ('remote_completed', 'remote_failed', 'remote_cancelled', 'remote_rejected')
            AND r.state = 'held'
          ON CONFLICT(delegation_id) DO NOTHING`).bind(
            receipt.providerId, receipt.receiptId, receiptJson, receipt.currency,
            receipt.amountMinor, receipt.issuedAt, now, ownerUserId, id, current.remoteTaskId,
          ),
          db.prepare(`UPDATE agent_delegation_budget_reservations
            SET state = 'settled', settled_minor = ?, updated_at = ?
            WHERE owner_user_id = ? AND delegation_id = ? AND parent_job_id = ?
              AND currency = ? AND state = 'held' AND ? <= reserved_minor
              AND EXISTS (SELECT 1 FROM a2a_usage_receipts u
                WHERE u.delegation_id = agent_delegation_budget_reservations.delegation_id
                  AND u.owner_user_id = ? AND u.provider_id = ? AND u.provider_reference = ?
                  AND u.currency = ? AND u.amount_minor = ?
                  AND json_extract(u.receipt_json, '$.signature') = ?)
              AND EXISTS (SELECT 1 FROM agent_delegations d
                WHERE d.owner_user_id = ? AND d.id = ? AND d.remote_task_id = ?
                  AND d.state IN ('remote_completed', 'remote_failed', 'remote_cancelled', 'remote_rejected'))`)
            .bind(receipt.amountMinor, now, ownerUserId, id, current.parentJobId,
              receipt.currency, receipt.amountMinor, ownerUserId, receipt.providerId,
              receipt.receiptId, receipt.currency, receipt.amountMinor, receipt.signature,
              ownerUserId, id, current.remoteTaskId),
        ]);
      } catch {
        throw new A2ADelegationStoreError('利用量receiptを一意に確定できませんでした。', 'usage_receipt_conflict');
      }
      const [stored, reservation] = await Promise.all([
        getUsageReceipt(ownerUserId, id), getBudgetReservation(ownerUserId, id),
      ]);
      let storedReceipt: unknown;
      try { storedReceipt = stored ? JSON.parse(stored.receiptJson) : null; } catch { storedReceipt = null; }
      if (!stored || stored.providerId !== receipt.providerId ||
        stored.providerReference !== receipt.receiptId || stored.currency !== receipt.currency ||
        stored.amountMinor !== receipt.amountMinor || !storedReceipt ||
        typeof storedReceipt !== 'object' || (storedReceipt as Record<string, unknown>).signature !== receipt.signature ||
        !reservation || reservation.state !== 'settled' || reservation.settledMinor !== receipt.amountMinor)
        throw new A2ADelegationStoreError('この委任は別receiptで精算済みか、receiptを反映できません。', 'usage_receipt_conflict');
      return { reservation, receipt: stored };
    },
    async saveBrokerAuthorization(
      ownerUserId: string,
      id: string,
      value: {
        proofJson: string;
        deviceRef: string;
        authorityId: string;
        keyId: string;
        expiresAt: number;
      },
      now = Date.now(),
    ) {
      const current = await get(ownerUserId, id);
      if (
        !current ||
        current.state !== 'awaiting_approval' ||
        current.deadlineAt <= now ||
        !value.proofJson ||
        value.proofJson.length > 12_000 ||
        !/^[A-Za-z0-9._:-]{1,128}$/.test(value.deviceRef) ||
        !/^[A-Za-z0-9._:-]{1,128}$/.test(value.authorityId) ||
        !/^[A-Za-z0-9._:-]{1,128}$/.test(value.keyId) ||
        !Number.isSafeInteger(value.expiresAt) ||
        value.expiresAt <= now ||
        value.expiresAt > current.deadlineAt
      )
        throw new A2ADelegationStoreError(
          '承認待ちの委任にだけBroker証明を保存できます。',
          'broker_authorization_invalid',
        );
      const existing = await getBrokerAuthorization(ownerUserId, id);
      if (existing) {
        if (
          existing.proofJson !== value.proofJson ||
          existing.deviceRef !== value.deviceRef ||
          existing.authorityId !== value.authorityId ||
          existing.keyId !== value.keyId ||
          existing.expiresAt !== value.expiresAt
        )
          throw new A2ADelegationStoreError(
            '別のBroker証明がすでに保存されています。',
            'broker_authorization_conflict',
          );
        return existing;
      }
      await db
        .prepare(`INSERT INTO agent_delegation_broker_authorizations
          (delegation_id, owner_user_id, device_ref, authority_id, key_id, proof_json, expires_at, created_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
            SELECT 1 FROM agent_delegations WHERE owner_user_id = ? AND id = ?
              AND state = 'awaiting_approval' AND deadline_at > ?
          )`)
        .bind(
          id,
          ownerUserId,
          value.deviceRef,
          value.authorityId,
          value.keyId,
          value.proofJson,
          value.expiresAt,
          now,
          ownerUserId,
          id,
          now,
        )
        .run();
      const saved = await getBrokerAuthorization(ownerUserId, id);
      if (
        !saved ||
        saved.proofJson !== value.proofJson ||
        saved.deviceRef !== value.deviceRef ||
        saved.authorityId !== value.authorityId ||
        saved.keyId !== value.keyId ||
        saved.expiresAt !== value.expiresAt
      )
        throw new A2ADelegationStoreError(
          'Broker証明の保存競合を確認できません。',
          'broker_authorization_conflict',
        );
      return saved;
    },
    async listPrepared(limit = 25) {
      const rows = await db
      .prepare(`SELECT id, owner_user_id AS ownerUserId, parent_job_id AS parentJobId,
        predecessor_delegation_id AS predecessorDelegationId,
        idempotency_key AS idempotencyKey, message_id AS messageId, target_origin AS targetOrigin,
        target_agent_name AS targetAgentName, target_agent_version AS targetAgentVersion,
        protocol_version AS protocolVersion, input_sha256 AS inputSha256,
        authorization_sha256 AS authorizationSha256, price_quote_digest AS priceQuoteDigest,
      price_quote_json AS priceQuoteJson, package_runtime_binding_id AS packageRuntimeBindingId,
      package_runtime_binding_digest AS packageRuntimeBindingDigest, budget_currency AS budgetCurrency,
        budget_limit_minor AS budgetLimitMinor,
        parent_budget_limit_minor AS parentBudgetLimitMinor,
        continue_while_device_offline AS continueWhileDeviceOffline,
        deadline_at AS deadlineAt, state,
        remote_task_id AS remoteTaskId, remote_context_id AS remoteContextId,
        remote_state AS remoteState, artifacts_captured AS artifactsCaptured,
        revision, created_at AS createdAt, updated_at AS updatedAt
        FROM agent_delegations WHERE state = 'prepared' AND deadline_at > ?
        ORDER BY created_at, id LIMIT ?`)
        .bind(Date.now(), Math.min(Math.max(Math.trunc(limit), 1), 100))
        .all<A2ADelegationRow>();
      return rows.results.map((row) => normalizeDelegation(row)!);
    },
    async expireOverdueBeforeDispatch(now = Date.now(), limit = 50) {
      const rows = await db.prepare(`SELECT id, owner_user_id AS ownerUserId, revision
        FROM agent_delegations
        WHERE deadline_at <= ? AND state IN ('awaiting_approval','prepared','dispatching')
        ORDER BY deadline_at, id LIMIT ?`)
        .bind(now, Math.min(Math.max(Math.trunc(limit), 1), 100))
        .all<{ id: string; ownerUserId: string; revision: number }>();
      let expired = 0;
      for (const row of rows.results) {
        try {
          await update(row.ownerUserId, row.id, row.revision,
            ['awaiting_approval', 'prepared', 'dispatching'], 'deadline_expired',
            { state: 'expired', updatedAt: now });
          expired += 1;
        } catch (error) {
          if (!(error instanceof A2ADelegationStoreError) ||
            error.code !== 'delegation_revision_conflict') throw error;
          // A concurrent approval, dispatch or cancellation owns the newer state.
        }
      }
      return expired;
    },
    async listOverdueRemoteTasks(now = Date.now(), limit = 50) {
      const rows = await db.prepare(`SELECT id, owner_user_id AS ownerUserId, parent_job_id AS parentJobId,
        idempotency_key AS idempotencyKey, message_id AS messageId, target_origin AS targetOrigin,
        target_agent_name AS targetAgentName, target_agent_version AS targetAgentVersion,
        protocol_version AS protocolVersion, input_sha256 AS inputSha256,
        authorization_sha256 AS authorizationSha256, price_quote_digest AS priceQuoteDigest,
        price_quote_json AS priceQuoteJson, package_runtime_binding_id AS packageRuntimeBindingId,
        package_runtime_binding_digest AS packageRuntimeBindingDigest, budget_currency AS budgetCurrency,
        budget_limit_minor AS budgetLimitMinor, parent_budget_limit_minor AS parentBudgetLimitMinor,
        continue_while_device_offline AS continueWhileDeviceOffline, deadline_at AS deadlineAt, state,
        remote_task_id AS remoteTaskId, remote_context_id AS remoteContextId, remote_state AS remoteState,
        artifacts_captured AS artifactsCaptured, revision, created_at AS createdAt, updated_at AS updatedAt
        FROM agent_delegations WHERE deadline_at <= ? AND (
          (remote_task_id IS NOT NULL AND state IN ('indeterminate','submitted','working','awaiting_remote_input'))
          OR state = 'dispatch_submitting'
        )
        ORDER BY deadline_at, id LIMIT ?`)
        .bind(now, Math.min(Math.max(Math.trunc(limit), 1), 100))
        .all<A2ADelegationRow>();
      return rows.results.map((row) => normalizeDelegation(row)!);
    },
    async listForReconciliation(limit = 25) {
      const rows = await db
        .prepare(`SELECT id, owner_user_id AS ownerUserId, parent_job_id AS parentJobId,
        idempotency_key AS idempotencyKey, message_id AS messageId, target_origin AS targetOrigin,
        target_agent_name AS targetAgentName, target_agent_version AS targetAgentVersion,
        protocol_version AS protocolVersion, input_sha256 AS inputSha256,
        authorization_sha256 AS authorizationSha256, price_quote_digest AS priceQuoteDigest,
      price_quote_json AS priceQuoteJson, package_runtime_binding_id AS packageRuntimeBindingId,
      package_runtime_binding_digest AS packageRuntimeBindingDigest, budget_currency AS budgetCurrency,
        budget_limit_minor AS budgetLimitMinor,
        parent_budget_limit_minor AS parentBudgetLimitMinor,
        continue_while_device_offline AS continueWhileDeviceOffline,
        deadline_at AS deadlineAt, state,
        remote_task_id AS remoteTaskId, remote_context_id AS remoteContextId,
        remote_state AS remoteState, artifacts_captured AS artifactsCaptured,
        revision, created_at AS createdAt, updated_at AS updatedAt
        FROM agent_delegations WHERE remote_task_id IS NOT NULL AND (
          state IN ('indeterminate','submitted','working','awaiting_remote_input','cancel_requested','cancel_submitting','cancel_unconfirmed')
          OR (artifacts_captured = 0 AND state IN ('remote_cancelled','remote_completed','remote_failed','remote_rejected'))
        )
        ORDER BY updated_at, id LIMIT ?`)
        .bind(Math.min(Math.max(Math.trunc(limit), 1), 100))
        .all<A2ADelegationRow>();
      return rows.results.map((row) => normalizeDelegation(row)!);
    },
    async listEvents(ownerUserId: string, id: string) {
      const rows = await db
        .prepare(`SELECT e.id, e.delegation_id AS delegationId, e.owner_user_id AS ownerUserId,
        e.revision, e.event_type AS eventType, e.from_state AS fromState, e.to_state AS toState,
        e.remote_state AS remoteState, e.created_at AS createdAt
        FROM agent_delegation_events e JOIN agent_delegations d ON d.id = e.delegation_id AND d.owner_user_id = e.owner_user_id
        WHERE e.owner_user_id = ? AND e.delegation_id = ? ORDER BY e.revision`)
        .bind(ownerUserId, id)
        .all();
      return rows.results;
    },
    async listArtifacts(ownerUserId: string, id: string) {
      const rows = await db
        .prepare(`SELECT a.id, a.delegation_id AS delegationId,
          a.remote_task_id AS remoteTaskId, a.artifact_sha256 AS artifactSha256,
          a.payload_ciphertext AS ciphertext, a.nonce, a.key_version AS keyVersion,
          a.byte_length AS byteLength, a.created_at AS createdAt
        FROM agent_delegation_artifacts a
        JOIN agent_delegations d ON d.id = a.delegation_id AND d.owner_user_id = a.owner_user_id
        WHERE a.owner_user_id = ? AND a.delegation_id = ?
        ORDER BY a.created_at, a.id LIMIT 32`)
        .bind(ownerUserId, id)
        .all();
      return rows.results as Array<{
        id: string;
        delegationId: string;
        remoteTaskId: string;
        artifactSha256: string;
        ciphertext: string;
        nonce: string;
        keyVersion: string;
        byteLength: number;
        createdAt: number;
      }>;
    },
    async saveArtifact(
      ownerUserId: string,
      id: string,
      remoteTaskId: string,
      artifact: {
        ciphertext: string;
        nonce: string;
        artifactSha256: string;
        keyVersion: string;
      },
      byteLength: number,
      now = Date.now(),
    ) {
      if (
        !hash.test(artifact.artifactSha256) ||
        artifact.keyVersion !== 'aes-256-gcm-v1' ||
        !artifact.ciphertext ||
        !artifact.nonce ||
        !Number.isSafeInteger(byteLength) ||
        byteLength < 1 ||
        byteLength > 32_768 ||
        !remoteTaskId ||
        remoteTaskId.length > 256
      )
        throw new A2ADelegationStoreError(
          '成果artifactの保存条件が不正です。',
          'invalid_artifact',
        );
      const result = await db
        .prepare(`INSERT INTO agent_delegation_artifacts (
          id, delegation_id, owner_user_id, remote_task_id, artifact_sha256,
          payload_ciphertext, nonce, key_version, byte_length, created_at
        ) SELECT ?, d.id, d.owner_user_id, ?, ?, ?, ?, ?, ?, ?
          FROM agent_delegations d WHERE d.owner_user_id = ? AND d.id = ?
            AND d.remote_task_id = ?
        ON CONFLICT(owner_user_id, delegation_id, remote_task_id, artifact_sha256) DO NOTHING`)
        .bind(
          crypto.randomUUID(),
          remoteTaskId,
          artifact.artifactSha256.toLowerCase(),
          artifact.ciphertext,
          artifact.nonce,
          artifact.keyVersion,
          byteLength,
          now,
          ownerUserId,
          id,
          remoteTaskId,
        )
        .run();
      return result.meta.changes === 1;
    },
    async markArtifactsCaptured(
      ownerUserId: string,
      id: string,
      remoteTaskId: string,
      revision: number,
      now = Date.now(),
    ) {
      const current = await get(ownerUserId, id);
      if (
        !current ||
        current.revision !== revision ||
        current.remoteTaskId !== remoteTaskId
      )
        throw new A2ADelegationStoreError(
          '成果確認中に委任状態が変わりました。',
          'delegation_revision_conflict',
        );
      if (current.artifactsCaptured) return current;
      const results = await db.batch([
        db.prepare(`UPDATE agent_delegations SET artifacts_captured = 1,
          revision = revision + 1, updated_at = ?
          WHERE owner_user_id = ? AND id = ? AND revision = ? AND remote_task_id = ?
            AND artifacts_captured = 0`)
          .bind(now, ownerUserId, id, revision, remoteTaskId),
        db.prepare(`INSERT INTO agent_delegation_events (
          id, delegation_id, owner_user_id, revision, event_type, from_state, to_state, remote_state, created_at
        ) SELECT ?, id, owner_user_id, ?, 'remote_artifacts_captured', state, state, remote_state, ?
          FROM agent_delegations WHERE owner_user_id = ? AND id = ? AND revision = ?
            AND artifacts_captured = 1`)
          .bind(crypto.randomUUID(), revision + 1, now, ownerUserId, id, revision + 1),
      ]);
      if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1)
        throw new A2ADelegationStoreError(
          '成果の受領記録を保存できませんでした。',
          'delegation_revision_conflict',
        );
      return get(ownerUserId, id);
    },
    async listForParent(ownerUserId: string, parentJobId: string) {
      const rows = await db
        .prepare(`SELECT id, owner_user_id AS ownerUserId, parent_job_id AS parentJobId,
        predecessor_delegation_id AS predecessorDelegationId,
        idempotency_key AS idempotencyKey, message_id AS messageId, target_origin AS targetOrigin,
        target_agent_name AS targetAgentName, target_agent_version AS targetAgentVersion,
        protocol_version AS protocolVersion, input_sha256 AS inputSha256,
        authorization_sha256 AS authorizationSha256, price_quote_digest AS priceQuoteDigest,
      price_quote_json AS priceQuoteJson, package_runtime_binding_id AS packageRuntimeBindingId,
      package_runtime_binding_digest AS packageRuntimeBindingDigest, budget_currency AS budgetCurrency,
        budget_limit_minor AS budgetLimitMinor,
        parent_budget_limit_minor AS parentBudgetLimitMinor,
        continue_while_device_offline AS continueWhileDeviceOffline,
        deadline_at AS deadlineAt, state,
        remote_task_id AS remoteTaskId, remote_context_id AS remoteContextId,
        remote_state AS remoteState, artifacts_captured AS artifactsCaptured,
        revision, created_at AS createdAt, updated_at AS updatedAt
        FROM agent_delegations WHERE owner_user_id = ? AND parent_job_id = ?
        ORDER BY created_at, id LIMIT 100`)
        .bind(ownerUserId, parentJobId)
        .all<A2ADelegationRow>();
      return rows.results.map((row) => normalizeDelegation(row)!);
    },
    async getInput(ownerUserId: string, id: string) {
      return db
        .prepare(`SELECT delegation_id AS delegationId, owner_user_id AS ownerUserId,
        payload_ciphertext AS ciphertext, nonce, input_sha256 AS inputSha256,
        key_version AS keyVersion, expires_at AS expiresAt, created_at AS createdAt
        FROM agent_delegation_inputs WHERE owner_user_id = ? AND delegation_id = ?`)
        .bind(ownerUserId, id)
        .first<{
          delegationId: string;
          ownerUserId: string;
          ciphertext: string;
          nonce: string;
          inputSha256: string;
          keyVersion: string;
          expiresAt: number;
          createdAt: number;
        }>();
    },
    async deleteInput(ownerUserId: string, id: string) {
      return db
        .prepare('DELETE FROM agent_delegation_inputs WHERE owner_user_id = ? AND delegation_id = ?')
        .bind(ownerUserId, id)
        .run();
    },
    async purgeExpiredInputs(now = Date.now()) {
      return db
        .prepare('DELETE FROM agent_delegation_inputs WHERE expires_at <= ?')
        .bind(now)
        .run();
    },
    async prepare(
      ownerUserId: string,
      input: A2ADelegationInput,
      now = Date.now(),
    ) {
      validate(input);
      if (input.predecessorDelegationId) {
        const predecessor = await get(ownerUserId, input.predecessorDelegationId);
        if (!predecessor || predecessor.parentJobId !== input.parentJobId ||
          predecessor.state !== 'remote_completed' || predecessor.artifactsCaptured !== 1)
          throw new A2ADelegationStoreError(
            '前段Agentの同一親job成果が確認できません。',
            'a2a_predecessor_conflict',
          );
        if (await getPredecessorDepth(ownerUserId, predecessor) + 1 > A2A_MAX_REDELEGATION_DEPTH)
          throw new A2ADelegationStoreError(
            `Agent間の再委任は${A2A_MAX_REDELEGATION_DEPTH}段階までです。別の独立した依頼として作成してください。`,
            'a2a_predecessor_depth_exceeded',
          );
      }
      let created = false;
      try {
        const statements = [
          db
            .prepare(`INSERT INTO agent_delegations (
          id, owner_user_id, parent_job_id, predecessor_delegation_id, idempotency_key, message_id, target_origin,
          target_agent_name, target_agent_version, protocol_version, input_sha256,
          authorization_sha256, price_quote_digest, price_quote_json,
          package_runtime_binding_id, package_runtime_binding_digest, budget_currency, budget_limit_minor,
          parent_budget_limit_minor, continue_while_device_offline, deadline_at,
          state, revision, created_at, updated_at
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_approval', 0, ?, ?
          WHERE EXISTS (SELECT 1 FROM work_jobs w WHERE w.id = ? AND w.user_id = ?
            AND json_extract(w.payload, '$.status') IN ('active', 'review')) AND ? > ?
          ON CONFLICT(owner_user_id, idempotency_key) DO NOTHING`)
            .bind(
              input.id,
              ownerUserId,
              input.parentJobId,
              input.predecessorDelegationId ?? null,
              input.idempotencyKey,
              input.messageId,
              input.targetOrigin,
              input.targetAgentName,
              input.targetAgentVersion,
              input.protocolVersion,
              input.inputSha256.toLowerCase(),
              input.authorizationSha256.toLowerCase(),
              input.priceQuoteDigest ?? '',
              input.priceQuote ? JSON.stringify(input.priceQuote) : null,
              input.packageRuntimeBindingId ?? '',
              input.packageRuntimeBindingDigest ?? '',
              input.budgetCurrency,
              input.budgetLimitMinor,
              input.parentBudgetLimitMinor,
              input.continueWhileDeviceOffline ? 1 : 0,
              input.deadlineAt,
              now,
              now,
              input.parentJobId,
              ownerUserId,
              input.deadlineAt,
              now,
            ),
          db
            .prepare(`INSERT INTO agent_delegation_events (
            id, delegation_id, owner_user_id, revision, event_type, from_state, to_state, remote_state, created_at
          ) SELECT ?, id, owner_user_id, 0, 'approval_requested', NULL, 'awaiting_approval', NULL, created_at
          FROM agent_delegations d WHERE owner_user_id = ? AND id = ? AND state = 'awaiting_approval' AND revision = 0
            AND NOT EXISTS (SELECT 1 FROM agent_delegation_events e WHERE e.delegation_id = d.id AND e.revision = 0)`)
            .bind(crypto.randomUUID(), ownerUserId, input.id),
        ];
        const results = await db.batch(statements);
        created = results[0]?.meta.changes === 1;
      } catch (error) {
        if (String(error).includes('A2A_DELEGATION_CONCURRENCY_LIMIT'))
          throw new A2ADelegationStoreError(
            'この親jobでは同時に実行・承認できるAgent委任の上限（4件）に達しました。',
            'a2a_delegation_concurrency_limit',
          );
        if (String(error).includes('A2A_DELEGATION_COUNT_LIMIT'))
          throw new A2ADelegationStoreError(
            'この親jobで作成できるAgent委任の上限（8件）に達しました。',
            'a2a_delegation_count_limit',
          );
        if (String(error).includes('A2A_PARENT_PREDECESSOR_NOT_REVIEWABLE'))
          throw new A2ADelegationStoreError(
            '前段Agentの同一親job成果が確認できないか、すでに次の委任へ接続されています。',
            'a2a_predecessor_conflict',
          );
        if (String(error).includes('idx_agent_delegation_predecessor') ||
          String(error).includes('agent_delegations.predecessor_delegation_id'))
          throw new A2ADelegationStoreError(
            'この前段Agent成果から作成できる後続委任は1件までです。',
            'a2a_predecessor_conflict',
          );
        if (
          String(error).includes('idx_agent_delegation_owner_message') ||
          String(error).includes('UNIQUE constraint failed')
        )
          throw new A2ADelegationStoreError(
            'message IDまたは重複防止IDが別の委任で使用されています。',
            'delegation_id_conflict',
          );
        throw error;
      }
      const existing = await db
        .prepare(`SELECT id, owner_user_id AS ownerUserId, parent_job_id AS parentJobId,
        predecessor_delegation_id AS predecessorDelegationId,
        idempotency_key AS idempotencyKey, message_id AS messageId, target_origin AS targetOrigin,
        target_agent_name AS targetAgentName, target_agent_version AS targetAgentVersion,
        protocol_version AS protocolVersion, input_sha256 AS inputSha256,
        authorization_sha256 AS authorizationSha256, price_quote_digest AS priceQuoteDigest,
      price_quote_json AS priceQuoteJson, package_runtime_binding_id AS packageRuntimeBindingId,
      package_runtime_binding_digest AS packageRuntimeBindingDigest, budget_currency AS budgetCurrency,
        budget_limit_minor AS budgetLimitMinor,
        parent_budget_limit_minor AS parentBudgetLimitMinor,
        continue_while_device_offline AS continueWhileDeviceOffline,
        deadline_at AS deadlineAt, state,
        remote_task_id AS remoteTaskId, remote_context_id AS remoteContextId,
        remote_state AS remoteState, artifacts_captured AS artifactsCaptured,
        revision, created_at AS createdAt, updated_at AS updatedAt
        FROM agent_delegations WHERE owner_user_id = ? AND idempotency_key = ?`)
        .bind(ownerUserId, input.idempotencyKey)
        .first<A2ADelegationRow>()
        .then(normalizeDelegation);
      if (existing) {
        if (!sameIntent(existing, input))
          throw new A2ADelegationStoreError(
            '同じ重複防止IDに異なる委任条件は使えません。',
            'delegation_idempotency_conflict',
          );
        return { delegation: existing, created };
      }
      return { delegation: null, created };
    },
    async claimDispatch(ownerUserId: string, id: string, now = Date.now()) {
      const current = await get(ownerUserId, id);
      if (!current || current.state !== 'prepared') return null;
      if (current.deadlineAt <= now)
        return update(
          ownerUserId,
          id,
          current.revision,
          ['prepared'],
          'deadline_expired',
          {
            state: 'expired',
            updatedAt: now,
          },
        ).then(() => null);
      const [pool, reservation] = await Promise.all([
        getBudget(ownerUserId, current.parentJobId),
        getBudgetReservation(ownerUserId, id),
      ]);
      if (
        !pool ||
        !reservation ||
        reservation.state !== 'held' ||
        pool.currency !== current.budgetCurrency ||
        pool.budgetLimitMinor !== current.parentBudgetLimitMinor ||
        reservation.currency !== current.budgetCurrency ||
        reservation.parentJobId !== current.parentJobId ||
        reservation.reservedMinor !== current.budgetLimitMinor ||
        pool.reservedMinor + pool.settledMinor > pool.budgetLimitMinor
      )
        return update(
          ownerUserId,
          id,
          current.revision,
          ['prepared'],
          'budget_reservation_failed',
          {
            state: 'remote_failed',
            updatedAt: now,
            remoteState: 'PREFLIGHT_FAILED_BEFORE_SEND',
          },
        ).then(() => null);
      return update(
        ownerUserId,
        id,
        current.revision,
        ['prepared'],
        'dispatch_claimed',
        {
          state: 'dispatching',
          updatedAt: now,
        },
      );
    },
    async approve(
      ownerUserId: string,
      id: string,
      authorizationSha256: string,
      encryptedInput: A2AStoredInput,
      now = Date.now(),
    ) {
      if (!hash.test(authorizationSha256))
        throw new A2ADelegationStoreError(
          '承認digestが不正です。',
          'invalid_approval_digest',
        );
      const current = await get(ownerUserId, id);
      if (!current) return null;
      if (current.state !== 'awaiting_approval')
        throw new A2ADelegationStoreError(
          'この委任は承認待ちではありません。',
          'delegation_not_awaiting_approval',
        );
      if (
        current.authorizationSha256.toLowerCase() !==
        authorizationSha256.toLowerCase()
      )
        throw new A2ADelegationStoreError(
          '表示した委任条件が変わっています。内容を再確認してください。',
          'approval_digest_mismatch',
        );
      if (
        encryptedInput.inputSha256.toLowerCase() !==
          current.inputSha256.toLowerCase() ||
        !hash.test(encryptedInput.inputSha256) ||
        !encryptedInput.ciphertext ||
        !encryptedInput.nonce ||
        !/^[a-z0-9._-]{1,64}$/i.test(encryptedInput.keyVersion)
      )
        throw new A2ADelegationStoreError(
          '暗号化した依頼本文がこの承認条件と一致しません。',
          'approval_input_mismatch',
        );
      if (current.deadlineAt <= now)
        return update(
          ownerUserId,
          id,
          current.revision,
          ['awaiting_approval'],
          'deadline_expired',
          {
            state: 'expired',
            updatedAt: now,
          },
        );
      const nextRevision = current.revision + 1;
      let results: Awaited<ReturnType<typeof db.batch>>;
      try {
        results = await db.batch([
          db.prepare(`INSERT INTO agent_delegation_budget_pools (
            owner_user_id, parent_job_id, currency, budget_limit_minor,
            reserved_minor, settled_minor, revision, created_at, updated_at
          ) SELECT d.owner_user_id, d.parent_job_id, d.budget_currency,
              d.parent_budget_limit_minor, 0, 0, 0, ?, ?
            FROM agent_delegations d
            WHERE d.owner_user_id = ? AND d.id = ? AND d.revision = ?
              AND d.state = 'awaiting_approval'
          ON CONFLICT(owner_user_id, parent_job_id) DO NOTHING`)
            .bind(now, now, ownerUserId, id, current.revision),
          db.prepare(`INSERT INTO agent_delegation_budget_reservations (
            delegation_id, owner_user_id, parent_job_id, currency,
            reserved_minor, settled_minor, state, created_at, updated_at
          ) SELECT d.id, d.owner_user_id, d.parent_job_id, d.budget_currency,
              d.budget_limit_minor, NULL, 'held', ?, ?
            FROM agent_delegations d JOIN agent_delegation_budget_pools p
              ON p.owner_user_id = d.owner_user_id
              AND p.parent_job_id = d.parent_job_id
              AND p.currency = d.budget_currency
              AND p.budget_limit_minor = d.parent_budget_limit_minor
            WHERE d.owner_user_id = ? AND d.id = ? AND d.revision = ?
              AND d.state = 'awaiting_approval'
              AND d.budget_limit_minor <= d.parent_budget_limit_minor
              AND p.reserved_minor + p.settled_minor + d.budget_limit_minor <= p.budget_limit_minor
          ON CONFLICT(delegation_id) DO NOTHING`)
            .bind(now, now, ownerUserId, id, current.revision),
          db.prepare(`INSERT INTO agent_delegation_inputs (
            delegation_id, owner_user_id, payload_ciphertext, nonce, input_sha256,
            key_version, expires_at, created_at
          ) SELECT ?, d.owner_user_id, ?, ?, ?, ?, ?, ? FROM agent_delegations d
            WHERE d.owner_user_id = ? AND d.id = ? AND d.revision = ? AND d.state = 'awaiting_approval'
              AND d.authorization_sha256 = ? AND d.input_sha256 = ?
              AND EXISTS (SELECT 1 FROM agent_delegation_budget_reservations r
                WHERE r.owner_user_id = d.owner_user_id
                  AND r.delegation_id = d.id AND r.state = 'held')
            `).bind(
            id, encryptedInput.ciphertext, encryptedInput.nonce,
            encryptedInput.inputSha256.toLowerCase(), encryptedInput.keyVersion,
            current.deadlineAt, now, ownerUserId, id, current.revision,
            current.authorizationSha256, current.inputSha256,
          ),
          db.prepare(`UPDATE agent_delegations SET state = 'prepared', revision = ?, updated_at = ?
            WHERE owner_user_id = ? AND id = ? AND revision = ? AND state = 'awaiting_approval'
              AND authorization_sha256 = ? AND input_sha256 = ?
              AND EXISTS (SELECT 1 FROM agent_delegation_budget_reservations r
                WHERE r.owner_user_id = agent_delegations.owner_user_id
                  AND r.delegation_id = agent_delegations.id AND r.state = 'held')`).bind(
            nextRevision, now, ownerUserId, id, current.revision,
            current.authorizationSha256, current.inputSha256,
          ),
          db.prepare(`INSERT INTO agent_delegation_events (
            id, delegation_id, owner_user_id, revision, event_type, from_state, to_state, remote_state, created_at
          ) SELECT ?, id, owner_user_id, ?, 'user_approved', 'awaiting_approval', 'prepared', NULL, ?
            FROM agent_delegations WHERE owner_user_id = ? AND id = ? AND revision = ? AND state = 'prepared'`)
            .bind(crypto.randomUUID(), nextRevision, now, ownerUserId, id, nextRevision),
        ]);
      } catch {
        const pool = await getBudget(ownerUserId, current.parentJobId);
        if (pool && (pool.currency !== current.budgetCurrency ||
          pool.budgetLimitMinor !== current.parentBudgetLimitMinor))
          throw new A2ADelegationStoreError(
            'この親jobには別の共通予算がすでに設定されています。',
            'parent_budget_mismatch',
          );
        throw new A2ADelegationStoreError(
          '親jobの共通予算枠を予約できませんでした。上限と利用中の予約を確認してください。',
          'parent_budget_reservation_failed',
        );
      }
      // Inserting a held reservation also updates the shared pool through a
      // trigger, so D1 can report more than one changed row for this statement.
      if ((results[1]?.meta.changes ?? 0) < 1) {
        const pool = await getBudget(ownerUserId, current.parentJobId);
        if (pool && (pool.currency !== current.budgetCurrency ||
          pool.budgetLimitMinor !== current.parentBudgetLimitMinor))
          throw new A2ADelegationStoreError(
            'この親jobには別の共通予算がすでに設定されています。',
            'parent_budget_mismatch',
          );
        throw new A2ADelegationStoreError(
          '親jobの共通予算上限に対して、追加の予約枠がありません。',
          'parent_budget_exceeded',
        );
      }
      if (results[2]?.meta.changes !== 1 || results[3]?.meta.changes !== 1)
        throw new A2ADelegationStoreError(
          '承認条件が同時に更新されました。状態を再読込してください。',
          'delegation_revision_conflict',
        );
      if (results[4]?.meta.changes !== 1)
        throw new A2ADelegationStoreError(
          '承認記録を保存できませんでした。',
          'delegation_event_write_failed',
        );
      return get(ownerUserId, id);
    },
    markIndeterminate(
      ownerUserId: string,
      id: string,
      revision: number,
      now = Date.now(),
    ) {
      return update(
        ownerUserId,
        id,
        revision,
        ['dispatch_submitting'],
        'dispatch_indeterminate',
        { state: 'indeterminate', updatedAt: now },
      );
    },
    markPreflightFailed(ownerUserId: string, id: string, revision: number, now = Date.now()) {
      return update(
        ownerUserId,
        id,
        revision,
        ['dispatching'],
        'dispatch_preflight_failed',
        {
          state: 'remote_failed',
          updatedAt: now,
          remoteState: 'PREFLIGHT_FAILED_BEFORE_SEND',
        },
      );
    },
    beginRemoteSend(ownerUserId: string, id: string, revision: number, now = Date.now()) {
      return update(
        ownerUserId,
        id,
        revision,
        ['dispatching'],
        'remote_send_claimed',
        { state: 'dispatch_submitting', updatedAt: now },
      );
    },
    beginCancelAttempt(ownerUserId: string, id: string, revision: number, now = Date.now()) {
      return update(
        ownerUserId,
        id,
        revision,
        ['cancel_requested'],
        'remote_cancel_claimed',
        { state: 'cancel_submitting', updatedAt: now },
      );
    },
    markCancelUnconfirmed(ownerUserId: string, id: string, revision: number, now = Date.now()) {
      return update(
        ownerUserId,
        id,
        revision,
        ['cancel_submitting'],
        'remote_cancel_unconfirmed',
        { state: 'cancel_unconfirmed', updatedAt: now },
      );
    },
    async recordTaskReceipt(
      ownerUserId: string,
      id: string,
      revision: number,
      task: {
        id: string;
        contextId?: string;
        state: keyof typeof remoteToLocal;
      },
      now = Date.now(),
    ) {
      const current = await get(ownerUserId, id);
      if (
        !current ||
        current.revision !== revision ||
        !['dispatching', 'dispatch_submitting', 'cancel_requested'].includes(current.state)
      )
        throw new A2ADelegationStoreError(
          '委任状態が同時に更新されました。',
          'delegation_revision_conflict',
        );
      if (!remoteToLocal[task.state])
        throw new A2ADelegationStoreError(
          'A2A taskの状態を認識できません。',
          'unknown_remote_task_state',
        );
      if (
        !task.id ||
        task.id.length > 256 ||
        (task.contextId && task.contextId.length > 256)
      )
        throw new A2ADelegationStoreError(
          'remote task IDが不正です。',
          'invalid_remote_task_id',
        );
      const state =
        current.state === 'cancel_requested'
          ? 'cancel_requested'
          : remoteToLocal[task.state];
      const eventType =
        current.state === 'cancel_requested'
          ? 'remote_task_received_during_cancel'
          : 'remote_task_received';
      return update(ownerUserId, id, revision, [current.state], eventType, {
        state,
        updatedAt: now,
        remoteTaskId: task.id,
        remoteContextId: task.contextId ?? null,
        remoteState: task.state,
      });
    },
    async reconcileRemoteTask(
      ownerUserId: string,
      id: string,
      revision: number,
      task: {
        id: string;
        contextId?: string;
        state: string;
      },
      now = Date.now(),
    ) {
      const mappedState = remoteToLocal[task.state];
      if (!mappedState)
        throw new A2ADelegationStoreError(
          'A2A taskの状態を認識できません。',
          'unknown_remote_task_state',
        );
      const current = await get(ownerUserId, id);
      if (!current || current.revision !== revision)
        throw new A2ADelegationStoreError(
          '委任状態が同時に更新されました。',
          'delegation_revision_conflict',
        );
      const cancelPending = [
        'cancel_requested',
        'cancel_submitting',
        'cancel_unconfirmed',
      ].includes(current.state);
      const state =
        cancelPending && !terminal.has(mappedState)
          ? 'cancel_unconfirmed'
          : mappedState;
      return update(
        ownerUserId,
        id,
        revision,
        [
          'indeterminate',
          'submitted',
          'working',
          'awaiting_remote_input',
          'cancel_requested',
          'cancel_submitting',
          'cancel_unconfirmed',
        ],
        'remote_task_reconciled',
        {
          state,
          updatedAt: now,
          remoteTaskId: task.id,
          remoteContextId: task.contextId ?? null,
          remoteState: task.state,
        },
      );
    },
    async requestCancel(ownerUserId: string, id: string, now = Date.now()) {
      const current = await get(ownerUserId, id);
      if (!current) return null;
      if (terminal.has(current.state)) return current;
      if (
        current.state === 'awaiting_approval' ||
        current.state === 'prepared' ||
        current.state === 'dispatching'
      )
        return update(
          ownerUserId,
          id,
          current.revision,
          [current.state],
          'cancelled_before_dispatch',
          {
            state: 'cancelled_before_dispatch',
            updatedAt: now,
            remoteState: 'NOT_DISPATCHED',
          },
        );
      if (
        current.state === 'cancel_requested' ||
        current.state === 'cancel_submitting' ||
        current.state === 'cancel_unconfirmed'
      )
        return current;
      return update(
        ownerUserId,
        id,
        current.revision,
        [current.state],
        'cancel_requested',
        { state: 'cancel_requested', updatedAt: now },
      );
    },
    async confirmCancelResult(
      ownerUserId: string,
      id: string,
      revision: number,
      remoteState: string,
      now = Date.now(),
    ) {
      const mappedState = remoteToLocal[remoteState];
      if (!mappedState)
        throw new A2ADelegationStoreError(
          '取消確認で予期しないremote状態を受け取りました。',
          'invalid_cancel_state',
        );
      const nextState =
        mappedState === 'remote_cancelled'
          ? 'remote_cancelled'
          : terminal.has(mappedState)
            ? mappedState
            : 'cancel_unconfirmed';
      return update(
        ownerUserId,
        id,
        revision,
        ['cancel_requested', 'cancel_submitting', 'cancel_unconfirmed'],
        'cancel_result',
        {
          state: nextState,
          updatedAt: now,
          remoteState,
        },
      );
    },
  };
}
