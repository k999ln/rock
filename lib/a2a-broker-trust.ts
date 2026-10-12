import type { A2ATrustedBrokerKeyResolver } from './a2a-broker-authorization.ts';
import { a2aBrokerDeviceStore } from './a2a-broker-device-store.ts';
import { ANDROID_KEY_ATTESTATION_AUTHORITY } from './android-key-attestation-client.ts';

type TrustedBrokerKey = {
  authorityId: string;
  ownerUserId: string;
  deviceRef: string;
  keyId: string;
  publicKeyHex: string;
  status: 'active' | 'revoked';
};

const identity = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Parse the operator-provisioned trust inventory. This is deliberately not a
 * user enrollment API: keys become trusted only through deployment authority.
 * Invalid or duplicate entries invalidate the complete inventory.
 */
export function parseTrustedA2ABrokerKeys(configuration: unknown) {
  if (typeof configuration !== 'string' || configuration.length > 65_536)
    return null;
  let value: unknown;
  try {
    value = JSON.parse(configuration);
  } catch {
    return null;
  }
  if (!Array.isArray(value) || value.length > 256) return null;
  const entries = new Map<string, TrustedBrokerKey>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const expected = [
      'authorityId',
      'ownerUserId',
      'deviceRef',
      'keyId',
      'publicKeyHex',
      'status',
    ].sort();
    if (
      Object.keys(record).length !== expected.length ||
      Object.keys(record).sort().some((key, index) => key !== expected[index]) ||
      typeof record.authorityId !== 'string' ||
      !identity.test(record.authorityId) ||
      typeof record.ownerUserId !== 'string' ||
      !identity.test(record.ownerUserId) ||
      typeof record.deviceRef !== 'string' ||
      !identity.test(record.deviceRef) ||
      typeof record.keyId !== 'string' ||
      !identity.test(record.keyId) ||
      typeof record.publicKeyHex !== 'string' ||
      !/^(?:[a-f0-9]{64}|04[a-f0-9]{128})$/i.test(record.publicKeyHex) ||
      (record.status !== 'active' && record.status !== 'revoked')
    )
      return null;
    const key = [
      record.authorityId,
      record.ownerUserId,
      record.deviceRef,
      record.keyId,
    ].join('\0');
    if (entries.has(key)) return null;
    entries.set(key, record as TrustedBrokerKey);
  }
  return entries;
}

export function trustedA2ABrokerKeyResolver(configuration: unknown): A2ATrustedBrokerKeyResolver {
  const entries = parseTrustedA2ABrokerKeys(configuration);
  return async (identityValue) => {
    if (!entries) return null;
    const entry = entries.get([
      identityValue.authorityId,
      identityValue.ownerUserId,
      identityValue.deviceRef,
      identityValue.keyId,
    ].join('\0'));
    if (!entry || entry.status !== 'active') return null;
    return Uint8Array.from(entry.publicKeyHex.match(/.{2}/g)!, (byte) =>
      Number.parseInt(byte, 16),
    );
  };
}

/** Resolve owner-enrolled Android Broker keys first; a recorded revocation never falls back. */
export function a2aBrokerDeviceKeyResolver(
  db: Pick<D1Database, 'prepare' | 'batch'>,
  configuration: unknown,
): A2ATrustedBrokerKeyResolver {
  const operatorResolver = trustedA2ABrokerKeyResolver(configuration);
  const devices = a2aBrokerDeviceStore(db);
  return async (requested) => {
    let enrolled: Awaited<ReturnType<typeof devices.lookup>>;
    try { enrolled = await devices.lookup(requested); }
    catch { return null; }
    if (enrolled) {
      if (enrolled.status !== 'active' || enrolled.revokedAt !== null ||
          enrolled.algorithm !== 'ES256' || requested.authorityId !== ANDROID_KEY_ATTESTATION_AUTHORITY ||
          enrolled.publicKey.length !== 130 || !/^04[a-f0-9]{128}$/.test(enrolled.publicKey) ||
          enrolled.publicKeySha256 !== requested.keyId ||
          enrolled.applicationPackage !== 'dev.rock.automation' ||
          !/^(0|[1-9][0-9]{0,8})$/.test(enrolled.minimumApplicationVersion) ||
          !/^[a-f0-9]{64}$/.test(enrolled.signingCertificateSha256) ||
          !['TRUSTED_ENVIRONMENT', 'STRONG_BOX'].includes(enrolled.securityLevel) ||
          enrolled.verifiedBootState !== 'VERIFIED') return null;
      const bytes = Uint8Array.from(enrolled.publicKey.match(/.{2}/g)!, (byte) =>
        Number.parseInt(byte, 16));
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer as ArrayBuffer));
      const fingerprint = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
      return fingerprint === requested.keyId ? bytes : null;
    }
    return operatorResolver(requested);
  };
}
