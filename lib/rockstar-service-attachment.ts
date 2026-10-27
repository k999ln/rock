/** A service attachment is a short lived access binding, never issuer or SIM proof. */
export const SERVICE_ATTACHMENT_SCHEMA = 'rockstar.service-attachment/1' as const;
const DOMAIN = new TextEncoder().encode('rockstar.service-attachment.signature/1\0');
const FIELDS = [
  'schema', 'issuerId', 'keyId', 'attachmentId', 'ownerRef', 'contractId',
  'contractVersion', 'workspaceId', 'deviceKeyThumbprint',
  'parentEntitlementId', 'parentEntitlementEpoch', 'scope',
  'capabilityProfileHash', 'manifestHash', 'audience', 'issuedAt',
  'expiresAt', 'nonce',
] as const;
const id = /^[A-Za-z0-9._:@-]{1,160}$/;
const digest = /^[a-f0-9]{64}$/;
const b64url = /^[A-Za-z0-9_-]{86}$/;

export type ServiceAttachment = {
  schema: typeof SERVICE_ATTACHMENT_SCHEMA;
  issuerId: string;
  keyId: string;
  attachmentId: string;
  ownerRef: string;
  contractId: string;
  contractVersion: string;
  workspaceId: string;
  deviceKeyThumbprint: string;
  parentEntitlementId: string;
  parentEntitlementEpoch: number;
  scope: string[];
  capabilityProfileHash: string;
  manifestHash: string;
  audience: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  signature: string;
};

export type AttachmentFacts = {
  ownerAuthenticated: boolean;
  deviceApproved: boolean;
  deviceProofVerified: boolean;
  deviceRevoked: boolean;
  contractStatus: 'active' | 'grace' | 'restricted' | 'ended';
  issuerProfileActive: boolean;
  ownerRef: string;
  contractId: string;
  contractVersion: string;
  workspaceId: string;
  deviceKeyThumbprint: string;
  parentEntitlementId: string;
  parentEntitlementEpoch: number;
  audience: string;
  allowedScopes: readonly string[];
  requiredScope: string;
  capabilityProfileHash: string;
  manifestHash: string;
};

function decodeSignature(value: string): Uint8Array | null {
  if (!b64url.test(value)) return null;
  const raw = Uint8Array.from(
    atob(value.replaceAll('-', '+').replaceAll('_', '/') + '=='),
    (character) => character.charCodeAt(0),
  );
  if (raw.length !== 64) return null;
  const canonical = btoa(String.fromCharCode(...raw))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  return canonical === value ? raw : null;
}

/** The field order and domain are fixed so every implementation signs identical bytes. */
export function serviceAttachmentSigningBytes(
  attachment: Omit<ServiceAttachment, 'signature'>,
): Uint8Array {
  const ordered = Object.fromEntries(FIELDS.map((key) => [key, attachment[key]]));
  const body = new TextEncoder().encode(JSON.stringify(ordered));
  const result = new Uint8Array(DOMAIN.length + body.length);
  result.set(DOMAIN);
  result.set(body, DOMAIN.length);
  return result;
}

function attachmentMatchesFacts(a: ServiceAttachment, facts: AttachmentFacts): boolean {
  return !!facts.ownerAuthenticated && !!facts.deviceApproved && !!facts.deviceProofVerified &&
    !facts.deviceRevoked && facts.contractStatus === 'active' && !!facts.issuerProfileActive &&
    a.ownerRef === facts.ownerRef && a.contractId === facts.contractId &&
    a.contractVersion === facts.contractVersion && a.workspaceId === facts.workspaceId &&
    a.deviceKeyThumbprint === facts.deviceKeyThumbprint &&
    a.parentEntitlementId === facts.parentEntitlementId &&
    a.parentEntitlementEpoch === facts.parentEntitlementEpoch &&
    a.audience === facts.audience && a.capabilityProfileHash === facts.capabilityProfileHash &&
    a.manifestHash === facts.manifestHash &&
    a.scope.every((scope) => facts.allowedScopes.includes(scope)) &&
    a.scope.includes(facts.requiredScope);
}

/** Recheck these live facts on issue, renewal, and every new dispatch. */
export async function verifyServiceAttachment(
  value: unknown,
  facts: AttachmentFacts,
  resolveKey: (issuerId: string, keyId: string) => Promise<Uint8Array | null>,
  now = Date.now(),
): Promise<ServiceAttachment | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  // Bind validation, key lookup, signature bytes and the returned value to one
  // detached input. Callers may still mutate their object while crypto awaits.
  let a: ServiceAttachment;
  try { a = structuredClone(value) as ServiceAttachment; } catch { return null; }
  if (Object.keys(a).sort().join(',') !== [...FIELDS, 'signature'].sort().join(',')) return null;
  if (a.schema !== SERVICE_ATTACHMENT_SCHEMA ||
    ![a.issuerId, a.keyId, a.attachmentId, a.ownerRef, a.contractId,
      a.contractVersion, a.workspaceId, a.parentEntitlementId, a.audience,
      a.nonce].every((v) => typeof v === 'string' && id.test(v)) ||
    ![a.deviceKeyThumbprint, a.capabilityProfileHash, a.manifestHash]
      .every((v) => typeof v === 'string' && digest.test(v)) ||
    !Number.isSafeInteger(a.parentEntitlementEpoch) || a.parentEntitlementEpoch < 0 ||
    !Number.isSafeInteger(a.issuedAt) || !Number.isSafeInteger(a.expiresAt) ||
    a.issuedAt > now + 30_000 || a.expiresAt <= now ||
    a.expiresAt <= a.issuedAt || a.expiresAt - a.issuedAt > 15 * 60_000 ||
    !Array.isArray(a.scope) || a.scope.length === 0 || a.scope.length > 32 ||
    a.scope.some((s) => typeof s !== 'string' || !id.test(s)) ||
    new Set(a.scope).size !== a.scope.length ||
    !attachmentMatchesFacts(a, facts)) return null;
  let signature: Uint8Array | null;
  try { signature = decodeSignature(a.signature); } catch { return null; }
  if (!signature) return null;
  try {
    const signingBytes = serviceAttachmentSigningBytes(a);
    const raw = await resolveKey(a.issuerId, a.keyId);
    if (!raw || raw.length !== 32) return null;
    const key = await crypto.subtle.importKey('raw', raw as BufferSource, 'Ed25519', false, ['verify']);
    const verified = await crypto.subtle.verify('Ed25519', key, signature as BufferSource,
      signingBytes as BufferSource);
    // This only rechecks the supplied host facts, not a parent DB or Broker.
    return verified && attachmentMatchesFacts(a, facts) ? a : null;
  } catch { return null; }
}
