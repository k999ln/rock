import type { EsimGoIssuedProfile } from './esimgo-provider.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ICCID = /^[0-9]{18,22}$/;

export type EsimInstallMaterial = {
  iccid: string;
  matchingId: string;
  smdpAddress: string;
  appleInstallUrl?: string;
  androidInstallUrl?: string;
};

type D1Store = Pick<D1Database, 'prepare'>;
type StoredMaterial = {
  skyOrderId: string;
  ownerUserId: string;
  state: string;
  installMaterialCiphertext: string | null;
  installMaterialNonce: string | null;
  installMaterialDeliveryKeyHash: string | null;
  installMaterialDeliveredAt: number | null;
};

const QUICK_INSTALL_HOSTS = {
  appleInstallUrl: 'esimsetup.apple.com',
  androidInstallUrl: 'esimsetup.android.com',
} as const;

export function validEsimQuickInstallUrl(value: unknown, field: keyof typeof QUICK_INSTALL_HOSTS): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 4096) return false;
  try {
    const url = new URL(value);
    const cardData = url.searchParams.get('carddata');
    return url.protocol === 'https:' && url.hostname === QUICK_INSTALL_HOSTS[field] &&
      url.pathname === '/esim_qrcode_provisioning' && !url.username && !url.password && !url.hash &&
      typeof cardData === 'string' && cardData.startsWith('LPA:1$') && cardData.length <= 2048;
  } catch {
    return false;
  }
}

function optionalInstallUrl(value: unknown, field: keyof typeof QUICK_INSTALL_HOSTS): string | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  return validEsimQuickInstallUrl(value, field) ? value : null;
}

export class EsimInstallMaterialError extends Error {
  readonly code: 'KEY_NOT_CONFIGURED' | 'INVALID_MATERIAL' | 'NOT_READY' | 'DELIVERY_KEY_CONFLICT' | 'ALREADY_ACKNOWLEDGED';

  constructor(code: EsimInstallMaterialError['code']) {
    super(code);
    this.name = 'EsimInstallMaterialError';
    this.code = code;
  }
}

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromB64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new EsimInstallMaterialError('INVALID_MATERIAL');
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bufferSource(value: Uint8Array): ArrayBuffer {
  const result = new ArrayBuffer(value.byteLength);
  new Uint8Array(result).set(value);
  return result;
}

async function keyFromHex(value: string | undefined): Promise<CryptoKey> {
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new EsimInstallMaterialError('KEY_NOT_CONFIGURED');
  const raw = Uint8Array.from(value.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function aad(ownerUserId: string, skyOrderId: string): Promise<Uint8Array> {
  return new TextEncoder().encode(`rock-esim-install-material-v1\n${ownerUserId}\n${skyOrderId}`);
}

export async function encryptEsimInstallMaterial(
  profile: EsimGoIssuedProfile,
  encryptionKey: string | undefined,
  ownerUserId: string,
  skyOrderId: string,
): Promise<{ ciphertext: string; nonce: string }> {
  const appleInstallUrl = optionalInstallUrl(profile.appleInstallUrl, 'appleInstallUrl');
  const androidInstallUrl = optionalInstallUrl(profile.androidInstallUrl, 'androidInstallUrl');
  if (!ICCID.test(profile.iccid) || typeof profile.matchingId !== 'string' ||
      profile.matchingId.length < 1 || profile.matchingId.length > 256 ||
      typeof profile.smdpAddress !== 'string' || profile.smdpAddress.length < 1 || profile.smdpAddress.length > 256 ||
      appleInstallUrl === null || androidInstallUrl === null ||
      !ownerUserId || ownerUserId.length > 128 || !UUID.test(skyOrderId))
    throw new EsimInstallMaterialError('INVALID_MATERIAL');
  const key = await keyFromHex(encryptionKey);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cleartext = new TextEncoder().encode(JSON.stringify({
    iccid: profile.iccid,
    matchingId: profile.matchingId,
    smdpAddress: profile.smdpAddress,
    ...(appleInstallUrl ? { appleInstallUrl } : {}),
    ...(androidInstallUrl ? { androidInstallUrl } : {}),
  }));
  const encrypted = await crypto.subtle.encrypt({
    name: 'AES-GCM', iv: bufferSource(nonce), additionalData: bufferSource(await aad(ownerUserId, skyOrderId)),
  }, key, bufferSource(cleartext));
  return { ciphertext: b64url(new Uint8Array(encrypted)), nonce: b64url(nonce) };
}

async function decryptEsimInstallMaterial(
  ciphertext: string,
  nonceValue: string,
  encryptionKey: string | undefined,
  ownerUserId: string,
  skyOrderId: string,
): Promise<EsimInstallMaterial> {
  const key = await keyFromHex(encryptionKey);
  const cleartext = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv: bufferSource(fromB64url(nonceValue)),
    additionalData: bufferSource(await aad(ownerUserId, skyOrderId)),
  }, key, bufferSource(fromB64url(ciphertext)));
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(cleartext));
  } catch {
    throw new EsimInstallMaterialError('INVALID_MATERIAL');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new EsimInstallMaterialError('INVALID_MATERIAL');
  const material = value as Record<string, unknown>;
  const keys = Object.keys(material);
  const appleInstallUrl = optionalInstallUrl(material.appleInstallUrl, 'appleInstallUrl');
  const androidInstallUrl = optionalInstallUrl(material.androidInstallUrl, 'androidInstallUrl');
  if (keys.some((key) => !['iccid', 'matchingId', 'smdpAddress', 'appleInstallUrl', 'androidInstallUrl'].includes(key)) ||
      keys.length < 3 || keys.length > 5 || typeof material.iccid !== 'string' || !ICCID.test(material.iccid) ||
      typeof material.matchingId !== 'string' || material.matchingId.length < 1 || material.matchingId.length > 256 ||
      typeof material.smdpAddress !== 'string' || material.smdpAddress.length < 1 || material.smdpAddress.length > 256 ||
      appleInstallUrl === null || androidInstallUrl === null ||
      (Object.hasOwn(material, 'appleInstallUrl') && appleInstallUrl === undefined) ||
      (Object.hasOwn(material, 'androidInstallUrl') && androidInstallUrl === undefined))
    throw new EsimInstallMaterialError('INVALID_MATERIAL');
  return {
    iccid: material.iccid,
    matchingId: material.matchingId,
    smdpAddress: material.smdpAddress,
    ...(appleInstallUrl ? { appleInstallUrl } : {}),
    ...(androidInstallUrl ? { androidInstallUrl } : {}),
  };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const input = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(input).set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function storeEsimInstallMaterial(
  db: D1Store,
  profile: EsimGoIssuedProfile,
  encryptionKey: string | undefined,
  ownerUserId: string,
  skyOrderId: string,
  now: number,
): Promise<void> {
  const encrypted = await encryptEsimInstallMaterial(profile, encryptionKey, ownerUserId, skyOrderId);
  const result = await db.prepare(`UPDATE esim_provider_orders
    SET install_material_ciphertext = ?, install_material_nonce = ?, updated_at = ?
    WHERE sky_order_id = ? AND owner_user_id = ? AND state IN ('provider_completed', 'profile_bound')
      AND install_material_ciphertext IS NULL AND install_material_delivered_at IS NULL`)
    .bind(encrypted.ciphertext, encrypted.nonce, now, skyOrderId, ownerUserId).run();
  if ((result.meta?.changes ?? 0) > 0) return;
  const existing = await db.prepare(`SELECT install_material_ciphertext AS installMaterialCiphertext,
      install_material_nonce AS installMaterialNonce, install_material_delivered_at AS installMaterialDeliveredAt
    FROM esim_provider_orders WHERE sky_order_id = ? AND owner_user_id = ? AND state IN ('provider_completed', 'profile_bound')`)
    .bind(skyOrderId, ownerUserId).first<Pick<StoredMaterial, 'installMaterialCiphertext' | 'installMaterialNonce' | 'installMaterialDeliveredAt'>>();
  if (!existing || !existing.installMaterialCiphertext || !existing.installMaterialNonce || existing.installMaterialDeliveredAt !== null)
    throw new EsimInstallMaterialError('NOT_READY');
}

async function readStored(db: D1Store, skyOrderId: string, ownerUserId: string): Promise<StoredMaterial | null> {
  return db.prepare(`SELECT sky_order_id AS skyOrderId, owner_user_id AS ownerUserId, state,
      install_material_ciphertext AS installMaterialCiphertext,
      install_material_nonce AS installMaterialNonce,
      install_material_delivery_key_hash AS installMaterialDeliveryKeyHash,
      install_material_delivered_at AS installMaterialDeliveredAt
    FROM esim_provider_orders WHERE sky_order_id = ? AND owner_user_id = ?`)
    .bind(skyOrderId, ownerUserId).first<StoredMaterial>();
}

export async function fetchEsimInstallMaterial(
  db: D1Store,
  encryptionKey: string | undefined,
  ownerUserId: string,
  skyOrderId: string,
  deliveryRequestId: string,
): Promise<EsimInstallMaterial> {
  if (!UUID.test(deliveryRequestId)) throw new EsimInstallMaterialError('INVALID_MATERIAL');
  const requestHash = await sha256(`rock-esim-install-delivery-v1\n${ownerUserId}\n${skyOrderId}\n${deliveryRequestId}`);
  await db.prepare(`UPDATE esim_provider_orders
    SET install_material_delivery_key_hash = ?, updated_at = ?
    WHERE sky_order_id = ? AND owner_user_id = ? AND state = 'profile_bound'
      AND install_material_ciphertext IS NOT NULL AND install_material_nonce IS NOT NULL
      AND install_material_delivered_at IS NULL AND install_material_delivery_key_hash IS NULL`)
    .bind(requestHash, Date.now(), skyOrderId, ownerUserId).run();
  const row = await readStored(db, skyOrderId, ownerUserId);
  if (!row || row.state !== 'profile_bound') throw new EsimInstallMaterialError('NOT_READY');
  if (row.installMaterialDeliveredAt !== null) throw new EsimInstallMaterialError('ALREADY_ACKNOWLEDGED');
  if (!row.installMaterialCiphertext || !row.installMaterialNonce) throw new EsimInstallMaterialError('NOT_READY');
  if (row.installMaterialDeliveryKeyHash !== requestHash) throw new EsimInstallMaterialError('DELIVERY_KEY_CONFLICT');
  return decryptEsimInstallMaterial(row.installMaterialCiphertext, row.installMaterialNonce,
    encryptionKey, ownerUserId, skyOrderId);
}

export async function acknowledgeEsimInstallMaterial(
  db: D1Store,
  ownerUserId: string,
  skyOrderId: string,
  deliveryRequestId: string,
  now: number,
): Promise<'acknowledged' | 'already_acknowledged'> {
  if (!UUID.test(deliveryRequestId)) throw new EsimInstallMaterialError('INVALID_MATERIAL');
  const requestHash = await sha256(`rock-esim-install-delivery-v1\n${ownerUserId}\n${skyOrderId}\n${deliveryRequestId}`);
  const updated = await db.prepare(`UPDATE esim_provider_orders
    SET install_material_ciphertext = NULL, install_material_nonce = NULL,
        install_material_delivered_at = ?, updated_at = ?
    WHERE sky_order_id = ? AND owner_user_id = ? AND state = 'profile_bound'
      AND install_material_delivery_key_hash = ? AND install_material_ciphertext IS NOT NULL
      AND install_material_delivered_at IS NULL`)
    .bind(now, now, skyOrderId, ownerUserId, requestHash).run();
  if ((updated.meta?.changes ?? 0) > 0) return 'acknowledged';
  const row = await readStored(db, skyOrderId, ownerUserId);
  if (row?.state === 'profile_bound' && row.installMaterialDeliveryKeyHash === requestHash &&
      row.installMaterialDeliveredAt !== null && row.installMaterialCiphertext === null)
    return 'already_acknowledged';
  throw new EsimInstallMaterialError('DELIVERY_KEY_CONFLICT');
}
