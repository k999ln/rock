const object = (properties, required = []) => ({ type: "object", additionalProperties: false, properties, required });
const str = (description) => ({ type: "string", description });
const integer = (description, minimum = 0) => ({ type: "integer", minimum, description });
const number = (description, minimum = 0, maximum = 1) => ({ type: "number", minimum, maximum, description });

export const TOOL_DEFINITIONS = Object.freeze([
  { name: "fashion.brand.upsert", description: "Create or update brand policy, voice, regions, FAQ, and visual constraints.", inputSchema: object({ id: str("Optional brand ID"), name: str("Brand name"), policy: { type: "object" } }, ["name", "policy"]) },
  { name: "fashion.product.upsert", description: "Create or update a product design. Existing price changes return an approval request.", inputSchema: object({ id: str("Optional product ID"), brand_id: str("Brand ID"), name: str("Product name"), design: { type: "object" }, price_minor: integer("Minor currency units"), currency: str("ISO currency"), status: { enum: ["draft", "active", "paused", "archived"] } }, ["brand_id", "name", "design", "price_minor", "currency"]) },
  { name: "fashion.market.analyze", description: "Assess target audience, regions, positioning, and Instagram channel fit.", inputSchema: object({ brand_id: str("Brand ID"), product_id: str("Product ID") }, ["brand_id", "product_id"]) },
  { name: "fashion.creative.prepare", description: "Build a feedback-aware image or video brief and an approval-gated provider action.", inputSchema: object({ brand_id: str("Brand ID"), product_id: str("Product ID"), media_type: { enum: ["image", "video"] }, format: str("Aspect ratio such as 4:5 or 9:16"), duration_seconds: integer("Video duration", 1) }, ["brand_id", "product_id"]) },
  { name: "fashion.order.collect", description: "Collect customer, customization, shipping, and made-to-order information.", inputSchema: object({ id: str("Optional order ID"), brand_id: str("Brand ID"), product_id: str("Product ID"), customer_external_ref: str("Platform-scoped customer reference"), customer: { type: "object" }, consent: { type: "object" }, customization: { type: "object" }, shipping: { type: "object" }, quantity: integer("Quantity", 1) }, ["brand_id", "product_id", "customer"]) },
  { name: "fashion.order.status.update", description: "Advance an order through validated non-financial fulfillment transitions. Paid/refunded states require verified payment events.", inputSchema: object({ order_id: str("Order ID"), status: { enum: ["quoted", "in_production", "quality_check", "ready_to_ship", "shipped", "delivered", "cancelled"] }, details: { type: "object" } }, ["order_id", "status"]) },
  { name: "fashion.payment.prepare", description: "Prepare an approval-gated checkout link, invoice send, or refund.", inputSchema: object({ order_id: str("Order ID"), kind: { enum: ["link", "invoice", "refund"] }, days_until_due: integer("Invoice due days", 1), amount_minor: integer("Refund amount", 1), payment_intent: str("Provider payment reference") }, ["order_id", "kind"]) },
  { name: "fashion.payment.status.get", description: "Read the locally reconciled payment status. Payment events enter only through a signature-verified webhook.", inputSchema: object({ order_id: str("Order ID") }, ["order_id"]) },
  { name: "fashion.notification.prepare", description: "Prepare an approval-gated operator or customer notification.", inputSchema: object({ brand_id: str("Brand ID"), topic: str("Topic"), message: str("Message"), audience_ref: str("Non-secret audience reference") }, ["brand_id", "topic", "message"]) },
  { name: "fashion.metrics.record", description: "Record advertising, DM, or sales metrics for feedback.", inputSchema: object({ brand_id: str("Brand ID"), campaign_id: str("Campaign ID"), metric_type: str("Metric name"), value: { type: "number" }, dimensions: { type: "object" }, observed_at: str("ISO timestamp") }, ["brand_id", "metric_type", "value"]) },
  { name: "fashion.analytics.get", description: "Return aggregate ad, DM, order, and sales analysis.", inputSchema: object({ brand_id: str("Brand ID") }, ["brand_id"]) },
  { name: "fashion.feedback.build", description: "Build and version creative feedback from ads, DMs, and verified sales.", inputSchema: object({ brand_id: str("Brand ID") }, ["brand_id"]) },
  { name: "fashion.dashboard.get", description: "Return products, orders, pending approvals, analytics, and latest feedback.", inputSchema: object({ brand_id: str("Brand ID") }, ["brand_id"]) },
  { name: "fashion.autopilot.goal.create", description: "Create a persisted sales, margin, budget, and deadline goal with a safe campaign plan. It never executes external effects.", inputSchema: object({ id: str("Optional idempotent goal ID"), brand_id: str("Brand ID"), product_id: str("Product ID"), target_units: integer("Target paid units", 1), target_revenue_minor: integer("Optional target revenue in minor units"), target_gross_margin_bps: integer("Gross margin target in basis points"), ad_budget_cap_minor: integer("Maximum approved advertising budget in minor units"), starts_at: str("ISO start timestamp"), ends_at: str("ISO end timestamp") }, ["brand_id", "product_id", "target_units", "ends_at"]) },
  { name: "fashion.autopilot.get", description: "Read one campaign goal, plan, progress, and workflow action queue.", inputSchema: object({ goal_id: str("Goal ID") }, ["goal_id"]) },
  { name: "fashion.autopilot.tick", description: "Reconcile a goal with current campaigns, approvals, DMs, verified sales, and production; return prioritized next tool calls without executing them.", inputSchema: object({ goal_id: str("Goal ID") }, ["goal_id"]) },
  { name: "fashion.autopilot.run", description: "Run bounded internal planning work, create drafts and approval requests, and stop before every external effect.", inputSchema: object({ goal_id: str("Goal ID"), max_actions: integer("Maximum internal actions", 1) }, ["goal_id"]) },
  { name: "fashion.concierge.prepare", description: "Build persistent customer memory, sales stage, next-best action, and an unsent DM reply draft from conversation history.", inputSchema: object({ message_id: str("Inbound DM message ID"), product_id: str("Optional product context") }, ["message_id"]) },
  { name: "fashion.sales.pipeline.get", description: "List purchase-ready, considering, existing, and VIP customer journeys with next-best actions.", inputSchema: object({ brand_id: str("Brand ID"), limit: integer("Maximum customer journeys", 1) }, ["brand_id"]) },
  { name: "fashion.production.plan", description: "Create an idempotent made-to-order production, capacity, bill-of-materials, cost, and due-date plan only after verified payment.", inputSchema: object({ order_id: str("Paid order ID"), daily_capacity: integer("Units per day", 1), lead_days: integer("Lead time in days", 1), due_at: str("Optional ISO due timestamp"), estimated_unit_cost_minor: integer("Estimated unit cost in minor units"), bom: { type: "object" } }, ["order_id"]) },
  { name: "fashion.production.dashboard", description: "Return production jobs, capacity, blockers, overdue work, costs, and fulfillment status.", inputSchema: object({ brand_id: str("Brand ID"), limit: integer("Maximum production jobs", 1) }, ["brand_id"]) },
  { name: "fashion.executive.dashboard", description: "Return the active goal, approval queue, sales pipeline, production health, analytics, and prioritized operator actions.", inputSchema: object({ brand_id: str("Brand ID") }, ["brand_id"]) },
  { name: "fashion.system.readiness", description: "Report live Instagram, creative, payment, notification, approval, and account readiness without returning secret values.", inputSchema: object({ brand_id: str("Optional brand ID") }) },

  { name: "instagram.accounts.list", description: "List stored Instagram account connections without credentials.", inputSchema: object({ brand_id: str("Brand ID") }, ["brand_id"]) },
  { name: "instagram.accounts.intake_screenshots", description: "Persist account candidates extracted by Sky vision from user-supplied screenshots. Raw images and credentials are never accepted or stored.", inputSchema: object({ brand_id: str("Brand ID"), screenshots: { type: "array", minItems: 1, maxItems: 10, items: object({ source_sha256: str("SHA-256 of the screenshot bytes"), accounts: { type: "array", minItems: 1, maxItems: 20, items: object({ username: str("Visible Instagram username"), display_name: str("Optional visible display name"), posts: integer("Optional visible post count"), followers: integer("Optional visible follower count"), following: integer("Optional visible following count"), confidence: number("Vision confidence from 0 to 1") }, ["username"]) } }, ["source_sha256", "accounts"]) } }, ["brand_id", "screenshots"]) },
  { name: "instagram.accounts.candidates.list", description: "List screenshot-derived Instagram candidates. A candidate is not connected until Meta OAuth readback matches it.", inputSchema: object({ brand_id: str("Optional Brand ID"), status: { enum: ["needs_owner_confirmation", "oauth_matched", "dismissed"] } }) },
  { name: "instagram.accounts.discover", description: "Read accounts available through the configured Meta OAuth provider; optionally import verified readback.", inputSchema: object({ brand_id: str("Brand ID"), import: { type: "boolean" } }, ["brand_id"]) },
  { name: "instagram.accounts.register", description: "Register OAuth readback metadata and a vault/env/broker credential reference. Tokens, passwords, and cookies are rejected.", inputSchema: object({ brand_id: str("Brand ID"), id: str("Optional connection ID"), provider: str("Provider"), external_account_id: str("Instagram professional account ID"), username: str("Username"), credential_ref: str("env://, vault://, or broker:// reference"), connection_status: str("Connection status"), metadata: { type: "object" } }, ["brand_id", "external_account_id", "username", "credential_ref"]) },
  { name: "instagram.accounts.switch", description: "Select one connected Instagram account for subsequent drafts and operations.", inputSchema: object({ brand_id: str("Brand ID"), account_id: str("Social account connection ID") }, ["brand_id", "account_id"]) },
  { name: "instagram.content_plan.create", description: "Create a PULSE-style multi-week Instagram content plan and calendar slots.", inputSchema: object({ brand_id: str("Brand ID"), account_id: str("Optional account ID"), period_start: str("ISO start date"), days: integer("Plan length, 7-90", 7), posts_per_week: integer("Cadence, 1-14", 1), default_time: str("HH:mm"), objective: str("Plan objective"), pillars: { type: "array", items: { type: "string" } } }, ["brand_id"]) },
  { name: "instagram.draft.create", description: "Create an account-scoped Instagram draft and brand-aligned caption.", inputSchema: object({ brand_id: str("Brand ID"), product_id: str("Product ID"), account_id: str("Optional account ID"), content_plan_id: str("Optional content plan ID"), title: str("Post title"), format: str("carousel, reel, image, or story"), language: str("ja or en"), call_to_action: str("CTA"), asset_ids: { type: "array", items: { type: "string" } } }, ["brand_id", "product_id"]) },
  { name: "instagram.schedule.prepare", description: "Prepare an approval-gated Instagram scheduling action.", inputSchema: object({ campaign_id: str("Campaign ID"), scheduled_for: str("ISO timestamp"), media_url: str("Public asset URL when required by the provider") }, ["campaign_id", "scheduled_for"]) },
  { name: "instagram.publish.prepare", description: "Prepare an approval-gated Instagram publish action.", inputSchema: object({ campaign_id: str("Campaign ID"), media_url: str("Public asset URL when required by the provider") }, ["campaign_id"]) },
  { name: "instagram.ad.prepare", description: "Prepare an approval-gated paid Instagram campaign with an exact budget.", inputSchema: object({ campaign_id: str("Campaign ID"), budget_minor: integer("Budget in minor units", 1), currency: str("ISO currency"), media_url: str("Public asset URL") }, ["campaign_id", "budget_minor", "currency"]) },
  { name: "instagram.calendar.list", description: "List draft, approval, scheduled, and published posts for a date range.", inputSchema: object({ brand_id: str("Brand ID"), from: str("ISO start"), to: str("ISO end") }, ["brand_id"]) },
  { name: "instagram.insights.sync", description: "Read official provider insights for the selected account and record metrics.", inputSchema: object({ brand_id: str("Brand ID"), account_id: str("Optional account ID") }, ["brand_id"]) },
  { name: "instagram.dm.classify", description: "Idempotently ingest and classify an Instagram DM, score purchase intent, and draft an FAQ reply.", inputSchema: object({ brand_id: str("Brand ID"), provider: str("Provider"), external_message_id: str("Message ID"), customer_external_ref: str("Sender-scoped reference"), body: str("Message text") }, ["brand_id", "external_message_id", "body"]) },
  { name: "instagram.dm.reply.prepare", description: "Prepare an approval-gated DM reply; it does not send by itself.", inputSchema: object({ message_id: str("Inbound message ID"), account_id: str("Optional account ID"), body: str("Optional edited reply") }, ["message_id"]) },

  { name: "approval.list", description: "List pending or completed approval requests for operator review.", inputSchema: object({ status: str("Approval status"), limit: integer("Maximum rows", 1) }) },
  { name: "approval.execute", description: "Execute exactly one prepared effect using a short-lived Hub-signed grant and idempotency key.", inputSchema: object({ approval_id: str("Approval ID"), grant_token: str("Signed grant from the Hub approval surface"), idempotency_key: str("Stable exact-action retry key") }, ["approval_id", "grant_token", "idempotency_key"]) },
]);

export function createToolRouter(service) {
  const routes = {
    "fashion.brand.upsert": (args) => service.upsertBrand(args),
    "fashion.product.upsert": (args) => service.upsertProduct(args),
    "fashion.market.analyze": (args) => service.analyzeMarket(args),
    "fashion.creative.prepare": (args) => service.prepareCreative(args),
    "fashion.order.collect": (args) => service.collectOrder(args),
    "fashion.order.status.update": (args) => service.updateOrderStatus(args),
    "fashion.payment.prepare": (args) => service.preparePayment(args),
    "fashion.payment.status.get": (args) => service.paymentStatus(args),
    "fashion.notification.prepare": (args) => service.prepareNotification(args),
    "fashion.metrics.record": (args) => service.recordMetric(args),
    "fashion.analytics.get": (args) => service.analytics(args),
    "fashion.feedback.build": (args) => service.buildFeedback(args),
    "fashion.dashboard.get": (args) => service.dashboard(args),
    "fashion.autopilot.goal.create": (args) => service.createAutopilotGoal(args),
    "fashion.autopilot.get": (args) => service.autopilotGet(args),
    "fashion.autopilot.tick": (args) => service.autopilotTick(args),
    "fashion.autopilot.run": (args) => service.autopilotRun(args),
    "fashion.concierge.prepare": (args) => service.prepareConcierge(args),
    "fashion.sales.pipeline.get": (args) => service.salesPipeline(args),
    "fashion.production.plan": (args) => service.planProduction(args),
    "fashion.production.dashboard": (args) => service.productionDashboard(args),
    "fashion.executive.dashboard": (args) => service.executiveDashboard(args),
    "fashion.system.readiness": (args) => service.readiness(args),
    "instagram.accounts.list": (args) => service.listSocialAccounts(args),
    "instagram.accounts.intake_screenshots": (args) => service.intakeSocialAccountScreenshots(args),
    "instagram.accounts.candidates.list": (args) => service.listSocialAccountCandidates(args),
    "instagram.accounts.discover": (args) => service.discoverSocialAccounts(args),
    "instagram.accounts.register": (args) => service.registerSocialAccount(args),
    "instagram.accounts.switch": (args) => service.switchSocialAccount(args),
    "instagram.content_plan.create": (args) => service.createContentPlan(args),
    "instagram.draft.create": (args) => service.composeSocial(args),
    "instagram.schedule.prepare": (args) => service.prepareSocial({ ...args, action: "schedule" }),
    "instagram.publish.prepare": (args) => service.prepareSocial({ ...args, action: "publish" }),
    "instagram.ad.prepare": (args) => service.prepareSocial({ ...args, action: "create_ad" }),
    "instagram.calendar.list": (args) => service.calendar(args),
    "instagram.insights.sync": (args) => service.syncInsights(args),
    "instagram.dm.classify": (args) => service.ingestDm(args),
    "instagram.dm.reply.prepare": (args) => service.prepareDmReply(args),
    "approval.list": (args) => service.listApprovals(args),
    "approval.execute": (args) => service.executeApproved(args),
  };
  return async (name, args = {}) => {
    const route = routes[name];
    if (!route) throw new Error("tool_not_found");
    return route(args || {});
  };
}
