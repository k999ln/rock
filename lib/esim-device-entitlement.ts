export const ESIM_DEVICE_ENTITLEMENT_SCHEMA = 'rock-esim-device-entitlement-receipt/1' as const;
const DOMAIN = new TextEncoder().encode('rock-esim-device-entitlement-signature/1\0');
const MAX_RECEIPT_LIFETIME_MS = 5 * 60_000;

export type EsimDeviceEntitlementReceipt = {
  schema: typeof ESIM_DEVICE_ENTITLEMENT_SCHEMA;
  signatureAlgorithm: 'Ed25519' | 'ES256';
  authorityId: string;
  keyId: string;
  ownerUserId: string;
  orderId: string;
  profileDigest: string;
  challengeId: string;
  challengeNonceSha256: string;
  deviceRef: string;
  installReceiptSha256: string;
  starterPackId: string;
  starterPackVersion: string;
  starterPackManifestSha256: string;
  activationState: 'installed_enabled';
  observedAt: number;
  expiresAt: number;
  signature: string;
};

export type EsimDeviceEntitlementContext = Omit<EsimDeviceEntitlementReceipt,
  'schema' | 'signatureAlgorithm' | 'authorityId' | 'keyId' | 'challengeNonceSha256' | 'observedAt' | 'expiresAt' | 'signature' | 'activationState'> & {
    challengeNonce: string;
  };

export type EsimDeviceEntitlementKeyResolver = (identity: {
  authorityId: string;
  ownerUserId: string;
  deviceRef: string;
  keyId: string;
}) => Promise<{ algorithm: 'Ed25519' | 'ES256'; publicKey: Uint8Array } | null>;

const SIGNED_FIELDS = [
  'schema', 'signatureAlgorithm', 'authorityId', 'keyId', 'ownerUserId', 'orderId', 'profileDigest',
  'challengeId', 'challengeNonceSha256', 'deviceRef', 'installReceiptSha256',
    'starterPackId', 'starterPackVersion', 'starterPackManifestSha256', 'activationState',
  'observedAt', 'expiresAt',
] as const;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,160}$/.test(value);
}

function exactShape(value: Record<string, unknown>) {
  const expected = [...SIGNED_FIELDS, 'signature'].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function decodeSignature(value: string) {
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

export function esimDeviceEntitlementSigningBytes(receipt: EsimDeviceEntitlementReceipt) {
  const payload = new TextEncoder().encode(JSON.stringify(
    Object.fromEntries(SIGNED_FIELDS.map((field) => [field, receipt[field]])),
  ));
  const bytes = new Uint8Array(DOMAIN.length + payload.length);
  bytes.set(DOMAIN);
  bytes.set(payload, DOMAIN.length);
  return bytes;
}

async function digestHex(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', copy.buffer as ArrayBuffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Verify a trusted native gateway's exact one-time entitlement activation receipt. */
export async function verifyEsimDeviceEntitlementReceipt(
  value: unknown,
  context: EsimDeviceEntitlementContext,
  resolveTrustedKey: EsimDeviceEntitlementKeyResolver,
  now = Date.now(),
): Promise<EsimDeviceEntitlementReceipt | null> {
  if (!record(value) || !exactShape(value) || !Number.isSafeInteger(now) || now < 0) return null;
  const receipt = value as unknown as EsimDeviceEntitlementReceipt;
  if (
    receipt.schema !== ESIM_DEVICE_ENTITLEMENT_SCHEMA ||
    (receipt.signatureAlgorithm !== 'Ed25519' && receipt.signatureAlgorithm !== 'ES256') ||
    !safeId(receipt.authorityId) || !safeId(receipt.keyId) || !safeId(receipt.ownerUserId) ||
    !safeId(receipt.orderId) || !safeId(receipt.challengeId) || !safeId(receipt.deviceRef) ||
    !safeId(receipt.starterPackId) || typeof receipt.starterPackVersion !== 'string' ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(receipt.starterPackVersion) ||
    !/^[a-f0-9]{64}$/.test(receipt.profileDigest) ||
    !/^[a-f0-9]{64}$/.test(receipt.challengeNonceSha256) ||
    !/^[a-f0-9]{64}$/.test(receipt.installReceiptSha256) ||
    !/^[a-f0-9]{64}$/.test(receipt.starterPackManifestSha256) ||
    receipt.activationState !== 'installed_enabled' ||
    !Number.isSafeInteger(receipt.observedAt) || !Number.isSafeInteger(receipt.expiresAt) ||
    receipt.observedAt > now + 30_000 || receipt.expiresAt <= now ||
    receipt.expiresAt <= receipt.observedAt ||
    receipt.expiresAt - receipt.observedAt > MAX_RECEIPT_LIFETIME_MS ||
    receipt.ownerUserId !== context.ownerUserId || receipt.orderId !== context.orderId ||
    receipt.profileDigest !== context.profileDigest || receipt.challengeId !== context.challengeId ||
    receipt.deviceRef !== context.deviceRef || receipt.installReceiptSha256 !== context.installReceiptSha256 ||
    receipt.starterPackId !== context.starterPackId ||
    receipt.starterPackVersion !== context.starterPackVersion ||
    receipt.starterPackManifestSha256 !== context.starterPackManifestSha256 ||
    receipt.challengeNonceSha256 !== await digestHex(context.challengeNonce)
  ) return null;

  let publicKey: Awaited<ReturnType<EsimDeviceEntitlementKeyResolver>>;
  try {
    publicKey = await resolveTrustedKey({
      authorityId: receipt.authorityId,
      ownerUserId: receipt.ownerUserId,
      deviceRef: receipt.deviceRef,
      keyId: receipt.keyId,
    });
  } catch {
    return null;
  }
  if (!publicKey || publicKey.algorithm !== receipt.signatureAlgorithm ||
      !(publicKey.publicKey instanceof Uint8Array) ||
      (publicKey.algorithm === 'Ed25519' && publicKey.publicKey.length !== 32) ||
      (publicKey.algorithm === 'ES256' &&
        (publicKey.publicKey.length !== 65 || publicKey.publicKey[0] !== 4))) return null;
  const signature = decodeSignature(receipt.signature);
  if (!signature) return null;
  try {
    const key = await crypto.subtle.importKey(
      'raw', new Uint8Array(publicKey.publicKey).buffer as ArrayBuffer,
      publicKey.algorithm === 'Ed25519' ? { name: 'Ed25519' } : { name: 'ECDSA', namedCurve: 'P-256' },
      false, ['verify'],
    );
    const valid = await crypto.subtle.verify(
      publicKey.algorithm === 'Ed25519' ? { name: 'Ed25519' } : { name: 'ECDSA', hash: 'SHA-256' }, key,
      new Uint8Array(signature).buffer as ArrayBuffer,
      esimDeviceEntitlementSigningBytes(receipt).buffer as ArrayBuffer,
    );
    return valid ? receipt : null;
  } catch {
    return null;
  }
}

export function parseTrustedEsimDeviceGatewayKeys(configuration: unknown) {
  if (typeof configuration !== 'string' || configuration.length > 65_536) return null;
  let value: unknown;
  try { value = JSON.parse(configuration); } catch { return null; }
  if (!Array.isArray(value) || value.length > 256) return null;
  const entries = new Map<string, {
    algorithm: 'Ed25519' | 'ES256'; publicKeyHex: string; status: 'active' | 'revoked';
  }>();
  for (const item of value) {
    if (!record(item)) return null;
    const expected = ['authorityId', 'ownerUserId', 'deviceRef', 'keyId', 'algorithm', 'publicKeyHex', 'status'].sort();
    const actual = Object.keys(item).sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]) ||
        !safeId(item.authorityId) || !safeId(item.ownerUserId) || !safeId(item.deviceRef) ||
        !safeId(item.keyId) || (item.algorithm !== 'Ed25519' && item.algorithm !== 'ES256') ||
        typeof item.publicKeyHex !== 'string' ||
        (item.algorithm === 'Ed25519' && !/^[a-f0-9]{64}$/i.test(item.publicKeyHex)) ||
        (item.algorithm === 'ES256' && !/^04[a-f0-9]{128}$/i.test(item.publicKeyHex)) ||
        (item.status !== 'active' && item.status !== 'revoked')) return null;
    const identity = [item.authorityId, item.ownerUserId, item.deviceRef, item.keyId].join('\0');
    if (entries.has(identity)) return null;
    entries.set(identity, {
      algorithm: item.algorithm,
      publicKeyHex: item.publicKeyHex,
      status: item.status,
    });
  }
  return entries;
}

export function trustedEsimDeviceGatewayKeyResolver(configuration: unknown): EsimDeviceEntitlementKeyResolver {
  const entries = parseTrustedEsimDeviceGatewayKeys(configuration);
  return async ({ authorityId, ownerUserId, deviceRef, keyId }) => {
    const entry = entries?.get([authorityId, ownerUserId, deviceRef, keyId].join('\0'));
    if (!entry || entry.status !== 'active') return null;
    return {
      algorithm: entry.algorithm,
      publicKey: Uint8Array.from(entry.publicKeyHex.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16)),
    };
  };
}

/** Return the algorithm and fingerprint of the exact currently trusted key for a receipt identity. */
export async function trustedEsimDeviceGatewayKeyFingerprint(
  configuration: unknown,
  identity: { authorityId: string; ownerUserId: string; deviceRef: string; keyId: string },
) {
  const key = await trustedEsimDeviceGatewayKeyResolver(configuration)(identity);
  if (!key) return null;
  return { algorithm: key.algorithm, publicKeySha256: await digestHex(key.publicKey) };
}

export function hasTrustedEsimDeviceGatewayKey(
  configuration: unknown,
  ownerUserId: string,
  deviceRef: string,
  authorityId?: string,
  keyId?: string,
) {
  const entries = parseTrustedEsimDeviceGatewayKeys(configuration);
  if (!entries) return false;
  return [...entries.entries()].some(([identity, entry]) =>
    entry.status === 'active' && identity.split('\0')[1] === ownerUserId &&
    identity.split('\0')[2] === deviceRef &&
    (authorityId === undefined || identity.split('\0')[0] === authorityId) &&
    (keyId === undefined || identity.split('\0')[3] === keyId),
  );
}
