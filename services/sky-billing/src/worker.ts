import { verifyBillingToken } from '../../../lib/billing-token.ts';
import {
  assertMonthlyPrice,
  currentPeriodEnd,
  invoicePeriod,
  stripeCustomerId,
  stripeSubscriptionId,
  stripeUserId,
  stringValue,
  subscriptionPriceId,
  type StripeObject,
} from './domain.ts';
import { verifyStripeSignature } from './stripe-signature.ts';

const API_VERSION = '2026-02-25.clover';
const CHECKOUT_TTL_SECONDS = 31 * 60;
const ACTIVE_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'checkout_completed',
];

export interface Env {
  DB: D1Database;
  BILLING_SHARED_SECRET: string;
  SKY_ORIGIN: string;
  RETURN_ORIGIN: string;
  STRIPE_PRICE_ID: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

type StripeEvent = {
  id: string;
  type: string;
  created: number;
  data: { object: StripeObject };
};

function configuration(env: Env) {
  const sky = new URL(env.SKY_ORIGIN);
  const returning = new URL(env.RETURN_ORIGIN);
  if (
    sky.protocol !== 'https:' ||
    returning.protocol !== 'https:' ||
    !/^price_[A-Za-z0-9]+$/u.test(env.STRIPE_PRICE_ID) ||
    !/^sk_(?:test|live)_[A-Za-z0-9_]+$/u.test(env.STRIPE_SECRET_KEY) ||
    !env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_') ||
    env.STRIPE_WEBHOOK_SECRET.length < 20 ||
    env.BILLING_SHARED_SECRET.length < 32
  )
    throw new Error('BILLING_CONFIGURATION_INVALID');
  return { skyOrigin: sky.origin, returnOrigin: returning.origin };
}

function cors(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function response(value: unknown, status = 200, origin?: string) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...(origin ? cors(origin) : {}),
    },
  });
}

function bearer(request: Request) {
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9._-]+)$/u.exec(authorization);
  if (!match) throw new Error('UNAUTHORIZED');
  return match[1];
}

async function authorize(request: Request, env: Env) {
  const { skyOrigin } = configuration(env);
  if (request.headers.get('origin') !== skyOrigin) throw new Error('ORIGIN');
  return {
    origin: skyOrigin,
    token: await verifyBillingToken(bearer(request), env.BILLING_SHARED_SECRET),
  };
}

async function stripe(
  env: Env,
  path: string,
  body?: URLSearchParams,
  idempotencyKey?: string,
) {
  const result = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Stripe-Version': API_VERSION,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const value = (await result.json()) as StripeObject;
  if (!result.ok) {
    const stripeError =
      value.error && typeof value.error === 'object'
        ? (value.error as StripeObject)
        : null;
    const errorCode =
      typeof stripeError?.code === 'string'
        ? stripeError.code
        : 'REQUEST_FAILED';
    throw new Error(`STRIPE_${result.status}_${errorCode}`);
  }
  return value;
}

function stripeRedirect(value: unknown, expectedHost: string) {
  if (typeof value !== 'string') throw new Error('STRIPE_REDIRECT_INVALID');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== expectedHost)
    throw new Error('STRIPE_REDIRECT_INVALID');
  return url.href;
}

async function activeSubscription(db: D1Database, userId: string) {
  const placeholders = ACTIVE_STATUSES.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT stripe_subscription_id, status FROM billing_subscriptions WHERE user_id = ? AND status IN (${placeholders}) ORDER BY updated_at DESC LIMIT 1`,
    )
    .bind(userId, ...ACTIVE_STATUSES)
    .first<{ stripe_subscription_id: string; status: string }>();
}

async function status(request: Request, env: Env) {
  const { origin, token } = await authorize(request, env);
  const subscription = await env.DB.prepare(
    `SELECT stripe_subscription_id AS id, status, current_period_end AS currentPeriodEnd,
      cancel_at_period_end AS cancelAtPeriodEnd, updated_at AS updatedAt
     FROM billing_subscriptions WHERE user_id = ?
     ORDER BY CASE WHEN status IN ('active','trialing','past_due','unpaid','incomplete','checkout_completed') THEN 0 ELSE 1 END,
       updated_at DESC LIMIT 1`,
  )
    .bind(token.sub)
    .first();
  const invoice = await env.DB.prepare(
    `SELECT stripe_invoice_id AS id, status, amount_paid AS amountPaid, currency,
      period_start AS periodStart, period_end AS periodEnd, paid_at AS paidAt
     FROM billing_invoices WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`,
  )
    .bind(token.sub)
    .first();
  return response(
    {
      price: { amountMinor: 888, currency: 'usd', interval: 'month' },
      subscription,
      invoice,
    },
    200,
    origin,
  );
}

async function checkout(request: Request, env: Env) {
  const { origin, token } = await authorize(request, env);
  const existing = await activeSubscription(env.DB, token.sub);
  if (existing)
    return response(
      {
        error: 'すでに月額契約があります。管理画面から確認してください。',
        code: 'ALREADY_SUBSCRIBED',
      },
      409,
      origin,
    );
  const now = Math.floor(Date.now() / 1000);
  const lock = await env.DB.prepare(
    `INSERT INTO billing_checkout_locks(user_id,jti,status,expires_at,created_at,updated_at)
     VALUES (?,?,'pending',?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET jti=excluded.jti,status='pending',session_id=NULL,
       checkout_url=NULL,expires_at=excluded.expires_at,updated_at=excluded.updated_at
     WHERE billing_checkout_locks.jti=excluded.jti OR billing_checkout_locks.expires_at<?
       OR billing_checkout_locks.status IN ('failed','completed')`,
  )
    .bind(token.sub, token.jti, now + CHECKOUT_TTL_SECONDS, now, now, now)
    .run();
  if ((lock.meta.changes ?? 0) !== 1)
    return response(
      {
        error: '別の申込み処理が進行中です。しばらくしてから確認してください。',
        code: 'CHECKOUT_IN_PROGRESS',
      },
      409,
      origin,
    );
  let checkoutRequested = false;
  try {
    assertMonthlyPrice(
      await stripe(env, `prices/${encodeURIComponent(env.STRIPE_PRICE_ID)}`),
      env.STRIPE_PRICE_ID,
    );
    const customer = await env.DB.prepare(
      'SELECT stripe_customer_id FROM billing_customers WHERE user_id = ?',
    )
      .bind(token.sub)
      .first<{ stripe_customer_id: string }>();
    const { returnOrigin } = configuration(env);
    const form = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': env.STRIPE_PRICE_ID,
      'line_items[0][quantity]': '1',
      client_reference_id: token.sub,
      'metadata[sky_user_id]': token.sub,
      'subscription_data[metadata][sky_user_id]': token.sub,
      success_url: `${returnOrigin}/wallet?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnOrigin}/wallet?billing=cancelled`,
      expires_at: String(now + CHECKOUT_TTL_SECONDS),
    });
    if (customer) form.set('customer', customer.stripe_customer_id);
    checkoutRequested = true;
    const session = await stripe(
      env,
      'checkout/sessions',
      form,
      `sky-checkout-${token.jti}`,
    );
    if (typeof session.id !== 'string')
      throw new Error('STRIPE_CHECKOUT_RESPONSE_INVALID');
    const redirect = stripeRedirect(session.url, 'checkout.stripe.com');
    await env.DB.prepare(
      `UPDATE billing_checkout_locks SET status='ready',session_id=?,checkout_url=?,updated_at=?
       WHERE user_id=? AND jti=?`,
    )
      .bind(session.id, redirect, now, token.sub, token.jti)
      .run();
    return response({ url: redirect }, 201, origin);
  } catch (error) {
    await env.DB.prepare(
      `UPDATE billing_checkout_locks SET status=?,updated_at=?
       WHERE user_id=? AND jti=?`,
    )
      .bind(checkoutRequested ? 'unknown' : 'failed', now, token.sub, token.jti)
      .run();
    throw error;
  }
}

async function portal(request: Request, env: Env) {
  const { origin, token } = await authorize(request, env);
  const customer = await env.DB.prepare(
    'SELECT stripe_customer_id FROM billing_customers WHERE user_id = ?',
  )
    .bind(token.sub)
    .first<{ stripe_customer_id: string }>();
  if (!customer)
    return response({ error: '管理できる月額契約がありません。' }, 404, origin);
  const { returnOrigin } = configuration(env);
  const session = await stripe(
    env,
    'billing_portal/sessions',
    new URLSearchParams({
      customer: customer.stripe_customer_id,
      return_url: `${returnOrigin}/wallet`,
    }),
    `sky-portal-${token.jti}`,
  );
  return response(
    { url: stripeRedirect(session.url, 'billing.stripe.com') },
    201,
    origin,
  );
}

function stripeEvent(value: unknown): StripeEvent {
  if (!value || typeof value !== 'object')
    throw new Error('STRIPE_EVENT_INVALID');
  const event = value as Partial<StripeEvent>;
  if (
    typeof event.id !== 'string' ||
    !event.id.startsWith('evt_') ||
    typeof event.type !== 'string' ||
    typeof event.created !== 'number' ||
    !event.data ||
    !event.data.object ||
    typeof event.data.object !== 'object'
  )
    throw new Error('STRIPE_EVENT_INVALID');
  return event as StripeEvent;
}

async function resolveUser(env: Env, object: StripeObject) {
  const fromEvent = stripeUserId(object);
  if (fromEvent) return fromEvent;
  const customer = stripeCustomerId(object);
  if (customer) {
    const row = await env.DB.prepare(
      'SELECT user_id FROM billing_customers WHERE stripe_customer_id = ?',
    )
      .bind(customer)
      .first<{ user_id: string }>();
    if (row) return row.user_id;
  }
  const subscription = stripeSubscriptionId(object);
  if (subscription) {
    const row = await env.DB.prepare(
      'SELECT user_id FROM billing_subscriptions WHERE stripe_subscription_id = ?',
    )
      .bind(subscription)
      .first<{ user_id: string }>();
    if (row) return row.user_id;
  }
  return null;
}

async function webhook(request: Request, env: Env) {
  configuration(env);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 262_144)
    return response({ error: 'payload_too_large' }, 413);
  await verifyStripeSignature(
    raw,
    request.headers.get('stripe-signature'),
    env.STRIPE_WEBHOOK_SECRET,
  );
  const event = stripeEvent(JSON.parse(raw) as unknown);
  const object = event.data.object;
  const relevant = new Set([
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.paid',
    'invoice.payment_failed',
  ]);
  if (!relevant.has(event.type)) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO billing_events(event_id,type,stripe_created_at,processed_at) VALUES (?,?,?,?)',
    )
      .bind(event.id, event.type, event.created, Math.floor(Date.now() / 1000))
      .run();
    return response({ received: true });
  }
  const userId = await resolveUser(env, object);
  if (!userId) throw new Error('STRIPE_EVENT_USER_UNRESOLVED');
  const customerId = stripeCustomerId(object);
  const subscriptionId =
    stripeSubscriptionId(object) ??
    (event.type.startsWith('customer.subscription.')
      ? stringValue(object.id)
      : null);
  const now = Math.floor(Date.now() / 1000);
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      'INSERT OR IGNORE INTO billing_events(event_id,type,stripe_created_at,processed_at) VALUES (?,?,?,?)',
    ).bind(event.id, event.type, event.created, now),
  ];
  if (customerId)
    statements.push(
      env.DB.prepare(
        `INSERT INTO billing_customers(user_id,stripe_customer_id,created_at,updated_at) VALUES (?,?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id,updated_at=excluded.updated_at`,
      ).bind(userId, customerId, now, now),
    );
  if (event.type === 'checkout.session.completed') {
    if (!customerId || !subscriptionId)
      throw new Error('STRIPE_CHECKOUT_EVENT_INVALID');
    statements.push(
      env.DB.prepare(
        `INSERT INTO billing_subscriptions(stripe_subscription_id,user_id,stripe_customer_id,status,price_id,current_period_end,cancel_at_period_end,stripe_event_created_at,updated_at)
         VALUES (?,?,?,'checkout_completed',?,NULL,0,?,?)
         ON CONFLICT(stripe_subscription_id) DO UPDATE SET user_id=excluded.user_id,
           stripe_customer_id=excluded.stripe_customer_id,stripe_event_created_at=excluded.stripe_event_created_at,
           updated_at=excluded.updated_at
         WHERE excluded.stripe_event_created_at >= billing_subscriptions.stripe_event_created_at`,
      ).bind(
        subscriptionId,
        userId,
        customerId,
        env.STRIPE_PRICE_ID,
        event.created,
        now,
      ),
      env.DB.prepare(
        "UPDATE billing_checkout_locks SET status='completed',updated_at=? WHERE user_id=?",
      ).bind(now, userId),
    );
  }
  if (event.type.startsWith('customer.subscription.')) {
    if (!customerId || !subscriptionId || typeof object.status !== 'string')
      throw new Error('STRIPE_SUBSCRIPTION_EVENT_INVALID');
    const priceId = subscriptionPriceId(object);
    if (priceId !== env.STRIPE_PRICE_ID)
      throw new Error('STRIPE_SUBSCRIPTION_PRICE_MISMATCH');
    statements.push(
      env.DB.prepare(
        `INSERT INTO billing_subscriptions(stripe_subscription_id,user_id,stripe_customer_id,status,price_id,current_period_end,cancel_at_period_end,stripe_event_created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT(stripe_subscription_id) DO UPDATE SET user_id=excluded.user_id,
           stripe_customer_id=excluded.stripe_customer_id,status=excluded.status,price_id=excluded.price_id,
           current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,
           stripe_event_created_at=excluded.stripe_event_created_at,updated_at=excluded.updated_at
         WHERE excluded.stripe_event_created_at >= billing_subscriptions.stripe_event_created_at`,
      ).bind(
        subscriptionId,
        userId,
        customerId,
        object.status,
        priceId,
        currentPeriodEnd(object),
        object.cancel_at_period_end === true ? 1 : 0,
        event.created,
        now,
      ),
    );
  }
  if (
    event.type === 'invoice.paid' ||
    event.type === 'invoice.payment_failed'
  ) {
    if (
      !customerId ||
      !subscriptionId ||
      typeof object.id !== 'string' ||
      object.currency !== 'usd'
    )
      throw new Error('STRIPE_INVOICE_EVENT_INVALID');
    const invoicePrice = subscriptionPriceId(object);
    if (invoicePrice !== env.STRIPE_PRICE_ID)
      throw new Error('STRIPE_INVOICE_PRICE_MISMATCH');
    const period = invoicePeriod(object);
    const paid = event.type === 'invoice.paid';
    const transitions =
      object.status_transitions &&
      typeof object.status_transitions === 'object' &&
      !Array.isArray(object.status_transitions)
        ? (object.status_transitions as StripeObject)
        : null;
    statements.push(
      env.DB.prepare(
        `INSERT INTO billing_invoices(stripe_invoice_id,user_id,stripe_subscription_id,stripe_customer_id,status,amount_paid,currency,period_start,period_end,paid_at,stripe_event_created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(stripe_invoice_id) DO UPDATE SET status=excluded.status,amount_paid=excluded.amount_paid,
           period_start=excluded.period_start,period_end=excluded.period_end,paid_at=excluded.paid_at,
           stripe_event_created_at=excluded.stripe_event_created_at,updated_at=excluded.updated_at
         WHERE excluded.stripe_event_created_at >= billing_invoices.stripe_event_created_at`,
      ).bind(
        object.id,
        userId,
        subscriptionId,
        customerId,
        paid ? 'paid' : 'payment_failed',
        typeof object.amount_paid === 'number' ? object.amount_paid : 0,
        object.currency,
        period.start,
        period.end,
        paid ? (transitions?.paid_at ?? null) : null,
        event.created,
        now,
      ),
      env.DB.prepare(
        `INSERT INTO billing_subscriptions(stripe_subscription_id,user_id,stripe_customer_id,status,price_id,current_period_end,cancel_at_period_end,stripe_event_created_at,updated_at)
         VALUES (?,?,?,?,?,?,0,?,?)
         ON CONFLICT(stripe_subscription_id) DO UPDATE SET status=excluded.status,
           price_id=excluded.price_id,current_period_end=excluded.current_period_end,
           stripe_event_created_at=excluded.stripe_event_created_at,updated_at=excluded.updated_at
         WHERE billing_subscriptions.status NOT IN ('canceled','incomplete_expired')
           AND excluded.stripe_event_created_at >= billing_subscriptions.stripe_event_created_at`,
      ).bind(
        subscriptionId,
        userId,
        customerId,
        paid ? 'active' : 'past_due',
        invoicePrice,
        period.end,
        event.created,
        now,
      ),
    );
  }
  await env.DB.batch(statements);
  return response({ received: true });
}

function errorResponse(error: unknown, origin?: string) {
  const message = error instanceof Error ? error.message : '';
  const status =
    message === 'UNAUTHORIZED' || message.startsWith('TOKEN_')
      ? 401
      : message === 'ORIGIN'
        ? 403
        : message.includes('SIGNATURE') || message.includes('EVENT_INVALID')
          ? 400
          : message === 'BILLING_CONFIGURATION_INVALID'
            ? 503
            : 502;
  return response(
    {
      error:
        status === 401
          ? '認証の有効期限が切れました。Skyから再試行してください。'
          : status === 403
            ? 'Sky以外からの操作は受け付けません。'
            : status === 503
              ? '決済サービスの設定が完了していません。'
              : '決済サービスと通信できませんでした。再試行してください。',
    },
    status,
    origin,
  );
}

export default {
  async fetch(request, env) {
    let origin: string | undefined;
    try {
      const { skyOrigin } = configuration(env);
      origin =
        request.headers.get('origin') === skyOrigin ? skyOrigin : undefined;
      const url = new URL(request.url);
      if (request.method === 'OPTIONS') {
        if (!origin) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: cors(origin) });
      }
      if (request.method === 'GET' && url.pathname === '/health')
        return response({
          ok: true,
          price: { amountMinor: 888, currency: 'usd', interval: 'month' },
        });
      if (request.method === 'GET' && url.pathname === '/v1/status')
        return await status(request, env);
      if (request.method === 'POST' && url.pathname === '/v1/checkout')
        return await checkout(request, env);
      if (request.method === 'POST' && url.pathname === '/v1/portal')
        return await portal(request, env);
      if (request.method === 'POST' && url.pathname === '/v1/webhooks/stripe')
        return await webhook(request, env);
      return response({ error: 'not_found' }, 404, origin);
    } catch (error) {
      return errorResponse(error, origin);
    }
  },
} satisfies ExportedHandler<Env>;
