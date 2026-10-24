import { stripeRequest } from '../shared/stripe.mjs';
import { sha256Hex } from './rockstar-entitlement-claim.ts';
import {
  LinuxServiceError,
  parseLinuxTerms,
  type LinuxTerms,
  type LinuxWorkspace,
  type LinuxInvoice,
  type LinuxEvent,
} from './sky-linux-service.ts';

type StripeObject = Record<string, unknown>;
type ProviderInvoice = StripeObject & {
  id: string;
  metadata: Record<string, string>;
  customer: string;
  currency: string;
  livemode: boolean;
  status: string;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  total: number;
  hosted_invoice_url: string | null;
  payments?: {
    data: {
      status: string;
      amount_paid: number;
      payment: { type: string; payment_intent?: string };
    }[];
    has_more: boolean;
  };
};
export type LinuxBillingConfig = {
  secretKey: string;
  mode: 'test' | 'live';
  customerId: string;
};
const check = (condition: unknown, message: string) => {
  if (!condition) throw new LinuxServiceError(message);
};
/** Reuses the canonical Stripe transport. No amount, customer or recipient comes from the browser. */
export function linuxStripeBilling(
  config: LinuxBillingConfig,
  fetcher: typeof fetch = fetch,
) {
  const call = (
    path: string,
    method: 'GET' | 'POST',
    parameters: Record<string, unknown> = {},
    idempotencyKey?: string,
  ) =>
    stripeRequest({
      path,
      method,
      parameters,
      idempotencyKey,
      secretKey: config.secretKey,
      apiVersion: '2026-08-26.dahlia',
      fetchImpl: fetcher,
    });
  async function verify(
    invoice: ProviderInvoice,
    w: LinuxWorkspace,
    i: LinuxInvoice,
  ) {
    check(
      invoice.customer === config.customerId &&
        invoice.metadata.sky_linux_workspace === w.id &&
        invoice.metadata.sky_linux_invoice === i.id &&
        invoice.metadata.contract_digest === w.contractDigest &&
        invoice.currency === 'usd' &&
        invoice.livemode === (config.mode === 'live'),
      '請求書の本人・契約・通貨が一致しません。',
    );
    check(
      invoice.total === i.amountMinor && invoice.amount_due === i.amountMinor,
      '請求書の金額が確定使用量と一致しません。',
    );
    return invoice;
  }
  const event = (
    w: LinuxWorkspace,
    kind: LinuxEvent['kind'],
    payload: Record<string, unknown>,
  ): LinuxEvent => ({
    schema: 'sky.linux-event/1',
    id: crypto.randomUUID(),
    workspaceId: w.id,
    issuedAt: Date.now(),
    kind,
    payload,
  });
  return {
    /** Durable collection binding must be committed before finalization/collection. */
    async prepare(w: LinuxWorkspace, i: LinuxInvoice) {
      check(i.state === 'open', '未入金の請求書を選んでください。');
      if (i.providerInvoiceId) {
        const current = await verify(
          (await call(
            `/v1/invoices/${i.providerInvoiceId}`,
            'GET',
          )) as ProviderInvoice,
          w,
          i,
        );
        return event(w, 'collection', {
          invoiceId: i.id,
          providerInvoiceId: current.id,
          collectionUrl: current.hosted_invoice_url,
          amountMinor: i.amountMinor,
          currency: 'USD',
        });
      }
      check(
        i.collectionRequestedAt &&
          Date.now() - i.collectionRequestedAt < 20 * 3600000,
        '結果不明の古い請求書は提供元で照合してください。',
      );
      const key = await sha256Hex(
        `sky-linux-invoice:${config.mode}:${i.id}:${w.contractDigest}`,
      );
      const draft = (await call(
        '/v1/invoices',
        'POST',
        {
          customer: config.customerId,
          currency: 'usd',
          auto_advance: false,
          collection_method: 'charge_automatically',
          pending_invoice_items_behavior: 'exclude',
          metadata: {
            sky_linux_workspace: w.id,
            sky_linux_invoice: i.id,
            contract_digest: w.contractDigest,
          },
        },
        `sky-linux-invoice:${key}`,
      )) as ProviderInvoice;
      check(/^in_[A-Za-z0-9]+$/.test(draft.id), '請求書IDを確認できません。');
      const lines = [
        ['Sky Linux 16 / ' + i.period, i.baseMinor],
        ['Linux CPU usage', i.computeMinor],
        ['Sky Agent usage', i.authorMinor],
      ] as const;
      for (const [index, [description, amount]] of lines.entries())
        if (amount > 0)
          await call(
            '/v1/invoiceitems',
            'POST',
            {
              customer: config.customerId,
              invoice: draft.id,
              currency: 'usd',
              amount,
              description,
            },
            `sky-linux-line:${key}:${index}`,
          );
      const result = await verify(
        (await call(`/v1/invoices/${draft.id}`, 'GET')) as ProviderInvoice,
        w,
        i,
      );
      return event(w, 'collection', {
        invoiceId: i.id,
        providerInvoiceId: result.id,
        collectionUrl: null,
        amountMinor: i.amountMinor,
        currency: 'USD',
      });
    },
    async finalize(w: LinuxWorkspace, i: LinuxInvoice) {
      check(i.providerInvoiceId, '請求書の保存を先に完了してください。');
      const current = await verify(
        (await call(
          `/v1/invoices/${i.providerInvoiceId}`,
          'GET',
        )) as ProviderInvoice,
        w,
        i,
      );
      const final =
        current.status === 'draft'
          ? ((await call(
              `/v1/invoices/${i.providerInvoiceId}/finalize`,
              'POST',
              { auto_advance: true },
              `sky-linux-finalize:${i.providerInvoiceId}`,
            )) as ProviderInvoice)
          : current;
      await verify(final, w, i);
      return event(w, 'collection', {
        invoiceId: i.id,
        providerInvoiceId: final.id,
        collectionUrl: final.hosted_invoice_url,
        amountMinor: i.amountMinor,
        currency: 'USD',
      });
    },
    async reconcile(w: LinuxWorkspace, i: LinuxInvoice) {
      check(i.providerInvoiceId, '請求書がまだ発行されていません。');
      const invoice = await verify(
        (await call(`/v1/invoices/${i.providerInvoiceId}`, 'GET', {
          'expand[0]': 'payments',
        })) as ProviderInvoice,
        w,
        i,
      );
      if (
        invoice.status !== 'paid' ||
        invoice.amount_paid !== i.amountMinor ||
        invoice.amount_remaining !== 0
      )
        return null;
      const payments = invoice.payments;
      check(
        payments && !payments.has_more && payments.data.length === 1,
        '入金の分割・不足・結果不明を照合してください。',
      );
      const payment = payments!.data[0];
      check(
        payment.status === 'paid' &&
          payment.amount_paid === i.amountMinor &&
          payment.payment.type === 'payment_intent' &&
          /^pi_[A-Za-z0-9]+$/.test(payment.payment.payment_intent ?? ''),
        '実入金の証拠を確認できません。',
      );
      const intent = await call(
        `/v1/payment_intents/${payment.payment.payment_intent}`,
        'GET',
        { 'expand[0]': 'latest_charge' },
      );
      const charge = intent.latest_charge as StripeObject;
      check(
        intent.customer === config.customerId &&
          intent.status === 'succeeded' &&
          intent.id === payment.payment.payment_intent &&
          intent.amount_received === i.amountMinor &&
          intent.currency === 'usd' &&
          intent.livemode === (config.mode === 'live') &&
          charge &&
          charge.paid === true &&
          charge.payment_intent === intent.id &&
          charge.amount === i.amountMinor &&
          charge.currency === 'usd' &&
          charge.livemode === (config.mode === 'live') &&
          typeof charge.id === 'string',
        '決済と請求書の実入金が一致しません。',
      );
      const reversed =
        charge.refunded === true ||
        Number(charge.amount_refunded) > 0 ||
        charge.disputed === true;
      if (
        i.state === (reversed ? 'reversed' : 'paid') &&
        i.paymentRef === charge.id
      )
        return null;
      return event(w, 'payment', {
        invoiceId: i.id,
        sequence: i.paymentSequence + 1,
        amountMinor: i.amountMinor,
        currency: 'USD',
        state: reversed ? 'reversed' : 'paid',
        paymentRef: charge.id,
      });
    },
    async transfer(
      w: LinuxWorkspace,
      i: LinuxInvoice,
      creatorId: string,
      accountId: string,
    ) {
      const allocation = i.allocations.find((a) => a.creatorId === creatorId);
      check(
        allocation &&
          allocation.payableMinor > 0 &&
          !allocation.transferRef &&
          i.state === 'paid' &&
          /^ch_[A-Za-z0-9]+$/.test(i.paymentRef ?? '') &&
          /^acct_[A-Za-z0-9]+$/.test(accountId),
        '入金済みの作者精算を選んでください。',
      );
      check(
        allocation?.transferRequestedAt &&
          Date.now() - allocation.transferRequestedAt < 20 * 3600000,
        '結果不明の古い送金は提供元で照合してください。',
      );
      const charge = await call(`/v1/charges/${i.paymentRef}`, 'GET');
      check(
        charge.paid === true &&
          charge.amount_refunded === 0 &&
          charge.disputed === false &&
          charge.currency === 'usd' &&
          charge.livemode === (config.mode === 'live'),
        '入金が返金・異議状態です。',
      );
      const accountUrl = new URL(
        `https://api.stripe.com/v2/core/accounts/${accountId}`,
      );
      accountUrl.searchParams.set('include[0]', 'configuration.recipient');
      const response = await fetcher(accountUrl.href, {
        method: 'GET',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          'Stripe-Version': '2026-08-26.dahlia',
        },
        signal: AbortSignal.timeout(15000),
      });
      const raw = await response.text();
      check(
        response.ok && raw.length <= 100000,
        '作者の受取口座を確認できません。',
      );
      const account = JSON.parse(raw);
      check(
        account.id === accountId &&
          account.configuration?.recipient?.capabilities?.stripe_balance
            ?.stripe_transfers?.status === 'active',
        '作者の受取能力が有効ではありません。',
      );
      const key = await sha256Hex(
        `sky-linux-transfer:${config.mode}:${i.id}:${creatorId}`,
      );
      const result = await call(
        '/v1/transfers',
        'POST',
        {
          amount: allocation!.payableMinor,
          currency: 'usd',
          destination: accountId,
          source_transaction: i.paymentRef,
          transfer_group: `sky_linux_${w.id}`,
          metadata: { sky_linux_invoice: i.id, creator_id: creatorId },
        },
        `sky-linux-transfer:${key}`,
      );
      check(
        typeof result.id === 'string' &&
          /^tr_[A-Za-z0-9]+$/.test(result.id) &&
          result.amount === allocation!.payableMinor &&
          result.currency === 'usd' &&
          result.destination === accountId &&
          result.source_transaction === i.paymentRef &&
          result.livemode === (config.mode === 'live'),
        '作者送金の結果が一致しません。',
      );
      return event(w, 'transfer', {
        invoiceId: i.id,
        creatorId,
        amountMinor: allocation!.payableMinor,
        currency: 'USD',
        paymentRef: i.paymentRef,
        transferRef: result.id,
      });
    },
    async reverse(w: LinuxWorkspace, i: LinuxInvoice, creatorId: string) {
      const a = i.allocations.find((a) => a.creatorId === creatorId);
      check(
        i.state === 'reversed' && a?.transferRef && a.recoveryRequired,
        '取消対象の作者送金がありません。',
      );
      const result = await call(
        `/v1/transfers/${a!.transferRef}/reversals`,
        'POST',
        { amount: a!.payableMinor },
        `sky-linux-reversal:${await sha256Hex(i.id + ':' + creatorId)}`,
      );
      check(
        result.amount === a!.payableMinor &&
          result.transfer === a!.transferRef &&
          result.currency === 'usd',
        '作者送金の取消を確認できません。',
      );
      return event(w, 'transfer', {
        state: 'reversed',
        invoiceId: i.id,
        creatorId,
        amountMinor: a!.payableMinor,
        currency: 'USD',
        transferRef: a!.transferRef,
      });
    },
  };
}


/** Contract preview only: no reservation, invoice, collection or ledger mutation. */
export type LinuxBillingPolicy = {
  offerId: string;
  priceVersion: string;
  contractTextSha256: string | null;
  timezone: string | null;
  billingDay: number | null;
  proration: string | null;
  tax: string | null;
  externalCosts: string | null;
  byok: string | null;
  // Unset categories remain pending; an explicitly empty list means none agreed.
  additionalMeters: {
    category: 'product' | 'telecom' | 'cloud_ai' | 'tool' | 'oss' | 'byok';
    meter: string;
    unit: string;
    included: number;
    unitMinor: number;
    rounding: 'ceil_unit';
  }[] | null;
  jobCapMinor: number | null;
};
export type LinuxContractSnapshot = {
  schema: 'sky.linux-billing-snapshot/1';
  product: 'sky-linux-16';
  provenance: 'existing-linux-terms';
  ownerId: string;
  contractId: string;
  contractDigest: string;
  currency: 'USD';
  minorDigits: 2;
  cpuRounding: 'ceil_minor';
  terms: LinuxTerms;
  start: { state: 'legacy' | 'pending' | 'started'; at: number | null };
  policy: LinuxBillingPolicy;
  status: 'pending_owner_terms' | 'defined';
};
export type LinuxContractEnvelope = { snapshot: LinuxContractSnapshot; digest: string };
function contractText(value: unknown): string {
  check(typeof value === 'string' && value.length > 0 && value.length <= 1000 && value.trim() === value,
    '契約の識別子・条件を確認してください。');
  return value as string;
}
function contractMinor(value: unknown): number {
  check(Number.isSafeInteger(value) && Number(value) >= 0, '契約の整数金額・数量を確認してください。');
  return value as number;
}
function contractHash(value: unknown): string {
  check(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), '契約digestを確認してください。');
  return value as string;
}
function canonicalContract(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + Array.from(value, canonicalContract).join(',') + ']';
  check(typeof value === 'object' && value !== null, '契約snapshotの形式が不正です。');
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonicalContract(record[key])).join(',') + '}';
}
function freezeContract<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeContract(child);
    Object.freeze(value);
  }
  return value;
}
/** Call with server-owned accepted terms. A digest alone is not consent or readiness. */
export async function makeLinuxContractSnapshot(
  workspace: Pick<LinuxWorkspace, 'id' | 'ownerId' | 'contractDigest' | 'terms' | 'serviceStartAt'>,
  policy: LinuxBillingPolicy,
): Promise<LinuxContractEnvelope> {
  const terms = parseLinuxTerms(workspace.terms);
  const nullableText = (value: unknown) => value === null ? null : contractText(value);
  const timezone = nullableText(policy.timezone);
  if (timezone !== null) {
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }); }
    catch { throw new LinuxServiceError('契約timezoneを確認してください。'); }
  }
  const billingDay = policy.billingDay === null ? null : contractMinor(policy.billingDay);
  check(billingDay === null || (billingDay >= 1 && billingDay <= 28), '締日1〜28または未確定を指定してください。');
  const jobCapMinor = policy.jobCapMinor === null ? null : contractMinor(policy.jobCapMinor);
  check(jobCapMinor === null || jobCapMinor <= terms.monthlyCapMinor, 'job上限が月間上限を超えています。');
  check(policy.additionalMeters === null || Array.isArray(policy.additionalMeters), '追加meterを確認してください。');
  const seen = new Set<string>();
  const additionalMeters = policy.additionalMeters === null ? null : policy.additionalMeters.map(meter => {
    check(['product', 'telecom', 'cloud_ai', 'tool', 'oss', 'byok'].includes(meter.category) && meter.rounding === 'ceil_unit', 'meter区分・丸めを確認してください。');
    const key = contractText(meter.category) + ':' + contractText(meter.meter);
    check(!seen.has(key), '同一meterが重複しています。'); seen.add(key);
    return { category: meter.category, meter: meter.meter, unit: contractText(meter.unit), included: contractMinor(meter.included), unitMinor: contractMinor(meter.unitMinor), rounding: meter.rounding };
  });
  const fixedPolicy: LinuxBillingPolicy = {
    offerId: contractText(policy.offerId), priceVersion: contractText(policy.priceVersion),
    contractTextSha256: policy.contractTextSha256 === null ? null : contractHash(policy.contractTextSha256),
    timezone, billingDay, proration: nullableText(policy.proration), tax: nullableText(policy.tax),
    externalCosts: nullableText(policy.externalCosts), byok: nullableText(policy.byok), additionalMeters, jobCapMinor,
  };
  const start = workspace.serviceStartAt;
  if (start !== null && start !== undefined) {
    contractMinor(start);
    check(!Number.isNaN(new Date(start).getTime()), '起算時刻を確認してください。');
  }
  const snapshot: LinuxContractSnapshot = {
    schema: 'sky.linux-billing-snapshot/1', product: 'sky-linux-16', provenance: 'existing-linux-terms',
    ownerId: contractText(workspace.ownerId), contractId: contractText(workspace.id),
    contractDigest: contractHash(workspace.contractDigest), currency: 'USD', minorDigits: 2, cpuRounding: 'ceil_minor', terms,
    start: { state: start === undefined ? 'legacy' : start === null ? 'pending' : 'started', at: start ?? null },
    policy: fixedPolicy,
    status: Object.values(fixedPolicy).some(value => value === null) ? 'pending_owner_terms' : 'defined',
  };
  return freezeContract({ snapshot, digest: await sha256Hex(canonicalContract(snapshot)) });
}
/** expectedDigest must come from authenticated saved consent, never the submitted envelope. */
export async function verifyLinuxContractSnapshot(
  envelope: LinuxContractEnvelope,
  expected: { ownerId: string; contractId: string; contractDigest: string; digest: string },
): Promise<LinuxContractSnapshot> {
  // A submitted object may change while hashing. Verify only detached input.
  ({ envelope, expected } = structuredClone({ envelope, expected }));
  const s = envelope.snapshot;
  check(s && s.start && ['legacy', 'pending', 'started'].includes(s.start.state), '契約snapshotが不正です。');
  check(s.start.state === 'started' ? s.start.at !== null : s.start.at === null, '起算状態と時刻が一致しません。');
  const rebuilt = await makeLinuxContractSnapshot({ id: s.contractId, ownerId: s.ownerId, contractDigest: s.contractDigest, terms: s.terms,
    serviceStartAt: s.start.state === 'legacy' ? undefined : s.start.at }, s.policy);
  check(canonicalContract(s) === canonicalContract(rebuilt.snapshot) && envelope.digest === rebuilt.digest &&
    contractHash(expected.digest) === rebuilt.digest && s.ownerId === expected.ownerId &&
    s.contractId === expected.contractId && s.contractDigest === expected.contractDigest,
  '保存済みの本人・契約・料金版・snapshot digestが一致しません。');
  return rebuilt.snapshot;
}
/** A deterministic base-line identity, not a persisted once-only charge or a full invoice. */
export async function previewLinuxContractMonth(
  envelope: LinuxContractEnvelope,
  expected: Parameters<typeof verifyLinuxContractSnapshot>[1],
  period: string,
  budget: { usedMinor: number; reservedMinor: number; requestedMaxMinor: number },
) {
  ({ envelope, expected, budget } = structuredClone({ envelope, expected, budget }));
  const snapshot = await verifyLinuxContractSnapshot(envelope, expected);
  check(/^20\d\d-(0[1-9]|1[0-2])$/.test(period), '月をYYYY-MM形式で指定してください。');
  for (const value of Object.values(budget)) contractMinor(value);
  const total = BigInt(budget.usedMinor) + BigInt(budget.reservedMinor) + BigInt(budget.requestedMaxMinor);
  check(total <= BigInt(snapshot.terms.monthlyCapMinor) && snapshot.policy.jobCapMinor !== null &&
    budget.requestedMaxMinor <= snapshot.policy.jobCapMinor, '承認済みの月間・job予算を超えています。');
  const until = new Date(period + '-01T00:00:00Z'); until.setUTCMonth(until.getUTCMonth() + 1);
  const eligible = snapshot.status === 'defined' && snapshot.start.state === 'started' &&
    typeof snapshot.start.at === 'number' && snapshot.start.at < until.getTime() && snapshot.policy.timezone === 'UTC' && snapshot.policy.proration === 'full_month';
  // Other timezone/proration policies require the shared period/Invoice implementation.
  return freezeContract({ contractId: snapshot.contractId, period, currency: snapshot.currency,
    baseLineKey: await sha256Hex(canonicalContract({ ownerId: snapshot.ownerId, contractId: snapshot.contractId, period, currency: snapshot.currency })),
    state: eligible ? 'preview_only' as const : 'pending' as const,
    baseMinor: eligible ? snapshot.terms.baseMinor : null, snapshotDigest: envelope.digest,
    reservationCreated: false as const, invoiceCreated: false as const, collectionEnabled: false as const });
}
