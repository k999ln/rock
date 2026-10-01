import { sha256 } from "../util.mjs";
import { allowlistedUrl, authHeaders, requestJson } from "./http-client.mjs";

export class MockNotificationProvider {
  name = "mock";
  async execute(_action, payload) {
    const digest = sha256(payload);
    return { provider: this.name, external_ref: `mock://notification/${digest}`, status: "confirmed", provider_readback_sha256: digest };
  }
}

export class WebhookNotificationProvider {
  name = "webhook";
  constructor(config, options = {}) { this.config = config; this.fetchImpl = options.fetchImpl; }
  async execute(_action, payload, context = {}) {
    const result = await requestJson(allowlistedUrl(this.config.notificationWebhookUrl, this.config), {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders(this.config.notificationWebhookToken), "idempotency-key": context.idempotencyKey },
      body: JSON.stringify(payload), fetchImpl: this.fetchImpl,
    });
    return { provider: this.name, external_ref: String(result.body.id || ""), status: String(result.body.status || "confirmed"), provider_readback_sha256: result.readback_digest };
  }
}
