export type EsimServerPlan = {
  packageKey: string;
  manifestSha256: string;
  providerBundleName: string;
  providerCurrency: string;
  maximumWholesaleMinor: number;
  retailCurrency: string;
  retailAmountMinor: number;
  providerMinorToRetailNumerator: number;
  providerMinorToRetailDenominator: number;
  providerFeeReserveRetailMinor: number;
  minimumGrossMarginRetailMinor: number;
};

export type EsimServerPlanCatalog = {
  version: string;
  plans: EsimServerPlan[];
};

export type EsimPricingSnapshot = {
  catalogVersion: string;
  plan: EsimServerPlan;
};

export type HashedEsimPricingSnapshot = EsimPricingSnapshot & {
  canonicalJson: string;
  sha256: string;
};

export type SkyEsimOrder = {
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

export class EsimPlanCatalogError extends Error {
  readonly code: 'CATALOG_NOT_CONFIGURED' | 'CATALOG_INVALID' | 'PLAN_UNAVAILABLE' | 'ORDER_NOT_ELIGIBLE';

  constructor(code: EsimPlanCatalogError['code']) {
    super(code);
    this.name = 'EsimPlanCatalogError';
    this.code = code;
  }
}

const CATALOG_LIMIT = 16 * 1024;
const PACKAGE_KEY = /^[A-Za-z0-9._:-]{1,160}$/;
const HASH = /^[a-f0-9]{64}$/;
const BUNDLE = /^[A-Za-z0-9._-]{1,128}$/;
const CURRENCY = /^[A-Z]{3}$/;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validMinor(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function parseEsimServerPlanCatalog(raw: string | undefined): EsimServerPlanCatalog {
  if (!raw) throw new EsimPlanCatalogError('CATALOG_NOT_CONFIGURED');
  if (raw.length > CATALOG_LIMIT) throw new EsimPlanCatalogError('CATALOG_INVALID');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EsimPlanCatalogError('CATALOG_INVALID');
  }
  const root = object(parsed);
  if (!root || Object.keys(root).length !== 2 || typeof root.version !== 'string' ||
      !/^[A-Za-z0-9._-]{1,64}$/.test(root.version) || !Array.isArray(root.plans) ||
      root.plans.length < 1 || root.plans.length > 100)
    throw new EsimPlanCatalogError('CATALOG_INVALID');
  const seen = new Set<string>();
  const plans: EsimServerPlan[] = [];
  for (const item of root.plans) {
    const plan = object(item);
    if (!plan || Object.keys(plan).length !== 11 ||
        typeof plan.packageKey !== 'string' || !PACKAGE_KEY.test(plan.packageKey) ||
        typeof plan.manifestSha256 !== 'string' || !HASH.test(plan.manifestSha256) ||
        typeof plan.providerBundleName !== 'string' || !BUNDLE.test(plan.providerBundleName) ||
        typeof plan.providerCurrency !== 'string' || !CURRENCY.test(plan.providerCurrency) ||
        !validMinor(plan.maximumWholesaleMinor) || plan.maximumWholesaleMinor < 1 ||
        typeof plan.retailCurrency !== 'string' || !/^[a-z]{3}$/.test(plan.retailCurrency) ||
        !validMinor(plan.retailAmountMinor) || plan.retailAmountMinor < 1 ||
        !validMinor(plan.providerMinorToRetailNumerator) || plan.providerMinorToRetailNumerator < 1 ||
        !validMinor(plan.providerMinorToRetailDenominator) || plan.providerMinorToRetailDenominator < 1 ||
        !validMinor(plan.providerFeeReserveRetailMinor) ||
        !validMinor(plan.minimumGrossMarginRetailMinor))
      throw new EsimPlanCatalogError('CATALOG_INVALID');
    const convertedWholesale = (BigInt(plan.maximumWholesaleMinor) * BigInt(plan.providerMinorToRetailNumerator) +
      BigInt(plan.providerMinorToRetailDenominator) - BigInt(1)) / BigInt(plan.providerMinorToRetailDenominator);
    if (convertedWholesale + BigInt(plan.providerFeeReserveRetailMinor) +
        BigInt(plan.minimumGrossMarginRetailMinor) > BigInt(plan.retailAmountMinor))
      throw new EsimPlanCatalogError('CATALOG_INVALID');
    const key = `${plan.packageKey}:${plan.manifestSha256}`;
    if (seen.has(key)) throw new EsimPlanCatalogError('CATALOG_INVALID');
    seen.add(key);
    plans.push({
      packageKey: plan.packageKey,
      manifestSha256: plan.manifestSha256,
      providerBundleName: plan.providerBundleName,
      providerCurrency: plan.providerCurrency,
      maximumWholesaleMinor: plan.maximumWholesaleMinor,
      retailCurrency: plan.retailCurrency,
      retailAmountMinor: plan.retailAmountMinor,
      providerMinorToRetailNumerator: plan.providerMinorToRetailNumerator,
      providerMinorToRetailDenominator: plan.providerMinorToRetailDenominator,
      providerFeeReserveRetailMinor: plan.providerFeeReserveRetailMinor,
      minimumGrossMarginRetailMinor: plan.minimumGrossMarginRetailMinor,
    });
  }
  return { version: root.version, plans };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const input = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(input).set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createEsimPricingSnapshot(
  catalog: EsimServerPlanCatalog,
  plan: EsimServerPlan,
): Promise<HashedEsimPricingSnapshot> {
  const selected = catalog.plans.find((entry) => entry.packageKey === plan.packageKey &&
    entry.manifestSha256 === plan.manifestSha256);
  if (!selected || JSON.stringify(selected) !== JSON.stringify(plan))
    throw new EsimPlanCatalogError('PLAN_UNAVAILABLE');
  const snapshot = { catalogVersion: catalog.version, plan: selected };
  const canonicalJson = JSON.stringify(snapshot);
  return { ...snapshot, canonicalJson, sha256: await sha256(canonicalJson) };
}

export async function verifyEsimPricingSnapshot(
  canonicalJson: string,
  expectedSha256: string,
): Promise<EsimPricingSnapshot> {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256) || canonicalJson.length > CATALOG_LIMIT)
    throw new EsimPlanCatalogError('CATALOG_INVALID');
  let value: unknown;
  try {
    value = JSON.parse(canonicalJson);
  } catch {
    throw new EsimPlanCatalogError('CATALOG_INVALID');
  }
  const root = object(value);
  if (!root || Object.keys(root).length !== 2 || typeof root.catalogVersion !== 'string' ||
      !/^[A-Za-z0-9._-]{1,64}$/.test(root.catalogVersion))
    throw new EsimPlanCatalogError('CATALOG_INVALID');
  const catalog = parseEsimServerPlanCatalog(JSON.stringify({ version: root.catalogVersion, plans: [root.plan] }));
  const canonical = JSON.stringify({ catalogVersion: catalog.version, plan: catalog.plans[0] });
  if (canonical !== canonicalJson || await sha256(canonical) !== expectedSha256)
    throw new EsimPlanCatalogError('CATALOG_INVALID');
  return { catalogVersion: catalog.version, plan: catalog.plans[0] };
}

export function selectEligibleEsimPlan(
  catalog: EsimServerPlanCatalog,
  order: SkyEsimOrder | null,
  ownerUserId: string,
): EsimServerPlan {
  if (!order || order.buyerUserId !== ownerUserId || order.mode !== 'live' ||
      order.status !== 'paid' || order.refundedMinor !== 0)
    throw new EsimPlanCatalogError('ORDER_NOT_ELIGIBLE');
  const plan = catalog.plans.find((entry) => entry.packageKey === order.packageKey &&
    entry.manifestSha256 === order.manifestSha256);
  if (!plan) throw new EsimPlanCatalogError('PLAN_UNAVAILABLE');
  if (order.amountMinor !== plan.retailAmountMinor || order.currency !== plan.retailCurrency)
    throw new EsimPlanCatalogError('ORDER_NOT_ELIGIBLE');
  return plan;
}

/**
 * Reuse the order's immutable commercial snapshot on every retry. The current
 * catalog selects only a first issue attempt; later catalog edits must not
 * silently change an already purchased plan's provider bundle or margin terms.
 */
export async function selectEsimOrderPricing(
  db: Pick<D1Database, 'prepare'>,
  currentCatalogJson: string | undefined,
  order: SkyEsimOrder | null,
  ownerUserId: string,
): Promise<HashedEsimPricingSnapshot> {
  if (!order || order.buyerUserId !== ownerUserId || order.mode !== 'live' ||
      order.status !== 'paid' || order.refundedMinor !== 0)
    throw new EsimPlanCatalogError('ORDER_NOT_ELIGIBLE');
  const persisted = await db.prepare(`SELECT pricing_snapshot_json AS canonicalJson,
      pricing_snapshot_sha256 AS sha256
    FROM esim_provider_orders WHERE sky_order_id = ? AND owner_user_id = ?`)
    .bind(order.id, ownerUserId).first<{ canonicalJson: string; sha256: string }>();
  if (!persisted) {
    const catalog = parseEsimServerPlanCatalog(currentCatalogJson);
    const plan = selectEligibleEsimPlan(catalog, order, ownerUserId);
    return createEsimPricingSnapshot(catalog, plan);
  }
  const snapshot = await verifyEsimPricingSnapshot(persisted.canonicalJson, persisted.sha256);
  const plan = snapshot.plan;
  if (plan.packageKey !== order.packageKey || plan.manifestSha256 !== order.manifestSha256 ||
      plan.retailAmountMinor !== order.amountMinor || plan.retailCurrency !== order.currency)
    throw new EsimPlanCatalogError('ORDER_NOT_ELIGIBLE');
  return { ...snapshot, canonicalJson: persisted.canonicalJson, sha256: persisted.sha256 };
}
