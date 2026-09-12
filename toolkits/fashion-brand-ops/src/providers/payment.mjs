import { sha256 } from "../util.mjs";
import { requestJson, required } from "./http-client.mjs";

function form(value, prefix = "", target = new URLSearchParams()) {
  for (const [key, item] of Object.entries(value)) {
    const name = prefix ? `${prefix}[${key}]` : key;
    if (item === undefined || item === null) continue;
    if (typeof item === "object" && !Array.isArray(item)) form(item, name, target);
    else target.append(name, String(item));
  }
  return target;
}

export class MockPaymentProvider {
  name = "mock";
  async execute(action, payload) {
    const digest = sha256({ action, payload });
    return { provider: this.name, action, external_ref: `mock://payment/${digest}`, checkout_url: `https://example.invalid/pay/${digest.slice(0, 24)}`, status: "created", provider_readback_sha256: digest };
  }
}

export class StripePaymentProvider {
  name = "stripe";
  constructor(config, options = {}) { this.config = config; this.fetchImpl = options.fetchImpl; }
  async post(path, body, idempotencyKey) {
    const secret = required(this.config.stripeSecretKey, "stripe_secret_key_not_configured");
    return requestJson(`https://api.stripe.com/v1/${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/x-www-form-urlencoded", "idempotency-key": idempotencyKey },
      body: form(body).toString(),
      fetchImpl: this.fetchImpl,
    });
  }
  async execute(action, payload, context = {}) {
    let result;
    if (action === "payment.create_link") {
      result = await this.post("checkout/sessions", {
        mode: "payment",
        success_url: required(this.config.stripeSuccessUrl, "stripe_success_url_not_configured"),
        cancel_url: required(this.config.stripeCancelUrl, "stripe_cancel_url_not_configured"),
        client_reference_id: payload.order_id,
        metadata: { order_id: payload.order_id, brand_id: payload.brand_id },
        line_items: { 0: { quantity: payload.quantity, price_data: { currency: payload.currency.toLowerCase(), unit_amount: payload.unit_price_minor, product_data: { name: payload.product_name } } } },
      }, context.idempotencyKey);
    } else if (action === "payment.send_invoice") {
      const customer = await this.post("customers", { email: payload.customer_email, name: payload.customer_name, metadata: { customer_id: payload.customer_id } }, `${context.idempotencyKey}:customer`);
      await this.post("invoiceitems", { customer: customer.body.id, currency: payload.currency.toLowerCase(), unit_amount: payload.unit_price_minor * payload.quantity, description: payload.product_name, metadata: { order_id: payload.order_id } }, `${context.idempotencyKey}:item`);
      const invoice = await this.post("invoices", { customer: customer.body.id, collection_method: "send_invoice", days_until_due: payload.days_until_due || 7, metadata: { order_id: payload.order_id, brand_id: payload.brand_id } }, `${context.idempotencyKey}:invoice`);
      result = await this.post(`invoices/${encodeURIComponent(invoice.body.id)}/send`, {}, `${context.idempotencyKey}:send`);
    } else if (action === "payment.refund") {
      result = await this.post("refunds", { payment_intent: payload.payment_intent, amount: payload.amount_minor, metadata: { order_id: payload.order_id } }, context.idempotencyKey);
    } else throw new Error("payment_action_unsupported");
    return {
      provider: this.name,
      action,
      external_ref: String(result.body.id || ""),
      checkout_url: result.body.url || result.body.hosted_invoice_url || null,
      status: String(result.body.status || "created"),
      provider_readback_sha256: result.readback_digest,
    };
  }
}
