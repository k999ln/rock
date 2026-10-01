import assert from "node:assert/strict";
import test from "node:test";
import { MetaGraphSocialProvider } from "../src/providers/social.mjs";

test("Meta Graph adapter discovers multiple OAuth-authorized professional accounts without persisting tokens", async () => {
  const seen = [];
  const fetchImpl = async (url, options = {}) => {
    seen.push({ url: String(url), authorization: options.headers?.authorization });
    return new Response(JSON.stringify({ data: [
      { id: "page1", name: "A", instagram_business_account: { id: "ig1", username: "insta_akume" } },
      { id: "page2", name: "B", instagram_business_account: { id: "ig2", username: "iceiceice.mean" } },
    ] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const provider = new MetaGraphSocialProvider({ metaGraphApiBaseUrl: "https://graph.facebook.com/v99.0", metaAccessToken: "oauth-test-value", metaInsightsMetrics: ["reach"], allowedHosts: ["graph.facebook.com"] }, { fetchImpl });
  const accounts = await provider.listAccounts();
  assert.deepEqual(accounts.map((item) => item.username), ["insta_akume", "iceiceice.mean"]);
  assert.deepEqual(accounts.map((item) => item.credential_ref), ["env://META_ACCESS_TOKEN", "env://META_ACCESS_TOKEN"]);
  assert.equal(seen[0].authorization, "Bearer oauth-test-value");
  assert.equal(JSON.stringify(accounts).includes("oauth-test-value"), false);
});

test("Meta Graph scheduling is local and deterministic until the approved publish boundary", async () => {
  const provider = new MetaGraphSocialProvider({ allowedHosts: ["graph.facebook.com"] });
  const receipt = await provider.execute("social.schedule", { campaign_id: "cmp1", scheduled_for: "2030-01-01T00:00:00Z" });
  assert.equal(receipt.status, "scheduled");
  assert.match(receipt.external_ref, /^local-schedule:/);
  assert.match(receipt.provider_readback_sha256, /^[a-f0-9]{64}$/);
});
