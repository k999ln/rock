/** Channel-neutral proof that a purchase includes access to Rockstar services. */
export const ROCKSTAR_ENTITLEMENT_CLAIM_SCHEMA = 'rockstar-service-entitlement-claim/1' as const;
const DOMAIN = new TextEncoder().encode('rockstar-service-entitlement-claim-signature/1\0');
const fields = [
  'schema', 'issuerId', 'issuerKeyId', 'claimId', 'offerId',
  'purchaseReferenceSha256', 'claimCodeSha256', 'formFactor', 'scopes',
  'issuedAt', 'expiresAt',
] as const;
const allowedScopes = new Set(['rockstaros_access', 'sky', 'zema', 'agents']);
const idPattern = /^[A-Za-z0-9._:-]{1,128}$/;

export type RockstarEntitlementClaim = {
  schema: typeof ROCKSTAR_ENTITLEMENT_CLAIM_SCHEMA;
  issuerId: string;
  issuerKeyId: string;
  claimId: string;
  offerId: string;
  purchaseReferenceSha256: string;
  claimCodeSha256: string;
  formFactor: 'physical_sim' | 'esim' | 'service_only';
  scopes: string[];
  issuedAt: number;
  expiresAt: number | null;
  signature: string;
};

export type RockstarEntitlementIssuerKeyResolver = (identity: { issuerId: string; issuerKeyId: string }) => Promise<Uint8Array | null>;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function rockstarEntitlementClaimSigningBytes(claim: RockstarEntitlementClaim) {
  const payload = new TextEncoder().encode(JSON.stringify(Object.fromEntries(fields.map((key) => [key, claim[key]]))));
  const bytes = new Uint8Array(DOMAIN.length + payload.length);
  bytes.set(DOMAIN);
  bytes.set(payload, DOMAIN.length);
  return bytes;
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyRockstarEntitlementClaim(
  value: unknown,
  claimCode: unknown,
  resolveKey: RockstarEntitlementIssuerKeyResolver,
  now = Date.now(),
) {
  if (!record(value) || typeof claimCode !== 'string' || !/^rsk_[A-Za-z0-9_-]{32,96}$/.test(claimCode)) return null;
  const expected = [...fields, 'signature'].sort();
  if (Object.keys(value).length !== expected.length || Object.keys(value).sort().some((key, index) => key !== expected[index])) return null;
  const claim = value as unknown as RockstarEntitlementClaim;
  if (claim.schema !== ROCKSTAR_ENTITLEMENT_CLAIM_SCHEMA ||
    !idPattern.test(claim.issuerId) || !idPattern.test(claim.issuerKeyId) ||
    !idPattern.test(claim.claimId) || !idPattern.test(claim.offerId) ||
    !/^[a-f0-9]{64}$/.test(claim.purchaseReferenceSha256) ||
    !/^[a-f0-9]{64}$/.test(claim.claimCodeSha256) ||
    !['physical_sim', 'esim', 'service_only'].includes(claim.formFactor) ||
    !Array.isArray(claim.scopes) || claim.scopes.length < 1 || claim.scopes.length > allowedScopes.size ||
    claim.scopes.some((scope) => typeof scope !== 'string' || !allowedScopes.has(scope)) ||
    new Set(claim.scopes).size !== claim.scopes.length ||
    !Number.isSafeInteger(claim.issuedAt) || claim.issuedAt > now + 30_000 || claim.issuedAt < now - 366 * 24 * 60 * 60 * 1000 ||
    (claim.expiresAt !== null && (!Number.isSafeInteger(claim.expiresAt) || claim.expiresAt <= now || claim.expiresAt <= claim.issuedAt || claim.expiresAt > claim.issuedAt + 10 * 365 * 24 * 60 * 60 * 1000)) ||
    typeof claim.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(claim.signature)) return null;
  if (await sha256Hex(claimCode) !== claim.claimCodeSha256) return null;
  let publicKey: Uint8Array | null;
  try { publicKey = await resolveKey({ issuerId: claim.issuerId, issuerKeyId: claim.issuerKeyId }); } catch { return null; }
  if (!(publicKey instanceof Uint8Array) || publicKey.length !== 32) return null;
  try {
    const key = await crypto.subtle.importKey('raw', Uint8Array.from(publicKey).buffer as ArrayBuffer, { name: 'Ed25519' }, false, ['verify']);
    const raw = Uint8Array.from(atob(claim.signature.replaceAll('-', '+').replaceAll('_', '/') + '=='), (character) => character.charCodeAt(0));
    if (raw.length !== 64 || btoa(String.fromCharCode(...raw)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !== claim.signature) return null;
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, raw, rockstarEntitlementClaimSigningBytes(claim)) ? claim : null;
  } catch { return null; }
}

type TrustedIssuerKey = { issuerId: string; issuerKeyId: string; publicKeyHex: string; status: 'active' | 'revoked' };

function parseTrustedIssuerKeys(configuration: unknown) {
  if (typeof configuration !== 'string' || configuration.length > 65_536) return null;
  let value: unknown;
  try { value = JSON.parse(configuration); } catch { return null; }
  if (!Array.isArray(value) || value.length > 256) return null;
  const entries = new Map<string, TrustedIssuerKey>();
  for (const item of value) {
    if (!record(item) || Object.keys(item).length !== 4 || typeof item.issuerId !== 'string' || !idPattern.test(item.issuerId) ||
      typeof item.issuerKeyId !== 'string' || !idPattern.test(item.issuerKeyId) ||
      typeof item.publicKeyHex !== 'string' || !/^[a-f0-9]{64}$/i.test(item.publicKeyHex) ||
      (item.status !== 'active' && item.status !== 'revoked')) return null;
    const identity = `${item.issuerId}\0${item.issuerKeyId}`;
    if (entries.has(identity)) return null;
    entries.set(identity, item as TrustedIssuerKey);
  }
  return entries;
}

/** Operator-provisioned trust inventory; no self-service issuer enrollment. */
export function trustedRockstarEntitlementIssuerKeyResolver(configuration: unknown): RockstarEntitlementIssuerKeyResolver {
  const entries = parseTrustedIssuerKeys(configuration);
  if (!entries) return async () => null;
  return async ({ issuerId, issuerKeyId }) => {
    const entry = entries.get(`${issuerId}\0${issuerKeyId}`);
    return entry?.status === 'active'
      ? Uint8Array.from(entry.publicKeyHex.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16))
      : null;
  };
}

export function hasActiveRockstarEntitlementIssuer(configuration: unknown) {
  const entries = parseTrustedIssuerKeys(configuration);
  return entries !== null && [...entries.values()].some((entry) => entry.status === 'active');
}

type Database = Pick<D1Database, 'prepare'>;
export function rockstarEntitlementStore(db: Database) {
  async function isClaimRevoked(claim: RockstarEntitlementClaim) {
    return Boolean(await db.prepare(`SELECT 1 AS revoked FROM rockstar_entitlement_events
      WHERE issuer_id = ? AND claim_id = ? AND purchase_reference_sha256 = ?
        AND event_type IN ('refunded','revoked') AND applied_at IS NOT NULL LIMIT 1`)
      .bind(claim.issuerId, claim.claimId, claim.purchaseReferenceSha256)
      .first<{ revoked: number }>());
  }
  return {
    async claim(claim: RockstarEntitlementClaim, claimCode: string, ownerUserId: string, now = Date.now()) {
      const codeHash = await sha256Hex(claimCode);
      if (await isClaimRevoked(claim)) throw new Error('CLAIM_REVOKED');
      const inserted = await db.prepare(`INSERT OR IGNORE INTO rockstar_service_entitlements
        (issuer_id,claim_id,owner_user_id,offer_id,purchase_reference_sha256,claim_code_sha256,
         form_factor,scopes_json,issuer_key_id,claim_signature,status,claimed_at,expires_at,revoked_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,'active',?,?,NULL
        WHERE NOT EXISTS (SELECT 1 FROM rockstar_entitlement_events e
          WHERE e.issuer_id = ? AND e.claim_id = ? AND e.purchase_reference_sha256 = ?
            AND e.event_type IN ('refunded','revoked') AND e.applied_at IS NOT NULL)`)
        .bind(claim.issuerId, claim.claimId, ownerUserId, claim.offerId, claim.purchaseReferenceSha256,
          codeHash, claim.formFactor, JSON.stringify(claim.scopes), claim.issuerKeyId, claim.signature,
          now, claim.expiresAt, claim.issuerId, claim.claimId, claim.purchaseReferenceSha256).run();
      const row = await db.prepare(`SELECT issuer_id AS issuerId,claim_id AS claimId,owner_user_id AS ownerUserId,
        offer_id AS offerId,form_factor AS formFactor,scopes_json AS scopesJson,status,claimed_at AS claimedAt,
        expires_at AS expiresAt FROM rockstar_service_entitlements WHERE issuer_id = ? AND claim_id = ?`)
        .bind(claim.issuerId, claim.claimId).first<{ issuerId: string; claimId: string; ownerUserId: string; offerId: string; formFactor: string; scopesJson: string; status: string; claimedAt: number; expiresAt: number | null }>();
      if (await isClaimRevoked(claim)) throw new Error('CLAIM_REVOKED');
      if (!row || row.ownerUserId !== ownerUserId) throw new Error('CLAIM_ALREADY_USED');
      return { ...row, scopes: JSON.parse(row.scopesJson) as string[], alreadyClaimed: inserted.meta.changes === 0 };
    },
    async list(ownerUserId: string) {
      const rows = await db.prepare(`SELECT issuer_id AS issuerId,claim_id AS claimId,offer_id AS offerId,
        form_factor AS formFactor,scopes_json AS scopesJson,
        CASE WHEN status = 'active' AND expires_at IS NOT NULL AND expires_at <= ? THEN 'expired' ELSE status END AS status,
        claimed_at AS claimedAt,expires_at AS expiresAt
        FROM rockstar_service_entitlements WHERE owner_user_id = ? ORDER BY claimed_at DESC LIMIT 100`)
        .bind(Date.now(), ownerUserId).all<{ issuerId: string; claimId: string; offerId: string; formFactor: string; scopesJson: string; status: string; claimedAt: number; expiresAt: number | null }>();
      return rows.results.map(({ scopesJson, ...row }) => ({ ...row, scopes: JSON.parse(scopesJson) as string[] }));
    },
    async hasActiveScope(ownerUserId: string, scope: string, now = Date.now()) {
      if (!allowedScopes.has(scope)) return false;
      const rows = await db.prepare(`SELECT scopes_json AS scopesJson FROM rockstar_service_entitlements
        WHERE owner_user_id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY claimed_at DESC LIMIT 100`)
        .bind(ownerUserId, now).all<{ scopesJson: string }>();
      return rows.results.some((row) => {
        try { return (JSON.parse(row.scopesJson) as unknown[]).includes(scope); }
        catch { return false; }
      });
    },
  };
}
