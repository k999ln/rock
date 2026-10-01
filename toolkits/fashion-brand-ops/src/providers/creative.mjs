import { id, sha256 } from "../util.mjs";
import { allowlistedUrl, authHeaders, requestJson } from "./http-client.mjs";

export class MockCreativeProvider {
  name = "mock";
  async generate(input) {
    const digest = sha256(input);
    return {
      provider: this.name,
      provider_job_id: `mock_creative_${digest.slice(0, 16)}`,
      status: "ready",
      assets: [{ media_type: input.media_type, url: `mock://creative/${digest}`, prompt_digest: sha256(input.prompt) }],
      provider_readback_sha256: digest,
    };
  }
}

export class HiggsfieldCreativeProvider {
  name = "higgsfield";
  constructor(config, options = {}) { this.config = config; this.fetchImpl = options.fetchImpl; }
  async generate(input, context = {}) {
    const endpoint = allowlistedUrl(this.config.higgsfieldApiUrl, this.config);
    const result = await requestJson(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders(this.config.higgsfieldApiKey), "idempotency-key": context.idempotencyKey || id("req") },
      body: JSON.stringify({ prompt: input.prompt, media_type: input.media_type, aspect_ratio: input.aspect_ratio, duration_seconds: input.duration_seconds, metadata: input.metadata }),
      fetchImpl: this.fetchImpl,
    });
    return {
      provider: this.name,
      provider_job_id: String(result.body.id || result.body.job_id || ""),
      status: String(result.body.status || "submitted"),
      assets: Array.isArray(result.body.assets) ? result.body.assets : [],
      provider_readback_sha256: result.readback_digest,
    };
  }
}
