import {
  trustedRockstarEntitlementIssuerKeyResolver,
  verifyRockstarEntitlementClaim,
  sha256Hex,
} from './rockstar-entitlement-claim.ts';
import {
  acknowledgeRockstarEntitlementDelivery,
  getRockstarEntitlementDelivery,
  retainRockstarEntitlementDeliveryOnce,
  RockstarEntitlementIssuerStoreError,
  type RockstarEntitlementCodeKeyring,
} from './rockstar-entitlement-issuer-store.ts';

type D1Store = Pick<D1Database, 'prepare'>;
type RuntimeConfig = {
  ROCKSTAR_ENTITLEMENT_DELIVERY_SELLERS?: string;
  ROCKSTAR_SERVICE_CLAIM_ISSUERS?: string;
  ROCKSTAR_ENTITLEMENT_DELIVERY_CODE_KEYS?: string;
};
type Seller = { issuerId: string; tokenSha256: string };

const noStore = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: noStore });
export const ROCKSTAR_ENTITLEMENT_DELIVERY_REQUESTS_PER_MINUTE = 120;
const rateWindowMs = 60_000;
const idPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const idemPattern = /^[A-Za-z0-9._:-]{1,200}$/;

function parseSellerRegistry(value: string | undefined): Seller[] | null {
  if (typeof value !== 'string' || value.length > 16_384) return null;
  try {
    const entries: unknown = JSON.parse(value);
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 64) return null;
    const parsed: Seller[] = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      if (Object.keys(record).length !== 2 || typeof record.issuerId !== 'string' || !idPattern.test(record.issuerId) ||
          typeof record.tokenSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.tokenSha256)) return null;
      parsed.push({ issuerId: record.issuerId as string, tokenSha256: record.tokenSha256 });
    }
    if (new Set(parsed.map((seller) => seller.issuerId)).size !== parsed.length ||
        new Set(parsed.map((seller) => seller.tokenSha256)).size !== parsed.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseCodeKeyring(value: string | undefined): RockstarEntitlementCodeKeyring | null {
  if (typeof value !== 'string' || value.length > 16_384) return null;
  try {
    const candidate: unknown = JSON.parse(value);
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const record = candidate as Record<string, unknown>;
    if (Object.keys(record).length !== 2 || typeof record.currentKeyId !== 'string' ||
        !/^[A-Za-z0-9._-]{1,64}$/.test(record.currentKeyId) || !record.keys ||
        typeof record.keys !== 'object' || Array.isArray(record.keys)) return null;
    const keys = record.keys as Record<string, unknown>;
    const ids = Object.keys(keys);
    if (ids.length < 1 || ids.length > 8 || !Object.hasOwn(keys, record.currentKeyId) ||
        ids.some((id) => !/^[A-Za-z0-9._-]{1,64}$/.test(id) || typeof keys[id] !== 'string' || !/^[a-f0-9]{64}$/i.test(keys[id] as string))) return null;
    return { currentKeyId: record.currentKeyId, keys: keys as Record<string, string> };
  } catch {
    return null;
  }
}

async function authorizeSeller(request: Request, config: RuntimeConfig) {
  const sellers = parseSellerRegistry(config.ROCKSTAR_ENTITLEMENT_DELIVERY_SELLERS);
  if (!sellers) return { ok: false as const, status: 503, code: 'SELLER_REGISTRY_UNCONFIGURED' };
  const keyring = parseCodeKeyring(config.ROCKSTAR_ENTITLEMENT_DELIVERY_CODE_KEYS);
  if (!keyring) return { ok: false as const, status: 503, code: 'DELIVERY_KEYS_UNCONFIGURED' };
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get('authorization') ?? '');
  if (!match) return { ok: false as const, status: 401, code: 'UNAUTHORIZED' };
  const tokenHash = await sha256Hex(match[1]);
  let issuerId: string | null = null;
  for (const seller of sellers) {
    const expected = new TextEncoder().encode(seller.tokenSha256);
    const provided = new TextEncoder().encode(tokenHash);
    let difference = expected.length ^ provided.length;
    for (let index = 0; index < expected.length; index++) difference |= expected[index] ^ provided[index];
    if (difference === 0) issuerId = seller.issuerId;
  }
  if (!issuerId) return { ok: false as const, status: 401, code: 'UNAUTHORIZED' };
  return { ok: true as const, issuerId, keyring };
}

async function readBody(request: Request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? ''))
    throw new Error('UNSUPPORTED_CONTENT_TYPE');
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > 16_384))
    throw new Error('BODY_TOO_LARGE');
  if (!request.body) throw new Error('INVALID_BODY_SHAPE');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    total += item.value.byteLength;
    if (total > 16_384) {
      await reader.cancel();
      throw new Error('BODY_TOO_LARGE');
    }
    chunks.push(item.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let raw: string;
  try { raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('INVALID_JSON_ENCODING'); }
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_BODY_SHAPE');
  return value as Record<string, unknown>;
}

function idempotencyKey(request: Request) {
  const value = request.headers.get('idempotency-key') ?? '';
  return idemPattern.test(value) ? value : null;
}

async function consumeSellerRequest(db: D1Store, issuerId: string, now: number) {
  const windowStartedAt = Math.floor(now / rateWindowMs) * rateWindowMs;
  const row = await db.prepare(`INSERT INTO rockstar_entitlement_issuer_rate_limits
      (issuer_id,window_started_at,request_count,updated_at) VALUES (?,?,1,?)
    ON CONFLICT(issuer_id) DO UPDATE SET
      window_started_at=MAX(rockstar_entitlement_issuer_rate_limits.window_started_at,excluded.window_started_at),
      request_count=CASE WHEN excluded.window_started_at > rockstar_entitlement_issuer_rate_limits.window_started_at
        THEN 1 ELSE rockstar_entitlement_issuer_rate_limits.request_count+1 END,
      updated_at=excluded.updated_at
    RETURNING request_count AS requestCount,window_started_at AS windowStartedAt`)
    .bind(issuerId, windowStartedAt, now).first<{ requestCount: number; windowStartedAt: number }>();
  if (!row || !Number.isSafeInteger(row.requestCount) || !Number.isSafeInteger(row.windowStartedAt))
    throw new RockstarEntitlementIssuerStoreError('PERSISTENCE_UNCONFIRMED');
  return row;
}

function storeFailure(error: unknown) {
  if (error instanceof RockstarEntitlementIssuerStoreError) {
    const status = error.code === 'IDEMPOTENCY_CONFLICT' ? 409
      : error.code === 'DELIVERY_NOT_PENDING' ? 409
        : error.code === 'KEY_NOT_CONFIGURED' ? 503 : 503;
    return json({ code: error.code }, status);
  }
  if (error instanceof SyntaxError) return json({ code: 'INVALID_JSON' }, 400);
  if (error instanceof Error && error.message === 'INVALID_JSON_ENCODING') return json({ code: 'INVALID_JSON_ENCODING' }, 400);
  if (error instanceof Error && error.message === 'BODY_TOO_LARGE') return json({ code: 'BODY_TOO_LARGE' }, 413);
  if (error instanceof Error && error.message === 'UNSUPPORTED_CONTENT_TYPE') return json({ code: 'UNSUPPORTED_CONTENT_TYPE' }, 415);
  if (error instanceof Error && error.message === 'INVALID_BODY_SHAPE') return json({ code: 'INVALID_BODY_SHAPE' }, 400);
  return json({ code: 'DELIVERY_STORE_UNAVAILABLE' }, 503);
}

/** Internal server-to-server contract for a seller to register/recover/ack a signed claim package. */
export async function handleRockstarEntitlementDeliveryRequest(
  request: Request,
  db: D1Store,
  config: RuntimeConfig,
  now = Date.now(),
) {
  const access = await authorizeSeller(request, config);
  if (!access.ok) return json({ code: access.code }, access.status);
  const key = idempotencyKey(request);
  if (!key) return json({ code: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
  try {
    const rate = await consumeSellerRequest(db, access.issuerId, now);
    if (rate.requestCount > ROCKSTAR_ENTITLEMENT_DELIVERY_REQUESTS_PER_MINUTE) {
      const retryAfter = Math.max(1, Math.ceil((rate.windowStartedAt + rateWindowMs - now) / 1000));
      return Response.json({ code: 'SELLER_RATE_LIMITED' }, {
        status: 429, headers: { ...noStore, 'Retry-After': String(retryAfter) },
      });
    }
    if (request.method === 'POST') {
      const input = await readBody(request);
      if (Object.keys(input).length !== 2 || !Object.hasOwn(input, 'claim') || !Object.hasOwn(input, 'claimCode'))
        return json({ code: 'INVALID_INPUT' }, 400);
      const verified = await verifyRockstarEntitlementClaim(input.claim, input.claimCode,
        trustedRockstarEntitlementIssuerKeyResolver(config.ROCKSTAR_SERVICE_CLAIM_ISSUERS), now);
      if (!verified || verified.issuerId !== access.issuerId) return json({ code: 'INVALID_OR_UNAUTHORIZED_CLAIM' }, 400);
      const retained = await retainRockstarEntitlementDeliveryOnce(db,
        { claim: input.claim as typeof verified, claimCode: input.claimCode as string }, access.keyring, key, now);
      return json({ issuerId: access.issuerId, claimId: verified.claimId, state: retained.state,
        replayed: retained.replayed }, retained.replayed ? 200 : 201);
    }
    if (request.method === 'GET') {
      const delivery = await getRockstarEntitlementDelivery(db, access.issuerId, access.keyring, key);
      if (!delivery) return json({ code: 'DELIVERY_NOT_FOUND' }, 404);
      return json({ issuerId: access.issuerId, claimId: delivery.claimId, state: delivery.state,
        package: delivery.packageValue });
    }
    if (request.method === 'PATCH') {
      const input = await readBody(request);
      if (Object.keys(input).length !== 1 || typeof input.claimId !== 'string' || !idPattern.test(input.claimId))
        return json({ code: 'INVALID_ACKNOWLEDGEMENT' }, 400);
      const result = await acknowledgeRockstarEntitlementDelivery(db, access.issuerId, key, input.claimId, now);
      return json({ issuerId: access.issuerId, claimId: input.claimId, state: 'delivered', acknowledgement: result });
    }
    return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
  } catch (error) {
    return storeFailure(error);
  }
}
