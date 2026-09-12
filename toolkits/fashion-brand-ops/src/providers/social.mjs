import { sha256 } from "../util.mjs";
import { allowlistedUrl, authHeaders, requestJson, required } from "./http-client.mjs";

export class MockSocialProvider {
  name = "mock";
  async listAccounts() { return []; }
  async syncInsights(account) {
    const digest = sha256(account);
    return { provider: this.name, account_id: account.id, metrics: [], provider_readback_sha256: digest };
  }
  async execute(action, payload) {
    const digest = sha256({ action, payload });
    return { provider: this.name, action, external_ref: `mock://social/${digest}`, status: "confirmed", provider_readback_sha256: digest };
  }
}

// The bridge contract intentionally keeps Meta API versioning and account topology outside core.
// POST {baseUrl}/{action} with the normalized payload and return an authoritative receipt.
export class HttpSocialProvider {
  name = "instagram-http";
  constructor(config, options = {}) { this.config = config; this.fetchImpl = options.fetchImpl; }
  async get(path) {
    const base = allowlistedUrl(this.config.socialProviderUrl, this.config);
    return requestJson(`${base}/${path}`, { headers: authHeaders(this.config.socialProviderToken), fetchImpl: this.fetchImpl });
  }
  async listAccounts() {
    const result = await this.get("accounts");
    return Array.isArray(result.body.accounts) ? result.body.accounts : [];
  }
  async syncInsights(account) {
    const result = await this.get(`accounts/${encodeURIComponent(account.external_account_id)}/insights`);
    return { provider: this.name, account_id: account.id, metrics: result.body.metrics || [], provider_readback_sha256: result.readback_digest };
  }
  async execute(action, payload, context = {}) {
    const base = allowlistedUrl(this.config.socialProviderUrl, this.config);
    const result = await requestJson(`${base}/${encodeURIComponent(action)}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders(this.config.socialProviderToken), "idempotency-key": context.idempotencyKey },
      body: JSON.stringify(payload),
      fetchImpl: this.fetchImpl,
    });
    return {
      provider: this.name,
      action,
      external_ref: String(result.body.external_ref || result.body.id || ""),
      status: String(result.body.status || "confirmed"),
      provider_readback_sha256: result.readback_digest,
    };
  }
}

export class MetaGraphSocialProvider {
  name = "meta-graph";
  constructor(config, options = {}) { this.config = config; this.fetchImpl = options.fetchImpl; }
  base() { return allowlistedUrl(this.config.metaGraphApiBaseUrl, this.config); }
  headers(extra = {}) { return { ...extra, ...authHeaders(this.config.metaAccessToken) }; }
  async listAccounts() {
    const result = await requestJson(`${this.base()}/me/accounts?fields=id,name,instagram_business_account{id,username,name}`, { headers: this.headers(), fetchImpl: this.fetchImpl });
    return (result.body.data || []).filter((item) => item.instagram_business_account).map((item) => ({
      external_account_id: String(item.instagram_business_account.id), username: item.instagram_business_account.username || item.instagram_business_account.name,
      page_id: String(item.id), page_name: item.name, credential_ref: "env://META_ACCESS_TOKEN", connection_status: "connected",
    }));
  }
  async syncInsights(account) {
    const metrics = encodeURIComponent(this.config.metaInsightsMetrics.join(","));
    const result = await requestJson(`${this.base()}/${encodeURIComponent(account.external_account_id)}/insights?metric=${metrics}&period=day`, { headers: this.headers(), fetchImpl: this.fetchImpl });
    return { provider: this.name, account_id: account.id, metrics: result.body.data || [], provider_readback_sha256: result.readback_digest };
  }
  async execute(action, payload, context = {}) {
    if (action === "social.schedule") {
      const digest = sha256({ action, payload });
      return { provider: this.name, action, external_ref: `local-schedule://${payload.campaign_id}`, status: "scheduled", provider_readback_sha256: digest };
    }
    if (action === "social.publish") {
      const accountId = required(payload.account_external_id, "instagram_account_not_selected");
      const imageUrl = required(payload.media_url, "instagram_media_url_required");
      const container = await requestJson(`${this.base()}/${encodeURIComponent(accountId)}/media`, {
        method: "POST", headers: this.headers({ "content-type": "application/json", "idempotency-key": context.idempotencyKey }),
        body: JSON.stringify({ image_url: imageUrl, caption: payload.caption }), fetchImpl: this.fetchImpl,
      });
      const published = await requestJson(`${this.base()}/${encodeURIComponent(accountId)}/media_publish`, {
        method: "POST", headers: this.headers({ "content-type": "application/json", "idempotency-key": `${context.idempotencyKey}:publish` }),
        body: JSON.stringify({ creation_id: container.body.id }), fetchImpl: this.fetchImpl,
      });
      const readback = await requestJson(`${this.base()}/${encodeURIComponent(published.body.id)}?fields=id,permalink,timestamp`, { headers: this.headers(), fetchImpl: this.fetchImpl });
      return { provider: this.name, action, external_ref: String(published.body.id), permalink: readback.body.permalink || null, status: "confirmed", provider_readback_sha256: readback.readback_digest };
    }
    if (action === "dm.reply") {
      const pageId = required(payload.page_id, "instagram_page_id_required");
      const recipientId = required(payload.recipient_external_id, "instagram_recipient_required");
      const result = await requestJson(`${this.base()}/${encodeURIComponent(pageId)}/messages`, {
        method: "POST", headers: this.headers({ "content-type": "application/json", "idempotency-key": context.idempotencyKey }),
        body: JSON.stringify({ recipient: { id: recipientId }, message: { text: payload.body } }), fetchImpl: this.fetchImpl,
      });
      return { provider: this.name, action, external_ref: String(result.body.message_id || result.body.id || ""), status: "confirmed", provider_readback_sha256: result.readback_digest };
    }
    throw new Error("meta_graph_action_unsupported");
  }
}
