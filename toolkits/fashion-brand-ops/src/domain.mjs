import { cleanText } from "./util.mjs";

const signals = {
  luxury: ["luxury", "premium", "高級", "職人", "atelier", "limited", "限定", "静か", "minimal"],
  art: ["art", "gallery", "avant", "concept", "アート", "前衛", "彫刻", "実験的"],
  street: ["street", "urban", "oversize", "ストリート", "ユース", "スニーカー"],
  sustainable: ["sustainable", "organic", "recycled", "ethical", "環境", "再生", "天然", "長く使う"],
};

function haystack(...values) {
  return values.flatMap((value) => typeof value === "string" ? [value] : Object.values(value || {}).map(String)).join(" ").toLowerCase();
}

function hits(text, words) { return words.filter((word) => text.includes(word.toLowerCase())); }

export function analyzeMarket(brand, product) {
  const policy = brand.policy || {};
  const design = product.design || {};
  const text = haystack(brand.name, policy, product.name, design);
  const scored = Object.entries(signals).map(([segment, words]) => ({ segment, evidence: hits(text, words) })).map((item) => ({ ...item, score: item.evidence.length }));
  scored.sort((a, b) => b.score - a.score || a.segment.localeCompare(b.segment));
  const segment = scored[0].score ? scored[0].segment : "design-conscious";
  const currency = product.currency || "JPY";
  const premium = product.price_minor >= (currency === "JPY" ? 50_000 : 350_00);
  const declaredRegions = Array.isArray(policy.regions) ? policy.regions : [];
  const regions = declaredRegions.length ? declaredRegions.slice(0, 5) : currency === "JPY" ? ["JP", "APAC-urban"] : ["global-urban"];
  const age = policy.age_range || (segment === "street" ? "18-30" : "24-40");
  return {
    primary_segment: segment,
    audience: { age_range: age, regions, price_sensitivity: premium ? "low-to-medium" : "medium", buying_mode: premium ? "consultative-dm" : "social-commerce" },
    positioning: premium ? "scarcity, material proof, and made-to-order craft" : "distinct design, fit confidence, and accessible scarcity",
    channels: ["instagram_feed", "instagram_reels", "instagram_stories", "instagram_dm"],
    creative_directions: scored.filter((item) => item.score > 0).slice(0, 3).map((item) => item.segment),
    evidence: scored.filter((item) => item.score > 0).flatMap((item) => item.evidence).slice(0, 12),
    assumptions: [declaredRegions.length ? "regions supplied by brand policy" : "region inferred from currency", "heuristic assessment; validate against campaign and sales outcomes"],
  };
}

const dmRules = [
  ["purchase", /(?:buy|order|purchase|欲しい|購入|注文|買いたい|決済|支払)/i, 0.92],
  ["size", /(?:size|fit|measure|採寸|サイズ|寸法|着丈|ウエスト)/i, 0.72],
  ["shipping", /(?:ship|delivery|海外発送|配送|送料|届く|納期)/i, 0.66],
  ["price", /(?:price|cost|how much|価格|値段|いくら)/i, 0.78],
  ["material", /(?:material|fabric|素材|生地|洗濯)/i, 0.52],
  ["collaboration", /(?:collab|wholesale|stylist|コラボ|卸|取材)/i, 0.18],
];

export function classifyDm(body, faq = {}) {
  const text = cleanText(body, "dm_body", 8000);
  const match = dmRules.find(([, pattern]) => pattern.test(text));
  const classification = match?.[0] || "other";
  const purchaseIntent = match?.[2] || 0.12;
  const faqAnswer = faq[classification] || null;
  const replyDraft = faqAnswer || (classification === "purchase"
    ? "ありがとうございます。ご希望の商品、サイズ、配送先の国・地域、カスタム希望を確認後、正式なお見積りをご案内します。"
    : "お問い合わせありがとうございます。確認してご案内します。差し支えなければ、ご希望の商品名もお知らせください。");
  return { classification, purchase_intent: purchaseIntent, faq_match: Boolean(faqAnswer), reply_draft: replyDraft };
}

export function buildCreativeBrief({ brand, product, market, format = "4:5", mediaType = "image", feedback = null }) {
  const policy = brand.policy || {};
  const design = product.design || {};
  const prohibited = Array.isArray(policy.prohibited) ? policy.prohibited.join(", ") : "unverified claims, visible third-party logos";
  const feedbackText = feedback ? `Observed feedback: ${JSON.stringify(feedback)}` : "No observed performance feedback yet.";
  const prompt = [
    `Create a ${mediaType} advertising concept for ${brand.name}, product ${product.name}.`,
    `Format ${format}; audience ${market.primary_segment}, ${market.audience.age_range}, ${market.audience.regions.join("/")}.`,
    `Brand direction: ${policy.concept || policy.worldview || "coherent editorial fashion"}.`,
    `Product design: ${JSON.stringify(design)}.`,
    `Positioning: ${market.positioning}. Product must remain visually accurate and dominant.`,
    `Avoid: ${prohibited}. ${feedbackText}`,
  ].join("\n");
  return { prompt, media_type: mediaType, aspect_ratio: format, metadata: { brand_id: brand.id, product_id: product.id, market_segment: market.primary_segment } };
}

export function composeCaption({ brand, product, market, callToAction = "DMでご相談ください", language = "ja" }) {
  const material = product.design?.material || product.design?.fabric || "選定素材";
  const delivery = product.design?.lead_time || product.design?.leadTime || "受注後にご案内";
  if (language === "en") return `${product.name}. Made to order in ${material}. ${market.positioning}. Lead time: ${delivery}. ${callToAction}`;
  return `${product.name}。${material}で仕立てる受注生産モデル。${market.positioning}。納期：${delivery}。${callToAction}`;
}

export function feedbackRecommendations(snapshot) {
  const { dm = {}, sales = {}, campaigns = [] } = snapshot;
  const recommendations = [];
  if ((dm.price || 0) > (dm.purchase || 0)) recommendations.push("価格だけでなく素材・工程・受注生産の理由を1枚目で可視化する");
  if ((dm.size || 0) > 0) recommendations.push("サイズ表または採寸導線をカルーセル2枚目に固定する");
  if ((sales.paid_orders || 0) === 0 && (dm.purchase || 0) > 0) recommendations.push("購入意向DMから見積り・決済案内までの離脱点を短くする");
  const best = campaigns.sort((a, b) => (b.value || 0) - (a.value || 0))[0];
  if (best) recommendations.push(`次回は成果上位campaign ${best.campaign_id} の構図・CTAを対照案として再利用する`);
  if (!recommendations.length) recommendations.push("現行のブランド一貫性を維持し、構図またはCTAだけを一変数ずつテストする");
  return recommendations;
}
