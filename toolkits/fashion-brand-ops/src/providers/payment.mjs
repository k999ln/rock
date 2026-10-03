import { sha256 } from "../util.mjs";
import { required } from "./http-client.mjs";

import { stripeIdempotencyKey, stripeRequest } from "../shared/stripe.mjs";

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
    const bodyResult = await stripeRequest({
      path: `/v1/${path}`, method: "POST", secretKey: secret,
      parameters: body, idempotencyKey: stripeIdempotencyKey(idempotencyKey),
      fetchImpl: this.fetchImpl, timeoutMs: 30_000,
    });
    if (typeof bodyResult.id !== "string" || !bodyResult.id) throw new Error("stripe_response_id_missing");
    return { body: bodyResult, readback_digest: sha256(bodyResult) };
  }

  async execute(action, payload, context = {}) {
    let result;
    if (!["payment.create_link", "payment.send_invoice", "payment.refund"].includes(action)) {
      throw new Error("payment_action_unsupported");
    }
    const idempotencyKey = stripeIdempotencyKey(context.idempotencyKey);
    // Check every derived key before the first invoice request has a side effect.
    if (action === "payment.send_invoice") {
      for (const suffix of ["customer", "item", "invoice", "send"]) stripeIdempotencyKey(`${idempotencyKey}:${suffix}`);
    }
    if (action === "payment.create_link") {
      result = await this.post("checkout/sessions", {
        mode: "payment",
        success_url: required(this.config.stripeSuccessUrl, "stripe_success_url_not_configured"),
        cancel_url: required(this.config.stripeCancelUrl, "stripe_cancel_url_not_configured"),
        client_reference_id: payload.order_id,
        metadata: { order_id: payload.order_id, brand_id: payload.brand_id },
        line_items: { 0: { quantity: payload.quantity, price_data: { currency: payload.currency.toLowerCase(), unit_amount: payload.unit_price_minor, product_data: { name: payload.product_name } } } },
      }, idempotencyKey);
    } else if (action === "payment.send_invoice") {
      const customer = await this.post("customers", { email: payload.customer_email, name: payload.customer_name, metadata: { customer_id: payload.customer_id } }, `${idempotencyKey}:customer`);
      await this.post("invoiceitems", { customer: customer.body.id, currency: payload.currency.toLowerCase(), unit_amount: payload.unit_price_minor * payload.quantity, description: payload.product_name, metadata: { order_id: payload.order_id } }, `${idempotencyKey}:item`);
      const invoice = await this.post("invoices", { customer: customer.body.id, collection_method: "send_invoice", days_until_due: payload.days_until_due || 7, metadata: { order_id: payload.order_id, brand_id: payload.brand_id } }, `${idempotencyKey}:invoice`);
      result = await this.post(`invoices/${encodeURIComponent(invoice.body.id)}/send`, {}, `${idempotencyKey}:send`);
    } else if (action === "payment.refund") {
      result = await this.post("refunds", { payment_intent: payload.payment_intent, amount: payload.amount_minor, metadata: { order_id: payload.order_id } }, idempotencyKey);
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
