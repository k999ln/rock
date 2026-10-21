/**
 * Design contract only. No network calls, credentials or production mutations.
 * Existing shapes are imported to make compatibility review explicit.
 */
import type {
  CommerceMode,
  CommerceOffer as ExistingOfferRow,
  CommerceOrder as ExistingOrderRow,
  CommerceStatus as LegacyOrderStatus,
} from '../../lib/sky-commerce-store.ts';

export type { CommerceMode, LegacyOrderStatus };
export type JpyMinor = number & { readonly __brand: 'JPY/minor' };
export type SignedJpyMinor = number & { readonly __brand: 'JPY/signed-minor' };
export type EpochMs = number & { readonly __brand: 'epoch-ms' };
export type Sha256 = string & { readonly __brand: 'sha256-hex' };

export function jpyMinor(value: unknown): JpyMinor {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error('INVALID_JPY_MINOR');
  return value as JpyMinor;
}

export function salePrice(value: unknown): JpyMinor {
  const amount = jpyMinor(value);
  if (amount < 50 || amount > 99_999_999) throw new Error('PRICE_OUT_OF_RANGE');
  return amount;
}

export type OfferView = Pick<ExistingOfferRow, 'packageKey' | 'revision' | 'termsUrl' | 'refundPolicy'> & {
  active: boolean;
  amountMinor: JpyMinor;
  currency: 'jpy';
};

/** Integer booleans never cross the API boundary. Unknown DB values fail closed. */
export function offerView(row: ExistingOfferRow): OfferView {
  if (row.currency !== 'jpy' || (row.active !== 0 && row.active !== 1))
    throw new Error('INVALID_OFFER_ROW');
  return { packageKey: row.packageKey, revision: row.revision, termsUrl: row.termsUrl,
    refundPolicy: row.refundPolicy, currency: 'jpy', amountMinor: salePrice(row.amountMinor), active: row.active === 1 };
}

export type PublicOfferView = Omit<OfferView, 'active'>;

export type MoneyState = {
  currency: 'jpy';
  capturedMinor: JpyMinor;
  refundSucceededMinor: JpyMinor;
  refundReservedMinor: JpyMinor;
  refundOutcomeUnknown: boolean;
  /** Reservations can overlap external refunds; this is not spendable value. */
  refundReconciliationRequired: boolean;
  applicationFeeAssessedMinor: JpyMinor;
  applicationFeeCollectedMinor: JpyMinor | null;
  applicationFeeRefundedMinor: JpyMinor | null;
  providerProcessingFeeMinor: JpyMinor | null;
  providerObservedAt: EpochMs | null;
};

export type PaymentState = 'unpaid' | 'processing' | 'paid' | 'canceled';
export type PaymentClosureReason = 'expired' | 'rejected' | 'canceled' | null;
export type RefundCaseState = 'none' | 'open' | 'resolved' | 'withdrawn';
export type RefundEntitlementDisposition = 'undecided' | 'restore' | 'keep_revoked';
export type RefundProviderState = 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled';
export type RefundOperationState = 'requested' | 'submitting' | 'unknown' | RefundProviderState;
export type DisputeState = 'none' | 'needs_response' | 'under_review' | 'won' | 'lost';
export type AccessState = 'pending' | 'active' | 'suspended' | 'revoked';
export type AccessReason =
  | 'not_paid' | 'provider_link_required' | 'refund_in_progress' | 'partial_refund'
  | 'fully_refunded' | 'dispute_open' | 'dispute_lost' | 'review_expired'
  | 'package_revoked' | 'manifest_mismatch' | 'subject_unlinked' | 'reconciliation_required'
  | 'case_disposition_required'
  | 'allowed';

export type RefundOperation = {
  refundOperationId: string;
  orderId: ExistingOrderRow['id'];
  mode: CommerceMode;
  providerRefundId: string | null;
  amountMinor: JpyMinor;
  currency: 'jpy';
  status: RefundOperationState;
  providerObservedAt: EpochMs | null;
  requestDigest: Sha256;
  providerIdempotencyKey: string;
  firstSubmittedAt: EpochMs | null;
  retryDeadline: EpochMs | null;
};

/** Also admits refunds created in the Stripe Dashboard, with no Sky command. */
export type ProviderRefund = {
  providerRefundId: string;
  refundOperationId: string | null;
  origin: 'sky' | 'provider_dashboard' | 'provider_automatic';
  orderId: ExistingOrderRow['id'];
  mode: CommerceMode;
  platformAccountId: string;
  paymentIntentId: string;
  chargeId: string;
  amountMinor: JpyMinor;
  currency: 'jpy';
  status: RefundProviderState;
  observedAt: EpochMs;
  failureBalanceTransactionId: string | null;
};

export type OrderStateV2 = {
  orderId: ExistingOrderRow['id'];
  mode: CommerceMode;
  revision: number;
  lastObservationId: string | null;
  payment: PaymentState;
  paymentClosureReason: PaymentClosureReason;
  money: MoneyState;
  dispute: DisputeState;
  refundCaseState: RefundCaseState;
  refundEntitlementDisposition: RefundEntitlementDisposition;
  access: AccessState;
  accessReason: AccessReason;
  accessRevision: number;
  reconciliation: 'current' | 'queued' | 'unknown' | 'needs_review';
};

/** Display compatibility only: never use the legacy result to authorize a Tool. */
export function legacyStatus(state: OrderStateV2): LegacyOrderStatus {
  if (state.money.capturedMinor > 0 && state.money.refundSucceededMinor === state.money.capturedMinor)
    return 'refunded';
  if (['needs_response', 'under_review', 'lost'].includes(state.dispute)) return 'disputed';
  if (state.money.refundReservedMinor > 0 || state.money.refundOutcomeUnknown || state.refundCaseState === 'open')
    return 'refund_pending';
  if (state.money.refundSucceededMinor > 0) return 'partially_refunded';
  if (state.payment === 'paid') return 'paid';
  if (state.paymentClosureReason === 'expired') return 'expired';
  if (state.paymentClosureReason === 'rejected' || state.paymentClosureReason === 'canceled') return 'failed';
  return 'pending';
}

export type OrderObservation = {
  schema: 'sky-payment-observation/1';
  scope: 'order';
  observationId: string;
  orderId: string;
  provider: 'stripe';
  mode: CommerceMode;
  platformAccountId: string;
  connectedAccountId: string;
  trigger: { kind: 'webhook'; inboxId: string } | { kind: 'scheduled' | 'operator' | 'buyer'; requestId: string };
  sessionId: string | null;
  paymentIntentId: string | null;
  chargeId: string | null;
  refundIds: string[];
  disputeIds: string[];
  observedAt: EpochMs;
  normalizedFactsDigest: Sha256;
  stripeRequestIds: string[];
  expectedOrderRevision: number;
  leaseFence: number;
};

/** Provider balances and bank payouts do not belong to an arbitrary order. */
export type AccountObservation = {
  schema: 'sky-account-observation/1';
  scope: 'account';
  observationId: string;
  provider: 'stripe';
  mode: CommerceMode;
  platformAccountId: string;
  connectedAccountId: string;
  currency: 'jpy';
  observedAt: EpochMs;
  normalizedFactsDigest: Sha256;
  stripeRequestIds: string[];
  /** Scoped by mode/platform/connected account/currency/evidenceKind. */
  expectedAccountRevision: number;
  leaseFence: number;
  evidenceKind: 'balance' | 'payout' | 'account_capabilities';
};
export type ProviderObservation = OrderObservation | AccountObservation;

export type SellerAccountOperation = {
  operationId: string;
  kind: 'account_create';
  sellerReservationId: string;
  sellerPrincipalId: string;
  mode: CommerceMode;
  platformAccountId: string;
  status: 'requested' | 'submitting' | 'unknown' | 'succeeded' | 'failed';
  requestDigest: Sha256;
  providerIdempotencyKey: string;
  connectedAccountId: string | null;
  firstSubmittedAt: EpochMs | null;
  retryDeadline: EpochMs | null;
};

export type CheckoutRequestV1 = { packageKey: string; offerRevision: number };
export type CheckoutRequestV2 = CheckoutRequestV1 & { quoteId: string };
export type CheckoutResponseV1 = { orderId: string; owned: true } | { orderId: string; url: string };
export type CheckoutResponseV2 = CheckoutResponseV1 | {
  orderId: string;
  nextAction: 'wait_for_reconciliation';
  retryAfterSeconds: number;
};

export type CheckoutQuote = {
  quoteId: string;
  packageKey: string;
  manifestSha256: string;
  offerRevision: number;
  amountMinor: JpyMinor;
  currency: 'jpy';
  quantity: 1;
  paymentType: 'one_time';
  licenseScope: 'package_version';
  termsVersion: string;
  termsDigest: Sha256;
  sellerDisclosureVersion: string;
  deliveryDescription: string;
  refundPolicy: string;
  expiresAt: EpochMs;
};

export type SafePaymentError = {
  error: string;
  code: 'PAYMENT_NOT_CONFIGURED' | 'IDENTITY_REQUIRED' | 'OFFER_CHANGED'
    | 'PROVIDER_NOT_READY' | 'PROVIDER_UNAVAILABLE' | 'PAYMENT_OUTCOME_UNKNOWN'
    | 'REFUND_OUTCOME_UNKNOWN' | 'MANUAL_RECONCILIATION_REQUIRED' | 'REVISION_CONFLICT'
    | 'ACCESS_NOT_ACTIVE' | 'VALIDATION_ERROR' | 'CLIENT_UPDATE_REQUIRED';
  retry: 'same_request' | 'reconcile_only' | 'none';
  requestId: string;
  orderId?: string;
  retryAfterSeconds?: number;
};

export type PaidAccessContract = {
  schema: 'sky-paid-access/1';
  mode: CommerceMode;
  packageKey: string;
  manifestSha256: string;
  sellerUserId: string;
  providerId: string;
  providerAccountScope: string;
  providerResourceUri: string;
  oauthIssuer: string;
  subjectNamespace: string;
  bindingRevision: number;
  licenseScope: 'package_version';
  verification: 'server_introspection';
  maxPositiveCacheSeconds: 60;
  freshCheckFor: readonly ['financial', 'external_write'];
};

/** Provider-authenticated call. Never includes a user's OAuth token or email. */
export type AccessIntrospectionRequest = {
  subjectLinkId: string;
  packageKey: string;
  manifestSha256: string;
  operation: 'read' | 'local_write' | 'external_write' | 'financial';
  runId: string;
  requestDigest: Sha256;
};

export type AccessIntrospectionResponse = {
  scope: {
    mode: CommerceMode;
    providerId: string;
    subjectLinkId: string;
    packageKey: string;
    manifestSha256: string;
    runId: string;
    requestDigest: Sha256;
  };
  allowed: boolean;
  reason: AccessReason;
  entitlementRevision: number;
  packageReviewRevision: number;
  subjectLinkRevision: number;
  recoveryEpoch: number;
  checkedAt: EpochMs;
  validUntil: EpochMs;
  decisionId: string;
};

export type WalletCommerceAmount = {
  amountMinor: SignedJpyMinor | null;
  currency: 'jpy';
  mode: CommerceMode;
  source: 'stripe_charge' | 'stripe_refund' | 'stripe_balance' | 'stripe_payout';
  asOf: EpochMs | null;
  reconciliationState: 'verified' | 'pending' | 'unavailable';
};
