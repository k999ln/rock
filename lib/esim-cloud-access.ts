import { sha256Hex } from './rockstar-entitlement-claim.ts';
import { resolveEsimCloudGrant, type EsimCloudConfig, type EsimCloudGrant } from './esim-cloud-grant.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
export const ESIM_CLOUD_COOKIE = 'rock_esim_access';
const TOKEN = /^rock_esim_[A-Za-z0-9_-]{43}$/;
const CREDENTIAL_TTL_MS = 30 * 86_400_000;
type Key = {
  id: string; orderId: string; ownerUserId: string; deviceRef: string; receiptSha256: string;
  scopesJson: string; createdAt: number; expiresAt: number; revokedAt: number | null;
};
const columns = `id,sky_order_id AS orderId,owner_user_id AS ownerUserId,device_ref AS deviceRef,
  entitlement_receipt_sha256 AS receiptSha256,scopes_json AS scopesJson,
  created_at AS createdAt,expires_at AS expiresAt,revoked_at AS revokedAt`;

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `rock_esim_${btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`;
}

export function esimCloudRequestToken(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  if (header.startsWith('Bearer rock_esim_')) return header.slice(7);
  const cookies = (request.headers.get('cookie') ?? '').split(';').map((item) => item.trim());
  const matching = cookies.filter((item) => item.startsWith(`${ESIM_CLOUD_COOKIE}=`));
  return matching.length === 1 ? matching[0].slice(ESIM_CLOUD_COOKIE.length + 1) : null;
}

/** This credential is for cloud work only, never account administration or payments. */
export function esimCloudRequestScope(request: Request) {
  const { pathname } = new URL(request.url);
  const method = request.method;
  if (method === 'GET' && ['/api/rockstar/device-home', '/api/rockstar/entitlements'].includes(pathname)) return 'rockstaros_access';
  if (method === 'POST' && ['/api/llm/estimate', '/api/llm/text'].includes(pathname)) return 'rockstaros_access';
  if (['GET', 'POST'].includes(method) && pathname === '/api/llm/quotes') return 'rockstaros_access';
  if (['GET', 'POST', 'DELETE'].includes(method) && /^\/api\/llm\/quotes\/[A-Za-z0-9._:-]+$/.test(pathname)) return 'rockstaros_access';
  if (method === 'GET' && /^\/api\/sky\/a2a-delegations\/[A-Za-z0-9._:-]+\/artifacts$/.test(pathname)) return 'agents';
  if (['GET', 'POST'].includes(method) && ['/api/sky/a2a-agents', '/api/sky/a2a-delegations'].includes(pathname)) return 'agents';
  if (method === 'POST' && pathname === '/api/sky/a2a-price-quotes') return 'agents';
  if (['GET', 'PATCH'].includes(method) && /^\/api\/sky\/a2a-delegations\/[A-Za-z0-9._:-]+$/.test(pathname)) return 'agents';
  if (method === 'POST' && /^\/api\/sky\/a2a-delegations\/[A-Za-z0-9._:-]+\/broker-authorization$/.test(pathname)) return 'agents';
  if (['GET', 'POST', 'PATCH'].includes(method) && pathname === '/api/work-jobs') return 'zema';
  if (method === 'POST' && ['/api/legal-guidance', '/api/patent-research', '/api/jev-evaluation', '/api/sky/mcp/inspect'].includes(pathname)) return 'sky';
  return null;
}

export function esimCloudCookie(request: Request, value: string | null, expiresAt = 0) {
  const url = new URL(request.url);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !loopback) throw new Error('CLOUD_ACCESS_HTTPS_REQUIRED');
  const seconds = value ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)) : 0;
  return `${ESIM_CLOUD_COOKIE}=${value ?? ''}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${seconds}${url.protocol === 'https:' ? '; Secure' : ''}`;
}

export function esimCloudAccessStore(db: Database, runtime: unknown) {
  const config = (runtime ?? {}) as EsimCloudConfig;
  async function current(owner: string, order: string) {
    return db.prepare(`SELECT ${columns} FROM esim_cloud_access_keys
      WHERE owner_user_id=? AND sky_order_id=? AND replaced_by_id IS NULL`)
      .bind(owner, order).first<Key>();
  }
  async function usable(key: Key, scope?: string, now = Date.now()) {
    if (key.revokedAt !== null || key.expiresAt <= now) return false;
    const grant = await resolveEsimCloudGrant(db, config, key.ownerUserId, key.orderId, now);
    if (!grant || grant.deviceRef !== key.deviceRef || grant.receiptSha256 !== key.receiptSha256 || grant.expiresAt < key.expiresAt) return false;
    const scopes = JSON.parse(key.scopesJson) as string[];
    return (!scope || scopes.includes(scope)) && scopes.every((item) => grant.scopes.some((allowed) => allowed === item));
  }
  async function status(owner: string, order: string, now = Date.now()) {
    const key = await current(owner, order);
    const grant = await resolveEsimCloudGrant(db, config, owner, order, now);
    return {
      available: grant !== null,
      state: !key ? 'not_issued' : key.revokedAt !== null ? 'revoked' : key.expiresAt <= now ? 'expired'
        : await usable(key, undefined, now) ? 'active' : 'suspended',
      key: key ? { id: key.id, createdAt: key.createdAt, expiresAt: key.expiresAt, scopes: JSON.parse(key.scopesJson) as string[] } : null,
      scopes: grant?.scopes ?? [],
      accessExpiresAt: grant?.expiresAt ?? null,
    };
  }
  return {
    status,
    async issue(owner: string, order: string, expectedKeyId: string | null, now = Date.now()) {
      const grant: EsimCloudGrant | null = await resolveEsimCloudGrant(db, config, owner, order, now);
      if (!grant) throw new Error('CLOUD_ACCESS_NOT_ELIGIBLE');
      const prior = await current(owner, order);
      if ((prior?.id ?? null) !== expectedKeyId) throw new Error('CLOUD_ACCESS_CONFLICT');
      const id = crypto.randomUUID();
      const secret = token();
      const expiresAt = Math.min(grant.expiresAt, now + CREDENTIAL_TTL_MS);
      const statements = [];
      if (prior) statements.push(db.prepare(`UPDATE esim_cloud_access_keys
        SET revoked_at=COALESCE(revoked_at,?),active_slot=NULL,replaced_by_id=?
        WHERE id=? AND owner_user_id=? AND sky_order_id=? AND replaced_by_id IS NULL AND revoked_at IS ?`)
        .bind(now, id, prior.id, owner, order, prior.revokedAt));
      const predecessor = prior ? `EXISTS (SELECT 1 FROM esim_cloud_access_keys k
        WHERE k.id=? AND k.owner_user_id=? AND k.sky_order_id=? AND k.replaced_by_id=?)`
        : 'NOT EXISTS (SELECT 1 FROM esim_cloud_access_keys k WHERE k.sky_order_id=?)';
      statements.push(db.prepare(`INSERT INTO esim_cloud_access_keys
        (id,sky_order_id,owner_user_id,device_ref,entitlement_receipt_sha256,token_sha256,scopes_json,
         created_at,expires_at,revoked_at,active_slot,replaced_by_id)
        SELECT ?,?,?,?,?,?,?,?,?,NULL,?,NULL WHERE ${predecessor}
        AND EXISTS (SELECT 1 FROM esim_device_entitlements e
          JOIN sky_commerce_orders o ON o.id=e.sky_order_id AND o.buyer_user_id=e.owner_user_id
          JOIN esim_provider_orders p ON p.sky_order_id=e.sky_order_id AND p.owner_user_id=e.owner_user_id
            AND p.profile_digest=e.profile_digest AND p.state='profile_bound'
          JOIN esim_provider_profile_bindings b ON b.sky_order_id=e.sky_order_id AND b.owner_user_id=e.owner_user_id AND b.profile_digest=e.profile_digest
          JOIN esim_device_install_receipts i ON i.sky_order_id=e.sky_order_id AND i.owner_user_id=e.owner_user_id
            AND i.profile_digest=e.profile_digest AND i.device_ref=e.device_ref AND i.receipt_sha256=e.install_receipt_sha256
          WHERE e.sky_order_id=? AND e.owner_user_id=? AND e.receipt_sha256=? AND e.device_ref=?
            AND o.mode='live' AND o.status='paid' AND o.refunded_minor=0)`)
        .bind(id, order, owner, grant.deviceRef, grant.receiptSha256, await sha256Hex(secret), JSON.stringify(grant.scopes),
          now, expiresAt, order, ...(prior ? [prior.id, owner, order, id] : [order]),
          order, owner, grant.receiptSha256, grant.deviceRef));
      const insertionIndex = statements.length - 1;
      // If eligibility changed before the insert, keep the old (now revoked) key discoverable for recovery.
      if (prior) statements.push(db.prepare(`UPDATE esim_cloud_access_keys SET replaced_by_id=NULL
        WHERE id=? AND replaced_by_id=? AND NOT EXISTS (SELECT 1 FROM esim_cloud_access_keys WHERE id=?)`)
        .bind(prior.id, id, id));
      const results = await db.batch(statements);
      if (results[insertionIndex].meta.changes !== 1) throw new Error('CLOUD_ACCESS_CONFLICT');
      // Fresh authorization is checked on every use; the token never grants payment or Tool approval.
      return { id, token: secret, expiresAt };
    },
    async revoke(owner: string, order: string, expectedKeyId: string, now = Date.now()) {
      const result = await db.prepare(`UPDATE esim_cloud_access_keys SET revoked_at=COALESCE(revoked_at,?),active_slot=NULL
        WHERE id=? AND owner_user_id=? AND sky_order_id=? AND replaced_by_id IS NULL`)
        .bind(now, expectedKeyId, owner, order).run();
      if (result.meta.changes !== 1) throw new Error('CLOUD_ACCESS_CONFLICT');
    },
    async authenticate(secret: string, scope: string, now = Date.now()) {
      if (!TOKEN.test(secret)) throw new Error('UNAUTHORIZED');
      const key = await db.prepare(`SELECT ${columns} FROM esim_cloud_access_keys
        WHERE token_sha256=? AND revoked_at IS NULL AND expires_at>? AND active_slot=sky_order_id`)
        .bind(await sha256Hex(secret), now).first<Key>();
      if (!key || !await usable(key, scope, now)) throw new Error('UNAUTHORIZED');
      return key.ownerUserId;
    },
    async listActive(owner: string, now = Date.now()) {
      // Do not touch the optional migration when this offering is disabled.
      if (!config.ESIM_CLOUD_ACCESS_POLICIES_JSON) return [];
      const rows = await db.prepare(`SELECT ${columns} FROM esim_cloud_access_keys
        WHERE owner_user_id=? AND revoked_at IS NULL AND expires_at>? AND active_slot=sky_order_id
        ORDER BY created_at DESC LIMIT 100`).bind(owner, now).all<Key>();
      const access = [];
      for (const key of rows.results) {
        if (!await usable(key, undefined, now)) continue;
        const grant = await resolveEsimCloudGrant(db, config, owner, key.orderId, now);
        if (!grant) continue;
        access.push({ orderId: key.orderId, state: 'active', expiresAt: key.expiresAt,
          scopes: JSON.parse(key.scopesJson) as string[], starterAgentPack: grant.starterAgentPack });
      }
      return access;
    },
    async hasScope(owner: string, scope: string, now = Date.now()) {
      if (!config.ESIM_CLOUD_ACCESS_POLICIES_JSON) return false;
      const rows = await db.prepare(`SELECT ${columns} FROM esim_cloud_access_keys
        WHERE owner_user_id=? AND revoked_at IS NULL AND expires_at>? AND active_slot=sky_order_id
        ORDER BY created_at DESC LIMIT 100`).bind(owner, now).all<Key>();
      for (const key of rows.results) if (await usable(key, scope, now)) return true;
      return false;
    },
  };
}

export async function authenticateEsimCloudRequest(request: Request, db: Database, config: unknown) {
  const scope = esimCloudRequestScope(request);
  const secret = esimCloudRequestToken(request);
  if (!scope || !secret) throw new Error('UNAUTHORIZED');
  // Cookie credentials are ambient: writes must come from the same origin.
  if (!request.headers.get('authorization')?.startsWith('Bearer rock_esim_') && request.method !== 'GET' &&
      request.headers.get('origin') !== new URL(request.url).origin) throw new Error('ORIGIN');
  return esimCloudAccessStore(db, config).authenticate(secret, scope);
}

/** Stop reading at the management request limit, including chunked requests. */
export async function readEsimCloudRequest(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1024) {
        void reader.cancel().catch(() => {});
        throw new Error('CLOUD_ACCESS_BODY_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
