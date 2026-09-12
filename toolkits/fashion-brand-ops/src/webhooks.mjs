import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyStripeSignature(rawBody, signatureHeader, secret, options = {}) {
  if (!secret) throw new Error("stripe_webhook_secret_not_configured");
  const parts = Object.fromEntries(String(signatureHeader || "").split(",").map((item) => item.split("=", 2)));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || !parts.v1) throw new Error("stripe_signature_invalid");
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestamp) > (options.toleranceSeconds || 300)) throw new Error("stripe_signature_expired");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const supplied = Buffer.from(parts.v1, "hex");
  const wanted = Buffer.from(expected, "hex");
  if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) throw new Error("stripe_signature_invalid");
  return true;
}

export function verifyMetaSignature(rawBody, signatureHeader, secret) {
  if (!secret) throw new Error("meta_app_secret_not_configured");
  const match = /^sha256=([0-9a-f]{64})$/.exec(String(signatureHeader || ""));
  if (!match) throw new Error("meta_signature_invalid");
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const supplied = Buffer.from(match[1], "hex");
  const wanted = Buffer.from(expected, "hex");
  if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) throw new Error("meta_signature_invalid");
  return true;
}

export function normalizeStripeEvent(event) {
  const object = event?.data?.object || {};
  return {
    provider: "stripe",
    event_id: String(event?.id || ""),
    event_type: String(event?.type || ""),
    payload: {
      id: object.id || null,
      order_id: object.client_reference_id || object.metadata?.order_id || null,
      metadata: object.metadata || {},
      payment_intent: object.payment_intent || object.payment_intent_details?.payment_intent || null,
      amount: object.amount_refunded || object.amount_paid || object.amount_total || null,
      status: object.status || null,
      refunded: object.refunded === true,
    },
  };
}

export function extractInstagramMessages(payload) {
  const messages = [];
  for (const entry of payload?.entry || []) {
    for (const event of entry.messaging || []) {
      if (!event.message?.text || !event.message?.mid || !event.sender?.id) continue;
      messages.push({ account_external_id: String(entry.id || ""), external_message_id: String(event.message.mid), customer_external_ref: String(event.sender.id), body: event.message.text });
    }
  }
  return messages;
}

export function resolveInstagramBrand(configuredBrand, accountBrand) {
  if (!accountBrand) throw new Error("instagram_webhook_brand_unresolved");
  if (configuredBrand && configuredBrand !== accountBrand) {
    throw new Error("instagram_webhook_brand_mismatch");
  }
  return accountBrand;
}
