/** Request proof by the registered eSIM gateway key; this does not attest eUICC key custody. */
export const ESIM_CLOUD_PROOF_SCHEME = 'RockEsimProof ';
export const ESIM_CLOUD_PROOF_SCHEMA = 'rock-esim-cloud-request/1' as const;
export const ESIM_CLOUD_PROOF_TTL_MS = 60_000;
const DOMAIN = new TextEncoder().encode('rock-esim-cloud-request-signature/1\0');
const MAX_BODY_BYTES = 1_048_576;
const FIELDS = ['schema', 'accessKeyId', 'requestId', 'signatureAlgorithm', 'method', 'url', 'bodySha256', 'issuedAt', 'expiresAt'] as const;
export type EsimCloudProof = {
  schema: typeof ESIM_CLOUD_PROOF_SCHEMA;
  accessKeyId: string;
  requestId: string;
  signatureAlgorithm: 'Ed25519' | 'ES256';
  method: string;
  url: string;
  bodySha256: string;
  issuedAt: number;
  expiresAt: number;
  signature: string;
};

export function esimCloudProofSigningBytes(proof: EsimCloudProof) {
  const payload = new TextEncoder().encode(JSON.stringify(Object.fromEntries(FIELDS.map((field) => [field, proof[field]]))));
  const result = new Uint8Array(DOMAIN.length + payload.length);
  result.set(DOMAIN);
  result.set(payload, DOMAIN.length);
  return result;
}

function base64url(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('UNAUTHORIZED');
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (base64url(bytes) !== value) throw new Error('UNAUTHORIZED');
  return bytes;
}

export function parseEsimCloudProof(header: string | null): EsimCloudProof | null {
  if (!header?.startsWith(ESIM_CLOUD_PROOF_SCHEME) || header.length > 8192) return null;
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decode(header.slice(ESIM_CLOUD_PROOF_SCHEME.length))));
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).sort().join(',') !== [...FIELDS, 'signature'].sort().join(',') ||
        value.schema !== ESIM_CLOUD_PROOF_SCHEMA ||
        ![value.accessKeyId, value.requestId].every((id) => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) ||
        !['ES256', 'Ed25519'].includes(value.signatureAlgorithm) ||
        !['GET', 'POST', 'PATCH', 'DELETE'].includes(value.method) ||
        typeof value.url !== 'string' || value.url.length > 2048 ||
        typeof value.bodySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.bodySha256) ||
        !Number.isSafeInteger(value.issuedAt) || value.issuedAt < 0 || !Number.isSafeInteger(value.expiresAt) ||
        typeof value.signature !== 'string' || decode(value.signature).length !== 64) return null;
    return value;
  } catch { return null; }
}

export function esimCloudProofAuthorization(proof: EsimCloudProof) {
  return ESIM_CLOUD_PROOF_SCHEME + base64url(new TextEncoder().encode(JSON.stringify(proof)));
}

export async function esimCloudRequestBodySha256(request: Request) {
  const reader = request.clone().body?.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        throw new Error('UNAUTHORIZED');
      }
      chunks.push(value);
    }
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', body));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function esimCloudProofTransportAllowed(url: URL) {
  return !url.username && !url.password && !url.hash &&
    (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
}

export async function verifyEsimCloudProof(request: Request, proof: EsimCloudProof,
  key: { algorithm: 'ES256' | 'Ed25519'; publicKey: Uint8Array }, now = Date.now()) {
  if (!Number.isSafeInteger(now) || !esimCloudProofTransportAllowed(new URL(request.url)) ||
      proof.method !== request.method || proof.url !== request.url || proof.signatureAlgorithm !== key.algorithm ||
      proof.issuedAt > now + 5000 || proof.expiresAt <= now || proof.expiresAt <= proof.issuedAt ||
      proof.expiresAt - proof.issuedAt > ESIM_CLOUD_PROOF_TTL_MS) return false;
  try {
    if (proof.bodySha256 !== await esimCloudRequestBodySha256(request)) return false;
    const publicKey = await crypto.subtle.importKey('raw', new Uint8Array(key.publicKey),
      key.algorithm === 'ES256' ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify(key.algorithm === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'Ed25519' },
      publicKey, new Uint8Array(decode(proof.signature)), new Uint8Array(esimCloudProofSigningBytes(proof)));
  } catch { return false; }
}

/** Native adapters supply a signer; never export or upload their private key. ES256 signatures use 64-byte P1363 form. */
export async function signEsimCloudRequest(request: Request, accessKeyId: string, algorithm: 'ES256' | 'Ed25519',
  signer: (bytes: Uint8Array) => Promise<Uint8Array>, now = Date.now()) {
  if (!esimCloudProofTransportAllowed(new URL(request.url))) throw new Error('CLOUD_ACCESS_HTTPS_REQUIRED');
  const proof: EsimCloudProof = {
    schema: ESIM_CLOUD_PROOF_SCHEMA, accessKeyId, requestId: crypto.randomUUID(), signatureAlgorithm: algorithm,
    method: request.method, url: request.url, bodySha256: await esimCloudRequestBodySha256(request),
    issuedAt: now, expiresAt: now + ESIM_CLOUD_PROOF_TTL_MS, signature: '',
  };
  proof.signature = base64url(await signer(esimCloudProofSigningBytes(proof)));
  const authorization = esimCloudProofAuthorization(proof);
  if (!parseEsimCloudProof(authorization)) throw new Error('CLOUD_ACCESS_INVALID_PROOF');
  const headers = new Headers(request.headers);
  headers.set('Authorization', authorization);
  return new Request(request, { headers, redirect: 'error' });
}
