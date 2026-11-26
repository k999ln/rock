import Stripe from 'stripe';
import {
  PlanError,
  type BillingEnv,
  type BillingScope,
  type ComputeBillingProvider,
  type ComputeContract,
  type ComputePlan,
  type ContractSnapshot,
} from './noah-shared-compute-plan.ts';

const objectId = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : value?.id;
const identityError = () =>
  new PlanError('決済サービスの契約と登録内容を照合できません。', 503);
export const scopePrefix = (scope: BillingScope) =>
  scope.mode === 'live' ? 'NOAH_COMPUTE_LIVE_' : 'NOAH_COMPUTE_TEST_';

export async function readComputeOffer(
  env: BillingEnv,
  scope: BillingScope,
): Promise<ComputePlan | null> {
  const prefix = scopePrefix(scope);
  if (
    scope.mode === 'live' &&
    env.NOAH_COMPUTE_LIVE_DEVICE_ACCEPTANCE !== 'approved'
  )
    return null;
  const priceId = env[prefix + 'PRICE_ID'],
    merchant = env[prefix + 'MERCHANT'],
    version = env[prefix + 'TERMS_VERSION'];
  const currency = env[prefix + 'CURRENCY'],
    amountMinor = Number(env[prefix + 'AMOUNT_MINOR']),
    monthlyJobs = Number(env[prefix + 'MONTHLY_JOBS']);
  if (
    typeof priceId !== 'string' ||
    !/^price_[A-Za-z0-9]+$/.test(priceId) ||
    typeof merchant !== 'string' ||
    !merchant.trim() ||
    merchant.length > 160 ||
    typeof version !== 'string' ||
    !/^[A-Za-z0-9._-]{1,64}$/.test(version) ||
    typeof currency !== 'string' ||
    !['JPY', 'USD', 'EUR'].includes(currency) ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0 ||
    !Number.isSafeInteger(monthlyJobs) ||
    monthlyJobs <= 0
  )
    return null;
  // Include material terms in the version compared on POST, even if the operator reuses a label.
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      JSON.stringify([
        scope.mode,
        scope.accountId,
        priceId,
        amountMinor,
        currency,
        merchant,
        monthlyJobs,
        version,
      ]),
    ),
  );
  const hex = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
  return {
    priceId,
    amountMinor,
    currency,
    merchant,
    monthlyJobs,
    termsVersion: version + '.' + hex,
  };
}

export function computeStripeProvider(
  env: BillingEnv,
  scope: BillingScope,
  origin: string,
  injected?: Stripe,
): ComputeBillingProvider {
  const stripe =
    injected ??
    new Stripe(String(env[scopePrefix(scope) + 'STRIPE_KEY']), {
      httpClient: Stripe.createFetchHttpClient(),
      maxNetworkRetries: 1,
      timeout: 12000,
    });
  const live = scope.mode === 'live';
  const returnUrl = new URL('/noah/shared-compute', origin).href;
  let checkedAccount: Promise<void> | undefined;
  async function account() {
    checkedAccount ??= stripe.accounts.retrieve(null).then((account) => {
      if (account.id !== scope.accountId) throw identityError();
    });
    return checkedAccount;
  }
  function checkSession(
    session: Stripe.Checkout.Session,
    row: ComputeContract,
  ) {
    if (
      row.stripe_account !== scope.accountId ||
      row.mode !== scope.mode ||
      session.livemode !== live ||
      session.mode !== 'subscription' ||
      session.metadata?.purpose !== 'noah_shared_compute' ||
      session.client_reference_id !== row.attempt ||
      !row.stripe_customer_id ||
      objectId(session.customer) !== row.stripe_customer_id ||
      (row.session_id && row.session_id !== session.id)
    )
      throw identityError();
    return session;
  }
  function checkPrice(
    price: Stripe.Price,
    id: string,
    amount: number,
    currency: string,
  ) {
    return (
      price.livemode === live &&
      price.id === id &&
      price.unit_amount === amount &&
      price.currency === currency.toLowerCase() &&
      price.billing_scheme === 'per_unit' &&
      price.tax_behavior === 'inclusive' &&
      price.type === 'recurring' &&
      price.recurring?.interval === 'month' &&
      price.recurring.interval_count === 1 &&
      price.recurring.usage_type === 'licensed' &&
      !price.transform_quantity
    );
  }
  async function paidCharge(invoice: Stripe.Invoice, row: ComputeContract) {
    const currency = row.currency.toLowerCase();
    if (
      invoice.status !== 'paid' ||
      invoice.livemode !== live ||
      invoice.total !== row.amount_minor ||
      invoice.amount_paid !== row.amount_minor ||
      invoice.currency !== currency ||
      invoice.amount_remaining !== 0
    )
      return null;
    const payments = await stripe.invoicePayments.list({
      invoice: invoice.id,
      status: 'paid',
      limit: 2,
      expand: [
        'data.payment.payment_intent.latest_charge',
        'data.payment.charge',
      ],
    });
    if (payments.has_more || payments.data.length !== 1) return null;
    const entry = payments.data[0];
    if (
      entry.livemode !== live ||
      objectId(entry.invoice) !== invoice.id ||
      entry.currency !== currency ||
      entry.amount_paid !== row.amount_minor
    )
      return null;
    const intent = entry.payment.payment_intent;
    const charge =
      entry.payment.type === 'payment_intent' &&
      intent &&
      typeof intent === 'object' &&
      intent.status === 'succeeded'
        ? intent.latest_charge
        : entry.payment.type === 'charge'
          ? entry.payment.charge
          : null;
    if (
      !charge ||
      typeof charge === 'string' ||
      charge.livemode !== live ||
      !charge.paid ||
      !charge.captured ||
      charge.status !== 'succeeded' ||
      charge.currency !== currency ||
      charge.amount_captured !== row.amount_minor
    )
      return null;
    const held = { id: charge.id, verified: false };
    if (charge.refunded || charge.amount_refunded) return held;
    if (charge.disputed) {
      const disputes = await stripe.disputes.list({
        charge: charge.id,
        limit: 10,
      });
      if (
        !disputes.data.length ||
        disputes.has_more ||
        disputes.data.some(
          (d) => d.status !== 'won' && d.status !== 'warning_closed',
        )
      )
        return held;
    }
    const warnings = await stripe.radar.earlyFraudWarnings.list({
      charge: charge.id,
      limit: 10,
    });
    if (warnings.has_more || warnings.data.some((w) => w.actionable))
      return held;
    return { id: charge.id, verified: true };
  }

  return {
    async validatePrice(plan) {
      await account();
      const price = await stripe.prices.retrieve(plan.priceId);
      if (
        !price.active ||
        !checkPrice(price, plan.priceId, plan.amountMinor, plan.currency)
      )
        throw identityError();
    },
    async customer(row) {
      await account();
      const created = await stripe.customers.create(
        { metadata: { purpose: 'noah_shared_compute', attempt: row.attempt } },
        { idempotencyKey: 'noah-compute-customer:' + row.attempt },
      );
      if (created.livemode !== live || !created.id) throw identityError();
      return created.id;
    },
    async checkout(row) {
      await account();
      if (!row.stripe_customer_id) throw identityError();
      let session: Stripe.Checkout.Session;
      if (row.session_id)
        session = await stripe.checkout.sessions.retrieve(row.session_id);
      else if (Date.now() - row.created_at >= 23 * 3600_000) {
        // This customer was durably bound before the first Checkout call, and is dedicated to this attempt.
        const matches = await stripe.checkout.sessions.list({
          customer: row.stripe_customer_id,
          limit: 2,
        });
        if (matches.has_more || matches.data.length > 1) throw identityError();
        const found = matches.data[0];
        if (!found && Date.now() - row.created_at < 25 * 3600_000)
          throw new PlanError(
            '前回のお申込みを照合中です。しばらくしてからお試しください。',
            409,
          );
        if (!found)
          throw new PlanError(
            '前回のお申込みは期限切れです。もう一度お試しください。',
            410,
          );
        session = found;
      } else {
        session = await stripe.checkout.sessions.create(
          {
            mode: 'subscription',
            customer: row.stripe_customer_id,
            adaptive_pricing: { enabled: false },
            currency: row.currency.toLowerCase(),
            line_items: [{ price: row.price_id, quantity: 1 }],
            client_reference_id: row.attempt,
            metadata: { purpose: 'noah_shared_compute' },
            subscription_data: {
              metadata: {
                purpose: 'noah_shared_compute',
                attempt: row.attempt,
              },
            },
            success_url: returnUrl,
            cancel_url: returnUrl,
            expires_at: Math.floor(row.created_at / 1000) + 86300,
            integration_identifier: 'noah_shared_compute_dxmqvazp',
          },
          { idempotencyKey: 'noah-compute:' + row.attempt },
        );
      }
      checkSession(session, row);
      if (
        session.status === 'open' &&
        (session.amount_total !== row.amount_minor ||
          session.currency !== row.currency.toLowerCase())
      )
        throw identityError();
      if (session.status !== 'open')
        return { sessionId: session.id, url: null };
      if (
        !session.url ||
        new URL(session.url).origin !== 'https://checkout.stripe.com'
      )
        throw identityError();
      return { sessionId: session.id, url: session.url };
    },
    async inspect(row) {
      await account();
      const session = checkSession(
        await stripe.checkout.sessions.retrieve(row.session_id!),
        row,
      );
      const subscriptionId = objectId(session.subscription) ?? null;
      const state: ContractSnapshot = {
        sessionId: session.id,
        subscriptionId,
        chargeId: null,
        status: 'inactive',
        closed: false,
        renewalStopped: false,
        periodStart: null,
        periodEnd: null,
      };
      if (session.status === 'expired') return { ...state, closed: true };
      if (session.status !== 'complete' || !subscriptionId)
        return { ...state, status: 'pending' };
      const sub = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['latest_invoice'],
      });
      if (
        sub.livemode !== live ||
        sub.metadata.purpose !== 'noah_shared_compute' ||
        sub.metadata.attempt !== row.attempt ||
        sub.id !== subscriptionId ||
        (row.subscription_id && row.subscription_id !== sub.id) ||
        objectId(session.customer) !== objectId(sub.customer)
      )
        throw identityError();
      state.renewalStopped = Boolean(
        sub.cancel_at_period_end || sub.cancel_at || sub.status === 'canceled',
      );
      if (sub.status === 'canceled' || sub.status === 'incomplete_expired')
        return { ...state, closed: true };
      if (
        sub.status !== 'active' ||
        sub.pause_collection ||
        sub.items.has_more ||
        sub.items.data.length !== 1
      )
        return state;
      const item = sub.items.data[0],
        invoice = sub.latest_invoice;
      if (
        item.quantity !== 1 ||
        !checkPrice(item.price, row.price_id, row.amount_minor, row.currency) ||
        !invoice ||
        typeof invoice === 'string' ||
        objectId(invoice.parent?.subscription_details?.subscription) !==
          sub.id ||
        invoice.lines.has_more ||
        invoice.lines.data.length !== 1
      )
        return state;
      const line = invoice.lines.data[0];
      if (
        objectId(line.pricing?.price_details?.price) !== row.price_id ||
        line.period.start !== item.current_period_start ||
        line.period.end !== item.current_period_end ||
        line.period.end <= line.period.start
      )
        return state;
      const charge = await paidCharge(invoice, row);
      if (!charge?.verified) return { ...state, chargeId: charge?.id ?? null };
      return {
        ...state,
        status: sub.cancel_at_period_end || sub.cancel_at ? 'ending' : 'active',
        chargeId: charge.id,
        periodStart: line.period.start * 1000,
        periodEnd:
          Math.min(line.period.end, sub.cancel_at ?? line.period.end) * 1000,
      };
    },
    async cancel(row) {
      await account();
      if (
        !row.subscription_id ||
        row.mode !== scope.mode ||
        row.stripe_account !== scope.accountId
      )
        throw identityError();
      const updated = await stripe.subscriptions.update(
        row.subscription_id,
        { cancel_at_period_end: true },
        {
          idempotencyKey:
            'noah-compute-end:' + row.attempt + ':' + row.revision,
        },
      );
      if (
        updated.id !== row.subscription_id ||
        updated.livemode !== live ||
        (!updated.cancel_at_period_end &&
          !updated.cancel_at &&
          updated.status !== 'canceled')
      )
        throw identityError();
    },
  };
}
