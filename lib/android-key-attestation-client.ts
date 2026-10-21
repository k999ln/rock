export const ANDROID_KEY_ATTESTATION_VERIFIER_COMMIT = '55c35040a1b5b72e6d63bfb150c5c68a175c1462';
export const ANDROID_KEY_ATTESTATION_AUTHORITY = 'android-key-attestation-google';

const MAX_CHAIN_CERTIFICATES = 12;
const MAX_CHAIN_BYTES = 192 * 1024;
const MAX_RESPONSE_BYTES = 16 * 1024;

export type AndroidKeyAttestationResult = {
  authorityId: typeof ANDROID_KEY_ATTESTATION_AUTHORITY;
  keyId: string;
  publicKey: Uint8Array;
  publicKeyHex: string;
  publicKeySha256: string;
  applicationPackage: string;
  minimumApplicationVersion: string;
  signingCertificateSha256: string;
  securityLevel: 'TRUSTED_ENVIRONMENT' | 'STRONG_BOX';
  verifiedBootState: 'VERIFIED';
  deviceLocked: true;
  verifiedAt: number;
};

type AttestationRequest = {
  challengeId: string;
  challengeNonce: string;
  packageName: string;
  certificateChainDerBase64Url: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('ATTESTATION_RESULT_INVALID');
  const bytes = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)),
    (char) => char.charCodeAt(0));
  const canonical = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  if (canonical !== value) throw new Error('ATTESTATION_RESULT_INVALID');
  return bytes;
}

export async function verifyAndroidKeyAttestation(
  config: { endpoint?: unknown; token?: unknown; expectedCommit?: unknown },
  request: AttestationRequest,
  fetcher: typeof fetch = fetch,
): Promise<AndroidKeyAttestationResult> {
  if (typeof config.endpoint !== 'string' || typeof config.token !== 'string' ||
      config.token.length < 43 || config.token.length > 256 ||
      (config.expectedCommit !== undefined && config.expectedCommit !== ANDROID_KEY_ATTESTATION_VERIFIER_COMMIT))
    throw new Error('ATTESTATION_VERIFIER_NOT_CONFIGURED');
  let endpoint: URL;
  try { endpoint = new URL(config.endpoint); } catch { throw new Error('ATTESTATION_VERIFIER_NOT_CONFIGURED'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash || endpoint.search)
    throw new Error('ATTESTATION_VERIFIER_NOT_CONFIGURED');
  if (!/^[0-9a-f-]{36}$/i.test(request.challengeId) || !/^[A-Za-z0-9_-]{43}$/.test(request.challengeNonce) ||
      !/^[A-Za-z][A-Za-z0-9_.]{0,254}$/.test(request.packageName) ||
      !Array.isArray(request.certificateChainDerBase64Url) ||
      request.certificateChainDerBase64Url.length < 2 || request.certificateChainDerBase64Url.length > MAX_CHAIN_CERTIFICATES)
    throw new Error('ATTESTATION_REQUEST_INVALID');
  let totalChainBytes = 0;
  for (const encoded of request.certificateChainDerBase64Url) {
    if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > Math.ceil(MAX_CHAIN_BYTES * 4 / 3) + 16 ||
        !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('ATTESTATION_REQUEST_INVALID');
    totalChainBytes += Math.floor(encoded.length * 3 / 4);
  }
  if (totalChainBytes > MAX_CHAIN_BYTES) throw new Error('ATTESTATION_REQUEST_INVALID');

  let challenge: Uint8Array;
  try { challenge = fromBase64Url(request.challengeNonce); }
  catch { throw new Error('ATTESTATION_REQUEST_INVALID'); }
  if (challenge.length !== 32) throw new Error('ATTESTATION_REQUEST_INVALID');
  const challengeCopy = new Uint8Array(challenge);
  const challengeSha256 = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', challengeCopy.buffer as ArrayBuffer)));
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema: 'rock-android-key-attestation-request/1',
        challengeId: request.challengeId,
        challenge: request.challengeNonce,
        packageName: request.packageName,
        certificateChainDerBase64Url: request.certificateChainDerBase64Url,
      }),
      // Workers only supports follow/manual. Reject redirects below instead
      // of allowing a verifier endpoint to redirect credentials elsewhere.
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new Error('ATTESTATION_VERIFIER_UNAVAILABLE');
  }
  if (!response.ok) throw new Error(response.status === 422
    ? 'ATTESTATION_REJECTED'
    : (response.status >= 300 && response.status < 400) ||
      (response.status >= 400 && response.status < 500)
      ? 'ATTESTATION_VERIFIER_PROTOCOL_ERROR'
      : 'ATTESTATION_VERIFIER_UNAVAILABLE');
  const lengthHeader = response.headers.get('content-length');
  const length = lengthHeader === null ? null : Number(lengthHeader);
  if (length !== null && (!Number.isFinite(length) || length < 2 || length > MAX_RESPONSE_BYTES))
    throw new Error('ATTESTATION_RESULT_INVALID');
  const body = await response.text();
  if (new TextEncoder().encode(body).length > MAX_RESPONSE_BYTES) throw new Error('ATTESTATION_RESULT_INVALID');
  let value: unknown;
  try { value = JSON.parse(body); } catch { throw new Error('ATTESTATION_RESULT_INVALID'); }
  if (!isRecord(value)) throw new Error('ATTESTATION_RESULT_INVALID');
  const expectedFields = [
    'schema', 'challengeId', 'challengeSha256', 'publicKeyRawP256Base64Url', 'publicKeySha256',
    'securityLevel', 'verifiedBootState', 'deviceLocked', 'applicationPackage',
    'minimumApplicationVersion', 'signingCertificateSha256', 'verifiedAt', 'verifierCommit',
  ].sort();
  const actualFields = Object.keys(value).sort();
  if (actualFields.length !== expectedFields.length ||
      actualFields.some((field, index) => field !== expectedFields[index]) ||
      value.schema !== 'rock-android-key-attestation-result/1' || value.challengeId !== request.challengeId ||
      value.challengeSha256 !== challengeSha256 || value.applicationPackage !== request.packageName ||
      typeof value.minimumApplicationVersion !== 'string' || !/^(0|[1-9][0-9]{0,8})$/.test(value.minimumApplicationVersion) ||
      typeof value.signingCertificateSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.signingCertificateSha256) ||
      (value.securityLevel !== 'TRUSTED_ENVIRONMENT' && value.securityLevel !== 'STRONG_BOX') ||
      value.verifiedBootState !== 'VERIFIED' || value.deviceLocked !== true ||
      !Number.isSafeInteger(value.verifiedAt) || (value.verifiedAt as number) > Date.now() + 30_000 ||
      value.verifierCommit !== ANDROID_KEY_ATTESTATION_VERIFIER_COMMIT)
    throw new Error('ATTESTATION_RESULT_INVALID');

  const publicKey = fromBase64Url(String(value.publicKeyRawP256Base64Url));
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error('ATTESTATION_RESULT_INVALID');
  const publicKeyCopy = new Uint8Array(publicKey);
  const publicKeySha256 = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', publicKeyCopy.buffer as ArrayBuffer)));
  if (value.publicKeySha256 !== publicKeySha256) throw new Error('ATTESTATION_RESULT_INVALID');
  return {
    authorityId: ANDROID_KEY_ATTESTATION_AUTHORITY,
    keyId: publicKeySha256,
    publicKey,
    publicKeyHex: toHex(publicKey),
    publicKeySha256,
    applicationPackage: request.packageName,
    minimumApplicationVersion: value.minimumApplicationVersion,
    signingCertificateSha256: value.signingCertificateSha256,
    securityLevel: value.securityLevel,
    verifiedBootState: 'VERIFIED',
    deviceLocked: true,
    verifiedAt: value.verifiedAt as number,
  };
}
