import {
  createEsimGoV25Client,
  reconcilePaidSkyEsimGoProfile,
} from './esimgo-provider.ts';
import { verifyEsimPricingSnapshot } from './esim-plan-catalog.ts';

type ReconcileRow = {
  skyOrderId: string;
  ownerUserId: string;
  mode: string;
  orderStatus: string;
  refundedMinor: number;
  packageKey: string;
  manifestSha256: string;
  amountMinor: number;
  retailCurrency: string;
  pricingSnapshotJson: string;
  pricingSnapshotSha256: string;
  providerBundleName: string;
  providerOrderReference: string | null;
};

type D1ScanStore = Pick<D1Database, 'prepare'>;
type ProviderConfig = {
  apiKey?: string;
  profileHashSecret?: string;
  installMaterialEncryptionKey?: string;
};

const BATCH_LIMIT = 10;

type CallbackCorrelationRow = {
  callbackDigest: string;
  profileDigest: string;
  skyOrderId: string;
  ownerUserId: string;
};

function configured(config: ProviderConfig): config is Required<ProviderConfig> {
  return typeof config.apiKey === 'string' && config.apiKey.length > 0 && config.apiKey.length <= 512 &&
    typeof config.profileHashSecret === 'string' && config.profileHashSecret.length >= 32 &&
    typeof config.installMaterialEncryptionKey === 'string' && /^[a-f0-9]{64}$/i.test(config.installMaterialEncryptionKey) &&
    config.apiKey !== config.profileHashSecret && config.apiKey !== config.installMaterialEncryptionKey &&
    config.profileHashSecret !== config.installMaterialEncryptionKey;
}

/**
 * Scheduled, bounded, read-only provider recovery. Only already-known provider
 * order references are polled. A transaction with an unknown outcome and no
 * reference is intentionally excluded and never reissued by this scanner.
 */
export async function reconcileKnownEsimProviderOrders(
  db: D1ScanStore,
  config: ProviderConfig,
  now: number,
): Promise<{ scanned: number; bound: number; pending: number; callbacksLinked: number }> {
  if (!configured(config) || !Number.isSafeInteger(now) || now < 0)
    return { scanned: 0, bound: 0, pending: 0, callbacksLinked: 0 };
  // A webhook is only a wake-up hint. Correlate it to an already known,
  // provider-completed order by the keyed profile digest; provider GETs below
  // remain the authority before any install material is accepted.
  const callbacks = await db.prepare(`SELECT i.callback_digest AS callbackDigest,
      i.profile_digest AS profileDigest, p.sky_order_id AS skyOrderId,
      p.owner_user_id AS ownerUserId
    FROM esim_provider_webhook_inbox i
    JOIN esim_provider_orders p ON p.profile_digest = i.profile_digest
      AND p.provider = i.provider AND p.state = 'provider_completed'
    JOIN sky_commerce_orders o ON o.id = p.sky_order_id
      AND o.buyer_user_id = p.owner_user_id
    WHERE i.provider = 'esim-go-v3' AND i.state = 'received'
      AND i.profile_digest IS NOT NULL AND i.owner_user_id IS NULL AND i.sky_order_id IS NULL
      AND p.provider_order_reference IS NOT NULL
      AND o.mode = 'live' AND o.status = 'paid' AND o.refunded_minor = 0
    GROUP BY i.callback_digest, i.profile_digest
    HAVING COUNT(DISTINCT p.sky_order_id) = 1
    ORDER BY MIN(i.received_at) ASC LIMIT ${BATCH_LIMIT}`)
    .all<CallbackCorrelationRow>();
  let callbacksLinked = 0;
  for (const callback of callbacks.results ?? []) {
    const linked = await db.prepare(`UPDATE esim_provider_webhook_inbox
      SET owner_user_id = ?, sky_order_id = ?, state = 'reconciliation_required'
      WHERE callback_digest = ? AND profile_digest = ? AND state = 'received'
        AND owner_user_id IS NULL AND sky_order_id IS NULL
        AND EXISTS (
          SELECT 1 FROM esim_provider_orders p
          JOIN sky_commerce_orders o ON o.id = p.sky_order_id
            AND o.buyer_user_id = p.owner_user_id
          WHERE p.provider = 'esim-go-v3' AND p.state = 'provider_completed'
            AND p.provider_order_reference IS NOT NULL AND p.profile_digest = ?
            AND p.sky_order_id = ? AND p.owner_user_id = ?
            AND o.mode = 'live' AND o.status = 'paid' AND o.refunded_minor = 0
        )`).bind(callback.ownerUserId, callback.skyOrderId,
      callback.callbackDigest, callback.profileDigest, callback.profileDigest,
      callback.skyOrderId, callback.ownerUserId).run();
    callbacksLinked += linked.meta?.changes ?? 0;
  }
  const result = await db.prepare(`SELECT p.sky_order_id AS skyOrderId,
      p.owner_user_id AS ownerUserId, o.mode, o.status AS orderStatus,
      o.refunded_minor AS refundedMinor, o.package_key AS packageKey,
      o.manifest_sha256 AS manifestSha256, o.amount_minor AS amountMinor,
      o.currency AS retailCurrency, p.pricing_snapshot_json AS pricingSnapshotJson,
      p.pricing_snapshot_sha256 AS pricingSnapshotSha256,
      p.provider_bundle_name AS providerBundleName,
      p.provider_order_reference AS providerOrderReference
    FROM esim_provider_orders p
    JOIN sky_commerce_orders o ON o.id = p.sky_order_id AND o.buyer_user_id = p.owner_user_id
    WHERE p.provider = 'esim-go-v3' AND p.state = 'provider_completed'
      AND p.provider_order_reference IS NOT NULL
      AND o.mode = 'live' AND o.status = 'paid' AND o.refunded_minor = 0
    ORDER BY p.updated_at ASC LIMIT ${BATCH_LIMIT}`)
    .all<ReconcileRow>();
  const rows = result.results ?? [];
  const client = createEsimGoV25Client(config.apiKey);
  let bound = 0;
  let pending = 0;
  for (const row of rows) {
    try {
      if (!row.providerOrderReference) continue;
      const snapshot = await verifyEsimPricingSnapshot(
        row.pricingSnapshotJson,
        row.pricingSnapshotSha256,
      );
      const plan = snapshot.plan;
      if (plan.packageKey !== row.packageKey || plan.manifestSha256 !== row.manifestSha256 ||
          plan.providerBundleName !== row.providerBundleName || plan.retailAmountMinor !== row.amountMinor ||
          plan.retailCurrency !== row.retailCurrency)
        continue;
      const outcome = await reconcilePaidSkyEsimGoProfile(db, client, {
        skyOrderId: row.skyOrderId,
        ownerUserId: row.ownerUserId,
        packageKey: row.packageKey,
        manifestSha256: row.manifestSha256,
        pricingSnapshotJson: row.pricingSnapshotJson,
        pricingSnapshotSha256: row.pricingSnapshotSha256,
        retailAmountMinor: plan.retailAmountMinor,
        retailCurrency: plan.retailCurrency,
        maximumWholesaleMinor: plan.maximumWholesaleMinor,
        providerBundleName: plan.providerBundleName,
        expectedCurrency: plan.providerCurrency,
        profileHashSecret: config.profileHashSecret,
        installMaterialEncryptionKey: config.installMaterialEncryptionKey,
        now,
      });
      if (outcome.state === 'profile_bound') bound++;
      else pending++;
    } catch {
      pending++;
    }
  }
  return { scanned: rows.length, bound, pending, callbacksLinked };
}
