import assert from "node:assert/strict";
import test from "node:test";
import { signApprovalGrant } from "../src/approval.mjs";
import { createRuntime } from "../src/runtime.mjs";

const secret = "test-only-approval-secret-at-least-32-bytes-long";

function fixture() {
  return createRuntime({ config: {
    dbPath: ":memory:", approvalSecret: secret,
    creativeProvider: "mock", socialProvider: "mock", paymentProvider: "mock", notificationProvider: "mock",
  } });
}

function seed(runtime) {
  const brand = runtime.service.upsertBrand({ id: "brand1", name: "Still Form", policy: { concept: "静かな高級感と職人性", regions: ["JP", "US"], faq: { size: "採寸表をお送りします。身長と普段のサイズを教えてください。" } } });
  const result = runtime.service.upsertProduct({ id: "coat1", brand_id: brand.id, name: "Sculpted Coat", design: { material: "wool", lead_time: "4 weeks", silhouette: "oversized" }, price_minor: 88000, currency: "JPY", status: "active" });
  return { brand, product: result.product };
}

function grant(runtime, approval, key) {
  const request = runtime.store.get("SELECT * FROM approval_requests WHERE id = ?", approval.approval_id);
  const grantToken = signApprovalGrant(request, "owner:kai", secret);
  return runtime.service.executeApproved({ approval_id: approval.approval_id, grant_token: grantToken, idempotency_key: key });
}

test("brand, market, creative, analytics, and feedback form a closed loop", async (t) => {
  const runtime = fixture();
  t.after(() => runtime.store.close());
  const { brand, product } = seed(runtime);
  const market = runtime.service.analyzeMarket({ brand_id: brand.id, product_id: product.id });
  assert.equal(market.primary_segment, "luxury");

  const creative = runtime.service.prepareCreative({ brand_id: brand.id, product_id: product.id, media_type: "image", format: "4:5" });
  assert.equal(creative.approval_required, true);
  const completed = await grant(runtime, creative.approval, "creative-1");
  assert.equal(completed.effect.status, "completed");
  assert.equal(runtime.store.get("SELECT status FROM creative_assets WHERE id = ?", creative.asset_id).status, "ready");

  runtime.service.recordMetric({ brand_id: brand.id, metric_type: "instagram.reach", value: 1200 });
  const feedback = runtime.service.buildFeedback({ brand_id: brand.id });
  assert.equal(feedback.version, 1);
  assert.ok(feedback.feedback.recommendations.length > 0);
});

test("existing price changes are inert until an exact signed approval executes once", async (t) => {
  const runtime = fixture();
  t.after(() => runtime.store.close());
  const { brand, product } = seed(runtime);
  const proposed = runtime.service.upsertProduct({ id: product.id, brand_id: brand.id, name: product.name, design: product.design, price_minor: 99000, currency: "JPY", status: "active" });
  assert.equal(proposed.approval_required, true);
  assert.equal(runtime.service.productGet(product.id).price_minor, 88000);
  await assert.rejects(runtime.service.executeApproved({ approval_id: proposed.approval.approval_id, grant_token: "invalid", idempotency_key: "price-1" }), /approval_grant_invalid/);
  const completed = await grant(runtime, proposed.approval, "price-1");
  assert.equal(runtime.service.productGet(product.id).price_minor, 99000);
  const replay = await runtime.service.executeApproved({ approval_id: proposed.approval.approval_id, grant_token: "ignored-after-completion", idempotency_key: "price-1" });
  assert.equal(replay.idempotent_replay, true);
  assert.equal(completed.effect.receipt.provider, "local-db");
  assert.equal(completed.effect.receipt.status, "completed");
  assert.equal(completed.effect.receipt.capability_id, "brand.intake");
});

test("PULSE-style Instagram account, plan, draft, schedule, insights and DM tools share the approval gate", async (t) => {
  const runtime = fixture();
  t.after(() => runtime.store.close());
  const { brand, product } = seed(runtime);
  const first = runtime.service.registerSocialAccount({ brand_id: brand.id, external_account_id: "178414000001", username: "insta_akume", credential_ref: "env://META_ACCESS_TOKEN", connection_status: "connected", metadata: { page_id: "page1" } });
  assert.throws(() => runtime.service.registerSocialAccount({ brand_id: brand.id, external_account_id: "178414000099", username: "unsafe", credential_ref: "env://META_ACCESS_TOKEN", metadata: { access_token: "must-not-store" } }), /contains_secret/);
  const second = runtime.service.registerSocialAccount({ brand_id: brand.id, external_account_id: "178414000002", username: "iceiceice.mean", credential_ref: "vault://instagram/account2", connection_status: "connected", metadata: { page_id: "page2" } });
  runtime.service.switchSocialAccount({ brand_id: brand.id, account_id: second.id });
  assert.equal(runtime.service.listSocialAccounts({ brand_id: brand.id })[0].username, "iceiceice.mean");
  assert.equal(runtime.service.listSocialAccounts({ brand_id: brand.id }).find((item) => item.id === first.id).credential_ref, "env://META_ACCESS_TOKEN");

  const plan = runtime.service.createContentPlan({ brand_id: brand.id, period_start: "2026-09-14", days: 14, posts_per_week: 3 });
  assert.equal(plan.strategy.slots.length, 6);
  const draft = runtime.service.composeSocial({ brand_id: brand.id, product_id: product.id, content_plan_id: plan.id, title: "素材と工程", format: "carousel" });
  assert.equal(draft.social_account_id, second.id);
  const schedule = runtime.service.prepareSocial({ campaign_id: draft.id, action: "schedule", scheduled_for: "2030-09-14T19:00:00Z" });
  assert.equal(runtime.store.get("SELECT status FROM campaigns WHERE id = ?", draft.id).status, "approval_required");
  await grant(runtime, schedule.approval, "schedule-1");
  assert.equal(runtime.store.get("SELECT status FROM campaigns WHERE id = ?", draft.id).status, "scheduled");

  const dm = runtime.service.ingestDm({ brand_id: brand.id, provider: "instagram", external_message_id: "mid1", customer_external_ref: "sender1", body: "サイズを相談して購入したいです" });
  assert.equal(dm.classification, "purchase");
  assert.ok(dm.purchase_intent >= 0.9);
  const reply = runtime.service.prepareDmReply({ message_id: dm.message_id });
  assert.equal(reply.approval_required, true);
});

test("order payment only advances from verified idempotent provider events", async (t) => {
  const runtime = fixture();
  t.after(() => runtime.store.close());
  const { brand, product } = seed(runtime);
  const incomplete = runtime.service.collectOrder({ brand_id: brand.id, product_id: product.id, customer_external_ref: "buyer-incomplete", customer: { name: "Incomplete" }, shipping: {}, quantity: 1 });
  assert.throws(() => runtime.service.preparePayment({ order_id: incomplete.order.id, kind: "link" }), /order_information_incomplete/);
  const collected = runtime.service.collectOrder({ brand_id: brand.id, product_id: product.id, customer_external_ref: "buyer1", customer: { name: "A", email: "a@example.com" }, consent: { dm: true }, shipping: { country: "JP", address: "Tokyo" }, quantity: 1 });
  assert.deepEqual(collected.missing_fields, []);
  assert.throws(() => runtime.service.preparePayment({ order_id: collected.order.id, kind: "invoice", days_until_due: 91 }), /invoice_due_days_invalid/);
  assert.throws(() => runtime.service.preparePayment({ order_id: collected.order.id, kind: "refund", payment_intent: "pi-too-early" }), /paid_order_required_for_refund/);
  const payment = runtime.service.preparePayment({ order_id: collected.order.id, kind: "link" });
  await grant(runtime, payment.approval, "pay-link-1");
  assert.equal(runtime.service.orderGet(collected.order.id).status, "payment_pending");
  const event = { provider: "stripe", event_id: "evt1", event_type: "checkout.session.completed", payload: { id: "cs1", order_id: collected.order.id, payment_intent: "pi1", amount: 88000 } };
  const processed = runtime.service.processPaymentEvent(event);
  assert.equal(processed.order.status, "paid");
  assert.equal(runtime.service.processPaymentEvent(event).duplicate, true);
  assert.throws(() => runtime.service.processPaymentEvent({ ...event, payload: { ...event.payload, amount: 1 } }), /provider_event_digest_conflict/);
});

test("Campaign Autopilot persists a measurable plan and safely runs internal work", async (t) => {
  const runtime = fixture();
  t.after(() => runtime.store.close());
  const { brand, product } = seed(runtime);
  const created = runtime.service.createAutopilotGoal({
    id: "goal1",
    brand_id: brand.id,
    product_id: product.id,
    target_units: 30,
    target_revenue_minor: 2_640_000,
    target_gross_margin_bps: 6000,
    ad_budget_cap_minor: 120_000,
    starts_at: "2030-01-01T00:00:00.000Z",
    ends_at: "2030-02-01T00:00:00.000Z",
  });
  assert.equal(created.idempotent_replay, false);
  assert.equal(created.goal.plan.forecast.projected_revenue_minor, 2_640_000);
  assert.equal(created.goal.plan.guardrails.external_effects_require_approval, true);
  assert.equal(created.actions.length, 5);
  assert.equal(runtime.store.get("SELECT COUNT(*) AS count FROM approval_requests").count, 0);

  const tick = runtime.service.autopilotTick({ goal_id: "goal1" });
  assert.equal(tick.external_effects_executed, false);
  assert.ok(tick.next_actions.some((action) => action.tool_name === "fashion.creative.prepare"));
  assert.ok(tick.next_actions.some((action) => action.tool_name === "instagram.content_plan.create"));
  const run = await runtime.service.autopilotRun({ goal_id: "goal1" });
  assert.equal(run.external_effects_executed, false);
  assert.ok(run.completed.some((action) => action.tool_name === "fashion.creative.prepare"));
  assert.ok(run.completed.some((action) => action.tool_name === "instagram.content_plan.create"));
  assert.ok(run.completed.some((action) => action.tool_name === "instagram.draft.create"));
  assert.equal(run.pending_approvals.length, 1);
  assert.equal(run.processed, 3);
  assert.equal(runtime.store.get("SELECT COUNT(*) AS count FROM effect_runs").count, 0);
  assert.equal(runtime.store.get("SELECT COUNT(*) AS count FROM campaigns").count, 1);
  const campaign = runtime.store.get("SELECT id FROM campaigns LIMIT 1");
  assert.throws(() => runtime.service.prepareSocial({ campaign_id: campaign.id, action: "create_ad", budget_minor: 120_001, currency: "JPY" }), /ad_budget_exceeds_goal_cap/);
  const approvedBudget = runtime.service.prepareSocial({ campaign_id: campaign.id, action: "create_ad", budget_minor: 120_000, currency: "JPY" });
  assert.equal(runtime.service.approvalGet(approvedBudget.approval.approval_id).payload.ad_budget_cap_minor, 120_000);
  assert.equal(runtime.service.createAutopilotGoal({
    id: "goal1", brand_id: brand.id, product_id: product.id, target_units: 30,
    target_revenue_minor: 2_640_000, target_gross_margin_bps: 6000,
    ad_budget_cap_minor: 120_000, starts_at: "2030-01-01T00:00:00.000Z", ends_at: "2030-02-01T00:00:00.000Z",
  }).idempotent_replay, true);
});

test("readiness reports blockers without exposing secrets", (t) => {
  const runtime = fixture();
  t.after(() => runtime.store.close());
  const { brand } = seed(runtime);
  const readiness = runtime.service.readiness({ brand_id: brand.id });
  assert.equal(readiness.status, "setup_required");
  assert.equal(readiness.planning_ready, true);
  assert.equal(readiness.capabilities.approval.ready, true);
  assert.equal(readiness.capabilities.instagram.provider, "mock");
  assert.ok(readiness.missing.includes("live_social_provider"));
  assert.ok(readiness.missing.includes("connected_instagram_account"));
  assert.equal(readiness.secrets_exposed, false);
  assert.doesNotMatch(JSON.stringify(readiness), /test-only-approval-secret/);
});

test("AI Sales Concierge keeps customer context but leaves DM sending behind approval", (t) => {
  const runtime = fixture();
  t.after(() => runtime.store.close());
  const { brand, product } = seed(runtime);
  runtime.service.ingestDm({ brand_id: brand.id, provider: "instagram", external_message_id: "sales1", customer_external_ref: "buyer-sales", body: "サイズを確認して購入したいです" });
  const latest = runtime.service.ingestDm({ brand_id: brand.id, provider: "instagram", external_message_id: "sales2", customer_external_ref: "buyer-sales", body: "このコートを注文したいです" });
  const concierge = runtime.service.prepareConcierge({ message_id: latest.message_id, product_id: product.id });
  assert.equal(concierge.journey.stage, "ready_to_buy");
  assert.equal(concierge.journey.next_action.send_requires_approval, true);
  assert.equal(concierge.message_sent, false);
  assert.equal(concierge.send_tool.name, "instagram.dm.reply.prepare");
  const pipeline = runtime.service.salesPipeline({ brand_id: brand.id });
  assert.equal(pipeline.summary.ready_to_buy, 1);
  assert.equal(pipeline.next_best[0].customer_id, latest.customer_id);
});

test("Production Cockpit requires verified full payment and enforces fulfillment order", async (t) => {
  const runtime = fixture();
  t.after(() => runtime.store.close());
  const { brand, product } = seed(runtime);
  const collected = runtime.service.collectOrder({ brand_id: brand.id, product_id: product.id, customer_external_ref: "buyer-production", customer: { name: "B", email: "b@example.com" }, shipping: { country: "JP", address: "Osaka" }, quantity: 2 });
  assert.throws(() => runtime.service.updateOrderStatus({ order_id: collected.order.id, status: "paid" }), /financial_status_requires_verified_provider_event/);
  assert.throws(() => runtime.service.planProduction({ order_id: collected.order.id }), /verified_payment_required_for_production/);
  const payment = runtime.service.preparePayment({ order_id: collected.order.id, kind: "link" });
  await grant(runtime, payment.approval, "production-payment-link");
  const baseEvent = { provider: "stripe", event_id: "production-paid", event_type: "checkout.session.completed", payload: { id: "cs-production", order_id: collected.order.id, payment_intent: "pi-production", currency: "jpy" } };
  assert.throws(() => runtime.service.processPaymentEvent({ ...baseEvent, payload: { ...baseEvent.payload, amount: 1 } }), /payment_amount_mismatch/);
  runtime.service.processPaymentEvent({ ...baseEvent, payload: { ...baseEvent.payload, amount: 176000 } });
  const planned = runtime.service.planProduction({ order_id: collected.order.id, daily_capacity: 1, lead_days: 14, estimated_unit_cost_minor: 30000, bom: { wool_meters: 6, lining_meters: 4 } });
  assert.equal(planned.can_start, true);
  assert.equal(planned.job.cost.estimated_gross_margin_minor, 116000);
  runtime.service.updateOrderStatus({ order_id: collected.order.id, status: "in_production" });
  assert.throws(() => runtime.service.updateOrderStatus({ order_id: collected.order.id, status: "delivered" }), /order_status_transition_invalid/);
  runtime.service.updateOrderStatus({ order_id: collected.order.id, status: "quality_check" });
  runtime.service.updateOrderStatus({ order_id: collected.order.id, status: "ready_to_ship" });
  const dashboard = runtime.service.productionDashboard({ brand_id: brand.id });
  assert.equal(dashboard.summary.active, 1);
  assert.equal(dashboard.jobs[0].status, "ready_to_ship");
});
