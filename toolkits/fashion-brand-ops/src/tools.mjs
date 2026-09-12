const object = (properties, required = []) => ({ type: "object", additionalProperties: false, properties, required });
const str = (description) => ({ type: "string", description });
const integer = (description, minimum = 0) => ({ type: "integer", minimum, description });

export const TOOL_DEFINITIONS = Object.freeze([
  { name: "fashion.brand.upsert", description: "Create or update brand policy, voice, regions, FAQ, and visual constraints.", inputSchema: object({ id: str("Optional brand ID"), name: str("Brand name"), policy: { type: "object" } }, ["name", "policy"]) },
  { name: "fashion.product.upsert", description: "Create or update a product design. Existing price changes return an approval request.", inputSchema: object({ id: str("Optional product ID"), brand_id: str("Brand ID"), name: str("Product name"), design: { type: "object" }, price_minor: integer("Minor currency units"), currency: str("ISO currency"), status: { enum: ["draft", "active", "paused", "archived"] } }, ["brand_id", "name", "design", "price_minor", "currency"]) },
  { name: "fashion.market.analyze", description: "Assess target audience, regions, positioning, and Instagram channel fit.", inputSchema: object({ brand_id: str("Brand ID"), product_id: str("Product ID") }, ["brand_id", "product_id"]) },
  { name: "fashion.creative.prepare", description: "Build a feedback-aware image or video brief and an approval-gated provider action.", inputSchema: object({ brand_id: str("Brand ID"), product_id: str("Product ID"), media_type: { enum: ["image", "video"] }, format: str("Aspect ratio such as 4:5 or 9:16"), duration_seconds: integer("Video duration", 1) }, ["brand_id", "product_id"]) },
  { name: "fashion.order.collect", description: "Collect customer, customization, shipping, and made-to-order information.", inputSchema: object({ id: str("Optional order ID"), brand_id: str("Brand ID"), product_id: str("Product ID"), customer_external_ref: str("Platform-scoped customer reference"), customer: { type: "object" }, consent: { type: "object" }, customization: { type: "object" }, shipping: { type: "object" }, quantity: integer("Quantity", 1) }, ["brand_id", "product_id", "customer"]) },
  { name: "fashion.order.status.update", description: "Update production, quality check, shipment, or delivery status.", inputSchema: object({ order_id: str("Order ID"), status: str("Order status"), details: { type: "object" } }, ["order_id", "status"]) },
  { name: "fashion.payment.prepare", description: "Prepare an approval-gated checkout link, invoice send, or refund.", inputSchema: object({ order_id: str("Order ID"), kind: { enum: ["link", "invoice", "refund"] }, days_until_due: integer("Invoice due days", 1), amount_minor: integer("Refund amount", 1), payment_intent: str("Provider payment reference") }, ["order_id", "kind"]) },
  { name: "fashion.payment.status.get", description: "Read the locally reconciled payment status. Payment events enter only through a signature-verified webhook.", inputSchema: object({ order_id: str("Order ID") }, ["order_id"]) },
  { name: "fashion.notification.prepare", description: "Prepare an approval-gated operator or customer notification.", inputSchema: object({ brand_id: str("Brand ID"), topic: str("Topic"), message: str("Message"), audience_ref: str("Non-secret audience reference") }, ["brand_id", "topic", "message"]) },
  { name: "fashion.metrics.record", description: "Record advertising, DM, or sales metrics for feedback.", inputSchema: object({ brand_id: str("Brand ID"), campaign_id: str("Campaign ID"), metric_type: str("Metric name"), value: { type: "number" }, dimensions: { type: "object" }, observed_at: str("ISO timestamp") }, ["brand_id", "metric_type", "value"]) },
  { name: "fashion.analytics.get", description: "Return aggregate ad, DM, order, and sales analysis.", inputSchema: object({ brand_id: str("Brand ID") }, ["brand_id"]) },
  { name: "fashion.feedback.build", description: "Build and version creative feedback from ads, DMs, and verified sales.", inputSchema: object({ brand_id: str("Brand ID") }, ["brand_id"]) },
  { name: "fashion.dashboard.get", description: "Return products, orders, pending approvals, analytics, and latest feedback.", inputSchema: object({ brand_id: str("Brand ID") }, ["brand_id"]) },

  { name: "instagram.accounts.list", description: "List stored Instagram account connections without credentials.", inputSchema: object({ brand_id: str("Brand ID") }, ["brand_id"]) },
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
    "instagram.accounts.list": (args) => service.listSocialAccounts(args),
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
