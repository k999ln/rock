import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function absoluteFromRoot(value, fallback) {
  const selected = value || fallback;
  return path.isAbsolute(selected) ? selected : path.resolve(APP_ROOT, selected);
}

export function loadConfig(env = process.env) {
  return Object.freeze({
    dbPath: absoluteFromRoot(env.FASHION_BRAND_DB_PATH, "./data/fashion-brand-ops.db"),
    httpHost: env.FASHION_HTTP_HOST || "127.0.0.1",
    httpPort: Number(env.FASHION_HTTP_PORT || 8787),
    mcpBearerToken: env.FASHION_MCP_BEARER_TOKEN || "",
    tenantId: env.ROCKSTAR_TENANT_ID || "",
    approvalSecret: env.ROCKSTAR_APPROVAL_SECRET || "",
    creativeProvider: env.FASHION_CREATIVE_PROVIDER || "mock",
    socialProvider: env.FASHION_SOCIAL_PROVIDER || "mock",
    paymentProvider: env.FASHION_PAYMENT_PROVIDER || "mock",
    notificationProvider: env.FASHION_NOTIFICATION_PROVIDER || "mock",
    allowedHosts: (env.FASHION_ALLOWED_HOSTS || "api.stripe.com,graph.facebook.com").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean),
    higgsfieldApiUrl: env.HIGGSFIELD_API_URL || "",
    higgsfieldApiKey: env.HIGGSFIELD_API_KEY || "",
    socialProviderUrl: env.SOCIAL_PROVIDER_URL || "",
    socialProviderToken: env.SOCIAL_PROVIDER_TOKEN || "",
    instagramVerifyToken: env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || "",
    metaGraphApiBaseUrl: env.META_GRAPH_API_BASE_URL || "",
    metaAccessToken: env.META_ACCESS_TOKEN || "",
    metaAppSecret: env.META_APP_SECRET || "",
    metaInsightsMetrics: (env.META_INSIGHTS_METRICS || "reach,impressions,profile_views").split(",").map((value) => value.trim()).filter(Boolean),
    stripeSecretKey: env.STRIPE_SECRET_KEY || "",
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || "",
    stripeSuccessUrl: env.STRIPE_SUCCESS_URL || "",
    stripeCancelUrl: env.STRIPE_CANCEL_URL || "",
    notificationWebhookUrl: env.NOTIFICATION_WEBHOOK_URL || "",
    notificationWebhookToken: env.NOTIFICATION_WEBHOOK_TOKEN || "",
    packageDigest: env.ROCKSTAR_PACKAGE_DIGEST || "ad89ea3df0027cdf671fbb91602fb8ea2b14a71f29d0b19db5ac8da822733954",
  });
}
