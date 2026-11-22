export const ESIM_INSTALL_RECEIPT_SCHEMA = 'rock-esim-install-receipt/1' as const;
const DOMAIN = new TextEncoder().encode('rock-esim-install-receipt-signature/1\0');
const MAX_RECEIPT_LIFETIME_MS = 5 * 60_000;

export type EsimInstallReceipt = {
  schema: typeof ESIM_INSTALL_RECEIPT_SCHEMA;
  issuerId: string;
  keyId: string;
  ownerUserId: string;
  orderId: string;
  profileDigest: string;
  challengeId: string;
  challengeNonceSha256: string;
  deviceRef: string;
  installState: 'installed_enabled';
  evidenceSource: 'carrier_privileged' | 'oem_euicc_controller';
  observedAt: number;
  expiresAt: number;
  signature: string;
};

export type EsimInstallReceiptContext = {
  ownerUserId: string;
  orderId: string;
  profileDigest: string;
  challengeId: string;
  challengeNonce: string;
  deviceRef: string;
};

export type EsimInstallIssuerKeyResolver = (identity: {
  issuerId: string;
  keyId: string;
}) => Promise<Uint8Array | null>;

const SIGNED_FIELDS = [
  'schema',
  'issuerId',
  'keyId',
  'ownerUserId',
  'orderId',
  'profileDigest',
  'challengeId',
  'challengeNonceSha256',
  'deviceRef',
  'installState',
  'evidenceSource',
  'observedAt',
  'expiresAt',
] as const;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}

function exactShape(value: Record<string, unknown>) {
  const expected = [...SIGNED_FIELDS, 'signature'].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]{86}$/.test(value)) return null;
  try {
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + '==');
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const canonical = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    return bytes.length === 64 && canonical === value ? bytes : null;
  } catch {
    return null;
  }
}

export function esimInstallReceiptSigningBytes(receipt: EsimInstallReceipt) {
  const payload = new TextEncoder().encode(JSON.stringify(
    Object.fromEntries(SIGNED_FIELDS.map((field) => [field, receipt[field]])),
  ));
  const bytes = new Uint8Array(DOMAIN.length + payload.length);
  bytes.set(DOMAIN);
  bytes.set(payload, DOMAIN.length);
  return bytes;
}

async function digestHex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', copy.buffer as ArrayBuffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Verify a carrier/OEM signed installation observation against a one-time order challenge. */
export async function verifyEsimInstallReceipt(
  value: unknown,
  context: EsimInstallReceiptContext,
  resolveTrustedKey: EsimInstallIssuerKeyResolver,
  now = Date.now(),
): Promise<EsimInstallReceipt | null> {
  if (!record(value) || !exactShape(value) || !Number.isSafeInteger(now) || now < 0) return null;
  const receipt = value as unknown as EsimInstallReceipt;
  if (
    receipt.schema !== ESIM_INSTALL_RECEIPT_SCHEMA ||
    !safeId(receipt.issuerId) || !safeId(receipt.keyId) || !safeId(receipt.ownerUserId) ||
    !safeId(receipt.orderId) || !safeId(receipt.challengeId) || !safeId(receipt.deviceRef) ||
    !/^[a-f0-9]{64}$/.test(receipt.profileDigest) ||
    !/^[a-f0-9]{64}$/.test(receipt.challengeNonceSha256) ||
    receipt.installState !== 'installed_enabled' ||
    (receipt.evidenceSource !== 'carrier_privileged' && receipt.evidenceSource !== 'oem_euicc_controller') ||
    !Number.isSafeInteger(receipt.observedAt) || !Number.isSafeInteger(receipt.expiresAt) ||
    receipt.observedAt > now + 30_000 || receipt.expiresAt <= now ||
    receipt.expiresAt <= receipt.observedAt ||
    receipt.expiresAt - receipt.observedAt > MAX_RECEIPT_LIFETIME_MS ||
    receipt.ownerUserId !== context.ownerUserId || receipt.orderId !== context.orderId ||
    receipt.profileDigest !== context.profileDigest || receipt.challengeId !== context.challengeId ||
    receipt.deviceRef !== context.deviceRef ||
    receipt.challengeNonceSha256 !== await digestHex(context.challengeNonce)
  ) return null;

  let publicKey: Uint8Array | null;
  try {
    publicKey = await resolveTrustedKey({ issuerId: receipt.issuerId, keyId: receipt.keyId });
  } catch {
    return null;
  }
  if (!(publicKey instanceof Uint8Array) || publicKey.length !== 32) return null;
  const signature = decodeBase64Url(receipt.signature);
  if (!signature) return null;
  try {
    const key = await crypto.subtle.importKey(
      'raw', new Uint8Array(publicKey).buffer as ArrayBuffer,
      { name: 'Ed25519' }, false, ['verify'],
    );
    const valid = await crypto.subtle.verify(
      { name: 'Ed25519' }, key,
      new Uint8Array(signature).buffer as ArrayBuffer,
      esimInstallReceiptSigningBytes(receipt).buffer as ArrayBuffer,
    );
    return valid ? receipt : null;
  } catch {
    return null;
  }
}

export function parseTrustedEsimInstallIssuerKeys(configuration: unknown) {
  if (typeof configuration !== 'string' || configuration.length > 65_536) return null;
  let value: unknown;
  try { value = JSON.parse(configuration); } catch { return null; }
  if (!Array.isArray(value) || value.length > 64) return null;
  const keys = new Map<string, { publicKeyHex: string; status: 'active' | 'revoked' }>();
  for (const item of value) {
    if (!record(item)) return null;
    const expected = ['issuerId', 'keyId', 'publicKeyHex', 'status'].sort();
    const actual = Object.keys(item).sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]) ||
        !safeId(item.issuerId) || !safeId(item.keyId) ||
        typeof item.publicKeyHex !== 'string' || !/^[a-f0-9]{64}$/i.test(item.publicKeyHex) ||
        (item.status !== 'active' && item.status !== 'revoked')) return null;
    const issuerId = item.issuerId as string;
    const keyId = item.keyId as string;
    const mapKey = `${issuerId}\0${keyId}`;
    if (keys.has(mapKey)) return null;
    keys.set(mapKey, { publicKeyHex: item.publicKeyHex, status: item.status });
  }
  return keys;
}

export function hasTrustedEsimInstallIssuerKey(configuration: unknown, issuerId: string, keyId: string) {
  return parseTrustedEsimInstallIssuerKeys(configuration)?.get(`${issuerId}\0${keyId}`)?.status === 'active';
}

export function trustedEsimInstallIssuerKeyResolver(configuration: unknown): EsimInstallIssuerKeyResolver {
  const keys = parseTrustedEsimInstallIssuerKeys(configuration);
  return async ({ issuerId, keyId }) => {
    if (!keys) return null;
    const entry = keys.get(`${issuerId}\0${keyId}`);
    if (!entry || entry.status !== 'active') return null;
    return Uint8Array.from(entry.publicKeyHex.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16));
  };
}

type IosInstallDatabase = Pick<D1Database, 'prepare'>;
export type IosEveEntitlementState = 'not_declared' | 'awaiting_provider' | 'active' | 'provider_released';

const IOS_BOUND_ORDER = `FROM esim_provider_orders p
  JOIN sky_commerce_orders o ON o.id = p.sky_order_id AND o.buyer_user_id = p.owner_user_id
  JOIN esim_provider_profile_bindings b ON b.sky_order_id = o.id AND b.owner_user_id = o.buyer_user_id
    AND b.provider = p.provider AND b.profile_digest = p.profile_digest
    AND b.package_key = o.package_key AND b.manifest_sha256 = o.manifest_sha256`;
const IOS_ELIGIBLE_ORDER = `WHERE o.id = ? AND o.buyer_user_id = ?
  AND o.mode = 'live' AND o.status = 'paid' AND o.refunded_minor = 0
  AND p.provider = 'esim-go-v3' AND p.state = 'profile_bound'
  AND p.package_key = o.package_key AND p.manifest_sha256 = o.manifest_sha256`;
/** Account-level evidence for Eve on iOS. Native device and cloud grants still
 * require the signed install and gateway receipts.
 */
export async function readIosEveEntitlement(
  db: IosInstallDatabase, ownerUserId: string, orderId: string,
): Promise<IosEveEntitlementState | null> {
  const row = await db.prepare(`SELECT d.declared_at AS declaredAt,
    (SELECT e.profile_status FROM esim_provider_webhook_inbox i
      JOIN esim_go_profile_status_events e ON e.callback_digest = i.callback_digest
      WHERE i.provider = b.provider AND i.sky_order_id = b.sky_order_id AND i.owner_user_id = b.owner_user_id
        AND i.profile_digest = b.profile_digest AND i.event_type = 'ProfileStatusChange'
        AND e.event_at >= p.created_at AND e.event_at <= i.received_at + 300000
      ORDER BY e.event_at DESC, (e.profile_status = 'Released') DESC, i.callback_digest LIMIT 1
    ) AS profileStatus
    ${IOS_BOUND_ORDER}
    LEFT JOIN esim_ios_install_declarations d ON d.sky_order_id = b.sky_order_id
      AND d.owner_user_id = b.owner_user_id AND d.profile_digest = b.profile_digest
    ${IOS_ELIGIBLE_ORDER}`)
    .bind(orderId, ownerUserId)
    .first<{ declaredAt: number | null; profileStatus: string | null }>();
  if (!row) return null;
  if (row.declaredAt === null) return 'not_declared';
  if (row.profileStatus === 'Released') return 'provider_released';
  return row.profileStatus === 'Downloaded' || row.profileStatus === 'Installed' ? 'active' : 'awaiting_provider';
}

export async function declareIosEsimInstall(
  db: IosInstallDatabase, ownerUserId: string, orderId: string, now = Date.now(),
): Promise<IosEveEntitlementState | null> {
  await db.prepare(`INSERT INTO esim_ios_install_declarations (sky_order_id, owner_user_id, profile_digest, declared_at)
    SELECT b.sky_order_id, b.owner_user_id, b.profile_digest, ?
    ${IOS_BOUND_ORDER} ${IOS_ELIGIBLE_ORDER}
    ON CONFLICT (sky_order_id, owner_user_id, profile_digest) DO NOTHING`)
    .bind(now, orderId, ownerUserId).run();
  return readIosEveEntitlement(db, ownerUserId, orderId);
}
