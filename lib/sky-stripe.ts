import { marketplaceCommissionMinor } from './sky-marketplace-policy.ts';

export class SkyPaymentError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'SkyPaymentError';
    this.status = status;
  }
}

export type SkyStripeConfig = {
  secretKey: string;
  webhookSecret: string;
  origin: string;
  mode: 'test' | 'live';
};

export interface StripeAccount {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  capabilities?: Record<string, string>;
}

export interface StripeCharge {
  id: string;
  amount?: number;
  amount_refunded?: number;
  refunded?: boolean;
  disputed?: boolean;
  paid?: boolean;
  currency?: string;
  livemode?: boolean;
  payment_intent?: string | StripePaymentIntent | null;
  application_fee?: string | { id: string } | null;
  transfer?: string | { id: string } | null;
  receipt_url?: string | null;
  metadata?: Record<string, string>;
}

export interface StripePaymentIntent {
  id: string;
  amount?: number;
  amount_received?: number;
  currency?: string;
  status?: string;
  livemode?: boolean;
  application_fee_amount?: number | null;
  transfer_data?: {
    destination?: string | { id: string };
    amount?: number;
  } | null;
  metadata?: Record<string, string>;
  latest_charge?: string | StripeCharge | null;
}

export interface StripeCheckoutSession {
  id: string;
  url?: string | null;
  mode?: string;
  livemode?: boolean;
  status?: string | null;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
  payment_intent?: string | StripePaymentIntent | null;
}

export interface StripeRefund {
  id: string;
  status?: string | null;
  amount?: number;
  currency?: string;
  payment_intent?: string | StripePaymentIntent | null;
  charge?: string | StripeCharge | null;
}

export type SkyStripeOrder = {
  id: string;
  packageKey: string;
  name: string;
  amountMinor: number;
  currency: string;
  commissionMinor: number;
  accountId: string;
};

export const SKY_STRIPE_API_VERSION = '2026-08-26.dahlia';
const STRIPE_API_ORIGIN = 'https://api.stripe.com';
const REQUEST_TIMEOUT_MS = 15_000;
const CONFIG_ERROR = '決済の接続設定が完了していません。';
const PROVIDER_ERROR =
  '決済サービスとの通信に失敗しました。時間をおいてもう一度お試しください。';

export function readSkyStripeConfig(
  env: Record<string, unknown>,
): SkyStripeConfig {
  const mode = env.SKY_PAYMENTS_MODE;
  const secretKey = env.SKY_STRIPE_SECRET_KEY;
  const webhookSecret = env.SKY_STRIPE_WEBHOOK_SECRET;
  const originValue = env.SKY_PAYMENT_ORIGIN;
  if (
    (mode !== 'test' && mode !== 'live') ||
    typeof secretKey !== 'string' ||
    !new RegExp(`^(sk|rk)_${mode}_[A-Za-z0-9]+$`).test(secretKey) ||
    typeof webhookSecret !== 'string' ||
    !/^whsec_[A-Za-z0-9]+$/.test(webhookSecret) ||
    typeof originValue !== 'string'
  ) {
    throw new SkyPaymentError(CONFIG_ERROR, 503);
  }
  let origin: URL;
  try {
    origin = new URL(originValue);
  } catch {
    throw new SkyPaymentError(CONFIG_ERROR, 503);
  }
  const localTest =
    mode === 'test' && ['localhost', '127.0.0.1'].includes(origin.hostname);
  if (
    (origin.protocol !== 'https:' &&
      !(localTest && origin.protocol === 'http:')) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/'
  ) {
    throw new SkyPaymentError(CONFIG_ERROR, 503);
  }
  return { mode, secretKey, webhookSecret, origin: origin.origin };
}

function stripeId(value: string, prefix: string): string {
  if (
    typeof value !== 'string' ||
    !new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(value) ||
    value.length > 255
  ) {
    throw new SkyPaymentError('決済情報を確認できません。', 400);
  }
  return value;
}

function validateStripeRedirect(value: unknown, hostname: string): string {
  let url: URL;
  try {
    if (typeof value !== 'string') throw new Error();
    url = new URL(value);
  } catch {
    throw new SkyPaymentError(PROVIDER_ERROR, 502);
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== hostname ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new SkyPaymentError(PROVIDER_ERROR, 502);
  }
  return url.href;
}

function validateIdempotencyKey(value: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,255}$/.test(value)) {
    throw new SkyPaymentError('決済リクエストを確認できません。', 400);
  }
  return value;
}

/** Server-side only. The caller owns authentication, persisted orders and fulfillment. */
export function skyStripe(
  config: SkyStripeConfig,
  fetcher: typeof fetch = fetch,
) {
  // Revalidate even when a caller constructs the config instead of using the env reader.
  const validated = readSkyStripeConfig({
    SKY_PAYMENTS_MODE: config.mode,
    SKY_STRIPE_SECRET_KEY: config.secretKey,
    SKY_STRIPE_WEBHOOK_SECRET: config.webhookSecret,
    SKY_PAYMENT_ORIGIN: config.origin,
  });

  async function request<T extends object>(
    path: string,
    method: 'GET' | 'POST',
    parameters: Record<string, string> = {},
    idempotencyKey?: string,
  ): Promise<T> {
    const fields = new URLSearchParams(parameters);
    const url = new URL(path, STRIPE_API_ORIGIN);
    if (method === 'GET') url.search = fields.toString();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${validated.secretKey}`,
      'Stripe-Version': SKY_STRIPE_API_VERSION,
    };
    if (idempotencyKey !== undefined)
      headers['Idempotency-Key'] = validateIdempotencyKey(idempotencyKey);
    if (method === 'POST')
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    try {
      const response = await fetcher(url.href, {
        method,
        headers,
        body: method === 'POST' ? fields.toString() : undefined,
        // Workers implements manual/follow only. Non-2xx responses below remain rejected.
        // Never follow a redirect carrying the payment credential.
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        // Keep provider diagnostics useful without recording submitted data or messages.
        const requestId = response.headers.get('request-id');
        const knownCodes = new Set([
          'api_key_expired', 'invalid_api_key', 'account_invalid',
          'amount_too_small', 'parameter_unknown', 'parameter_invalid_integer',
          'rate_limit', 'idempotency_key_in_use', 'platform_account_required',
        ]);
        let code = 'unclassified';
        try {
          const body = await response.json() as { error?: { code?: unknown } };
          if (typeof body.error?.code === 'string' && knownCodes.has(body.error.code))
            code = body.error.code;
        } catch { /* Non-JSON errors still retain the HTTP status. */ }
        console.error('[sky-stripe] provider_response', {
          status: response.status,
          operation: path.startsWith('/v1/checkout/sessions') ? 'checkout' : 'payment-api',
          code,
          requestId: requestId && /^req_[A-Za-z0-9]{1,100}$/.test(requestId) ? requestId : null,
        });
        throw new SkyPaymentError(PROVIDER_ERROR, 502);
      }
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new SkyPaymentError(PROVIDER_ERROR, 502);
      }
      return result as T;
    } catch (error) {
      // Provider messages can include submitted data. Never return or log them.
      if (!(error instanceof SkyPaymentError)) {
        console.error('[sky-stripe] transport_failure', {
          kind: error instanceof Error && ['TimeoutError', 'AbortError', 'SyntaxError'].includes(error.name)
            ? error.name : 'network-or-response',
        });
      }
      throw new SkyPaymentError(PROVIDER_ERROR, 502);
    }
  }

  function validateResultId<T extends { id: string }>(
    result: T,
    prefix: string,
  ): T {
    try {
      stripeId(result.id, prefix);
      return result;
    } catch {
      throw new SkyPaymentError(PROVIDER_ERROR, 502);
    }
  }

  return {
    async createAccount(idempotencyKey: string): Promise<StripeAccount> {
      return validateResultId(
        await request<StripeAccount>(
          '/v1/accounts',
          'POST',
          {
            'controller[fees][payer]': 'application',
            'controller[losses][payments]': 'application',
            'controller[stripe_dashboard][type]': 'express',
          },
          validateIdempotencyKey(idempotencyKey),
        ),
        'acct',
      );
    },
    async retrieveAccount(id: string): Promise<StripeAccount> {
      return validateResultId(
        await request<StripeAccount>(
          `/v1/accounts/${stripeId(id, 'acct')}`,
          'GET',
        ),
        'acct',
      );
    },
    async createAccountLink(accountId: string): Promise<{ url: string }> {
      const result = await request<{ url: string }>(
        '/v1/account_links',
        'POST',
        {
          account: stripeId(accountId, 'acct'),
          type: 'account_onboarding',
          return_url: `${validated.origin}/sky/sell`,
          refresh_url: `${validated.origin}/sky/sell?onboarding=refresh`,
        },
      );
      return { url: validateStripeRedirect(result.url, 'connect.stripe.com') };
    },
    async createCheckout(
      order: SkyStripeOrder,
      idempotencyKey: string,
    ): Promise<StripeCheckoutSession> {
      if (
        !Number.isSafeInteger(order.amountMinor) ||
        order.amountMinor <= 0 ||
        order.amountMinor > 99_999_999 ||
        !Number.isSafeInteger(order.commissionMinor) ||
        order.commissionMinor !==
          marketplaceCommissionMinor(order.amountMinor) ||
        !/^[a-z]{3}$/.test(order.currency) ||
        ![order.id, order.packageKey, order.name].every(
          (value) =>
            typeof value === 'string' &&
            value.trim().length > 0 &&
            value.length <= 500 &&
            Array.from(value).every(
              (character) => character.charCodeAt(0) >= 32,
            ),
        )
      ) {
        throw new SkyPaymentError('商品の決済条件を確認できません。', 400);
      }
      const returnUrl = new URL('/sky/purchases', validated.origin);
      returnUrl.searchParams.set('order', order.id);
      const cancelUrl = new URL(returnUrl);
      cancelUrl.searchParams.set('canceled', '1');
      const result = validateResultId(
        await request<StripeCheckoutSession>(
          '/v1/checkout/sessions',
          'POST',
          {
            mode: 'payment',
            'payment_method_types[0]': 'card',
            'line_items[0][quantity]': '1',
            'line_items[0][price_data][currency]': order.currency,
            'line_items[0][price_data][unit_amount]': String(order.amountMinor),
            'line_items[0][price_data][product_data][name]': order.name,
            'payment_intent_data[application_fee_amount]': String(
              order.commissionMinor,
            ),
            'payment_intent_data[transfer_data][destination]': stripeId(
              order.accountId,
              'acct',
            ),
            'payment_intent_data[metadata][order_id]': order.id,
            'payment_intent_data[metadata][package_key]': order.packageKey,
            'metadata[order_id]': order.id,
            'metadata[package_key]': order.packageKey,
            client_reference_id: order.id,
            success_url: returnUrl.href,
            cancel_url: cancelUrl.href,
            locale: 'ja',
          },
          validateIdempotencyKey(idempotencyKey),
        ),
        'cs',
      );
      result.url = validateStripeRedirect(result.url, 'checkout.stripe.com');
      return result;
    },
    async createCsvTrialCheckout(
      jobId: string,
      idempotencyKey: string,
    ): Promise<StripeCheckoutSession> {
      if (!/^[0-9a-f-]{36}$/i.test(jobId))
        throw new SkyPaymentError('受付番号を確認できません。');
      const success = new URL('/csv', validated.origin);
      success.searchParams.set('paymentJob', jobId);
      const cancel = new URL(success);
      cancel.searchParams.set('canceled', '1');
      // Hosted Checkout offers eligible Apple Pay wallets through the card method.
      // JPY is zero-decimal: 50 here means exactly 50 yen, never 5,000 yen.
      const session = validateResultId(
        await request<StripeCheckoutSession>(
          '/v1/checkout/sessions',
          'POST',
          {
            mode: 'payment',
            'payment_method_types[0]': 'card',
            'line_items[0][quantity]': '1',
            'line_items[0][price_data][currency]': 'jpy',
            'line_items[0][price_data][unit_amount]': '50',
            'adaptive_pricing[enabled]': 'false',
            'line_items[0][price_data][product_data][name]':
              'Sky CSV・50円試験',
            'metadata[csv_job_id]': jobId,
            'metadata[purpose]': 'csv_trial_50',
            'payment_intent_data[metadata][csv_job_id]': jobId,
            'payment_intent_data[metadata][purpose]': 'csv_trial_50',
            client_reference_id: jobId,
            success_url: success.href,
            cancel_url: cancel.href,
            locale: 'ja',
          },
          validateIdempotencyKey(idempotencyKey),
        ),
        'cs',
      );
      session.url = validateStripeRedirect(session.url, 'checkout.stripe.com');
      return session;
    },
    async retrieveCheckout(id: string): Promise<StripeCheckoutSession> {
      const result = validateResultId(
        await request<StripeCheckoutSession>(
          `/v1/checkout/sessions/${stripeId(id, 'cs')}`,
          'GET',
          {
            'expand[0]': 'payment_intent.latest_charge',
          },
        ),
        'cs',
      );
      if (result.url != null)
        result.url = validateStripeRedirect(result.url, 'checkout.stripe.com');
      return result;
    },
    async retrievePaymentIntent(id: string): Promise<StripePaymentIntent> {
      return validateResultId(
        await request<StripePaymentIntent>(
          `/v1/payment_intents/${stripeId(id, 'pi')}`,
          'GET',
          {
            'expand[0]': 'latest_charge',
          },
        ),
        'pi',
      );
    },
    async retrieveCharge(id: string): Promise<StripeCharge> {
      return validateResultId(
        await request<StripeCharge>(`/v1/charges/${stripeId(id, 'ch')}`, 'GET'),
        'ch',
      );
    },
    async refund(
      paymentIntentId: string,
      idempotencyKey: string,
    ): Promise<StripeRefund> {
      return validateResultId(
        await request<StripeRefund>(
          '/v1/refunds',
          'POST',
          {
            payment_intent: stripeId(paymentIntentId, 'pi'),
            reverse_transfer: 'true',
            refund_application_fee: 'true',
          },
          validateIdempotencyKey(idempotencyKey),
        ),
        're',
      );
    },
  };
}
