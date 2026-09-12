import { analyzeMarket, buildCreativeBrief, classifyDm, composeCaption, feedbackRecommendations } from "./domain.mjs";
import { createApproval, verifyApprovalGrant } from "./approval.mjs";
import { assertSecretFree, cleanText, currency, id, jsonObject, nowIso, safeId, sha256, stableJson } from "./util.mjs";

const ORDER_STATUSES = new Set(["collecting", "quoted", "payment_pending", "paid", "in_production", "quality_check", "ready_to_ship", "shipped", "delivered", "cancelled", "refunded"]);
const CAMPAIGN_ACTIONS = new Set(["social.schedule", "social.publish", "social.create_ad"]);
const CAPABILITY_BY_ACTION = Object.freeze({
  "product.price_change": "brand.intake",
  "creative.generate": "creative.generate",
  "social.schedule": "instagram.publish",
  "social.publish": "instagram.publish",
  "social.create_ad": "instagram.publish",
  "dm.reply": "instagram.dm.reply",
  "payment.create_link": "payment.request",
  "payment.send_invoice": "payment.request",
  "payment.refund": "payment.request",
  "notification.send": "notification.send",
});

function entity(row) {
  if (!row) return null;
  const result = { ...row };
  for (const key of Object.keys(result)) if (key.endsWith("_json")) delete result[key];
  return result;
}

function requiredRow(row, code) { if (!row) throw new Error(code); return entity(row); }
function json(value) { return stableJson(value ?? {}); }

export class FashionBrandService {
  constructor({ store, providers, config, clock = Date }) {
    this.store = store;
    this.providers = providers;
    this.config = config;
    this.clock = clock;
  }

  brandGet(brandId) {
    return requiredRow(this.store.get("SELECT * FROM brands WHERE id = ?", safeId(brandId, "brand_id")), "brand_not_found");
  }

  productGet(productId) {
    return requiredRow(this.store.get("SELECT * FROM products WHERE id = ?", safeId(productId, "product_id")), "product_not_found");
  }

  orderGet(orderId) {
    return requiredRow(this.store.get("SELECT * FROM orders WHERE id = ?", safeId(orderId, "order_id")), "order_not_found");
  }

  upsertBrand(input) {
    const brandId = input.id ? safeId(input.id, "brand_id") : id("brd");
    const name = cleanText(input.name, "brand_name", 160);
    const policy = jsonObject(input.policy || {}, "brand_policy");
    const at = nowIso(this.clock);
    this.store.run(
      `INSERT INTO brands(id, name, policy_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, policy_json = excluded.policy_json, updated_at = excluded.updated_at`,
      brandId, name, json(policy), at, at,
    );
    return this.brandGet(brandId);
  }

  upsertProduct(input) {
    const productId = input.id ? safeId(input.id, "product_id") : id("prd");
    const brand = this.brandGet(input.brand_id);
    const name = cleanText(input.name, "product_name", 200);
    const design = jsonObject(input.design || {}, "product_design");
    const priceMinor = Number(input.price_minor);
    if (!Number.isSafeInteger(priceMinor) || priceMinor < 0) throw new Error("price_minor_invalid");
    const selectedCurrency = currency(input.currency);
    const status = String(input.status || "draft");
    if (!new Set(["draft", "active", "paused", "archived"]).has(status)) throw new Error("product_status_invalid");
    const existing = entity(this.store.get("SELECT * FROM products WHERE id = ?", productId));
    if (existing && (existing.price_minor !== priceMinor || existing.currency !== selectedCurrency)) {
      const approval = createApproval(this.store, {
        action: "product.price_change", risk: "money",
        payload: { product_id: productId, brand_id: brand.id, name, design, price_minor: priceMinor, currency: selectedCurrency, status },
        summary: `${name} の価格を ${existing.price_minor} ${existing.currency} から ${priceMinor} ${selectedCurrency} へ変更`,
      }, this.clock);
      return { approval_required: true, approval, current_product: existing };
    }
    const at = nowIso(this.clock);
    this.store.run(
      `INSERT INTO products(id, brand_id, name, design_json, price_minor, currency, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, design_json = excluded.design_json, status = excluded.status, updated_at = excluded.updated_at`,
      productId, brand.id, name, json(design), priceMinor, selectedCurrency, status, at, at,
    );
    return { approval_required: false, product: this.productGet(productId) };
  }

  analyzeMarket(input) {
    const brand = this.brandGet(input.brand_id);
    const product = this.productGet(input.product_id);
    if (product.brand_id !== brand.id) throw new Error("product_brand_mismatch");
    const result = analyzeMarket(brand, product);
    const assessmentId = id("mkt");
    this.store.run("INSERT INTO market_assessments(id, brand_id, product_id, result_json, created_at) VALUES (?, ?, ?, ?, ?)", assessmentId, brand.id, product.id, json(result), nowIso(this.clock));
    return { id: assessmentId, ...result };
  }

  latestMarket(brand, product) {
    const saved = entity(this.store.get("SELECT * FROM market_assessments WHERE brand_id = ? AND product_id = ? ORDER BY created_at DESC LIMIT 1", brand.id, product.id));
    return saved?.result || analyzeMarket(brand, product);
  }

  listSocialAccounts(input) {
    const brand = this.brandGet(input.brand_id);
    return this.store.all("SELECT * FROM social_accounts WHERE brand_id = ? ORDER BY is_active DESC, username", brand.id).map(entity);
  }

  async discoverSocialAccounts(input) {
    const brand = this.brandGet(input.brand_id);
    const discovered = await this.providers.social.listAccounts();
    if (input.import === true) {
      for (const account of discovered) this.registerSocialAccount({ brand_id: brand.id, ...account, provider: this.providers.social.name, metadata: { ...(account.metadata || {}), page_id: account.page_id || null, page_name: account.page_name || null } });
    }
    return { provider: this.providers.social.name, imported: input.import === true, accounts: discovered };
  }

  registerSocialAccount(input) {
    const brand = this.brandGet(input.brand_id);
    const provider = cleanText(input.provider || this.providers.social.name, "social_provider", 80);
    const externalAccountId = safeId(input.external_account_id, "external_account_id");
    const username = cleanText(input.username, "username", 160).replace(/^@/, "");
    const credentialRef = cleanText(input.credential_ref, "credential_ref", 300);
    if (!/^(?:env|vault|broker):\/\/[A-Za-z0-9._~:/-]+$/.test(credentialRef)) throw new Error("credential_ref_invalid");
    if (/password|cookie|bearer|token=/i.test(credentialRef)) throw new Error("credential_ref_invalid");
    const connectionStatus = String(input.connection_status || "connected");
    if (!new Set(["candidate", "connected", "expired", "revoked", "error"]).has(connectionStatus)) throw new Error("connection_status_invalid");
    const metadata = jsonObject(input.metadata || {}, "social_account_metadata");
    assertSecretFree(metadata, "social_account_metadata");
    const accountId = input.id ? safeId(input.id, "social_account_id") : id("iga");
    const at = nowIso(this.clock);
    this.store.run(
      `INSERT INTO social_accounts(id, brand_id, provider, external_account_id, username, credential_ref, connection_status, is_active, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
       ON CONFLICT(brand_id, provider, external_account_id) DO UPDATE SET username = excluded.username, credential_ref = excluded.credential_ref, connection_status = excluded.connection_status, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at`,
      accountId, brand.id, provider, externalAccountId, username, credentialRef, connectionStatus, json(metadata), at, at,
    );
    return entity(this.store.get("SELECT * FROM social_accounts WHERE brand_id = ? AND provider = ? AND external_account_id = ?", brand.id, provider, externalAccountId));
  }

  switchSocialAccount(input) {
    const brand = this.brandGet(input.brand_id);
    const account = requiredRow(this.store.get("SELECT * FROM social_accounts WHERE id = ? AND brand_id = ?", safeId(input.account_id, "social_account_id"), brand.id), "social_account_not_found");
    if (account.connection_status !== "connected") throw new Error("social_account_not_connected");
    const at = nowIso(this.clock);
    this.store.transaction(() => {
      this.store.run("UPDATE social_accounts SET is_active = 0, updated_at = ? WHERE brand_id = ? AND provider = ?", at, brand.id, account.provider);
      this.store.run("UPDATE social_accounts SET is_active = 1, updated_at = ? WHERE id = ?", at, account.id);
    });
    return entity(this.store.get("SELECT * FROM social_accounts WHERE id = ?", account.id));
  }

  activeSocialAccount(brandId, optionalId = null) {
    const account = optionalId
      ? this.store.get("SELECT * FROM social_accounts WHERE id = ? AND brand_id = ?", safeId(optionalId, "social_account_id"), brandId)
      : this.store.get("SELECT * FROM social_accounts WHERE brand_id = ? AND is_active = 1", brandId);
    return account ? entity(account) : null;
  }

  createContentPlan(input) {
    const brand = this.brandGet(input.brand_id);
    const account = this.activeSocialAccount(brand.id, input.account_id);
    const start = new Date(input.period_start || nowIso(this.clock));
    if (Number.isNaN(start.getTime())) throw new Error("period_start_invalid");
    const days = Number(input.days || 14);
    if (!Number.isSafeInteger(days) || days < 7 || days > 90) throw new Error("content_plan_days_invalid");
    const end = new Date(start.getTime() + (days - 1) * 86400000);
    const products = this.store.all("SELECT * FROM products WHERE brand_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 20", brand.id).map(entity);
    const pillars = input.pillars || ["product", "craft", "styling", "brand_story", "faq", "made_to_order"];
    if (!Array.isArray(pillars) || pillars.length === 0 || pillars.length > 20 || pillars.some((item) => typeof item !== "string" || !item.trim())) throw new Error("content_pillars_invalid");
    const cadence = Number(input.posts_per_week || 3);
    if (!Number.isSafeInteger(cadence) || cadence < 1 || cadence > 14) throw new Error("posts_per_week_invalid");
    const total = Math.max(1, Math.ceil(days / 7 * cadence));
    const slots = Array.from({ length: total }, (_, index) => {
      const date = new Date(start.getTime() + Math.floor(index * days / total) * 86400000);
      const product = products[index % Math.max(products.length, 1)];
      return { date: date.toISOString().slice(0, 10), time: input.default_time || "19:00", pillar: pillars[index % pillars.length], format: index % 3 === 1 ? "reel" : index % 3 === 2 ? "story" : "carousel", product_id: product?.id || null, status: "idea" };
    });
    const strategy = { objective: input.objective || "qualified_dm_and_orders", posts_per_week: cadence, pillars, slots, source: "pulse-inspired-plan" };
    const planId = id("pln");
    const at = nowIso(this.clock);
    this.store.run("INSERT INTO content_plans(id, brand_id, social_account_id, period_start, period_end, strategy_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", planId, brand.id, account?.id || null, start.toISOString(), end.toISOString(), json(strategy), at, at);
    return entity(this.store.get("SELECT * FROM content_plans WHERE id = ?", planId));
  }

  prepareCreative(input) {
    const brand = this.brandGet(input.brand_id);
    const product = this.productGet(input.product_id);
    if (product.brand_id !== brand.id) throw new Error("product_brand_mismatch");
    const market = this.latestMarket(brand, product);
    const feedback = this.latestFeedback(brand.id);
    const brief = buildCreativeBrief({ brand, product, market, format: input.format || "4:5", mediaType: input.media_type || "image", feedback: feedback?.feedback || null });
    const assetId = id("ast");
    const at = nowIso(this.clock);
    this.store.run(
      "INSERT INTO creative_assets(id, brand_id, product_id, provider, media_type, status, prompt, output_json, feedback_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'approval_required', ?, '{}', ?, ?, ?)",
      assetId, brand.id, product.id, this.providers.creative.name, brief.media_type, brief.prompt, feedback?.version || 0, at, at,
    );
    const approval = createApproval(this.store, {
      action: "creative.generate", risk: "external_write", payload: { asset_id: assetId, ...brief, duration_seconds: input.duration_seconds || null },
      summary: `${brand.name} / ${product.name} の${brief.media_type}を ${this.providers.creative.name} で生成`,
    }, this.clock);
    return { asset_id: assetId, brief, approval_required: true, approval };
  }

  composeSocial(input) {
    const brand = this.brandGet(input.brand_id);
    const product = this.productGet(input.product_id);
    if (product.brand_id !== brand.id) throw new Error("product_brand_mismatch");
    const market = this.latestMarket(brand, product);
    const account = this.activeSocialAccount(brand.id, input.account_id);
    const caption = composeCaption({ brand, product, market, language: input.language || "ja", callToAction: input.call_to_action || (input.language === "en" ? "Message us to order." : "DMでご相談ください") });
    const campaignId = id("cmp");
    const assets = Array.isArray(input.asset_ids) ? input.asset_ids.map((value) => safeId(value, "asset_id")) : [];
    const at = nowIso(this.clock);
    this.store.run(
      "INSERT INTO campaigns(id, brand_id, product_id, social_provider, status, caption, asset_ids_json, social_account_id, content_plan_id, title, format, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)",
      campaignId, brand.id, product.id, this.providers.social.name, caption, json(assets), account?.id || null, input.content_plan_id || null, input.title || product.name, input.format || "carousel", at, at,
    );
    return entity(this.store.get("SELECT * FROM campaigns WHERE id = ?", campaignId));
  }

  prepareSocial(input) {
    const campaignId = safeId(input.campaign_id, "campaign_id");
    const campaign = requiredRow(this.store.get("SELECT * FROM campaigns WHERE id = ?", campaignId), "campaign_not_found");
    const account = this.activeSocialAccount(campaign.brand_id, campaign.social_account_id);
    const action = String(input.action || "schedule");
    const fullAction = `social.${action}`;
    if (!CAMPAIGN_ACTIONS.has(fullAction)) throw new Error("social_action_invalid");
    let scheduledFor = null;
    if (action === "schedule") {
      scheduledFor = new Date(input.scheduled_for).toISOString();
      if (Date.parse(scheduledFor) <= new this.clock().getTime()) throw new Error("scheduled_for_invalid");
    }
    const budgetMinor = action === "create_ad" ? Number(input.budget_minor) : null;
    if (action === "create_ad" && (!Number.isSafeInteger(budgetMinor) || budgetMinor <= 0)) throw new Error("budget_minor_invalid");
    if (this.providers.social.name !== "mock" && (!account || account.connection_status !== "connected")) throw new Error("social_account_not_connected");
    if (this.providers.social.name === "meta-graph" && action === "publish" && !input.media_url) throw new Error("instagram_media_url_required");
    const payload = { campaign_id: campaign.id, brand_id: campaign.brand_id, product_id: campaign.product_id, caption: campaign.caption, asset_ids: campaign.asset_ids, scheduled_for: scheduledFor, budget_minor: budgetMinor, currency: input.currency ? currency(input.currency) : null, social_account_id: account?.id || null, account_external_id: account?.external_account_id || null, media_url: input.media_url || null };
    const approval = createApproval(this.store, { action: fullAction, risk: action === "create_ad" ? "money" : "publish", payload, summary: action === "create_ad" ? `広告予算 ${budgetMinor} ${payload.currency} で出稿` : `${campaign.id} を${action === "schedule" ? scheduledFor + " に予約" : "公開"}` }, this.clock);
    this.store.run("UPDATE campaigns SET status = 'approval_required', scheduled_for = ?, updated_at = ? WHERE id = ?", scheduledFor, nowIso(this.clock), campaign.id);
    return { approval_required: true, approval };
  }

  ingestDm(input) {
    const brand = this.brandGet(input.brand_id);
    const provider = cleanText(input.provider || "instagram", "dm_provider", 80);
    const externalMessageId = safeId(input.external_message_id, "external_message_id");
    const existing = entity(this.store.get("SELECT * FROM dm_messages WHERE provider = ? AND external_message_id = ?", provider, externalMessageId));
    if (existing) return { duplicate: true, message: existing };
    const customerExternalRef = input.customer_external_ref ? safeId(input.customer_external_ref, "customer_external_ref") : null;
    let customer = customerExternalRef ? entity(this.store.get("SELECT * FROM customers WHERE brand_id = ? AND external_ref = ?", brand.id, customerExternalRef)) : null;
    const at = nowIso(this.clock);
    if (!customer && customerExternalRef) {
      const customerId = id("cus");
      this.store.run("INSERT INTO customers(id, brand_id, external_ref, profile_json, consent_json, created_at, updated_at) VALUES (?, ?, ?, '{}', '{}', ?, ?)", customerId, brand.id, customerExternalRef, at, at);
      customer = entity(this.store.get("SELECT * FROM customers WHERE id = ?", customerId));
    }
    const result = classifyDm(input.body, brand.policy?.faq || {});
    const messageId = id("dm");
    this.store.run(
      "INSERT INTO dm_messages(id, brand_id, customer_id, provider, external_message_id, direction, body, classification, purchase_intent, reply_draft, created_at) VALUES (?, ?, ?, ?, ?, 'inbound', ?, ?, ?, ?, ?)",
      messageId, brand.id, customer?.id || null, provider, externalMessageId, input.body.trim(), result.classification, result.purchase_intent, result.reply_draft, at,
    );
    return { duplicate: false, message_id: messageId, customer_id: customer?.id || null, ...result, next_step: result.purchase_intent >= 0.7 ? "collect_order_information" : "review_reply_draft" };
  }

  prepareDmReply(input) {
    const message = requiredRow(this.store.get("SELECT * FROM dm_messages WHERE id = ?", safeId(input.message_id, "message_id")), "dm_message_not_found");
    const body = cleanText(input.body || message.reply_draft, "reply_body", 4000);
    const account = this.activeSocialAccount(message.brand_id, input.account_id);
    const customer = message.customer_id ? entity(this.store.get("SELECT * FROM customers WHERE id = ?", message.customer_id)) : null;
    const approval = createApproval(this.store, { action: "dm.reply", risk: "message", payload: { inbound_message_id: message.id, brand_id: message.brand_id, customer_id: message.customer_id, provider: message.provider, body, page_id: account?.metadata?.page_id || null, recipient_external_id: customer?.external_ref || null, social_account_id: account?.id || null }, summary: `DM ${message.external_message_id} へ返信` }, this.clock);
    return { approval_required: true, approval, reply_draft: body };
  }

  collectOrder(input) {
    const brand = this.brandGet(input.brand_id);
    const product = this.productGet(input.product_id);
    if (product.brand_id !== brand.id) throw new Error("product_brand_mismatch");
    const profile = jsonObject(input.customer || {}, "customer");
    const externalRef = input.customer_external_ref ? safeId(input.customer_external_ref, "customer_external_ref") : null;
    let customer = externalRef ? entity(this.store.get("SELECT * FROM customers WHERE brand_id = ? AND external_ref = ?", brand.id, externalRef)) : null;
    const at = nowIso(this.clock);
    if (!customer) {
      const customerId = id("cus");
      this.store.run("INSERT INTO customers(id, brand_id, external_ref, profile_json, consent_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", customerId, brand.id, externalRef, json(profile), json(input.consent || {}), at, at);
      customer = entity(this.store.get("SELECT * FROM customers WHERE id = ?", customerId));
    } else {
      this.store.run("UPDATE customers SET profile_json = ?, consent_json = ?, updated_at = ? WHERE id = ?", json({ ...customer.profile, ...profile }), json({ ...customer.consent, ...(input.consent || {}) }), at, customer.id);
      customer = entity(this.store.get("SELECT * FROM customers WHERE id = ?", customer.id));
    }
    const quantity = Number(input.quantity || 1);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) throw new Error("quantity_invalid");
    const orderId = input.id ? safeId(input.id, "order_id") : id("ord");
    this.store.run(
      "INSERT INTO orders(id, brand_id, product_id, customer_id, status, quantity, unit_price_minor, currency, customization_json, shipping_json, created_at, updated_at) VALUES (?, ?, ?, ?, 'collecting', ?, ?, ?, ?, ?, ?, ?)",
      orderId, brand.id, product.id, customer.id, quantity, product.price_minor, product.currency, json(input.customization || {}), json(input.shipping || {}), at, at,
    );
    return { order: this.orderGet(orderId), customer, missing_fields: this.orderMissingFields(customer.profile, input.shipping || {}) };
  }

  orderMissingFields(profile, shipping) {
    return [["customer.name", profile?.name], ["customer.email", profile?.email], ["shipping.country", shipping?.country], ["shipping.address", shipping?.address]].filter(([, value]) => !value).map(([name]) => name);
  }

  preparePayment(input) {
    const order = this.orderGet(input.order_id);
    const product = this.productGet(order.product_id);
    const customer = requiredRow(this.store.get("SELECT * FROM customers WHERE id = ?", order.customer_id), "customer_not_found");
    const kind = String(input.kind || "link");
    let action;
    let payload = { order_id: order.id, brand_id: order.brand_id, customer_id: customer.id, product_name: product.name, quantity: order.quantity, unit_price_minor: order.unit_price_minor, currency: order.currency };
    if (kind === "link") action = "payment.create_link";
    else if (kind === "invoice") {
      action = "payment.send_invoice";
      payload = { ...payload, customer_email: cleanText(customer.profile?.email, "customer_email", 320), customer_name: cleanText(customer.profile?.name, "customer_name", 200), days_until_due: Number(input.days_until_due || 7) };
    } else if (kind === "refund") {
      action = "payment.refund";
      const amountMinor = Number(input.amount_minor || order.unit_price_minor * order.quantity);
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > order.unit_price_minor * order.quantity) throw new Error("refund_amount_invalid");
      payload = { ...payload, payment_intent: cleanText(input.payment_intent || order.external_payment_ref, "payment_intent", 200), amount_minor: amountMinor };
    } else throw new Error("payment_kind_invalid");
    const summary = action === "payment.refund" ? `${order.id} を ${payload.amount_minor} ${order.currency} 返金` : `${order.id} の${kind === "invoice" ? "請求書送信" : "決済リンク作成"} (${order.unit_price_minor * order.quantity} ${order.currency})`;
    const approval = createApproval(this.store, { action, risk: "money", payload, summary }, this.clock);
    return { approval_required: true, approval };
  }

  paymentStatus(input) {
    const order = this.orderGet(input.order_id);
    return {
      order_id: order.id,
      status: order.status,
      total_minor: order.unit_price_minor * order.quantity,
      currency: order.currency,
      external_payment_ref: order.external_payment_ref || null,
      updated_at: order.updated_at,
    };
  }

  updateOrderStatus(input) {
    const order = this.orderGet(input.order_id);
    const status = String(input.status || "");
    if (!ORDER_STATUSES.has(status)) throw new Error("order_status_invalid");
    const at = nowIso(this.clock);
    this.store.transaction(() => {
      this.store.run("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", status, at, order.id);
      this.store.run("INSERT INTO fulfillment_events(id, order_id, status, details_json, created_at) VALUES (?, ?, ?, ?, ?)", id("ful"), order.id, status, json(input.details || {}), at);
    });
    return this.orderGet(order.id);
  }

  prepareNotification(input) {
    const brand = this.brandGet(input.brand_id);
    const payload = { brand_id: brand.id, topic: cleanText(input.topic, "notification_topic", 120), message: cleanText(input.message, "notification_message", 4000), audience_ref: input.audience_ref ? safeId(input.audience_ref, "audience_ref") : null };
    const approval = createApproval(this.store, { action: "notification.send", risk: "message", payload, summary: `${brand.name}: ${payload.topic} を通知` }, this.clock);
    return { approval_required: true, approval };
  }

  approvalGet(approvalId) {
    return requiredRow(this.store.get("SELECT * FROM approval_requests WHERE id = ?", safeId(approvalId, "approval_id")), "approval_not_found");
  }

  listApprovals(input = {}) {
    const status = input.status || "pending";
    return this.store.all("SELECT * FROM approval_requests WHERE status = ? ORDER BY created_at DESC LIMIT ?", status, Math.min(Number(input.limit || 50), 100)).map(entity);
  }

  async executeApproved(input) {
    const approval = this.approvalGet(input.approval_id);
    if (approval.status === "completed") {
      const completed = entity(this.store.get("SELECT * FROM effect_runs WHERE approval_id = ?", approval.id));
      return { idempotent_replay: true, approval, effect: completed };
    }
    if (approval.status !== "pending") throw new Error("approval_not_pending");
    const claims = verifyApprovalGrant(input.grant_token, approval, this.config.approvalSecret);
    const idempotencyKey = cleanText(input.idempotency_key, "idempotency_key", 200);
    const existing = entity(this.store.get("SELECT * FROM effect_runs WHERE idempotency_key = ? OR approval_id = ?", idempotencyKey, approval.id));
    if (existing) {
      if (existing.approval_id !== approval.id || existing.idempotency_key !== idempotencyKey) throw new Error("idempotency_conflict");
      if (existing.status === "completed") return { idempotent_replay: true, approval: this.approvalGet(approval.id), effect: existing };
      throw new Error("effect_reconciliation_required");
    }
    const runId = id("efx");
    const provider = this.providerForAction(approval.action);
    const at = nowIso(this.clock);
    this.store.transaction(() => {
      this.store.run("UPDATE approval_requests SET status = 'executing', actor_id = ?, approved_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'", claims.actor_id, at, at, approval.id);
      this.store.run("INSERT INTO effect_runs(id, approval_id, idempotency_key, provider, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'executing', ?, ?)", runId, approval.id, idempotencyKey, provider, at, at);
    });
    try {
      const receipt = await this.performAction(approval.action, approval.payload, { idempotencyKey });
      const doneAt = nowIso(this.clock);
      const { status: providerStatus, ...providerReceipt } = receipt;
      const fullReceipt = {
        receipt_id: id("rcp"), run_id: runId, server_name: "io.rockstar-ibot/instagram-operations", version: "0.1.0",
        package_digest: this.config.packageDigest || "20bc662fcf0dc21dfad772e61b6d590de2b9b5330e4482a001e24ac19f33e486", capability_id: CAPABILITY_BY_ACTION[approval.action] || "unknown",
        grant_id: approval.id, action: approval.action, approval_id: approval.id, idempotency_key: idempotencyKey,
        input_sha256: approval.payload_digest, output_sha256: sha256(receipt), provider_status: providerStatus || "unknown", status: "completed", started_at: at, finished_at: doneAt, ...providerReceipt,
      };
      this.store.transaction(() => {
        this.store.run("UPDATE effect_runs SET status = 'completed', receipt_json = ?, updated_at = ? WHERE id = ?", json(fullReceipt), doneAt, runId);
        this.store.run("UPDATE approval_requests SET status = 'completed', updated_at = ? WHERE id = ?", doneAt, approval.id);
      });
      return { idempotent_replay: false, approval: this.approvalGet(approval.id), effect: entity(this.store.get("SELECT * FROM effect_runs WHERE id = ?", runId)) };
    } catch (error) {
      const failedAt = nowIso(this.clock);
      this.store.transaction(() => {
        this.store.run("UPDATE effect_runs SET status = 'reconciliation_required', receipt_json = ?, updated_at = ? WHERE id = ?", json({ error_code: error.message, input_sha256: approval.payload_digest }), failedAt, runId);
        this.store.run("UPDATE approval_requests SET status = 'reconciliation_required', updated_at = ? WHERE id = ?", failedAt, approval.id);
      });
      throw error;
    }
  }

  providerForAction(action) {
    if (action === "product.price_change") return "local-db";
    if (action.startsWith("creative.")) return this.providers.creative.name;
    if (action.startsWith("social.") || action.startsWith("dm.")) return this.providers.social.name;
    if (action.startsWith("payment.")) return this.providers.payment.name;
    if (action.startsWith("notification.")) return this.providers.notification.name;
    throw new Error("approval_action_unsupported");
  }

  async performAction(action, payload, context) {
    if (action === "product.price_change") {
      this.store.run("UPDATE products SET name = ?, design_json = ?, price_minor = ?, currency = ?, status = ?, updated_at = ? WHERE id = ? AND brand_id = ?", payload.name, json(payload.design), payload.price_minor, payload.currency, payload.status, nowIso(this.clock), payload.product_id, payload.brand_id);
      return { provider: "local-db", external_ref: `product://${payload.product_id}`, status: "confirmed", provider_readback_sha256: sha256(this.productGet(payload.product_id)) };
    }
    if (action === "creative.generate") {
      this.store.run("UPDATE creative_assets SET status = 'generating', updated_at = ? WHERE id = ?", nowIso(this.clock), payload.asset_id);
      const receipt = await this.providers.creative.generate(payload, context);
      this.store.run("UPDATE creative_assets SET status = 'ready', output_json = ?, updated_at = ? WHERE id = ?", json(receipt), nowIso(this.clock), payload.asset_id);
      return receipt;
    }
    if (CAMPAIGN_ACTIONS.has(action)) {
      const receipt = await this.providers.social.execute(action, payload, context);
      const status = action === "social.schedule" ? "scheduled" : "published";
      this.store.run("UPDATE campaigns SET status = ?, external_ref = ?, updated_at = ? WHERE id = ?", status, receipt.external_ref || null, nowIso(this.clock), payload.campaign_id);
      return receipt;
    }
    if (action === "dm.reply") {
      const receipt = await this.providers.social.execute(action, payload, context);
      this.store.run("INSERT INTO dm_messages(id, brand_id, customer_id, provider, external_message_id, direction, body, classification, purchase_intent, created_at) VALUES (?, ?, ?, ?, ?, 'outbound', ?, 'reply', 0, ?)", id("dm"), payload.brand_id, payload.customer_id, payload.provider, receipt.external_ref || id("external"), payload.body, nowIso(this.clock));
      return receipt;
    }
    if (action.startsWith("payment.")) {
      const receipt = await this.providers.payment.execute(action, payload, context);
      this.store.run("UPDATE orders SET status = ?, external_payment_ref = COALESCE(?, external_payment_ref), updated_at = ? WHERE id = ?", action === "payment.refund" ? "refunded" : "payment_pending", receipt.external_ref || null, nowIso(this.clock), payload.order_id);
      return receipt;
    }
    if (action === "notification.send") return this.providers.notification.execute(action, payload, context);
    throw new Error("approval_action_unsupported");
  }

  processPaymentEvent(input) {
    const provider = cleanText(input.provider || "stripe", "provider", 80);
    const eventId = safeId(input.event_id, "event_id");
    const eventType = cleanText(input.event_type, "event_type", 160);
    const payload = jsonObject(input.payload || {}, "event_payload");
    const digest = sha256(payload);
    const previous = entity(this.store.get("SELECT * FROM provider_events WHERE provider = ? AND external_event_id = ?", provider, eventId));
    if (previous) {
      if (previous.payload_digest !== digest) throw new Error("provider_event_digest_conflict");
      return { duplicate: true, event_id: eventId };
    }
    const orderId = payload.order_id || payload.metadata?.order_id;
    const at = nowIso(this.clock);
    this.store.transaction(() => {
      this.store.run("INSERT INTO provider_events(id, provider, external_event_id, event_type, payload_digest, processed_at) VALUES (?, ?, ?, ?, ?, ?)", id("evt"), provider, eventId, eventType, digest, at);
      if (orderId) {
        const order = this.orderGet(orderId);
        const paid = new Set(["checkout.session.completed", "invoice.paid", "payment_intent.succeeded"]).has(eventType);
        const refunded = new Set(["charge.refunded", "refund.updated"]).has(eventType) && (payload.status === "succeeded" || payload.refunded === true);
        if (paid || refunded) {
          const status = refunded ? "refunded" : "paid";
          const paymentRef = payload.payment_intent || payload.id || order.external_payment_ref;
          this.store.run("UPDATE orders SET status = ?, external_payment_ref = ?, updated_at = ? WHERE id = ?", status, paymentRef || null, at, order.id);
          this.store.run("INSERT INTO metrics(id, brand_id, metric_type, value, dimensions_json, observed_at) VALUES (?, ?, ?, ?, ?, ?)", id("met"), order.brand_id, refunded ? "refund_minor" : "sale_minor", refunded ? Number(payload.amount || order.unit_price_minor * order.quantity) : order.unit_price_minor * order.quantity, json({ order_id: order.id, currency: order.currency, provider }), at);
        }
      }
    });
    return { duplicate: false, event_id: eventId, order_id: orderId || null, order: orderId ? this.orderGet(orderId) : null };
  }

  recordMetric(input) {
    const brand = this.brandGet(input.brand_id);
    const value = Number(input.value);
    if (!Number.isFinite(value)) throw new Error("metric_value_invalid");
    const metricId = id("met");
    this.store.run("INSERT INTO metrics(id, brand_id, campaign_id, metric_type, value, dimensions_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?)", metricId, brand.id, input.campaign_id || null, cleanText(input.metric_type, "metric_type", 100), value, json(input.dimensions || {}), input.observed_at ? new Date(input.observed_at).toISOString() : nowIso(this.clock));
    return { id: metricId };
  }

  async syncInsights(input) {
    const brand = this.brandGet(input.brand_id);
    const account = this.activeSocialAccount(brand.id, input.account_id);
    if (!account) throw new Error("social_account_not_selected");
    if (account.connection_status !== "connected") throw new Error("social_account_not_connected");
    const result = await this.providers.social.syncInsights(account);
    const observedAt = nowIso(this.clock);
    let recorded = 0;
    for (const metric of result.metrics || []) {
      const name = metric.name || metric.metric_type;
      const raw = metric.value ?? metric.values?.at(-1)?.value;
      const value = Number(raw);
      if (!name || !Number.isFinite(value)) continue;
      this.recordMetric({ brand_id: brand.id, metric_type: `instagram.${name}`, value, dimensions: { social_account_id: account.id, username: account.username, period: metric.period || null }, observed_at: observedAt });
      recorded += 1;
    }
    this.store.run("UPDATE social_accounts SET last_synced_at = ?, updated_at = ? WHERE id = ?", observedAt, observedAt, account.id);
    return { account_id: account.id, username: account.username, recorded, provider_readback_sha256: result.provider_readback_sha256 };
  }

  calendar(input) {
    const brand = this.brandGet(input.brand_id);
    const from = input.from ? new Date(input.from).toISOString() : "1970-01-01T00:00:00.000Z";
    const to = input.to ? new Date(input.to).toISOString() : "9999-12-31T23:59:59.999Z";
    return this.store.all("SELECT * FROM campaigns WHERE brand_id = ? AND (scheduled_for IS NULL OR scheduled_for BETWEEN ? AND ?) ORDER BY COALESCE(scheduled_for, created_at)", brand.id, from, to).map(entity);
  }

  analytics(input) {
    const brand = this.brandGet(input.brand_id);
    const dmRows = this.store.all("SELECT classification, COUNT(*) AS count FROM dm_messages WHERE brand_id = ? AND direction = 'inbound' GROUP BY classification", brand.id);
    const orderRows = this.store.all("SELECT status, COUNT(*) AS count, SUM(quantity * unit_price_minor) AS gross_minor FROM orders WHERE brand_id = ? GROUP BY status", brand.id);
    const campaigns = this.store.all("SELECT campaign_id, SUM(value) AS value FROM metrics WHERE brand_id = ? AND campaign_id IS NOT NULL GROUP BY campaign_id", brand.id);
    const metrics = this.store.all("SELECT metric_type, SUM(value) AS value FROM metrics WHERE brand_id = ? GROUP BY metric_type", brand.id);
    return {
      brand_id: brand.id,
      dm: Object.fromEntries(dmRows.map((row) => [row.classification, Number(row.count)])),
      orders: Object.fromEntries(orderRows.map((row) => [row.status, { count: Number(row.count), gross_minor: Number(row.gross_minor || 0) }])),
      sales: { paid_orders: Number(orderRows.find((row) => row.status === "paid")?.count || 0), paid_gross_minor: Number(orderRows.find((row) => row.status === "paid")?.gross_minor || 0) },
      campaigns: campaigns.map((row) => ({ campaign_id: row.campaign_id, value: Number(row.value || 0) })),
      metrics: Object.fromEntries(metrics.map((row) => [row.metric_type, Number(row.value || 0)])),
    };
  }

  latestFeedback(brandId) {
    return entity(this.store.get("SELECT * FROM feedback_snapshots WHERE brand_id = ? ORDER BY version DESC LIMIT 1", brandId));
  }

  buildFeedback(input) {
    const snapshot = this.analytics(input);
    const previous = this.latestFeedback(snapshot.brand_id);
    const version = (previous?.version || 0) + 1;
    const feedback = { generated_from: { dm: snapshot.dm, sales: snapshot.sales, campaigns: snapshot.campaigns, metrics: snapshot.metrics }, recommendations: feedbackRecommendations(snapshot) };
    const feedbackId = id("fdb");
    this.store.run("INSERT INTO feedback_snapshots(id, brand_id, version, feedback_json, created_at) VALUES (?, ?, ?, ?, ?)", feedbackId, snapshot.brand_id, version, json(feedback), nowIso(this.clock));
    return { id: feedbackId, brand_id: snapshot.brand_id, version, feedback };
  }

  dashboard(input) {
    const brand = this.brandGet(input.brand_id);
    return {
      brand,
      products: this.store.all("SELECT * FROM products WHERE brand_id = ? ORDER BY updated_at DESC", brand.id).map(entity),
      orders: this.store.all("SELECT * FROM orders WHERE brand_id = ? ORDER BY updated_at DESC LIMIT 100", brand.id).map(entity),
      pending_approvals: this.store.all("SELECT * FROM approval_requests WHERE status = 'pending' AND payload_json LIKE ? ORDER BY created_at DESC", `%${brand.id}%`).map(entity),
      analytics: this.analytics({ brand_id: brand.id }),
      feedback: this.latestFeedback(brand.id),
    };
  }
}
