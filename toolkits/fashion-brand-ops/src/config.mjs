import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function absoluteFromRoot(value, fallback) {
  const selected = value || fallback;
  return path.isAbsolute(selected)
    ? selected
    : path.resolve(APP_ROOT, selected);
}

export function loadConfig(env = process.env) {
  return Object.freeze({
    dbPath: absoluteFromRoot(
      env.FASHION_BRAND_DB_PATH,
      './data/fashion-brand-ops.db',
    ),
    httpHost: env.FASHION_HTTP_HOST || '127.0.0.1',
    httpPort: Number(env.FASHION_HTTP_PORT || 8787),
    browserOrigins: (
      env.FASHION_BROWSER_ORIGINS ||
      'https://rock-star.kirin-999.chatgpt.site,https://loop-automation-hub.kirin-999.chatgpt.site,https://instagram-ops-studio.kirin-999.chatgpt.site,http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:3001,http://localhost:3001,http://127.0.0.1:3015,http://localhost:3015'
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    mcpBearerToken: env.FASHION_MCP_BEARER_TOKEN || '',
    tenantId: env.ROCKSTAR_TENANT_ID || '',
    approvalSecret: env.ROCKSTAR_APPROVAL_SECRET || '',
    creativeProvider: env.FASHION_CREATIVE_PROVIDER || 'mock',
    socialProvider: env.FASHION_SOCIAL_PROVIDER || 'mock',
    paymentProvider: env.FASHION_PAYMENT_PROVIDER || 'mock',
    notificationProvider: env.FASHION_NOTIFICATION_PROVIDER || 'mock',
    allowedHosts: (
      env.FASHION_ALLOWED_HOSTS || 'api.stripe.com,graph.facebook.com'
    )
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    higgsfieldApiUrl: env.HIGGSFIELD_API_URL || '',
    higgsfieldApiKey: env.HIGGSFIELD_API_KEY || '',
    socialProviderUrl: env.SOCIAL_PROVIDER_URL || '',
    socialProviderToken: env.SOCIAL_PROVIDER_TOKEN || '',
    instagramVerifyToken: env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || '',
    metaGraphApiBaseUrl: env.META_GRAPH_API_BASE_URL || '',
    metaAccessToken: env.META_ACCESS_TOKEN || '',
    metaAppSecret: env.META_APP_SECRET || '',
    metaInsightsMetrics: (
      env.META_INSIGHTS_METRICS || 'reach,impressions,profile_views'
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    stripeSecretKey: env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    stripeSuccessUrl: env.STRIPE_SUCCESS_URL || '',
    stripeCancelUrl: env.STRIPE_CANCEL_URL || '',
    notificationWebhookUrl: env.NOTIFICATION_WEBHOOK_URL || '',
    notificationWebhookToken: env.NOTIFICATION_WEBHOOK_TOKEN || '',
    packageDigest:
      env.ROCKSTAR_PACKAGE_DIGEST ||
      '68aaba7b9391fae67bbe99b879d4c5cd0517ecbe7e105dcb8e96d789524cc2b5',
  });
}
