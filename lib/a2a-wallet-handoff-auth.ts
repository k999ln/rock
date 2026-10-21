import type { A2ATrustedBrokerKeyResolver } from './a2a-broker-authorization.ts';

export const A2A_WALLET_HANDOFF_REQUEST_SCHEMA =
  'rock-a2a-wallet-handoff-request/1' as const;
const DOMAIN = new TextEncoder().encode('rock-a2a-wallet-handoff-request-signature/1\0');
const MAX_REQUEST_AGE_MS = 5 * 60_000;

export type A2AWalletHandoffRequest = {
  schema: typeof A2A_WALLET_HANDOFF_REQUEST_SCHEMA;
  authorityId: string;
  ownerUserId: string;
  deviceRef: string;
  delegationId: string;
  requestId: string;
  requestedAt: number;
  keyId: string;
  signature: string;
};

const SIGNED_FIELDS = [
  'schema', 'authorityId', 'ownerUserId', 'deviceRef', 'delegationId',
  'requestId', 'requestedAt', 'keyId',
] as const;
const identifier = /^[A-Za-z0-9._:-]{1,128}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactShape(value: Record<string, unknown>) {
  const expected = [...SIGNED_FIELDS, 'signature'].sort();
  return Object.keys(value).length === expected.length &&
    Object.keys(value).sort().every((key, index) => key === expected[index]);
}

function payload(request: A2AWalletHandoffRequest) {
  return JSON.stringify(Object.fromEntries(SIGNED_FIELDS.map((key) => [key, request[key]])));
}

export function a2aWalletHandoffSigningBytes(request: A2AWalletHandoffRequest) {
  const body = new TextEncoder().encode(payload(request));
  const bytes = new Uint8Array(DOMAIN.length + body.length);
  bytes.set(DOMAIN);
  bytes.set(body, DOMAIN.length);
  return bytes;
}

/** Build a short-lived read-only handoff request with the enrolled Broker key. */
export async function createA2AWalletHandoffRequest(
  identity: Omit<A2AWalletHandoffRequest, 'schema' | 'signature' | 'requestedAt'> & { requestedAt?: number },
  sign: (message: Uint8Array) => Promise<Uint8Array>,
  now = Date.now(),
): Promise<A2AWalletHandoffRequest> {
  const request: A2AWalletHandoffRequest = {
    schema: A2A_WALLET_HANDOFF_REQUEST_SCHEMA,
    authorityId: identity.authorityId,
    ownerUserId: identity.ownerUserId,
    deviceRef: identity.deviceRef,
    delegationId: identity.delegationId,
    requestId: identity.requestId,
    requestedAt: identity.requestedAt ?? now,
    keyId: identity.keyId,
    signature: '',
  };
  if (!validUnsignedRequest(request, now)) throw new TypeError('invalid A2A wallet handoff request');
  const signature = await sign(a2aWalletHandoffSigningBytes(request));
  if (!(signature instanceof Uint8Array) || signature.length !== 64)
    throw new TypeError('64-byte Broker signature required');
  request.signature = toBase64Url(signature);
  return request;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(value)) return null;
  try {
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + '==');
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return bytes.length === 64 && toBase64Url(bytes) === value ? bytes : null;
  } catch {
    return null;
  }
}

function validUnsignedRequest(value: A2AWalletHandoffRequest, now: number) {
  return value.schema === A2A_WALLET_HANDOFF_REQUEST_SCHEMA &&
    [value.authorityId, value.ownerUserId, value.deviceRef, value.delegationId, value.keyId]
      .every((part) => typeof part === 'string' && identifier.test(part)) &&
    typeof value.requestId === 'string' && uuid.test(value.requestId) &&
    Number.isSafeInteger(value.requestedAt) && value.requestedAt > 0 &&
    value.requestedAt <= now + 30_000 && now - value.requestedAt <= MAX_REQUEST_AGE_MS;
}

export async function verifyA2AWalletHandoffRequest(
  value: unknown,
  resolveTrustedKey: A2ATrustedBrokerKeyResolver,
  now = Date.now(),
) {
  if (!isRecord(value) || !exactShape(value)) return null;
  const request = value as unknown as A2AWalletHandoffRequest;
  if (!validUnsignedRequest(request, now)) return null;
  const signature = fromBase64Url(request.signature);
  if (!signature) return null;
  let publicKey: Uint8Array | null;
  try {
    publicKey = await resolveTrustedKey({
      authorityId: request.authorityId,
      ownerUserId: request.ownerUserId,
      deviceRef: request.deviceRef,
      keyId: request.keyId,
    });
  } catch {
    return null;
  }
  if (!(publicKey instanceof Uint8Array) || (publicKey.length !== 32 &&
      !(publicKey.length === 65 && publicKey[0] === 4))) return null;
  try {
    const p256 = publicKey.length === 65;
    const key = await crypto.subtle.importKey(
      'raw', new Uint8Array(publicKey).buffer as ArrayBuffer,
      p256 ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'Ed25519' }, false, ['verify'],
    );
    const valid = await crypto.subtle.verify(
      p256 ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'Ed25519' }, key,
      new Uint8Array(signature).buffer as ArrayBuffer,
      a2aWalletHandoffSigningBytes(request).buffer as ArrayBuffer,
    );
    return valid ? request : null;
  } catch {
    return null;
  }
}
