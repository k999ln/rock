import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const skyCommerceSellers = sqliteTable('sky_commerce_sellers', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  mode: text('mode').notNull(),
  accountId: text('account_id'),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_sky_commerce_seller_owner').on(table.userId, table.mode),
  uniqueIndex('idx_sky_commerce_seller_account').on(table.accountId),
]);

export const skyCommerceOffers = sqliteTable('sky_commerce_offers', {
  packageKey: text('package_key').notNull(),
  sellerUserId: text('seller_user_id').notNull(),
  mode: text('mode').notNull(),
  manifestSha256: text('manifest_sha256').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  currency: text('currency').notNull(),
  revision: integer('revision').notNull(),
  active: integer('active').notNull(),
  termsUrl: text('terms_url').notNull(),
  refundPolicy: text('refund_policy').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [uniqueIndex('idx_sky_commerce_offer_package').on(table.packageKey, table.mode)]);

export const skyCommerceOrders = sqliteTable('sky_commerce_orders', {
  id: text('id').primaryKey(),
  buyerUserId: text('buyer_user_id').notNull(),
  sellerUserId: text('seller_user_id').notNull(),
  mode: text('mode').notNull(),
  packageKey: text('package_key').notNull(),
  manifestSha256: text('manifest_sha256').notNull(),
  name: text('name').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  commissionMinor: integer('commission_minor').notNull(),
  refundedMinor: integer('refunded_minor').notNull().default(0),
  currency: text('currency').notNull(),
  accountId: text('account_id').notNull(),
  offerRevision: integer('offer_revision').notNull(),
  termsUrl: text('terms_url').notNull(),
  refundPolicy: text('refund_policy').notNull(),
  status: text('status').notNull(),
  activeKey: text('active_key'),
  sessionId: text('session_id'),
  paymentIntentId: text('payment_intent_id'),
  checkoutUrl: text('checkout_url'),
  receiptUrl: text('receipt_url'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_sky_commerce_order_active').on(table.activeKey),
  uniqueIndex('idx_sky_commerce_order_session').on(table.sessionId),
  uniqueIndex('idx_sky_commerce_order_payment').on(table.paymentIntentId),
  index('idx_sky_commerce_order_buyer').on(table.buyerUserId, table.mode, table.createdAt),
  index('idx_sky_commerce_order_seller').on(table.sellerUserId, table.mode, table.createdAt),
]);

export const skyCommerceEvents = sqliteTable('sky_commerce_events', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull(),
  status: text('status').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('idx_sky_commerce_event_order').on(table.orderId, table.createdAt)]);

export const fundPlans = sqliteTable('fund_plans', {
  userId: text('user_id').primaryKey(),
  plan: text('plan').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const toolRuns = sqliteTable(
  'tool_runs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    tool: text('tool').notNull(),
    sample: integer('sample', { mode: 'boolean' }).notNull().default(false),
    transport: text('transport').notNull(),
    status: text('status').notNull(),
    durationMs: integer('duration_ms').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_tool_runs_user_created').on(table.userId, table.createdAt),
  ],
);

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    tool: text('tool').notNull(),
    transport: text('transport').notNull(),
    sample: integer('sample').notNull(),
    status: text('status').notNull(),
    inputBytes: integer('input_bytes').notNull(),
    outputBytes: integer('output_bytes'),
    durationMs: integer('duration_ms'),
    errorCode: text('error_code'),
    deviceId: text('device_id'),
    createdAt: integer('created_at').notNull(),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
    deadline: integer('deadline').notNull(),
  },
  (table) => [
    index('idx_jobs_user_created').on(table.userId, table.createdAt),
    uniqueIndex('idx_jobs_one_active_user')
      .on(table.userId)
      .where(sql`${table.status} IN ('queued', 'running')`),
  ],
);
export const jobEvents = sqliteTable(
  'job_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobId: text('job_id').notNull(),
    userId: text('user_id').notNull(),
    status: text('status').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_events_job_status').on(table.jobId, table.status),
    index('idx_events_user').on(table.userId, table.id),
  ],
);
export const devices = sqliteTable(
  'devices',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull(),
    lastSeenAt: integer('last_seen_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_devices_user_seen').on(table.userId, table.lastSeenAt),
  ],
);
export const toolControls = sqliteTable(
  'tool_controls',
  {
    userId: text('user_id').notNull(),
    tool: text('tool').notNull(),
    enabled: integer('enabled').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_controls_user_tool').on(table.userId, table.tool),
  ],
);
export const bookRecords = sqliteTable(
  'book_records',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    amount: integer('amount').notNull(),
    source: text('source').notNull(),
    occurredOn: text('occurred_on').notNull(),
    reversesId: text('reverses_id'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_book_user_created').on(table.userId, table.createdAt),
    uniqueIndex('idx_book_reversal').on(table.reversesId),
  ],
);

export const workJobs = sqliteTable(
  'work_jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    payload: text('payload').notNull(),
    revision: integer('revision').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_work_jobs_user_updated').on(table.userId, table.updatedAt),
  ],
);

export const agentDelegations = sqliteTable(
  'agent_delegations',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id').notNull(),
    parentJobId: text('parent_job_id').notNull(),
    predecessorDelegationId: text('predecessor_delegation_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    messageId: text('message_id').notNull(),
    targetOrigin: text('target_origin').notNull(),
    targetAgentName: text('target_agent_name').notNull(),
    targetAgentVersion: text('target_agent_version').notNull(),
    protocolVersion: text('protocol_version').notNull(),
    inputSha256: text('input_sha256').notNull(),
    authorizationSha256: text('authorization_sha256').notNull(),
    priceQuoteDigest: text('price_quote_digest').notNull().default(''),
    priceQuoteJson: text('price_quote_json'),
    packageRuntimeBindingId: text('package_runtime_binding_id').notNull().default(''),
    packageRuntimeBindingDigest: text('package_runtime_binding_digest').notNull().default(''),
    budgetCurrency: text('budget_currency').notNull(),
    budgetLimitMinor: integer('budget_limit_minor').notNull(),
    parentBudgetLimitMinor: integer('parent_budget_limit_minor').notNull().default(0),
    continueWhileDeviceOffline: integer('continue_while_device_offline').notNull().default(0),
    deadlineAt: integer('deadline_at').notNull(),
    state: text('state').notNull(),
    remoteTaskId: text('remote_task_id'),
    remoteContextId: text('remote_context_id'),
    remoteState: text('remote_state'),
    artifactsCaptured: integer('artifacts_captured').notNull().default(0),
    revision: integer('revision').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_agent_delegation_owner_key').on(table.ownerUserId, table.idempotencyKey),
    uniqueIndex('idx_agent_delegation_owner_message').on(table.ownerUserId, table.messageId),
    uniqueIndex('idx_agent_delegation_price_quote_digest').on(table.priceQuoteDigest).where(sql`${table.priceQuoteDigest} <> ''`),
    index('idx_agent_delegation_package_binding').on(table.packageRuntimeBindingId, table.packageRuntimeBindingDigest),
    uniqueIndex('idx_agent_delegation_predecessor').on(table.predecessorDelegationId).where(sql`${table.predecessorDelegationId} IS NOT NULL`),
    index('idx_agent_delegation_parent_created').on(table.ownerUserId, table.parentJobId, table.createdAt),
    index('idx_agent_delegation_reconcile').on(table.state, table.updatedAt),
  ],
);

export const agentDelegationBudgetPools = sqliteTable(
  'agent_delegation_budget_pools',
  {
    ownerUserId: text('owner_user_id').notNull(),
    parentJobId: text('parent_job_id').notNull(),
    currency: text('currency').notNull(),
    budgetLimitMinor: integer('budget_limit_minor').notNull(),
    reservedMinor: integer('reserved_minor').notNull().default(0),
    settledMinor: integer('settled_minor').notNull().default(0),
    revision: integer('revision').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_a2a_budget_pool_owner_parent').on(
      table.ownerUserId,
      table.parentJobId,
    ),
  ],
);

export const agentDelegationBudgetReservations = sqliteTable(
  'agent_delegation_budget_reservations',
  {
    delegationId: text('delegation_id').primaryKey(),
    ownerUserId: text('owner_user_id').notNull(),
    parentJobId: text('parent_job_id').notNull(),
    currency: text('currency').notNull(),
    reservedMinor: integer('reserved_minor').notNull(),
    settledMinor: integer('settled_minor'),
    state: text('state').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_a2a_budget_reservation_parent').on(
      table.ownerUserId,
      table.parentJobId,
      table.state,
    ),
  ],
);

export const agentDelegationBrokerAuthorizations = sqliteTable(
  'agent_delegation_broker_authorizations',
  {
    delegationId: text('delegation_id').primaryKey(),
    ownerUserId: text('owner_user_id').notNull(),
    deviceRef: text('device_ref').notNull(),
    authorityId: text('authority_id').notNull(),
    keyId: text('key_id').notNull(),
    proofJson: text('proof_json').notNull(),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_a2a_broker_auth_owner').on(table.ownerUserId, table.delegationId),
    index('idx_a2a_broker_auth_expiry').on(table.expiresAt),
  ],
);

export const agentDelegationEvents = sqliteTable(
  'agent_delegation_events',
  {
    id: text('id').primaryKey(),
    delegationId: text('delegation_id').notNull(),
    ownerUserId: text('owner_user_id').notNull(),
    revision: integer('revision').notNull(),
    eventType: text('event_type').notNull(),
    fromState: text('from_state'),
    toState: text('to_state').notNull(),
    remoteState: text('remote_state'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_agent_delegation_event_revision').on(table.delegationId, table.revision),
    index('idx_agent_delegation_event_owner').on(table.ownerUserId, table.delegationId, table.createdAt),
  ],
);

export const agentDelegationInputs = sqliteTable(
  'agent_delegation_inputs',
  {
    delegationId: text('delegation_id').primaryKey(),
    ownerUserId: text('owner_user_id').notNull(),
    payloadCiphertext: text('payload_ciphertext').notNull(),
    nonce: text('nonce').notNull(),
    inputSha256: text('input_sha256').notNull(),
    keyVersion: text('key_version').notNull(),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_agent_delegation_input_owner_expiry').on(
      table.ownerUserId,
      table.expiresAt,
    ),
  ],
);

export const agentDelegationArtifacts = sqliteTable(
  'agent_delegation_artifacts',
  {
    id: text('id').primaryKey(),
    delegationId: text('delegation_id').notNull(),
    ownerUserId: text('owner_user_id').notNull(),
    remoteTaskId: text('remote_task_id').notNull(),
    artifactSha256: text('artifact_sha256').notNull(),
    payloadCiphertext: text('payload_ciphertext').notNull(),
    nonce: text('nonce').notNull(),
    keyVersion: text('key_version').notNull(),
    byteLength: integer('byte_length').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_agent_delegation_artifact_identity').on(
      table.ownerUserId,
      table.delegationId,
      table.remoteTaskId,
      table.artifactSha256,
    ),
    index('idx_agent_delegation_artifact_owner').on(
      table.ownerUserId,
      table.delegationId,
      table.createdAt,
    ),
  ],
);

export const coconalaTeamCases = sqliteTable(
  'coconala_team_cases',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    payload: text('payload').notNull(),
    revision: integer('revision').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_coconala_team_user_updated').on(table.userId, table.updatedAt),
  ],
);

export const skyToolSubmissions = sqliteTable(
  'sky_tool_submissions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    payload: text('payload').notNull(),
    status: text('status').notNull().default('submitted'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_sky_submissions_user_created').on(table.userId, table.createdAt),
  ],
);

export const skyConnections = sqliteTable(
  'sky_connections',
  {
    userId: text('user_id').notNull(),
    tool: text('tool').notNull(),
    scope: text('scope').notNull().default('execute'),
    consentVersion: text('consent_version').notNull(),
    connectedAt: integer('connected_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_sky_connections_user_tool').on(table.userId, table.tool),
    index('idx_sky_connections_user_connected').on(
      table.userId,
      table.connectedAt,
    ),
  ],
);

export const skyProviderConnections = sqliteTable(
  'sky_provider_connections',
  {
    userId: text('user_id').notNull(),
    provider: text('provider').notNull(),
    status: text('status').notNull().default('setup_required'),
    config: text('config').notNull().default('{}'),
    secretRef: text('secret_ref'),
    connectedAt: integer('connected_at'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_sky_provider_connections_user_provider').on(
      table.userId,
      table.provider,
    ),
    index('idx_sky_provider_connections_user_updated').on(
      table.userId,
      table.updatedAt,
    ),
  ],
);

export const remoteAiRateLimits = sqliteTable(
  'sky_remote_ai_rate_limits',
  {
    userId: text('user_id').notNull(),
    route: text('route').notNull(),
    windowStartedAt: integer('window_started_at').notNull(),
    requestCount: integer('request_count').notNull(),
  },
  (table) => [
    uniqueIndex('idx_remote_ai_rate_limits_user_route').on(
      table.userId,
      table.route,
    ),
    index('idx_remote_ai_rate_limits_window').on(table.windowStartedAt),
  ],
);

export const remoteAiRateCards = sqliteTable(
  'remote_ai_rate_cards',
  {
    providerId: text('provider_id').notNull(),
    cardId: text('card_id').notNull(),
    keyId: text('key_id').notNull(),
    modelId: text('model_id').notNull(),
    currency: text('currency').notNull(),
    pricingVersion: text('pricing_version').notNull(),
    effectiveAt: integer('effective_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    digest: text('digest').notNull(),
    cardJson: text('card_json').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: integer('created_at').notNull(),
    createdBy: text('created_by').notNull(),
    revokedAt: integer('revoked_at'),
    revokedBy: text('revoked_by'),
  },
  (table) => [
    primaryKey({ columns: [table.providerId, table.cardId], name: 'pk_remote_ai_rate_cards' }),
    index('idx_remote_ai_rate_card_lookup').on(
      table.providerId, table.modelId, table.currency, table.status, table.effectiveAt,
    ),
    uniqueIndex('idx_remote_ai_rate_card_digest').on(table.digest),
    check('remote_ai_rate_card_digest_check', sql`length(${table.digest}) = 64`),
    check('remote_ai_rate_card_currency_check', sql`${table.currency} GLOB '[A-Z][A-Z][A-Z]'`),
    check('remote_ai_rate_card_validity_check', sql`${table.expiresAt} > ${table.effectiveAt}`),
    check('remote_ai_rate_card_status_check', sql`${table.status} IN ('active', 'revoked')`),
    check('remote_ai_rate_card_revocation_check', sql`(${table.status} = 'active' AND ${table.revokedAt} IS NULL AND ${table.revokedBy} IS NULL) OR (${table.status} = 'revoked' AND ${table.revokedAt} IS NOT NULL AND ${table.revokedBy} IS NOT NULL)`),
  ],
);

export const remoteAiTextExecutions = sqliteTable(
  'remote_ai_text_executions',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id').notNull(),
    requestId: text('request_id').notNull(),
    parentJobId: text('parent_job_id').notNull(),
    modelId: text('model_id').notNull(),
    cardId: text('card_id').notNull(),
    rateCardDigest: text('rate_card_digest').notNull(),
    quoteDigest: text('quote_digest').notNull(),
    approvalDigest: text('approval_digest').notNull(),
    quoteJson: text('quote_json').notNull(),
    rateCardJson: text('rate_card_json').notNull(),
    currency: text('currency').notNull(),
    maximumChargeMinor: integer('maximum_charge_minor').notNull(),
    approvedCapMinor: integer('approved_cap_minor').notNull(),
    parentBudgetLimitMinor: integer('parent_budget_limit_minor').notNull(),
    saveResult: integer('save_result').notNull().default(0),
    state: text('state').notNull().default('quoted'),
    settledMinor: integer('settled_minor'),
    usageJson: text('usage_json'),
    observationJson: text('observation_json'),
    priceJson: text('price_json'),
    providerResponseId: text('provider_response_id'),
    resultText: text('result_text'),
    durationMs: integer('duration_ms'),
    errorCode: text('error_code'),
    revision: integer('revision').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_remote_ai_text_owner_request').on(table.ownerUserId, table.requestId),
    uniqueIndex('idx_remote_ai_text_quote').on(table.quoteDigest),
    uniqueIndex('idx_remote_ai_text_response').on(table.providerResponseId),
    index('idx_remote_ai_text_owner_parent').on(table.ownerUserId, table.parentJobId, table.createdAt),
    check('remote_ai_text_budget_check', sql`${table.maximumChargeMinor} >= 0 AND ${table.maximumChargeMinor} <= ${table.approvedCapMinor} AND ${table.approvedCapMinor} <= ${table.parentBudgetLimitMinor}`),
    check('remote_ai_text_state_check', sql`${table.state} IN ('quoted','reserved','sending','completed','unreconciled','cancelled','expired')`),
    check('remote_ai_text_save_check', sql`${table.saveResult} IN (0,1) AND (${table.saveResult} = 1 OR ${table.resultText} IS NULL)`),
  ],
);

export const remoteAiTextInputs = sqliteTable(
  'remote_ai_text_inputs',
  {
    executionId: text('execution_id').primaryKey().references(() => remoteAiTextExecutions.id),
    ownerUserId: text('owner_user_id').notNull(),
    ciphertext: text('ciphertext').notNull(),
    nonce: text('nonce').notNull(),
    inputSha256: text('input_sha256').notNull(),
    keyVersion: text('key_version').notNull(),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_remote_ai_text_input_owner_execution').on(table.ownerUserId, table.executionId),
    check('remote_ai_text_input_digest_check', sql`length(${table.inputSha256}) = 64`),
    check('remote_ai_text_input_key_version_check', sql`${table.keyVersion} = 'aes-256-gcm-v1'`),
  ],
);

export const remoteAiTextSendClaims = sqliteTable(
  'remote_ai_text_send_claims',
  {
    executionId: text('execution_id').primaryKey().references(() => remoteAiTextExecutions.id),
    ownerUserId: text('owner_user_id').notNull(),
    claimedAt: integer('claimed_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_remote_ai_text_send_claim_owner_execution').on(table.ownerUserId, table.executionId),
  ],
);

export const mercariRevenuePlans = sqliteTable(
  'mercari_revenue_plans',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    payload: text('payload').notNull(),
    revision: integer('revision').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_mercari_revenue_user_updated').on(table.userId, table.updatedAt),
  ],
);

export const automationFunds = sqliteTable(
  'automation_funds',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    strategy: text('strategy').notNull(),
    targetToolCount: integer('target_tool_count').notNull(),
    payload: text('payload').notNull(),
    status: text('status').notNull(),
    revision: integer('revision').notNull().default(0),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_automation_funds_user_updated').on(
      table.userId,
      table.updatedAt,
    ),
    uniqueIndex('idx_automation_funds_user_idempotency').on(
      table.userId,
      table.idempotencyKey,
    ),
  ],
);

export const automationFundMemberships = sqliteTable(
  'automation_fund_memberships',
  {
    userId: text('user_id').primaryKey(),
    fundId: text('fund_id').notNull(),
    revision: integer('revision').notNull().default(0),
    joinedAt: text('joined_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_automation_fund_memberships_fund').on(table.fundId)],
);

export const marketplaceAssets = sqliteTable(
  'marketplace_assets',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull(),
    unit: text('unit').notNull(),
    referencePriceMinor: integer('reference_price_minor').notNull(),
    status: text('status').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_marketplace_assets_created').on(table.createdAt),
    index('idx_marketplace_assets_user').on(table.userId, table.createdAt),
  ],
);

export const marketplaceProposals = sqliteTable(
  'marketplace_proposals',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    assetId: text('asset_id').notNull(),
    side: text('side').notNull(),
    priceMinor: integer('price_minor').notNull(),
    quantity: integer('quantity').notNull(),
    mode: text('mode').notNull(),
    expiresAt: text('expires_at').notNull(),
    notionalMinor: integer('notional_minor').notNull(),
    requestJson: text('request_json').notNull(),
    proposalDigest: text('proposal_digest').notNull(),
    riskJson: text('risk_json').notNull(),
    status: text('status').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_marketplace_proposal_idempotency').on(
      table.userId,
      table.idempotencyKey,
    ),
    uniqueIndex('idx_marketplace_proposal_digest').on(table.proposalDigest),
    index('idx_marketplace_proposal_user').on(table.userId, table.updatedAt),
  ],
);

export const marketplaceApprovals = sqliteTable(
  'marketplace_approvals',
  {
    id: text('id').primaryKey(),
    proposalId: text('proposal_id').notNull(),
    userId: text('user_id').notNull(),
    proposalDigest: text('proposal_digest').notNull(),
    decision: text('decision').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_marketplace_approval_proposal').on(table.proposalId),
    index('idx_marketplace_approval_user').on(table.userId, table.createdAt),
  ],
);

export const marketplaceReservations = sqliteTable(
  'marketplace_reservations',
  {
    proposalId: text('proposal_id').primaryKey(),
    userId: text('user_id').notNull(),
    heldMinor: integer('held_minor').notNull(),
    state: text('state').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_marketplace_reservation_user').on(table.userId, table.updatedAt),
  ],
);

export const marketplaceReceipts = sqliteTable(
  'marketplace_receipts',
  {
    proposalId: text('proposal_id').primaryKey(),
    receiptId: text('receipt_id').notNull(),
    userId: text('user_id').notNull(),
    executionKey: text('execution_key').notNull(),
    receiptJson: text('receipt_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_marketplace_receipt_id').on(table.receiptId),
    uniqueIndex('idx_marketplace_execution_key').on(
      table.userId,
      table.executionKey,
    ),
  ],
);

export const marketplacePositions = sqliteTable(
  'marketplace_positions',
  {
    id: text('id').primaryKey(),
    proposalId: text('proposal_id').notNull(),
    userId: text('user_id').notNull(),
    assetId: text('asset_id').notNull(),
    side: text('side').notNull(),
    quantity: integer('quantity').notNull(),
    entryPriceMinor: integer('entry_price_minor').notNull(),
    notionalMinor: integer('notional_minor').notNull(),
    status: text('status').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_marketplace_position_proposal').on(table.proposalId),
    index('idx_marketplace_position_user').on(table.userId, table.createdAt),
  ],
);

export const marketplaceEvents = sqliteTable(
  'marketplace_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    subjectId: text('subject_id').notNull(),
    payload: text('payload').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_marketplace_events_user').on(table.userId, table.createdAt),
    index('idx_marketplace_events_subject').on(
      table.subjectId,
      table.createdAt,
    ),
  ],
);

export const csvJobs = sqliteTable(
  'csv_jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    status: text('status').notNull(),
    paymentStatus: text('payment_status').notNull(),
    paymentMethod: text('payment_method'),
    paymentReference: text('payment_reference'),
    inputName: text('input_name').notNull(),
    inputKey: text('input_key').notNull(),
    inputBytes: integer('input_bytes').notNull(),
    inputSha256: text('input_sha256').notNull(),
    inputEncoding: text('input_encoding').notNull(),
    specificationJson: text('specification_json').notNull(),
    quoteMinor: integer('quote_minor').notNull(),
    currency: text('currency').notNull(),
    resultKey: text('result_key'),
    safeResultKey: text('safe_result_key'),
    reportJsonKey: text('report_json_key'),
    reportHtmlKey: text('report_html_key'),
    outputSha256: text('output_sha256'),
    validationJson: text('validation_json'),
    attempt: integer('attempt').notNull().default(0),
    revision: integer('revision').notNull().default(0),
    errorCode: text('error_code'),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    acceptedAt: integer('accepted_at'),
    completedAt: integer('completed_at'),
  },
  (table) => [
    index('idx_csv_jobs_user_updated').on(table.userId, table.updatedAt),
    index('idx_csv_jobs_status_updated').on(table.status, table.updatedAt),
    uniqueIndex('idx_csv_jobs_input_key').on(table.inputKey),
  ],
);

export const csvJobEvents = sqliteTable(
  'csv_job_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    jobId: text('job_id').notNull(),
    userId: text('user_id').notNull(),
    event: text('event').notNull(),
    detailJson: text('detail_json').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_csv_events_job').on(table.jobId, table.id),
    index('idx_csv_events_user').on(table.userId, table.id),
  ],
);

export const csvBillingAccounts = sqliteTable('csv_billing_accounts', {
  userId: text('user_id').primaryKey(),
  billingAccountId: text('billing_account_id').notNull(),
  contractId: text('contract_id').notNull(),
  policyVersion: text('policy_version').notNull(),
  status: text('status').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const csvMonthlyFees = sqliteTable(
  'csv_monthly_fees',
  {
    id: text('id').primaryKey(),
    billingAccountId: text('billing_account_id').notNull(),
    monthJst: text('month_jst').notNull(),
    verifiedNetUsdMinor: integer('verified_net_usd_minor').notNull(),
    feeDueUsdMinor: integer('fee_due_usd_minor').notNull(),
    status: text('status').notNull(),
    providerEvidence: text('provider_evidence').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_csv_fee_account_month').on(
      table.billingAccountId,
      table.monthJst,
    ),
  ],
);

export const skyDeveloperTokens = sqliteTable(
  'sky_developer_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    label: text('label').notNull(),
    tokenSha256: text('token_sha256').notNull(),
    createdAt: integer('created_at').notNull(),
    lastUsedAt: integer('last_used_at'),
    revokedAt: integer('revoked_at'),
  },
  (table) => [
    uniqueIndex('idx_sky_developer_token_hash').on(table.tokenSha256),
    index('idx_sky_developer_token_owner').on(table.userId, table.createdAt),
  ],
);

export const rockstarDeviceAuthorizations = sqliteTable(
  'rockstar_device_authorizations',
  {
    id: text('id').primaryKey(),
    userCodeSha256: text('user_code_sha256').notNull(),
    deviceCodeSha256: text('device_code_sha256').notNull(),
    clientName: text('client_name').notNull(),
    status: text('status').notNull(),
    userId: text('user_id'),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    lastPolledAt: integer('last_polled_at'),
    approvedAt: integer('approved_at'),
    consumedAt: integer('consumed_at'),
  },
  (table) => [
    uniqueIndex('idx_rockstar_device_auth_user_code').on(table.userCodeSha256),
    uniqueIndex('idx_rockstar_device_auth_device_code').on(table.deviceCodeSha256),
    index('idx_rockstar_device_auth_expiry').on(table.status, table.expiresAt),
  ],
);

export const rockstarDeviceSessions = sqliteTable(
  'rockstar_device_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    deviceName: text('device_name').notNull(),
    tokenSha256: text('token_sha256').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    lastUsedAt: integer('last_used_at'),
    revokedAt: integer('revoked_at'),
  },
  (table) => [
    uniqueIndex('idx_rockstar_device_session_token').on(table.tokenSha256),
    index('idx_rockstar_device_session_owner').on(table.userId, table.revokedAt, table.expiresAt),
  ],
);

export const rockstarA2ABrokerEnrollmentChallenges = sqliteTable(
  'rockstar_a2a_broker_enrollment_challenges',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id').notNull(),
    deviceRef: text('device_ref').notNull(),
    nonceSha256: text('nonce_sha256').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    consumedAt: integer('consumed_at'),
  },
  (table) => [
    index('idx_rockstar_a2a_broker_challenge_owner').on(table.ownerUserId, table.deviceRef, table.createdAt),
    index('idx_rockstar_a2a_broker_challenge_expiry').on(table.consumedAt, table.expiresAt),
    check('rockstar_a2a_broker_challenge_nonce_check', sql`length(${table.nonceSha256}) = 64`),
    check('rockstar_a2a_broker_challenge_expiry_check', sql`${table.expiresAt} > ${table.createdAt} AND ${table.expiresAt} <= ${table.createdAt} + 300000`),
  ],
);

export const rockstarA2ABrokerDevices = sqliteTable(
  'rockstar_a2a_broker_devices',
  {
    authorityId: text('authority_id').notNull(),
    ownerUserId: text('owner_user_id').notNull(),
    deviceRef: text('device_ref').notNull(),
    keyId: text('key_id').notNull(),
    algorithm: text('algorithm').notNull(),
    publicKeyHex: text('public_key_hex').notNull(),
    publicKeySha256: text('public_key_sha256').notNull(),
    applicationPackage: text('application_package').notNull(),
    minimumApplicationVersion: text('minimum_application_version').notNull(),
    signingCertificateSha256: text('signing_certificate_sha256').notNull(),
    securityLevel: text('security_level').notNull(),
    verifiedBootState: text('verified_boot_state').notNull(),
    attestedAt: integer('attested_at').notNull(),
    registeredAt: integer('registered_at').notNull(),
    status: text('status').notNull().default('active'),
    revokedAt: integer('revoked_at'),
  },
  (table) => [
    primaryKey({ columns: [table.ownerUserId, table.deviceRef, table.keyId], name: 'pk_rockstar_a2a_broker_devices' }),
    uniqueIndex('idx_rockstar_a2a_broker_device_fingerprint').on(table.authorityId, table.keyId),
    index('idx_rockstar_a2a_broker_device_owner').on(table.ownerUserId, table.deviceRef, table.status),
    check('rockstar_a2a_broker_device_algorithm_check', sql`${table.algorithm} = 'ES256'`),
    check('rockstar_a2a_broker_device_public_check', sql`length(${table.publicKeyHex}) = 130 AND substr(${table.publicKeyHex}, 1, 2) = '04'`),
    check('rockstar_a2a_broker_device_fingerprint_check', sql`length(${table.publicKeySha256}) = 64 AND ${table.keyId} = ${table.publicKeySha256}`),
    check('rockstar_a2a_broker_device_signer_check', sql`${table.applicationPackage} = 'dev.rock.automation' AND length(${table.signingCertificateSha256}) = 64`),
    check('rockstar_a2a_broker_device_version_check', sql`${table.minimumApplicationVersion} <> '' AND ${table.minimumApplicationVersion} NOT GLOB '*[^0-9]*' AND length(${table.minimumApplicationVersion}) <= 9`),
    check('rockstar_a2a_broker_device_security_check', sql`${table.securityLevel} IN ('TRUSTED_ENVIRONMENT', 'STRONG_BOX')`),
    check('rockstar_a2a_broker_device_boot_check', sql`${table.verifiedBootState} = 'VERIFIED'`),
    check('rockstar_a2a_broker_device_status_check', sql`${table.status} IN ('active', 'revoked')`),
    check('rockstar_a2a_broker_device_revoked_check', sql`(${table.status} = 'active' AND ${table.revokedAt} IS NULL) OR (${table.status} = 'revoked' AND ${table.revokedAt} IS NOT NULL)`),
  ],
);

export const skyToolPackages = sqliteTable(
  'sky_tool_packages',
  {
    packageKey: text('package_key').primaryKey(),
    toolId: text('tool_id').notNull(),
    version: text('version').notNull(),
    userId: text('user_id').notNull(),
    manifest: text('manifest').notNull(),
    manifestSha256: text('manifest_sha256').notNull(),
    status: text('status').notNull().default('submitted'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    publishedAt: integer('published_at'),
  },
  (table) => [
    uniqueIndex('idx_sky_tool_id_version').on(table.toolId, table.version),
    index('idx_sky_tool_owner_created').on(table.userId, table.createdAt),
    index('idx_sky_tool_registry_published').on(table.status, table.publishedAt),
  ],
);

export const skyToolPackageReviews = sqliteTable(
  'sky_tool_package_reviews',
  {
    id: text('id').primaryKey(),
    packageKey: text('package_key').notNull(),
    manifestSha256: text('manifest_sha256').notNull(),
    reviewerId: text('reviewer_id').notNull(),
    decision: text('decision').notNull(),
    sourceRevision: text('source_revision'),
    sourceSha256: text('source_sha256'),
    checksJson: text('checks_json').notNull(),
    evidenceJson: text('evidence_json').notNull(),
    notes: text('notes').notNull(),
    reviewedAt: integer('reviewed_at').notNull(),
    expiresAt: integer('expires_at'),
  },
  (table) => [
    index('idx_sky_tool_reviews_package_time').on(
      table.packageKey,
      table.reviewedAt,
    ),
    index('idx_sky_tool_reviews_decision_expiry').on(
      table.decision,
      table.expiresAt,
    ),
  ],
);

export const skyToolEvents = sqliteTable(
  'sky_tool_events',
  {
    id: text('id').primaryKey(),
    packageKey: text('package_key').notNull(),
    ownerUserId: text('owner_user_id').notNull(),
    toolName: text('tool_name').notNull(),
    installationId: text('installation_id').notNull(),
    outcome: text('outcome').notNull(),
    durationMs: integer('duration_ms').notNull(),
    occurredAt: text('occurred_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_sky_tool_events_owner_time').on(table.ownerUserId, table.occurredAt),
    index('idx_sky_tool_events_package_time').on(table.packageKey, table.occurredAt),
  ],
);

export const skyActivationCodes = sqliteTable(
  'sky_activation_codes',
  {
    id: text('id').primaryKey(),
    packageKey: text('package_key').notNull(),
    userId: text('user_id').notNull(),
    label: text('label').notNull(),
    codeSha256: text('code_sha256').notNull(),
    maxUses: integer('max_uses').notNull(),
    usedCount: integer('used_count').notNull().default(0),
    status: text('status').notNull().default('active'),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at'),
    revokedAt: integer('revoked_at'),
  },
  (table) => [
    uniqueIndex('idx_sky_activation_code_hash').on(table.codeSha256),
    index('idx_sky_activation_owner_created').on(table.userId, table.createdAt),
    index('idx_sky_activation_package_status').on(table.packageKey, table.status),
  ],
);

export const skyToolGrants = sqliteTable(
  'sky_tool_grants',
  {
    id: text('id').primaryKey(),
    packageKey: text('package_key').notNull(),
    activationCodeId: text('activation_code_id').notNull(),
    telegramUserId: text('telegram_user_id').notNull(),
    telegramChatId: text('telegram_chat_id').notNull(),
    botUsername: text('bot_username'),
    status: text('status').notNull().default('active'),
    grantedAt: integer('granted_at').notNull(),
    expiresAt: integer('expires_at'),
  },
  (table) => [
    uniqueIndex('idx_sky_grant_package_telegram').on(
      table.packageKey,
      table.telegramUserId,
    ),
    index('idx_sky_grant_telegram_status').on(
      table.telegramUserId,
      table.status,
    ),
    index('idx_sky_grant_code').on(table.activationCodeId),
  ],
);

export const skyA2aAgentConnections = sqliteTable(
  'sky_a2a_agent_connections',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id').notNull(),
    origin: text('origin').notNull(),
    cardUrl: text('card_url').notNull(),
    agentName: text('agent_name').notNull(),
    agentVersion: text('agent_version').notNull(),
    cardSha256: text('card_sha256').notNull(),
    cardJson: text('card_json').notNull(),
    discoveredAt: integer('discovered_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_sky_a2a_agent_owner_origin_name').on(
      table.ownerUserId,
      table.origin,
      table.agentName,
    ),
    index('idx_sky_a2a_agent_owner_discovered').on(
      table.ownerUserId,
      table.discoveredAt,
    ),
  ],
);

export const skyPackageRuntimeBindings = sqliteTable(
  'sky_package_runtime_bindings',
  {
    bindingId: text('binding_id').primaryKey(),
    providerId: text('provider_id').notNull(),
    keyId: text('key_id').notNull(),
    agentOrigin: text('agent_origin').notNull(),
    packageKey: text('package_key').notNull(),
    manifestSha256: text('manifest_sha256').notNull(),
    digest: text('digest').notNull(),
    bindingJson: text('binding_json').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: integer('created_at').notNull(),
    createdBy: text('created_by').notNull(),
    revokedAt: integer('revoked_at'),
    revokedBy: text('revoked_by'),
  },
  (table) => [
    uniqueIndex('idx_sky_package_runtime_binding_digest').on(table.digest),
    index('idx_sky_package_runtime_binding_lookup').on(
      table.agentOrigin, table.packageKey, table.manifestSha256, table.status,
    ),
    check('sky_package_runtime_binding_hash_check', sql`length(${table.manifestSha256}) = 64 AND length(${table.digest}) = 64`),
    check('sky_package_runtime_binding_json_check', sql`json_valid(${table.bindingJson})`),
    check('sky_package_runtime_binding_status_check', sql`${table.status} IN ('active', 'revoked')`),
    check('sky_package_runtime_binding_revocation_check', sql`(${table.status} = 'active' AND ${table.revokedAt} IS NULL AND ${table.revokedBy} IS NULL) OR (${table.status} = 'revoked' AND ${table.revokedAt} IS NOT NULL AND ${table.revokedBy} IS NOT NULL)`),
  ],
);

export const a2aUsageReceipts = sqliteTable(
  'a2a_usage_receipts',
  {
    delegationId: text('delegation_id').primaryKey(),
    ownerUserId: text('owner_user_id').notNull(),
    parentJobId: text('parent_job_id').notNull(),
    providerId: text('provider_id').notNull(),
    providerReference: text('provider_reference').notNull(),
    receiptJson: text('receipt_json').notNull(),
    currency: text('currency').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    issuedAt: integer('issued_at').notNull(),
    receivedAt: integer('received_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_a2a_usage_provider_reference').on(
      table.providerId,
      table.providerReference,
    ),
    index('idx_a2a_usage_owner_parent').on(
      table.ownerUserId,
      table.parentJobId,
      table.receivedAt,
    ),
  ],
);

export const a2aLiveUsageSnapshots = sqliteTable(
  'a2a_live_usage_snapshots',
  {
    delegationId: text('delegation_id').notNull(),
    sequence: integer('sequence').notNull(),
    ownerUserId: text('owner_user_id').notNull(),
    parentJobId: text('parent_job_id').notNull(),
    providerId: text('provider_id').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    currency: text('currency').notNull(),
    cumulativeAmountMinor: integer('cumulative_amount_minor').notNull(),
    pricingVersion: text('pricing_version').notNull(),
    issuedAt: integer('issued_at').notNull(),
    receivedAt: integer('received_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.delegationId, table.sequence] }),
    uniqueIndex('idx_a2a_live_usage_event').on(table.providerId, table.providerEventId),
    index('idx_a2a_live_usage_owner_parent').on(
      table.ownerUserId, table.parentJobId, table.delegationId, table.sequence,
    ),
  ],
);

export const a2aPriceQuoteConsentEvents = sqliteTable(
  'a2a_price_quote_consent_events',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id').notNull(),
    quoteRequestId: text('quote_request_id').notNull(),
    agentConnectionId: text('agent_connection_id').notNull(),
    agentOrigin: text('agent_origin').notNull(),
    agentName: text('agent_name').notNull(),
    agentVersion: text('agent_version').notNull(),
    agentCardSha256: text('agent_card_sha256').notNull(),
    promptSha256: text('prompt_sha256').notNull(),
    currency: text('currency').notNull(),
    maximumBudgetMinor: integer('maximum_budget_minor').notNull(),
    expiresAt: integer('expires_at').notNull(),
    consentVersion: text('consent_version').notNull(),
    consentedAt: integer('consented_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_a2a_quote_consent_owner_request').on(table.ownerUserId, table.quoteRequestId),
    index('idx_a2a_quote_consent_owner_time').on(table.ownerUserId, table.consentedAt),
    check('a2a_quote_consent_hash_check', sql`length(${table.agentCardSha256}) = 64 AND length(${table.promptSha256}) = 64`),
    check('a2a_quote_consent_currency_check', sql`${table.currency} GLOB '[A-Z][A-Z][A-Z]'`),
    check('a2a_quote_consent_budget_check', sql`${table.maximumBudgetMinor} > 0 AND ${table.maximumBudgetMinor} <= 100000000`),
    check('a2a_quote_consent_version_check', sql`${table.consentVersion} = 'a2a-price-quote-prompt-disclosure-v1'`),
  ],
);

export const esimProviderWebhookInbox = sqliteTable(
  'esim_provider_webhook_inbox',
  {
    callbackDigest: text('callback_digest').primaryKey(),
    provider: text('provider').notNull(),
    eventType: text('event_type').notNull(),
    receivedAt: integer('received_at').notNull(),
    state: text('state').notNull(),
    profileDigest: text('profile_digest'),
    installMaterialCiphertext: text('install_material_ciphertext'),
    installMaterialNonce: text('install_material_nonce'),
    installMaterialDeliveryKeyHash: text('install_material_delivery_key_hash'),
    installMaterialDeliveredAt: integer('install_material_delivered_at'),
    ownerUserId: text('owner_user_id'),
    skyOrderId: text('sky_order_id'),
  },
  (table) => [
    index('idx_esim_webhook_inbox_state_received').on(table.state, table.receivedAt),
    index('idx_esim_webhook_inbox_order').on(table.skyOrderId, table.receivedAt),
    check('esim_webhook_provider_check', sql`${table.provider} = 'esim-go-v3'`),
    check('esim_webhook_state_check', sql`${table.state} IN ('received', 'reconciliation_required')`),
    check('esim_webhook_digest_check', sql`length(${table.callbackDigest}) = 64`),
    check('esim_webhook_profile_digest_check', sql`${table.profileDigest} IS NULL OR length(${table.profileDigest}) = 64`),
    check('esim_webhook_owner_order_pair_check', sql`(${table.ownerUserId} IS NULL) = (${table.skyOrderId} IS NULL)`),
  ],
);

export const esimProviderProfileBindings = sqliteTable(
  'esim_provider_profile_bindings',
  {
    profileDigest: text('profile_digest').primaryKey(),
    provider: text('provider').notNull(),
    ownerUserId: text('owner_user_id').notNull(),
    skyOrderId: text('sky_order_id').notNull(),
    packageKey: text('package_key').notNull(),
    manifestSha256: text('manifest_sha256').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_esim_profile_binding_order').on(table.provider, table.skyOrderId),
    index('idx_esim_profile_binding_owner').on(table.ownerUserId, table.createdAt),
    check('esim_profile_binding_provider_check', sql`${table.provider} = 'esim-go-v3'`),
    check('esim_profile_binding_digest_check', sql`length(${table.profileDigest}) = 64`),
    check('esim_profile_binding_manifest_check', sql`length(${table.manifestSha256}) = 64`),
  ],
);

export const esimProviderOrders = sqliteTable(
  'esim_provider_orders',
  {
    skyOrderId: text('sky_order_id').primaryKey(),
    provider: text('provider').notNull(),
    ownerUserId: text('owner_user_id').notNull(),
    packageKey: text('package_key').notNull(),
    manifestSha256: text('manifest_sha256').notNull(),
    pricingSnapshotJson: text('pricing_snapshot_json').notNull(),
    pricingSnapshotSha256: text('pricing_snapshot_sha256').notNull(),
    providerBundleName: text('provider_bundle_name').notNull(),
    quoteDigest: text('quote_digest').notNull(),
    quoteTotal: text('quote_total').notNull(),
    quoteCurrency: text('quote_currency').notNull(),
    state: text('state').notNull(),
    providerOrderReference: text('provider_order_reference'),
    profileDigest: text('profile_digest'),
    installMaterialCiphertext: text('install_material_ciphertext'),
    installMaterialNonce: text('install_material_nonce'),
    installMaterialDeliveryKeyHash: text('install_material_delivery_key_hash'),
    installMaterialDeliveredAt: integer('install_material_delivered_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_esim_provider_order_reference').on(table.provider, table.providerOrderReference),
    index('idx_esim_provider_orders_owner').on(table.ownerUserId, table.updatedAt),
    check('esim_provider_orders_provider_check', sql`${table.provider} = 'esim-go-v3'`),
    check('esim_provider_orders_manifest_check', sql`length(${table.manifestSha256}) = 64`),
    check('esim_provider_orders_quote_check', sql`length(${table.quoteDigest}) = 64`),
    check('esim_provider_orders_state_check', sql`${table.state} IN ('dispatch_started', 'reconciliation_required', 'provider_completed', 'profile_bound')`),
    check('esim_provider_orders_profile_digest_check', sql`${table.profileDigest} IS NULL OR length(${table.profileDigest}) = 64`),
  ],
);

export const esimDeviceInstallChallenges = sqliteTable(
  'esim_device_install_challenges',
  {
    id: text('id').primaryKey(),
    skyOrderId: text('sky_order_id').notNull(),
    ownerUserId: text('owner_user_id').notNull(),
    profileDigest: text('profile_digest').notNull(),
    deviceRef: text('device_ref').notNull(),
    nonceSha256: text('nonce_sha256').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    consumedAt: integer('consumed_at'),
  },
  (table) => [
    index('idx_esim_install_challenges_order').on(table.ownerUserId, table.skyOrderId, table.createdAt),
    check('esim_install_challenge_profile_digest_check', sql`length(${table.profileDigest}) = 64`),
    check('esim_install_challenge_nonce_check', sql`length(${table.nonceSha256}) = 64`),
    check('esim_install_challenge_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const esimDeviceInstallReceipts = sqliteTable(
  'esim_device_install_receipts',
  {
    challengeId: text('challenge_id').primaryKey(),
    skyOrderId: text('sky_order_id').notNull(),
    ownerUserId: text('owner_user_id').notNull(),
    profileDigest: text('profile_digest').notNull(),
    deviceRef: text('device_ref').notNull(),
    issuerId: text('issuer_id').notNull(),
    keyId: text('key_id').notNull(),
    receiptSha256: text('receipt_sha256').notNull(),
    evidenceSource: text('evidence_source').notNull(),
    observedAt: integer('observed_at').notNull(),
    verifiedAt: integer('verified_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_esim_install_receipt_order').on(table.skyOrderId),
    index('idx_esim_install_receipt_owner').on(table.ownerUserId, table.verifiedAt),
    check('esim_install_receipt_profile_digest_check', sql`length(${table.profileDigest}) = 64`),
    check('esim_install_receipt_hash_check', sql`length(${table.receiptSha256}) = 64`),
    check('esim_install_receipt_source_check', sql`${table.evidenceSource} IN ('carrier_privileged', 'oem_euicc_controller')`),
  ],
);

export const esimDeviceGatewayChallenges = sqliteTable(
  'esim_device_gateway_challenges',
  {
    id: text('id').primaryKey(),
    skyOrderId: text('sky_order_id').notNull(),
    ownerUserId: text('owner_user_id').notNull(),
    profileDigest: text('profile_digest').notNull(),
    deviceRef: text('device_ref').notNull(),
    installReceiptSha256: text('install_receipt_sha256').notNull(),
    starterPackId: text('starter_pack_id').notNull(),
    starterPackVersion: text('starter_pack_version').notNull(),
    starterPackManifestSha256: text('starter_pack_manifest_sha256').notNull(),
    nonceSha256: text('nonce_sha256').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    consumedAt: integer('consumed_at'),
  },
  (table) => [
    index('idx_esim_gateway_challenge_order').on(table.ownerUserId, table.skyOrderId, table.createdAt),
    check('esim_gateway_challenge_profile_check', sql`length(${table.profileDigest}) = 64`),
    check('esim_gateway_challenge_install_receipt_check', sql`length(${table.installReceiptSha256}) = 64`),
    check('esim_gateway_challenge_pack_hash_check', sql`length(${table.starterPackManifestSha256}) = 64`),
    check('esim_gateway_challenge_nonce_check', sql`length(${table.nonceSha256}) = 64`),
    check('esim_gateway_challenge_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const esimDeviceGatewayKeys = sqliteTable(
  'esim_device_gateway_keys',
  {
    authorityId: text('authority_id').notNull(),
    ownerUserId: text('owner_user_id').notNull(),
    deviceRef: text('device_ref').notNull(),
    keyId: text('key_id').notNull(),
    algorithm: text('algorithm').notNull(),
    publicKeyHex: text('public_key_hex').notNull(),
    publicKeySha256: text('public_key_sha256').notNull(),
    applicationPackage: text('application_package').notNull(),
    minimumApplicationVersion: text('minimum_application_version').notNull(),
    signingCertificateSha256: text('signing_certificate_sha256').notNull(),
    securityLevel: text('security_level').notNull(),
    verifiedBootState: text('verified_boot_state').notNull(),
    attestedAt: integer('attested_at').notNull(),
    status: text('status').notNull().default('active'),
    revokedAt: integer('revoked_at'),
  },
  (table) => [
    primaryKey({ columns: [table.ownerUserId, table.deviceRef, table.keyId], name: 'pk_esim_device_gateway_keys' }),
    uniqueIndex('idx_esim_device_gateway_key_fingerprint').on(table.authorityId, table.keyId),
    index('idx_esim_device_gateway_key_owner').on(table.ownerUserId, table.deviceRef, table.status),
    check('esim_device_gateway_key_algorithm_check', sql`${table.algorithm} = 'ES256'`),
    check('esim_device_gateway_key_public_check', sql`length(${table.publicKeyHex}) = 130 AND substr(${table.publicKeyHex}, 1, 2) = '04'`),
    check('esim_device_gateway_key_fingerprint_check', sql`length(${table.publicKeySha256}) = 64 AND ${table.keyId} = ${table.publicKeySha256}`),
    check('esim_device_gateway_key_signer_check', sql`length(${table.signingCertificateSha256}) = 64`),
    check('esim_device_gateway_key_security_check', sql`${table.securityLevel} IN ('TRUSTED_ENVIRONMENT', 'STRONG_BOX')`),
    check('esim_device_gateway_key_boot_check', sql`${table.verifiedBootState} = 'VERIFIED'`),
    check('esim_device_gateway_key_status_check', sql`${table.status} IN ('active', 'revoked')`),
    check('esim_device_gateway_key_revoked_check', sql`(${table.status} = 'active' AND ${table.revokedAt} IS NULL) OR (${table.status} = 'revoked' AND ${table.revokedAt} IS NOT NULL)`),
  ],
);

export const esimDeviceEntitlements = sqliteTable(
  'esim_device_entitlements',
  {
    challengeId: text('challenge_id').primaryKey(),
    skyOrderId: text('sky_order_id').notNull(),
    ownerUserId: text('owner_user_id').notNull(),
    profileDigest: text('profile_digest').notNull(),
    deviceRef: text('device_ref').notNull(),
    installReceiptSha256: text('install_receipt_sha256').notNull(),
    authorityId: text('authority_id').notNull(),
    keyId: text('key_id').notNull(),
    signatureAlgorithm: text('signature_algorithm'),
    devicePublicKeySha256: text('device_public_key_sha256'),
    starterPackId: text('starter_pack_id').notNull(),
    starterPackVersion: text('starter_pack_version').notNull(),
    starterPackManifestSha256: text('starter_pack_manifest_sha256').notNull(),
    receiptSha256: text('receipt_sha256').notNull(),
    observedAt: integer('observed_at').notNull(),
    activatedAt: integer('activated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_esim_device_entitlement_order').on(table.skyOrderId),
    index('idx_esim_device_entitlement_owner').on(table.ownerUserId, table.activatedAt),
    check('esim_device_entitlement_profile_check', sql`length(${table.profileDigest}) = 64`),
    check('esim_device_entitlement_install_receipt_check', sql`length(${table.installReceiptSha256}) = 64`),
    check('esim_device_entitlement_pack_hash_check', sql`length(${table.starterPackManifestSha256}) = 64`),
    check('esim_device_entitlement_receipt_check', sql`length(${table.receiptSha256}) = 64`),
  ],
);

export const csvTrialPayments = sqliteTable('csv_trial_payments', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull(),
  mode: text('mode').notNull(),
  sessionId: text('session_id'),
  createdAt: integer('created_at').notNull(),
}, (table) => [uniqueIndex('idx_csv_trial_session').on(table.sessionId)]);

export const rockstarServiceEntitlements = sqliteTable('rockstar_service_entitlements', {
  issuerId: text('issuer_id').notNull(),
  claimId: text('claim_id').notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  offerId: text('offer_id').notNull(),
  purchaseReferenceSha256: text('purchase_reference_sha256').notNull(),
  claimCodeSha256: text('claim_code_sha256').notNull(),
  formFactor: text('form_factor').notNull(),
  scopesJson: text('scopes_json').notNull(),
  issuerKeyId: text('issuer_key_id').notNull(),
  claimSignature: text('claim_signature').notNull(),
  status: text('status').notNull().default('active'),
  claimedAt: integer('claimed_at').notNull(),
  expiresAt: integer('expires_at'),
  revokedAt: integer('revoked_at'),
}, (table) => [
  primaryKey({ columns: [table.issuerId, table.claimId] }),
  index('idx_rockstar_entitlement_owner_status').on(table.ownerUserId, table.status, table.claimedAt),
  uniqueIndex('idx_rockstar_entitlement_code').on(table.claimCodeSha256),
  uniqueIndex('idx_rockstar_entitlement_purchase_ref').on(table.issuerId, table.purchaseReferenceSha256),
  check('rockstar_entitlement_form_factor_check', sql`${table.formFactor} IN ('physical_sim', 'esim', 'service_only')`),
  check('rockstar_entitlement_status_check', sql`${table.status} IN ('active', 'refunded', 'revoked', 'expired')`),
  check('rockstar_entitlement_purchase_hash_check', sql`length(${table.purchaseReferenceSha256}) = 64`),
  check('rockstar_entitlement_code_hash_check', sql`length(${table.claimCodeSha256}) = 64`),
]);

export const rockstarEntitlementEvents = sqliteTable('rockstar_entitlement_events', {
  issuerId: text('issuer_id').notNull(),
  eventId: text('event_id').notNull(),
  claimId: text('claim_id').notNull(),
  purchaseReferenceSha256: text('purchase_reference_sha256').notNull(),
  eventType: text('event_type').notNull(),
  issuerKeyId: text('issuer_key_id').notNull(),
  eventSha256: text('event_sha256').notNull(),
  signature: text('signature').notNull(),
  receivedAt: integer('received_at').notNull(),
  appliedAt: integer('applied_at'),
}, (table) => [
  primaryKey({ columns: [table.issuerId, table.eventId] }),
  index('idx_rockstar_entitlement_event_claim').on(table.issuerId, table.claimId, table.receivedAt),
  check('rockstar_entitlement_event_hash_check', sql`length(${table.purchaseReferenceSha256}) = 64 AND length(${table.eventSha256}) = 64`),
  check('rockstar_entitlement_event_type_check', sql`${table.eventType} IN ('refunded', 'revoked')`),
]);

export const rockstarEntitlementIssuerDeliveries = sqliteTable('rockstar_entitlement_issuer_deliveries', {
  issuerId: text('issuer_id').notNull(),
  idempotencyKeySha256: text('idempotency_key_sha256').notNull(),
  requestSha256: text('request_sha256').notNull(),
  purchaseReferenceSha256: text('purchase_reference_sha256').notNull(),
  claimId: text('claim_id').notNull(),
  claimJson: text('claim_json').notNull(),
  claimJsonSha256: text('claim_json_sha256').notNull(),
  codeEncryptionKeyId: text('code_encryption_key_id').notNull().default('legacy'),
  claimCodeCiphertext: text('claim_code_ciphertext'),
  claimCodeNonce: text('claim_code_nonce'),
  state: text('state').notNull().default('prepared'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deliveredAt: integer('delivered_at'),
}, (table) => [
  primaryKey({ columns: [table.issuerId, table.idempotencyKeySha256] }),
  uniqueIndex('idx_rockstar_entitlement_issuer_delivery_claim').on(table.issuerId, table.claimId),
  index('idx_rockstar_entitlement_issuer_delivery_purchase').on(table.issuerId, table.purchaseReferenceSha256, table.createdAt),
  check('rockstar_entitlement_issuer_delivery_hashes_check', sql`length(${table.idempotencyKeySha256}) = 64 AND length(${table.requestSha256}) = 64 AND length(${table.purchaseReferenceSha256}) = 64 AND length(${table.claimJsonSha256}) = 64`),
  check('rockstar_entitlement_issuer_delivery_claim_json_check', sql`json_valid(${table.claimJson})`),
  check('rockstar_entitlement_issuer_delivery_state_check', sql`(${table.state} = 'prepared' AND ${table.claimCodeCiphertext} IS NOT NULL AND ${table.claimCodeNonce} IS NOT NULL AND ${table.deliveredAt} IS NULL) OR (${table.state} = 'delivered' AND ${table.claimCodeCiphertext} IS NULL AND ${table.claimCodeNonce} IS NULL AND ${table.deliveredAt} IS NOT NULL)`),
]);

export const rockstarEntitlementIssuerRateLimits = sqliteTable('rockstar_entitlement_issuer_rate_limits', {
  issuerId: text('issuer_id').primaryKey(),
  windowStartedAt: integer('window_started_at').notNull(),
  requestCount: integer('request_count').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  check('rockstar_entitlement_issuer_rate_limit_count_check', sql`${table.requestCount} >= 0`),
]);


export const skyCampusProfiles = sqliteTable(
  'sky_campus_profiles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    campusId: text('campus_id').notNull(),
    handle: text('handle').notNull(),
    displayName: text('display_name').notNull(),
    affiliation: text('affiliation').notNull(),
    affiliationStatus: text('affiliation_status').notNull(),
    headline: text('headline').notNull().default(''),
    bio: text('bio').notNull().default(''),
    skillsJson: text('skills_json').notNull().default('[]'),
    interestsJson: text('interests_json').notNull().default('[]'),
    lookingForJson: text('looking_for_json').notNull().default('[]'),
    linksJson: text('links_json').notNull().default('[]'),
    isPublic: integer('is_public').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_sky_campus_profile_user_campus').on(table.userId, table.campusId),
    uniqueIndex('idx_sky_campus_profile_handle').on(table.campusId, table.handle),
    index('idx_sky_campus_profile_public').on(table.campusId, table.isPublic, table.updatedAt),
  ],
);

export const skyCampusItems = sqliteTable(
  'sky_campus_items',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id').notNull(),
    campusId: text('campus_id').notNull(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    tagsJson: text('tags_json').notNull().default('[]'),
    detailsJson: text('details_json').notNull().default('{}'),
    status: text('status').notNull().default('active'),
    visibility: text('visibility').notNull().default('campus'),
    startsAt: text('starts_at'),
    endsAt: text('ends_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_sky_campus_items_feed').on(table.campusId, table.kind, table.status, table.updatedAt),
    index('idx_sky_campus_items_owner').on(table.ownerUserId, table.updatedAt),
  ],
);

export const skyCampusEdges = sqliteTable(
  'sky_campus_edges',
  {
    id: text('id').primaryKey(),
    actorUserId: text('actor_user_id').notNull(),
    campusId: text('campus_id').notNull(),
    edgeType: text('edge_type').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    note: text('note').notNull().default(''),
    status: text('status').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_sky_campus_edge_unique').on(
      table.actorUserId,
      table.edgeType,
      table.targetType,
      table.targetId,
    ),
    index('idx_sky_campus_edge_target').on(table.campusId, table.targetType, table.targetId, table.status),
  ],
);

export const skyCampusTags = sqliteTable(
  'sky_campus_tags',
  {
    tagId: text('tag_id').primaryKey(),
    ownerUserId: text('owner_user_id').notNull(),
    campusId: text('campus_id').notNull(),
    mode: text('mode').notNull(),
    destination: text('destination').notNull(),
    label: text('label').notNull().default(''),
    placement: text('placement').notNull().default(''),
    active: integer('active').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_sky_campus_tags_owner').on(table.ownerUserId, table.campusId, table.createdAt),
    index('idx_sky_campus_tags_active').on(table.campusId, table.active),
  ],
);

export const skyCampusTagEvents = sqliteTable(
  'sky_campus_tag_events',
  {
    id: text('id').primaryKey(),
    tagId: text('tag_id').notNull(),
    source: text('source').notNull(),
    occurredAt: text('occurred_at').notNull(),
  },
  (table) => [
    index('idx_sky_campus_tag_events_tag').on(table.tagId, table.occurredAt),
    index('idx_sky_campus_tag_events_source').on(table.source, table.occurredAt),
  ],
);

export const skyCampusReports = sqliteTable(
  'sky_campus_reports',
  {
    id: text('id').primaryKey(),
    reporterUserId: text('reporter_user_id').notNull(),
    campusId: text('campus_id').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason').notNull(),
    detail: text('detail').notNull().default(''),
    status: text('status').notNull().default('open'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_sky_campus_report_unique').on(
      table.reporterUserId,
      table.targetType,
      table.targetId,
    ),
    index('idx_sky_campus_reports_target').on(table.campusId, table.targetType, table.targetId, table.status),
  ],
);
