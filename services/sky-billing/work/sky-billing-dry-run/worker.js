var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../lib/billing-token.ts
var encoder = new TextEncoder();
var BILLING_TOKEN_AUDIENCE = "sky-billing";
var BILLING_TOKEN_ISSUER = "sky-site";
var BILLING_TOKEN_TTL_SECONDS = 300;
function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("TOKEN_INVALID");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
__name(decodeBase64Url, "decodeBase64Url");
async function signature(input, secret) {
  if (secret.length < 32) throw new Error("TOKEN_SECRET_INVALID");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(input))
  );
}
__name(signature, "signature");
function equal(left, right) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}
__name(equal, "equal");
function payload(value) {
  if (!value || typeof value !== "object") throw new Error("TOKEN_INVALID");
  const item = value;
  if (item.v !== 1 || item.iss !== BILLING_TOKEN_ISSUER || item.aud !== BILLING_TOKEN_AUDIENCE || typeof item.sub !== "string" || item.sub.length < 1 || item.sub.length > 256 || typeof item.iat !== "number" || !Number.isInteger(item.iat) || typeof item.exp !== "number" || !Number.isInteger(item.exp) || typeof item.jti !== "string" || !/^[0-9a-f-]{36}$/iu.test(item.jti))
    throw new Error("TOKEN_INVALID");
  return item;
}
__name(payload, "payload");
async function verifyBillingToken(token, secret, nowSeconds = Math.floor(Date.now() / 1e3)) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("TOKEN_INVALID");
  const [header, body, supplied] = parts;
  const parsedHeader = JSON.parse(
    new TextDecoder().decode(decodeBase64Url(header))
  );
  if (!parsedHeader || typeof parsedHeader !== "object" || parsedHeader.alg !== "HS256" || parsedHeader.typ !== "JWT")
    throw new Error("TOKEN_INVALID");
  const expected = await signature(`${header}.${body}`, secret);
  if (!equal(decodeBase64Url(supplied), expected))
    throw new Error("TOKEN_INVALID");
  const result = payload(
    JSON.parse(new TextDecoder().decode(decodeBase64Url(body)))
  );
  if (result.exp <= nowSeconds || result.iat > nowSeconds + 30 || result.exp - result.iat !== BILLING_TOKEN_TTL_SECONDS)
    throw new Error("TOKEN_EXPIRED");
  return result;
}
__name(verifyBillingToken, "verifyBillingToken");

// src/domain.ts
function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
__name(record, "record");
function stringValue(value) {
  if (typeof value === "string") return value;
  const item = record(value);
  return typeof item?.id === "string" ? item.id : null;
}
__name(stringValue, "stringValue");
function nested(object, ...keys) {
  let value = object;
  for (const key of keys) {
    if (Array.isArray(value) && /^\d+$/u.test(key)) value = value[Number(key)];
    else value = record(value)?.[key];
  }
  return value;
}
__name(nested, "nested");
function assertMonthlyPrice(value, expectedId) {
  const price = record(value);
  const recurring = record(price?.recurring);
  if (price?.id !== expectedId || price.active !== true || price.currency !== "usd" || price.unit_amount !== 888 || price.type !== "recurring" || recurring?.interval !== "month" || (recurring.interval_count ?? 1) !== 1)
    throw new Error("STRIPE_PRICE_MUST_BE_USD_888_MONTHLY");
  return price;
}
__name(assertMonthlyPrice, "assertMonthlyPrice");
function stripeCustomerId(object) {
  return stringValue(object.customer);
}
__name(stripeCustomerId, "stripeCustomerId");
function stripeSubscriptionId(object) {
  return stringValue(object.subscription) ?? stringValue(
    nested(object, "parent", "subscription_details", "subscription")
  );
}
__name(stripeSubscriptionId, "stripeSubscriptionId");
function stripeUserId(object) {
  const candidates = [
    object.client_reference_id,
    nested(object, "metadata", "sky_user_id"),
    nested(object, "subscription_details", "metadata", "sky_user_id"),
    nested(object, "parent", "subscription_details", "metadata", "sky_user_id")
  ];
  return candidates.find(
    (value) => typeof value === "string" && value.length > 0 && value.length <= 256
  ) ?? null;
}
__name(stripeUserId, "stripeUserId");
function subscriptionPriceId(object) {
  const direct = stringValue(nested(object, "items", "data", "0", "price"));
  if (direct) return direct;
  const lines = record(object.lines);
  const data = Array.isArray(lines?.data) ? lines.data : [];
  for (const entry of data) {
    const line = record(entry);
    const price = stringValue(line?.price) ?? stringValue(nested(line ?? {}, "pricing", "price_details", "price"));
    if (price) return price;
  }
  return null;
}
__name(subscriptionPriceId, "subscriptionPriceId");
function currentPeriodEnd(object) {
  if (typeof object.current_period_end === "number")
    return object.current_period_end;
  const items = record(object.items);
  const data = Array.isArray(items?.data) ? items.data : [];
  const first = record(data[0]);
  return typeof first?.current_period_end === "number" ? first.current_period_end : null;
}
__name(currentPeriodEnd, "currentPeriodEnd");
function invoicePeriod(object) {
  const lines = record(object.lines);
  const data = Array.isArray(lines?.data) ? lines.data : [];
  const period = record(record(data[0])?.period);
  return {
    start: typeof period?.start === "number" ? period.start : typeof object.period_start === "number" ? object.period_start : null,
    end: typeof period?.end === "number" ? period.end : typeof object.period_end === "number" ? object.period_end : null
  };
}
__name(invoicePeriod, "invoicePeriod");

// src/stripe-signature.ts
var encoder2 = new TextEncoder();
function bytesFromHex(value) {
  if (!/^[0-9a-f]{64}$/iu.test(value))
    throw new Error("STRIPE_SIGNATURE_INVALID");
  return Uint8Array.from(
    { length: value.length / 2 },
    (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  );
}
__name(bytesFromHex, "bytesFromHex");
function secureEqual(left, right) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}
__name(secureEqual, "secureEqual");
async function verifyStripeSignature(rawBody, signatureHeader, secret, nowSeconds = Math.floor(Date.now() / 1e3), toleranceSeconds = 300) {
  if (!signatureHeader || !secret) throw new Error("STRIPE_SIGNATURE_INVALID");
  const fields = signatureHeader.split(",").map((field) => field.split("="));
  const timestampValue = fields.find(([key2]) => key2 === "t")?.[1];
  const candidates = fields.filter(([key2]) => key2 === "v1").map(([, value]) => value);
  const timestamp = Number(timestampValue);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > toleranceSeconds || candidates.length === 0)
    throw new Error("STRIPE_SIGNATURE_INVALID");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder2.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder2.encode(`${timestamp}.${rawBody}`)
    )
  );
  if (!candidates.some((candidate) => {
    try {
      return secureEqual(bytesFromHex(candidate), expected);
    } catch {
      return false;
    }
  }))
    throw new Error("STRIPE_SIGNATURE_INVALID");
}
__name(verifyStripeSignature, "verifyStripeSignature");

// src/worker.ts
var API_VERSION = "2026-02-25.clover";
var CHECKOUT_TTL_SECONDS = 31 * 60;
var ACTIVE_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
  "checkout_completed"
];
function configuration(env) {
  const sky = new URL(env.SKY_ORIGIN);
  const returning = new URL(env.RETURN_ORIGIN);
  if (sky.protocol !== "https:" || returning.protocol !== "https:" || !/^price_[A-Za-z0-9]+$/u.test(env.STRIPE_PRICE_ID) || !/^sk_(?:test|live)_[A-Za-z0-9_]+$/u.test(env.STRIPE_SECRET_KEY) || !env.STRIPE_WEBHOOK_SECRET.startsWith("whsec_") || env.STRIPE_WEBHOOK_SECRET.length < 20 || env.BILLING_SHARED_SECRET.length < 32)
    throw new Error("BILLING_CONFIGURATION_INVALID");
  return { skyOrigin: sky.origin, returnOrigin: returning.origin };
}
__name(configuration, "configuration");
function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin"
  };
}
__name(cors, "cors");
function response(value, status2 = 200, origin) {
  return Response.json(value, {
    status: status2,
    headers: {
      "Cache-Control": "no-store",
      ...origin ? cors(origin) : {}
    }
  });
}
__name(response, "response");
function bearer(request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._-]+)$/u.exec(authorization);
  if (!match) throw new Error("UNAUTHORIZED");
  return match[1];
}
__name(bearer, "bearer");
async function authorize(request, env) {
  const { skyOrigin } = configuration(env);
  if (request.headers.get("origin") !== skyOrigin) throw new Error("ORIGIN");
  return {
    origin: skyOrigin,
    token: await verifyBillingToken(bearer(request), env.BILLING_SHARED_SECRET)
  };
}
__name(authorize, "authorize");
async function stripe(env, path, body, idempotencyKey) {
  const result = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Stripe-Version": API_VERSION,
      ...body ? { "Content-Type": "application/x-www-form-urlencoded" } : {},
      ...idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}
    },
    body,
    signal: AbortSignal.timeout(15e3)
  });
  const value = await result.json();
  if (!result.ok) {
    const stripeError = value.error && typeof value.error === "object" ? value.error : null;
    const errorCode = typeof stripeError?.code === "string" ? stripeError.code : "REQUEST_FAILED";
    throw new Error(`STRIPE_${result.status}_${errorCode}`);
  }
  return value;
}
__name(stripe, "stripe");
function stripeRedirect(value, expectedHost) {
  if (typeof value !== "string") throw new Error("STRIPE_REDIRECT_INVALID");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== expectedHost)
    throw new Error("STRIPE_REDIRECT_INVALID");
  return url.href;
}
__name(stripeRedirect, "stripeRedirect");
async function activeSubscription(db, userId) {
  const placeholders = ACTIVE_STATUSES.map(() => "?").join(",");
  return db.prepare(
    `SELECT stripe_subscription_id, status FROM billing_subscriptions WHERE user_id = ? AND status IN (${placeholders}) ORDER BY updated_at DESC LIMIT 1`
  ).bind(userId, ...ACTIVE_STATUSES).first();
}
__name(activeSubscription, "activeSubscription");
async function status(request, env) {
  const { origin, token } = await authorize(request, env);
  const subscription = await env.DB.prepare(
    `SELECT stripe_subscription_id AS id, status, current_period_end AS currentPeriodEnd,
      cancel_at_period_end AS cancelAtPeriodEnd, updated_at AS updatedAt
     FROM billing_subscriptions WHERE user_id = ?
     ORDER BY CASE WHEN status IN ('active','trialing','past_due','unpaid','incomplete','checkout_completed') THEN 0 ELSE 1 END,
       updated_at DESC LIMIT 1`
  ).bind(token.sub).first();
  const invoice = await env.DB.prepare(
    `SELECT stripe_invoice_id AS id, status, amount_paid AS amountPaid, currency,
      period_start AS periodStart, period_end AS periodEnd, paid_at AS paidAt
     FROM billing_invoices WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`
  ).bind(token.sub).first();
  return response(
    {
      price: { amountMinor: 888, currency: "usd", interval: "month" },
      subscription,
      invoice
    },
    200,
    origin
  );
}
__name(status, "status");
async function checkout(request, env) {
  const { origin, token } = await authorize(request, env);
  const existing = await activeSubscription(env.DB, token.sub);
  if (existing)
    return response(
      {
        error: "\u3059\u3067\u306B\u6708\u984D\u5951\u7D04\u304C\u3042\u308A\u307E\u3059\u3002\u7BA1\u7406\u753B\u9762\u304B\u3089\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
        code: "ALREADY_SUBSCRIBED"
      },
      409,
      origin
    );
  const now = Math.floor(Date.now() / 1e3);
  const lock = await env.DB.prepare(
    `INSERT INTO billing_checkout_locks(user_id,jti,status,expires_at,created_at,updated_at)
     VALUES (?,?,'pending',?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET jti=excluded.jti,status='pending',session_id=NULL,
       checkout_url=NULL,expires_at=excluded.expires_at,updated_at=excluded.updated_at
     WHERE billing_checkout_locks.jti=excluded.jti OR billing_checkout_locks.expires_at<?
       OR billing_checkout_locks.status IN ('failed','completed')`
  ).bind(token.sub, token.jti, now + CHECKOUT_TTL_SECONDS, now, now, now).run();
  if ((lock.meta.changes ?? 0) !== 1)
    return response(
      {
        error: "\u5225\u306E\u7533\u8FBC\u307F\u51E6\u7406\u304C\u9032\u884C\u4E2D\u3067\u3059\u3002\u3057\u3070\u3089\u304F\u3057\u3066\u304B\u3089\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
        code: "CHECKOUT_IN_PROGRESS"
      },
      409,
      origin
    );
  let checkoutRequested = false;
  try {
    assertMonthlyPrice(
      await stripe(env, `prices/${encodeURIComponent(env.STRIPE_PRICE_ID)}`),
      env.STRIPE_PRICE_ID
    );
    const customer = await env.DB.prepare(
      "SELECT stripe_customer_id FROM billing_customers WHERE user_id = ?"
    ).bind(token.sub).first();
    const { returnOrigin } = configuration(env);
    const form = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": env.STRIPE_PRICE_ID,
      "line_items[0][quantity]": "1",
      client_reference_id: token.sub,
      "metadata[sky_user_id]": token.sub,
      "subscription_data[metadata][sky_user_id]": token.sub,
      success_url: `${returnOrigin}/wallet?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnOrigin}/wallet?billing=cancelled`,
      expires_at: String(now + CHECKOUT_TTL_SECONDS)
    });
    if (customer) form.set("customer", customer.stripe_customer_id);
    checkoutRequested = true;
    const session = await stripe(
      env,
      "checkout/sessions",
      form,
      `sky-checkout-${token.jti}`
    );
    if (typeof session.id !== "string")
      throw new Error("STRIPE_CHECKOUT_RESPONSE_INVALID");
    const redirect = stripeRedirect(session.url, "checkout.stripe.com");
    await env.DB.prepare(
      `UPDATE billing_checkout_locks SET status='ready',session_id=?,checkout_url=?,updated_at=?
       WHERE user_id=? AND jti=?`
    ).bind(session.id, redirect, now, token.sub, token.jti).run();
    return response({ url: redirect }, 201, origin);
  } catch (error) {
    await env.DB.prepare(
      `UPDATE billing_checkout_locks SET status=?,updated_at=?
       WHERE user_id=? AND jti=?`
    ).bind(checkoutRequested ? "unknown" : "failed", now, token.sub, token.jti).run();
    throw error;
  }
}
__name(checkout, "checkout");
async function portal(request, env) {
  const { origin, token } = await authorize(request, env);
  const customer = await env.DB.prepare(
    "SELECT stripe_customer_id FROM billing_customers WHERE user_id = ?"
  ).bind(token.sub).first();
  if (!customer)
    return response({ error: "\u7BA1\u7406\u3067\u304D\u308B\u6708\u984D\u5951\u7D04\u304C\u3042\u308A\u307E\u305B\u3093\u3002" }, 404, origin);
  const { returnOrigin } = configuration(env);
  const session = await stripe(
    env,
    "billing_portal/sessions",
    new URLSearchParams({
      customer: customer.stripe_customer_id,
      return_url: `${returnOrigin}/wallet`
    }),
    `sky-portal-${token.jti}`
  );
  return response(
    { url: stripeRedirect(session.url, "billing.stripe.com") },
    201,
    origin
  );
}
__name(portal, "portal");
function stripeEvent(value) {
  if (!value || typeof value !== "object")
    throw new Error("STRIPE_EVENT_INVALID");
  const event = value;
  if (typeof event.id !== "string" || !event.id.startsWith("evt_") || typeof event.type !== "string" || typeof event.created !== "number" || !event.data || !event.data.object || typeof event.data.object !== "object")
    throw new Error("STRIPE_EVENT_INVALID");
  return event;
}
__name(stripeEvent, "stripeEvent");
async function resolveUser(env, object) {
  const fromEvent = stripeUserId(object);
  if (fromEvent) return fromEvent;
  const customer = stripeCustomerId(object);
  if (customer) {
    const row = await env.DB.prepare(
      "SELECT user_id FROM billing_customers WHERE stripe_customer_id = ?"
    ).bind(customer).first();
    if (row) return row.user_id;
  }
  const subscription = stripeSubscriptionId(object);
  if (subscription) {
    const row = await env.DB.prepare(
      "SELECT user_id FROM billing_subscriptions WHERE stripe_subscription_id = ?"
    ).bind(subscription).first();
    if (row) return row.user_id;
  }
  return null;
}
__name(resolveUser, "resolveUser");
async function webhook(request, env) {
  configuration(env);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 262144)
    return response({ error: "payload_too_large" }, 413);
  await verifyStripeSignature(
    raw,
    request.headers.get("stripe-signature"),
    env.STRIPE_WEBHOOK_SECRET
  );
  const event = stripeEvent(JSON.parse(raw));
  const object = event.data.object;
  const relevant = /* @__PURE__ */ new Set([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed"
  ]);
  if (!relevant.has(event.type)) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO billing_events(event_id,type,stripe_created_at,processed_at) VALUES (?,?,?,?)"
    ).bind(event.id, event.type, event.created, Math.floor(Date.now() / 1e3)).run();
    return response({ received: true });
  }
  const userId = await resolveUser(env, object);
  if (!userId) throw new Error("STRIPE_EVENT_USER_UNRESOLVED");
  const customerId = stripeCustomerId(object);
  const subscriptionId = stripeSubscriptionId(object) ?? (event.type.startsWith("customer.subscription.") ? stringValue(object.id) : null);
  const now = Math.floor(Date.now() / 1e3);
  const statements = [
    env.DB.prepare(
      "INSERT OR IGNORE INTO billing_events(event_id,type,stripe_created_at,processed_at) VALUES (?,?,?,?)"
    ).bind(event.id, event.type, event.created, now)
  ];
  if (customerId)
    statements.push(
      env.DB.prepare(
        `INSERT INTO billing_customers(user_id,stripe_customer_id,created_at,updated_at) VALUES (?,?,?,?)
         ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id,updated_at=excluded.updated_at`
      ).bind(userId, customerId, now, now)
    );
  if (event.type === "checkout.session.completed") {
    if (!customerId || !subscriptionId)
      throw new Error("STRIPE_CHECKOUT_EVENT_INVALID");
    statements.push(
      env.DB.prepare(
        `INSERT INTO billing_subscriptions(stripe_subscription_id,user_id,stripe_customer_id,status,price_id,current_period_end,cancel_at_period_end,stripe_event_created_at,updated_at)
         VALUES (?,?,?,'checkout_completed',?,NULL,0,?,?)
         ON CONFLICT(stripe_subscription_id) DO UPDATE SET user_id=excluded.user_id,
           stripe_customer_id=excluded.stripe_customer_id,stripe_event_created_at=excluded.stripe_event_created_at,
           updated_at=excluded.updated_at
         WHERE excluded.stripe_event_created_at >= billing_subscriptions.stripe_event_created_at`
      ).bind(
        subscriptionId,
        userId,
        customerId,
        env.STRIPE_PRICE_ID,
        event.created,
        now
      ),
      env.DB.prepare(
        "UPDATE billing_checkout_locks SET status='completed',updated_at=? WHERE user_id=?"
      ).bind(now, userId)
    );
  }
  if (event.type.startsWith("customer.subscription.")) {
    if (!customerId || !subscriptionId || typeof object.status !== "string")
      throw new Error("STRIPE_SUBSCRIPTION_EVENT_INVALID");
    const priceId = subscriptionPriceId(object);
    if (priceId !== env.STRIPE_PRICE_ID)
      throw new Error("STRIPE_SUBSCRIPTION_PRICE_MISMATCH");
    statements.push(
      env.DB.prepare(
        `INSERT INTO billing_subscriptions(stripe_subscription_id,user_id,stripe_customer_id,status,price_id,current_period_end,cancel_at_period_end,stripe_event_created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT(stripe_subscription_id) DO UPDATE SET user_id=excluded.user_id,
           stripe_customer_id=excluded.stripe_customer_id,status=excluded.status,price_id=excluded.price_id,
           current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,
           stripe_event_created_at=excluded.stripe_event_created_at,updated_at=excluded.updated_at
         WHERE excluded.stripe_event_created_at >= billing_subscriptions.stripe_event_created_at`
      ).bind(
        subscriptionId,
        userId,
        customerId,
        object.status,
        priceId,
        currentPeriodEnd(object),
        object.cancel_at_period_end === true ? 1 : 0,
        event.created,
        now
      )
    );
  }
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    if (!customerId || !subscriptionId || typeof object.id !== "string" || object.currency !== "usd")
      throw new Error("STRIPE_INVOICE_EVENT_INVALID");
    const invoicePrice = subscriptionPriceId(object);
    if (invoicePrice !== env.STRIPE_PRICE_ID)
      throw new Error("STRIPE_INVOICE_PRICE_MISMATCH");
    const period = invoicePeriod(object);
    const paid = event.type === "invoice.paid";
    const transitions = object.status_transitions && typeof object.status_transitions === "object" && !Array.isArray(object.status_transitions) ? object.status_transitions : null;
    statements.push(
      env.DB.prepare(
        `INSERT INTO billing_invoices(stripe_invoice_id,user_id,stripe_subscription_id,stripe_customer_id,status,amount_paid,currency,period_start,period_end,paid_at,stripe_event_created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(stripe_invoice_id) DO UPDATE SET status=excluded.status,amount_paid=excluded.amount_paid,
           period_start=excluded.period_start,period_end=excluded.period_end,paid_at=excluded.paid_at,
           stripe_event_created_at=excluded.stripe_event_created_at,updated_at=excluded.updated_at
         WHERE excluded.stripe_event_created_at >= billing_invoices.stripe_event_created_at`
      ).bind(
        object.id,
        userId,
        subscriptionId,
        customerId,
        paid ? "paid" : "payment_failed",
        typeof object.amount_paid === "number" ? object.amount_paid : 0,
        object.currency,
        period.start,
        period.end,
        paid ? transitions?.paid_at ?? null : null,
        event.created,
        now
      ),
      env.DB.prepare(
        `INSERT INTO billing_subscriptions(stripe_subscription_id,user_id,stripe_customer_id,status,price_id,current_period_end,cancel_at_period_end,stripe_event_created_at,updated_at)
         VALUES (?,?,?,?,?,?,0,?,?)
         ON CONFLICT(stripe_subscription_id) DO UPDATE SET status=excluded.status,
           price_id=excluded.price_id,current_period_end=excluded.current_period_end,
           stripe_event_created_at=excluded.stripe_event_created_at,updated_at=excluded.updated_at
         WHERE billing_subscriptions.status NOT IN ('canceled','incomplete_expired')
           AND excluded.stripe_event_created_at >= billing_subscriptions.stripe_event_created_at`
      ).bind(
        subscriptionId,
        userId,
        customerId,
        paid ? "active" : "past_due",
        invoicePrice,
        period.end,
        event.created,
        now
      )
    );
  }
  await env.DB.batch(statements);
  return response({ received: true });
}
__name(webhook, "webhook");
function errorResponse(error, origin) {
  const message = error instanceof Error ? error.message : "";
  const status2 = message === "UNAUTHORIZED" || message.startsWith("TOKEN_") ? 401 : message === "ORIGIN" ? 403 : message.includes("SIGNATURE") || message.includes("EVENT_INVALID") ? 400 : message === "BILLING_CONFIGURATION_INVALID" ? 503 : 502;
  return response(
    {
      error: status2 === 401 ? "\u8A8D\u8A3C\u306E\u6709\u52B9\u671F\u9650\u304C\u5207\u308C\u307E\u3057\u305F\u3002Sky\u304B\u3089\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002" : status2 === 403 ? "Sky\u4EE5\u5916\u304B\u3089\u306E\u64CD\u4F5C\u306F\u53D7\u3051\u4ED8\u3051\u307E\u305B\u3093\u3002" : status2 === 503 ? "\u6C7A\u6E08\u30B5\u30FC\u30D3\u30B9\u306E\u8A2D\u5B9A\u304C\u5B8C\u4E86\u3057\u3066\u3044\u307E\u305B\u3093\u3002" : "\u6C7A\u6E08\u30B5\u30FC\u30D3\u30B9\u3068\u901A\u4FE1\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    },
    status2,
    origin
  );
}
__name(errorResponse, "errorResponse");
var worker_default = {
  async fetch(request, env) {
    let origin;
    try {
      const { skyOrigin } = configuration(env);
      origin = request.headers.get("origin") === skyOrigin ? skyOrigin : void 0;
      const url = new URL(request.url);
      if (request.method === "OPTIONS") {
        if (!origin) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: cors(origin) });
      }
      if (request.method === "GET" && url.pathname === "/health")
        return response({
          ok: true,
          price: { amountMinor: 888, currency: "usd", interval: "month" }
        });
      if (request.method === "GET" && url.pathname === "/v1/status")
        return await status(request, env);
      if (request.method === "POST" && url.pathname === "/v1/checkout")
        return await checkout(request, env);
      if (request.method === "POST" && url.pathname === "/v1/portal")
        return await portal(request, env);
      if (request.method === "POST" && url.pathname === "/v1/webhooks/stripe")
        return await webhook(request, env);
      return response({ error: "not_found" }, 404, origin);
    } catch (error) {
      return errorResponse(error, origin);
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
