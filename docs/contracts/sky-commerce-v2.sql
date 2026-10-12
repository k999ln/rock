-- Sky Commerce v2 / Wallet read-model inputs: DESIGN DRAFT, 2026-10-01.
-- Not a deployable Drizzle migration. Do not apply to a live D1 database.
-- Baseline: b3e2676abd8ae2a0b3f78f48483e067b429d9bc8 + all existing drizzle/*.sql.
-- Additive sidecars only: the four existing sky_commerce_* tables are unchanged.
-- SQLite checks below are defense in depth, not user authentication.
-- D1 and the test runner must enforce foreign_keys=ON. Use bound SQL parameters.
-- All *_at and *_deadline values are UTC epoch milliseconds; revisions are integers.
-- SHA-256 values are lowercase hex. Money is an integer, JPY in the v1 product scope.
-- No customer deposit balance, bank payout executor, crypto transfer, or credit line.
-- Wallet projections must carry mode/account/currency/as_of and NULL for unknown.
-- A successful payment is not a confirmed transfer or bank deposit.

CREATE TABLE sky_commerce_v2_access_contracts (
  id TEXT PRIMARY KEY NOT NULL,
  package_key TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('test','live')),
  seller_user_id TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL CHECK (length(manifest_sha256)=64 AND manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  version INTEGER NOT NULL CHECK (typeof(version)='integer' AND version BETWEEN 1 AND 9007199254740991),
  contract_sha256 TEXT NOT NULL CHECK (length(contract_sha256)=64 AND contract_sha256 NOT GLOB '*[^0-9a-f]*'),
  provider_origin TEXT NOT NULL CHECK (provider_origin LIKE 'https://%'),
  audience TEXT NOT NULL CHECK (length(audience) BETWEEN 1 AND 256),
  authorization_mode TEXT NOT NULL CHECK (authorization_mode='server_introspection'),
  max_positive_cache_seconds INTEGER NOT NULL CHECK (typeof(max_positive_cache_seconds)='integer' AND max_positive_cache_seconds=60),
  status TEXT NOT NULL CHECK (status IN ('draft','accepted','suspended','retired')),
  acceptance_evidence_ref TEXT,
  created_at INTEGER NOT NULL CHECK (created_at>=0),
  updated_at INTEGER NOT NULL CHECK (updated_at>=created_at),
  UNIQUE (package_key,mode,version),
  UNIQUE (id,mode,package_key),
  CHECK (status!='accepted' OR acceptance_evidence_ref IS NOT NULL)
);
-- Application verifies exact HTTPS origin, permitted endpoints, keys and evidence;
-- LIKE 'https://%' alone does not establish a safe URL or proof of paid access.

CREATE TABLE sky_commerce_v2_subject_links (
  id TEXT PRIMARY KEY NOT NULL,
  contract_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('test','live')),
  package_key TEXT NOT NULL,
  buyer_user_id TEXT NOT NULL,
  provider_subject TEXT NOT NULL CHECK (length(provider_subject) BETWEEN 1 AND 256),
  binding_evidence_ref TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active','revoked')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  created_at INTEGER NOT NULL CHECK (created_at>=0),
  updated_at INTEGER NOT NULL CHECK (updated_at>=created_at),
  UNIQUE (contract_id,buyer_user_id),
  UNIQUE (contract_id,provider_subject),
  UNIQUE (id,contract_id,mode,package_key,buyer_user_id),
  FOREIGN KEY (contract_id,mode,package_key)
    REFERENCES sky_commerce_v2_access_contracts(id,mode,package_key)
);
-- provider_subject is an opaque, verified provider subject, never an email shortcut.
-- A different provider subject requires a reviewed new contract/link, not reassignment.

CREATE TABLE sky_commerce_v2_entitlements (
  id TEXT PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('test','live')),
  buyer_user_id TEXT NOT NULL,
  package_key TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (typeof(revision)='integer' AND revision BETWEEN 0 AND 9007199254740991),
  recovery_epoch INTEGER NOT NULL DEFAULT 1 CHECK (typeof(recovery_epoch)='integer' AND recovery_epoch BETWEEN 1 AND 9007199254740991),
  state TEXT NOT NULL DEFAULT 'inactive' CHECK (state IN ('inactive','pending','active','suspended','revoked')),
  current_order_id TEXT REFERENCES sky_commerce_orders(id),
  contract_id TEXT NOT NULL,
  subject_link_id TEXT,
  last_mutation_id TEXT,
  updated_at INTEGER NOT NULL CHECK (updated_at>=0),
  UNIQUE (buyer_user_id,package_key,mode),
  UNIQUE (id,mode),
  FOREIGN KEY (contract_id,mode,package_key)
    REFERENCES sky_commerce_v2_access_contracts(id,mode,package_key),
  FOREIGN KEY (subject_link_id,contract_id,mode,package_key,buyer_user_id)
    REFERENCES sky_commerce_v2_subject_links(id,contract_id,mode,package_key,buyer_user_id),
  CHECK (state!='active' OR (current_order_id IS NOT NULL AND revision>0))
);
-- This aggregate survives refund and repurchase. NEVER reset revision for a new order.
-- Uniqueness is buyer+package+mode, deliberately not order+buyer+package.
-- active means a purchased right, even before provider OAuth/subject linking.
-- Actual provider use and grant delivery require a current verified subject link.
-- inactive is internal pre-purchase state and projects to access='pending'.
-- recovery_epoch is a cached copy: after restore, the serving authority MUST compare
-- it with an independently persisted, monotonically advanced recovery epoch OUTSIDE
-- this restored DB. A DB-local epoch alone cannot prevent restored grants replaying.
-- Epoch change invalidates prior tokens/effects and increments aggregate revision.

CREATE TABLE sky_commerce_v2_quotes (
  id TEXT PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('test','live')),
  platform_account_id TEXT NOT NULL CHECK (platform_account_id GLOB 'acct_*'),
  seller_account_id TEXT NOT NULL CHECK (seller_account_id GLOB 'acct_*'),
  buyer_user_id TEXT NOT NULL,
  seller_user_id TEXT NOT NULL,
  package_key TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL CHECK (length(manifest_sha256)=64 AND manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  offer_revision INTEGER NOT NULL CHECK (typeof(offer_revision)='integer' AND offer_revision BETWEEN 1 AND 9007199254740991),
  currency TEXT NOT NULL CHECK (currency='jpy'),
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor)='integer' AND amount_minor BETWEEN 50 AND 99999999),
  commission_minor INTEGER NOT NULL CHECK (typeof(commission_minor)='integer' AND commission_minor=(amount_minor*1000)/10000),
  contract_id TEXT NOT NULL,
  terms_url TEXT NOT NULL CHECK (terms_url LIKE 'https://%'),
  terms_content_ref TEXT NOT NULL CHECK (length(terms_content_ref)>0),
  terms_sha256 TEXT NOT NULL CHECK (length(terms_sha256)=64 AND terms_sha256 NOT GLOB '*[^0-9a-f]*'),
  refund_policy_text TEXT NOT NULL CHECK (length(refund_policy_text) BETWEEN 1 AND 2000),
  refund_policy_sha256 TEXT NOT NULL CHECK (length(refund_policy_sha256)=64 AND refund_policy_sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at INTEGER NOT NULL CHECK (created_at>=0),
  expires_at INTEGER NOT NULL CHECK (expires_at>created_at),
  UNIQUE (id,mode,platform_account_id),
  FOREIGN KEY (contract_id,mode,package_key)
    REFERENCES sky_commerce_v2_access_contracts(id,mode,package_key),
  CHECK (buyer_user_id!=seller_user_id)
);
-- terms_content_ref points to an immutable version; the app verifies its actual hash.
-- A quote is immutable. Acceptance is recorded on order_state, not by editing a quote.

CREATE TABLE sky_commerce_v2_order_state (
  order_id TEXT PRIMARY KEY NOT NULL REFERENCES sky_commerce_orders(id),
  mode TEXT NOT NULL CHECK (mode IN ('test','live')),
  platform_account_id TEXT NOT NULL CHECK (platform_account_id GLOB 'acct_*'),
  acceptance_kind TEXT NOT NULL DEFAULT 'quote' CHECK (acceptance_kind IN ('quote','legacy_import')),
  quote_id TEXT UNIQUE,
  legacy_import_evidence_ref TEXT,
  legacy_verified_observation_id TEXT REFERENCES sky_commerce_v2_observations(id),
  entitlement_id TEXT NOT NULL,
  accepted_by TEXT,
  accepted_at INTEGER CHECK (accepted_at IS NULL OR accepted_at>=0),
  currency TEXT NOT NULL CHECK (currency='jpy'),
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor)='integer' AND amount_minor BETWEEN 50 AND 99999999),
  payment_state TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_state IN ('unpaid','processing','paid','canceled')),
  payment_closure_reason TEXT CHECK (payment_closure_reason IN ('expired','rejected','canceled')),
  payment_closure_observation_id TEXT REFERENCES sky_commerce_v2_observations(id),
  refund_state TEXT NOT NULL DEFAULT 'none'
    CHECK (refund_state IN ('none','requested','pending','partially_refunded','succeeded','failed','canceled','unknown')),
  refund_case_state TEXT NOT NULL DEFAULT 'none'
    CHECK (refund_case_state IN ('none','open','resolved','withdrawn')),
  refund_entitlement_disposition TEXT NOT NULL DEFAULT 'undecided'
    CHECK (refund_entitlement_disposition IN ('undecided','restore','keep_revoked')),
  dispute_state TEXT NOT NULL DEFAULT 'none'
    CHECK (dispute_state IN ('none','needs_response','under_review','won','lost')),
  access_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (access_state IN ('pending','active','suspended','revoked')),
  reconciliation_state TEXT NOT NULL DEFAULT 'current' CHECK (reconciliation_state IN ('current','queued','unknown','needs_review')),
  refund_succeeded_minor INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(refund_succeeded_minor)='integer' AND refund_succeeded_minor BETWEEN 0 AND amount_minor),
  refund_reserved_minor INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(refund_reserved_minor)='integer' AND refund_reserved_minor BETWEEN 0 AND 99999999),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (typeof(revision)='integer' AND revision BETWEEN 0 AND 9007199254740991),
  lease_fence INTEGER NOT NULL DEFAULT 0 CHECK (typeof(lease_fence)='integer' AND lease_fence BETWEEN 0 AND 9007199254740991),
  lease_token TEXT,
  lease_expires_at INTEGER,
  last_mutation_id TEXT UNIQUE,
  updated_at INTEGER NOT NULL CHECK (updated_at>=0),
  UNIQUE (order_id,mode,platform_account_id),
  UNIQUE (order_id,mode,platform_account_id,entitlement_id),
  FOREIGN KEY (quote_id,mode,platform_account_id)
    REFERENCES sky_commerce_v2_quotes(id,mode,platform_account_id),
  FOREIGN KEY (entitlement_id,mode) REFERENCES sky_commerce_v2_entitlements(id,mode),
  CHECK ((lease_token IS NULL)=(lease_expires_at IS NULL)),
  CHECK (lease_expires_at IS NULL OR lease_expires_at>=0),
  CHECK (refund_succeeded_minor+refund_reserved_minor<=amount_minor OR
    (reconciliation_state='needs_review' AND access_state IN ('suspended','revoked'))),
  CHECK ((payment_closure_reason IS NULL)=(payment_closure_observation_id IS NULL)),
  CHECK ((acceptance_kind='quote' AND quote_id IS NOT NULL AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL
           AND legacy_import_evidence_ref IS NULL AND legacy_verified_observation_id IS NULL)
    OR (acceptance_kind='legacy_import' AND quote_id IS NULL AND legacy_import_evidence_ref IS NOT NULL
           AND accepted_by IS NULL AND accepted_at IS NULL)),
  CHECK (acceptance_kind!='legacy_import' OR access_state!='active' OR legacy_verified_observation_id IS NOT NULL),
  CHECK (access_state!='active' OR
    (payment_state='paid' AND reconciliation_state='current' AND refund_state IN ('none','failed','canceled')
     AND refund_succeeded_minor=0 AND refund_reserved_minor=0
     AND ((refund_case_state='none' AND refund_state='none' AND refund_entitlement_disposition='undecided')
       OR (refund_case_state IN ('resolved','withdrawn') AND refund_entitlement_disposition='restore'))
     AND dispute_state IN ('none','won')))
);

-- New public API writes acceptance_kind='quote' server-side, never a client choice.
-- legacy_import is a privileged migration-only path: no invented terms hash, quote,
-- acceptance time or accepting actor. accepted_by/at stay NULL when not evidenced.
-- legacy_import_evidence_ref identifies retained historical evidence (including gaps).
-- Import starts unpaid/pending; no automatic promotion from legacy display status.
-- Active access requires a fresh verified provider observation plus current paid-access
-- contract/review/subject policy; NULL quote is not an authorization bypass.
-- payment_state/dispute_state/access_state use exactly the TS contract domain.
-- Raw Stripe requires_action/failed/etc. stay in observations; unknown is an
-- operation/reconciliation outcome, never proof that payment is unpaid or paid.
-- Legacy expired/failed projection requires the matched authenticated observation:
-- Checkout Session status='expired', or PaymentIntent last_payment_error/status.
-- Match operation.provider_object_id, mode and account; do not infer expired from
-- local time or failed from network errors. The payment fact remains unpaid unless
-- a verified canceled intent/session or a verified successful payment says otherwise.
-- refund_state is a derived local summary; independent Refund rows and amounts
-- are authoritative inputs, never a monotonic rank or replacement for MoneyState.

CREATE TABLE sky_commerce_v2_operations (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('test','live')),
  platform_account_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('checkout_create','checkout_expire','refund_create')),
  state TEXT NOT NULL CHECK (state IN ('prepared','submitting','unknown','acknowledged','succeeded','failed','canceled','manual_review')),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 255),
  request_sha256 TEXT NOT NULL CHECK (length(request_sha256)=64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  amount_minor INTEGER CHECK (amount_minor IS NULL OR (typeof(amount_minor)='integer' AND amount_minor BETWEEN 1 AND 99999999)),
  currency TEXT NOT NULL CHECK (currency='jpy'),
  provider_object_id TEXT,
  first_submitted_at INTEGER,
  retry_deadline INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (typeof(attempt_count)='integer' AND attempt_count>=0),
  provider_request_id TEXT,
  safe_error_code TEXT,
  created_at INTEGER NOT NULL CHECK (created_at>=0),
  updated_at INTEGER NOT NULL CHECK (updated_at>=created_at),
  UNIQUE (mode,platform_account_id,idempotency_key),
  UNIQUE (mode,platform_account_id,kind,provider_object_id),
  UNIQUE (id,order_id,mode,platform_account_id),
  FOREIGN KEY (order_id,mode,platform_account_id)
    REFERENCES sky_commerce_v2_order_state(order_id,mode,platform_account_id),
  CHECK ((first_submitted_at IS NULL)=(retry_deadline IS NULL)),
  CHECK (first_submitted_at IS NULL OR
    (first_submitted_at>=created_at AND retry_deadline>first_submitted_at AND retry_deadline<=first_submitted_at+72000000)),
  CHECK (state='prepared' OR first_submitted_at IS NOT NULL),
  CHECK ((kind='checkout_expire' AND amount_minor IS NULL) OR
    (kind IN ('checkout_create','refund_create') AND amount_minor IS NOT NULL))
);
CREATE INDEX idx_sky_commerce_v2_operation_recovery
  ON sky_commerce_v2_operations(mode,state,retry_deadline,id);
-- Same intent => same operation/key/request_sha256. Unknown after deadline => reconcile,
-- never a new POST with a new key. GET reconciliation has a separate retry policy.
-- This table is order-scoped. Account creation uses the seller reservation below.

CREATE TABLE sky_commerce_v2_seller_account_operations (
  id TEXT PRIMARY KEY NOT NULL,
  seller_id TEXT NOT NULL UNIQUE REFERENCES sky_commerce_sellers(id),
  seller_user_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('test','live')),
  platform_account_id TEXT NOT NULL CHECK (platform_account_id GLOB 'acct_*'),
  kind TEXT NOT NULL DEFAULT 'account_create' CHECK (kind='account_create'),
  state TEXT NOT NULL DEFAULT 'prepared'
    CHECK (state IN ('prepared','submitting','unknown','acknowledged','failed','manual_review')),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 255),
  request_sha256 TEXT NOT NULL CHECK (length(request_sha256)=64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  provider_account_id TEXT CHECK (provider_account_id IS NULL OR provider_account_id GLOB 'acct_*'),
  provider_request_id TEXT,
  last_observation_id TEXT REFERENCES sky_commerce_v2_observations(id),
  first_submitted_at INTEGER,
  retry_deadline INTEGER,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (typeof(revision)='integer' AND revision BETWEEN 0 AND 9007199254740991),
  lease_fence INTEGER NOT NULL DEFAULT 0 CHECK (typeof(lease_fence)='integer' AND lease_fence BETWEEN 0 AND 9007199254740991),
  lease_token TEXT,
  lease_expires_at INTEGER,
  last_mutation_id TEXT UNIQUE,
  safe_error_code TEXT,
  created_at INTEGER NOT NULL CHECK (created_at>=0),
  updated_at INTEGER NOT NULL CHECK (updated_at>=created_at),
  UNIQUE (seller_user_id,mode),
  UNIQUE (mode,platform_account_id,idempotency_key),
  UNIQUE (mode,platform_account_id,provider_account_id),
  CHECK ((lease_token IS NULL)=(lease_expires_at IS NULL)),
  CHECK ((first_submitted_at IS NULL)=(retry_deadline IS NULL)),
  CHECK (first_submitted_at IS NULL OR
    (first_submitted_at>=created_at AND retry_deadline>first_submitted_at AND retry_deadline<=first_submitted_at+72000000)),
  CHECK (state='prepared' OR first_submitted_at IS NOT NULL),
  CHECK (state!='acknowledged' OR (provider_account_id IS NOT NULL AND last_observation_id IS NOT NULL))
);
-- One immutable creation intent reserves seller+mode BEFORE an Account POST.
-- Insert the legacy seller reservation and this journal in one D1 batch; reconcile
-- its NULL account_id on restart instead of creating a second Connect Account.
-- Use journal revision+fence CAS and immutable provider observation to adopt an ID,
-- then condition the legacy seller update on that accepted mutation in the same batch.
-- No account adoption by email, arbitrary client acct ID, or fresh key after unknown.
-- This initial scope supports one creation lifecycle per seller/mode. Replacing a
-- closed/rejected account needs a separately reviewed lifecycle, not row deletion.

CREATE TABLE sky_commerce_v2_refunds (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('test','live')),
  platform_account_id TEXT NOT NULL,
  operation_id TEXT,
  provider_refund_id TEXT NOT NULL CHECK (provider_refund_id GLOB 're_*'),
  payment_intent_id TEXT NOT NULL CHECK (payment_intent_id GLOB 'pi_*'),
  charge_id TEXT NOT NULL CHECK (charge_id GLOB 'ch_*'),
  currency TEXT NOT NULL CHECK (currency='jpy'),
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor)='integer' AND amount_minor BETWEEN 1 AND 99999999),
  status TEXT NOT NULL CHECK (status IN ('pending','requires_action','succeeded','failed','canceled')),
  transfer_reversal_id TEXT,
  application_fee_refund_id TEXT,
  failure_balance_transaction_id TEXT CHECK (failure_balance_transaction_id IS NULL OR failure_balance_transaction_id GLOB 'txn_*'),
  failure_code TEXT,
  last_observation_id TEXT NOT NULL REFERENCES sky_commerce_v2_observations(id),
  observed_at INTEGER NOT NULL CHECK (observed_at>=0),
  UNIQUE (mode,platform_account_id,provider_refund_id),
  UNIQUE (mode,platform_account_id,transfer_reversal_id),
  UNIQUE (mode,platform_account_id,application_fee_refund_id),
  FOREIGN KEY (order_id,mode,platform_account_id)
    REFERENCES sky_commerce_v2_order_state(order_id,mode,platform_account_id),
  FOREIGN KEY (operation_id,order_id,mode,platform_account_id)
    REFERENCES sky_commerce_v2_operations(id,order_id,mode,platform_account_id)
);
-- NULL operation_id covers verified refunds created in the Stripe dashboard.
-- Refund status is distinct from Charge.amount_refunded and entitlement state.
-- A provider refund may later move succeeded -> failed (or requires_action).
-- Do not clamp refunded amount with MAX or assume succeeded is irreversible.
-- Accept fresh authenticated provider observations, including failure balance
-- transaction evidence, as an audited correction; keep refund_case_state='open'
-- until the business refund obligation is resolved. Never auto-restore access.

CREATE TABLE sky_commerce_v2_inbox (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL DEFAULT 'stripe' CHECK (provider='stripe'),
  mode TEXT NOT NULL CHECK (mode IN ('test','live')),
  platform_account_id TEXT NOT NULL CHECK (platform_account_id GLOB 'acct_*'),
  source_account_id TEXT NOT NULL CHECK (source_account_id GLOB 'acct_*'),
  event_id TEXT NOT NULL CHECK (event_id GLOB 'evt_*'),
  event_type TEXT NOT NULL,
  event_api_version TEXT NOT NULL,
  object_id TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256)=64 AND payload_sha256 NOT GLOB '*[^0-9a-f]*'),
  verified_key_id TEXT NOT NULL,
  event_created_at INTEGER NOT NULL CHECK (event_created_at>=0),
  received_at INTEGER NOT NULL CHECK (received_at>=0),
  order_id TEXT,
  state TEXT NOT NULL DEFAULT 'received' CHECK (state IN ('received','processing','processed','ignored','quarantined')),
  lease_fence INTEGER NOT NULL DEFAULT 0 CHECK (typeof(lease_fence)='integer' AND lease_fence BETWEEN 0 AND 9007199254740991),
  lease_token TEXT,
  lease_expires_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (typeof(attempt_count)='integer' AND attempt_count>=0),
  next_retry_at INTEGER,
  safe_error_code TEXT,
  UNIQUE (provider,mode,source_account_id,event_id),
  FOREIGN KEY (order_id,mode,platform_account_id)
    REFERENCES sky_commerce_v2_order_state(order_id,mode,platform_account_id),
  CHECK ((lease_token IS NULL)=(lease_expires_at IS NULL)),
  CHECK (state!='processing' OR lease_token IS NOT NULL)
);
CREATE INDEX idx_sky_commerce_v2_inbox_recovery
  ON sky_commerce_v2_inbox(mode,state,next_retry_at,received_at,id);
-- Do not use INSERT OR IGNORE without comparing payload_sha256 on collision.
-- Same event key + different hash => quarantine; created_at is not event ordering.
-- Only verified raw-body events enter this table. Persist before returning 2xx.

CREATE TABLE sky_commerce_v2_observations (
  id TEXT PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('test','live')),
  platform_account_id TEXT NOT NULL CHECK (platform_account_id GLOB 'acct_*'),
  source_account_id TEXT NOT NULL CHECK (source_account_id GLOB 'acct_*'),
  object_kind TEXT NOT NULL CHECK (object_kind IN ('checkout_session','payment_intent','charge','refund','dispute','account','transfer','application_fee','balance_transaction','balance_snapshot','payout')),
  object_id TEXT NOT NULL,
  provider_request_id TEXT,
  provider_api_version TEXT NOT NULL,
  observed_at INTEGER NOT NULL CHECK (observed_at>=0),
  provider_created_at INTEGER,
  account_expected_revision INTEGER CHECK (account_expected_revision IS NULL OR (typeof(account_expected_revision)='integer' AND account_expected_revision BETWEEN 0 AND 9007199254740990)),
  account_lease_fence INTEGER CHECK (account_lease_fence IS NULL OR (typeof(account_lease_fence)='integer' AND account_lease_fence BETWEEN 1 AND 9007199254740991)),
  account_evidence_kind TEXT CHECK (account_evidence_kind IN ('balance','payout','account_capabilities')),
  facts_sha256 TEXT NOT NULL CHECK (length(facts_sha256)=64 AND facts_sha256 NOT GLOB '*[^0-9a-f]*'),
  normalized_facts_json TEXT NOT NULL CHECK (json_valid(normalized_facts_json)),
  currency TEXT,
  amount_minor INTEGER CHECK (amount_minor IS NULL OR (typeof(amount_minor)='integer' AND amount_minor BETWEEN -9007199254740991 AND 9007199254740991)),
  UNIQUE (mode,source_account_id,provider_request_id,object_kind,object_id),
  CHECK ((account_expected_revision IS NULL)=(account_lease_fence IS NULL)),
  CHECK ((account_expected_revision IS NULL)=(account_evidence_kind IS NULL)),
  CHECK (account_evidence_kind IS NULL OR (currency='jpy' AND
    ((account_evidence_kind='balance' AND object_kind IN ('balance_snapshot','balance_transaction'))
     OR (account_evidence_kind='payout' AND object_kind='payout')
     OR (account_evidence_kind='account_capabilities' AND object_kind='account')))),
  CHECK (currency IS NULL OR (length(currency)=3 AND currency NOT GLOB '*[^a-z]*')),
  CHECK (amount_minor IS NULL OR currency IS NOT NULL),
  CHECK (amount_minor IS NULL OR amount_minor>=0 OR object_kind IN ('balance_transaction','balance_snapshot'))
);
-- Append-only, allowlisted non-secret facts. Do not store raw card/bank/KYC data.
-- NULL amount means unknown, never zero. Signed provider balances may be negative.
-- observed_at is Wallet's as_of; provider_created_at is not a freshness guarantee.

CREATE TABLE sky_commerce_v2_account_state (
  id TEXT PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('test','live')),
  platform_account_id TEXT NOT NULL CHECK (platform_account_id GLOB 'acct_*'),
  source_account_id TEXT NOT NULL CHECK (source_account_id GLOB 'acct_*'),
  currency TEXT NOT NULL CHECK (currency='jpy'),
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('balance','payout','account_capabilities')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (typeof(revision)='integer' AND revision BETWEEN 0 AND 9007199254740991),
  lease_fence INTEGER NOT NULL DEFAULT 0 CHECK (typeof(lease_fence)='integer' AND lease_fence BETWEEN 0 AND 9007199254740991),
  lease_token TEXT,
  lease_expires_at INTEGER,
  last_observation_id TEXT REFERENCES sky_commerce_v2_observations(id),
  last_mutation_id TEXT UNIQUE,
  updated_at INTEGER NOT NULL CHECK (updated_at>=0),
  UNIQUE (mode,platform_account_id,source_account_id,currency,evidence_kind),
  CHECK ((lease_token IS NULL)=(lease_expires_at IS NULL))
);
-- AccountObservation persists in append-only observations (account_* envelope),
-- with normalized per-endpoint facts/Stripe request IDs and this acceptance cursor.
-- expectedAccountRevision is scoped to (mode,platform,source,currency,evidenceKind).
-- source_account_id is the observed account, including connected-account scope.
-- Wallet balance/payout/capability refreshes acquire this account lease, GET provider
-- facts, then CAS revision+fence+token+expiry and current observation together.
-- Old observations remain evidence; only accepted revisions feed current projections.
-- Read each evidence kind separately, retaining NULL/as_of for unknown or stale data;
-- a new payout observation does not make an older balance snapshot fresh.
-- No order_id and no local payout executor: this table cannot authorize a bank send.

CREATE TABLE sky_commerce_v2_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('test','live')),
  platform_account_id TEXT NOT NULL,
  entitlement_id TEXT NOT NULL,
  recovery_epoch INTEGER NOT NULL CHECK (typeof(recovery_epoch)='integer' AND recovery_epoch BETWEEN 1 AND 9007199254740991),
  subject_link_revision INTEGER NOT NULL CHECK (typeof(subject_link_revision)='integer' AND subject_link_revision BETWEEN 1 AND 9007199254740991),
  entitlement_revision INTEGER NOT NULL CHECK (typeof(entitlement_revision)='integer' AND entitlement_revision BETWEEN 1 AND 9007199254740991),
  order_revision INTEGER NOT NULL CHECK (typeof(order_revision)='integer' AND order_revision BETWEEN 1 AND 9007199254740991),
  mutation_id TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  subject_link_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('grant','suspend','revoke')),
  effect_sha256 TEXT NOT NULL CHECK (length(effect_sha256)=64 AND effect_sha256 NOT GLOB '*[^0-9a-f]*'),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','acknowledged','retry','manual_review')),
  lease_fence INTEGER NOT NULL DEFAULT 0 CHECK (typeof(lease_fence)='integer' AND lease_fence BETWEEN 0 AND 9007199254740991),
  lease_token TEXT,
  lease_expires_at INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (typeof(attempt_count)='integer' AND attempt_count>=0),
  next_retry_at INTEGER,
  provider_ack_ref TEXT,
  created_at INTEGER NOT NULL CHECK (created_at>=0),
  updated_at INTEGER NOT NULL CHECK (updated_at>=created_at),
  UNIQUE (entitlement_id,entitlement_revision),
  FOREIGN KEY (order_id,mode,platform_account_id,entitlement_id)
    REFERENCES sky_commerce_v2_order_state(order_id,mode,platform_account_id,entitlement_id),
  CHECK ((lease_token IS NULL)=(lease_expires_at IS NULL)),
  CHECK (state!='processing' OR lease_token IS NOT NULL),
  CHECK (state!='acknowledged' OR provider_ack_ref IS NOT NULL)
);
CREATE INDEX idx_sky_commerce_v2_outbox_recovery
  ON sky_commerce_v2_outbox(mode,state,next_retry_at,id);
-- Acknowledgement is conditional on current entitlement revision; an older grant
-- must not override a later revoke or a repurchase's newer aggregate revision.

CREATE TABLE sky_commerce_v2_nonces (
  issuer TEXT NOT NULL,
  audience TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('test','live')),
  nonce TEXT NOT NULL CHECK (length(nonce) BETWEEN 16 AND 255),
  subject TEXT NOT NULL,
  request_sha256 TEXT NOT NULL CHECK (length(request_sha256)=64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  issued_at INTEGER NOT NULL CHECK (issued_at>=0),
  expires_at INTEGER NOT NULL CHECK (expires_at>issued_at AND expires_at<=issued_at+300000),
  consumed_at INTEGER,
  PRIMARY KEY (issuer,audience,mode,nonce),
  CHECK (consumed_at IS NULL OR (consumed_at>=issued_at AND consumed_at<=expires_at))
);
-- This is a replay store, not signature verification. Verify exact method/path/body
-- digest/subject/audience/expiry first; consume once using conditional SQL.
-- Retries reuse the operation ID; a new nonce never authorizes a second charge.

CREATE TABLE sky_commerce_v2_audit (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('test','live')),
  platform_account_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  expected_revision INTEGER NOT NULL CHECK (typeof(expected_revision)='integer' AND expected_revision>=0 AND expected_revision=revision-1),
  mutation_id TEXT NOT NULL UNIQUE,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('buyer','seller','system','operator')),
  actor_ref TEXT NOT NULL,
  action TEXT NOT NULL,
  evidence_sha256 TEXT NOT NULL CHECK (length(evidence_sha256)=64 AND evidence_sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at INTEGER NOT NULL CHECK (created_at>=0),
  UNIQUE (order_id,revision),
  FOREIGN KEY (order_id,mode,platform_account_id)
    REFERENCES sky_commerce_v2_order_state(order_id,mode,platform_account_id)
);
-- Accepted transition audit only. Failed attempts belong to operational logs,
-- never an accepted effect record. Do not log secrets or raw provider messages.
-- Refund case closure is not an access decision. An explicit restore/keep_revoked
-- transition records operator actor, exact order/mode/account, expected_revision
-- and decision evidence hash here, with authorization and evidence retention in app.

-- Cross-table snapshot and aggregate identity guards.
CREATE TRIGGER sky_commerce_v2_quote_insert_guard BEFORE INSERT ON sky_commerce_v2_quotes
WHEN NOT EXISTS (SELECT 1 FROM sky_commerce_v2_access_contracts c
  WHERE c.id=NEW.contract_id AND c.mode=NEW.mode AND c.package_key=NEW.package_key
    AND c.seller_user_id=NEW.seller_user_id AND c.manifest_sha256=NEW.manifest_sha256
    AND c.status='accepted')
BEGIN SELECT RAISE(ABORT,'V2_QUOTE_ACCESS_CONTRACT_NOT_ACCEPTED'); END;

CREATE TRIGGER sky_commerce_v2_order_insert_guard BEFORE INSERT ON sky_commerce_v2_order_state
WHEN NEW.payment_closure_reason IS NOT NULL OR NOT EXISTS (
  SELECT 1 FROM sky_commerce_orders o
  LEFT JOIN sky_commerce_v2_quotes q ON q.id=NEW.quote_id
  JOIN sky_commerce_v2_entitlements e ON e.id=NEW.entitlement_id
  WHERE o.id=NEW.order_id AND o.mode=NEW.mode AND e.mode=NEW.mode
    AND e.buyer_user_id=o.buyer_user_id AND e.package_key=o.package_key
    AND o.currency=NEW.currency AND o.amount_minor=NEW.amount_minor
    AND ((NEW.acceptance_kind='quote' AND q.mode=NEW.mode AND q.platform_account_id=NEW.platform_account_id
      AND o.buyer_user_id=q.buyer_user_id AND NEW.accepted_by=o.buyer_user_id
      AND NEW.accepted_at>=q.created_at AND NEW.accepted_at<q.expires_at
      AND o.seller_user_id=q.seller_user_id AND o.package_key=q.package_key
      AND e.contract_id=q.contract_id AND o.manifest_sha256=q.manifest_sha256
      AND o.account_id=q.seller_account_id AND o.offer_revision=q.offer_revision
      AND o.currency=q.currency AND o.amount_minor=q.amount_minor AND o.commission_minor=q.commission_minor
      AND o.terms_url=q.terms_url AND o.refund_policy=q.refund_policy_text)
    OR (NEW.acceptance_kind='legacy_import' AND NEW.payment_state='unpaid' AND NEW.access_state='pending'
      AND NEW.revision=0 AND NEW.legacy_verified_observation_id IS NULL))
)
BEGIN SELECT RAISE(ABORT,'V2_ORDER_SNAPSHOT_MISMATCH'); END;

CREATE TRIGGER sky_commerce_v2_order_identity_guard BEFORE UPDATE ON sky_commerce_v2_order_state
WHEN OLD.order_id IS NOT NEW.order_id OR OLD.mode IS NOT NEW.mode
  OR OLD.platform_account_id IS NOT NEW.platform_account_id OR OLD.quote_id IS NOT NEW.quote_id
  OR OLD.acceptance_kind IS NOT NEW.acceptance_kind OR OLD.legacy_import_evidence_ref IS NOT NEW.legacy_import_evidence_ref
  OR OLD.entitlement_id IS NOT NEW.entitlement_id OR OLD.accepted_by IS NOT NEW.accepted_by
  OR OLD.accepted_at IS NOT NEW.accepted_at OR OLD.currency IS NOT NEW.currency OR OLD.amount_minor IS NOT NEW.amount_minor
BEGIN SELECT RAISE(ABORT,'V2_ORDER_IDENTITY_IMMUTABLE'); END;

CREATE TRIGGER sky_commerce_v2_order_revision_guard BEFORE UPDATE ON sky_commerce_v2_order_state
WHEN NEW.revision<OLD.revision OR NEW.revision>OLD.revision+1
  OR NEW.lease_fence<OLD.lease_fence OR NEW.lease_fence>OLD.lease_fence+1
  OR (NEW.lease_token IS NOT NULL AND NEW.lease_token IS NOT OLD.lease_token AND NEW.lease_fence!=OLD.lease_fence+1)
  OR ((NEW.payment_state IS NOT OLD.payment_state OR NEW.refund_state IS NOT OLD.refund_state
       OR NEW.legacy_verified_observation_id IS NOT OLD.legacy_verified_observation_id
       OR NEW.payment_closure_reason IS NOT OLD.payment_closure_reason
       OR NEW.payment_closure_observation_id IS NOT OLD.payment_closure_observation_id
       OR NEW.reconciliation_state IS NOT OLD.reconciliation_state
       OR NEW.refund_case_state IS NOT OLD.refund_case_state
       OR NEW.refund_entitlement_disposition IS NOT OLD.refund_entitlement_disposition
       OR NEW.dispute_state IS NOT OLD.dispute_state OR NEW.access_state IS NOT OLD.access_state
       OR NEW.refund_succeeded_minor!=OLD.refund_succeeded_minor OR NEW.refund_reserved_minor!=OLD.refund_reserved_minor)
      AND NEW.revision!=OLD.revision+1)
  OR (NEW.revision=OLD.revision+1 AND (NEW.last_mutation_id IS NULL OR NEW.last_mutation_id IS OLD.last_mutation_id))
  OR (NEW.revision=OLD.revision AND NEW.last_mutation_id IS NOT OLD.last_mutation_id)
BEGIN SELECT RAISE(ABORT,'V2_ORDER_REVISION_OR_FENCE_INVALID'); END;

CREATE TRIGGER sky_commerce_v2_legacy_verified_guard BEFORE UPDATE ON sky_commerce_v2_order_state
WHEN NEW.legacy_verified_observation_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sky_commerce_v2_observations p JOIN sky_commerce_orders o ON o.id=NEW.order_id
  WHERE p.id=NEW.legacy_verified_observation_id AND p.mode=NEW.mode AND p.platform_account_id=NEW.platform_account_id
    AND p.source_account_id=NEW.platform_account_id AND p.currency=NEW.currency AND p.amount_minor=NEW.amount_minor
    AND p.object_kind='payment_intent' AND p.object_id=o.payment_intent_id
    AND json_extract(p.normalized_facts_json,'$.status')='succeeded')
BEGIN SELECT RAISE(ABORT,'V2_LEGACY_IMPORT_REQUIRES_VERIFIED_PAYMENT'); END;

CREATE TRIGGER sky_commerce_v2_payment_closure_guard BEFORE UPDATE ON sky_commerce_v2_order_state
WHEN NEW.payment_closure_reason IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sky_commerce_v2_observations p
  JOIN sky_commerce_orders legacy ON legacy.id=NEW.order_id
  LEFT JOIN sky_commerce_v2_operations o ON o.order_id=NEW.order_id AND o.provider_object_id=p.object_id
  WHERE p.id=NEW.payment_closure_observation_id AND p.mode=NEW.mode AND p.platform_account_id=NEW.platform_account_id
    AND p.source_account_id=NEW.platform_account_id
    AND ((o.mode=NEW.mode AND o.platform_account_id=NEW.platform_account_id) OR legacy.payment_intent_id=p.object_id)
    AND ((NEW.payment_closure_reason='expired' AND p.object_kind='checkout_session'
          AND json_extract(p.normalized_facts_json,'$.status')='expired')
      OR (NEW.payment_closure_reason='rejected' AND p.object_kind='payment_intent'
          AND json_extract(p.normalized_facts_json,'$.last_payment_error.code') IS NOT NULL)
      OR (NEW.payment_closure_reason='canceled' AND p.object_kind='payment_intent'
          AND json_extract(p.normalized_facts_json,'$.status')='canceled')))
BEGIN SELECT RAISE(ABORT,'V2_PAYMENT_CLOSURE_REQUIRES_PROVIDER_EVIDENCE'); END;

CREATE TRIGGER sky_commerce_v2_account_state_insert_guard BEFORE INSERT ON sky_commerce_v2_account_state
WHEN NEW.revision!=0 OR NEW.last_observation_id IS NOT NULL OR NEW.last_mutation_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'V2_ACCOUNT_STATE_MUST_START_EMPTY'); END;

CREATE TRIGGER sky_commerce_v2_account_state_update_guard BEFORE UPDATE ON sky_commerce_v2_account_state
WHEN NEW.id IS NOT OLD.id OR NEW.mode IS NOT OLD.mode OR NEW.platform_account_id IS NOT OLD.platform_account_id
  OR NEW.source_account_id IS NOT OLD.source_account_id OR NEW.currency IS NOT OLD.currency
  OR NEW.evidence_kind IS NOT OLD.evidence_kind
  OR NEW.revision<OLD.revision OR NEW.revision>OLD.revision+1
  OR NEW.lease_fence<OLD.lease_fence OR NEW.lease_fence>OLD.lease_fence+1
  OR (NEW.lease_token IS NOT NULL AND NEW.lease_token IS NOT OLD.lease_token AND NEW.lease_fence!=OLD.lease_fence+1)
  OR (NEW.last_observation_id IS NOT OLD.last_observation_id AND NEW.revision!=OLD.revision+1)
  OR (NEW.revision=OLD.revision+1 AND (NEW.last_mutation_id IS NULL OR NEW.last_mutation_id IS OLD.last_mutation_id))
  OR (NEW.revision=OLD.revision AND NEW.last_mutation_id IS NOT OLD.last_mutation_id)
  OR (NEW.revision=OLD.revision+1 AND NOT EXISTS (
    SELECT 1 FROM sky_commerce_v2_observations p WHERE p.id=NEW.last_observation_id
      AND p.mode=NEW.mode AND p.platform_account_id=NEW.platform_account_id
      AND p.source_account_id=NEW.source_account_id AND p.currency=NEW.currency AND p.account_evidence_kind=NEW.evidence_kind
      AND p.account_expected_revision=OLD.revision AND p.account_lease_fence=OLD.lease_fence))
BEGIN SELECT RAISE(ABORT,'V2_ACCOUNT_OBSERVATION_SCOPE_OR_CAS_INVALID'); END;

CREATE TRIGGER sky_commerce_v2_entitlement_order_insert_guard BEFORE INSERT ON sky_commerce_v2_entitlements
WHEN NEW.current_order_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sky_commerce_orders o WHERE o.id=NEW.current_order_id
    AND o.mode=NEW.mode AND o.buyer_user_id=NEW.buyer_user_id AND o.package_key=NEW.package_key)
BEGIN SELECT RAISE(ABORT,'V2_ENTITLEMENT_ORDER_MISMATCH'); END;

CREATE TRIGGER sky_commerce_v2_entitlement_update_guard BEFORE UPDATE ON sky_commerce_v2_entitlements
WHEN NEW.id IS NOT OLD.id OR NEW.mode IS NOT OLD.mode OR NEW.buyer_user_id IS NOT OLD.buyer_user_id
  OR NEW.package_key IS NOT OLD.package_key OR NEW.revision!=OLD.revision+1
  OR NEW.recovery_epoch<OLD.recovery_epoch
  OR NEW.last_mutation_id IS NULL OR NEW.last_mutation_id IS OLD.last_mutation_id
  OR (NEW.current_order_id IS NOT OLD.current_order_id AND OLD.current_order_id IS NOT NULL
      AND OLD.state NOT IN ('inactive','revoked'))
  OR (NEW.state='active' AND NOT EXISTS (
    SELECT 1 FROM sky_commerce_v2_order_state s WHERE s.order_id=NEW.current_order_id
      AND s.entitlement_id=NEW.id AND s.mode=NEW.mode AND s.payment_state='paid' AND s.access_state='active'))
  OR (NEW.current_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sky_commerce_orders o WHERE o.id=NEW.current_order_id
      AND o.mode=NEW.mode AND o.buyer_user_id=NEW.buyer_user_id AND o.package_key=NEW.package_key))
BEGIN SELECT RAISE(ABORT,'V2_ENTITLEMENT_REVISION_OR_IDENTITY_INVALID'); END;

CREATE TRIGGER sky_commerce_v2_entitlement_no_delete BEFORE DELETE ON sky_commerce_v2_entitlements
BEGIN SELECT RAISE(ABORT,'V2_ENTITLEMENT_AGGREGATE_MUST_SURVIVE_REPURCHASE'); END;

CREATE TRIGGER sky_commerce_v2_operation_update_guard BEFORE UPDATE ON sky_commerce_v2_operations
WHEN NEW.id IS NOT OLD.id OR NEW.order_id IS NOT OLD.order_id OR NEW.mode IS NOT OLD.mode
  OR NEW.platform_account_id IS NOT OLD.platform_account_id OR NEW.kind IS NOT OLD.kind
  OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.request_sha256 IS NOT OLD.request_sha256
  OR NEW.amount_minor IS NOT OLD.amount_minor OR NEW.currency IS NOT OLD.currency
  OR (OLD.provider_object_id IS NOT NULL AND NEW.provider_object_id IS NOT OLD.provider_object_id)
  OR (OLD.first_submitted_at IS NOT NULL AND
      (NEW.first_submitted_at IS NOT OLD.first_submitted_at OR NEW.retry_deadline IS NOT OLD.retry_deadline))
BEGIN SELECT RAISE(ABORT,'V2_OPERATION_IDENTITY_OR_DEADLINE_IMMUTABLE'); END;

CREATE TRIGGER sky_commerce_v2_operation_insert_guard BEFORE INSERT ON sky_commerce_v2_operations
WHEN NOT EXISTS (SELECT 1 FROM sky_commerce_v2_order_state s
  WHERE s.order_id=NEW.order_id AND s.mode=NEW.mode AND s.platform_account_id=NEW.platform_account_id
    AND s.currency=NEW.currency
    AND (NEW.kind='checkout_expire' OR (NEW.amount_minor<=s.amount_minor
      AND (NEW.kind!='checkout_create' OR NEW.amount_minor=s.amount_minor))))
BEGIN SELECT RAISE(ABORT,'V2_OPERATION_AMOUNT_OR_SCOPE_MISMATCH'); END;

CREATE TRIGGER sky_commerce_v2_seller_operation_insert_guard BEFORE INSERT ON sky_commerce_v2_seller_account_operations
WHEN NOT EXISTS (SELECT 1 FROM sky_commerce_sellers s
  WHERE s.id=NEW.seller_id AND s.user_id=NEW.seller_user_id AND s.mode=NEW.mode AND s.account_id IS NULL)
  OR NEW.state!='prepared' OR NEW.revision!=0 OR NEW.provider_account_id IS NOT NULL
  OR NEW.last_observation_id IS NOT NULL OR NEW.first_submitted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'V2_SELLER_RESERVATION_SCOPE_MISMATCH'); END;

CREATE TRIGGER sky_commerce_v2_seller_operation_update_guard BEFORE UPDATE ON sky_commerce_v2_seller_account_operations
WHEN NEW.id IS NOT OLD.id OR NEW.seller_id IS NOT OLD.seller_id OR NEW.seller_user_id IS NOT OLD.seller_user_id
  OR NEW.mode IS NOT OLD.mode OR NEW.platform_account_id IS NOT OLD.platform_account_id OR NEW.kind IS NOT OLD.kind
  OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.request_sha256 IS NOT OLD.request_sha256
  OR (OLD.provider_account_id IS NOT NULL AND NEW.provider_account_id IS NOT OLD.provider_account_id)
  OR (OLD.first_submitted_at IS NOT NULL AND
      (NEW.first_submitted_at IS NOT OLD.first_submitted_at OR NEW.retry_deadline IS NOT OLD.retry_deadline))
  OR NEW.revision<OLD.revision OR NEW.revision>OLD.revision+1
  OR NEW.lease_fence<OLD.lease_fence OR NEW.lease_fence>OLD.lease_fence+1
  OR (NEW.lease_token IS NOT NULL AND NEW.lease_token IS NOT OLD.lease_token AND NEW.lease_fence!=OLD.lease_fence+1)
  OR ((NEW.state IS NOT OLD.state OR NEW.provider_account_id IS NOT OLD.provider_account_id
       OR NEW.last_observation_id IS NOT OLD.last_observation_id) AND NEW.revision!=OLD.revision+1)
  OR (NEW.revision=OLD.revision+1 AND (NEW.last_mutation_id IS NULL OR NEW.last_mutation_id IS OLD.last_mutation_id))
  OR (NEW.revision=OLD.revision AND NEW.last_mutation_id IS NOT OLD.last_mutation_id)
BEGIN SELECT RAISE(ABORT,'V2_SELLER_OPERATION_IDENTITY_OR_CAS_INVALID'); END;

CREATE TRIGGER sky_commerce_v2_seller_operation_evidence_guard BEFORE UPDATE ON sky_commerce_v2_seller_account_operations
WHEN NEW.provider_account_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM sky_commerce_v2_observations p WHERE p.id=NEW.last_observation_id
    AND p.mode=NEW.mode AND p.platform_account_id=NEW.platform_account_id
    AND p.source_account_id=NEW.platform_account_id AND p.object_kind='account' AND p.object_id=NEW.provider_account_id
    AND json_extract(p.normalized_facts_json,'$.sky_operation_id')=NEW.id
    AND json_extract(p.normalized_facts_json,'$.sky_seller_user_id')=NEW.seller_user_id)
BEGIN SELECT RAISE(ABORT,'V2_SELLER_ACCOUNT_ADOPTION_REQUIRES_EVIDENCE'); END;

CREATE TRIGGER sky_commerce_v2_seller_operation_no_delete BEFORE DELETE ON sky_commerce_v2_seller_account_operations
BEGIN SELECT RAISE(ABORT,'V2_SELLER_CREATION_RESERVATION_MUST_SURVIVE'); END;

CREATE TRIGGER sky_commerce_v2_refund_insert_guard BEFORE INSERT ON sky_commerce_v2_refunds
WHEN NOT EXISTS (SELECT 1 FROM sky_commerce_v2_order_state s
  WHERE s.order_id=NEW.order_id AND s.mode=NEW.mode AND s.platform_account_id=NEW.platform_account_id
    AND s.currency=NEW.currency AND NEW.amount_minor<=s.amount_minor)
  OR (NEW.operation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sky_commerce_v2_operations p
      WHERE p.id=NEW.operation_id AND p.kind='refund_create' AND p.amount_minor=NEW.amount_minor))
BEGIN SELECT RAISE(ABORT,'V2_REFUND_ORDER_OR_OPERATION_MISMATCH'); END;

CREATE TRIGGER sky_commerce_v2_refund_identity_guard BEFORE UPDATE ON sky_commerce_v2_refunds
WHEN NEW.id IS NOT OLD.id OR NEW.order_id IS NOT OLD.order_id OR NEW.mode IS NOT OLD.mode
  OR NEW.platform_account_id IS NOT OLD.platform_account_id OR NEW.operation_id IS NOT OLD.operation_id
  OR NEW.provider_refund_id IS NOT OLD.provider_refund_id OR NEW.payment_intent_id IS NOT OLD.payment_intent_id
  OR NEW.charge_id IS NOT OLD.charge_id OR NEW.currency IS NOT OLD.currency OR NEW.amount_minor IS NOT OLD.amount_minor
  OR NEW.observed_at<OLD.observed_at
BEGIN SELECT RAISE(ABORT,'V2_REFUND_IDENTITY_IMMUTABLE'); END;

CREATE TRIGGER sky_commerce_v2_refund_observation_insert_guard BEFORE INSERT ON sky_commerce_v2_refunds
WHEN NOT EXISTS (SELECT 1 FROM sky_commerce_v2_observations p WHERE p.id=NEW.last_observation_id
  AND p.mode=NEW.mode AND p.platform_account_id=NEW.platform_account_id
  AND p.source_account_id=NEW.platform_account_id AND p.object_kind='refund' AND p.object_id=NEW.provider_refund_id
  AND p.observed_at=NEW.observed_at AND p.amount_minor=NEW.amount_minor AND p.currency=NEW.currency
  AND json_extract(p.normalized_facts_json,'$.status')=NEW.status
  AND json_extract(p.normalized_facts_json,'$.failure_balance_transaction') IS NEW.failure_balance_transaction_id)
BEGIN SELECT RAISE(ABORT,'V2_REFUND_OBSERVATION_MISMATCH'); END;

CREATE TRIGGER sky_commerce_v2_refund_observation_update_guard BEFORE UPDATE ON sky_commerce_v2_refunds
WHEN NOT EXISTS (SELECT 1 FROM sky_commerce_v2_observations p WHERE p.id=NEW.last_observation_id
  AND p.mode=NEW.mode AND p.platform_account_id=NEW.platform_account_id
  AND p.source_account_id=NEW.platform_account_id AND p.object_kind='refund' AND p.object_id=NEW.provider_refund_id
  AND p.observed_at=NEW.observed_at AND p.amount_minor=NEW.amount_minor AND p.currency=NEW.currency
  AND json_extract(p.normalized_facts_json,'$.status')=NEW.status
  AND json_extract(p.normalized_facts_json,'$.failure_balance_transaction') IS NEW.failure_balance_transaction_id)
  OR (OLD.status='succeeded' AND NEW.status='failed' AND NEW.failure_balance_transaction_id IS NULL)
BEGIN SELECT RAISE(ABORT,'V2_REFUND_CORRECTION_REQUIRES_FRESH_EVIDENCE'); END;

CREATE TRIGGER sky_commerce_v2_outbox_insert_guard BEFORE INSERT ON sky_commerce_v2_outbox
WHEN NOT EXISTS (
  SELECT 1 FROM sky_commerce_v2_order_state s
  JOIN sky_commerce_v2_entitlements e ON e.id=s.entitlement_id
  JOIN sky_commerce_v2_subject_links l ON l.id=NEW.subject_link_id
  WHERE s.order_id=NEW.order_id AND s.mode=NEW.mode AND s.platform_account_id=NEW.platform_account_id
    AND s.revision=NEW.order_revision AND s.last_mutation_id=NEW.mutation_id
    AND e.id=NEW.entitlement_id AND e.revision=NEW.entitlement_revision AND e.last_mutation_id=NEW.mutation_id
    AND e.current_order_id=NEW.order_id AND e.recovery_epoch=NEW.recovery_epoch
    AND e.contract_id=NEW.contract_id AND e.subject_link_id=NEW.subject_link_id
    AND l.contract_id=NEW.contract_id AND l.mode=NEW.mode AND l.revision=NEW.subject_link_revision
    AND l.buyer_user_id=e.buyer_user_id AND l.package_key=e.package_key
    AND (NEW.action!='grant' OR (e.state IN ('pending','active') AND l.state='active'
         AND s.payment_state='paid' AND s.reconciliation_state='current' AND s.refund_state IN ('none','failed','canceled')
         AND s.refund_succeeded_minor=0 AND s.refund_reserved_minor=0
         AND ((s.refund_case_state='none' AND s.refund_state='none' AND s.refund_entitlement_disposition='undecided')
           OR (s.refund_case_state IN ('resolved','withdrawn') AND s.refund_entitlement_disposition='restore'))
         AND s.dispute_state IN ('none','won')))
)
BEGIN SELECT RAISE(ABORT,'V2_OUTBOX_TRANSITION_OR_SUBJECT_MISMATCH'); END;

CREATE TRIGGER sky_commerce_v2_audit_insert_guard BEFORE INSERT ON sky_commerce_v2_audit
WHEN NOT EXISTS (SELECT 1 FROM sky_commerce_v2_order_state s
  WHERE s.order_id=NEW.order_id AND s.mode=NEW.mode AND s.platform_account_id=NEW.platform_account_id
    AND s.revision=NEW.revision AND s.last_mutation_id=NEW.mutation_id)
BEGIN SELECT RAISE(ABORT,'V2_AUDIT_REQUIRES_ACCEPTED_TRANSITION'); END;

CREATE TRIGGER sky_commerce_v2_contract_identity_guard BEFORE UPDATE ON sky_commerce_v2_access_contracts
WHEN NEW.id IS NOT OLD.id OR NEW.package_key IS NOT OLD.package_key OR NEW.mode IS NOT OLD.mode
  OR NEW.seller_user_id IS NOT OLD.seller_user_id OR NEW.manifest_sha256 IS NOT OLD.manifest_sha256
  OR NEW.version IS NOT OLD.version OR NEW.contract_sha256 IS NOT OLD.contract_sha256
  OR NEW.provider_origin IS NOT OLD.provider_origin OR NEW.audience IS NOT OLD.audience
  OR NEW.authorization_mode IS NOT OLD.authorization_mode OR NEW.max_positive_cache_seconds IS NOT OLD.max_positive_cache_seconds
BEGIN SELECT RAISE(ABORT,'V2_ACCESS_CONTRACT_VERSION_IMMUTABLE'); END;

CREATE TRIGGER sky_commerce_v2_subject_identity_guard BEFORE UPDATE ON sky_commerce_v2_subject_links
WHEN NEW.id IS NOT OLD.id OR NEW.contract_id IS NOT OLD.contract_id OR NEW.mode IS NOT OLD.mode
  OR NEW.package_key IS NOT OLD.package_key OR NEW.buyer_user_id IS NOT OLD.buyer_user_id
  OR NEW.provider_subject IS NOT OLD.provider_subject OR NEW.binding_evidence_ref IS NOT OLD.binding_evidence_ref
  OR NEW.revision!=OLD.revision+1
BEGIN SELECT RAISE(ABORT,'V2_SUBJECT_BINDING_IMMUTABLE'); END;

CREATE TRIGGER sky_commerce_v2_inbox_identity_guard BEFORE UPDATE ON sky_commerce_v2_inbox
WHEN NEW.id IS NOT OLD.id OR NEW.provider IS NOT OLD.provider OR NEW.mode IS NOT OLD.mode
  OR NEW.platform_account_id IS NOT OLD.platform_account_id OR NEW.source_account_id IS NOT OLD.source_account_id
  OR NEW.event_id IS NOT OLD.event_id OR NEW.event_type IS NOT OLD.event_type OR NEW.object_id IS NOT OLD.object_id
  OR NEW.payload_sha256 IS NOT OLD.payload_sha256 OR NEW.event_api_version IS NOT OLD.event_api_version
  OR NEW.verified_key_id IS NOT OLD.verified_key_id OR NEW.received_at IS NOT OLD.received_at
  OR NEW.event_created_at IS NOT OLD.event_created_at
  OR (OLD.order_id IS NOT NULL AND NEW.order_id IS NOT OLD.order_id)
  OR NEW.lease_fence<OLD.lease_fence OR NEW.lease_fence>OLD.lease_fence+1
  OR (NEW.lease_token IS NOT NULL AND NEW.lease_token IS NOT OLD.lease_token AND NEW.lease_fence!=OLD.lease_fence+1)
BEGIN SELECT RAISE(ABORT,'V2_INBOX_IDENTITY_OR_FENCE_INVALID'); END;

CREATE TRIGGER sky_commerce_v2_outbox_identity_guard BEFORE UPDATE ON sky_commerce_v2_outbox
WHEN NEW.id IS NOT OLD.id OR NEW.order_id IS NOT OLD.order_id OR NEW.mode IS NOT OLD.mode
  OR NEW.platform_account_id IS NOT OLD.platform_account_id OR NEW.entitlement_id IS NOT OLD.entitlement_id
  OR NEW.entitlement_revision IS NOT OLD.entitlement_revision OR NEW.order_revision IS NOT OLD.order_revision
  OR NEW.recovery_epoch IS NOT OLD.recovery_epoch OR NEW.subject_link_revision IS NOT OLD.subject_link_revision
  OR NEW.mutation_id IS NOT OLD.mutation_id OR NEW.contract_id IS NOT OLD.contract_id
  OR NEW.subject_link_id IS NOT OLD.subject_link_id OR NEW.action IS NOT OLD.action OR NEW.effect_sha256 IS NOT OLD.effect_sha256
  OR NEW.lease_fence<OLD.lease_fence OR NEW.lease_fence>OLD.lease_fence+1
  OR (NEW.lease_token IS NOT NULL AND NEW.lease_token IS NOT OLD.lease_token AND NEW.lease_fence!=OLD.lease_fence+1)
BEGIN SELECT RAISE(ABORT,'V2_OUTBOX_EFFECT_OR_FENCE_IMMUTABLE'); END;

CREATE TRIGGER sky_commerce_v2_outbox_ack_guard BEFORE UPDATE ON sky_commerce_v2_outbox
WHEN NEW.state='acknowledged' AND OLD.state!='acknowledged' AND NOT EXISTS (
  SELECT 1 FROM sky_commerce_v2_entitlements e
  JOIN sky_commerce_v2_subject_links l ON l.id=e.subject_link_id
  WHERE e.id=NEW.entitlement_id AND e.mode=NEW.mode AND e.revision=NEW.entitlement_revision
    AND e.current_order_id=NEW.order_id AND e.contract_id=NEW.contract_id AND e.subject_link_id=NEW.subject_link_id
    AND e.recovery_epoch=NEW.recovery_epoch AND l.revision=NEW.subject_link_revision
    AND (NEW.action!='grant' OR l.state='active')
)
BEGIN SELECT RAISE(ABORT,'V2_STALE_ENTITLEMENT_ACK'); END;

CREATE TRIGGER sky_commerce_v2_nonce_update_guard BEFORE UPDATE ON sky_commerce_v2_nonces
WHEN NEW.issuer IS NOT OLD.issuer OR NEW.audience IS NOT OLD.audience OR NEW.mode IS NOT OLD.mode
  OR NEW.nonce IS NOT OLD.nonce OR NEW.subject IS NOT OLD.subject OR NEW.request_sha256 IS NOT OLD.request_sha256
  OR NEW.issued_at IS NOT OLD.issued_at OR NEW.expires_at IS NOT OLD.expires_at
  OR (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS NOT OLD.consumed_at)
BEGIN SELECT RAISE(ABORT,'V2_NONCE_IMMUTABLE_OR_ALREADY_CONSUMED'); END;

CREATE TRIGGER sky_commerce_v2_quote_no_update BEFORE UPDATE ON sky_commerce_v2_quotes
BEGIN SELECT RAISE(ABORT,'V2_QUOTE_IMMUTABLE'); END;
CREATE TRIGGER sky_commerce_v2_quote_no_delete BEFORE DELETE ON sky_commerce_v2_quotes
BEGIN SELECT RAISE(ABORT,'V2_QUOTE_IMMUTABLE'); END;
CREATE TRIGGER sky_commerce_v2_observation_no_update BEFORE UPDATE ON sky_commerce_v2_observations
BEGIN SELECT RAISE(ABORT,'V2_OBSERVATION_APPEND_ONLY'); END;
CREATE TRIGGER sky_commerce_v2_observation_no_delete BEFORE DELETE ON sky_commerce_v2_observations
BEGIN SELECT RAISE(ABORT,'V2_OBSERVATION_APPEND_ONLY'); END;
CREATE TRIGGER sky_commerce_v2_audit_no_update BEFORE UPDATE ON sky_commerce_v2_audit
BEGIN SELECT RAISE(ABORT,'V2_AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER sky_commerce_v2_audit_no_delete BEFORE DELETE ON sky_commerce_v2_audit
BEGIN SELECT RAISE(ABORT,'V2_AUDIT_APPEND_ONLY'); END;

-- New internal refund reservation admission must use an atomic conditional UPDATE:
-- UPDATE sky_commerce_v2_order_state SET refund_reserved_minor=refund_reserved_minor+:amount,
--   revision=revision+1,last_mutation_id=:mutation
-- WHERE order_id=:order AND revision=:expected_revision AND reconciliation_state='current'
--   AND :amount>0 AND refund_succeeded_minor+refund_reserved_minor+:amount<=amount_minor;
-- Insert operation/audit conditionally on that accepted mutation in the SAME batch.
-- This admission cap is NOT a cap on external evidence: unknown reserved 10000 plus
-- verified Dashboard refund 5000 must persist as succeeded=5000,reserved=10000,
-- needs_review+suspended. Do not erase the success or shrink unknown operation intent.
-- Both figures remain visible; block new reservations and repurchase until reconciled.
--
-- REQUIRED APPLICATION PROTOCOL (not executed by this draft):
-- 1. Verify user/gateway, immutable quote and current seller/package/contract readiness.
-- 2. Reserve operation before Stripe POST. Store first-submission time once.
-- 3. Verify Stripe resource/mode/account/amount/currency/destination against snapshot.
-- 4. Acquire aggregate order lease with a fresh random token and incrementing fence.
-- 5. D1 batch: CAS order -> conditional entitlement -> outbox -> audit -> inbox done.
-- 6. A zero-row CAS is NOT an SQL failure. Condition EVERY effect on the same mutation.
--    After a conflict, re-read the aggregate AND re-fetch provider facts as needed.
-- 7. Before external delivery and accepting acknowledgement, compare aggregate
--    entitlement revision, independent recovery epoch and subject-link revision; old grants must never re-enable a refunded/rebought item.
-- 8. Paid access requires fresh authenticated subject, current accepted contract,
--    current reviewed manifest, correct audience, current aggregate revision,
--    paid payment and no refund/dispute hold. URL visibility is not authorization.
-- 9. The only financial source of truth is the provider evidence. A Wallet projection
--    may show unknown/negative provider balance; never invent available cash by
--    summing paid order amounts or treating NULL as zero.
--
-- Concrete batch example for a buyer who has ALREADY linked a verified subject
-- (bound values, PRIMARY/session-consistent initial reads; recovery_epoch input is
-- read from the independent recovery authority, not copied from a caller).
-- Ownership becomes active on verified payment; effect delivery is tracked separately.
-- For an unlinked buyer, the payment/ownership/audit transaction omits grant outbox
-- and records connection_pending; a later verified-link transition emits the grant.
-- Never make purchase ownership or its audit conditional on completing buyer OAuth.
-- Concrete batch example:
-- UPDATE sky_commerce_v2_order_state
-- SET payment_state='paid', access_state='active',
--     revision=revision+1, last_mutation_id=:mutation, updated_at=:now
-- WHERE order_id=:order AND revision=:expected_revision AND entitlement_id=:entitlement
--   AND lease_fence=:fence AND lease_token=:token AND lease_expires_at>:now
--   AND reconciliation_state='current' AND refund_state IN ('none','failed','canceled')
--   AND refund_succeeded_minor=0 AND refund_reserved_minor=0
--   AND ((refund_case_state='none' AND refund_state='none' AND refund_entitlement_disposition='undecided')
--     OR (refund_case_state IN ('resolved','withdrawn') AND refund_entitlement_disposition='restore'))
--   AND dispute_state IN ('none','won')
--   AND EXISTS (SELECT 1 FROM sky_commerce_v2_entitlements
--     WHERE id=:entitlement AND revision=:expected_entitlement_revision AND recovery_epoch=:recovery_epoch
--       AND (current_order_id IS NULL OR current_order_id=:order OR state IN ('inactive','revoked')));
--
-- UPDATE sky_commerce_v2_entitlements
-- SET revision=revision+1, state='active', current_order_id=:order,
--     last_mutation_id=:mutation, updated_at=:now
-- WHERE id=:entitlement AND revision=:expected_entitlement_revision
--   AND EXISTS (SELECT 1 FROM sky_commerce_v2_order_state
--     WHERE order_id=:order AND last_mutation_id=:mutation
--       AND revision=:expected_revision+1);
--
-- INSERT INTO sky_commerce_v2_outbox
--   (id,order_id,mode,platform_account_id,entitlement_id,entitlement_revision,
--    recovery_epoch,subject_link_revision,order_revision,mutation_id,contract_id,subject_link_id,action,effect_sha256,
--    created_at,updated_at)
-- SELECT :effect,s.order_id,s.mode,s.platform_account_id,e.id,e.revision,
--        e.recovery_epoch,(SELECT revision FROM sky_commerce_v2_subject_links WHERE id=e.subject_link_id),
--        s.revision,:mutation,e.contract_id,e.subject_link_id,'grant',:digest,:now,:now
-- FROM sky_commerce_v2_order_state s JOIN sky_commerce_v2_entitlements e ON e.id=s.entitlement_id
-- WHERE s.order_id=:order AND s.last_mutation_id=:mutation AND s.revision=:expected_revision+1
--   AND e.last_mutation_id=:mutation AND e.revision=:expected_entitlement_revision+1;
--
-- INSERT INTO sky_commerce_v2_audit
--   (id,order_id,mode,platform_account_id,revision,expected_revision,mutation_id,actor_kind,actor_ref,action,evidence_sha256,created_at)
-- SELECT :audit,s.order_id,s.mode,s.platform_account_id,s.revision,:expected_revision,:mutation,
--        'system',:actor,'payment_verified',:evidence,:now
-- FROM sky_commerce_v2_order_state s
-- WHERE s.order_id=:order AND s.last_mutation_id=:mutation AND s.revision=:expected_revision+1
--   AND EXISTS (SELECT 1 FROM sky_commerce_v2_outbox WHERE id=:effect);
--
-- UPDATE sky_commerce_v2_inbox SET state='processed',lease_token=NULL,lease_expires_at=NULL
-- WHERE id=:inbox AND lease_token=:inbox_token AND lease_fence=:inbox_fence
--   AND EXISTS (SELECT 1 FROM sky_commerce_v2_audit WHERE mutation_id=:mutation);
--
-- IMPORTANT: the FIRST CAS checks BOTH order and entitlement expected revisions.
-- D1 batch is transactional and sequential: there is no intervening writer before
-- the entitlement CAS. A conflict therefore makes the entire conditional chain a
-- no-op; a later statement/trigger error rolls the entire batch back. If an
-- implementation adds another independent predicate to the entitlement UPDATE,
-- that predicate must also gate the first CAS (or force SQL failure on conflict).
-- Identical mutation replay first verifies its existing audit/inbox/hash and returns
-- that accepted outcome; do not blindly rerun INSERTs and ignore unique failures.
-- Runtime methods, signature checks, field redaction, refund aggregation, migrations,
-- backfill, queue/sweeper deployment and provider sandbox acceptance remain unimplemented.
