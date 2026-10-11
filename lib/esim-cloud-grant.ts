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
    await verifyEsimStarterAgentPack(pricing.plan, await skyToolPackageStore(db).listRegistry());
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
