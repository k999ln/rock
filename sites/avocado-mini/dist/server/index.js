const products = {
  tower: { name: 'avocadoMini Tower20 E3 · Single input tower', baseJpy: 160000, amountKey: 'PREORDER_TOWER_TOTAL_JPY', capacityKey: 'PREORDER_TOWER_CAPACITY' },
  kit: { name: 'avocadoMini Tower20 E3 · 4 towers + Edge Hub', baseJpy: 410000, amountKey: 'PREORDER_KIT_TOTAL_JPY', capacityKey: 'PREORDER_KIT_CAPACITY' },
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});

const MAX_CHECKOUT_BODY_BYTES = 1024;
const STALE_RESERVATION_MS = 25 * 60 * 60 * 1000;
const ATTEMPT_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function offer(env) {
  const amounts = Object.fromEntries(Object.entries(products).map(([sku, product]) => [sku, positiveInteger(env[product.amountKey])]));
  const capacities = Object.fromEntries(Object.entries(products).map(([sku, product]) => [sku, positiveInteger(env[product.capacityKey])]));
  const hasTerms = [
    env.PREORDER_SELLER_NAME, env.PREORDER_SELLER_ADDRESS, env.PREORDER_SELLER_PHONE,
    env.PREORDER_SHIPPING_FEE, env.PREORDER_SHIPPING_DATE, env.PREORDER_CANCELLATION_TERMS,
    env.PREORDER_TERMS_VERSION,
  ].every(value => typeof value === 'string' && value.trim());
  const ready = env.PREORDER_SALES_ENABLED === 'true' && hasTerms && env.PREORDER_TERMS_APPROVED === 'true'
    && env.PREORDER_TOTAL_INCLUDES_SHIPPING === 'true'
    && !/undecided|not determined|not finalized|tbd/i.test(env.PREORDER_SHIPPING_DATE)
    && Boolean(env.DB && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.PREORDER_ABUSE_KEY && env.PREORDER_ADMIN_TOKEN)
    && Object.entries(amounts).every(([sku, amount]) => amount && amount >= products[sku].baseJpy)
    && Object.values(capacities).every(Boolean);
  return {
    ready,
    products: Object.fromEntries(Object.entries(products).map(([sku, product]) => [sku, {
      name: product.name,
      baseJpy: product.baseJpy,
      totalJpy: ready ? amounts[sku] : null,
    }])),
    terms: ready ? {
      sellerName: env.PREORDER_SELLER_NAME,
      sellerAddress: env.PREORDER_SELLER_ADDRESS,
      sellerPhone: env.PREORDER_SELLER_PHONE,
      shippingFee: env.PREORDER_SHIPPING_FEE,
      shippingDate: env.PREORDER_SHIPPING_DATE,
      cancellation: env.PREORDER_CANCELLATION_TERMS,
      version: env.PREORDER_TERMS_VERSION,
    } : null,
    amounts,
    capacities,
  };
}

async function reserve(env, sku, capacity) {
  await env.DB.prepare('INSERT INTO preorder_stock (sku, capacity, reserved) VALUES (?, ?, 0) ON CONFLICT(sku) DO UPDATE SET capacity = excluded.capacity')
    .bind(sku, capacity).run();
  const result = await env.DB.prepare('UPDATE preorder_stock SET reserved = reserved + 1 WHERE sku = ? AND reserved < capacity').bind(sku).run();
  return result.meta?.changes === 1;
}

async function release(env, sku) {
  await env.DB.prepare('UPDATE preorder_stock SET reserved = reserved - 1 WHERE sku = ? AND reserved > 0').bind(sku).run();
}

async function checkRateLimit(request, env, sku) {
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip) return false;
  const now = Date.now();
  await env.DB.prepare('DELETE FROM preorder_attempts WHERE created_at < ?').bind(now - ATTEMPT_RETENTION_MS).run();
  const day = new Date().toISOString().slice(0, 10);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.PREORDER_ABUSE_KEY}:${day}:${sku}:${ip}`));
  const key = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const limit = positiveInteger(env.PREORDER_ATTEMPT_LIMIT) || 5;
  const result = await env.DB.prepare('INSERT INTO preorder_attempts (key, count, created_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ?')
    .bind(key, now, limit).run();
  return result.meta?.changes === 1;
}

async function releaseStaleReservations(env, now = Date.now()) {
  if (!env.DB) return 0;
  const result = await env.DB.prepare("SELECT id, sku FROM preorders WHERE status IN ('pending_payment', 'checkout_unknown') AND updated_at < ? LIMIT 50")
    .bind(now - STALE_RESERVATION_MS).all();
  let released = 0;
  for (const row of result.results || []) {
    const update = await env.DB.prepare("UPDATE preorders SET status = 'expired_reconciled', updated_at = ? WHERE id = ? AND status IN ('pending_payment', 'checkout_unknown')")
      .bind(now, row.id).run();
    if (update.meta?.changes === 1) {
      await release(env, row.sku);
      released += 1;
    }
  }
  return released;
}

async function createCheckout(request, env) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Invalid request origin.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Invalid request format.' }, 415);
  if (Number(request.headers.get('content-length') || 0) > MAX_CHECKOUT_BODY_BYTES) return json({ error: 'The request is too large.' }, 413);
  const configuration = offer(env);
  if (!configuration.ready) return json({ error: 'Pre-orders are not open yet.' }, 503);
  await releaseStaleReservations(env);
  let body;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_CHECKOUT_BODY_BYTES) return json({ error: 'The request is too large.' }, 413);
    body = JSON.parse(raw);
  } catch { return json({ error: 'Invalid request format.' }, 400); }
  const sku = body?.sku;
  if (!Object.hasOwn(products, sku)) return json({ error: 'Please select a valid product.' }, 400);
  if (body?.termsAccepted !== true || body?.termsVersion !== configuration.terms.version) {
    return json({ error: 'Review and accept the latest sales and privacy terms before continuing.' }, 409);
  }
  if (!await checkRateLimit(request, env, sku)) return json({ error: 'Too many reservation attempts from this connection. Please try again later.' }, 429);
  const product = products[sku];
  const amount = configuration.amounts[sku];
  const orderId = crypto.randomUUID();
  const now = Date.now();
  let reserved = false;
  try {
    reserved = await reserve(env, sku, configuration.capacities[sku]);
    if (!reserved) return json({ error: 'Reservations for this product are full.' }, 409);
    const acceptedAt = now;
    const expiresAt = Math.floor(now / 1000) + 30 * 60;
    await env.DB.prepare('INSERT INTO preorders (id, sku, amount_jpy, terms_snapshot_json, terms_version, terms_accepted_at, stripe_expires_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(orderId, sku, amount, JSON.stringify({ sku, amountJpy: amount, acceptedAt, ...configuration.terms }), configuration.terms.version, acceptedAt, expiresAt * 1000, 'pending_payment', now, now).run();
    const origin = new URL(request.url).origin;
    const form = new URLSearchParams({
      mode: 'payment',
      client_reference_id: orderId,
      'line_items[0][price_data][currency]': 'jpy',
      'line_items[0][price_data][unit_amount]': String(amount),
      'line_items[0][price_data][product_data][name]': product.name,
      'line_items[0][quantity]': '1',
      'metadata[order_id]': orderId,
      'metadata[sku]': sku,
      'payment_intent_data[metadata][order_id]': orderId,
      'shipping_address_collection[allowed_countries][0]': 'JP',
      'phone_number_collection[enabled]': 'true',
      expires_at: String(expiresAt),
      success_url: `${origin}/preorder/complete/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/preorder/`,
    });
    let stripeResponse;
    let session;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
            'content-type': 'application/x-www-form-urlencoded',
            'idempotency-key': orderId,
          },
          body: form,
        });
        session = await stripeResponse.json();
        if (stripeResponse.ok) break;
        if (stripeResponse.status < 500) break;
      } catch (error) {
        if (attempt === 1) throw error;
      }
    }
    const checkoutUrl = session?.url ? new URL(session.url) : null;
    if (!stripeResponse?.ok || !session?.id || !checkoutUrl || checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com') {
      throw new Error('Stripe checkout session could not be created');
    }
    await env.DB.prepare('UPDATE preorders SET stripe_session_id = ?, updated_at = ? WHERE id = ?')
      .bind(session.id, Date.now(), orderId).run();
    return json({ url: session.url });
  } catch (error) {
    // A network failure can have created a Stripe session; retain the order for reconciliation.
    console.error('preorder_checkout_failed', { orderId, sku, error: String(error) });
    if (reserved) await env.DB.prepare('UPDATE preorders SET status = ?, updated_at = ? WHERE id = ? AND status = ?')
      .bind('checkout_unknown', Date.now(), orderId, 'pending_payment').run().catch(() => {});
    return json({ error: 'Checkout could not be opened. Do not place another order until the payment status has been checked.' }, 503);
  }
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

async function verifyStripe(raw, signature, secret) {
  const fields = Object.fromEntries(signature.split(',').map(part => part.split('=', 2)));
  const timestamp = Number(fields.t);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300 || !fields.v1) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${raw}`));
  const expected = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return signature.split(',').some(part => part.startsWith('v1=') && constantTimeEqual(part.slice(3), expected));
}

async function webhook(request, env) {
  if (!env.DB || !env.STRIPE_WEBHOOK_SECRET) return json({ error: 'unavailable' }, 503);
  if (Number(request.headers.get('content-length') || 0) > 131072) return json({ error: 'too_large' }, 413);
  const raw = await request.text();
  if (raw.length > 131072 || !await verifyStripe(raw, request.headers.get('stripe-signature') || '', env.STRIPE_WEBHOOK_SECRET)) {
    return json({ error: 'invalid_signature' }, 400);
  }
  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: 'invalid_event' }, 400); }
  if (!event?.id || !event.type || !event.data?.object) return json({ error: 'invalid_event' }, 400);
  const object = event.data.object;
  const orderId = object.client_reference_id || object.metadata?.order_id || null;
  const now = Date.now();
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      if (object.payment_status === 'paid' && orderId && object.id) {
        await env.DB.prepare("UPDATE preorders SET status = 'paid', stripe_session_id = ?, stripe_payment_intent_id = ?, paid_at = ?, updated_at = ? WHERE id = ? AND amount_jpy = ? AND status IN ('pending_payment', 'checkout_unknown')")
          .bind(object.id, object.payment_intent || null, now, now, orderId, object.amount_total).run();
      }
    } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      const row = orderId ? await env.DB.prepare("SELECT sku FROM preorders WHERE id = ? AND status IN ('pending_payment', 'checkout_unknown')").bind(orderId).first() : null;
      if (row) {
        const result = await env.DB.prepare("UPDATE preorders SET status = 'expired', updated_at = ? WHERE id = ? AND status IN ('pending_payment', 'checkout_unknown')").bind(now, orderId).run();
        if (result.meta?.changes === 1) await release(env, row.sku);
      }
    } else if (event.type === 'charge.refunded' && object.payment_intent) {
      await env.DB.prepare("UPDATE preorders SET status = 'refunded', updated_at = ? WHERE stripe_payment_intent_id = ? AND status = 'paid' AND amount_jpy <= ?")
        .bind(now, object.payment_intent, object.amount_refunded || 0).run();
    } else if (event.type === 'charge.dispute.created' && object.payment_intent) {
      await env.DB.prepare("UPDATE preorders SET status = 'disputed', updated_at = ? WHERE stripe_payment_intent_id = ? AND status IN ('paid', 'refunded')")
        .bind(now, object.payment_intent).run();
    }
    await env.DB.prepare('INSERT OR IGNORE INTO preorder_events (id, type, order_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(event.id, event.type, orderId, now).run();
    return json({ received: true });
  } catch (error) {
    console.error('preorder_webhook_failed', { eventId: event.id, error: String(error) });
    return json({ error: 'retry' }, 500);
  }
}

function adminAuthorized(request, env) {
  const authorization = request.headers.get('authorization') || '';
  const expected = `Bearer ${env.PREORDER_ADMIN_TOKEN || ''}`;
  return expected.length > 20 && constantTimeEqual(authorization, expected);
}

async function adminOrders(request, env) {
  if (!env.DB || !adminAuthorized(request, env)) return json({ error: 'unauthorized' }, 401);
  const limit = Math.min(100, positiveInteger(new URL(request.url).searchParams.get('limit')) || 50);
  const result = await env.DB.prepare('SELECT id, sku, amount_jpy, status, stripe_session_id, stripe_payment_intent_id, created_at, updated_at, paid_at, terms_version, terms_accepted_at FROM preorders ORDER BY created_at DESC LIMIT ?')
    .bind(limit).all();
  return json({ orders: result.results || [] });
}

async function adminReconcile(request, env) {
  if (!env.DB || !adminAuthorized(request, env)) return json({ error: 'unauthorized' }, 401);
  return json({ released: await releaseStaleReservations(env) });
}

async function status(request, env) {
  if (!env.DB) return json({ error: 'unavailable' }, 503);
  const sessionId = new URL(request.url).searchParams.get('session_id');
  if (!sessionId || !/^cs_(test_|live_)[A-Za-z0-9]{10,}$/.test(sessionId)) return json({ error: 'invalid_session' }, 400);
  const row = await env.DB.prepare('SELECT status FROM preorders WHERE stripe_session_id = ?').bind(sessionId).first();
  return row ? json({ status: row.status }) : json({ error: 'not_found' }, 404);
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    try {
      if (path === '/api/preorders/offer' && request.method === 'GET') {
        const { ready, products: offeredProducts, terms } = offer(env);
        return json({ ready, products: offeredProducts, terms });
      }
      if (path === '/api/preorders/checkout' && request.method === 'POST') return createCheckout(request, env);
      if (path === '/api/preorders/webhook' && request.method === 'POST') return webhook(request, env);
      if (path === '/api/preorders/status' && request.method === 'GET') return status(request, env);
      if (path === '/api/admin/preorders' && request.method === 'GET') return adminOrders(request, env);
      if (path === '/api/admin/reconcile' && request.method === 'POST') return adminReconcile(request, env);
      if (path.startsWith('/api/')) return json({ error: 'not_found' }, 404);
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Assets unavailable', { status: 503 });
    } catch (error) {
      console.error('preorder_request_failed', { path, error: String(error) });
      return json({ error: 'service_unavailable' }, 503);
    }
  },
};
