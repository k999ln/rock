import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { createEsimGoV25Client, EsimGoProviderError, reconcilePaidSkyEsimGoProfile } from '@/lib/esimgo-provider';
import {
  EsimPlanCatalogError,
  selectEsimOrderPricing,
} from '@/lib/esim-plan-catalog';

type Runtime = Record<string, unknown>;
type OrderRow = {
  id: string;
  buyerUserId: string;
  mode: string;
  packageKey: string;
  manifestSha256: string;
  amountMinor: number;
  currency: string;
  status: string;
  refundedMinor: number;
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } });
}

function failure(error: unknown) {
  if (error instanceof EsimPlanCatalogError) {
    if (error.code === 'CATALOG_NOT_CONFIGURED') return json({ error: 'esim_not_configured' }, 503);
    if (error.code === 'PLAN_UNAVAILABLE') return json({ error: 'plan_unavailable' }, 404);
    if (error.code === 'ORDER_NOT_ELIGIBLE') return json({ error: 'order_not_eligible' }, 409);
    return json({ error: 'plan_catalog_invalid' }, 503);
  }
  if (error instanceof EsimGoProviderError) {
    if (error.code === 'ORDER_NOT_ELIGIBLE') return json({ error: 'order_not_eligible' }, 409);
    if (error.code === 'ORDER_ALREADY_CLAIMED') return json({ error: 'order_already_claimed' }, 409);
    if (error.code === 'NOT_CONFIGURED') return json({ error: 'esim_not_configured' }, 503);
    return json({ error: 'reconciliation_unavailable' }, 503);
  }
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'unauthorized' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'origin_rejected' }, 403);
  return json({ error: 'reconciliation_unavailable' }, 503);
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const ownerUserId = await requestUser(request);
    const { orderId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: 'order_not_found' }, 404);
    const db = database();
    const order = await db.prepare(`SELECT id, buyer_user_id AS buyerUserId, mode, package_key AS packageKey,
        manifest_sha256 AS manifestSha256, amount_minor AS amountMinor, currency, status,
        refunded_minor AS refundedMinor
      FROM sky_commerce_orders WHERE id = ? AND buyer_user_id = ? AND mode = 'live' AND status = 'paid' AND refunded_minor = 0`)
      .bind(orderId, ownerUserId).first<OrderRow>();
    const config = env as Runtime & {
      ESIMGO_API_KEY?: string;
      ESIMGO_PROFILE_HASH_SECRET?: string;
      ESIMGO_INSTALL_MATERIAL_KEY?: string;
      ESIMGO_CALLBACK_DEDUPE_SECRET?: string;
      ESIMGO_PLAN_CATALOG_JSON?: string;
    };
    const pricingSnapshot = await selectEsimOrderPricing(db, config.ESIMGO_PLAN_CATALOG_JSON, order, ownerUserId);
    const plan = pricingSnapshot.plan;
    if (!config.ESIMGO_PROFILE_HASH_SECRET || config.ESIMGO_PROFILE_HASH_SECRET.length < 32 ||
        config.ESIMGO_PROFILE_HASH_SECRET === config.ESIMGO_API_KEY ||
        config.ESIMGO_PROFILE_HASH_SECRET === config.ESIMGO_CALLBACK_DEDUPE_SECRET ||
        !config.ESIMGO_INSTALL_MATERIAL_KEY || !/^[a-f0-9]{64}$/i.test(config.ESIMGO_INSTALL_MATERIAL_KEY) ||
        config.ESIMGO_INSTALL_MATERIAL_KEY === config.ESIMGO_API_KEY ||
        config.ESIMGO_INSTALL_MATERIAL_KEY === config.ESIMGO_PROFILE_HASH_SECRET ||
        config.ESIMGO_INSTALL_MATERIAL_KEY === config.ESIMGO_CALLBACK_DEDUPE_SECRET)
      return json({ error: 'esim_not_configured' }, 503);
    const result = await reconcilePaidSkyEsimGoProfile(db,
      createEsimGoV25Client(config.ESIMGO_API_KEY), {
        skyOrderId: order!.id,
        ownerUserId,
        packageKey: plan.packageKey,
        manifestSha256: plan.manifestSha256,
        providerBundleName: plan.providerBundleName,
        expectedCurrency: plan.providerCurrency,
        maximumWholesaleMinor: plan.maximumWholesaleMinor,
        pricingSnapshotJson: pricingSnapshot.canonicalJson,
        pricingSnapshotSha256: pricingSnapshot.sha256,
        retailAmountMinor: plan.retailAmountMinor,
        retailCurrency: plan.retailCurrency,
        profileHashSecret: config.ESIMGO_PROFILE_HASH_SECRET,
        installMaterialEncryptionKey: config.ESIMGO_INSTALL_MATERIAL_KEY,
        now: Date.now(),
      });
    return json({ state: result.state });
  } catch (error) {
    return failure(error);
  }
}
