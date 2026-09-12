#!/usr/bin/env node
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createRuntime } from "./runtime.mjs";
import { McpProtocol } from "./mcp.mjs";
import { extractInstagramMessages, normalizeStripeEvent, verifyMetaSignature, verifyStripeSignature } from "./webhooks.mjs";
import { publicError } from "./util.mjs";

const runtime = createRuntime();
const protocol = new McpProtocol(runtime.callTool);

if (!["127.0.0.1", "::1", "localhost"].includes(runtime.config.httpHost) && (!runtime.config.mcpBearerToken || !runtime.config.tenantId)) {
  throw new Error("fashion_mcp_auth_and_tenant_required_for_non_loopback_bind");
}

function authorized(req) {
  if (!runtime.config.mcpBearerToken) return true;
  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(supplied);
  const b = Buffer.from(runtime.config.mcpBearerToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

function tenantAuthorized(req) {
  return !runtime.config.tenantId || req.headers["x-rockstar-tenant-id"] === runtime.config.tenantId;
}

function send(res, status, body, contentType = "application/json") {
  res.writeHead(status, { "content-type": `${contentType}; charset=utf-8`, "cache-control": "no-store" });
  res.end(contentType === "application/json" ? JSON.stringify(body) : String(body));
}

async function raw(req, maxBytes = 1_048_576) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, service: "fashion-brand-ops-mcp", providers: { creative: runtime.providers.creative.name, social: runtime.providers.social.name, payment: runtime.providers.payment.name, notification: runtime.providers.notification.name } });
  if (req.method === "POST" && url.pathname === "/mcp") {
    if (!authorized(req) || !tenantAuthorized(req)) return send(res, 401, { error: "unauthorized" });
    const message = JSON.parse(await raw(req));
    const response = await protocol.handle(message);
    return response ? send(res, 200, response) : send(res, 202, {});
  }
  if (req.method === "GET" && url.pathname === "/webhooks/instagram") {
    const valid = url.searchParams.get("hub.mode") === "subscribe" && runtime.config.instagramVerifyToken && url.searchParams.get("hub.verify_token") === runtime.config.instagramVerifyToken;
    return valid ? send(res, 200, url.searchParams.get("hub.challenge") || "", "text/plain") : send(res, 403, { error: "instagram_verification_failed" });
  }
  if (req.method === "POST" && url.pathname === "/webhooks/instagram") {
    const body = await raw(req);
    verifyMetaSignature(body, req.headers["x-hub-signature-256"], runtime.config.metaAppSecret);
    const payload = JSON.parse(body);
    const results = [];
    for (const message of extractInstagramMessages(payload)) {
      const configuredBrand = url.searchParams.get("brand_id");
      const account = runtime.store.get("SELECT * FROM social_accounts WHERE external_account_id = ? AND connection_status = 'connected'", message.account_external_id);
      const brandId = configuredBrand || account?.brand_id;
      if (!brandId) throw new Error("instagram_webhook_brand_unresolved");
      results.push(runtime.service.ingestDm({ brand_id: brandId, provider: "instagram", ...message }));
    }
    return send(res, 200, { received: true, processed: results.length, results });
  }
  if (req.method === "POST" && url.pathname === "/webhooks/stripe") {
    const body = await raw(req);
    verifyStripeSignature(body, req.headers["stripe-signature"], runtime.config.stripeWebhookSecret);
    const result = runtime.service.processPaymentEvent(normalizeStripeEvent(JSON.parse(body)));
    return send(res, 200, { received: true, result });
  }
  return send(res, 404, { error: "not_found" });
}

const server = http.createServer((req, res) => handler(req, res).catch((error) => send(res, error.message.includes("signature") || error.message.includes("verification") ? 401 : 400, { error: publicError(error) })));
server.listen(runtime.config.httpPort, runtime.config.httpHost, () => process.stderr.write(`fashion-brand-ops-mcp listening on ${runtime.config.httpHost}:${runtime.config.httpPort}\n`));

function close() { server.close(() => { runtime.store.close(); process.exit(0); }); }
process.on("SIGINT", close);
process.on("SIGTERM", close);
