import { bindEsimGoIssuedProfile, esimGoProfileDigest } from './esimgo-webhook.ts';
import { storeEsimInstallMaterial, validEsimQuickInstallUrl } from './esim-install-material.ts';
import { verifyEsimPricingSnapshot } from './esim-plan-catalog.ts';

const API_ROOT = 'https://api.esim-go.com/v2.5';
const MAX_RESPONSE_BYTES = 128 * 1024;
const ICCID_PATTERN = /^[0-9]{18,22}$/;

export type EsimGoBundleQuote = {
  bundleName: string;
  total: number;
  currency: string;
  digest: string;
};

export type EsimGoIssuedProfile = {
  iccid: string;
  matchingId: string;
  smdpAddress: string;
  profileStatus: string;
  appleInstallUrl?: string;
  androidInstallUrl?: string;
};

export type EsimGoIssuedOrder = {
  orderReference: string;
  bundleName: string;
  total: number;
  currency: string;
  profile: EsimGoIssuedProfile;
};

export class EsimGoProviderError extends Error {
  readonly code: 'NOT_CONFIGURED' | 'REQUEST_FAILED' | 'OUTCOME_UNKNOWN' | 'INVALID_RESPONSE' | 'QUOTE_CHANGED' | 'PROVIDER_DEBIT_DISABLED' | 'ORDER_NOT_ELIGIBLE' | 'ORDER_ALREADY_CLAIMED';

  constructor(code: EsimGoProviderError['code']) {
    super(code);
    this.name = 'EsimGoProviderError';
    this.code = code;
  }
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function parsePositiveTotal(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1_000_000_000
    ? value : null;
}

function validBundleName(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,128}$/.test(value);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const input = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(input).set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeQuote(bundleName: string, total: number, currency: string): string {
  return JSON.stringify({ provider: 'esim-go-v2.5', bundleName, quantity: 1, total, currency });
}

function readOrderItem(value: unknown, bundleName: string): { total: number; currency: string } | null {
  const root = object(value);
  if (!root || !Array.isArray(root.order)) return null;
  const items = root.order.map(object);
  if (items.length !== 1 || !items[0] || items[0].item !== bundleName || items[0].type !== 'bundle' || items[0].quantity !== 1)
    return null;
  const total = parsePositiveTotal(root.total);
  const currency = typeof root.currency === 'string' && /^[A-Z]{3}$/.test(root.currency) ? root.currency : null;
  return total !== null && currency ? { total, currency } : null;
}

function readProfile(value: unknown, bundleName: string): EsimGoIssuedProfile | null {
  const root = object(value);
  const profiles = [
    ...(root && Array.isArray(root.esims) ? root.esims.map(object) : []),
    ...(root && Array.isArray(root.order) ? root.order.flatMap((item) => {
      const row = object(item);
      if (!row || row.item !== bundleName || row.type !== 'bundle' || row.quantity !== 1) return [];
      return Array.isArray(row.esims) ? row.esims.map(object) : [];
    }) : []),
  ];
  const profile = profiles.length === 1 ? profiles[0] : null;
  const appleInstallUrl = profile && profile.appleInstallUrl !== undefined
    ? profile.appleInstallUrl : undefined;
  const androidInstallUrl = profile && profile.androidInstallUrl !== undefined
    ? profile.androidInstallUrl : undefined;
  if (!profile || typeof profile.iccid !== 'string' || !ICCID_PATTERN.test(profile.iccid) ||
      typeof profile.matchingId !== 'string' || profile.matchingId.length < 1 || profile.matchingId.length > 256 ||
      typeof profile.smdpAddress !== 'string' || profile.smdpAddress.length < 1 || profile.smdpAddress.length > 256 ||
      (appleInstallUrl !== undefined && !validEsimQuickInstallUrl(appleInstallUrl, 'appleInstallUrl')) ||
      (androidInstallUrl !== undefined && !validEsimQuickInstallUrl(androidInstallUrl, 'androidInstallUrl')) ||
      (profile.type !== undefined && profile.type !== 'bundle') ||
      (profile.item !== undefined && profile.item !== bundleName)) return null;
  return {
    iccid: profile.iccid,
    matchingId: profile.matchingId,
    smdpAddress: profile.smdpAddress,
    profileStatus: typeof profile.profileStatus === 'string' && profile.profileStatus.length <= 64
      ? profile.profileStatus : 'unknown',
    ...(typeof appleInstallUrl === 'string' ? { appleInstallUrl } : {}),
    ...(typeof androidInstallUrl === 'string' ? { androidInstallUrl } : {}),
  };
}

export function createEsimGoV25Client(
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch,
) {
  const configuredApiKey = apiKey ?? '';
  if (configuredApiKey.length === 0 || configuredApiKey.length > 512) throw new EsimGoProviderError('NOT_CONFIGURED');

  async function request(path: string, init: RequestInit = {}, transaction = false): Promise<unknown> {
    const headers = new Headers(init.headers);
    headers.set('X-API-Key', configuredApiKey);
    headers.set('Accept', 'application/json');
    if (init.body) headers.set('Content-Type', 'application/json');
    let response: Response;
    try {
      response = await fetcher(`${API_ROOT}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new EsimGoProviderError(transaction ? 'OUTCOME_UNKNOWN' : 'REQUEST_FAILED');
    }
    const raw = new Uint8Array(await response.arrayBuffer());
    if (raw.byteLength > MAX_RESPONSE_BYTES)
      throw new EsimGoProviderError(transaction ? 'OUTCOME_UNKNOWN' : 'INVALID_RESPONSE');
    if (!response.ok)
      throw new EsimGoProviderError(transaction ? 'OUTCOME_UNKNOWN' : 'REQUEST_FAILED');
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    } catch {
      throw new EsimGoProviderError(transaction ? 'OUTCOME_UNKNOWN' : 'INVALID_RESPONSE');
    }
  }

  return {
    async validateNewProfile(bundleName: string): Promise<EsimGoBundleQuote> {
      if (!validBundleName(bundleName)) throw new EsimGoProviderError('INVALID_RESPONSE');
      const result = await request('/orders', {
        method: 'POST',
        body: JSON.stringify({
          type: 'validate',
          assign: true,
          order: [{ type: 'bundle', quantity: 1, item: bundleName, allowReassign: false }],
        }),
      });
      const item = readOrderItem(result, bundleName);
      const root = object(result);
      if (!item || root?.valid !== true) throw new EsimGoProviderError('INVALID_RESPONSE');
      const digest = await sha256(normalizeQuote(bundleName, item.total, item.currency));
      return { bundleName, total: item.total, currency: item.currency, digest };
    },

    /** One provider debit attempt. This method intentionally never retries. */
    async transactNewProfile(quote: EsimGoBundleQuote, confirmedQuoteDigest: string): Promise<EsimGoIssuedOrder> {
      if (!validBundleName(quote.bundleName) || !/^[a-f0-9]{64}$/.test(quote.digest) ||
          quote.digest !== confirmedQuoteDigest ||
          await sha256(normalizeQuote(quote.bundleName, quote.total, quote.currency)) !== quote.digest)
        throw new EsimGoProviderError('QUOTE_CHANGED');
      let result: unknown;
      try {
        result = await request('/orders', {
          method: 'POST',
          body: JSON.stringify({
            type: 'transaction',
            assign: true,
            order: [{ type: 'bundle', quantity: 1, item: quote.bundleName, allowReassign: false }],
          }),
        }, true);
      } catch (error) {
        if (error instanceof EsimGoProviderError && error.code === 'QUOTE_CHANGED') throw error;
        throw new EsimGoProviderError('OUTCOME_UNKNOWN');
      }
      const root = object(result);
      const item = readOrderItem(result, quote.bundleName);
      const orderReference = root?.orderReference;
      const profile = readProfile(result, quote.bundleName);
      if (!item || !profile || typeof orderReference !== 'string' ||
          orderReference.length < 1 || orderReference.length > 256 ||
          root?.status !== 'completed' || item.total !== quote.total || item.currency !== quote.currency)
        throw new EsimGoProviderError('OUTCOME_UNKNOWN');
      return { orderReference, bundleName: quote.bundleName, total: item.total, currency: item.currency, profile };
    },

    async readOrder(orderReference: string): Promise<unknown> {
      if (!orderReference || orderReference.length > 256) throw new EsimGoProviderError('INVALID_RESPONSE');
      return request(`/orders/${encodeURIComponent(orderReference)}`);
    },

    async readInstallAssignments(orderReference: string, includeQuickInstallUrls = false): Promise<unknown> {
      if (!orderReference || orderReference.length > 256) throw new EsimGoProviderError('INVALID_RESPONSE');
      const query = new URLSearchParams({ reference: orderReference });
      if (includeQuickInstallUrls) query.set('additionalFields', 'installUrl');
      return request(`/esims/assignments?${query.toString()}`);
    },
  };
}

type ProviderOrderRow = {
  skyOrderId: string;
  ownerUserId: string;
  packageKey: string;
  manifestSha256: string;
  pricingSnapshotJson: string;
  pricingSnapshotSha256: string;
  providerBundleName: string;
  quoteDigest: string;
  quoteTotal: string;
  quoteCurrency: string;
  state: string;
  providerOrderReference: string | null;
  profileDigest: string | null;
  installMaterialCiphertext: string | null;
  installMaterialNonce: string | null;
  installMaterialDeliveryKeyHash: string | null;
  installMaterialDeliveredAt: number | null;
};

type ProviderOrderInput = {
  skyOrderId: string;
  ownerUserId: string;
  packageKey: string;
  manifestSha256: string;
  pricingSnapshotJson: string;
  pricingSnapshotSha256: string;
  retailAmountMinor: number;
  retailCurrency: string;
  quote: EsimGoBundleQuote;
  maximumWholesaleMinor: number;
  now: number;
};

type D1Store = Pick<D1Database, 'prepare'>;

function amountMinor(total: number, currency: string): number | null {
  const exponent = new Map<string, number>([
    ['JPY', 0], ['KRW', 0], ['USD', 2], ['EUR', 2], ['GBP', 2], ['CAD', 2], ['AUD', 2], ['KWD', 3],
  ]).get(currency);
  if (exponent === undefined || !Number.isFinite(total) || total <= 0) return null;
  const raw = String(total);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match || (match[2]?.length ?? 0) > exponent) return null;
  const fraction = (match[2] ?? '').padEnd(exponent, '0');
  const units = BigInt(match[1]) * BigInt(10) ** BigInt(exponent) + BigInt(fraction || '0');
  return units <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(units) : null;
}

async function claimPaidOrder(db: D1Store, input: ProviderOrderInput): Promise<{ row: ProviderOrderRow; newlyClaimed: boolean }> {
  const minor = amountMinor(input.quote.total, input.quote.currency);
  const pricing = await verifyEsimPricingSnapshot(input.pricingSnapshotJson, input.pricingSnapshotSha256);
  const plan = pricing.plan;
  const convertedWholesale = minor === null ? null :
    (BigInt(minor) * BigInt(plan.providerMinorToRetailNumerator) +
      BigInt(plan.providerMinorToRetailDenominator) - BigInt(1)) /
      BigInt(plan.providerMinorToRetailDenominator);
  if (!validBundleName(input.quote.bundleName) || !/^[a-f0-9]{64}$/.test(input.quote.digest) ||
      minor === null || !Number.isSafeInteger(input.maximumWholesaleMinor) || input.maximumWholesaleMinor < 0 ||
      minor > input.maximumWholesaleMinor || input.maximumWholesaleMinor !== plan.maximumWholesaleMinor ||
      input.quote.bundleName !== plan.providerBundleName || input.quote.currency !== plan.providerCurrency ||
      input.retailAmountMinor !== plan.retailAmountMinor || input.retailCurrency !== plan.retailCurrency ||
      convertedWholesale === null || convertedWholesale + BigInt(plan.providerFeeReserveRetailMinor) +
        BigInt(plan.minimumGrossMarginRetailMinor) > BigInt(plan.retailAmountMinor) ||
      !Number.isSafeInteger(input.now) || input.now < 0 ||
      !/^[A-Za-z0-9._:-]{1,160}$/.test(input.packageKey) || !/^[a-f0-9]{64}$/.test(input.manifestSha256) ||
      !input.ownerUserId || input.ownerUserId.length > 128 || !input.skyOrderId || input.skyOrderId.length > 128)
    throw new EsimGoProviderError('INVALID_RESPONSE');
  if (await sha256(normalizeQuote(input.quote.bundleName, input.quote.total, input.quote.currency)) !== input.quote.digest)
    throw new EsimGoProviderError('QUOTE_CHANGED');

  const inserted = await db.prepare(`
    INSERT OR IGNORE INTO esim_provider_orders
      (sky_order_id, provider, owner_user_id, package_key, manifest_sha256,
       pricing_snapshot_json, pricing_snapshot_sha256,
       provider_bundle_name, quote_digest, quote_total, quote_currency, state, created_at, updated_at)
    SELECT o.id, 'esim-go-v3', o.buyer_user_id, o.package_key, o.manifest_sha256,
      ?, ?, ?, ?, ?, ?, 'dispatch_started', ?, ?
    FROM sky_commerce_orders o
    WHERE o.id = ? AND o.buyer_user_id = ? AND o.mode = 'live' AND o.status = 'paid'
      AND o.package_key = ? AND o.manifest_sha256 = ? AND o.refunded_minor = 0
      AND o.amount_minor = ? AND o.currency = ?
      AND EXISTS (
        SELECT 1 FROM sky_tool_packages p
        WHERE p.package_key = o.package_key AND p.manifest_sha256 = o.manifest_sha256 AND p.status = 'verified'
          AND EXISTS (SELECT 1 FROM sky_tool_package_reviews r
            WHERE r.package_key = p.package_key AND r.manifest_sha256 = p.manifest_sha256
              AND r.decision = 'verified' AND (r.expires_at IS NULL OR r.expires_at > ?))
      )
  `).bind(input.pricingSnapshotJson, input.pricingSnapshotSha256,
    input.quote.bundleName, input.quote.digest, String(input.quote.total), input.quote.currency,
    input.now, input.now, input.skyOrderId, input.ownerUserId, input.packageKey, input.manifestSha256,
    input.retailAmountMinor, input.retailCurrency, input.now).run();
  const row = await db.prepare(`SELECT sky_order_id AS skyOrderId, owner_user_id AS ownerUserId,
      package_key AS packageKey, manifest_sha256 AS manifestSha256,
      pricing_snapshot_json AS pricingSnapshotJson, pricing_snapshot_sha256 AS pricingSnapshotSha256,
      provider_bundle_name AS providerBundleName, quote_digest AS quoteDigest,
      quote_total AS quoteTotal, quote_currency AS quoteCurrency, state,
      provider_order_reference AS providerOrderReference, profile_digest AS profileDigest,
      install_material_ciphertext AS installMaterialCiphertext,
      install_material_nonce AS installMaterialNonce,
      install_material_delivery_key_hash AS installMaterialDeliveryKeyHash,
      install_material_delivered_at AS installMaterialDeliveredAt
    FROM esim_provider_orders WHERE sky_order_id = ?`)
    .bind(input.skyOrderId).first<ProviderOrderRow>();
  if (!row) throw new EsimGoProviderError('ORDER_NOT_ELIGIBLE');
  if (row.ownerUserId !== input.ownerUserId || row.packageKey !== input.packageKey ||
      row.manifestSha256 !== input.manifestSha256 || row.pricingSnapshotJson !== input.pricingSnapshotJson ||
      row.pricingSnapshotSha256 !== input.pricingSnapshotSha256 || row.providerBundleName !== input.quote.bundleName ||
      row.quoteDigest !== input.quote.digest || row.quoteTotal !== String(input.quote.total) ||
      row.quoteCurrency !== input.quote.currency)
    throw new EsimGoProviderError('ORDER_ALREADY_CLAIMED');
  return { row, newlyClaimed: (inserted.meta?.changes ?? 0) > 0 };
}

async function markOutcomeUnknown(db: D1Store, skyOrderId: string, now: number): Promise<void> {
  await db.prepare(`UPDATE esim_provider_orders
    SET state = 'reconciliation_required', updated_at = ?
    WHERE sky_order_id = ? AND state = 'dispatch_started'`).bind(now, skyOrderId).run();
}

async function recordProviderCompletion(
  db: D1Store,
  skyOrderId: string,
  providerOrderReference: string,
  profileDigest: string,
  now: number,
): Promise<void> {
  await db.prepare(`UPDATE esim_provider_orders
    SET state = 'provider_completed', provider_order_reference = ?, profile_digest = ?, updated_at = ?
    WHERE sky_order_id = ? AND state = 'dispatch_started'`)
    .bind(providerOrderReference, profileDigest, now, skyOrderId).run();
  const row = await db.prepare(`SELECT state, provider_order_reference AS providerOrderReference,
      profile_digest AS profileDigest FROM esim_provider_orders WHERE sky_order_id = ?`)
    .bind(skyOrderId).first<{ state: string; providerOrderReference: string | null; profileDigest: string | null }>();
  if (!row || !['provider_completed', 'profile_bound'].includes(row.state) ||
      row.providerOrderReference !== providerOrderReference || row.profileDigest !== profileDigest)
    throw new EsimGoProviderError('OUTCOME_UNKNOWN');
}

async function markProfileBound(db: D1Store, skyOrderId: string, now: number): Promise<void> {
  await db.prepare(`UPDATE esim_provider_orders
    SET state = 'profile_bound', updated_at = ?
    WHERE sky_order_id = ? AND state = 'provider_completed'`).bind(now, skyOrderId).run();
  const row = await db.prepare('SELECT state FROM esim_provider_orders WHERE sky_order_id = ?')
    .bind(skyOrderId).first<{ state: string }>();
  if (row?.state !== 'profile_bound') throw new EsimGoProviderError('OUTCOME_UNKNOWN');
}

async function readExistingProviderOrder(db: D1Store, input: Omit<ProviderOrderInput, 'quote'>): Promise<ProviderOrderRow | null> {
  return db.prepare(`SELECT sky_order_id AS skyOrderId, owner_user_id AS ownerUserId,
      package_key AS packageKey, manifest_sha256 AS manifestSha256,
      pricing_snapshot_json AS pricingSnapshotJson, pricing_snapshot_sha256 AS pricingSnapshotSha256,
      provider_bundle_name AS providerBundleName, quote_digest AS quoteDigest,
      quote_total AS quoteTotal, quote_currency AS quoteCurrency, state,
      provider_order_reference AS providerOrderReference, profile_digest AS profileDigest,
      install_material_ciphertext AS installMaterialCiphertext,
      install_material_nonce AS installMaterialNonce,
      install_material_delivery_key_hash AS installMaterialDeliveryKeyHash,
      install_material_delivered_at AS installMaterialDeliveredAt
    FROM esim_provider_orders WHERE sky_order_id = ?`).bind(input.skyOrderId).first<ProviderOrderRow>();
}

function installationProfile(value: unknown): EsimGoIssuedProfile | null {
  const root = object(value);
  const profiles = Array.isArray(value) ? value.map(object)
    : root && Array.isArray(root.esims) ? root.esims.map(object)
      : root ? [root] : [];
  if (profiles.length !== 1) return null;
  const profile = profiles[0];
  const appleInstallUrl = profile?.appleInstallUrl;
  const androidInstallUrl = profile?.androidInstallUrl;
  if (!profile || typeof profile.iccid !== 'string' || !ICCID_PATTERN.test(profile.iccid) ||
      typeof profile.matchingId !== 'string' || profile.matchingId.length < 1 || profile.matchingId.length > 256 ||
      typeof profile.smdpAddress !== 'string' || profile.smdpAddress.length < 1 || profile.smdpAddress.length > 256 ||
      (appleInstallUrl !== undefined && !validEsimQuickInstallUrl(appleInstallUrl, 'appleInstallUrl')) ||
      (androidInstallUrl !== undefined && !validEsimQuickInstallUrl(androidInstallUrl, 'androidInstallUrl')))
    return null;
  return {
    iccid: profile.iccid,
    matchingId: profile.matchingId,
    smdpAddress: profile.smdpAddress,
    profileStatus: typeof profile.profileStatus === 'string' && profile.profileStatus.length <= 64 ? profile.profileStatus : 'unknown',
    ...(typeof appleInstallUrl === 'string' ? { appleInstallUrl } : {}),
    ...(typeof androidInstallUrl === 'string' ? { androidInstallUrl } : {}),
  };
}

/**
 * One-shot paid-order issue path. Provider debit stays disabled unless the
 * server operator explicitly enables it after provider contract acceptance.
 * The response intentionally contains no ICCID, matching ID or SM-DP+ data.
 */
export async function issuePaidSkyEsimGoProfile(
  db: D1Store,
  client: ReturnType<typeof createEsimGoV25Client>,
  input: Omit<ProviderOrderInput, 'quote'> & {
    profileHashSecret: string;
    installMaterialEncryptionKey: string;
    providerDebitEnabled: boolean;
    providerBundleName: string;
    expectedCurrency: string;
    retailAmountMinor: number;
    retailCurrency: string;
    pricingSnapshotJson: string;
    pricingSnapshotSha256: string;
  },
): Promise<{ state: 'profile_bound' | 'already_claimed' | 'reconciliation_required' | 'provider_completed'; providerOrderReference?: string }> {
  if (input.providerDebitEnabled !== true) throw new EsimGoProviderError('PROVIDER_DEBIT_DISABLED');
  if (!validBundleName(input.providerBundleName) || !/^[A-Z]{3}$/.test(input.expectedCurrency))
    throw new EsimGoProviderError('INVALID_RESPONSE');
  const pricing = await verifyEsimPricingSnapshot(input.pricingSnapshotJson, input.pricingSnapshotSha256);
  if (pricing.plan.providerBundleName !== input.providerBundleName ||
      pricing.plan.providerCurrency !== input.expectedCurrency ||
      pricing.plan.maximumWholesaleMinor !== input.maximumWholesaleMinor ||
      pricing.plan.retailAmountMinor !== input.retailAmountMinor ||
      pricing.plan.retailCurrency !== input.retailCurrency)
    throw new EsimGoProviderError('QUOTE_CHANGED');
  const existing = await readExistingProviderOrder(db, input);
  if (existing) {
    if (existing.ownerUserId !== input.ownerUserId || existing.packageKey !== input.packageKey ||
        existing.manifestSha256 !== input.manifestSha256 || existing.pricingSnapshotJson !== input.pricingSnapshotJson ||
        existing.pricingSnapshotSha256 !== input.pricingSnapshotSha256 || existing.providerBundleName !== input.providerBundleName)
      throw new EsimGoProviderError('ORDER_ALREADY_CLAIMED');
    if (existing.state === 'profile_bound')
      return { state: 'profile_bound', providerOrderReference: existing.providerOrderReference ?? undefined };
    if (existing.state === 'provider_completed' && existing.providerOrderReference && existing.profileDigest) {
      try {
        const profile = installationProfile(await client.readInstallAssignments(existing.providerOrderReference, true));
        if (profile && await esimGoProfileDigest(profile.iccid, input.profileHashSecret) === existing.profileDigest) {
          await storeEsimInstallMaterial(db, profile, input.installMaterialEncryptionKey,
            input.ownerUserId, input.skyOrderId, input.now);
          await bindEsimGoIssuedProfile(db, {
            iccid: profile.iccid,
            profileHashSecret: input.profileHashSecret,
            ownerUserId: input.ownerUserId,
            skyOrderId: input.skyOrderId,
            packageKey: input.packageKey,
            manifestSha256: input.manifestSha256,
            createdAt: input.now,
          });
          await markProfileBound(db, input.skyOrderId, input.now);
          return { state: 'profile_bound', providerOrderReference: existing.providerOrderReference };
        }
      } catch {
        // Keep the completed provider result and permit a later read-only retry.
      }
      return { state: 'provider_completed', providerOrderReference: existing.providerOrderReference };
    }
    return { state: 'already_claimed' };
  }
  const quote = await client.validateNewProfile(input.providerBundleName);
  const quotedMinor = amountMinor(quote.total, quote.currency);
  if (quote.currency !== input.expectedCurrency || quotedMinor === null ||
      quotedMinor > input.maximumWholesaleMinor)
    throw new EsimGoProviderError('QUOTE_CHANGED');
  const claim = await claimPaidOrder(db, { ...input, quote });
  const row = claim.row;
  const newlyClaimed = claim.newlyClaimed;
  if (!newlyClaimed) {
    if (row.state === 'profile_bound') return { state: 'profile_bound', providerOrderReference: row.providerOrderReference ?? undefined };
    if (row.state === 'provider_completed') return { state: 'provider_completed', providerOrderReference: row.providerOrderReference ?? undefined };
    return { state: 'already_claimed' };
  }

  let issued: EsimGoIssuedOrder;
  try {
    issued = await client.transactNewProfile(quote, quote.digest);
  } catch (error) {
    await markOutcomeUnknown(db, input.skyOrderId, input.now);
    if (error instanceof EsimGoProviderError && error.code === 'QUOTE_CHANGED') throw error;
    return { state: 'reconciliation_required' };
  }

  let profileDigest: string;
  try {
    profileDigest = await esimGoProfileDigest(issued.profile.iccid, input.profileHashSecret);
    await recordProviderCompletion(db, input.skyOrderId, issued.orderReference, profileDigest, input.now);
    let installProfile = issued.profile;
    try {
      const assignment = installationProfile(await client.readInstallAssignments(issued.orderReference, true));
      if (assignment && assignment.iccid === issued.profile.iccid &&
          await esimGoProfileDigest(assignment.iccid, input.profileHashSecret) === profileDigest) {
        installProfile = {
          ...issued.profile,
          ...(assignment.appleInstallUrl ? { appleInstallUrl: assignment.appleInstallUrl } : {}),
          ...(assignment.androidInstallUrl ? { androidInstallUrl: assignment.androidInstallUrl } : {}),
        };
      }
    } catch {
      // Quick-install URLs are an optional convenience. Keep the verified
      // activation material so the owner can use the QR/LPA fallback.
    }
    await storeEsimInstallMaterial(db, installProfile, input.installMaterialEncryptionKey,
      input.ownerUserId, input.skyOrderId, input.now);
  } catch {
    return { state: 'provider_completed' };
  }

  try {
    await bindEsimGoIssuedProfile(db, {
      iccid: issued.profile.iccid,
      profileHashSecret: input.profileHashSecret,
      ownerUserId: input.ownerUserId,
      skyOrderId: input.skyOrderId,
      packageKey: input.packageKey,
      manifestSha256: input.manifestSha256,
      createdAt: input.now,
    });
    await markProfileBound(db, input.skyOrderId, input.now);
    return { state: 'profile_bound', providerOrderReference: issued.orderReference };
  } catch {
    // Provider completed. Retain that fact so a local retry can resume binding
    // without repeating the provider transaction.
    return { state: 'provider_completed', providerOrderReference: issued.orderReference };
  }
}

/**
 * Read-only recovery for an order whose provider transaction is already known
 * to have completed. This function never validates or creates a new provider
 * order; it only confirms the persisted order reference and assignment before
 * resuming local profile binding.
 */
export async function reconcilePaidSkyEsimGoProfile(
  db: D1Store,
  client: ReturnType<typeof createEsimGoV25Client>,
  input: Omit<ProviderOrderInput, 'quote'> & {
    profileHashSecret: string;
    installMaterialEncryptionKey: string;
    providerBundleName: string;
    expectedCurrency: string;
  },
): Promise<{ state: 'profile_bound' | 'provider_completed' | 'reconciliation_required' | 'not_reconcilable' }> {
  if (!validBundleName(input.providerBundleName) || !/^[A-Z]{3}$/.test(input.expectedCurrency))
    throw new EsimGoProviderError('INVALID_RESPONSE');
  const pricing = await verifyEsimPricingSnapshot(input.pricingSnapshotJson, input.pricingSnapshotSha256);
  if (pricing.plan.providerBundleName !== input.providerBundleName ||
      pricing.plan.providerCurrency !== input.expectedCurrency ||
      pricing.plan.maximumWholesaleMinor !== input.maximumWholesaleMinor ||
      pricing.plan.retailAmountMinor !== input.retailAmountMinor ||
      pricing.plan.retailCurrency !== input.retailCurrency)
    throw new EsimGoProviderError('QUOTE_CHANGED');
  const existing = await readExistingProviderOrder(db, input);
  if (!existing) throw new EsimGoProviderError('ORDER_NOT_ELIGIBLE');
  if (existing.ownerUserId !== input.ownerUserId || existing.packageKey !== input.packageKey ||
      existing.manifestSha256 !== input.manifestSha256 || existing.pricingSnapshotJson !== input.pricingSnapshotJson ||
      existing.pricingSnapshotSha256 !== input.pricingSnapshotSha256 || existing.providerBundleName !== input.providerBundleName)
    throw new EsimGoProviderError('ORDER_ALREADY_CLAIMED');
  if (existing.state === 'profile_bound') return { state: 'profile_bound' };
  if (existing.state !== 'provider_completed' || !existing.providerOrderReference || !existing.profileDigest)
    return { state: existing.state === 'reconciliation_required' ? 'reconciliation_required' : 'not_reconcilable' };

  try {
    const orderValue = await client.readOrder(existing.providerOrderReference);
    const order = object(orderValue);
    const quote = readOrderItem(orderValue, input.providerBundleName);
    const profile = readProfile(orderValue, input.providerBundleName);
    if (!order || order.status !== 'completed' || order.orderReference !== existing.providerOrderReference ||
        !quote || quote.currency !== input.expectedCurrency || quote.currency !== existing.quoteCurrency ||
        String(quote.total) !== existing.quoteTotal || !profile)
      return { state: 'provider_completed' };
    const assignment = installationProfile(await client.readInstallAssignments(existing.providerOrderReference, true));
    if (!assignment || await esimGoProfileDigest(assignment.iccid, input.profileHashSecret) !== existing.profileDigest ||
        assignment.iccid !== profile.iccid)
      return { state: 'provider_completed' };
    await storeEsimInstallMaterial(db, assignment, input.installMaterialEncryptionKey,
      input.ownerUserId, input.skyOrderId, input.now);
    await bindEsimGoIssuedProfile(db, {
      iccid: assignment.iccid,
      profileHashSecret: input.profileHashSecret,
      ownerUserId: input.ownerUserId,
      skyOrderId: input.skyOrderId,
      packageKey: input.packageKey,
      manifestSha256: input.manifestSha256,
      createdAt: input.now,
    });
    await markProfileBound(db, input.skyOrderId, input.now);
    return { state: 'profile_bound' };
  } catch {
    // Reconciliation is read-only toward the provider. Preserve provider_completed
    // and let a later poll retry; never turn a failed read into a new debit.
    return { state: 'provider_completed' };
  }
}
