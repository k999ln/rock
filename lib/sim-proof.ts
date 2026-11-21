import { base64url, importSPKI, importX509, jwtVerify } from 'jose';

export const MAX_SIM_PROOF_TOKEN_LENGTH = 8_192;

type SimProofOptions = {
  publicKeys: ReadonlyMap<string, string | CryptoKey>;
  hashSecret: string;
  now: number;
  maxAgeMs: number;
};

export type SimProof = {
  simDigest: string;
  deviceDigest: string;
  issuedAt: number;
  expiresAt: number;
};

const encoder = new TextEncoder();

async function digest(key: CryptoKey, field: 'imsi' | 'imei', value: string) {
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(`rock-sim-proof:${field}\0${value}`));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Timestamps are milliseconds. Trusted keys and the dedicated secret are supplied by the caller. */
export async function verifySimProof(token: string, options: SimProofOptions): Promise<SimProof | null> {
  const { publicKeys, hashSecret, now, maxAgeMs } = options;
  if (hashSecret.length < 32 || !Number.isSafeInteger(now) || now < 0 ||
      !Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0 || token.length > MAX_SIM_PROOF_TOKEN_LENGTH) {
    return null;
  }

  try {
    const segments = token.split('.');
    if (segments.length !== 3 || segments.some((part) =>
      !part || base64url.encode(base64url.decode(part)) !== part)) return null;

    const { payload } = await jwtVerify(token, (header) => {
      const key = typeof header.kid === 'string' ? publicKeys.get(header.kid) : undefined;
      if (!key) throw new Error('SIM_PROOF_UNKNOWN_KEY');
      if (typeof key !== 'string') return key;
      return key.startsWith('-----BEGIN CERTIFICATE-----')
        ? importX509(key, 'RS256')
        : importSPKI(key, 'RS256');
    }, {
      algorithms: ['RS256'],
      issuer: 'https://soracom.io',
      audience: 'soracom-endorse-audience',
      subject: 'soracom-endorse',
      requiredClaims: ['iat', 'exp'],
      currentDate: new Date(now),
    });

    if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') return null;
    const issuedAt = payload.iat * 1_000;
    const expiresAt = payload.exp * 1_000;
    if (!Number.isSafeInteger(issuedAt) || issuedAt < 0 || issuedAt > now || now - issuedAt > maxAgeMs ||
        !Number.isSafeInteger(expiresAt) || expiresAt <= now) return null;

    const claim: unknown = payload['soracom-endorse-claim'];
    if (!claim || typeof claim !== 'object' || Array.isArray(claim)) return null;
    const { imsi, imei } = claim as { imsi?: unknown; imei?: unknown };
    if (typeof imsi !== 'string' || !/^\d{5,15}$/.test(imsi) ||
        typeof imei !== 'string' || !/^\d{15,16}$/.test(imei)) return null;

    const key = await crypto.subtle.importKey('raw', encoder.encode(hashSecret), {
      name: 'HMAC', hash: 'SHA-256',
    }, false, ['sign']);
    const [simDigest, deviceDigest] = await Promise.all([
      digest(key, 'imsi', imsi),
      digest(key, 'imei', imei),
    ]);
    return { simDigest, deviceDigest, issuedAt, expiresAt };
  } catch {
    // JWT errors may carry decoded claims. Discard them at this boundary.
    return null;
  }
}
