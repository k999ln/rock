import { createA2AIntentDigests, type A2AApprovalIntent } from './a2a-authorization.ts';

export const A2A_BROKER_AUTHORIZATION_SCHEMA =
  'rock-a2a-broker-authorization/2' as const;
const DOMAIN = new TextEncoder().encode(
  'rock-a2a-broker-authorization-signature/2\0',
);
const MAX_PROOF_LIFETIME_MS = 5 * 60_000;

export type A2ABrokerAuthorization = {
  schema: typeof A2A_BROKER_AUTHORIZATION_SCHEMA;
  authorityId: string;
  ownerUserId: string;
  deviceRef: string;
  delegationId: string;
  parentJobId: string;
  messageId: string;
  targetOrigin: string;
  targetAgentName: string;
  targetAgentVersion: string;
  protocolVersion: string;
  inputSha256: string;
  budgetCurrency: string;
  budgetLimitMinor: number;
  continueWhileDeviceOffline: boolean;
  deadlineAt: number;
  authorizationSha256: string;
  issuedAt: number;
  expiresAt: number;
  keyId: string;
  signature: string;
};

export type A2ABrokerAuthorizationIntent = A2AApprovalIntent & {
  deviceRef: string;
};

export type A2ATrustedBrokerKeyResolver = (identity: {
  authorityId: string;
  ownerUserId: string;
  deviceRef: string;
  keyId: string;
}) => Promise<Uint8Array | null>;

export type StoredA2ABrokerAuthorization = {
  proofJson: string;
  deviceRef: string;
  authorityId: string;
  keyId: string;
  expiresAt: number;
};

const SIGNED_FIELDS = [
  'schema',
  'authorityId',
  'ownerUserId',
  'deviceRef',
  'delegationId',
  'parentJobId',
  'messageId',
  'targetOrigin',
  'targetAgentName',
  'targetAgentVersion',
  'protocolVersion',
  'inputSha256',
  'budgetCurrency',
  'budgetLimitMinor',
  'continueWhileDeviceOffline',
  'deadlineAt',
  'authorizationSha256',
  'issuedAt',
  'expiresAt',
  'keyId',
] as const;

function canonicalPayload(proof: A2ABrokerAuthorization) {
  // Keep the signed property order fixed and reject unknown fields separately.
  return JSON.stringify(Object.fromEntries(SIGNED_FIELDS.map((key) => [key, proof[key]])));
}

export function a2aBrokerAuthorizationSigningBytes(
  proof: A2ABrokerAuthorization,
) {
  const payload = new TextEncoder().encode(canonicalPayload(proof));
  const bytes = new Uint8Array(DOMAIN.length + payload.length);
  bytes.set(DOMAIN);
  bytes.set(payload, DOMAIN.length);
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}

function validHash(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
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

function exactShape(value: Record<string, unknown>) {
  const expected = [...SIGNED_FIELDS, 'signature'].sort();
  return (
    Object.keys(value).length === expected.length &&
    Object.keys(value).sort().every((key, index) => key === expected[index])
  );
}

function proofMatchesIntent(
  proof: A2ABrokerAuthorization,
  intent: A2ABrokerAuthorizationIntent,
) {
  return (
    proof.ownerUserId === intent.ownerUserId &&
    proof.deviceRef === intent.deviceRef &&
    proof.delegationId === intent.id &&
    proof.parentJobId === intent.parentJobId &&
    proof.messageId === intent.messageId &&
    proof.targetOrigin === intent.targetOrigin &&
    proof.targetAgentName === intent.targetAgentName &&
    proof.targetAgentVersion === intent.targetAgentVersion &&
    proof.protocolVersion === intent.protocolVersion &&
    proof.budgetCurrency === intent.budgetCurrency &&
    proof.budgetLimitMinor === intent.budgetLimitMinor &&
    proof.continueWhileDeviceOffline === intent.continueWhileDeviceOffline &&
    proof.deadlineAt === intent.deadlineAt
  );
}

/** Verify an owner-approved native Broker proof before any A2A network effect. */
export async function verifyA2ABrokerAuthorization(
  value: unknown,
  intent: A2ABrokerAuthorizationIntent,
  resolveTrustedKey: A2ATrustedBrokerKeyResolver,
  now = Date.now(),
) {
  if (intent.continueWhileDeviceOffline !== true) return false;
  if (!isRecord(value) || !exactShape(value)) return false;
  const proof = value as unknown as A2ABrokerAuthorization;
  if (
    proof.schema !== A2A_BROKER_AUTHORIZATION_SCHEMA ||
    !validId(proof.authorityId) ||
    !validId(proof.ownerUserId) ||
    !validId(proof.deviceRef) ||
    !validId(proof.delegationId) ||
    !validId(proof.parentJobId) ||
    !validId(proof.messageId) ||
    !validId(proof.keyId) ||
    !validHash(proof.inputSha256) ||
    !validHash(proof.authorizationSha256) ||
    typeof proof.targetOrigin !== 'string' ||
    typeof proof.targetAgentName !== 'string' ||
    !proof.targetAgentName.trim() ||
    typeof proof.targetAgentVersion !== 'string' ||
    !proof.targetAgentVersion.trim() ||
    proof.protocolVersion !== intent.protocolVersion ||
    !/^[A-Z]{3}$/.test(proof.budgetCurrency) ||
    !Number.isSafeInteger(proof.budgetLimitMinor) ||
    proof.budgetLimitMinor < 0 ||
    typeof proof.continueWhileDeviceOffline !== 'boolean' ||
    !Number.isSafeInteger(proof.deadlineAt) ||
    !Number.isSafeInteger(proof.issuedAt) ||
    !Number.isSafeInteger(proof.expiresAt) ||
    proof.issuedAt > now + 30_000 ||
    proof.expiresAt <= now ||
    proof.expiresAt <= proof.issuedAt ||
    proof.expiresAt - proof.issuedAt > MAX_PROOF_LIFETIME_MS ||
    proof.deadlineAt <= now ||
    proof.expiresAt > proof.deadlineAt
  )
    return false;

  let origin: string;
  try {
    const parsed = new URL(proof.targetOrigin);
    if (
      parsed.protocol !== 'https:' ||
      parsed.origin !== proof.targetOrigin ||
      parsed.port !== '' ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash ||
      !parsed.hostname.includes('.') ||
      parsed.hostname.endsWith('.') ||
      parsed.hostname.startsWith('[') ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsed.hostname) ||
      ['.localhost', '.local', '.internal', '.test', '.invalid'].some((suffix) =>
        parsed.hostname.toLowerCase().endsWith(suffix),
      )
    )
      return false;
    origin = parsed.origin;
  } catch {
    return false;
  }
  if (origin !== intent.targetOrigin || !proofMatchesIntent(proof, intent))
    return false;

  const { inputSha256, authorizationSha256 } =
    await createA2AIntentDigests(intent);
  if (
    proof.inputSha256 !== inputSha256 ||
    proof.authorizationSha256 !== authorizationSha256
  )
    return false;

  let publicKey: Uint8Array | null;
  try {
    publicKey = await resolveTrustedKey({
      authorityId: proof.authorityId,
      ownerUserId: proof.ownerUserId,
      deviceRef: proof.deviceRef,
      keyId: proof.keyId,
    });
  } catch {
    return false;
  }
  // Existing operator keys are raw Ed25519 (32 bytes). Android Key Attestation
  // emits a P-256 public point; support that separately (65-byte uncompressed SEC1).
  if (!(publicKey instanceof Uint8Array) || (publicKey.length !== 32 &&
      !(publicKey.length === 65 && publicKey[0] === 4)))
    return false;
  const signature = decodeBase64Url(proof.signature);
  if (!signature) return false;
  try {
    const p256 = publicKey.length === 65;
    const key = await crypto.subtle.importKey('raw',
      new Uint8Array(publicKey).buffer as ArrayBuffer,
      p256 ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'Ed25519' },
      false, ['verify']);
    return await crypto.subtle.verify(
      p256 ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'Ed25519' },
      key,
      new Uint8Array(signature).buffer as ArrayBuffer,
      a2aBrokerAuthorizationSigningBytes(proof).buffer as ArrayBuffer,
    );
  } catch {
    return false;
  }
}

export async function verifyStoredA2ABrokerAuthorization(
  stored: StoredA2ABrokerAuthorization | null,
  intent: A2ABrokerAuthorizationIntent,
  resolveTrustedKey: A2ATrustedBrokerKeyResolver,
  now = Date.now(),
) {
  if (!stored || stored.expiresAt <= now) return false;
  let proof: unknown;
  try {
    proof = JSON.parse(stored.proofJson);
  } catch {
    return false;
  }
  if (
    !isRecord(proof) ||
    proof.deviceRef !== stored.deviceRef ||
    proof.authorityId !== stored.authorityId ||
    proof.keyId !== stored.keyId ||
    proof.expiresAt !== stored.expiresAt
  )
    return false;
  return verifyA2ABrokerAuthorization(proof, intent, resolveTrustedKey, now);
}
