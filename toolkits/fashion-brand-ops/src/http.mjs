#!/usr/bin/env node
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createRuntime } from './runtime.mjs';
import { McpProtocol } from './mcp.mjs';
import {
  extractInstagramMessages,
  normalizeStripeEvent,
  resolveInstagramBrand,
  verifyMetaSignature,
  verifyStripeSignature,
} from './webhooks.mjs';

const runtime = createRuntime();
// The HTTP boundary must never serialize provider/SQLite exception messages.
const protocol = new McpProtocol(async (...args) => {
  try {
    return await runtime.callTool(...args);
  } catch {
    throw new Error('tool_request_failed');
  }
});
const browserSessions = new Map();
const BROWSER_SESSION_MS = 12 * 60 * 60 * 1000;
const loopbackBind = ['127.0.0.1', '::1', 'localhost'].includes(
  runtime.config.httpHost,
);
const browserSessionMode = loopbackBind && !runtime.config.mcpBearerToken;

if (
  !loopbackBind &&
  (!runtime.config.mcpBearerToken || !runtime.config.tenantId)
) {
  throw new Error('fashion_mcp_auth_and_tenant_required_for_non_loopback_bind');
}

function fixedTokenAuthorized(req) {
  if (!runtime.config.mcpBearerToken) return false;
  const supplied = String(req.headers.authorization || '').replace(
    /^Bearer\s+/i,
    '',
  );
  const a = Buffer.from(supplied);
  const b = Buffer.from(runtime.config.mcpBearerToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

function browserRequestAllowed(req) {
  // Origin and Host alone are forgeable by non-browser HTTP clients.
  if (
    !loopbackBind ||
    !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
      req.socket.remoteAddress,
    )
  )
    return false;
  const origin = String(req.headers.origin || '');
  const host = String(req.headers.host || '').toLowerCase();
  const allowedHosts = new Set([
    `127.0.0.1:${runtime.config.httpPort}`,
    `localhost:${runtime.config.httpPort}`,
    `[::1]:${runtime.config.httpPort}`,
  ]);
  return (
    runtime.config.browserOrigins.includes(origin) && allowedHosts.has(host)
  );
}

function suppliedBearer(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
}

function browserSession(req) {
  if (!browserRequestAllowed(req)) return null;
  const token = suppliedBearer(req);
  const session = browserSessions.get(token);
  if (
    !session ||
    session.origin !== req.headers.origin ||
    session.expiresAt <= Date.now()
  ) {
    if (session) browserSessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function authorized(req) {
  // Configured credentials determine the mode; an Origin header cannot select
  // a weaker authentication path or replace the fixed token with a session.
  if (runtime.config.mcpBearerToken) return fixedTokenAuthorized(req);
  return browserSessionMode && (!req.headers.origin || Boolean(browserSession(req)));
}

function tenantAuthorized(req) {
  return (
    !runtime.config.tenantId ||
    req.headers['x-rockstar-tenant-id'] === runtime.config.tenantId
  );
}

function send(req, res, status, body, contentType = 'application/json') {
  const headers = {
    'content-type': `${contentType}; charset=utf-8`,
    'cache-control': 'no-store',
  };
  if (browserRequestAllowed(req)) {
    headers['access-control-allow-origin'] = req.headers.origin;
    headers['access-control-allow-headers'] =
      'Content-Type, Authorization, MCP-Protocol-Version, X-Rockstar-Tenant-ID';
    headers['access-control-allow-methods'] = 'POST, OPTIONS';
    headers['access-control-allow-private-network'] = 'true';
    headers.vary = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(
    contentType === 'application/json' ? JSON.stringify(body) : String(body),
  );
}

async function raw(req, maxBytes = 1_048_576) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (
    req.method === 'OPTIONS' &&
    ['/connect', '/disconnect', '/mcp'].includes(url.pathname)
  ) {
    return send(req, res, browserRequestAllowed(req) ? 204 : 403, null);
  }
  if (req.method === 'POST' && url.pathname === '/connect') {
    if (!browserSessionMode)
      return send(req, res, 403, { error: 'browser_session_disabled' });
    if (!browserRequestAllowed(req))
      return send(req, res, 403, { error: 'browser_origin_denied' });
    const payload = JSON.parse(await raw(req));
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      Object.keys(payload).length
    )
      return send(req, res, 400, { error: 'invalid_connect_request' });
    for (const [token, session] of browserSessions) {
      if (session.expiresAt <= Date.now()) browserSessions.delete(token);
    }
    while (browserSessions.size >= 32) {
      browserSessions.delete(browserSessions.keys().next().value);
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + BROWSER_SESSION_MS;
    browserSessions.set(token, { origin: req.headers.origin, expiresAt });
    return send(req, res, 200, {
      token,
      server: 'fashion-brand-ops-mcp',
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }
  if (req.method === 'POST' && url.pathname === '/disconnect') {
    const session = browserSession(req);
    if (!session) return send(req, res, 401, { error: 'unauthorized' });
    browserSessions.delete(session.token);
    return send(req, res, 200, { disconnected: true });
  }
  if (req.method === 'GET' && url.pathname === '/health')
    return send(req, res, 200, {
      ok: true,
      service: 'fashion-brand-ops-mcp',
      providers: {
        creative: runtime.providers.creative.name,
        social: runtime.providers.social.name,
        payment: runtime.providers.payment.name,
        notification: runtime.providers.notification.name,
      },
    });
  if (req.method === 'POST' && url.pathname === '/mcp') {
    if (!authorized(req) || !tenantAuthorized(req))
      return send(req, res, 401, { error: 'unauthorized' });
    const message = JSON.parse(await raw(req));
    const response = await protocol.handle(message);
    return response ? send(req, res, 200, response) : send(req, res, 202, {});
  }
  if (req.method === 'GET' && url.pathname === '/webhooks/instagram') {
    const valid =
      url.searchParams.get('hub.mode') === 'subscribe' &&
      runtime.config.instagramVerifyToken &&
      url.searchParams.get('hub.verify_token') ===
        runtime.config.instagramVerifyToken;
    return valid
      ? send(
          req,
          res,
          200,
          url.searchParams.get('hub.challenge') || '',
          'text/plain',
        )
      : send(req, res, 403, { error: 'instagram_verification_failed' });
  }
  if (req.method === 'POST' && url.pathname === '/webhooks/instagram') {
    const body = await raw(req);
    verifyMetaSignature(
      body,
      req.headers['x-hub-signature-256'],
      runtime.config.metaAppSecret,
    );
    const payload = JSON.parse(body);
    const results = [];
    for (const message of extractInstagramMessages(payload)) {
      const configuredBrand = url.searchParams.get('brand_id');
      const account = runtime.store.get(
        "SELECT * FROM social_accounts WHERE external_account_id = ? AND connection_status = 'connected'",
        message.account_external_id,
      );
      const brandId = resolveInstagramBrand(
        configuredBrand,
        account?.brand_id,
      );
      results.push(
        runtime.service.ingestDm({
          brand_id: brandId,
          provider: 'instagram',
          ...message,
        }),
      );
    }
    return send(req, res, 200, {
      received: true,
      processed: results.length,
      results,
    });
  }
  if (req.method === 'POST' && url.pathname === '/webhooks/stripe') {
    const body = await raw(req);
    verifyStripeSignature(
      body,
      req.headers['stripe-signature'],
      runtime.config.stripeWebhookSecret,
    );
    const result = runtime.service.processPaymentEvent(
      normalizeStripeEvent(JSON.parse(body)),
    );
    return send(req, res, 200, { received: true, result });
  }
  return send(req, res, 404, { error: 'not_found' });
}

function requestFailure(error) {
  if (error instanceof SyntaxError)
    return { status: 400, code: 'invalid_json' };
  switch (error?.message) {
    case 'request_too_large':
      return { status: 400, code: 'request_too_large' };
    case 'stripe_signature_invalid':
    case 'stripe_signature_expired':
    case 'meta_signature_invalid':
      return { status: 401, code: 'webhook_verification_failed' };
    case 'stripe_webhook_secret_not_configured':
    case 'meta_app_secret_not_configured':
      return { status: 400, code: 'provider_configuration_invalid' };
    default:
      return { status: 400, code: 'request_failed' };
  }
}

const server = http.createServer((req, res) => {
  handler(req, res).catch((error) => {
    const failure = requestFailure(error);
    send(req, res, failure.status, { error: failure.code });
  });
});
server.listen(runtime.config.httpPort, runtime.config.httpHost, () =>
  process.stderr.write(
    `fashion-brand-ops-mcp listening on ${runtime.config.httpHost}:${runtime.config.httpPort}\n`,
  ),
);

function close() {
  server.close(() => {
    runtime.store.close();
    process.exit(0);
  });
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
