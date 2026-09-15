export const CSV_PAYMENT_EVENT_TYPES = [
  'buyer_paid',
  'payment_failed',
  'payout_available',
  'payout_started',
  'paid_to_owner',
  'provider_fee',
  'refund',
  'disputed',
  'payout_failed',
  'canceled',
] as const;

export type CsvPaymentEventType = (typeof CSV_PAYMENT_EVENT_TYPES)[number];
export type CsvPaymentSource = 'provider' | 'manual_verified';

export type CsvPaymentEvent = {
  provider: string;
  providerEventId: string;
  relatedProviderEventId?: string;
  relatedEventType?: 'buyer_paid' | 'paid_to_owner';
  jobId: string;
  type: CsvPaymentEventType;
  amountMinor: number;
  currency: string;
  occurredAt: number;
  evidenceDigest: string;
  source: CsvPaymentSource;
};

export type CsvPaymentProjection = {
  status:
    | 'unpaid'
    | 'payment_failed'
    | 'paid_by_buyer'
    | 'available'
    | 'payout_pending'
    | 'paid_to_owner'
    | 'manual_verified'
    | 'payout_failed'
    | 'partially_refunded'
    | 'refunded'
    | 'disputed'
    | 'canceled'
    | 'payment_mismatch'
    | 'payment_review';
  currency: string | null;
  amountsByCurrency: Record<
    string,
    {
      paidMinor: number;
      providerFeeMinor: number;
      refundedMinor: number;
      ownerPayoutMinor: number;
      verifiedNetMinor: number;
      buyerRefundedMinor: number;
      payoutAdjustedMinor: number;
    }
  >;
};

export type CsvMonthlyNet = {
  monthJst: string;
  verifiedNetUsdMinor: number | null;
  evidenceIds: string[];
  fxRequired: boolean;
  needsReview: boolean;
  noProviderEvidence: boolean;
};

const MAX_MINOR = 100_000_000;
const MAX_FUTURE_MS = 5 * 60_000;
const bounded = (value: unknown, max: number, label: string) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error(label);
  return value.trim();
};

export function csvPaymentEvent(
  value: unknown,
  nowMs = Date.now(),
): CsvPaymentEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('PAYMENT_EVENT');
  const row = value as Record<string, unknown>;
  const allowed = new Set([
    'provider',
    'providerEventId',
    'relatedProviderEventId',
    'relatedEventType',
    'jobId',
    'type',
    'amountMinor',
    'currency',
    'occurredAt',
    'evidenceDigest',
    'source',
  ]);
  if (Object.keys(row).some((key) => !allowed.has(key)))
    throw new Error('PAYMENT_EVENT_FIELDS');
  if (
    typeof row.type !== 'string' ||
    !CSV_PAYMENT_EVENT_TYPES.includes(row.type as CsvPaymentEventType)
  )
    throw new Error('PAYMENT_EVENT_TYPE');
  if (
    !Number.isSafeInteger(row.amountMinor) ||
    Number(row.amountMinor) < 0 ||
    Number(row.amountMinor) > MAX_MINOR
  )
    throw new Error('PAYMENT_EVENT_AMOUNT');
  if (
    !Number.isSafeInteger(row.occurredAt) ||
    Number(row.occurredAt) < 1 ||
    Number(row.occurredAt) > nowMs + MAX_FUTURE_MS
  )
    throw new Error('PAYMENT_EVENT_TIME');
  if (row.source !== 'provider' && row.source !== 'manual_verified')
    throw new Error('PAYMENT_EVENT_SOURCE');
  const type = row.type as CsvPaymentEventType;
  if (
    ['buyer_paid', 'payout_available', 'payout_started', 'paid_to_owner', 'provider_fee', 'refund'].includes(type) &&
    Number(row.amountMinor) <= 0
  )
    throw new Error('PAYMENT_EVENT_AMOUNT');
  const currency = bounded(row.currency, 3, 'PAYMENT_EVENT_CURRENCY').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('PAYMENT_EVENT_CURRENCY');
  const evidenceDigest = bounded(
    row.evidenceDigest,
    64,
    'PAYMENT_EVENT_EVIDENCE',
  ).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(evidenceDigest))
    throw new Error('PAYMENT_EVENT_EVIDENCE');
  if (['refund', 'disputed', 'canceled'].includes(type)) {
    if (row.relatedProviderEventId === undefined)
      throw new Error('PAYMENT_EVENT_REQUIRES_ORIGINAL');
    if (
      row.relatedEventType !== 'buyer_paid' &&
      row.relatedEventType !== 'paid_to_owner'
    )
      throw new Error('PAYMENT_EVENT_REQUIRES_ORIGINAL_TYPE');
    if (type !== 'refund' && row.relatedEventType !== 'buyer_paid')
      throw new Error('PAYMENT_ORDER_EVENT_REQUIRES_BUYER_PAYMENT');
  } else if (row.relatedEventType !== undefined) {
    throw new Error('PAYMENT_EVENT_UNEXPECTED_ORIGINAL_TYPE');
  }
  return {
    provider: bounded(row.provider, 40, 'PAYMENT_EVENT_PROVIDER'),
    providerEventId: bounded(row.providerEventId, 160, 'PAYMENT_EVENT_PROVIDER_ID'),
    ...(row.relatedProviderEventId === undefined
      ? {}
      : {
          relatedProviderEventId: bounded(
            row.relatedProviderEventId,
            160,
            'PAYMENT_EVENT_RELATED_ID',
          ),
        }),
    ...(row.relatedEventType === undefined
      ? {}
      : { relatedEventType: row.relatedEventType }),
    jobId: bounded(row.jobId, 64, 'PAYMENT_EVENT_JOB'),
    type,
    amountMinor: Number(row.amountMinor),
    currency,
    occurredAt: Number(row.occurredAt),
    evidenceDigest,
    source: row.source,
  };
}

function canonicalEvent(event: CsvPaymentEvent) {
  return JSON.stringify({
    provider: event.provider,
    providerEventId: event.providerEventId,
    relatedProviderEventId: event.relatedProviderEventId ?? null,
    relatedEventType: event.relatedEventType ?? null,
    jobId: event.jobId,
    type: event.type,
    amountMinor: event.amountMinor,
    currency: event.currency,
    occurredAt: event.occurredAt,
    evidenceDigest: event.evidenceDigest,
    source: event.source,
  });
}

function uniqueEvents(values: CsvPaymentEvent[], nowMs = Date.now()) {
  const unique = new Map<string, CsvPaymentEvent>();
  for (const value of values) {
    const event = csvPaymentEvent(value, nowMs);
    const key = `${event.provider}\u0000${event.providerEventId}`;
    const prior = unique.get(key);
    if (prior && canonicalEvent(prior) !== canonicalEvent(event))
      throw new Error('PAYMENT_EVENT_CONFLICT');
    unique.set(key, event);
  }
  return [...unique.values()];
}

function linkedEvents(events: CsvPaymentEvent[]) {
  const byKey = new Map(
    events.map((event) => [`${event.provider}\u0000${event.providerEventId}`, event]),
  );
  const refundsByOriginal = new Map<string, number>();
  const linkedRefundEvents: CsvPaymentEvent[] = [];
  const unlinkedRefundEvents: CsvPaymentEvent[] = [];
  for (const event of events) {
    if (event.type !== 'refund' || !event.relatedProviderEventId) continue;
    const originalKey = `${event.provider}\u0000${event.relatedProviderEventId}`;
    const original = byKey.get(originalKey);
    // Refunds may arrive before their original charge/payout. Retain them and
    // apply them after the matching event arrives, independent of arrival order.
    if (!original) {
      unlinkedRefundEvents.push(event);
      continue;
    }
    if (
      original.type !== event.relatedEventType ||
      original.jobId !== event.jobId ||
      original.currency !== event.currency
    )
      throw new Error('PAYMENT_REFUND_MISMATCH');
    refundsByOriginal.set(originalKey, (refundsByOriginal.get(originalKey) ?? 0) + event.amountMinor);
    linkedRefundEvents.push(event);
  }
  for (const event of events) {
    if (!['disputed', 'canceled'].includes(event.type) || !event.relatedProviderEventId)
      continue;
    const original = byKey.get(`${event.provider}\u0000${event.relatedProviderEventId}`);
    if (!original) continue;
    if (
      original.type !== 'buyer_paid' ||
      original.jobId !== event.jobId ||
      original.currency !== event.currency
    )
      throw new Error('PAYMENT_ORDER_EVENT_MISMATCH');
  }
  const buyerPayments = events.filter((event) => event.type === 'buyer_paid');
  return { byKey, refundsByOriginal, linkedRefundEvents, unlinkedRefundEvents, buyerPayments };
}

export function csvPaymentProjection(
  values: CsvPaymentEvent[],
  nowMs = Date.now(),
): CsvPaymentProjection {
  const events = uniqueEvents(values, nowMs);
  const currencies = [...new Set(
    events.filter((event) => event.amountMinor > 0).map((event) => event.currency),
  )];
  const { byKey, linkedRefundEvents, unlinkedRefundEvents, buyerPayments } = linkedEvents(events);
  const amountsByCurrency = Object.fromEntries(
    currencies.map((currency) => {
      const total = (type: CsvPaymentEventType, source?: CsvPaymentSource) =>
        events
          .filter(
            (event) =>
              event.type === type &&
              event.currency === currency &&
              (!source || event.source === source),
          )
          .reduce((sum, event) => sum + event.amountMinor, 0);
      const providerPayoutMinor = total('paid_to_owner', 'provider');
      const payoutAdjustments = linkedRefundEvents
        .filter(
          (event) =>
            event.relatedEventType === 'paid_to_owner' &&
            event.currency === currency &&
            byKey.get(
              `${event.provider}\u0000${event.relatedProviderEventId}`,
            )?.source === 'provider',
        )
        .reduce((sum, event) => sum + event.amountMinor, 0);
      const orderRefunds = linkedRefundEvents
        .filter((event) => event.relatedEventType === 'buyer_paid' && event.currency === currency)
        .reduce((sum, event) => sum + event.amountMinor, 0);
      return [
        currency,
        {
          paidMinor: total('buyer_paid'),
          providerFeeMinor: total('provider_fee'),
          refundedMinor: linkedRefundEvents
            .filter((event) => event.currency === currency)
            .reduce((sum, event) => sum + event.amountMinor, 0),
          ownerPayoutMinor: total('paid_to_owner'),
          verifiedNetMinor: Math.max(
            0,
            providerPayoutMinor - payoutAdjustments,
          ),
          buyerRefundedMinor: orderRefunds,
          payoutAdjustedMinor: payoutAdjustments,
        },
      ];
    }),
  );
  const latestState = events
    .filter((event) =>
      [
        'buyer_paid',
        'payment_failed',
        'payout_available',
        'payout_started',
        'paid_to_owner',
        'disputed',
        'payout_failed',
        'canceled',
      ].includes(event.type),
    )
    .sort(
      (a, b) =>
        a.occurredAt - b.occurredAt ||
        a.provider.localeCompare(b.provider) ||
        a.providerEventId.localeCompare(b.providerEventId),
    )
    .at(-1);
  let status: CsvPaymentProjection['status'] = 'unpaid';
  if (latestState) {
    const stateByType: Partial<Record<CsvPaymentEventType, CsvPaymentProjection['status']>> = {
      buyer_paid: latestState.source === 'manual_verified' ? 'manual_verified' : 'paid_by_buyer',
      payment_failed: 'payment_failed',
      payout_available: latestState.source === 'manual_verified' ? 'manual_verified' : 'available',
      payout_started: latestState.source === 'manual_verified' ? 'manual_verified' : 'payout_pending',
      paid_to_owner: latestState.source === 'manual_verified' ? 'manual_verified' : 'paid_to_owner',
      disputed: 'disputed',
      payout_failed: 'payout_failed',
      canceled: 'canceled',
    };
    status = stateByType[latestState.type] ?? 'unpaid';
  }
  const buyerRefunds = linkedRefundEvents.filter(
    (event) => event.relatedEventType === 'buyer_paid',
  );
  const buyerRefundTotals = new Map<string, number>();
  for (const event of buyerRefunds) {
    const key = `${event.provider}\u0000${event.relatedProviderEventId}`;
    buyerRefundTotals.set(key, (buyerRefundTotals.get(key) ?? 0) + event.amountMinor);
  }
  const buyerOrderEvents = events.filter(
    (event) =>
      (event.type === 'disputed' || event.type === 'canceled') &&
      event.relatedEventType === 'buyer_paid',
  );
  if (buyerOrderEvents.some((event) => event.type === 'disputed')) status = 'disputed';
  else if (buyerOrderEvents.some((event) => event.type === 'canceled')) status = 'canceled';
  else if (
    unlinkedRefundEvents.some((event) => event.relatedEventType === 'buyer_paid')
  ) status = 'payment_review';
  const anyBuyerRefund = [...buyerRefundTotals.values()].some((amount) => amount > 0);
  if (status !== 'disputed' && status !== 'canceled' && anyBuyerRefund) {
    const fullyRefunded = buyerPayments.length > 0 && buyerPayments.every((payment) =>
      (buyerRefundTotals.get(`${payment.provider}\u0000${payment.providerEventId}`) ?? 0) >= payment.amountMinor,
    );
    status = fullyRefunded ? 'refunded' : 'partially_refunded';
  }
  return {
    status,
    currency: currencies.length === 1 ? currencies[0] : null,
    amountsByCurrency,
  };
}

export function csvJstMonth(timestamp: number) {
  if (!Number.isSafeInteger(timestamp) || timestamp < 1)
    throw new Error('PAYMENT_EVENT_TIME');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(timestamp);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) throw new Error('MONTH_JST');
  return `${year}-${month}`;
}

export function csvMonthlyNetForMonth(
  values: CsvPaymentEvent[],
  monthJst: string,
  nowMs = Date.now(),
): CsvMonthlyNet {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthJst)) throw new Error('MONTH_JST');
  const events = uniqueEvents(values, nowMs);
  const { byKey, refundsByOriginal, unlinkedRefundEvents } = linkedEvents(events);
  const payouts = events.filter(
    (event) =>
      event.source === 'provider' &&
      event.type === 'paid_to_owner' &&
      csvJstMonth(event.occurredAt) === monthJst,
  );
  const payoutKeys = new Set(
    payouts.map((event) => `${event.provider}\u0000${event.providerEventId}`),
  );
  const refunds = events.filter(
    (event) =>
      event.type === 'refund' && event.relatedEventType === 'paid_to_owner' &&
      event.relatedProviderEventId &&
      payoutKeys.has(`${event.provider}\u0000${event.relatedProviderEventId}`),
  );
  const currencies = new Set(
    [...payouts, ...refunds].map((event) => event.currency),
  );
  const fxRequired = [...currencies].some((currency) => currency !== 'USD');
  const needsReview = unlinkedRefundEvents.some(
    (event) => event.relatedEventType === 'paid_to_owner',
  ) || [...payoutKeys].some((key) => {
    const payout = byKey.get(key);
    return Boolean(payout && (refundsByOriginal.get(key) ?? 0) > payout.amountMinor);
  });
  const noProviderEvidence = payouts.length === 0;
  const payoutUsd = payouts.reduce((sum, event) => sum + event.amountMinor, 0);
  const refundUsd = refunds.reduce((sum, event) => sum + event.amountMinor, 0);
  return {
    monthJst,
    verifiedNetUsdMinor:
      fxRequired || needsReview || noProviderEvidence
        ? null
        : Math.max(0, payoutUsd - refundUsd),
    evidenceIds: [...payouts, ...refunds, ...unlinkedRefundEvents].map(
      (event) => `${event.provider}:${event.providerEventId}`,
    ),
    fxRequired,
    needsReview,
    noProviderEvidence,
  };
}

export function csvBuyerPaymentQuoteMismatch(
  values: CsvPaymentEvent[],
  quoteMinor: number,
  currency: string,
  nowMs = Date.now(),
) {
  const events = uniqueEvents(values, nowMs);
  const buyerPayments = events.filter((event) => event.type === 'buyer_paid');
  if (buyerPayments.length !== 1) return 'buyer_payment_count';
  const payment = buyerPayments[0];
  if (payment.currency !== currency.toUpperCase()) return 'buyer_payment_currency';
  if (payment.amountMinor !== quoteMinor) return 'buyer_payment_amount';
  return null;
}

const toHex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');

export async function csvPaymentWebhookSignature(
  secret: string,
  timestampSeconds: number,
  body: string,
) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestampSeconds}.${body}`),
  );
  return `t=${timestampSeconds},v1=${toHex(signature)}`;
}

export async function verifyCsvPaymentWebhook(
  secret: string,
  signatureHeader: string | null,
  body: string,
  nowMs = Date.now(),
) {
  if (!secret || !signatureHeader || signatureHeader.length > 256) return false;
  const match = /^t=(\d{1,12}),v1=([a-f0-9]{64})$/i.exec(signatureHeader.trim());
  if (!match) return false;
  const timestamp = Number(match[1]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowMs / 1000 - timestamp) > 300)
    return false;
  const expected = await csvPaymentWebhookSignature(secret, timestamp, body);
  const expectedHex = expected.slice(expected.indexOf('v1=') + 3).toLowerCase();
  const actualHex = match[2].toLowerCase();
  let mismatch = 0;
  for (let index = 0; index < expectedHex.length; index++)
    mismatch |= expectedHex.charCodeAt(index) ^ actualHex.charCodeAt(index);
  return mismatch === 0;
}
