import { EsimPlanCatalogError, selectEsimOrderPricing, verifyEsimStarterAgentPack, type SkyEsimOrder, type EsimServerPlan } from './esim-plan-catalog.ts';
import { hasTrustedEsimInstallIssuerKey } from './esim-install-proof.ts';
import { trustedEsimDeviceGatewayKeyFingerprint } from './esim-device-entitlement.ts';
import { esimDeviceEntitlementStore } from './esim-device-entitlement-store.ts';
import { skyToolPackageStore } from './sky-tool-package-store.ts';
import { sha256Hex } from './rockstar-entitlement-claim.ts';

export type EsimCloudConfig = {
  ESIM_CLOUD_ACCESS_POLICIES_JSON?: string;
  ESIMGO_PLAN_CATALOG_JSON?: string;
  ESIM_INSTALL_RECEIPT_KEYS?: string;
  ESIM_DEVICE_GATEWAY_KEYS?: string;
};
export const ESIM_CLOUD_SCOPES = ['rockstaros_access', 'sky', 'zema', 'agents'] as const;
export type EsimCloudScope = typeof ESIM_CLOUD_SCOPES[number];
export type EsimCloudPolicy = {
  packageKey: string;
  manifestSha256: string;
  accessDurationDays: number;
  scopes: EsimCloudScope[];
};
export type EsimCloudGrant = {
  ownerUserId: string;
  orderId: string;
  deviceRef: string;
  receiptSha256: string;
  expiresAt: number;
  scopes: EsimCloudScope[];
  starterAgentPack: EsimServerPlan['starterAgentPack'];
};
type Database = Pick<D1Database, 'prepare' | 'batch'>;

// SQLite evaluates this inside the committing batch, not at the earlier JS read.
export const ESIM_COMMIT_NOW_SQL = `(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))`;

/** Current package review, including negative rows which positive registry
 * projections hide. Reviews are append-only: the greatest reviewed_at is the
 * current generation; ties must ALL verify the pinned manifest. A later explicit
 * verified generation can restore rights; expiry never falls back to old rows.
 * Unknown/malformed authority fails closed. The same fixed SQL is replayed by
 * captureEsimAuthorityReads inside the committing batch.
 */
export async function currentEsimPackageReview(
  db: Database, packageKey: string, manifestSha256: string, now = Date.now(),
): Promise<boolean> {
  const rows = await db.prepare(`SELECT p.package_key AS packageKey,p.manifest_sha256 AS manifestSha256,
      p.status AS packageStatus,r.id AS reviewId,r.reviewer_id AS reviewerId,
      r.manifest_sha256 AS reviewManifestSha256,r.decision,r.reviewed_at AS reviewedAt,r.expires_at AS expiresAt,
      CASE WHEN p.status='verified'
        AND EXISTS(SELECT 1 FROM sky_tool_package_reviews q WHERE q.package_key=p.package_key)
        AND NOT EXISTS(SELECT 1 FROM sky_tool_package_reviews q WHERE q.package_key=p.package_key AND (
          typeof(q.reviewed_at)<>'integer' OR q.reviewed_at<0 OR q.reviewed_at>MAX(?,${ESIM_COMMIT_NOW_SQL})
          OR q.id='' OR q.reviewer_id='' OR q.decision NOT IN ('verified','rejected','revoked')
          OR (q.expires_at IS NOT NULL AND (typeof(q.expires_at)<>'integer' OR q.expires_at<1))))
        AND NOT EXISTS(SELECT 1 FROM sky_tool_package_reviews q WHERE q.package_key=p.package_key
          AND q.reviewed_at=(SELECT MAX(latest.reviewed_at) FROM sky_tool_package_reviews latest WHERE latest.package_key=p.package_key)
          AND (q.decision<>'verified' OR q.manifest_sha256<>p.manifest_sha256
            OR (q.expires_at IS NOT NULL AND q.expires_at<=MAX(?,${ESIM_COMMIT_NOW_SQL}))))
      THEN 1 ELSE 0 END AS admissible
    FROM sky_tool_packages p LEFT JOIN sky_tool_package_reviews r ON r.package_key=p.package_key
    WHERE p.package_key=? AND p.manifest_sha256=? ORDER BY r.reviewed_at,r.id`)
    .bind(now, now, packageKey, manifestSha256).all<{ admissible: number }>();
  return rows.results.length > 0 && rows.results.every(row => row.admissible === 1);
}

/** Server-only read set. SQL comes from the existing stores, never a request.
 * Re-evaluate the exact SELECT multiset inside the same batch as its writes.
 * This is deliberately conservative: unrelated rows in a bounded catalog read
 * may cause a retry, but a stale positive read cannot become an authorization.
 */
export function captureEsimAuthorityReads(db: Database) {
  const reads: { sql: string; values: unknown[]; columns: string[]; rows: string[] }[] = [];
  const encoder = new TextEncoder();
  const binaryCompare = (a: string, b: string) => {
    const x = encoder.encode(a), y = encoder.encode(b);
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
    return x.length - y.length;
  };
  function prepare(sql: string, values: unknown[] = []): D1PreparedStatement {
    if (!/^\s*SELECT\b/i.test(sql) || /;/.test(sql)) throw new Error('AUTHORITY_SELECT_REQUIRED');
    const all = async () => {
      const result = await db.prepare(sql).bind(...values).all<Record<string, unknown>>();
      if (!result.success && result.error) throw new Error('AUTHORITY_READ_FAILED');
      const columns = Object.keys(result.results[0] ?? {}).sort();
      if (columns.some(c => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(c))) throw new Error('AUTHORITY_COLUMNS_INVALID');
      const rows = result.results.map(row => {
        if (Object.keys(row).sort().join(',') !== columns.join(',')) throw new Error('AUTHORITY_COLUMNS_INVALID');
        const values = columns.map(c => row[c]);
        if (values.some(v => v !== null && typeof v !== 'string' &&
          !(typeof v === 'number' && Number.isSafeInteger(v)))) throw new Error('AUTHORITY_VALUE_INVALID');
        return JSON.stringify(values);
      }).sort(binaryCompare);
      if (rows.length > 1000 || encoder.encode(rows.join('\n')).length > 1_000_000 || reads.length >= 100)
        throw new Error('AUTHORITY_READ_LIMIT');
      reads.push({ sql, values: [...values], columns, rows });
      return result;
    };
    return {
      bind: (...bound: unknown[]) => prepare(sql, bound),
      all,
      first: async () => (await all()).results[0] ?? null,
    } as D1PreparedStatement;
  }
  return {
    database: { prepare, batch: db.batch.bind(db) } as Database,
    assertions() {
      return reads.map(read => {
        // Existing package-review SQL binds a read-time expiry. Keep that bound
        // and also enforce actual commit time. All substitutions are fixed SQL.
        const sql = read.sql.replace(/expires_at\s*>\s*\?/gi,
          `expires_at > MAX(?, ${ESIM_COMMIT_NOW_SQL})`);
        const expression = read.columns.length
          ? `COALESCE((SELECT group_concat(row_value, char(10)) FROM
              (SELECT json_array(${read.columns.map(c => `"${c}"`).join(',')}) AS row_value
               FROM (${sql}) ORDER BY row_value COLLATE BINARY)), '') = ?`
          : `(SELECT count(*) FROM (${sql})) = 0`;
        return db.prepare(`SELECT CASE WHEN (${expression}) THEN 1 ELSE json('ESIM_AUTHORITY_CHANGED') END`)
          .bind(...read.values, ...(read.columns.length ? [read.rows.join('\n')] : []));
      });
    },
  };
}

/** Operator-owned service terms. No inferred duration or permission from a carrier plan. */
export function parseEsimCloudPolicies(raw: unknown): EsimCloudPolicy[] {
  if (typeof raw !== 'string' || raw.length > 32_768) return [];
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values) || values.length < 1 || values.length > 100) return [];
    const seen = new Set<string>();
    for (const value of values) {
      if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).sort().join(',') !== 'accessDurationDays,manifestSha256,packageKey,scopes' ||
        typeof value.packageKey !== 'string' || !/^[A-Za-z0-9._:@-]{1,160}$/.test(value.packageKey) ||
        typeof value.manifestSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.manifestSha256) ||
        !Number.isSafeInteger(value.accessDurationDays) || value.accessDurationDays < 1 || value.accessDurationDays > 366 ||
        !Array.isArray(value.scopes) || !value.scopes.includes('rockstaros_access') ||
        value.scopes.some((scope: unknown) => !ESIM_CLOUD_SCOPES.includes(scope as EsimCloudScope)) ||
        new Set(value.scopes).size !== value.scopes.length) return [];
      const id = `${value.packageKey}:${value.manifestSha256}`;
      if (seen.has(id)) return [];
      seen.add(id);
    }
    return values as EsimCloudPolicy[];
  } catch { return []; }
}

/** Re-evaluate the original paid order, exact install proof, gateway trust and current package review. */
export async function resolveEsimCloudGrant(
  db: Database, config: EsimCloudConfig, ownerUserId: string, orderId: string, now = Date.now(),
): Promise<EsimCloudGrant | null> {
  const policies = parseEsimCloudPolicies(config.ESIM_CLOUD_ACCESS_POLICIES_JSON);
  if (!policies.length) return null;
  const row = await db.prepare(`SELECT o.id,o.buyer_user_id AS buyerUserId,o.mode,o.status,
      o.package_key AS packageKey,o.manifest_sha256 AS manifestSha256,o.amount_minor AS amountMinor,
      o.currency,o.refunded_minor AS refundedMinor,i.issuer_id AS installIssuer,i.key_id AS installKeyId,
      e.device_ref AS deviceRef,e.authority_id AS authorityId,e.key_id AS keyId,
      e.signature_algorithm AS signatureAlgorithm,e.device_public_key_sha256 AS devicePublicKeySha256,
      e.starter_pack_manifest_sha256 AS packHash,e.receipt_sha256 AS receiptSha256,e.activated_at AS activatedAt
    FROM sky_commerce_orders o
    JOIN esim_provider_orders p ON p.sky_order_id=o.id AND p.owner_user_id=o.buyer_user_id AND p.state='profile_bound'
    JOIN esim_provider_profile_bindings b ON b.sky_order_id=o.id AND b.owner_user_id=o.buyer_user_id AND b.profile_digest=p.profile_digest
    JOIN esim_device_install_receipts i ON i.sky_order_id=o.id AND i.owner_user_id=o.buyer_user_id AND i.profile_digest=b.profile_digest
    JOIN esim_device_entitlements e ON e.sky_order_id=o.id AND e.owner_user_id=o.buyer_user_id
      AND e.profile_digest=i.profile_digest AND e.device_ref=i.device_ref AND e.install_receipt_sha256=i.receipt_sha256
    WHERE o.id=? AND o.buyer_user_id=? AND o.mode='live' AND o.status='paid' AND o.refunded_minor=0`)
    .bind(orderId, ownerUserId).first<SkyEsimOrder & {
      installIssuer: string; installKeyId: string; deviceRef: string; authorityId: string; keyId: string;
      signatureAlgorithm: string; devicePublicKeySha256: string; packHash: string; receiptSha256: string; activatedAt: number;
    }>();
  if (!row || !hasTrustedEsimInstallIssuerKey(config.ESIM_INSTALL_RECEIPT_KEYS, row.installIssuer, row.installKeyId)) return null;
  const policy = policies.find((item) => item.packageKey === row.packageKey && item.manifestSha256 === row.manifestSha256);
  if (!policy || !Number.isSafeInteger(row.activatedAt) || row.activatedAt > now) return null;
  const expiresAt = row.activatedAt + policy.accessDurationDays * 86_400_000;
  if (expiresAt <= now) return null;
  try {
    const pricing = await selectEsimOrderPricing(db, config.ESIMGO_PLAN_CATALOG_JSON, row, ownerUserId);
    if (await sha256Hex(JSON.stringify(pricing.plan.starterAgentPack)) !== row.packHash) return null;
    for (const reference of pricing.plan.starterAgentPack.packages)
      if (!await currentEsimPackageReview(db, reference.packageKey, reference.manifestSha256, now)) return null;
    await verifyEsimStarterAgentPack(pricing.plan, await skyToolPackageStore(db).verifiedRegistryPackages(pricing.plan.starterAgentPack.packages));
    const identity = { authorityId: row.authorityId, keyId: row.keyId, ownerUserId, deviceRef: row.deviceRef };
    const fixed = await trustedEsimDeviceGatewayKeyFingerprint(config.ESIM_DEVICE_GATEWAY_KEYS, identity);
    const attested = await esimDeviceEntitlementStore(db).attestedGatewayKey(identity);
    const key = fixed ?? attested;
    if (!key || key.algorithm !== row.signatureAlgorithm || key.publicKeySha256 !== row.devicePublicKeySha256) return null;
    return { ownerUserId, orderId, deviceRef: row.deviceRef, receiptSha256: row.receiptSha256, expiresAt, scopes: policy.scopes, starterAgentPack: pricing.plan.starterAgentPack };
  } catch (error) {
    if (error instanceof EsimPlanCatalogError) return null;
    throw error;
  }
}
