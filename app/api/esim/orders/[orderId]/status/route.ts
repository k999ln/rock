import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { describeEsimStarterAgentPack, EsimPlanCatalogError, selectEsimOrderPricing } from '@/lib/esim-plan-catalog';
import { skyToolPackageStore } from '@/lib/sky-tool-package-store';
import { trustedEsimDeviceGatewayKeyFingerprint } from '@/lib/esim-device-entitlement';
import { esimDeviceEntitlementStore } from '@/lib/esim-device-entitlement-store';
import { hasTrustedEsimInstallIssuerKey } from '@/lib/esim-install-proof';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff' },
  });
}

type Row = {
  id: string;
  buyerUserId: string;
  mode: string;
  packageKey: string;
  manifestSha256: string;
  amountMinor: number;
  currency: string;
  status: string;
  refundedMinor: number;
  providerState: string | null;
  hasInstallMaterial: number | null;
  installMaterialDeliveredAt: number | null;
  profileBound: number;
  installedDeviceRef: string | null;
  installIssuer: string | null;
  installKeyId: string | null;
  installationEvidenceSource: string | null;
  installObservedAt: number | null;
  installationVerifiedAt: number | null;
  entitlementDeviceRef: string | null;
  entitlementAuthorityId: string | null;
  entitlementKeyId: string | null;
  entitlementSignatureAlgorithm: 'Ed25519' | 'ES256' | null;
  entitlementDevicePublicKeySha256: string | null;
  entitlementPackHash: string | null;
  entitlementActivatedAt: number | null;
};

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', copy.buffer as ArrayBuffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const ownerUserId = await requestUser(request);
    const { orderId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: 'order_not_found' }, 404);
    const row = await database().prepare(`SELECT o.id, o.mode, o.status,
        o.buyer_user_id AS buyerUserId, o.package_key AS packageKey,
        o.manifest_sha256 AS manifestSha256, o.amount_minor AS amountMinor, o.currency,
        o.refunded_minor AS refundedMinor, p.state AS providerState,
        CASE WHEN p.install_material_ciphertext IS NOT NULL THEN 1 ELSE 0 END AS hasInstallMaterial,
        p.install_material_delivered_at AS installMaterialDeliveredAt,
        CASE WHEN b.sky_order_id IS NOT NULL THEN 1 ELSE 0 END AS profileBound,
        i.device_ref AS installedDeviceRef, i.issuer_id AS installIssuer,
        i.key_id AS installKeyId,
        i.evidence_source AS installationEvidenceSource, i.observed_at AS installObservedAt,
        i.verified_at AS installationVerifiedAt,
        e.device_ref AS entitlementDeviceRef, e.authority_id AS entitlementAuthorityId,
        e.key_id AS entitlementKeyId,
        e.signature_algorithm AS entitlementSignatureAlgorithm,
        e.device_public_key_sha256 AS entitlementDevicePublicKeySha256,
        e.starter_pack_manifest_sha256 AS entitlementPackHash,
        e.activated_at AS entitlementActivatedAt
      FROM sky_commerce_orders o
      LEFT JOIN esim_provider_orders p ON p.sky_order_id = o.id AND p.owner_user_id = o.buyer_user_id
      LEFT JOIN esim_provider_profile_bindings b ON b.sky_order_id = o.id AND b.owner_user_id = o.buyer_user_id
      LEFT JOIN esim_device_install_receipts i ON i.sky_order_id = o.id
        AND i.owner_user_id = o.buyer_user_id AND i.profile_digest = b.profile_digest
      LEFT JOIN esim_device_entitlements e ON e.sky_order_id = o.id
        AND e.owner_user_id = o.buyer_user_id AND e.profile_digest = b.profile_digest
        AND e.device_ref = i.device_ref AND e.install_receipt_sha256 = i.receipt_sha256
      WHERE o.id = ? AND o.buyer_user_id = ?`)
      .bind(orderId, ownerUserId).first<Row>();
    if (!row) return json({ error: 'order_not_found' }, 404);
    if (row.mode !== 'live' || row.status !== 'paid' || row.refundedMinor !== 0)
      return json({ orderId, state: 'not_eligible' });

    const catalogJson = (env as unknown as { ESIMGO_PLAN_CATALOG_JSON?: string }).ESIMGO_PLAN_CATALOG_JSON;
    let pricingSnapshot;
    try {
      pricingSnapshot = await selectEsimOrderPricing(database(), catalogJson, row, ownerUserId);
    } catch (error) {
      if (error instanceof EsimPlanCatalogError && error.code === 'PLAN_UNAVAILABLE')
        return json({ orderId, state: 'not_esim_order' });
      if (error instanceof EsimPlanCatalogError && error.code === 'ORDER_NOT_ELIGIBLE')
        return json({ orderId, state: 'not_eligible' });
      if (error instanceof EsimPlanCatalogError && error.code === 'CATALOG_NOT_CONFIGURED')
        return json({ orderId, state: 'esim_configuration_pending' }, 503);
      throw error;
    }

    let state: string;
    switch (row.providerState) {
      case null:
        state = 'paid_waiting_for_esim_issuance';
        break;
      case 'dispatch_started':
      case 'reconciliation_required':
        state = 'provider_outcome_requires_reconciliation';
        break;
      case 'provider_completed':
        state = 'provider_completed_binding_pending';
        break;
      case 'profile_bound':
        state = row.hasInstallMaterial ? 'profile_bound_install_material_ready'
          : row.installMaterialDeliveredAt ? 'install_material_acknowledged'
            : 'profile_bound_install_material_unavailable';
        break;
      default:
        state = 'provider_state_unknown';
    }
    const starterPack = pricingSnapshot.plan.starterAgentPack;
    const installIssuerKeys = (env as unknown as { ESIM_INSTALL_RECEIPT_KEYS?: string }).ESIM_INSTALL_RECEIPT_KEYS;
    const installationVerified = row.installationVerifiedAt !== null &&
      row.installIssuer !== null && row.installKeyId !== null &&
      hasTrustedEsimInstallIssuerKey(installIssuerKeys, row.installIssuer, row.installKeyId);
    const registry = await skyToolPackageStore(database()).listRegistry();
    const starterPackages = await describeEsimStarterAgentPack(starterPack, registry);
    const currentStarterPackHash = await sha256Hex(JSON.stringify(starterPack));
    const gatewayKeys = (env as unknown as { ESIM_DEVICE_GATEWAY_KEYS?: string }).ESIM_DEVICE_GATEWAY_KEYS;
    const staticDeviceKey = row.entitlementAuthorityId && row.entitlementKeyId && row.entitlementDeviceRef
      ? await trustedEsimDeviceGatewayKeyFingerprint(gatewayKeys, {
        authorityId: row.entitlementAuthorityId, keyId: row.entitlementKeyId,
        ownerUserId: row.buyerUserId, deviceRef: row.entitlementDeviceRef,
      }) : null;
    const attestedDeviceKey = row.entitlementAuthorityId && row.entitlementKeyId && row.entitlementDeviceRef
      ? await esimDeviceEntitlementStore(database()).attestedGatewayKey({
        authorityId: row.entitlementAuthorityId, ownerUserId: row.buyerUserId,
        deviceRef: row.entitlementDeviceRef, keyId: row.entitlementKeyId,
      }) : null;
    const deviceKey = staticDeviceKey ?? (attestedDeviceKey
      ? { algorithm: attestedDeviceKey.algorithm, publicKeySha256: attestedDeviceKey.publicKeySha256 }
      : null);
    const entitlementActive = installationVerified && row.entitlementActivatedAt !== null &&
      row.entitlementDeviceRef !== null && row.entitlementAuthorityId !== null &&
      row.entitlementKeyId !== null && row.entitlementPackHash !== null &&
      row.entitlementDeviceRef === row.installedDeviceRef &&
      row.entitlementPackHash === currentStarterPackHash &&
      starterPackages.every((item) => item.reviewState === 'active') &&
      deviceKey !== null && deviceKey.algorithm === row.entitlementSignatureAlgorithm &&
      deviceKey.publicKeySha256 === row.entitlementDevicePublicKeySha256;
    return json({
      orderId,
      state,
      providerProfileBoundToOrder: row.profileBound === 1,
      deviceInstallState: installationVerified ? 'verified_installed_enabled' : 'unverified',
      esimDeviceEntitlementState: entitlementActive ? 'active'
        : row.entitlementActivatedAt !== null ? 'revoked_or_stale' : 'not_connected',
      starterPackActivationState: entitlementActive ? 'active_on_authenticated_device'
        : installationVerified ? 'awaiting_authenticated_device_gateway' : 'awaiting_install_proof',
      starterPackActivatedAt: entitlementActive ? row.entitlementActivatedAt : null,
      installationProof: installationVerified ? {
        deviceRef: row.installedDeviceRef,
        issuerId: row.installIssuer,
        evidenceSource: row.installationEvidenceSource,
        observedAt: row.installObservedAt,
        verifiedAt: row.installationVerifiedAt,
      } : null,
      starterAgentPack: {
        id: starterPack.id,
        version: starterPack.version,
        packageCount: starterPack.packages.length,
        packages: starterPackages,
      },
      installMaterialAvailable: row.hasInstallMaterial === 1,
      installMaterialAcknowledged: row.installMaterialDeliveredAt !== null,
      reconciliationEndpointAvailable: row.providerState === 'provider_completed',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'unauthorized' }, 401);
    if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'origin_rejected' }, 403);
    return json({ error: 'status_unavailable' }, 503);
  }
}
