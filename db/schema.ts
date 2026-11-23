import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  check,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const cloudUsageRecords = sqliteTable('cloud_usage_records', {
  id: text('id').primaryKey().notNull(),
  userId: text('user_id'),
  observedAt: integer('observed_at').notNull(),
  usageJson: text('usage_json').notNull(),
  priceVersion: text('price_version').notNull(),
  costUsd: real('cost_usd'),
}, (t) => [
  index('idx_cloud_usage_observed_at').on(t.observedAt),
  check('cloud_usage_observed_at_check', sql`${t.observedAt} >= 0`),
  check('cloud_usage_json_check', sql`json_valid(${t.usageJson})`),
  check('cloud_usage_cost_check', sql`${t.costUsd} >= 0`),
]);

export const cloudAdmissionProbes = sqliteTable('cloud_admission_probes', {
  slotAt: integer('slot_at').primaryKey().notNull(),
  observedAt: integer('observed_at').notNull(),
  statusCode: integer('status_code'),
  latencyMs: integer('latency_ms').notNull(),
  ok: integer('ok').notNull(),
}, (t) => [
  check('cloud_probe_slot_check', sql`${t.slotAt} >= 0 AND ${t.slotAt} % 300000 = 0`),
  check('cloud_probe_observed_check', sql`${t.observedAt} >= ${t.slotAt} AND ${t.observedAt} < ${t.slotAt} + 300000`),
  check('cloud_probe_status_check', sql`${t.statusCode} BETWEEN 100 AND 599`),
  check('cloud_probe_latency_check', sql`${t.latencyMs} >= 0`),
  check('cloud_probe_ok_check', sql`${t.ok} IN (0, 1)`),
]);

export const cloudExecutionTimings = sqliteTable('cloud_execution_timings', {
  source: text('source').notNull(),
  executionId: text('execution_id').notNull(),
  admittedAt: integer('admitted_at').notNull(),
  firstResultAt: integer('first_result_at'),
}, (t) => [
  primaryKey({ columns: [t.source, t.executionId] }),
  index('idx_cloud_execution_admitted_at').on(t.admittedAt),
  check('cloud_execution_source_check', sql`${t.source} IN ('remote_text', 'a2a', 'free_cloud')`),
  check('cloud_execution_result_check', sql`${t.firstResultAt} >= ${t.admittedAt}`),
]);

export const noahDiscoverySources = sqliteTable('noah_discovery_sources', {
  id: text('id').primaryKey(), leaseId: text('lease_id'), leaseUntil: integer('lease_until').notNull().default(0),
  nextRunAt: integer('next_run_at').notNull().default(0), lastAttemptAt: integer('last_attempt_at'), lastSuccessAt: integer('last_success_at'),
  etag: text('etag'), cursorKey: text('cursor_key'), errorCode: text('error_code'), failureCount: integer('failure_count').notNull().default(0),
  observed: integer('observed').notNull().default(0), withdrawn: integer('withdrawn').notNull().default(0), requestCount: integer('request_count').notNull().default(0),
}, t => [check('noah_discovery_source_provider', sql`${t.id} IN ('github','huggingface')`)]);
export const noahDiscoveryCandidates = sqliteTable('noah_discovery_candidates', {
  id: text('id').primaryKey(), provider: text('provider').notNull(), externalId: text('external_id').notNull(), repository: text('repository').notNull(), digest: text('digest').notNull(),
  state: text('state').notNull(), revision: integer('revision').notNull(), firstSeenAt: integer('first_seen_at').notNull(), changedAt: integer('changed_at').notNull(), checkedAt: integer('checked_at').notNull(),
}, t => [uniqueIndex('noah_discovery_candidates_provider_id').on(t.provider,t.externalId),index('noah_discovery_candidates_refresh').on(t.provider,t.state,t.checkedAt,t.id),index('noah_discovery_candidates_latest').on(t.state,t.changedAt,t.id),check('noah_discovery_candidate_provider',sql`${t.provider} IN ('github','huggingface')`),check('noah_discovery_candidate_state',sql`${t.state} IN ('active','withdrawn')`)]);
export const noahDiscoveryVersions = sqliteTable('noah_discovery_versions', {
  candidateId: text('candidate_id').notNull().references(()=>noahDiscoveryCandidates.id), revision: integer('revision').notNull(), digest: text('digest').notNull(),
  metadataJson: text('metadata_json').notNull(), state: text('state').notNull(), observedAt: integer('observed_at').notNull(),
}, t => [primaryKey({columns:[t.candidateId,t.revision]}),index('noah_discovery_versions_snapshot').on(t.candidateId,t.observedAt,t.revision),check('noah_discovery_version_state',sql`${t.state} IN ('active','withdrawn')`)]);

export const noahRecommendationSettings = sqliteTable('noah_recommendation_settings', {
  ownerId: text('owner_id').primaryKey(), revision: integer('revision').notNull(),
  historyEnabled: integer('history_enabled').notNull().default(0), historySince: integer('history_since').notNull().default(0),
  runtime: text('runtime').notNull().default('any'), updatedAt: integer('updated_at').notNull(),
}, t => [check('noah_recommendation_revision',sql`${t.revision}>=1`),check('noah_recommendation_history',sql`${t.historyEnabled} IN (0,1)`),check('noah_recommendation_runtime',sql`${t.runtime} IN ('any','headless','local-model','codex')`)]);

export const noahFeedPreferences = sqliteTable('noah_feed_preferences', {
  ownerId: text('owner_id').notNull(),
  kind: text('kind').notNull(),
  subject: text('subject').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => [primaryKey({ columns: [table.ownerId, table.kind, table.subject] }),
  check('noah_feed_preference_kind', sql`${table.kind} IN ('follow','hide','interest','personalize')`),
  check('noah_feed_preference_subject', sql`length(${table.subject}) BETWEEN 1 AND 160`)]);

export const skyLibraryItems = sqliteTable('sky_library_items', {
  userId: text('user_id').notNull(),
  tool: text('tool').notNull(),
  savedAt: integer('saved_at').notNull(),
}, (table) => [uniqueIndex('idx_sky_library_owner_tool').on(table.userId, table.tool)]);

export const skyFeedPersonalizationSettings = sqliteTable(
  'sky_feed_personalization_settings',
  {
    userId: text('user_id').primaryKey(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    consentVersion: text('consent_version').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
);

export const skyFeedHistoryEvents = sqliteTable(
  'sky_feed_history_events',
  {
    id: text('id').notNull(),
    userId: text('user_id').notNull(),
    sessionId: text('session_id').notNull(),
    tool: text('tool').notNull(),
    eventType: text('event_type').notNull(),
    occurredAt: integer('occurred_at').notNull(),
    dwellMs: integer('dwell_ms'),
    position: integer('position'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index('idx_sky_feed_history_owner_time').on(table.userId, table.occurredAt),
    index('idx_sky_feed_history_owner_tool').on(
      table.userId,
      table.tool,
      table.occurredAt,
    ),
  ],
);

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

export const jenniferPlanRevisions = sqliteTable(
  'jennifer_plan_revisions',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id').notNull(),
    rootJobId: text('root_job_id').notNull(),
    planId: text('plan_id').notNull(),
    revision: integer('revision').notNull(),
    planDigest: text('plan_digest').notNull(),
    parentPlanDigest: text('parent_plan_digest'),
    planJson: text('plan_json').notNull(),
    diffJson: text('diff_json').notNull().default('[]'),
    resolutionJson: text('resolution_json').notNull().default('[]'),
    state: text('state').notNull(),
    approvedBy: text('approved_by'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_jennifer_plan_root_revision').on(
      table.ownerUserId,
      table.rootJobId,
      table.revision,
    ),
    uniqueIndex('idx_jennifer_plan_digest').on(
      table.ownerUserId,
      table.planDigest,
    ),
    index('idx_jennifer_plan_owner_updated').on(table.ownerUserId, table.updatedAt),
  ],
);

export const jenniferPasskeyChallenges = sqliteTable(
  'jennifer_passkey_challenges',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    userId: text('user_id'),
    challengeSha256: text('challenge_sha256').notNull(),
    requestKeySha256: text('request_key_sha256').notNull(),
    rpId: text('rp_id').notNull(),
    origin: text('origin').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    consumedAt: integer('consumed_at'),
  },
  (table) => [
    uniqueIndex('idx_jennifer_passkey_challenge_hash').on(table.challengeSha256),
    index('idx_jennifer_passkey_challenge_expiry').on(table.expiresAt),
    check('jennifer_passkey_challenge_kind_check', sql`${table.kind} IN ('registration','authentication')`),
    check('jennifer_passkey_challenge_hash_check', sql`length(${table.challengeSha256}) = 64`),
    check('jennifer_passkey_challenge_request_key_check', sql`length(${table.requestKeySha256}) = 64`),
    index('idx_jennifer_passkey_challenge_rate').on(table.requestKeySha256, table.createdAt),
  ],
);

export const jenniferPasskeyCredentials = sqliteTable(
  'jennifer_passkey_credentials',
  {
    credentialId: text('credential_id').primaryKey(),
    userId: text('user_id').notNull(),
    publicKeyCose: text('public_key_cose').notNull(),
    signCount: integer('sign_count').notNull(),
    transportsJson: text('transports_json').notNull().default('[]'),
    label: text('label').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: integer('backed_up').notNull(),
    rpId: text('rp_id').notNull(),
    createdAt: integer('created_at').notNull(),
    lastUsedAt: integer('last_used_at'),
    revokedAt: integer('revoked_at'),
  },
  (table) => [
    index('idx_jennifer_passkey_owner').on(table.userId, table.createdAt),
    check('jennifer_passkey_counter_check', sql`${table.signCount} >= 0`),
    check('jennifer_passkey_transports_check', sql`json_valid(${table.transportsJson})`),
    check('jennifer_passkey_device_type_check', sql`${table.deviceType} IN ('singleDevice','multiDevice')`),
    check('jennifer_passkey_backed_up_check', sql`${table.backedUp} IN (0,1)`),
  ],
);

export const jenniferPasskeySessions = sqliteTable(
  'jennifer_passkey_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    credentialId: text('credential_id').notNull(),
    authMethod: text('auth_method').notNull(),
    tokenSha256: text('token_sha256').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    lastUsedAt: integer('last_used_at'),
    revokedAt: integer('revoked_at'),
  },
  (table) => [
    uniqueIndex('idx_jennifer_passkey_session_token').on(table.tokenSha256),
    index('idx_jennifer_passkey_session_owner').on(table.userId, table.createdAt),
    index('idx_jennifer_passkey_session_credential').on(table.credentialId, table.createdAt),
    check('jennifer_passkey_session_hash_check', sql`length(${table.tokenSha256}) = 64`),
    check('jennifer_passkey_session_method_check', sql`${table.authMethod} = 'passkey'`),
  ],
);

export const jenniferPasskeyEvents = sqliteTable(
  'jennifer_passkey_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    eventType: text('event_type').notNull(),
    credentialId: text('credential_id').notNull(),
    detailsJson: text('details_json').notNull().default('{}'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_jennifer_passkey_event_owner').on(table.userId, table.createdAt),
    check('jennifer_passkey_event_details_check', sql`json_valid(${table.detailsJson})`),
  ],
);

export const jenniferTaskAttempts = sqliteTable(
  'jennifer_task_attempts',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id').notNull(),
    rootJobId: text('root_job_id').notNull(),
    planRevision: integer('plan_revision').notNull(),
    taskId: text('task_id').notNull(),
    attempt: integer('attempt').notNull(),
    role: text('role').notNull(),
    childJobId: text('child_job_id').notNull(),
    delegationId: text('delegation_id').notNull(),
    principal: text('principal').notNull(),
    inputDigest: text('input_digest').notNull(),
    artifactSetDigest: text('artifact_set_digest'),
    usageReceiptDigest: text('usage_receipt_digest'),
    reportDigest: text('report_digest'),
    reportJson: text('report_json'),
    state: text('state').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_jennifer_attempt_identity').on(
      table.ownerUserId,
      table.rootJobId,
      table.planRevision,
      table.taskId,
      table.attempt,
      table.role,
    ),
    uniqueIndex('idx_jennifer_attempt_delegation').on(table.ownerUserId, table.delegationId),
    index('idx_jennifer_attempt_root').on(table.ownerUserId, table.rootJobId, table.updatedAt),
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
    revision: integer('revision').notNull().default(1),
    status: text('status').notNull().default('setup_required'),
    config: text('config').notNull().default('{}'),
    secretRef: text('secret_ref'),
    connectedAt: integer('connected_at'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    check('sky_provider_revision_positive', sql`typeof(${table.revision}) = 'integer' AND ${table.revision} >= 1`),
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

export const esimIosInstallDeclarations = sqliteTable(
  'esim_ios_install_declarations',
  {
    skyOrderId: text('sky_order_id').notNull().references(() => skyCommerceOrders.id),
    ownerUserId: text('owner_user_id').notNull(),
    profileDigest: text('profile_digest').notNull().references(() => esimProviderProfileBindings.profileDigest),
    declaredAt: integer('declared_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.skyOrderId, table.ownerUserId, table.profileDigest] })],
);

export const esimGoProfileStatusEvents = sqliteTable(
  'esim_go_profile_status_events',
  {
    callbackDigest: text('callback_digest').primaryKey().notNull().references(() => esimProviderWebhookInbox.callbackDigest),
    profileStatus: text('profile_status', { enum: ['Downloaded', 'Installed', 'Released'] }).notNull(),
    eventAt: integer('event_at').notNull(),
  },
  (table) => [
    check('esim_go_profile_status_check', sql`${table.profileStatus} IN ('Downloaded', 'Installed', 'Released')`),
    check('esim_go_profile_event_time_check', sql`${table.eventAt} >= 0`),
  ],
);

export const simBindings = sqliteTable('sim_bindings', {
  id: text('id').primaryKey().notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  simDigest: text('sim_digest').notNull(),
  deviceDigest: text('device_digest').notNull(),
  boundAt: integer('bound_at').notNull(),
  revokedAt: integer('revoked_at'),
}, (table) => [
  uniqueIndex('sim_bindings_active_sim').on(table.simDigest).where(sql`${table.revokedAt} IS NULL`),
  index('sim_bindings_sim_revoked').on(table.simDigest, table.revokedAt),
  check('sim_bindings_sim_digest_check', sql`length(${table.simDigest}) = 64`),
  check('sim_bindings_device_digest_check', sql`length(${table.deviceDigest}) = 64`),
  check('sim_bindings_revoke_time_check', sql`${table.revokedAt} IS NULL OR ${table.revokedAt} >= ${table.boundAt}`),
]);

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

export const esimCloudAccessKeys = sqliteTable('esim_cloud_access_keys', {
  id: text('id').primaryKey(),
  skyOrderId: text('sky_order_id').notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  deviceRef: text('device_ref').notNull(),
  entitlementReceiptSha256: text('entitlement_receipt_sha256').notNull(),
  tokenSha256: text('token_sha256').notNull(),
  scopesJson: text('scopes_json').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  revokedAt: integer('revoked_at'),
  activeSlot: text('active_slot'),
  replacedById: text('replaced_by_id'),
}, (table) => [
  uniqueIndex('idx_esim_cloud_token').on(table.tokenSha256),
  uniqueIndex('idx_esim_cloud_active_order').on(table.activeSlot),
  index('idx_esim_cloud_owner').on(table.ownerUserId, table.skyOrderId, table.createdAt),
  check('esim_cloud_hash_check', sql`length(${table.tokenSha256})=64 AND length(${table.entitlementReceiptSha256})=64`),
  check('esim_cloud_expiry_check', sql`${table.expiresAt}>${table.createdAt}`),
  check('esim_cloud_active_check', sql`(${table.revokedAt} IS NULL AND ${table.activeSlot} IS NOT NULL AND ${table.activeSlot}=${table.skyOrderId}) OR (${table.revokedAt} IS NOT NULL AND ${table.activeSlot} IS NULL)`),
]);

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


export const skyCodeRepositories = sqliteTable('sky_code_repositories', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(),
  revision: integer('revision').notNull().default(0), headId: text('head_id'),
  hidden: integer('hidden').notNull().default(0), updatedAt: integer('updated_at').notNull(),
}, table => [index('idx_sky_code_owner').on(table.userId)]);
export const skyCodeCommits = sqliteTable('sky_code_commits', {
  id: text('id').primaryKey(), repoId: text('repo_id').notNull().references(() => skyCodeRepositories.id),
  revision: integer('revision').notNull(), parentId: text('parent_id'),
  payload: text('payload').notNull(), createdAt: integer('created_at').notNull(),
}, table => [uniqueIndex('idx_sky_code_repo_revision').on(table.repoId, table.revision)]);

// Local monthly billing fixtures; never a real funded balance or payment authority.
export const skyMonthlySandboxInvoices = sqliteTable('sky_monthly_sandbox_invoices', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), period: text('period').notNull(),
  currency: text('currency').notNull().default('JPY'), status: text('status').notNull().default('draft'),
  totalMinor: integer('total_minor').notNull().default(0), capMinor: integer('cap_minor').notNull().default(1000),
  providerReceipt: text('provider_receipt'), createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('idx_sky_monthly_sandbox_owner_period').on(t.ownerId,t.period),
  check('monthly_sandbox_currency',sql`${t.currency}='JPY'`),
  check('monthly_sandbox_status',sql`${t.status} IN ('draft','issued','paid')`),
  check('monthly_sandbox_total',sql`${t.totalMinor} BETWEEN 0 AND 1000`),
  check('monthly_sandbox_cap',sql`${t.capMinor}=1000`)]);
export const skyMonthlySandboxQuotes = sqliteTable('sky_monthly_sandbox_quotes', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), invoiceId: text('invoice_id').notNull(),
  inputJson: text('input_json').notNull(), inputHash: text('input_hash').notNull(), rateVersion: text('rate_version').notNull(),
  quantity: integer('quantity').notNull(), amountMinor: integer('amount_minor').notNull(),
  expiresAt: integer('expires_at').notNull(), createdAt: integer('created_at').notNull(),
}, t => [check('monthly_sandbox_quantity',sql`${t.quantity} BETWEEN 1 AND 20`),check('monthly_sandbox_amount',sql`${t.amountMinor} BETWEEN 10 AND 200`)]);
export const skyMonthlySandboxUsage = sqliteTable('sky_monthly_sandbox_usage', {
  quoteId: text('quote_id').primaryKey(), ownerId: text('owner_id').notNull(),
  invoiceId: text('invoice_id').notNull().references(() => skyMonthlySandboxInvoices.id),
  jobId: text('job_id').notNull(), amountMinor: integer('amount_minor').notNull(), createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('idx_sky_monthly_sandbox_job').on(t.jobId)]);

export const skyCloudMonthlyInvoices = sqliteTable('sky_cloud_monthly_invoices', {
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),period:text('period').notNull(),currency:text('currency').notNull(),
 stripeAccountId:text('stripe_account_id').notNull(),status:text('status').notNull().default('draft'),totalMinor:integer('total_minor').notNull().default(0),
 stripeCustomerId:text('stripe_customer_id'),stripeInvoiceId:text('stripe_invoice_id'),stripeItemId:text('stripe_item_id'),
 hostedInvoiceUrl:text('hosted_invoice_url'),submissionStartedAt:integer('submission_started_at'),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[uniqueIndex('idx_sky_cloud_monthly_contract').on(t.ownerId,t.period,t.currency,t.stripeAccountId),uniqueIndex('idx_sky_cloud_monthly_stripe_invoice').on(t.stripeInvoiceId),check('sky_cloud_monthly_total',sql`${t.totalMinor} BETWEEN 0 AND 1000000`),check('sky_cloud_monthly_state',sql`${t.status} IN ('draft','submitting','open','paid','attention')`)]);
export const skyCloudMonthlyItems = sqliteTable('sky_cloud_monthly_items',{
 sourceKind:text('source_kind').notNull(),sourceId:text('source_id').notNull(),invoiceId:text('invoice_id').notNull().references(()=>skyCloudMonthlyInvoices.id),ownerId:text('owner_id').notNull(),providerId:text('provider_id').notNull(),providerReference:text('provider_reference').notNull(),amountMinor:integer('amount_minor').notNull(),currency:text('currency').notNull(),pricingVersion:text('pricing_version').notNull(),usageJson:text('usage_json').notNull(),sourceDigest:text('source_digest').notNull(),occurredAt:integer('occurred_at').notNull(),
},t=>[primaryKey({columns:[t.sourceKind,t.sourceId]}),uniqueIndex('idx_sky_cloud_monthly_provider_reference').on(t.providerId,t.providerReference),check('sky_cloud_monthly_source_kind',sql`${t.sourceKind} IN ('a2a','remote_llm')`),check('sky_cloud_monthly_item_amount',sql`${t.amountMinor}>=0`)]);
export const skyCloudMonthlyEvents = sqliteTable('sky_cloud_monthly_events',{
 eventId:text('event_id').primaryKey(),invoiceId:text('invoice_id').notNull(),type:text('type').notNull(),processedAt:integer('processed_at').notNull(),
});

// Sandbox-only, opt-in monthly collection and atomic execution restrictions.
export const skyRecurringContracts = sqliteTable('sky_recurring_contracts', {
 id:text('id').primaryKey(), ownerId:text('owner_id').notNull().unique(), stripeAccountId:text('stripe_account_id').notNull(),
 customerId:text('customer_id').notNull(), paymentMethodId:text('payment_method_id').notNull(), paymentRevision:integer('payment_revision').notNull().default(0),
 consentVersion:text('consent_version').notNull(), creditMinor:integer('credit_minor').notNull(), periodStart:integer('period_start').notNull(),periodEnd:integer('period_end').notNull(),
 status:text('status').notNull(),accessUntil:integer('access_until').notNull(),lease:text('lease'),leaseUntil:integer('lease_until').notNull().default(0),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[check('sky_recurring_credit',sql`${t.creditMinor}=14000`),check('sky_recurring_period',sql`${t.periodEnd}>${t.periodStart}`),check('sky_recurring_state',sql`${t.status} IN ('active','collecting','past_due','cancelled','disputed')`)]);
export const skyRecurringCharges = sqliteTable('sky_recurring_charges', {
 id:text('id').primaryKey(),contractId:text('contract_id').notNull().references(()=>skyRecurringContracts.id),periodStart:integer('period_start').notNull(),periodEnd:integer('period_end').notNull(),status:text('status').notNull(),
 invoiceId:text('invoice_id').unique(),itemId:text('item_id'),startedAt:integer('started_at').notNull(),attemptRevision:integer('attempt_revision').notNull().default(-1),attemptKeyRevision:integer('attempt_key_revision').notNull().default(-1),attemptStartedAt:integer('attempt_started_at'),paidAt:integer('paid_at'),
},t=>[uniqueIndex('sky_recurring_charge_period').on(t.contractId,t.periodStart),check('sky_recurring_charge_state',sql`${t.status} IN ('creating','open','paid','attention')`)]);

// Owner-only hosted monthly Sandbox acceptance; prior contract snapshot is retained.
export const skyHostedMonthlyTests = sqliteTable('sky_hosted_monthly_tests', {
 ownerId:text('owner_id').primaryKey(),id:text('id').notNull().unique(),contractId:text('contract_id').notNull(),oldContractJson:text('old_contract_json').notNull(),
 stripeAccountId:text('stripe_account_id').notNull(),createdAt:integer('created_at').notNull(),periodStart:integer('period_start').notNull(),periodEnd:integer('period_end').notNull(),
 phase:text('phase').notNull().default('migrating'),fixtureMinor:integer('fixture_minor').notNull().default(0),customerId:text('customer_id'),failMethodId:text('fail_method_id'),goodMethodId:text('good_method_id'),
 lease:text('lease'),leaseUntil:integer('lease_until').notNull().default(0),
},t=>[check('sky_hosted_fixture',sql`${t.fixtureMinor} IN (0,10000)`),check('sky_hosted_phase',sql`${t.phase} IN ('migrating','active','capped','unpaid','restored')`)]);
export const skyHostedMonthlyEvents=sqliteTable('sky_hosted_monthly_events',{
 id:text('id').primaryKey(),type:text('type').notNull(),invoiceId:text('invoice_id').notNull(),processedAt:integer('processed_at').notNull(),
});

// Sky Home, community OS and connected source persistence.
export const skyLinuxServiceDocuments = sqliteTable('sky_linux_service_documents', {
  id:text('id').primaryKey(),ownerUserId:text('owner_user_id').notNull(),kind:text('kind').notNull(),
  revision:integer('revision').notNull().default(0),payload:text('payload').notNull(),updatedAt:integer('updated_at').notNull(),
}, table=>[index('idx_sky_linux_service_owner').on(table.ownerUserId,table.kind,table.updatedAt)]);
export const skyLinuxServiceReceipts = sqliteTable('sky_linux_service_receipts', {
  id:text('id').primaryKey(),workspaceId:text('workspace_id').notNull(),digest:text('digest').notNull(),
  kind:text('kind').notNull(),payload:text('payload').notNull(),createdAt:integer('created_at').notNull(),
}, table=>[index('idx_sky_linux_receipt_workspace').on(table.workspaceId,table.createdAt)]);

export const rockstarServiceSetups = sqliteTable('rockstar_service_setups', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id').notNull().unique(),
  revision: integer('revision').notNull().default(0),
  payload: text('payload').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [
  uniqueIndex('idx_rockstar_service_setup_session').on(sql`json_extract(${table.payload},'$.billing.sessionId')`),
]);

export const skyAgentSettings = sqliteTable('sky_agent_settings', {
  ownerUserId: text('owner_user_id').notNull(),
  id: text('id').notNull(),
  sourceTool: text('source_tool'),
  settings: text('settings').notNull(),
  revision: integer('revision').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [uniqueIndex('idx_sky_agent_settings_owner_id').on(table.ownerUserId,table.id),
  index('idx_sky_agent_settings_owner_updated').on(table.ownerUserId,table.updatedAt)]);

export const skyFeatureAdditions = sqliteTable('sky_feature_additions', {
  ownerUserId: text('owner_user_id').notNull(),
  feature: text('feature').notNull(),
  enabled: integer('enabled').notNull(),
  purpose: text('purpose').notNull(),
  revision: integer('revision').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [uniqueIndex('idx_sky_feature_additions_owner_feature').on(table.ownerUserId, table.feature)]);

export const skyHubPlugins = sqliteTable('sky_hub_plugins', {
  ownerUserId: text('owner_user_id').notNull(),
  pluginKey: text('plugin_key').notNull(),
  kind: text('kind').notNull(),
  resource: text('resource').notNull(),
  enabled: integer('enabled').notNull(),
  revision: integer('revision').notNull(),
  metadata: text('metadata').notNull(),
  consentVersion: text('consent_version'),
  updatedAt: integer('updated_at').notNull(),
}, table=>[uniqueIndex('idx_sky_hub_plugins_owner_key').on(table.ownerUserId,table.pluginKey)]);

// Public X post cache and a global API request window; never stores credentials.
export const eveConversations = sqliteTable('eve_conversations', {
  ownerId: text('owner_id').notNull(), id: text('id').notNull(),
  revision: integer('revision').notNull(), remember: integer('remember').notNull(),
  envelope: text('envelope').notNull(), updatedAt: integer('updated_at').notNull(),
  saveToken: text('save_token').notNull(),
  deletedAt: integer('deleted_at').notNull().default(0),
}, table => [primaryKey({columns:[table.ownerId,table.id]})]);
export const eveMessages = sqliteTable('eve_messages', {
  seq: integer('seq').primaryKey({autoIncrement:true}),ownerId:text('owner_id').notNull(),
  threadId:text('thread_id').notNull(),messageId:text('message_id').notNull(),
  envelope:text('envelope').notNull(),updatedAt:integer('updated_at').notNull(),
}, table => [uniqueIndex('eve_messages_identity').on(table.ownerId,table.threadId,table.messageId)]);
export const eveMemoryTerms = sqliteTable('eve_memory_terms', {
  ownerId:text('owner_id').notNull(),token:text('token').notNull(),threadId:text('thread_id').notNull(),messageId:text('message_id').notNull(),
}, table => [primaryKey({columns:[table.ownerId,table.token,table.threadId,table.messageId]})]);

export const skyXFeedState = sqliteTable('sky_x_feed_state', {
  key: text('key').primaryKey(),
  payload: text('payload').notNull().default('[]'),
  remoteUserId: text('remote_user_id'),
  fetchedAt: integer('fetched_at').notNull().default(0),
  nextRefreshAt: integer('next_refresh_at').notNull().default(0),
  retryAfter: integer('retry_after').notNull().default(0),
  leaseId: text('lease_id'),
  leaseUntil: integer('lease_until').notNull().default(0),
  windowDay: text('window_day').notNull().default(''),
  requestCount: integer('request_count').notNull().default(0),
  errorCode: text('error_code'),
});

export const skySocialProfiles = sqliteTable('sky_social_profiles', {
  id:text('id').primaryKey(), ownerId:text('owner_id').notNull().unique(),
  name:text('name').notNull(), createdAt:integer('created_at').notNull(),
});
export const skyCommunities = sqliteTable('sky_communities', {
  id:text('id').primaryKey(), ownerId:text('owner_id').notNull(), name:text('name').notNull(),
  description:text('description').notNull(), rules:text('rules').notNull(),
  visibility:text('visibility').notNull(), inviteHash:text('invite_hash'),
  recoveryHash:text('recovery_hash'), osRevision:integer('os_revision').notNull().default(0),
  postMode:text('post_mode').notNull().default('members'),
  createdAt:integer('created_at').notNull(), archivedAt:integer('archived_at').notNull().default(0),
});
export const skyCommunityMembers = sqliteTable('sky_community_members', {
  communityId:text('community_id').notNull(), profileId:text('profile_id').notNull(),
  joinedAt:integer('joined_at').notNull(),
}, table=>[primaryKey({columns:[table.communityId,table.profileId]})]);
export const skySocialFollows = sqliteTable('sky_social_follows', {
  followerId:text('follower_id').notNull(), followingId:text('following_id').notNull(), createdAt:integer('created_at').notNull(),
}, table=>[primaryKey({columns:[table.followerId,table.followingId]})]);
export const skySocialPosts = sqliteTable('sky_social_posts', {
  id:text('id').primaryKey(), authorId:text('author_id').notNull(), communityId:text('community_id'),
  content:text('content').notNull(), attachment:text('attachment'), createdAt:integer('created_at').notNull(),
  replyTo:text('reply_to'),
}, table=>[index('sky_social_posts_created').on(table.createdAt,table.id),index('sky_social_posts_community').on(table.communityId,table.createdAt),index('sky_social_posts_reply').on(table.replyTo,table.createdAt)]);

export const skySocialReactions = sqliteTable('sky_social_reactions', {
  profileId:text('profile_id').notNull(),postId:text('post_id').notNull(),
  kind:text('kind').notNull(),createdAt:integer('created_at').notNull(),
},t=>[primaryKey({columns:[t.profileId,t.postId,t.kind]}),index('sky_social_reactions_post').on(t.postId,t.kind)]);

export const skyCommunityKeys = sqliteTable('sky_community_keys', {
  communityId:text('community_id').notNull(),profileId:text('profile_id').notNull(),keyHash:text('key_hash').notNull(),
  revokedAt:integer('revoked_at').notNull().default(0),createdAt:integer('created_at').notNull(),
},t=>[primaryKey({columns:[t.communityId,t.profileId]})]);
export const skyCommunityEditions = sqliteTable('sky_community_editions', {
  communityId:text('community_id').notNull(),version:integer('version').notNull(),
  manifest:text('manifest').notNull(),digest:text('digest').notNull(),createdAt:integer('created_at').notNull(),
},t=>[primaryKey({columns:[t.communityId,t.version]})]);
export const skyCommunityInstalls = sqliteTable('sky_community_installs', {
  ownerId:text('owner_id').notNull(),communityId:text('community_id').notNull(),version:integer('version').notNull(),
  revision:integer('revision').notNull(),manifest:text('manifest').notNull(),agentRefs:text('agent_refs').notNull(),
  active:integer('active').notNull().default(0),saveToken:text('save_token').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[primaryKey({columns:[t.ownerId,t.communityId]}),uniqueIndex('sky_community_install_active').on(t.ownerId).where(sql`${t.active}=1`)]);

export const skyXAccounts = sqliteTable('sky_x_accounts', {
  ownerId:text('owner_id').primaryKey(),remoteId:text('remote_id'),username:text('username'),displayName:text('display_name'),tokens:text('tokens'),cache:text('cache'),
  status:text('status').notNull().default('disconnected'),revision:integer('revision').notNull().default(0),
  fetchedAt:integer('fetched_at').notNull().default(0),nextRefreshAt:integer('next_refresh_at').notNull().default(0),retryAt:integer('retry_at').notNull().default(0),
  leaseId:text('lease_id'),leaseUntil:integer('lease_until').notNull().default(0),windowDay:text('window_day').notNull().default(''),requestCount:integer('request_count').notNull().default(0),errorCode:text('error_code'),
});
export const noahAgentUploads = sqliteTable('noah_agent_uploads', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), manifest: text('manifest').notNull(),
  manifestSha256: text('manifest_sha256').notNull(), sourceKey: text('source_key'), sourceName: text('source_name'),
  sourceBytes: integer('source_bytes'), sourceSha256: text('source_sha256'), uploadState: text('upload_state').notNull().default('pending'),
  originalKey: text('original_key'), originalName: text('original_name'), originalBytes: integer('original_bytes'),
  originalSha256: text('original_sha256'), processingJson: text('processing_json'),
  createdAt: integer('created_at').notNull(), deletedAt: integer('deleted_at'),
}, t => [index('noah_agent_uploads_owner_created').on(t.ownerId, t.createdAt, t.id)]);

export const skyXOAuthStates = sqliteTable('sky_x_oauth_states', {
  stateHash:text('state_hash').primaryKey(),ownerId:text('owner_id').notNull(),cookieHash:text('cookie_hash').notNull(),verifier:text('verifier').notNull(),accountRevision:integer('account_revision').notNull(),expiresAt:integer('expires_at').notNull(),usedAt:integer('used_at').notNull().default(0),
}, t=>[index('sky_x_oauth_owner_expiry').on(t.ownerId,t.expiresAt)]);

export const eveDeviceJobs = sqliteTable('eve_device_jobs', {
  ownerId:text('owner_id').notNull(),jobId:text('job_id').notNull(),threadId:text('thread_id').notNull(),deviceId:text('device_id').notNull(),
  revision:integer('revision').notNull(),digest:text('digest').notNull(),envelope:text('envelope').notNull(),updatedAt:integer('updated_at').notNull(),
},table=>[uniqueIndex('idx_eve_device_job_owner_id').on(table.ownerId,table.jobId),index('idx_eve_device_jobs_thread').on(table.ownerId,table.threadId,table.updatedAt)]);

export const eveDevicePresence = sqliteTable('eve_device_presence', {
  ownerId:text('owner_id').notNull(),deviceId:text('device_id').notNull(),envelope:text('envelope').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[uniqueIndex('idx_eve_device_presence_owner_id').on(t.ownerId,t.deviceId)]);
// Common runtime observations coexist with legacy Pixel sync; neither is an execution grant.

export const eveRuntimePresence = sqliteTable('eve_runtime_presence', {
  ownerId:text('owner_id').notNull(),deviceId:text('device_id').notNull(),envelope:text('envelope').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[uniqueIndex('idx_eve_runtime_presence_owner_id').on(t.ownerId,t.deviceId)]);

export const eveDeviceCommands = sqliteTable('eve_device_commands', {
  ownerId:text('owner_id').notNull(),id:text('id').notNull(),deviceId:text('device_id').notNull(),threadId:text('thread_id').notNull(),
  digest:text('digest').notNull(),envelope:text('envelope').notNull(),state:text('state').notNull(),createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),
},t=>[uniqueIndex('idx_eve_device_command_owner_id').on(t.ownerId,t.id),index('idx_eve_device_command_pending').on(t.ownerId,t.deviceId,t.state)]);



export const rockstarAccounts = sqliteTable('rockstar_accounts', {
  userId: text('user_id').primaryKey(),
  recoverySha256: text('recovery_sha256').notNull().unique(),
  revision: integer('revision').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, t => [check('rockstar_account_recovery_hash', sql`length(${t.recoverySha256}) = 64`), check('rockstar_account_revision', sql`${t.revision} >= 1`)]);


export const rockstarAccountEnrollments = sqliteTable('rockstar_account_enrollments', {
  id: text('id').primaryKey(), userId: text('user_id'), mode: text('mode').notNull(),
  bindingSha256: text('binding_sha256').notNull(), origin: text('origin').notNull(),
  recoverySha256: text('recovery_sha256'), expectedRevision: integer('expected_revision').notNull().default(0), createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(), consumedAt: integer('consumed_at'), completionNonce: text('completion_nonce'),
}, t => [check('rockstar_account_enrollment_mode', sql`${t.mode} IN ('signup','add','recover','login')`),
  check('rockstar_account_enrollment_binding', sql`length(${t.bindingSha256}) = 64`), index('idx_rockstar_account_enrollment_expiry').on(t.expiresAt)]);


export const rockstarAccountRateLimits = sqliteTable('rockstar_account_rate_limits', {
  requestKey: text('request_key').notNull(), window: integer('window').notNull(), attempts: integer('attempts').notNull(),
}, t => [primaryKey({ columns: [t.requestKey, t.window] }), check('rockstar_account_rate_attempts', sql`${t.attempts} > 0`)]);


export const rockstarAccountPasswords = sqliteTable('rockstar_account_passwords', {
  userId: text('user_id').primaryKey(), handle: text('handle').notNull().unique(),
  salt: text('salt').notNull(), verifier: text('verifier').notNull(), accountRevision: integer('account_revision').notNull(),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, t => [check('rockstar_password_verifier', sql`length(${t.verifier}) = 64`), check('rockstar_password_revision', sql`${t.accountRevision} >= 1`)]);


export const rockstarAccountSessions = sqliteTable('rockstar_account_sessions', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), accountRevision: integer('account_revision').notNull(),
  tokenSha256: text('token_sha256').notNull().unique(), createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(), lastUsedAt: integer('last_used_at').notNull(), revokedAt: integer('revoked_at'),
}, t => [index('idx_rockstar_account_session_owner').on(t.userId), check('rockstar_account_session_hash', sql`length(${t.tokenSha256}) = 64`)]);
export const noahAgentDrafts = sqliteTable('noah_agent_drafts', {
  registeredUploadId: text('registered_upload_id'), registeredDraftRevision: integer('registered_draft_revision'), restoredFromRevision: integer('restored_from_revision'), purgedAt: integer('purged_at'),
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), content: text('content').notNull(),
  revision: integer('revision').notNull(), commandId: text('command_id').notNull(), inputSha256: text('input_sha256').notNull(),
  sourceKey: text('source_key'), sourceName: text('source_name'), sourceBytes: integer('source_bytes'), sourceSha256: text('source_sha256'),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(), deletedAt: integer('deleted_at'),
}, t => [index('noah_agent_drafts_owner_updated').on(t.ownerId, t.updatedAt, t.id)]);

export const noahAgentInvites = sqliteTable('noah_agent_invites', {
  executionAllowed: integer('execution_allowed').notNull().default(0),
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), uploadId: text('upload_id').notNull().references(() => noahAgentUploads.id),
  manifestSha256: text('manifest_sha256').notNull(), sourceSha256: text('source_sha256'), tokenSha256: text('token_sha256').notNull().unique(),
  inputSha256: text('input_sha256').notNull(), recipientId: text('recipient_id'), accessScope: text('access_scope').notNull(), expiresAt: integer('expires_at').notNull(),
  maxUses: integer('max_uses').notNull(), revision: integer('revision').notNull().default(1), revokedAt: integer('revoked_at'), createdAt: integer('created_at').notNull(),
}, t => [index('noah_invites_owner_created').on(t.ownerId,t.createdAt,t.id)]);
export const noahAgentInviteClaims = sqliteTable('noah_agent_invite_claims', {
  inviteId: text('invite_id').notNull().references(() => noahAgentInvites.id), recipientId: text('recipient_id').notNull(), claimedAt: integer('claimed_at').notNull(),
}, t => [primaryKey({columns:[t.inviteId,t.recipientId]}),index('noah_invite_claims_recipient').on(t.recipientId,t.inviteId)]);

export const noahInstances = sqliteTable('noah_instances', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), familyKey: text('family_key').notNull(),
  payload: text('payload').notNull(), revision: integer('revision').notNull(),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, t => [uniqueIndex('noah_instances_owner_family').on(t.ownerId,t.familyKey), index('noah_instances_owner_updated').on(t.ownerId,t.updatedAt,t.id)]);

export const noahDraftObjects = sqliteTable('noah_draft_objects', {
  objectKey: text('object_key').primaryKey(), ownerId: text('owner_id').notNull(), draftId: text('draft_id').notNull(),
  bytes: integer('bytes').notNull(), sha256: text('sha256').notNull(), state: text('state').notNull(),
  writeExpiresAt: integer('write_expires_at').notNull(), orphanedAt: integer('orphaned_at'),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, t => [index('noah_draft_objects_owner_state').on(t.ownerId,t.state,t.orphanedAt)]);
export const noahDraftStorageScans = sqliteTable('noah_draft_storage_scans', {
  ownerId: text('owner_id').primaryKey(), cursor: text('cursor'), lastScanAt: integer('last_scan_at'), revision: integer('revision').notNull().default(0),
});

export const noahRunnerDevices = sqliteTable('noah_runner_devices', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), credentialSha256: text('credential_sha256').notNull().unique(),
  bootId: text('boot_id').notNull(), name: text('name').notNull(), platform: text('platform').notNull(),
  createdAt: integer('created_at').notNull(), lastSeenAt: integer('last_seen_at').notNull(), revokedAt: integer('revoked_at'),
}, t => [index('noah_runner_owner').on(t.ownerId,t.lastSeenAt)]);
export const noahRunnerCommands = sqliteTable('noah_runner_commands', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), deviceId: text('device_id').notNull().references(() => noahRunnerDevices.id),
  bootId: text('boot_id').notNull(), kind: text('kind').notNull(), state: text('state').notNull(), requestSha256: text('request_sha256').notNull(),
  payload: text('payload').notNull(), leaseSha256: text('lease_sha256'), leaseUntil: integer('lease_until').notNull().default(0),
  stopRequested: integer('stop_requested').notNull().default(0), result: text('result'), createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, t => [index('noah_runner_queue').on(t.deviceId,t.state,t.createdAt),index('noah_runner_history').on(t.ownerId,t.updatedAt),
  index('noah_runner_usage').on(sql`json_extract(${t.payload},'$.pin.agentId')`,t.ownerId).where(sql`${t.kind}='run' AND ${t.state}='succeeded'`),
  uniqueIndex('noah_runner_one_claim').on(t.deviceId).where(sql`${t.state}='claimed'`),
  check('noah_runner_kind',sql`${t.kind} IN ('connect','run')`),check('noah_runner_state',sql`${t.state} IN ('queued','claimed','succeeded','failed','cancelled','unknown')`)]);

// Noah launch L3: isolated intake ledger (0044_noah_intake.sql).
export const noahIntakeSources = sqliteTable('noah_intake_sources', {
  id: text('id').primaryKey(),
  leaseId: text('lease_id'),
  leaseUntil: integer('lease_until').notNull().default(0),
  nextRunAt: integer('next_run_at').notNull().default(0),
  lastAttemptAt: integer('last_attempt_at'),
  lastSuccessAt: integer('last_success_at'),
  cursor: text('cursor'),
  updatedSince: text('updated_since'),
  sweepStartedAt: integer('sweep_started_at'),
  checkpointAt: integer('checkpoint_at'),
  lastFullAt: integer('last_full_at'),
  errorCode: text('error_code'),
  failureCount: integer('failure_count').notNull().default(0),
  observed: integer('observed').notNull().default(0),
  withdrawn: integer('withdrawn').notNull().default(0),
  requestCount: integer('request_count').notNull().default(0),
}, t => [
  check('noah_intake_sources_check_1', sql`${t.id} IN ('mcp-registry','hf-mcp-space','acp-registry')`),
]);
export const noahIntakeCandidates = sqliteTable('noah_intake_candidates', {
  id: text('id').primaryKey(),
  source: text('source').notNull().references(() => noahIntakeSources.id),
  externalKey: text('external_key').notNull(),
  familyId: text('family_id').notNull(),
  groupKey: text('group_key').notNull(),
  name: text('name').notNull(),
  summary: text('summary').notNull().default(''),
  summaryJa: text('summary_ja'),
  repository: text('repository'),
  host: text('host'),
  recordSha256: text('record_sha256').notNull(),
  recordJson: text('record_json').notNull(),
  state: text('state').notNull(),
  reason: text('reason'),
  running: integer('running').notNull().default(1),
  likes: integer('likes').notNull().default(0),
  sourceUpdatedAt: integer('source_updated_at'),
  firstSeenAt: integer('first_seen_at').notNull(),
  changedAt: integer('changed_at').notNull(),
  seenAt: integer('seen_at').notNull(),
  revision: integer('revision').notNull(),
}, t => [
  check('noah_intake_candidates_check_1', sql`length(${t.id}) BETWEEN 3 AND 300`),
  check('noah_intake_candidates_check_2', sql`length(${t.name}) BETWEEN 1 AND 200`),
  check('noah_intake_candidates_check_3', sql`length(${t.summary}) <= 500`),
  check('noah_intake_candidates_check_4', sql`${t.summaryJa} IS NULL OR length(${t.summaryJa}) <= 200`),
  check('noah_intake_candidates_check_5', sql`length(${t.recordSha256}) = 64`),
  check('noah_intake_candidates_check_6', sql`json_valid(${t.recordJson}) AND length(${t.recordJson}) <= 65536`),
  check('noah_intake_candidates_check_7', sql`${t.state} IN ('active','unsupported','withdrawn')`),
  check('noah_intake_candidates_check_8', sql`${t.running} IN (0,1)`),
  check('noah_intake_candidates_check_9', sql`${t.likes} >= 0`),
  check('noah_intake_candidates_check_10', sql`${t.revision} >= 1`),
  check('noah_intake_candidates_check_11', sql`(${t.state} = 'unsupported') = (${t.reason} IS NOT NULL)`),
  uniqueIndex('noah_intake_candidates_key').on(t.source, t.externalKey),
  index('noah_intake_candidates_family').on(t.familyId, t.state),
  index('noah_intake_candidates_sweep').on(t.source, t.state, t.seenAt),
  index('noah_intake_candidates_repository').on(t.repository).where(sql`${t.repository} IS NOT NULL`),
  index('noah_intake_candidates_group').on(t.source, t.groupKey, t.host),
]);
export const noahIntakeChecks = sqliteTable('noah_intake_checks', {
  candidateId: text('candidate_id').primaryKey().references(() => noahIntakeCandidates.id),
  mouth: text('mouth').notNull(),
  surface: text('surface').notNull(),
  auth: text('auth').notNull(),
  connectJson: text('connect_json').notNull(),
  connectSha256: text('connect_sha256').notNull(),
  setup: integer('setup').notNull(),
  oauthJson: text('oauth_json'),
  toolsSha256: text('tools_sha256'),
  toolCount: integer('tool_count'),
  readOnly: integer('read_only'),
  formTools: integer('form_tools'),
  oneTapTools: integer('one_tap_tools'),
  level: integer('level').notNull(),
  result: text('result').notNull(),
  latencyMs: integer('latency_ms'),
  sampleJson: text('sample_json'),
  checkedAt: integer('checked_at'),
  l1At: integer('l1_at'),
  l2At: integer('l2_at'),
  nextCheckAt: integer('next_check_at').notNull(),
  failures: integer('failures').notNull().default(0),
  firstFailureAt: integer('first_failure_at'),
  leaseUntil: integer('lease_until').notNull().default(0),
}, t => [
  check('noah_intake_checks_check_1', sql`${t.mouth} IN ('mcp-remote','space-mcp','a2a','mcp-package','acp','source')`),
  check('noah_intake_checks_check_2', sql`${t.surface} IN ('none','terminal','browser','screen','own-device')`),
  check('noah_intake_checks_check_3', sql`${t.auth} IN ('none','oauth','key','payment','unknown')`),
  check('noah_intake_checks_check_4', sql`json_valid(${t.connectJson}) AND length(${t.connectJson}) <= 16384`),
  check('noah_intake_checks_check_5', sql`length(${t.connectSha256}) = 64`),
  check('noah_intake_checks_check_6', sql`${t.setup} IN (0,1)`),
  check('noah_intake_checks_check_7', sql`${t.oauthJson} IS NULL OR json_valid(${t.oauthJson})`),
  check('noah_intake_checks_check_8', sql`${t.toolsSha256} IS NULL OR length(${t.toolsSha256}) = 64`),
  check('noah_intake_checks_check_9', sql`${t.toolCount} IS NULL OR ${t.toolCount} >= 0`),
  check('noah_intake_checks_check_10', sql`${t.readOnly} IS NULL OR ${t.readOnly} IN (0,1)`),
  check('noah_intake_checks_check_11', sql`${t.formTools} IS NULL OR ${t.formTools} >= 0`),
  check('noah_intake_checks_check_12', sql`${t.oneTapTools} IS NULL OR ${t.oneTapTools} >= 0`),
  check('noah_intake_checks_check_13', sql`${t.level} IN (0,1,2)`),
  check('noah_intake_checks_check_14', sql`${t.result} IN ('unchecked','ok','auth_required','payment_required','forbidden','rate_limited','unreachable','incompatible','too_large','blocked')`),
  check('noah_intake_checks_check_15', sql`${t.latencyMs} IS NULL OR ${t.latencyMs} >= 0`),
  check('noah_intake_checks_check_16', sql`${t.sampleJson} IS NULL OR (json_valid(${t.sampleJson}) AND length(${t.sampleJson}) <= 4096)`),
  check('noah_intake_checks_check_17', sql`${t.failures} >= 0`),
  check('noah_intake_checks_check_18', sql`${t.level} = 0 OR (${t.toolsSha256} IS NOT NULL AND ${t.l1At} IS NOT NULL)`),
  check('noah_intake_checks_check_19', sql`${t.level} < 2 OR ${t.l2At} IS NOT NULL`),
  check('noah_intake_checks_check_20', sql`(${t.failures} = 0) = (${t.firstFailureAt} IS NULL)`),
  index('noah_intake_checks_due').on(t.nextCheckAt, t.leaseUntil).where(sql`${t.setup} = 0 AND ${t.mouth} IN ('mcp-remote','space-mcp','a2a')`),
  index('noah_intake_checks_level').on(t.level, t.l2At),
]);
export const noahIntakeFamilies = sqliteTable('noah_intake_families', {
  id: text('id').primaryKey(),
  representativeId: text('representative_id').notNull().references(() => noahIntakeCandidates.id),
  members: integer('members').notNull(),
  level: integer('level').notNull(),
  l2At: integer('l2_at'),
  badgeHint: text('badge_hint').notNull(),
  connections: integer('connections').notNull().default(0),
  listed: integer('listed').notNull().default(0),
  oneTap: integer('one_tap').notNull().default(0),
  shuffle: integer('shuffle').notNull().default(0),
  claimedBy: text('claimed_by'),
  claimedAt: integer('claimed_at'),
  withdrawnAt: integer('withdrawn_at'),
  hiddenAt: integer('hidden_at'),
  updatedAt: integer('updated_at').notNull(),
  revision: integer('revision').notNull(),
}, t => [
  check('noah_intake_families_check_1', sql`length(${t.id}) BETWEEN 3 AND 400`),
  check('noah_intake_families_check_2', sql`${t.members} >= 1`),
  check('noah_intake_families_check_3', sql`${t.level} IN (0,1,2)`),
  check('noah_intake_families_check_4', sql`${t.badgeHint} IN ('one_click','taps','setup','unverified','blocked')`),
  check('noah_intake_families_check_5', sql`${t.connections} >= 0`),
  check('noah_intake_families_check_6', sql`${t.listed} IN (0,1)`),
  check('noah_intake_families_check_7', sql`${t.oneTap} IN (0,1)`),
  check('noah_intake_families_check_8', sql`${t.shuffle} >= 0`),
  check('noah_intake_families_check_9', sql`${t.revision} >= 1`),
  check('noah_intake_families_check_10', sql`(${t.claimedBy} IS NULL) = (${t.claimedAt} IS NULL)`),
  index('noah_intake_families_timeline').on(t.l2At, t.id).where(sql`${t.level} = 2 AND ${t.withdrawnAt} IS NULL AND ${t.hiddenAt} IS NULL`),
  index('noah_intake_families_listed').on(t.shuffle, t.id).where(sql`${t.listed} = 1 AND ${t.level} = 1 AND ${t.withdrawnAt} IS NULL AND ${t.hiddenAt} IS NULL`),
  index('noah_intake_families_representative').on(t.representativeId),
  index('noah_intake_families_claimed').on(t.claimedBy).where(sql`${t.claimedBy} IS NOT NULL`),
]);
export const noahProbeHosts = sqliteTable('noah_probe_hosts', {
  host: text('host').primaryKey(),
  lastProbeAt: integer('last_probe_at').notNull(),
  notBefore: integer('not_before').notNull().default(0),
  userWindowAt: integer('user_window_at').notNull().default(0),
  userCount: integer('user_count').notNull().default(0),
}, t => [
  check('noah_probe_hosts_check_1', sql`${t.userCount} >= 0`),
]);

// Explicit user-selected output contributions. Withdrawal removes the snapshot.
export const noahResultContributions = sqliteTable('noah_result_contributions', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), workId: text('work_id').notNull(),
  workRevision: integer('work_revision').notNull(), requestSha256: text('request_sha256').notNull(),
  sourceSha256: text('source_sha256').notNull(), policyVersion: text('policy_version').notNull(),
  state: text('state').notNull(), snapshot: text('snapshot'), createdAt: integer('created_at').notNull(), revokedAt: integer('revoked_at'),
}, t => [
  uniqueIndex('noah_result_one_work').on(t.ownerId, t.workId),
  index('noah_result_operator').on(t.state, t.createdAt, t.id),
  check('noah_result_revision', sql`${t.workRevision} >= 0`),
  check('noah_result_request_hash', sql`length(${t.requestSha256}) = 64`),
  check('noah_result_source_hash', sql`length(${t.sourceSha256}) = 64`),
  check('noah_result_policy', sql`${t.policyVersion} = 'noah-quality-v1'`),
  check('noah_result_state', sql`${t.state} IN ('active','revoked')`),
  check('noah_result_snapshot', sql`${t.snapshot} IS NULL OR (json_valid(${t.snapshot}) AND length(CAST(${t.snapshot} AS BLOB)) <= 196608)`),
  check('noah_result_withdrawal', sql`(${t.state} = 'active' AND ${t.snapshot} IS NOT NULL AND ${t.revokedAt} IS NULL) OR (${t.state} = 'revoked' AND ${t.snapshot} IS NULL AND ${t.revokedAt} IS NOT NULL)`),
]);

export const noahAgentCrowns = sqliteTable('noah_agent_crowns', {
  agentId:text('agent_id').notNull(), ownerId:text('owner_id').notNull(), enabled:integer('enabled').notNull(),
  revision:integer('revision').notNull(), requestId:text('request_id').notNull(), updatedAt:integer('updated_at').notNull(),
}, t=>[primaryKey({columns:[t.agentId,t.ownerId]}),index('noah_crowns_count').on(t.agentId,t.enabled),check('noah_crown_enabled',sql`${t.enabled} IN (0,1)`),check('noah_crown_revision',sql`${t.revision}>=1`)]);
export const noahAgentComments = sqliteTable('noah_agent_comments', {
  id:text('id').primaryKey(), agentId:text('agent_id').notNull(), ownerId:text('owner_id').notNull(), profileId:text('profile_id').notNull().references(()=>skySocialProfiles.id),
  parentId:text('parent_id'), content:text('content').notNull(), contentSha256:text('content_sha256').notNull(), createdAt:integer('created_at').notNull(), deletedAt:integer('deleted_at'),
}, t=>[index('noah_comments_feed').on(t.agentId,t.createdAt,t.id),index('noah_comments_rate').on(t.ownerId,t.createdAt),check('noah_comment_length',sql`length(${t.content})<=1000`),check('noah_comment_parent',sql`${t.parentId} IS NULL OR ${t.parentId}<>${t.id}`)]);
export const noahMaintenanceRequests = sqliteTable('noah_maintenance_requests', {
  id:text('id').primaryKey(), ownerId:text('owner_id').notNull(), agentId:text('agent_id').notNull(), objective:text('objective').notNull(), repository:text('repository').notNull(), requestSha256:text('request_sha256').notNull(),
  state:text('state').notNull(), scopeVersion:text('scope_version').notNull(), createdAt:integer('created_at').notNull(),
}, t=>[index('noah_maintenance_owner').on(t.ownerId,t.createdAt),check('noah_maintenance_state',sql`${t.state}='requested'`),check('noah_maintenance_scope',sql`${t.scopeVersion}='noah-maintenance-v1'`)]);

// 接続（Passport）。account が正本。DDL は drizzle/0047_noah_connections.sql と、索引を 1 つ足す 0049_noah_connections_connecting.sql（docs/contracts/noah-v1.sql から移した）。
export const noahConnections = sqliteTable('noah_connections', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  familyKey: text('family_key').notNull(),
  agentId: text('agent_id').notNull(),
  digest: text('digest').notNull(),
  requestSha256: text('request_sha256').notNull(),
  connectJson: text('connect_json').notNull(),
  connectSha256: text('connect_sha256').notNull(),
  planSha256: text('plan_sha256').notNull(),
  toolsSha256: text('tools_sha256'),
  confirmedToolsJson: text('confirmed_tools_json').notNull().default('[]'),
  egressGrantedJson: text('egress_granted_json').notNull().default('[]'),
  place: text('place').notNull(),
  deviceId: text('device_id').references(() => noahRunnerDevices.id),
  runnerCommandId: text('runner_command_id'),
  state: text('state').notNull(),
  needsJson: text('needs_json'),
  consentJson: text('consent_json').notNull(),
  priceJson: text('price_json').notNull(),
  costTaps: integer('cost_taps').notNull(),
  costTyped: integer('cost_typed').notNull(),
  probeMs: integer('probe_ms'),
  error: text('error'),
  revision: integer('revision').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  connectedAt: integer('connected_at'),
  lastUsedAt: integer('last_used_at'),
  disconnectedAt: integer('disconnected_at'),
}, t => [
  check('noah_connections_check_1', sql`length(${t.id}) = 36`),
  check('noah_connections_check_2', sql`length(${t.requestSha256}) = 64`),
  check('noah_connections_check_3', sql`json_valid(${t.connectJson}) AND length(${t.connectJson}) <= 16384`),
  check('noah_connections_check_4', sql`length(${t.connectSha256}) = 64`),
  check('noah_connections_check_5', sql`length(${t.planSha256}) = 64`),
  check('noah_connections_check_6', sql`${t.toolsSha256} IS NULL OR length(${t.toolsSha256}) = 64`),
  check('noah_connections_check_7', sql`json_valid(${t.confirmedToolsJson})`),
  check('noah_connections_check_8', sql`json_valid(${t.egressGrantedJson})`),
  check('noah_connections_check_9', sql`${t.place} IN ('provider','home','cloud','pocket')`),
  check('noah_connections_check_10', sql`${t.state} IN ('planned','entitling','preparing','probing','needs_action','connected','failed','unknown','blocked','disconnected')`),
  check('noah_connections_check_11', sql`${t.needsJson} IS NULL OR json_valid(${t.needsJson})`),
  check('noah_connections_check_12', sql`json_valid(${t.consentJson})`),
  check('noah_connections_check_13', sql`json_valid(${t.priceJson})`),
  check('noah_connections_check_14', sql`${t.costTaps} >= 0`),
  check('noah_connections_check_15', sql`${t.costTyped} >= 0`),
  check('noah_connections_check_16', sql`${t.probeMs} IS NULL OR ${t.probeMs} >= 0`),
  check('noah_connections_check_17', sql`${t.error} IS NULL OR length(${t.error}) <= 300`),
  check('noah_connections_check_18', sql`${t.revision} >= 1`),
  check('noah_connections_check_19', sql`(${t.place} IN ('home','pocket')) = (${t.deviceId} IS NOT NULL)`),
  check('noah_connections_check_20', sql`(${t.state} = 'disconnected') = (${t.disconnectedAt} IS NOT NULL)`),
  check('noah_connections_check_21', sql`${t.state} <> 'needs_action' OR ${t.needsJson} IS NOT NULL`),
  check('noah_connections_check_22', sql`${t.state} <> 'connected' OR ${t.connectedAt} IS NOT NULL`),
  uniqueIndex('noah_connections_one_live').on(t.ownerId, t.familyKey).where(sql`${t.disconnectedAt} IS NULL`),
  index('noah_connections_owner').on(t.ownerId, t.updatedAt, t.id),
  index('noah_connections_device').on(t.deviceId, t.state).where(sql`${t.deviceId} IS NOT NULL`),
  index('noah_connections_family').on(t.familyKey, t.state),
  // つなぐ途中のまま止まった接続を、巡回の後始末が拾う（drizzle/0049_noah_connections_connecting.sql）。
  index('noah_connections_connecting').on(t.updatedAt).where(sql`${t.disconnectedAt} IS NULL AND ${t.state} IN ('planned','entitling','preparing','probing')`),
]);

// 頼む（入力欄から、相手のサーバーの道具を 1 回呼ぶ仕事）。依頼と成果の本文は Work にだけ置く。DDL は drizzle/0048_noah_asks.sql（docs/contracts/noah-v1.sql から移した）。
export const noahAsks = sqliteTable('noah_asks', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  connectionId: text('connection_id').notNull().references(() => noahConnections.id),
  workId: text('work_id').notNull(),
  requestSha256: text('request_sha256').notNull(),
  mode: text('mode').notNull(),
  host: text('host'),
  tool: text('tool'),
  toolSha256: text('tool_sha256'),
  screen: text('screen'),
  state: text('state').notNull(),
  stopRequested: integer('stop_requested').notNull().default(0),
  pendingJson: text('pending_json'),
  step: integer('step').notNull().default(0),
  leaseUntil: integer('lease_until').notNull().default(0),
  modelCalls: integer('model_calls').notNull().default(0),
  toolCalls: integer('tool_calls').notNull().default(0),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  error: text('error'),
  revision: integer('revision').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  finishedAt: integer('finished_at'),
}, t => [
  check('noah_asks_check_1', sql`length(${t.id}) = 36`),
  check('noah_asks_check_2', sql`length(${t.requestSha256}) = 64`),
  check('noah_asks_check_3', sql`${t.mode} IN ('agent','form')`),
  check('noah_asks_check_4', sql`${t.tool} IS NULL OR length(${t.tool}) BETWEEN 1 AND 128`),
  check('noah_asks_check_5', sql`${t.toolSha256} IS NULL OR length(${t.toolSha256}) = 64`),
  check('noah_asks_check_6', sql`${t.screen} IS NULL OR ${t.screen} IN ('narrow','wide')`),
  check('noah_asks_check_7', sql`${t.state} IN ('queued','running','your_turn','succeeded','failed','stopped','limit','unknown')`),
  check('noah_asks_check_8', sql`${t.stopRequested} IN (0,1)`),
  check('noah_asks_check_9', sql`${t.pendingJson} IS NULL OR json_valid(${t.pendingJson})`),
  check('noah_asks_check_10', sql`${t.step} >= 0`),
  check('noah_asks_check_11', sql`${t.error} IS NULL OR length(${t.error}) <= 300`),
  check('noah_asks_check_12', sql`${t.revision} >= 1`),
  check('noah_asks_check_13', sql`(${t.state} = 'your_turn') = (${t.pendingJson} IS NOT NULL)`),
  check('noah_asks_check_14', sql`(${t.state} IN ('succeeded','failed','stopped','limit','unknown')) = (${t.finishedAt} IS NOT NULL)`),
  check('noah_asks_check_15', sql`${t.mode} <> 'form' OR (${t.tool} IS NOT NULL AND ${t.toolSha256} IS NOT NULL AND ${t.host} IS NOT NULL)`),
  index('noah_asks_owner').on(t.ownerId, t.updatedAt, t.id),
  index('noah_asks_open').on(t.state, t.leaseUntil).where(sql`${t.finishedAt} IS NULL`),
  index('noah_asks_owner_created').on(t.ownerId, t.createdAt),
  index('noah_asks_host_created').on(t.host, t.createdAt).where(sql`${t.host} IS NOT NULL`),
]);

// 棚のカード（パッケージ）と、その工程の先。DDL は drizzle/0050_noah_shelf.sql（docs/contracts/noah-shelf-v1.sql から移した。task 110）。
export const noahPackages = sqliteTable('noah_packages', {
  id: text('id').primaryKey(),
  shelf: text('shelf').notNull(),
  topic: text('topic').notNull(),
  position: integer('position').notNull(),
  status: text('status').notNull(),
  packageJson: text('package_json').notNull(),
  packageSha256: text('package_sha256').notNull(),
  listed: integer('listed').notNull().default(0),
  reason: text('reason'),
  reasonStep: integer('reason_step'),
  checkedAt: integer('checked_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  revision: integer('revision').notNull(),
}, t => [
  check('noah_packages_check_1', sql`${t.id} GLOB 'pkg:[a-z0-9]*' AND ${t.id} NOT GLOB '*[^a-z0-9:-]*' AND length(${t.id}) BETWEEN 6 AND 67`),
  check('noah_packages_check_2', sql`${t.shelf} IN ('earn','learn','life')`),
  check('noah_packages_check_3', sql`${t.topic} IN ('dev','research','support','office','study','home','health')`),
  check('noah_packages_check_4', sql`${t.position} BETWEEN 0 AND 9999`),
  check('noah_packages_check_5', sql`${t.status} IN ('draft','verified','retired')`),
  check('noah_packages_check_6', sql`json_valid(${t.packageJson}) AND length(${t.packageJson}) <= 8192`),
  check('noah_packages_check_7', sql`length(${t.packageSha256}) = 64`),
  check('noah_packages_check_8', sql`${t.listed} IN (0,1)`),
  check('noah_packages_check_9', sql`${t.reason} IS NULL OR ${t.reason} IN ('retired','draft','advice_unreviewed','later_chain','later_home','step_missing','step_not_running','step_changed')`),
  check('noah_packages_check_10', sql`${t.reasonStep} IS NULL OR ${t.reasonStep} BETWEEN 0 AND 5`),
  check('noah_packages_check_11', sql`${t.revision} >= 1`),
  check('noah_packages_check_12', sql`(${t.listed} = 1) = (${t.reason} IS NULL)`),
  check('noah_packages_check_13', sql`${t.listed} = 0 OR ${t.status} = 'verified'`),
  check('noah_packages_check_14', sql`${t.reasonStep} IS NULL OR ${t.reason} IS NOT NULL`),
  index('noah_packages_shelf').on(t.shelf, t.position, t.id).where(sql`${t.listed} = 1`),
]);
export const noahPackageSteps = sqliteTable('noah_package_steps', {
  packageId: text('package_id').notNull().references(() => noahPackages.id),
  step: integer('step').notNull(),
  kind: text('kind').notNull(),
  ref: text('ref').notNull(),
  tool: text('tool'),
}, t => [
  primaryKey({ columns: [t.packageId, t.step] }),
  check('noah_package_steps_check_1', sql`${t.step} BETWEEN 0 AND 5`),
  check('noah_package_steps_check_2', sql`${t.kind} IN ('family','home','builtin','owner','gap')`),
  check('noah_package_steps_check_3', sql`length(${t.ref}) <= 400`),
  check('noah_package_steps_check_4', sql`${t.tool} IS NULL OR length(${t.tool}) BETWEEN 1 AND 128`),
  check('noah_package_steps_check_5', sql`(${t.kind} = 'family') = (${t.tool} IS NOT NULL)`),
  check('noah_package_steps_check_6', sql`(${t.kind} IN ('owner','gap')) = (${t.ref} = '')`),
  index('noah_package_steps_ref').on(t.kind, t.ref),
]);
// 接続が、どのカードの中でつながれたか。DDL は drizzle/0053_noah_package_connections.sql（docs/contracts/noah-shelf-v1.sql から移した。task 113）。
// 同じカードの中の接続は、つなげる数を 1 と数える。カードの外の接続は、行を持たない。
export const noahPackageConnections = sqliteTable('noah_package_connections', {
  connectionId: text('connection_id').primaryKey().references(() => noahConnections.id),
  packageId: text('package_id').notNull().references(() => noahPackages.id),
}, t => [
  index('noah_package_connections_package').on(t.packageId),
]);
// ピンタレスト風の一覧のボード・フォロー・数えた実績・「表示しない」。DDL は drizzle/0054_noah_boards.sql（task 115。docs/noah/spec-115-pin-grid.md の 4 章）。
// 実績（noah_pin_stats）は全員の合計で、本人の ID は無い。本人ごとの行は、本人が作ったボード・保存・フォロー・「表示しない」だけ。
export const noahBoards = sqliteTable('noah_boards', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  visibility: text('visibility').notNull().default('private'),
  pins: integer('pins').notNull().default(0),
  followers: integer('followers').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  revision: integer('revision').notNull().default(1),
}, t => [
  index('noah_boards_owner').on(t.ownerId, sql`${t.updatedAt} DESC`),
  check('noah_boards_name', sql`length(${t.name}) BETWEEN 1 AND 40`),
  check('noah_boards_visibility', sql`${t.visibility} IN ('private', 'public')`),
  check('noah_boards_pins', sql`${t.pins} >= 0`),
  check('noah_boards_followers', sql`${t.followers} >= 0`),
  check('noah_boards_revision', sql`${t.revision} >= 1`),
]);
export const noahBoardPins = sqliteTable('noah_board_pins', {
  boardId: text('board_id').notNull().references(() => noahBoards.id),
  familyId: text('family_id').notNull().references(() => noahIntakeFamilies.id),
  ownerId: text('owner_id').notNull(),
  createdAt: integer('created_at').notNull(),
}, t => [
  primaryKey({ columns: [t.boardId, t.familyId] }),
  index('noah_board_pins_family').on(t.familyId, t.boardId),
  index('noah_board_pins_owner').on(t.ownerId, sql`${t.createdAt} DESC`),
  index('noah_board_pins_board').on(t.boardId, sql`${t.createdAt} DESC`),
]);
export const noahBoardFollows = sqliteTable('noah_board_follows', {
  boardId: text('board_id').notNull().references(() => noahBoards.id),
  followerId: text('follower_id').notNull(),
  createdAt: integer('created_at').notNull(),
}, t => [
  primaryKey({ columns: [t.boardId, t.followerId] }),
  index('noah_board_follows_follower').on(t.followerId, sql`${t.createdAt} DESC`),
]);
export const noahPinStats = sqliteTable('noah_pin_stats', {
  familyId: text('family_id').primaryKey().references(() => noahIntakeFamilies.id),
  savers: integer('savers').notNull().default(0),
  succeeded: integer('succeeded').notNull().default(0),
  hides: integer('hides').notNull().default(0),
  votes: integer('votes').notNull().default(0),
  hot: real('hot').notNull().default(0),
  anchorAt: integer('anchor_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, t => [
  index('noah_pin_stats_hot').on(sql`${t.hot} DESC`, t.familyId).where(sql`${t.votes} > 0`),
  check('noah_pin_stats_savers', sql`${t.savers} >= 0`),
  check('noah_pin_stats_succeeded', sql`${t.succeeded} >= 0`),
  check('noah_pin_stats_hides', sql`${t.hides} >= 0`),
]);
export const noahPinHidden = sqliteTable('noah_pin_hidden', {
  ownerId: text('owner_id').notNull(),
  familyId: text('family_id').notNull().references(() => noahIntakeFamilies.id),
  createdAt: integer('created_at').notNull(),
}, t => [
  primaryKey({ columns: [t.ownerId, t.familyId] }),
  index('noah_pin_hidden_family').on(t.familyId),
]);
export const noahPinRollups = sqliteTable('noah_pin_rollups', {
  id: text('id').primaryKey(),
  day: text('day').notNull(),
  startedAt: integer('started_at').notNull(),
}, t => [
  check('noah_pin_rollups_id', sql`${t.id} = 'succeeded'`),
]);
// 棚の実績の集計と、見せた記録。DDL は drizzle/0052_noah_shelf_evidence.sql（docs/contracts/noah-shelf-v1.sql から移した。task 111）。
// 集計と、全員を合わせた見せた記録に、本人の ID は無い。本人ごとの行は、履歴の利用に同意した本人の分と、本人が頼んだ「非表示」だけ。
export const noahPackageEvidence = sqliteTable('noah_package_evidence', {
  packageId: text('package_id').primaryKey().references(() => noahPackages.id),
  people: integer('people').notNull(),
  connects: integer('connects').notNull(),
  connected: integer('connected').notNull(),
  asks: integer('asks').notNull(),
  succeeded: integer('succeeded').notNull(),
  reviewed: integer('reviewed').notNull().default(0),
  accepted: integer('accepted').notNull().default(0),
  firstUsers: integer('first_users').notNull(),
  returned: integer('returned').notNull(),
  medianSeconds: integer('median_seconds'),
  sinceAt: integer('since_at').notNull(),
  computedAt: integer('computed_at').notNull(),
}, t => [
  check('noah_package_evidence_check_1', sql`${t.people} >= 0`),
  check('noah_package_evidence_check_2', sql`${t.connects} >= 0`),
  check('noah_package_evidence_check_3', sql`${t.connected} >= 0`),
  check('noah_package_evidence_check_4', sql`${t.asks} >= 0`),
  check('noah_package_evidence_check_5', sql`${t.succeeded} >= 0`),
  check('noah_package_evidence_check_6', sql`${t.reviewed} >= 0`),
  check('noah_package_evidence_check_7', sql`${t.accepted} >= 0`),
  check('noah_package_evidence_check_8', sql`${t.firstUsers} >= 0`),
  check('noah_package_evidence_check_9', sql`${t.returned} >= 0`),
  check('noah_package_evidence_check_10', sql`${t.medianSeconds} IS NULL OR ${t.medianSeconds} >= 0`),
  check('noah_package_evidence_check_11', sql`${t.connected} <= ${t.connects} AND ${t.succeeded} <= ${t.asks} AND ${t.accepted} <= ${t.reviewed} AND ${t.returned} <= ${t.firstUsers}`),
]);
export const noahShelfDaily = sqliteTable('noah_shelf_daily', {
  day: integer('day').notNull(),
  packageId: text('package_id').notNull().references(() => noahPackages.id),
  band: text('band').notNull(),
  shown: integer('shown').notNull().default(0),
  opened: integer('opened').notNull().default(0),
}, t => [
  primaryKey({ columns: [t.day, t.packageId, t.band] }),
  check('noah_shelf_daily_check_1', sql`${t.day} BETWEEN 20260101 AND 99991231`),
  check('noah_shelf_daily_check_2', sql`${t.band} IN ('top','mid','low')`),
  check('noah_shelf_daily_check_3', sql`${t.shown} >= 0`),
  check('noah_shelf_daily_check_4', sql`${t.opened} >= 0`),
]);
export const noahShelfSeen = sqliteTable('noah_shelf_seen', {
  ownerId: text('owner_id').notNull(),
  packageId: text('package_id').notNull().references(() => noahPackages.id),
  shown: integer('shown').notNull().default(0),
  opened: integer('opened').notNull().default(0),
  hidden: integer('hidden').notNull().default(0),
  firstAt: integer('first_at').notNull(),
  lastAt: integer('last_at').notNull(),
}, t => [
  primaryKey({ columns: [t.ownerId, t.packageId] }),
  check('noah_shelf_seen_check_1', sql`${t.shown} >= 0`),
  check('noah_shelf_seen_check_2', sql`${t.opened} >= 0`),
  check('noah_shelf_seen_check_3', sql`${t.hidden} IN (0,1)`),
  check('noah_shelf_seen_check_4', sql`${t.lastAt} >= ${t.firstAt}`),
]);
// 300 人の試行（docs/noah/trial-300.md）。DDL は drizzle/0051_noah_trial.sql（docs/contracts/noah-shelf-v1.sql から移した。task 114）。
// 経路の札は、運営が登録した物だけ。入口は、本人 1 人につき 1 行。報告は、本人が自分で入れる数だけ（文章は置かない）。
export const noahTrialChannels = sqliteTable('noah_trial_channels', {
  via: text('via').primaryKey(),
  label: text('label').notNull(),
  wave: integer('wave').notNull(),
  createdAt: integer('created_at').notNull(),
  closedAt: integer('closed_at'),
}, t => [
  check('noah_trial_channels_check_1', sql`${t.via} GLOB '[a-z0-9]*' AND ${t.via} NOT GLOB '*[^a-z0-9-]*' AND length(${t.via}) BETWEEN 1 AND 40`),
  check('noah_trial_channels_check_2', sql`length(${t.label}) BETWEEN 1 AND 60`),
  check('noah_trial_channels_check_3', sql`${t.wave} IN (1,2,3)`),
]);
export const noahTrialEntries = sqliteTable('noah_trial_entries', {
  ownerId: text('owner_id').primaryKey(),
  via: text('via').notNull().references(() => noahTrialChannels.via),
  wave: integer('wave').notNull(),
  createdAt: integer('created_at').notNull(),
}, t => [
  check('noah_trial_entries_check_1', sql`${t.wave} IN (1,2,3)`),
  index('noah_trial_entries_via').on(t.via, t.wave),
]);
export const noahTrialReports = sqliteTable('noah_trial_reports', {
  ownerId: text('owner_id').notNull().references(() => noahTrialEntries.ownerId),
  packageId: text('package_id').notNull().references(() => noahPackages.id),
  listed: integer('listed').notNull(),
  sold: integer('sold').notNull(),
  netYen: integer('net_yen').notNull(),
  minutes: integer('minutes').notNull(),
  reportedAt: integer('reported_at').notNull(),
}, t => [
  primaryKey({ columns: [t.ownerId, t.packageId] }),
  check('noah_trial_reports_check_1', sql`${t.listed} IN (0,1)`),
  check('noah_trial_reports_check_2', sql`${t.sold} BETWEEN 0 AND 999`),
  check('noah_trial_reports_check_3', sql`${t.netYen} BETWEEN 0 AND 100000000`),
  check('noah_trial_reports_check_4', sql`${t.minutes} BETWEEN 0 AND 100000`),
  check('noah_trial_reports_check_5', sql`${t.sold} = 0 OR ${t.listed} = 1`),
  check('noah_trial_reports_check_6', sql`${t.netYen} = 0 OR ${t.sold} > 0`),
  index('noah_trial_reports_package').on(t.packageId),
]);

// 定期便の台帳（受け取る人・入金と費用・寄与・月の締め・人ごとの結果）。DDL は drizzle/0055_noah_teikibin.sql（task 124。docs/noah/spec-124-teikibin-ledger.md の 4 章）。
// 生の口座番号・回線番号は持たない（identity_key は HMAC）。お金は送らない（振込は運営が行い、結果だけを書く）。
export const noahTeikibinPeople = sqliteTable('noah_teikibin_people', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  code: text('code').notNull(),
  identityKey: text('identity_key'),
  method: text('method'),
  verifiedBy: text('verified_by'),
  verifiedAt: integer('verified_at'),
  revokedAt: integer('revoked_at'),
  revokedBy: text('revoked_by'),
  revokeReason: text('revoke_reason'),
  planOptIn: integer('plan_opt_in').notNull().default(0),
  createdAt: integer('created_at').notNull(),
}, t => [
  uniqueIndex('noah_teikibin_people_owner').on(t.ownerId),
  uniqueIndex('noah_teikibin_people_code').on(t.code),
  uniqueIndex('noah_teikibin_people_identity').on(t.identityKey).where(sql`${t.identityKey} IS NOT NULL AND ${t.revokedAt} IS NULL`),
  check('noah_teikibin_people_code_length', sql`length(${t.code}) = 9`),
  check('noah_teikibin_people_identity_length', sql`${t.identityKey} IS NULL OR length(${t.identityKey}) = 64`),
  check('noah_teikibin_people_method', sql`${t.method} IS NULL OR ${t.method} IN ('bank_account', 'esim_line')`),
  check('noah_teikibin_people_plan', sql`${t.planOptIn} IN (0, 1)`),
  check('noah_teikibin_people_verified', sql`(${t.identityKey} IS NULL) = (${t.verifiedAt} IS NULL) AND (${t.identityKey} IS NULL) = (${t.method} IS NULL)`),
]);
export const noahTeikibinEntries = sqliteTable('noah_teikibin_entries', {
  id: text('id').primaryKey(),
  month: text('month').notNull(),
  kind: text('kind').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  source: text('source').notNull(),
  reference: text('reference').notNull(),
  note: text('note').notNull().default(''),
  recordedBy: text('recorded_by').notNull(),
  createdAt: integer('created_at').notNull(),
  voidedAt: integer('voided_at'),
  voidedBy: text('voided_by'),
  voidReason: text('void_reason'),
}, t => [
  uniqueIndex('noah_teikibin_entries_reference').on(t.kind, t.reference).where(sql`${t.voidedAt} IS NULL`),
  index('noah_teikibin_entries_month').on(t.month, t.createdAt),
  check('noah_teikibin_entries_month_length', sql`length(${t.month}) = 7`),
  check('noah_teikibin_entries_kind', sql`${t.kind} IN ('income', 'refund', 'platform_fee', 'direct_cost', 'creator_share')`),
  check('noah_teikibin_entries_amount', sql`${t.amountMinor} BETWEEN 1 AND 1000000000`),
  check('noah_teikibin_entries_source', sql`${t.source} IN ('coconala', 'noah', 'cloud', 'ai', 'bank', 'other')`),
  check('noah_teikibin_entries_reference_length', sql`length(${t.reference}) BETWEEN 3 AND 120`),
  check('noah_teikibin_entries_note', sql`length(${t.note}) <= 200`),
]);
export const noahTeikibinContributions = sqliteTable('noah_teikibin_contributions', {
  id: text('id').primaryKey(),
  month: text('month').notNull(),
  personId: text('person_id').notNull().references(() => noahTeikibinPeople.id),
  kind: text('kind').notNull(),
  acceptedUnits: integer('accepted_units').notNull(),
  unitRateMinor: integer('unit_rate_minor').notNull(),
  reference: text('reference').notNull(),
  recordedBy: text('recorded_by').notNull(),
  createdAt: integer('created_at').notNull(),
  voidedAt: integer('voided_at'),
  voidedBy: text('voided_by'),
  voidReason: text('void_reason'),
}, t => [
  uniqueIndex('noah_teikibin_contributions_reference').on(t.reference).where(sql`${t.voidedAt} IS NULL`),
  index('noah_teikibin_contributions_month').on(t.month, t.personId),
  check('noah_teikibin_contributions_month_length', sql`length(${t.month}) = 7`),
  check('noah_teikibin_contributions_kind', sql`${t.kind} IN ('compute', 'judgment', 'referral')`),
  check('noah_teikibin_contributions_units', sql`${t.acceptedUnits} BETWEEN 0 AND 100000000`),
  check('noah_teikibin_contributions_rate', sql`${t.unitRateMinor} BETWEEN 0 AND 1000000`),
  check('noah_teikibin_contributions_reference_length', sql`length(${t.reference}) BETWEEN 3 AND 120`),
]);
export const noahTeikibinMonths = sqliteTable('noah_teikibin_months', {
  month: text('month').primaryKey(),
  state: text('state').notNull(),
  form: text('form').notNull(),
  reserveBps: integer('reserve_bps').notNull(),
  dividendBps: integer('dividend_bps').notNull(),
  planPriceMinor: integer('plan_price_minor'),
  people: integer('people').notNull(),
  lines: integer('lines').notNull(),
  netCashMinor: integer('net_cash_minor').notNull(),
  feesMinor: integer('fees_minor').notNull(),
  reserveMinor: integer('reserve_minor').notNull(),
  surplusMinor: integer('surplus_minor').notNull(),
  poolMinor: integer('pool_minor').notNull(),
  companyMinor: integer('company_minor').notNull(),
  shortfallMinor: integer('shortfall_minor').notNull(),
  settlement: text('settlement').notNull(),
  digest: text('digest').notNull(),
  closedBy: text('closed_by').notNull(),
  startedAt: integer('started_at').notNull(),
  closedAt: integer('closed_at'),
}, t => [
  check('noah_teikibin_months_month_length', sql`length(${t.month}) = 7`),
  check('noah_teikibin_months_state', sql`${t.state} IN ('closing', 'closed')`),
  check('noah_teikibin_months_form', sql`${t.form} IN ('cash', 'goods')`),
  check('noah_teikibin_months_reserve', sql`${t.reserveBps} BETWEEN 0 AND 10000`),
  check('noah_teikibin_months_dividend', sql`${t.dividendBps} BETWEEN 0 AND 10000`),
  check('noah_teikibin_months_price', sql`${t.planPriceMinor} IS NULL OR ${t.planPriceMinor} BETWEEN 1 AND 1000000`),
  check('noah_teikibin_months_people', sql`${t.people} BETWEEN 0 AND 5000`),
  check('noah_teikibin_months_lines', sql`${t.lines} BETWEEN 0 AND 10000`),
  check('noah_teikibin_months_fees', sql`${t.feesMinor} >= 0`),
  check('noah_teikibin_months_reserve_minor', sql`${t.reserveMinor} >= 0`),
  check('noah_teikibin_months_pool', sql`${t.poolMinor} >= 0`),
  check('noah_teikibin_months_shortfall', sql`${t.shortfallMinor} >= 0`),
  check('noah_teikibin_months_digest', sql`length(${t.digest}) = 64`),
  check('noah_teikibin_months_closed', sql`(${t.state} = 'closed') = (${t.closedAt} IS NOT NULL)`),
]);
export const noahTeikibinLines = sqliteTable('noah_teikibin_lines', {
  month: text('month').notNull().references(() => noahTeikibinMonths.month),
  personId: text('person_id').notNull().references(() => noahTeikibinPeople.id),
  feeMinor: integer('fee_minor').notNull(),
  dividendMinor: integer('dividend_minor').notNull(),
  deductionMinor: integer('deduction_minor').notNull(),
  cashMinor: integer('cash_minor').notNull(),
  goodsMinor: integer('goods_minor').notNull(),
  paidPlan: integer('paid_plan').notNull(),
  payoutState: text('payout_state').notNull(),
  payoutRef: text('payout_ref'),
  paidBy: text('paid_by'),
  paidAt: integer('paid_at'),
  goodsState: text('goods_state').notNull(),
  goodsRef: text('goods_ref'),
  assignedBy: text('assigned_by'),
  assignedAt: integer('assigned_at'),
}, t => [
  primaryKey({ columns: [t.month, t.personId] }),
  uniqueIndex('noah_teikibin_lines_payout_ref').on(t.payoutRef).where(sql`${t.payoutRef} IS NOT NULL`),
  index('noah_teikibin_lines_person').on(t.personId, t.month),
  check('noah_teikibin_lines_amounts', sql`${t.feeMinor} >= 0 AND ${t.dividendMinor} >= 0 AND ${t.deductionMinor} >= 0 AND ${t.cashMinor} >= 0 AND ${t.goodsMinor} >= 0`),
  check('noah_teikibin_lines_paid_plan', sql`${t.paidPlan} IN (0, 1)`),
  check('noah_teikibin_lines_payout_state', sql`${t.payoutState} IN ('none', 'pending', 'held', 'paid')`),
  check('noah_teikibin_lines_goods_state', sql`${t.goodsState} IN ('none', 'pending', 'assigned')`),
  check('noah_teikibin_lines_balance', sql`${t.feeMinor} + ${t.dividendMinor} - ${t.deductionMinor} = ${t.cashMinor} + ${t.goodsMinor}`),
  check('noah_teikibin_lines_payout_none', sql`(${t.payoutState} = 'none') = (${t.cashMinor} = 0)`),
  check('noah_teikibin_lines_goods_none', sql`(${t.goodsState} = 'none') = (${t.goodsMinor} = 0)`),
  check('noah_teikibin_lines_paid_ref', sql`(${t.payoutState} = 'paid') = (${t.payoutRef} IS NOT NULL)`),
  check('noah_teikibin_lines_goods_ref', sql`(${t.goodsState} = 'assigned') = (${t.goodsRef} IS NOT NULL)`),
]);

// Public operational evidence for catalog projects; never includes owner or task content.
export const noahAgentAvailability = sqliteTable('noah_agent_availability', {
  projectId: text('project_id').primaryKey(),
  protocol: text('protocol').notNull(),
  manifestHash: text('manifest_hash').notNull(),
  endpointsJson: text('endpoints_json').notNull(),
  state: text('state').notNull(),
  checkedAt: integer('checked_at').notNull(),
  successAt: integer('success_at'),
  successDigest: text('success_digest'),
  failureAt: integer('failure_at'),
  nextCheckAt: integer('next_check_at').notNull(),
  leaseUntil: integer('lease_until').notNull().default(0),
  revision: integer('revision').notNull().default(1),
}, t => [
  index('noah_agent_availability_due').on(t.nextCheckAt, t.leaseUntil),
  check('noah_agent_availability_state', sql`${t.state} IN ('connected','verified','unavailable')`),
  check('noah_agent_availability_protocol', sql`${t.protocol} IN ('gradio','mcp')`),
  check('noah_agent_availability_manifest', sql`length(${t.manifestHash}) = 64`),
  check('noah_agent_availability_endpoints', sql`json_valid(${t.endpointsJson})`),
]);
