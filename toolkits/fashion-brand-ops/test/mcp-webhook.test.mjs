import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { McpProtocol } from "../src/mcp.mjs";
import { createRuntime } from "../src/runtime.mjs";
import { TOOL_DEFINITIONS } from "../src/tools.mjs";
import { extractInstagramMessages, verifyMetaSignature, verifyStripeSignature } from "../src/webhooks.mjs";

test("MCP initializes, discovers all required tools, and calls a tool", async (t) => {
  const runtime = createRuntime({ config: { dbPath: ":memory:", approvalSecret: "x".repeat(40), creativeProvider: "mock", socialProvider: "mock", paymentProvider: "mock", notificationProvider: "mock" } });
  t.after(() => runtime.store.close());
  const mcp = new McpProtocol(runtime.callTool);
  const init = await mcp.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.equal(init.result.serverInfo.name, "fashion-brand-ops-mcp");
  assert.equal(init.result.serverInfo.version, "0.2.0");
  const listed = await mcp.handle({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const names = listed.result.tools.map((tool) => tool.name);
  for (const required of ["fashion.autopilot.goal.create", "fashion.autopilot.tick", "fashion.autopilot.run", "fashion.concierge.prepare", "fashion.sales.pipeline.get", "fashion.production.plan", "fashion.production.dashboard", "fashion.executive.dashboard", "fashion.system.readiness", "instagram.accounts.list", "instagram.content_plan.create", "instagram.draft.create", "instagram.schedule.prepare", "instagram.publish.prepare", "instagram.insights.sync", "instagram.dm.classify", "approval.execute"]) assert.ok(names.includes(required));
  assert.equal(new Set(names).size, TOOL_DEFINITIONS.length);
  const called = await mcp.handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "fashion.brand.upsert", arguments: { id: "brand1", name: "Akume", policy: {} } } });
  assert.equal(called.result.structuredContent.id, "brand1");
});

test("Stripe webhook signatures are timestamp-bound and tamper evident", () => {
  const secret = "whsec_test";
  const timestamp = 2_000_000_000;
  const body = JSON.stringify({ id: "evt_1" });
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  assert.equal(verifyStripeSignature(body, `t=${timestamp},v1=${signature}`, secret, { nowMs: timestamp * 1000 }), true);
  assert.throws(() => verifyStripeSignature(`${body}x`, `t=${timestamp},v1=${signature}`, secret, { nowMs: timestamp * 1000 }), /stripe_signature_invalid/);
  assert.throws(() => verifyStripeSignature(body, `t=${timestamp},v1=${signature}`, secret, { nowMs: (timestamp + 301) * 1000 }), /stripe_signature_expired/);
});

test("Instagram webhook parsing accepts message text and ignores unsupported events", () => {
  const messages = extractInstagramMessages({ entry: [{ id: "ig1", messaging: [{ sender: { id: "buyer" }, message: { mid: "mid1", text: "購入したい" } }, { sender: { id: "buyer" }, message: { mid: "mid2", attachments: [] } }] }] });
  assert.deepEqual(messages, [{ account_external_id: "ig1", external_message_id: "mid1", customer_external_ref: "buyer", body: "購入したい" }]);
});

test("Meta webhook signature rejects tampered DM payloads", () => {
  const secret = "meta-secret";
  const body = JSON.stringify({ object: "instagram", entry: [] });
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyMetaSignature(body, `sha256=${signature}`, secret), true);
  assert.throws(() => verifyMetaSignature(`${body}x`, `sha256=${signature}`, secret), /meta_signature_invalid/);
});
