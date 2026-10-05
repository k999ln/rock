import {
  ROCKSTAR_ENTITLEMENT_CLAIM_SCHEMA,
  rockstarEntitlementClaimSigningBytes,
  type RockstarEntitlementClaim,
  sha256Hex,
} from './rockstar-entitlement-claim.ts';
import {
  ROCKSTAR_ENTITLEMENT_EVENT_SCHEMA,
  rockstarEntitlementEventSigningBytes,
  type RockstarEntitlementEvent,
} from './rockstar-entitlement-event.ts';

const claimScopes = new Set(['rockstaros_access', 'sky', 'zema', 'agents']);
const idPattern = /^[A-Za-z0-9._:-]{1,128}$/;

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function randomBytes(length: number) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function assertSigningKey(privateKey: CryptoKey) {
  if (privateKey.type !== 'private' || privateKey.algorithm.name !== 'Ed25519' || privateKey.extractable ||
      !privateKey.usages.includes('sign')) {
    throw new Error('ISSUER_SIGNING_KEY_INVALID');
  }
}

export type RockstarEntitlementClaimIssue = {
  issuerId: string;
  issuerKeyId: string;
  offerId: string;
  purchaseReferenceSha256: string;
  formFactor: RockstarEntitlementClaim['formFactor'];
  scopes: string[];
  expiresAt?: number | null;
};

/** Create a one-time seller handoff; caller must deliver claimCode through a secret-safe channel. */
export async function issueRockstarEntitlementClaim(
  input: RockstarEntitlementClaimIssue,
  privateKey: CryptoKey,
  now = Date.now(),
) {
  assertSigningKey(privateKey);
  if (!idPattern.test(input.issuerId) || !idPattern.test(input.issuerKeyId) || !idPattern.test(input.offerId) ||
    !/^[a-f0-9]{64}$/.test(input.purchaseReferenceSha256) ||
    !['physical_sim', 'esim', 'service_only'].includes(input.formFactor) ||
    !Array.isArray(input.scopes) || input.scopes.length < 1 || input.scopes.length > claimScopes.size ||
    input.scopes.some((scope) => !claimScopes.has(scope)) || new Set(input.scopes).size !== input.scopes.length ||
    !Number.isSafeInteger(now) || now < 0) throw new Error('ISSUER_CLAIM_INPUT_INVALID');
  const expiresAt = input.expiresAt ?? null;
  if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + 10 * 365 * 24 * 60 * 60 * 1000)) {
    throw new Error('ISSUER_CLAIM_EXPIRY_INVALID');
  }
  const claimCode = `rsk_${base64url(randomBytes(32))}`;
  const claim: RockstarEntitlementClaim = {
    schema: ROCKSTAR_ENTITLEMENT_CLAIM_SCHEMA,
    issuerId: input.issuerId,
    issuerKeyId: input.issuerKeyId,
    claimId: `claim:${base64url(randomBytes(18))}`,
    offerId: input.offerId,
    purchaseReferenceSha256: input.purchaseReferenceSha256,
    claimCodeSha256: await sha256Hex(claimCode),
    formFactor: input.formFactor,
    scopes: [...input.scopes],
    issuedAt: now,
    expiresAt,
    signature: '',
  };
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, rockstarEntitlementClaimSigningBytes(claim));
  claim.signature = base64url(new Uint8Array(signature));
  return { claim, claimCode };
}

export async function issueRockstarEntitlementEvent(
  input: Pick<RockstarEntitlementEvent, 'issuerId' | 'issuerKeyId' | 'claimId' | 'purchaseReferenceSha256' | 'eventType'>,
  privateKey: CryptoKey,
  now = Date.now(),
) {
  assertSigningKey(privateKey);
  if (!idPattern.test(input.issuerId) || !idPattern.test(input.issuerKeyId) || !idPattern.test(input.claimId) ||
    !/^[a-f0-9]{64}$/.test(input.purchaseReferenceSha256) || !['refunded', 'revoked'].includes(input.eventType) ||
    !Number.isSafeInteger(now) || now < 0) throw new Error('ISSUER_EVENT_INPUT_INVALID');
  const event: RockstarEntitlementEvent = {
    schema: ROCKSTAR_ENTITLEMENT_EVENT_SCHEMA,
    ...input,
    eventId: `event:${base64url(randomBytes(18))}`,
    issuedAt: now,
    signature: '',
  };
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, rockstarEntitlementEventSigningBytes(event));
  event.signature = base64url(new Uint8Array(signature));
  return event;
}

/**
 * Prepare replacement material without delivering it. Callers must submit and
 * confirm the cancellation before exposing the replacement package.
 */
export async function replaceRockstarEntitlementClaim(
  input: RockstarEntitlementClaimIssue & { replacedClaimId: string },
  privateKey: CryptoKey,
  now = Date.now(),
) {
  const cancellation = await issueRockstarEntitlementEvent({
    issuerId: input.issuerId,
    issuerKeyId: input.issuerKeyId,
    claimId: input.replacedClaimId,
    purchaseReferenceSha256: input.purchaseReferenceSha256,
    eventType: 'revoked',
  }, privateKey, now);
  const replacement = await issueRockstarEntitlementClaim(input, privateKey, now);
  return { cancellation, replacement };
}

export type RockstarEntitlementCancellationAcknowledgement = {
  eventId: string;
  status: 'revoked';
  alreadyApplied: boolean;
};

/**
 * Seller-channel handoff that enforces cancellation acknowledgement before a
 * replacement package can be delivered. The cancellation callback must submit
 * with the event ID as its idempotency key and return only after the authority
 * confirms that exact event. The delivery callback should durably retain the
 * package by its stable claim ID before sending it to the purchaser.
 */
export async function replaceRockstarEntitlementClaimWithAcknowledgement(
  material: Awaited<ReturnType<typeof replaceRockstarEntitlementClaim>>,
  callbacks: {
    submitCancellation: (
      event: RockstarEntitlementEvent,
      idempotencyKey: string,
    ) => Promise<RockstarEntitlementCancellationAcknowledgement>;
    deliverReplacement: (
      packageValue: { claim: RockstarEntitlementClaim; claimCode: string },
      idempotencyKey: string,
    ) => Promise<void>;
  },
) {
  const { cancellation, replacement } = material;
  if (cancellation.eventType !== 'revoked' || cancellation.issuerId !== replacement.claim.issuerId ||
      cancellation.purchaseReferenceSha256 !== replacement.claim.purchaseReferenceSha256 ||
      cancellation.claimId === replacement.claim.claimId) {
    throw new Error('ISSUER_REPLACEMENT_PACKAGE_MISMATCH');
  }
  const acknowledgement = await callbacks.submitCancellation(cancellation, cancellation.eventId);
  if (!acknowledgement || acknowledgement.eventId !== cancellation.eventId ||
      acknowledgement.status !== 'revoked' || typeof acknowledgement.alreadyApplied !== 'boolean') {
    throw new Error('ISSUER_CANCELLATION_UNCONFIRMED');
  }

  await callbacks.deliverReplacement(replacement, replacement.claim.claimId);
  return { cancellation, replacement, deliveryIdempotencyKey: replacement.claim.claimId };
}
