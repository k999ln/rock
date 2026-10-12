/**
 * DESIGN REFERENCE ONLY — not a registered API, runtime schema, or funds ledger.
 * Types compile against this repository; runtime validation and authorization
 * remain implementation work. See ../wallet-commerce-design.md.
 *
 * Wallet projects Commerce and Provider facts. It cannot create spendable value.
 * JPY sale prices use salePrice() in sky-commerce-v2.ts (positive and bounded).
 * Account balances / compensating deltas use SignedJpyMinor (safe signed integer,
 * never clamp a negative balance to zero). Neither brand validates JSON at runtime.
 */
import type { BookRecord, OperationsSnapshot } from '../../lib/operations.ts';
import type {
  FinancialCapability,
  FinancialProviderManifest,
} from '../../lib/financial-provider.ts';
import type {
  AccessIntrospectionResponse,
  CommerceMode,
  EpochMs,
  JpyMinor,
  OrderStateV2,
  ProviderRefund,
  RefundOperation,
  Sha256,
  SignedJpyMinor,
} from './sky-commerce-v2.ts';

export type WalletRole = 'buyer' | 'seller';
export type WalletCurrency = 'jpy';
export type WalletAccountRef = string & { readonly __brand: 'wallet-account-ref' };
export type WalletCursor = string & { readonly __brand: 'wallet-cursor' };

/** Safe error surface; a failed refresh never replaces a known amount with zero. */
export type WalletError = {
  error: string;
  requestId: string;
} & (
  | { status: 400; code: 'UNSUPPORTED_CURRENCY' | 'CURSOR_SCOPE_INVALID' | 'VALIDATION_ERROR'; retry: 'correct_request' }
  | { status: 401; code: 'IDENTITY_REQUIRED'; retry: 'sign_in' }
  | { status: 404; code: 'REFERENCE_NOT_FOUND'; retry: 'none' }
  | { status: 409; code: 'SNAPSHOT_EXPIRED'; retry: 'restart_page_one' }
  | { status: 429; code: 'RECONCILIATION_RATE_LIMITED'; retry: 'later'; retryAfterSeconds: number }
  | { status: 503; code: 'PROJECTION_UNAVAILABLE'; retry: 'later'; retryAfterSeconds: number }
);

/** Server resolves (issuer, subject); no endpoint accepts an arbitrary owner ID. */
export type WalletViewer = {
  principalRef: string;
  role: WalletRole;
  mode: CommerceMode;
};

/** Public opaque account reference, authorized against the viewer on every read. */
export type WalletProviderScope = {
  providerId: 'stripe';
  accountRef: WalletAccountRef;
  accountKind: 'platform' | 'connected';
  mode: CommerceMode;
};

/** Server-only binding. A changed seller destination never rewrites old orders. */
export type WalletProviderAccountBinding = {
  scope: WalletProviderScope & { accountKind: 'connected' };
  principalRef: string;
  platformAccountId: string;
  connectedAccountId: string;
  commerceSellerId: string;
  revision: number;
};

/**
 * Unknown is null, never zero. A stale value keeps its original observation time.
 * observedAt is Rock's observation; providerAsOf is null when not supplied.
 * "verified" describes evidence at that time, not permission to move money.
 */
export type WalletObserved<T> =
  | {
      state: 'verified' | 'stale';
      value: T;
      observedAt: EpochMs;
      providerAsOf: EpochMs | null;
      evidenceRef: string;
      lastAttemptAt: EpochMs | null;
    }
  | {
      state: 'pending' | 'unavailable';
      value: null;
      observedAt: null;
      providerAsOf: null;
      evidenceRef: null;
      lastAttemptAt: EpochMs | null;
      reason: 'not_connected' | 'not_fetched' | 'provider_unavailable'
        | 'scope_unavailable' | 'reconciliation_required';
    };

export type WalletBalanceSnapshot = {
  snapshotId: string;
  /** Viewer must own this connected account; buyer orders do not expose platform balances. */
  providerScope: WalletProviderScope & { accountKind: 'connected' };
  currency: WalletCurrency;
  source: 'provider_account_balance';
  coverage: 'entire_provider_account_including_non_sky_activity';
  availableMinor: WalletObserved<SignedJpyMinor>;
  pendingMinor: WalletObserved<SignedJpyMinor>;
  reservedMinor: WalletObserved<SignedJpyMinor>;
  usableForSkyCheckout: false;
  revision: number;
};

export type WalletTimeRange = {
  startInclusive: EpochMs;
  endExclusive: EpochMs;
};

/** One role, one environment, one currency. Balances are separate per account. */
export type WalletAggregateScope = {
  viewer: WalletViewer;
  currency: WalletCurrency;
  providerScopes: readonly WalletProviderScope[];
  period: WalletTimeRange;
  periodBasis: 'original_charge_occurred_at';
  refundBasis: 'current_refunds_of_included_charges';
  source: 'normalized_commerce_projection';
  excludes: readonly ['manual_book', 'sandbox_native_ledger', 'non_sky_provider_activity'];
};

/** Totals use the whole scope at a consistent projection revision, never page 1. */
export type WalletAggregateEvidence = {
  aggregateRevision: number;
  snapshotId: string;
  computedAt: EpochMs;
  includesAllMatchingOrders: true;
  unresolvedOrderCount: number;
  completeness: 'complete' | 'partial';
};

/** GET /api/wallet/commerce/summary; no cursor and no caller-selected mode/owner. */
export type WalletSummaryQuery = {
  role: WalletRole;
  period: WalletTimeRange;
  currency: WalletCurrency;
  accountRef?: WalletAccountRef;
};

export type WalletSummaryFields = {
  schema: 'sky-wallet-summary/2';
  scope: WalletAggregateScope;
  aggregate: WalletAggregateEvidence;
  totals: {
    capturedMinor: WalletObserved<JpyMinor>;
    refundSucceededMinor: WalletObserved<JpyMinor>;
    refundReservedMinor: WalletObserved<JpyMinor>;
    applicationFeeAssessedMinor: WalletObserved<JpyMinor>;
    applicationFeeCollectedMinor: WalletObserved<JpyMinor>;
    applicationFeeRefundedMinor: WalletObserved<JpyMinor>;
    providerProcessingFeeMinor: WalletObserved<JpyMinor>;
    /** Informational charge-minus-refund total, neither profit nor bank receipt. */
    netCapturedMinor: WalletObserved<SignedJpyMinor>;
  };
  /** Buyer view is []; no grand total across accounts, roles, currencies or periods. */
  accountBalances: readonly WalletBalanceSnapshot[];
  attention: { unresolvedPayments: number; unresolvedRefunds: number; openDisputes: number };
  availableOperations: WalletInitialOperationBoundary;
};

/** Buyers see their own payments/refunds, never platform fees or seller balances. */
export type WalletSummaryResponse = Omit<WalletSummaryFields, 'scope' | 'totals' | 'accountBalances'> & (
  | {
      role: 'buyer';
      scope: WalletAggregateScope & { viewer: WalletViewer & { role: 'buyer' } };
      totals: Pick<WalletSummaryFields['totals'],
        'capturedMinor' | 'refundSucceededMinor' | 'refundReservedMinor' | 'netCapturedMinor'>;
      accountBalances: readonly [];
    }
  | {
      role: 'seller';
      scope: WalletAggregateScope & { viewer: WalletViewer & { role: 'seller' } };
      totals: WalletSummaryFields['totals'];
      accountBalances: readonly WalletBalanceSnapshot[];
    }
);

/** Existing financial manifest remains an independent, currently sandbox gate. */
export type WalletManifestReference = {
  snapshot: Readonly<FinancialProviderManifest>;
  declaredCapabilities: readonly FinancialCapability[];
  relationship: 'reference_only';
  commerceLiveAdmission: 'not_determined_by_this_manifest';
};

export type WalletAccountStatus =
  | 'not_connected' | 'onboarding_required' | 'pending_verification'
  | 'ready' | 'restricted' | 'suspended' | 'disconnected';

export type WalletAccountView = {
  providerScope: WalletProviderScope;
  displayName: string;
  status: WalletAccountStatus;
  manifestReference: WalletManifestReference | null;
  capabilities: WalletObserved<{
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    cardPayments: 'active' | 'inactive' | 'pending' | 'unrequested';
    transfers: 'active' | 'inactive' | 'pending' | 'unrequested';
  }>;
  requirements: WalletObserved<{
    needsUserAction: boolean;
    dueAt: EpochMs | null;
    /** Sanitized codes only; no KYC documents, raw failure text or personal data. */
    codes: readonly string[];
  }>;
  destination: WalletObserved<{
    kind: 'bank_account' | 'debit_card';
    displayName: string | null;
    last4: string | null;
  }>;
  disconnectedAt: EpochMs | null;
  revision: number;
  nextAction: WalletNextAction;
};

export type WalletAccountsResponse = {
  schema: 'sky-wallet-accounts/2';
  viewer: WalletViewer;
  /** Empty means no linked account, not a zero balance. */
  accounts: readonly WalletAccountView[];
  generatedAt: EpochMs;
  availableOperations: WalletInitialOperationBoundary;
};

export type WalletProviderReferenceKind =
  | 'provider_refund' | 'provider_dispute' | 'provider_application_fee'
  | 'provider_fee_refund' | 'provider_transfer' | 'provider_transfer_reversal'
  | 'provider_balance_transaction' | 'provider_payout';

export type WalletProviderReference<Domain extends WalletProviderReferenceKind> = {
  domain: Domain;
  id: string;
  providerScope: WalletProviderScope;
};

export type WalletBusinessReference =
  | { domain: 'commerce_order'; id: string }
  | { domain: 'commerce_refund_operation'; id: string }
  | { [Domain in WalletProviderReferenceKind]: WalletProviderReference<Domain> }[WalletProviderReferenceKind];

/** Buyer ownership of an order never grants access to its seller's account graph. */
export type WalletBuyerReference = Extract<WalletBusinessReference,
  { domain: 'commerce_order' | 'commerce_refund_operation' | 'provider_refund' | 'provider_dispute' }>;

export type WalletActivityKind =
  | 'payment' | 'sale' | 'refund' | 'dispute' | 'fee' | 'fee_refund'
  | 'transfer' | 'transfer_reversal' | 'payout' | 'adjustment';

/** Read-only suggestions. Every financial action needs its own fresh authorization. */
export type WalletNextAction =
  | { kind: 'none' }
  | { kind: 'wait_for_reconciliation'; retryAfterSeconds: number }
  | { kind: 'request_reconciliation'; reference: WalletBusinessReference }
  | { kind: 'connect_product'; packageKey: string }
  | { kind: 'provider_onboarding' | 'provider_account_action'; accountRef: WalletAccountRef }
  | { kind: 'open_refund_review'; orderId: string }
  | { kind: 'contact_support'; supportReference: string };

/** A business transaction row, not one new row per webhook delivery. */
export type WalletActivityRow = {
  transactionId: string;
  businessReference: WalletBusinessReference;
  originalReference: WalletBusinessReference | null;
  viewer: WalletViewer;
  providerScope: WalletProviderScope;
  kind: WalletActivityKind;
  title: string;
  currency: WalletCurrency;
  displayAmount: WalletObserved<SignedJpyMinor>;
  amountPerspective: 'buyer_cash_flow' | 'seller_provider_account';
  /** Role-aware sign is display-only; amounts cannot be summed as account balance. */
  contributesToSummary: 'original_charge' | 'current_refund_fact' | 'fee_fact' | 'none';
  status: 'processing' | 'confirmed' | 'failed' | 'canceled' | 'requires_action' | 'unknown';
  occurredAt: EpochMs;
  lastVerifiedAt: EpochMs | null;
  revision: number;
  nextAction: WalletNextAction;
};

export type WalletBuyerActivityRow = Omit<WalletActivityRow,
  'viewer' | 'businessReference' | 'originalReference' | 'kind' | 'amountPerspective' | 'nextAction'> & {
  viewer: WalletViewer & { role: 'buyer' };
  businessReference: WalletBuyerReference;
  originalReference: WalletBuyerReference | null;
  kind: 'payment' | 'refund' | 'dispute' | 'adjustment';
  amountPerspective: 'buyer_cash_flow';
  nextAction: Extract<WalletNextAction,
    { kind: 'none' | 'wait_for_reconciliation' | 'connect_product' | 'contact_support' }>
    | { kind: 'request_reconciliation'; reference: WalletBuyerReference };
};

export type WalletSellerActivityRow = WalletActivityRow & {
  viewer: WalletViewer & { role: 'seller' };
  amountPerspective: 'seller_provider_account';
};

export type WalletActivityFilter = {
  role: WalletRole;
  currency: WalletCurrency;
  kinds: readonly WalletActivityKind[];
  statuses: readonly WalletActivityRow['status'][];
  period: WalletTimeRange | null;
  accountRef: WalletAccountRef | null;
};

/**
 * Signed opaque cursor binds principal, mode, role, currency, authorized accounts,
 * endpoint/parent ID, filter digest, stable (occurredAt, transactionId) order and
 * projection snapshot. Membership pages use their stable source ID instead.
 * Snapshot expired => restart from page 1; never silently skip into another view.
 * New observations are visible after refresh, not inserted into existing pages.
 */
export type WalletPage<T> = {
  items: readonly T[];
  nextCursor: WalletCursor | null;
  hasMore: boolean;
  snapshotId: string;
  snapshotRevision: number;
  scopeDigest: Sha256;
  snapshotExpiresAt: EpochMs;
};

export type WalletActivityQuery = WalletActivityFilter & {
  cursor?: WalletCursor;
  limit?: number; // Runtime integer 1..100; mode comes from authorized server context.
};

export type WalletActivityResponse = {
  schema: 'sky-wallet-activity/2';
  filter: WalletActivityFilter;
} & (
  | { role: 'buyer'; viewer: WalletViewer & { role: 'buyer' }; page: WalletPage<WalletBuyerActivityRow> }
  | { role: 'seller'; viewer: WalletViewer & { role: 'seller' }; page: WalletPage<WalletSellerActivityRow> }
);

/** Public history omits provider idempotency keys, request digests and secret data. */
export type WalletRefundOperationView = Pick<RefundOperation,
  'refundOperationId' | 'orderId' | 'mode' | 'providerRefundId' | 'amountMinor'
  | 'currency' | 'status' | 'providerObservedAt' | 'firstSubmittedAt'>;
export type WalletRefundView = Pick<ProviderRefund,
  'providerRefundId' | 'refundOperationId' | 'origin' | 'orderId' | 'mode'
  | 'amountMinor' | 'currency' | 'status' | 'observedAt' | 'failureBalanceTransactionId'>;

export type WalletPurchaseUse = {
  /** Monetary ownership is OrderStateV2.access; OAuth linkage cannot delete it. */
  subjectLinkState: 'linked' | 'unlinked' | 'unknown';
  subjectLinkRevision: number;
  lastDecision: Pick<AccessIntrospectionResponse,
    'allowed' | 'reason' | 'entitlementRevision' | 'packageReviewRevision'
    | 'subjectLinkRevision' | 'recoveryEpoch' | 'checkedAt' | 'validUntil'> | null;
  authorizesExecution: false;
};

export type WalletTimelineEntry = {
  eventId: string;
  reference: WalletBusinessReference;
  originalReference: WalletBusinessReference | null;
  kind: 'observed' | 'correction' | 'refund_case_resolution' | 'reconciliation';
  occurredAt: EpochMs | null;
  observedAt: EpochMs;
  amountDeltaMinor: SignedJpyMinor | null;
  evidenceRef: string;
  descriptionCode: string;
};

export type WalletBuyerTimelineEntry = Omit<WalletTimelineEntry, 'reference' | 'originalReference'> & {
  reference: WalletBuyerReference;
  originalReference: WalletBuyerReference | null;
};

/** A payout can include many transactions, some outside Sky. No orderId scalar. */
export type WalletPayoutMembership = {
  balanceTransactionRef: WalletProviderReference<'provider_balance_transaction'>;
  amountMinor: SignedJpyMinor;
  currency: WalletCurrency;
} & (
  | {
      attribution: 'matched_sky';
      /** Only this seller's already-authorized orders; never buyer identity/other sellers. */
      relatedBusinessReferences: readonly Extract<WalletBusinessReference, { domain: 'commerce_order' }>[];
    }
  | { attribution: 'non_sky' | 'unmatched'; relatedBusinessReferences: readonly [] }
);

export type WalletPayoutView = {
  reference: WalletProviderReference<'provider_payout'>;
  /** Only the authenticated owner of this connected account can receive this DTO. */
  providerScope: WalletProviderScope & { accountKind: 'connected' };
  amountMinor: JpyMinor;
  currency: WalletCurrency;
  status: WalletObserved<'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled'>;
  expectedArrivalAt: EpochMs | null;
  bankReceipt: 'not_independently_verified';
  memberships: WalletPage<WalletPayoutMembership>;
  membershipCompleteness: 'complete' | 'partial' | 'not_reconciled';
};

export type WalletOrderDetailFields = {
    packageKey: string;
    manifestSha256: string;
    /** Immutable order price, never a signed balance or replacement current offer. */
    originalPriceMinor: JpyMinor;
    currency: WalletCurrency;
    termsVersion: string;
    receiptUrl: string | null; // Authorized, Provider-origin allowlist; no arbitrary URL.
    /** UI pages never recompute ownership or refund totals from a partial list. */
    refundOperations: WalletPage<WalletRefundOperationView>;
};

export type WalletBuyerOrderDetail = WalletOrderDetailFields & {
    state: Omit<OrderStateV2, 'money'> & {
      money: Pick<OrderStateV2['money'], 'currency' | 'capturedMinor' | 'refundSucceededMinor'
        | 'refundReservedMinor' | 'refundOutcomeUnknown' | 'providerObservedAt'>;
    };
    purchaseUse: WalletPurchaseUse;
    providerRefunds: WalletPage<Omit<WalletRefundView, 'failureBalanceTransactionId'>>;
};

export type WalletSellerOrderDetail = WalletOrderDetailFields & {
    state: OrderStateV2;
    /** Seller views do not expose a buyer's OAuth/link/last execution decision. */
    purchaseUse: null;
    providerRefunds: WalletPage<WalletRefundView>;
};

/**
 * Every nested reference, timeline page and cursor rechecks current viewer access.
 * An order read is not authority to read account/payout membership or raw evidence.
 * Seller references include only their authorized orders/account; evidenceRef is
 * an opaque reference to redacted evidence, never a raw Provider-response endpoint.
 */
export type WalletActivityDetailResponse = { schema: 'sky-wallet-activity-detail/2' } & (
  | {
      role: 'buyer';
      activity: WalletBuyerActivityRow;
      order: WalletBuyerOrderDetail;
      relatedReferences: readonly WalletBuyerReference[];
      payouts: readonly [];
      timeline: WalletPage<WalletBuyerTimelineEntry>;
    }
  | {
      role: 'seller';
      activity: WalletSellerActivityRow;
      order: WalletSellerOrderDetail | null;
      relatedReferences: readonly WalletBusinessReference[];
      payouts: readonly WalletPayoutView[];
      timeline: WalletPage<WalletTimelineEntry>;
    }
);

/**
 * POST /api/wallet/commerce/reconciliations queues read/compare/project work,
 * not a new refund or payout. Every reference is resolved within the session's
 * principal/mode; supplied scope is a match assertion, not delegated authority.
 */
export type WalletReconciliationRequest = {
  businessReference: WalletBusinessReference;
  requestKey: string;
};

export type WalletReconciliationFields = {
  schema: 'sky-wallet-reconciliation/2';
  reconciliationId: string;
  providerScope: WalletProviderScope;
  status: 'pending' | 'running' | 'completed' | 'unknown' | 'needs_review';
  /** Null unless both sides have identical account/currency/time and full coverage. */
  differenceMinor: SignedJpyMinor | null;
  currency: WalletCurrency;
  coverage: 'complete' | 'partial' | 'unknown';
  lastAttemptAt: EpochMs | null;
  observedAt: EpochMs | null;
  nextAttemptAt: EpochMs | null;
  createsFundsInstruction: false;
};

/** A buyer-triggered order reconcile never exposes seller payout/account findings. */
export type WalletReconciliationView = WalletReconciliationFields & (
  | {
      role: 'buyer';
      viewer: WalletViewer & { role: 'buyer' };
      reference: WalletBuyerReference;
      comparison: 'order_vs_provider_objects';
      unmatchedReferences: readonly WalletBuyerReference[];
      nextAction: WalletBuyerActivityRow['nextAction'];
    }
  | {
      role: 'seller';
      viewer: WalletViewer & { role: 'seller' };
      reference: WalletBusinessReference;
      comparison: 'order_vs_provider_objects' | 'payout_vs_balance_transactions'
        | 'account_snapshot_vs_complete_balance_transactions';
      unmatchedReferences: readonly WalletBusinessReference[];
      nextAction: WalletNextAction;
    }
);

/** Internal CAS/fence metadata is not a caller-selectable override. */
export type WalletReconciliationCommit = {
  reconciliationId: string;
  expectedAggregateRevision: number;
  leaseFence: number;
  providerRequestIds: readonly string[];
  resultDigest: Sha256;
  observationIds: readonly string[];
};

/** Retain the old shape and units; these are NOT verified JPY commerce receipts. */
export type WalletLegacyBookRecord = BookRecord;
export type WalletManualBookNamespace = {
  namespace: 'manual_book';
  verified: false;
  includedInCommerceTotals: false;
  snapshot: Readonly<OperationsSnapshot['book']>;
  serverTime: OperationsSnapshot['serverTime'];
  automaticallyPostCommerceIntoBook: false;
};

/** No custody/top-up/withdrawal or signed crypto-transfer endpoints in this design. */
export type WalletInitialOperationBoundary = {
  providerAccountRead: true;
  providerPayoutStatusRead: true;
  scopedReconciliationRequest: true;
  checkout: 'existing_commerce_endpoint_with_fresh_authorization';
  sellerRefund: 'existing_commerce_endpoint_with_exact_approval';
  providerOnboarding: 'existing_commerce_endpoint';
  payWithDisplayedBalance: false;
  topUp: 'not_implemented';
  withdraw: 'not_implemented';
  manualPayout: 'not_implemented';
  userToUserTransfer: 'not_implemented';
  cryptoAccountSigning: 'not_implemented';
  cryptoPurchaseOrExchange: 'not_implemented';
};
