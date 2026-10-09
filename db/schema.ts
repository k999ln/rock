import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
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
    productVersion: text('product_version')
      .notNull()
      .default('catalog-csv-clean@0.1.0'),
    sellerId: text('seller_id').notNull().default('platform-owner'),
    channel: text('channel').notNull().default('direct'),
    termsVersion: text('terms_version').notNull().default('csv-business-v1'),
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
    availableAt: integer('available_at').notNull().default(0),
    leaseId: text('lease_id'),
    leaseExpiresAt: integer('lease_expires_at'),
    deliveryRevision: integer('delivery_revision').notNull().default(0),
    errorCode: text('error_code'),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    acceptedAt: integer('accepted_at'),
    completedAt: integer('completed_at'),
    approvedAt: integer('approved_at'),
    revisionRequestedAt: integer('revision_requested_at'),
    revisionReason: text('revision_reason'),
    canceledAt: integer('canceled_at'),
    cancellationReason: text('cancellation_reason'),
    filesPurgedAt: integer('files_purged_at'),
  },
  (table) => [
    index('idx_csv_jobs_user_updated').on(table.userId, table.updatedAt),
    index('idx_csv_jobs_status_updated').on(table.status, table.updatedAt),
    index('idx_csv_jobs_queue').on(
      table.status,
      table.availableAt,
      table.leaseExpiresAt,
    ),
    uniqueIndex('idx_csv_jobs_input_key').on(table.inputKey),
  ],
);

export const csvDeliveryRevisions = sqliteTable(
  'csv_delivery_revisions',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id').notNull(),
    userId: text('user_id').notNull(),
    revisionNumber: integer('revision_number').notNull(),
    specificationJson: text('specification_json').notNull(),
    resultKey: text('result_key').notNull(),
    safeResultKey: text('safe_result_key'),
    reportJsonKey: text('report_json_key').notNull(),
    reportHtmlKey: text('report_html_key').notNull(),
    outputSha256: text('output_sha256').notNull(),
    validationJson: text('validation_json').notNull(),
    status: text('status').notNull(),
    customerReason: text('customer_reason'),
    deliveredAt: integer('delivered_at').notNull(),
    resolvedAt: integer('resolved_at'),
  },
  (table) => [
    uniqueIndex('idx_csv_delivery_job_revision').on(
      table.jobId,
      table.revisionNumber,
    ),
    index('idx_csv_delivery_user_job').on(table.userId, table.jobId),
  ],
);

export const csvDeliveryLinks = sqliteTable(
  'csv_delivery_links',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id').notNull(),
    userId: text('user_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
    revokedAt: integer('revoked_at'),
    lastAccessedAt: integer('last_accessed_at'),
  },
  (table) => [
    uniqueIndex('idx_csv_delivery_link_token').on(table.tokenHash),
    index('idx_csv_delivery_link_job').on(table.userId, table.jobId, table.createdAt),
  ],
);

export const csvPaymentEvents = sqliteTable(
  'csv_payment_events',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    relatedProviderEventId: text('related_provider_event_id'),
    relatedEventType: text('related_event_type'),
    jobId: text('job_id').notNull(),
    userId: text('user_id').notNull(),
    sellerId: text('seller_id').notNull(),
    type: text('type').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    occurredAt: integer('occurred_at').notNull(),
    evidenceDigest: text('evidence_digest').notNull(),
    source: text('source').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_csv_payment_provider_event').on(
      table.provider,
      table.providerEventId,
    ),
    index('idx_csv_payment_job').on(table.jobId, table.occurredAt),
    index('idx_csv_payment_user').on(table.userId, table.occurredAt),
    index('idx_csv_payment_seller').on(table.sellerId, table.occurredAt),
  ],
);

export const csvOperatorSettings = sqliteTable('csv_operator_settings', {
  id: text('id').primaryKey(),
  acceptingNew: integer('accepting_new', { mode: 'boolean' })
    .notNull()
    .default(true),
  pausedReason: text('paused_reason'),
  revision: integer('revision').notNull().default(0),
  updatedBy: text('updated_by').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const csvOperatorEvents = sqliteTable(
  'csv_operator_events',
  {
    id: text('id').primaryKey(),
    actorHash: text('actor_hash').notNull(),
    action: text('action').notNull(),
    jobId: text('job_id'),
    detailJson: text('detail_json').notNull(),
    createdAt: integer('created_at').notNull(),
    idempotencyKey: text('idempotency_key'),
    requestDigest: text('request_digest'),
  },
  (table) => [
    index('idx_csv_operator_events_created').on(table.createdAt),
    index('idx_csv_operator_events_job').on(table.jobId, table.createdAt),
    uniqueIndex('idx_csv_operator_events_idempotency').on(
      table.actorHash,
      table.idempotencyKey,
    ),
  ],
);

export const csvOperatorOutbox = sqliteTable(
  'csv_operator_outbox',
  {
    id: text('id').primaryKey(),
    actorHash: text('actor_hash').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    action: text('action').notNull(),
    payloadJson: text('payload_json').notNull(),
    createdAt: integer('created_at').notNull(),
    deliveredAt: integer('delivered_at'),
  },
  (table) => [
    uniqueIndex('idx_csv_operator_outbox_action').on(
      table.actorHash,
      table.idempotencyKey,
    ),
    index('idx_csv_operator_outbox_created').on(table.createdAt),
  ],
);

export const csvIntakeControls = sqliteTable(
  'csv_intake_controls',
  {
    scopeType: text('scope_type').notNull(),
    scopeId: text('scope_id').notNull(),
    acceptingNew: integer('accepting_new', { mode: 'boolean' })
      .notNull()
      .default(true),
    pausedReason: text('paused_reason'),
    revision: integer('revision').notNull().default(0),
    updatedBy: text('updated_by').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_csv_intake_control_scope').on(table.scopeType, table.scopeId),
  ],
);

export const csvJobCosts = sqliteTable(
  'csv_job_costs',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id').notNull(),
    userId: text('user_id').notNull(),
    sellerId: text('seller_id').notNull(),
    category: text('category').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    evidenceDigest: text('evidence_digest').notNull(),
    actorHash: text('actor_hash').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_csv_job_cost_idempotency').on(table.actorHash, table.idempotencyKey),
    index('idx_csv_job_cost_job').on(table.jobId, table.createdAt),
    index('idx_csv_job_cost_user').on(table.userId, table.createdAt),
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
  cancelAtMonth: text('cancel_at_month'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const csvBillingAccountEvents = sqliteTable(
  'csv_billing_account_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    billingAccountId: text('billing_account_id').notNull(),
    action: text('action').notNull(),
    requestDigest: text('request_digest').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    detailJson: text('detail_json').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_csv_billing_event_idempotency').on(
      table.billingAccountId,
      table.idempotencyKey,
    ),
    index('idx_csv_billing_event_user').on(table.userId, table.createdAt),
  ],
);

// Keep the original monthly fee table in the schema so additive migrations do
// not drop historical reconciliation rows written before the richer decision
// ledger was introduced.
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

export const csvMonthlyFeeDecisions = sqliteTable(
  'csv_monthly_fee_decisions',
  {
    id: text('id').primaryKey(),
    sellerId: text('seller_id').notNull().default('platform-owner'),
    billingAccountId: text('billing_account_id').notNull(),
    contractId: text('contract_id').notNull().default('csv-seller-fee/1'),
    policyVersion: text('policy_version').notNull().default('csv-seller-fee/1'),
    monthJst: text('month_jst').notNull(),
    verifiedNetUsdMinor: integer('verified_net_usd_minor'),
    feeDueUsdMinor: integer('fee_due_usd_minor'),
    status: text('status').notNull(),
    evidenceDigest: text('evidence_digest').notNull(),
    reason: text('reason').notNull().default('reconciled'),
    decisionJson: text('decision_json').notNull().default('{}'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_csv_fee_decision_account_month').on(
      table.billingAccountId,
      table.monthJst,
    ),
    index('idx_csv_fee_month_status').on(table.monthJst, table.status),
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
