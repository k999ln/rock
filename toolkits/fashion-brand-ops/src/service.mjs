import { analyzeMarket, buildAutopilotPlan, buildConciergeRecommendation, buildCreativeBrief, classifyDm, composeCaption, feedbackRecommendations } from "./domain.mjs";
import { createApproval, verifyApprovalGrant } from "./approval.mjs";
import { assertSecretFree, cleanText, currency, id, jsonObject, nowIso, safeId, sha256, stableJson } from "./util.mjs";

const ORDER_STATUSES = new Set(["collecting", "quoted", "payment_pending", "paid", "in_production", "quality_check", "ready_to_ship", "shipped", "delivered", "cancelled", "refunded"]);
const FINANCIAL_ORDER_STATUSES = new Set(["payment_pending", "paid", "refunded"]);
const ORDER_TRANSITIONS = Object.freeze({
  collecting: new Set(["quoted", "cancelled"]),
  quoted: new Set(["cancelled"]),
  payment_pending: new Set(["cancelled"]),
  paid: new Set(["in_production"]),
  in_production: new Set(["quality_check"]),
  quality_check: new Set(["in_production", "ready_to_ship"]),
  ready_to_ship: new Set(["shipped"]),
  shipped: new Set(["delivered"]),
  delivered: new Set(),
  cancelled: new Set(),
  refunded: new Set(),
});
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
function publicCandidate(row) {
  const candidate = entity(row);
  if (!candidate) return null;
  const sourceDigests = Array.isArray(candidate.source_digests) ? candidate.source_digests : [];
  delete candidate.source_digests;
  return { ...candidate, screenshot_count: sourceDigests.length, screenshots_stored: false };
}
function screenshotCount(value, label) {
  if (value === undefined || value === null) return undefined;
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error(`${label}_invalid`);
  return count;
}

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

  startProducer(input) {
    const runId = safeId(input.run_id, "producer_run_id");
    const worldview = cleanText(input.worldview, "worldview", 1200);
    const productDesign = cleanText(input.product_design, "product_design", 1200);
    const region = input.region?.trim() ? cleanText(input.region, "region", 80) : "日本を起点にオンライン";
    const currencyCode = currency(input.currency || (/海外|global|international|US/i.test(region) ? "USD" : "JPY"));
    const hasPrice = input.price_minor !== undefined && input.price_minor !== null;
    const priceMinor = hasPrice ? Number(input.price_minor) : 0;
    if (!Number.isSafeInteger(priceMinor) || priceMinor < 0) throw new Error("price_minor_invalid");
    const digestInput = {
      worldview,
      product_design: productDesign,
      region,
      currency: currencyCode,
      price_minor: hasPrice ? priceMinor : null,
      brand_name: input.brand_name || null,
      product_name: input.product_name || null,
    };
    const inputHash = sha256(digestInput);
    const existing = entity(this.store.get("SELECT * FROM producer_runs WHERE id = ?", runId));
    if (existing) {
      if (existing.input_hash !== inputHash) throw new Error("producer_run_id_conflict");
      return { idempotent_replay: true, ...existing.result };
    }

    const suffix = sha256(runId).slice(0, 24);
    const brandName = input.brand_name?.trim()
      ? cleanText(input.brand_name, "brand_name", 160)
      : `New Brand ${suffix.slice(0, 6)}`;
    const productName = input.product_name?.trim()
      ? cleanText(input.product_name, "product_name", 200)
      : productDesign.slice(0, 72);
    const brandId = `brd_pro_${suffix}`;
    const productId = `prd_pro_${suffix}`;
    let result;
    this.store.transaction(() => {
      const brand = this.upsertBrand({
        id: brandId,
        name: brandName,
        policy: {
          concept: worldview,
          worldview,
          regions: [region],
          made_to_order: true,
          prohibited: ["unverified claims", "visible third-party logos", "product specification changes"],
        },
      });
      const productWrite = this.upsertProduct({
        id: productId,
        brand_id: brand.id,
        name: productName,
        design: {
          brief: productDesign,
          made_to_order: true,
          price_status: hasPrice ? "confirmed" : "needs_decision",
        },
        price_minor: priceMinor,
        currency: currencyCode,
        status: "draft",
      });
      if (productWrite.approval_required) throw new Error("producer_product_write_unexpected_approval");
      const product = productWrite.product;
      const market = this.analyzeMarket({ brand_id: brand.id, product_id: product.id });
      const contentPlan = this.createContentPlan({
        brand_id: brand.id,
        period_start: nowIso(this.clock),
        days: 14,
        posts_per_week: 3,
        objective: "qualified_dm_and_made_to_order_sales",
        pillars: ["product_proof", "worldview", "craft", "fit_confidence", "made_to_order", "faq"],
      });
      const draft = this.composeSocial({
        brand_id: brand.id,
        product_id: product.id,
        content_plan_id: contentPlan.id,
        title: "Producer launch draft",
        format: "carousel",
        language: "ja",
        call_to_action: "サイズ・仕様・納期はDMでご相談ください",
      });
      const creative = this.prepareCreative({
        brand_id: brand.id,
        product_id: product.id,
        media_type: "image",
        format: "4:5",
      });
      const decisionsNeeded = [
        ...(!hasPrice ? [{ key: "price", label: "販売価格", reason: "お金に関わるためAIが確定しません" }] : []),
        { key: "launch_date", label: "公開日", reason: "公開タイミングは本人が決めます" },
        { key: "order_capacity", label: "受注上限", reason: "制作能力を超えない数を本人が決めます" },
      ];
      result = {
        run_id: runId,
        mode: "producer",
        brand,
        product,
        market,
        content_plan: contentPlan,
        first_draft: draft,
        creative,
        ai_completed: ["target_market", "positioning", "creative_brief", "14_day_content_plan", "instagram_caption", "dm_to_order_flow"],
        decisions_needed: decisionsNeeded,
        approval_queue: [{ approval_id: creative.approval.approval_id, action: "creative.generate", status: "pending" }],
        external_effects_executed: false,
      };
      const at = nowIso(this.clock);
      this.store.run(
        "INSERT INTO producer_runs(id, input_hash, brand_id, product_id, result_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        runId, inputHash, brand.id, product.id, json(result), at, at,
      );
    });
    return { idempotent_replay: false, ...result };
  }

  orderGet(orderId) {
    return requiredRow(this.store.get("SELECT * FROM orders WHERE id = ?", safeId(orderId, "order_id")), "order_not_found");
  }

  goalGet(goalId) {
    return requiredRow(this.store.get("SELECT * FROM business_goals WHERE id = ?", safeId(goalId, "goal_id")), "business_goal_not_found");
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

  createAutopilotGoal(input) {
    const brand = this.brandGet(input.brand_id);
    const product = this.productGet(input.product_id);
    if (product.brand_id !== brand.id) throw new Error("product_brand_mismatch");
    const targetUnits = Number(input.target_units);
    const targetRevenueMinor = input.target_revenue_minor == null ? null : Number(input.target_revenue_minor);
    const targetGrossMarginBps = Number(input.target_gross_margin_bps ?? 6000);
    const adBudgetCapMinor = Number(input.ad_budget_cap_minor ?? 0);
    if (!Number.isSafeInteger(targetUnits) || targetUnits < 1 || targetUnits > 100_000) throw new Error("target_units_invalid");
    if (targetRevenueMinor !== null && (!Number.isSafeInteger(targetRevenueMinor) || targetRevenueMinor < 0)) throw new Error("target_revenue_invalid");
    if (!Number.isSafeInteger(targetGrossMarginBps) || targetGrossMarginBps < 0 || targetGrossMarginBps > 10_000) throw new Error("target_margin_invalid");
    if (!Number.isSafeInteger(adBudgetCapMinor) || adBudgetCapMinor < 0) throw new Error("ad_budget_cap_invalid");
    const startsAt = new Date(input.starts_at || nowIso(this.clock));
    const endsAt = new Date(input.ends_at);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new Error("goal_period_invalid");
    const objective = {
      target_units: targetUnits,
      target_revenue_minor: targetRevenueMinor,
      target_gross_margin_bps: targetGrossMarginBps,
      ad_budget_cap_minor: adBudgetCapMinor,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
    };
    const goalId = input.id ? safeId(input.id, "goal_id") : id("gol");
    const existing = entity(this.store.get("SELECT * FROM business_goals WHERE id = ?", goalId));
    if (existing) {
      if (existing.brand_id !== brand.id || existing.product_id !== product.id || sha256(existing.objective) !== sha256(objective)) throw new Error("business_goal_id_conflict");
      return { idempotent_replay: true, ...this.autopilotGet({ goal_id: goalId }) };
    }
    const market = this.latestMarket(brand, product);
    const feedback = this.latestFeedback(brand.id)?.feedback || null;
    const plan = buildAutopilotPlan({ brand, product, market, objective, feedback });
    const at = nowIso(this.clock);
    const actions = [
      { kind: "market", priority: 100, risk: "internal", status: "ready", reason: "最新の市場仮説を目標へ固定する", tool_name: "fashion.market.analyze", input: { brand_id: brand.id, product_id: product.id } },
      { kind: "creative_experiment", priority: 90, risk: "external_write", status: "ready", reason: "3仮説の最初の広告素材を作る。provider実行時は個別承認", tool_name: "fashion.creative.prepare", input: { brand_id: brand.id, product_id: product.id, media_type: "image", format: "4:5" } },
      { kind: "content_plan", priority: 80, risk: "internal", status: "ready", reason: "目標期間と必要販売ペースから投稿枠を作る", tool_name: "instagram.content_plan.create", input: { brand_id: brand.id, period_start: objective.starts_at, days: Math.max(7, Math.min(90, Math.ceil((endsAt - startsAt) / 86_400_000))), posts_per_week: plan.content.posts_per_week, objective: "qualified_dm_and_paid_orders", pillars: plan.content.pillars } },
      { kind: "sales_followup", priority: 70, risk: "message", status: "blocked", reason: "購入意向DMを検出したら返信案を作る。送信は個別承認", tool_name: "fashion.sales.pipeline.get", input: { brand_id: brand.id } },
      { kind: "production", priority: 60, risk: "internal", status: "blocked", reason: "署名検証済み入金後に制作計画を作る", tool_name: "fashion.production.dashboard", input: { brand_id: brand.id } },
    ];
    this.store.transaction(() => {
      this.store.run("INSERT INTO business_goals(id, brand_id, product_id, status, objective_json, plan_json, progress_json, starts_at, ends_at, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, '{}', ?, ?, ?, ?)", goalId, brand.id, product.id, json(objective), json(plan), objective.starts_at, objective.ends_at, at, at);
      for (const action of actions) {
        this.store.run("INSERT INTO workflow_actions(id, goal_id, kind, status, priority, risk, reason, tool_name, input_json, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id("act"), goalId, action.kind, action.status, action.priority, action.risk, action.reason, action.tool_name, json(action.input), objective.starts_at, at, at);
      }
    });
    return { idempotent_replay: false, ...this.autopilotGet({ goal_id: goalId }) };
  }

  autopilotGet(input) {
    const goal = this.goalGet(input.goal_id);
    return {
      goal,
      actions: this.store.all("SELECT * FROM workflow_actions WHERE goal_id = ? ORDER BY priority DESC, created_at", goal.id).map(entity),
    };
  }

  autopilotTick(input) {
    const goal = this.goalGet(input.goal_id);
    if (goal.status !== "active") return { ...this.autopilotGet(input), next_actions: [], reason: "goal_not_active" };
    const analytics = this.analytics({ brand_id: goal.brand_id });
    const campaignCount = Number(this.store.get("SELECT COUNT(*) AS count FROM campaigns WHERE brand_id = ? AND product_id = ?", goal.brand_id, goal.product_id).count);
    const contentPlanCount = Number(this.store.get("SELECT COUNT(*) AS count FROM content_plans WHERE brand_id = ?", goal.brand_id).count);
    const latestContentPlan = entity(this.store.get("SELECT * FROM content_plans WHERE brand_id = ? ORDER BY updated_at DESC LIMIT 1", goal.brand_id));
    const assetCount = Number(this.store.get("SELECT COUNT(*) AS count FROM creative_assets WHERE brand_id = ? AND product_id = ?", goal.brand_id, goal.product_id).count);
    const pendingApprovals = Number(this.store.get("SELECT COUNT(*) AS count FROM approval_requests WHERE status = 'pending' AND json_extract(payload_json, '$.brand_id') = ?", goal.brand_id).count);
    const journeyIntent = Number(this.store.get("SELECT COUNT(*) AS count FROM customer_journeys WHERE brand_id = ? AND score >= 0.6 AND stage NOT IN ('customer','vip')", goal.brand_id).count);
    const messageIntent = Number(this.store.get("SELECT COUNT(DISTINCT customer_id) AS count FROM dm_messages WHERE brand_id = ? AND direction = 'inbound' AND purchase_intent >= 0.6 AND customer_id IS NOT NULL", goal.brand_id).count);
    const highIntent = Math.max(journeyIntent, messageIntent);
    const paidUnplanned = this.store.all("SELECT o.id FROM orders o LEFT JOIN production_jobs p ON p.order_id = o.id WHERE o.brand_id = ? AND o.status = 'paid' AND p.id IS NULL ORDER BY o.updated_at LIMIT 20", goal.brand_id);
    const soldUnits = Number(this.store.get("SELECT COALESCE(SUM(quantity), 0) AS count FROM orders WHERE brand_id = ? AND product_id = ? AND status IN ('paid','in_production','quality_check','ready_to_ship','shipped','delivered')", goal.brand_id, goal.product_id).count);
    const revenueMinor = Number(this.store.get("SELECT COALESCE(SUM(quantity * unit_price_minor), 0) AS amount FROM orders WHERE brand_id = ? AND product_id = ? AND status IN ('paid','in_production','quality_check','ready_to_ship','shipped','delivered')", goal.brand_id, goal.product_id).amount);
    const progress = {
      sold_units: soldUnits,
      target_units: goal.objective.target_units,
      unit_progress: goal.objective.target_units ? Number((soldUnits / goal.objective.target_units).toFixed(4)) : 0,
      revenue_minor: revenueMinor,
      campaign_count: campaignCount,
      content_plan_count: contentPlanCount,
      creative_asset_count: assetCount,
      high_intent_customers: highIntent,
      paid_orders_without_production_plan: paidUnplanned.length,
      pending_approvals: pendingApprovals,
      analytics,
      observed_at: nowIso(this.clock),
    };
    const nextActions = [];
    if (pendingApprovals) nextActions.push({ priority: 100, tool_name: "approval.list", input: { status: "pending", limit: 50 }, reason: `${pendingApprovals}件の外部作用が承認待ち` });
    if (!assetCount) nextActions.push({ priority: 90, tool_name: "fashion.creative.prepare", input: { brand_id: goal.brand_id, product_id: goal.product_id, media_type: "image", format: "4:5" }, reason: "目標商品に広告素材がない" });
    if (!contentPlanCount) nextActions.push({ priority: 88, tool_name: "instagram.content_plan.create", input: { brand_id: goal.brand_id, period_start: goal.objective.starts_at, days: Math.max(7, Math.min(90, Math.ceil((Date.parse(goal.objective.ends_at) - Date.parse(goal.objective.starts_at)) / 86_400_000))), posts_per_week: goal.plan.content.posts_per_week, objective: "qualified_dm_and_paid_orders", pillars: goal.plan.content.pillars }, reason: "目標期間の投稿計画がない" });
    if (!campaignCount && latestContentPlan) nextActions.push({ priority: 80, tool_name: "instagram.draft.create", input: { brand_id: goal.brand_id, product_id: goal.product_id, content_plan_id: latestContentPlan.id, title: "Autopilot experiment A", format: "carousel" }, reason: "目標商品に投稿draftがない" });
    if (highIntent) nextActions.push({ priority: 85, tool_name: "fashion.sales.pipeline.get", input: { brand_id: goal.brand_id }, reason: `${highIntent}人の購入検討顧客をフォロー` });
    for (const row of paidUnplanned) nextActions.push({ priority: 95, tool_name: "fashion.production.plan", input: { order_id: row.id }, reason: "入金確認済み注文に制作計画がない" });
    if (assetCount && campaignCount && !pendingApprovals) nextActions.push({ priority: 50, tool_name: "fashion.feedback.build", input: { brand_id: goal.brand_id }, reason: "直近データを次回creativeへ反映" });
    nextActions.sort((a, b) => b.priority - a.priority);
    this.store.run("UPDATE business_goals SET progress_json = ?, updated_at = ? WHERE id = ?", json(progress), nowIso(this.clock), goal.id);
    return { ...this.autopilotGet({ goal_id: goal.id }), progress, next_actions: nextActions, external_effects_executed: false };
  }

  async autopilotRun(input) {
    const goal = this.goalGet(input.goal_id);
    const maxActions = Number(input.max_actions || 10);
    if (!Number.isSafeInteger(maxActions) || maxActions < 1 || maxActions > 25) throw new Error("autopilot_max_actions_invalid");
    const handlers = {
      "fashion.creative.prepare": (args) => this.prepareCreative(args),
      "instagram.content_plan.create": (args) => this.createContentPlan(args),
      "instagram.draft.create": (args) => this.composeSocial(args),
      "fashion.production.plan": (args) => this.planProduction(args),
      "fashion.feedback.build": (args) => this.buildFeedback(args),
    };
    const attempted = new Set();
    const completed = [];
    const failed = [];
    let processed = 0;
    let latestContentPlanId = null;
    for (let cycle = 0; cycle < 3 && processed < maxActions; cycle += 1) {
      const tick = this.autopilotTick({ goal_id: goal.id });
      let advanced = false;
      for (const action of tick.next_actions) {
        const handler = handlers[action.tool_name];
        if (!handler || processed >= maxActions) continue;
        const args = { ...(action.input || {}) };
        if (action.tool_name === "instagram.draft.create" && latestContentPlanId) args.content_plan_id = latestContentPlanId;
        const signature = sha256({ tool_name: action.tool_name, input: args });
        if (attempted.has(signature)) continue;
        attempted.add(signature);
        processed += 1;
        try {
          const result = await handler(args);
          if (action.tool_name === "instagram.content_plan.create") latestContentPlanId = result.id;
          completed.push({ tool_name: action.tool_name, input: args, result });
          this.store.run(
            "UPDATE workflow_actions SET status = ?, updated_at = ? WHERE goal_id = ? AND tool_name = ? AND status IN ('ready','blocked','approval_required')",
            result?.approval_required ? "approval_required" : "completed", nowIso(this.clock), goal.id, action.tool_name,
          );
          advanced = true;
        } catch (error) {
          failed.push({ tool_name: action.tool_name, input: args, error: error.message });
        }
      }
      if (!advanced) break;
    }
    const pendingApprovals = this.listApprovals({ status: "pending", limit: 100 }).filter((approval) => approval.payload?.brand_id === goal.brand_id);
    return {
      goal_id: goal.id,
      completed,
      failed,
      processed,
      pending_approvals: pendingApprovals,
      next: this.autopilotTick({ goal_id: goal.id }),
      external_effects_executed: false,
    };
  }

  readiness(input = {}) {
    const brand = input.brand_id ? this.brandGet(input.brand_id) : null;
    const accounts = brand ? this.listSocialAccounts({ brand_id: brand.id }) : [];
    const connectedAccounts = accounts.filter((account) => account.connection_status === "connected");
    const approvalReady = Buffer.byteLength(this.config.approvalSecret || "") >= 32;
    const socialConfigured = this.providers.social.name === "meta-graph"
      ? Boolean(this.config.metaGraphApiBaseUrl && this.config.metaAccessToken && this.config.metaAppSecret && this.config.instagramVerifyToken)
      : this.providers.social.name === "instagram-http"
        ? Boolean(this.config.socialProviderUrl && this.config.socialProviderToken)
        : false;
    const paymentConfigured = this.providers.payment.name === "stripe"
      ? Boolean(this.config.stripeSecretKey && this.config.stripeWebhookSecret && this.config.stripeSuccessUrl && this.config.stripeCancelUrl)
      : false;
    const creativeConfigured = this.providers.creative.name === "higgsfield"
      ? Boolean(this.config.higgsfieldApiUrl && this.config.higgsfieldApiKey)
      : false;
    const notificationConfigured = this.providers.notification.name === "webhook"
      ? Boolean(this.config.notificationWebhookUrl && this.config.notificationWebhookToken)
      : false;
    const instagramReady = approvalReady && socialConfigured && (!brand || connectedAccounts.length > 0);
    const missing = [];
    if (!approvalReady) missing.push("approval_secret");
    if (!socialConfigured) missing.push(this.providers.social.name === "mock" ? "live_social_provider" : "social_provider_configuration");
    if (brand && !connectedAccounts.length) missing.push("connected_instagram_account");
    return {
      status: instagramReady ? "instagram_live_ready" : "setup_required",
      brand_id: brand?.id || null,
      planning_ready: true,
      external_effects_require_approval: true,
      capabilities: {
        approval: { ready: approvalReady },
        instagram: { ready: instagramReady, provider: this.providers.social.name, configured: socialConfigured, connected_accounts: connectedAccounts.length },
        creative: { ready: approvalReady && creativeConfigured, provider: this.providers.creative.name, configured: creativeConfigured },
        payment: { ready: approvalReady && paymentConfigured, provider: this.providers.payment.name, configured: paymentConfigured },
        notification: { ready: approvalReady && notificationConfigured, provider: this.providers.notification.name, configured: notificationConfigured },
      },
      missing,
      secrets_exposed: false,
    };
  }

  listSocialAccounts(input) {
    const brand = this.brandGet(input.brand_id);
    return this.store.all("SELECT * FROM social_accounts WHERE brand_id = ? ORDER BY is_active DESC, username", brand.id).map(entity);
  }

  intakeSocialAccountScreenshots(input) {
    const brand = this.brandGet(input.brand_id);
    assertSecretFree(input, "instagram_screenshot_intake");
    if (!Array.isArray(input.screenshots) || input.screenshots.length < 1 || input.screenshots.length > 10) throw new Error("screenshots_invalid");
    const accepted = [];
    let created = 0;
    let updated = 0;
    for (const screenshot of input.screenshots) {
      if (!screenshot || typeof screenshot !== "object" || Array.isArray(screenshot)) throw new Error("screenshot_invalid");
      for (const key of Object.keys(screenshot)) if (!new Set(["source_sha256", "accounts"]).has(key)) throw new Error("screenshot_field_invalid");
      const sourceDigest = String(screenshot.source_sha256 || "").trim().toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(sourceDigest)) throw new Error("source_sha256_invalid");
      if (!Array.isArray(screenshot.accounts) || screenshot.accounts.length < 1 || screenshot.accounts.length > 20) throw new Error("screenshot_accounts_invalid");
      for (const observation of screenshot.accounts) {
        if (!observation || typeof observation !== "object" || Array.isArray(observation)) throw new Error("screenshot_account_invalid");
        for (const key of Object.keys(observation)) if (!new Set(["username", "display_name", "posts", "followers", "following", "confidence"]).has(key)) throw new Error("screenshot_account_field_invalid");
        const username = cleanText(observation.username, "username", 30).replace(/^@/, "").toLowerCase();
        if (!/^[a-z0-9._]{1,30}$/.test(username)) throw new Error("username_invalid");
        const displayName = observation.display_name === undefined ? null : cleanText(observation.display_name, "display_name", 160);
        const confidence = observation.confidence === undefined ? null : Number(observation.confidence);
        if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new Error("confidence_invalid");
        const profile = Object.fromEntries(Object.entries({
          posts: screenshotCount(observation.posts, "posts"),
          followers: screenshotCount(observation.followers, "followers"),
          following: screenshotCount(observation.following, "following"),
          confidence,
        }).filter(([, value]) => value !== undefined && value !== null));
        const existing = this.store.get("SELECT * FROM social_account_candidates WHERE brand_id = ? AND username = ?", brand.id, username);
        const sourceDigests = [...new Set([...(existing?.source_digests || []), sourceDigest])];
        const mergedProfile = { ...(existing?.profile || {}), ...profile };
        const candidateId = existing?.id || id("igc");
        const verificationStatus = existing?.verification_status === "oauth_matched" ? "oauth_matched" : "needs_owner_confirmation";
        const at = nowIso(this.clock);
        this.store.run(
          `INSERT INTO social_account_candidates(id, brand_id, username, display_name, profile_json, source_digests_json, verification_status, social_account_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(brand_id, username) DO UPDATE SET display_name = COALESCE(excluded.display_name, social_account_candidates.display_name), profile_json = excluded.profile_json, source_digests_json = excluded.source_digests_json, verification_status = excluded.verification_status, updated_at = excluded.updated_at`,
          candidateId, brand.id, username, displayName, json(mergedProfile), json(sourceDigests), verificationStatus, existing?.social_account_id || null, existing?.created_at || at, at,
        );
        if (existing) updated += 1;
        else created += 1;
        accepted.push(publicCandidate(this.store.get("SELECT * FROM social_account_candidates WHERE brand_id = ? AND username = ?", brand.id, username)));
      }
    }
    return { brand_id: brand.id, created, updated, candidates: accepted, ready_for_automation: accepted.some((candidate) => candidate.verification_status === "oauth_matched"), next_step: "owner_confirmation_and_meta_oauth", screenshots_stored: false };
  }

  listSocialAccountCandidates(input = {}) {
    const status = input.status ? String(input.status) : null;
    if (status && !new Set(["needs_owner_confirmation", "oauth_matched", "dismissed"]).has(status)) throw new Error("candidate_status_invalid");
    const clauses = [];
    const params = [];
    if (input.brand_id) {
      const brand = this.brandGet(input.brand_id);
      clauses.push("brand_id = ?");
      params.push(brand.id);
    }
    if (status) {
      clauses.push("verification_status = ?");
      params.push(status);
    }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    return this.store.all(`SELECT * FROM social_account_candidates${where} ORDER BY updated_at DESC, username`, ...params).map(publicCandidate);
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
    const account = entity(this.store.get("SELECT * FROM social_accounts WHERE brand_id = ? AND provider = ? AND external_account_id = ?", brand.id, provider, externalAccountId));
    if (connectionStatus === "connected") this.store.run("UPDATE social_account_candidates SET verification_status = 'oauth_matched', social_account_id = ?, updated_at = ? WHERE brand_id = ? AND username = ?", account.id, at, brand.id, username.toLowerCase());
    return account;
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
      action: "creative.generate", risk: "external_write", payload: { asset_id: assetId, brand_id: brand.id, product_id: product.id, ...brief, duration_seconds: input.duration_seconds || null },
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
    if (action === "create_ad" && !input.currency) throw new Error("ad_currency_required");
    const adCurrency = action === "create_ad" ? currency(input.currency) : null;
    if (action === "create_ad" && adCurrency !== this.productGet(campaign.product_id).currency) throw new Error("ad_currency_mismatch");
    const activeGoal = action === "create_ad"
      ? entity(this.store.get("SELECT * FROM business_goals WHERE brand_id = ? AND product_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1", campaign.brand_id, campaign.product_id))
      : null;
    if (activeGoal && budgetMinor > activeGoal.objective.ad_budget_cap_minor) throw new Error("ad_budget_exceeds_goal_cap");
    if (this.providers.social.name !== "mock" && (!account || account.connection_status !== "connected")) throw new Error("social_account_not_connected");
    if (this.providers.social.name === "meta-graph" && action === "publish" && !input.media_url) throw new Error("instagram_media_url_required");
    const payload = { campaign_id: campaign.id, brand_id: campaign.brand_id, product_id: campaign.product_id, goal_id: activeGoal?.id || null, ad_budget_cap_minor: activeGoal?.objective?.ad_budget_cap_minor ?? null, caption: campaign.caption, asset_ids: campaign.asset_ids, scheduled_for: scheduledFor, budget_minor: budgetMinor, currency: adCurrency, social_account_id: account?.id || null, account_external_id: account?.external_account_id || null, media_url: input.media_url || null };
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

  prepareConcierge(input) {
    const message = requiredRow(this.store.get("SELECT * FROM dm_messages WHERE id = ?", safeId(input.message_id, "message_id")), "dm_message_not_found");
    if (!message.customer_id) throw new Error("dm_customer_not_linked");
    const customer = requiredRow(this.store.get("SELECT * FROM customers WHERE id = ? AND brand_id = ?", message.customer_id, message.brand_id), "customer_not_found");
    const messages = this.store.all("SELECT * FROM dm_messages WHERE brand_id = ? AND customer_id = ? ORDER BY created_at ASC LIMIT 100", message.brand_id, customer.id).map(entity);
    const orders = this.store.all("SELECT * FROM orders WHERE brand_id = ? AND customer_id = ? ORDER BY created_at ASC", message.brand_id, customer.id).map(entity);
    let product = null;
    if (input.product_id) {
      product = this.productGet(input.product_id);
      if (product.brand_id !== message.brand_id) throw new Error("product_brand_mismatch");
    } else if (orders.at(-1)?.product_id) product = this.productGet(orders.at(-1).product_id);
    else product = entity(this.store.get("SELECT * FROM products WHERE brand_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1", message.brand_id));
    const latestShipping = orders.at(-1)?.shipping || {};
    const customerContext = { ...customer, profile: { ...customer.profile, country: customer.profile?.country || latestShipping.country || null } };
    const recommendation = buildConciergeRecommendation({ customer: customerContext, messages, orders, product });
    const journeyId = entity(this.store.get("SELECT id FROM customer_journeys WHERE brand_id = ? AND customer_id = ?", message.brand_id, customer.id))?.id || id("jrn");
    const at = nowIso(this.clock);
    this.store.run(
      `INSERT INTO customer_journeys(id, brand_id, customer_id, stage, score, segment, memory_json, next_action_json, last_message_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(brand_id, customer_id) DO UPDATE SET stage = excluded.stage, score = excluded.score, segment = excluded.segment, memory_json = excluded.memory_json, next_action_json = excluded.next_action_json, last_message_id = excluded.last_message_id, updated_at = excluded.updated_at`,
      journeyId, message.brand_id, customer.id, recommendation.stage, recommendation.score, recommendation.segment, json(recommendation.memory), json(recommendation.next_action), message.id, at, at,
    );
    return {
      journey: entity(this.store.get("SELECT * FROM customer_journeys WHERE brand_id = ? AND customer_id = ?", message.brand_id, customer.id)),
      customer,
      conversation: { inbound_count: messages.filter((item) => item.direction === "inbound").length, outbound_count: messages.filter((item) => item.direction === "outbound").length },
      reply_draft: recommendation.next_action.reply_draft,
      send_tool: { name: "instagram.dm.reply.prepare", input: { message_id: message.id, body: recommendation.next_action.reply_draft } },
      message_sent: false,
    };
  }

  salesPipeline(input) {
    const brand = this.brandGet(input.brand_id);
    const rows = this.store.all("SELECT j.*, c.profile_json FROM customer_journeys j JOIN customers c ON c.id = j.customer_id WHERE j.brand_id = ? ORDER BY j.score DESC, j.updated_at DESC LIMIT ?", brand.id, Math.min(Number(input.limit || 50), 100)).map(entity);
    const summaryRows = this.store.all("SELECT stage, COUNT(*) AS count FROM customer_journeys WHERE brand_id = ? GROUP BY stage", brand.id);
    return {
      brand_id: brand.id,
      summary: Object.fromEntries(summaryRows.map((row) => [row.stage, Number(row.count)])),
      opportunities: rows,
      next_best: rows.slice(0, 10).map((row) => ({ customer_id: row.customer_id, stage: row.stage, score: row.score, action: row.next_action?.action, human_escalation: row.next_action?.human_escalation || false })),
    };
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
    const missingFields = this.orderMissingFields(customer.profile, order.shipping);
    let action;
    let payload = { order_id: order.id, brand_id: order.brand_id, customer_id: customer.id, product_name: product.name, quantity: order.quantity, unit_price_minor: order.unit_price_minor, currency: order.currency };
    if (kind === "link") {
      if (missingFields.length) throw new Error(`order_information_incomplete:${missingFields.join(",")}`);
      action = "payment.create_link";
    }
    else if (kind === "invoice") {
      if (missingFields.length) throw new Error(`order_information_incomplete:${missingFields.join(",")}`);
      const daysUntilDue = Number(input.days_until_due || 7);
      if (!Number.isSafeInteger(daysUntilDue) || daysUntilDue < 1 || daysUntilDue > 90) throw new Error("invoice_due_days_invalid");
      action = "payment.send_invoice";
      payload = { ...payload, customer_email: cleanText(customer.profile?.email, "customer_email", 320), customer_name: cleanText(customer.profile?.name, "customer_name", 200), days_until_due: daysUntilDue };
    } else if (kind === "refund") {
      if (!["paid", "in_production", "quality_check", "ready_to_ship", "shipped", "delivered"].includes(order.status)) throw new Error("paid_order_required_for_refund");
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

  planProduction(input) {
    const order = this.orderGet(input.order_id);
    if (order.status !== "paid") {
      const existing = entity(this.store.get("SELECT * FROM production_jobs WHERE order_id = ?", order.id));
      if (existing) return { idempotent_replay: true, job: existing };
      throw new Error("verified_payment_required_for_production");
    }
    const existing = entity(this.store.get("SELECT * FROM production_jobs WHERE order_id = ?", order.id));
    if (existing) return { idempotent_replay: true, job: existing };
    const product = this.productGet(order.product_id);
    const dailyCapacity = Number(input.daily_capacity || 1);
    if (!Number.isSafeInteger(dailyCapacity) || dailyCapacity < 1 || dailyCapacity > 10_000) throw new Error("daily_capacity_invalid");
    const leadDays = Number(input.lead_days || 28);
    if (!Number.isSafeInteger(leadDays) || leadDays < 1 || leadDays > 365) throw new Error("lead_days_invalid");
    const dueAt = input.due_at ? new Date(input.due_at) : new Date(new this.clock().getTime() + leadDays * 86_400_000);
    if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= new this.clock().getTime()) throw new Error("production_due_at_invalid");
    const bom = input.bom ? jsonObject(input.bom, "production_bom") : (product.design?.bom || { primary_material: product.design?.material || product.design?.fabric || null });
    const rawUnitCost = input.estimated_unit_cost_minor ?? product.design?.unit_cost_minor ?? product.design?.cost_minor;
    const unitCostMinor = rawUnitCost == null ? null : Number(rawUnitCost);
    if (unitCostMinor !== null && (!Number.isSafeInteger(unitCostMinor) || unitCostMinor < 0)) throw new Error("unit_cost_invalid");
    const requiredDays = Math.ceil(order.quantity / dailyCapacity);
    const availableDays = Math.max(0, Math.floor((dueAt.getTime() - new this.clock().getTime()) / 86_400_000));
    const blockers = [];
    if (unitCostMinor === null) blockers.push("unit_cost_missing");
    if (!Object.values(bom).some(Boolean)) blockers.push("bill_of_materials_missing");
    if (requiredDays > availableDays) blockers.push("capacity_below_due_date_requirement");
    const costs = {
      unit_cost_minor: unitCostMinor,
      estimated_total_cost_minor: unitCostMinor === null ? null : unitCostMinor * order.quantity,
      order_revenue_minor: order.unit_price_minor * order.quantity,
      estimated_gross_margin_minor: unitCostMinor === null ? null : (order.unit_price_minor - unitCostMinor) * order.quantity,
      currency: order.currency,
    };
    const jobId = id("prdjob");
    const at = nowIso(this.clock);
    this.store.run("INSERT INTO production_jobs(id, order_id, status, planned_units, completed_units, daily_capacity, due_at, bom_json, cost_json, blockers_json, created_at, updated_at) VALUES (?, ?, 'planned', ?, 0, ?, ?, ?, ?, ?, ?, ?)", jobId, order.id, order.quantity, dailyCapacity, dueAt.toISOString(), json(bom), json(costs), json(blockers), at, at);
    return { idempotent_replay: false, job: entity(this.store.get("SELECT * FROM production_jobs WHERE id = ?", jobId)), can_start: blockers.length === 0, start_tool: { name: "fashion.order.status.update", input: { order_id: order.id, status: "in_production", details: { production_job_id: jobId } } } };
  }

  productionDashboard(input) {
    const brand = this.brandGet(input.brand_id);
    const jobs = this.store.all(
      `SELECT p.*, o.brand_id, o.product_id, o.quantity AS order_quantity, o.currency, o.unit_price_minor, pr.name AS product_name
       FROM production_jobs p JOIN orders o ON o.id = p.order_id JOIN products pr ON pr.id = o.product_id
       WHERE o.brand_id = ? ORDER BY p.due_at, p.updated_at DESC LIMIT ?`,
      brand.id, Math.min(Number(input.limit || 100), 200),
    ).map(entity);
    const today = new this.clock().getTime();
    const active = jobs.filter((job) => !["delivered", "cancelled"].includes(job.status));
    return {
      brand_id: brand.id,
      summary: {
        total: jobs.length,
        active: active.length,
        blocked: active.filter((job) => job.status === "blocked" || (job.blockers || []).length).length,
        overdue: active.filter((job) => Date.parse(job.due_at) < today).length,
        planned_units: active.reduce((sum, job) => sum + Number(job.planned_units || 0), 0),
        completed_units: active.reduce((sum, job) => sum + Number(job.completed_units || 0), 0),
      },
      jobs,
    };
  }

  updateOrderStatus(input) {
    const order = this.orderGet(input.order_id);
    const status = String(input.status || "");
    if (!ORDER_STATUSES.has(status)) throw new Error("order_status_invalid");
    if (FINANCIAL_ORDER_STATUSES.has(status)) throw new Error("financial_status_requires_verified_provider_event");
    if (status === order.status) return order;
    if (!ORDER_TRANSITIONS[order.status]?.has(status)) throw new Error("order_status_transition_invalid");
    if (status === "in_production") {
      const job = entity(this.store.get("SELECT * FROM production_jobs WHERE order_id = ?", order.id));
      if (!job) throw new Error("production_plan_required");
      if ((job.blockers || []).length) throw new Error("production_blockers_unresolved");
    }
    const at = nowIso(this.clock);
    this.store.transaction(() => {
      this.store.run("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", status, at, order.id);
      this.store.run("INSERT INTO fulfillment_events(id, order_id, status, details_json, created_at) VALUES (?, ?, ?, ?, ?)", id("ful"), order.id, status, json(input.details || {}), at);
      if (["in_production", "quality_check", "ready_to_ship", "shipped", "delivered", "cancelled"].includes(status)) {
        this.store.run("UPDATE production_jobs SET status = ?, completed_units = CASE WHEN ? = 'delivered' THEN planned_units ELSE completed_units END, updated_at = ? WHERE order_id = ?", status, status, at, order.id);
      }
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
        receipt_id: id("rcp"), run_id: runId, server_name: "io.rockstar-ibot/instagram-operations", version: "0.2.0",
        package_digest: this.config.packageDigest || "52f38bca0394daa0da1df77132f2fdce3540b8b119611f793dd5a61e9bd88ff6", capability_id: CAPABILITY_BY_ACTION[approval.action] || "unknown",
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
      const order = this.orderGet(payload.order_id);
      const nextStatus = action === "payment.refund"
        ? (payload.amount_minor === order.unit_price_minor * order.quantity ? "refunded" : order.status)
        : "payment_pending";
      this.store.run("UPDATE orders SET status = ?, external_payment_ref = COALESCE(?, external_payment_ref), updated_at = ? WHERE id = ?", nextStatus, receipt.external_ref || null, nowIso(this.clock), payload.order_id);
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
          const expectedAmount = order.unit_price_minor * order.quantity;
          const reportedAmount = payload.amount_total ?? payload.amount_paid ?? payload.amount_received ?? payload.amount;
          if (paid && reportedAmount != null && Number(reportedAmount) !== expectedAmount) throw new Error("payment_amount_mismatch");
          if (paid && payload.currency && currency(payload.currency) !== order.currency) throw new Error("payment_currency_mismatch");
          const refundAmount = Number(payload.amount || payload.amount_refunded || expectedAmount);
          if (refunded && (!Number.isSafeInteger(refundAmount) || refundAmount <= 0 || refundAmount > expectedAmount)) throw new Error("refund_amount_invalid");
          if (refunded && payload.currency && currency(payload.currency) !== order.currency) throw new Error("payment_currency_mismatch");
          const status = refunded && refundAmount < expectedAmount ? order.status : refunded ? "refunded" : "paid";
          const paymentRef = payload.payment_intent || payload.id || order.external_payment_ref;
          this.store.run("UPDATE orders SET status = ?, external_payment_ref = ?, updated_at = ? WHERE id = ?", status, paymentRef || null, at, order.id);
          this.store.run("INSERT INTO metrics(id, brand_id, metric_type, value, dimensions_json, observed_at) VALUES (?, ?, ?, ?, ?, ?)", id("met"), order.brand_id, refunded ? "refund_minor" : "sale_minor", refunded ? refundAmount : expectedAmount, json({ order_id: order.id, currency: order.currency, provider }), at);
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
      sales: {
        paid_orders: orderRows.filter((row) => ["paid", "in_production", "quality_check", "ready_to_ship", "shipped", "delivered"].includes(row.status)).reduce((sum, row) => sum + Number(row.count || 0), 0),
        paid_gross_minor: orderRows.filter((row) => ["paid", "in_production", "quality_check", "ready_to_ship", "shipped", "delivered"].includes(row.status)).reduce((sum, row) => sum + Number(row.gross_minor || 0), 0),
      },
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
      pending_approvals: this.store.all("SELECT * FROM approval_requests WHERE status = 'pending' AND json_extract(payload_json, '$.brand_id') = ? ORDER BY created_at DESC", brand.id).map(entity),
      analytics: this.analytics({ brand_id: brand.id }),
      feedback: this.latestFeedback(brand.id),
    };
  }

  executiveDashboard(input) {
    const brand = this.brandGet(input.brand_id);
    const activeGoal = entity(this.store.get("SELECT * FROM business_goals WHERE brand_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1", brand.id));
    const approvals = this.listApprovals({ status: "pending", limit: 100 }).filter((approval) => approval.payload?.brand_id === brand.id);
    const sales = this.salesPipeline({ brand_id: brand.id, limit: 50 });
    const production = this.productionDashboard({ brand_id: brand.id, limit: 100 });
    const analytics = this.analytics({ brand_id: brand.id });
    const priorities = [];
    if (approvals.length) priorities.push({ priority: 100, kind: "approval", label: `${approvals.length}件の承認待ちを確認`, tool_name: "approval.list" });
    if ((sales.summary.ready_to_buy || 0) + (sales.summary.considering || 0) > 0) priorities.push({ priority: 90, kind: "sales", label: "購入検討顧客をフォロー", tool_name: "fashion.sales.pipeline.get" });
    if (production.summary.blocked) priorities.push({ priority: 95, kind: "production", label: `${production.summary.blocked}件の制作blockerを解消`, tool_name: "fashion.production.dashboard" });
    if (production.summary.overdue) priorities.push({ priority: 98, kind: "production", label: `${production.summary.overdue}件の納期超過を確認`, tool_name: "fashion.production.dashboard" });
    if (activeGoal) priorities.push({ priority: 80, kind: "autopilot", label: "目標進捗を再計算", tool_name: "fashion.autopilot.tick", input: { goal_id: activeGoal.id } });
    priorities.sort((a, b) => b.priority - a.priority);
    return {
      brand,
      active_goal: activeGoal,
      approvals: { pending: approvals.length, items: approvals.slice(0, 20) },
      sales,
      production,
      analytics,
      priorities: priorities.slice(0, 10),
      generated_at: nowIso(this.clock),
    };
  }
}
