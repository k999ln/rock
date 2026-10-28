import { sha256Hex } from './rockstar-entitlement-claim.ts';
import { parseLinuxTerms, type LinuxTerms } from './sky-linux-service.ts';
import { verifyServiceAttachment, type AttachmentFacts } from './rockstar-service-attachment.ts';

export class ServiceSetupError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}
export type ServiceSetup = {
  schema: 'rockstar.service-setup/1';
  id: string;
  ownerId: string;
  orderId: string;
  deviceRef: string;
  terms: LinuxTerms;
  quoteDigest: string;
  quotedAt: number;
  expiresAt: number;
  acceptedAt: number | null;
  agreementDigest: string | null;
  billing: {
    requestedAt: number | null;
    sessionId: string | null;
    setupIntentId: string | null;
    paymentMethodId: string | null;
    verifiedAt: number | null;
  };
  workspaceId: string | null;
  runtime: {
    challenge: string;
    requestedAt: number | null;
    verifiedAt: number | null;
    receiptDigest: string | null;
  };
};
export type ServiceSetupReadiness = {
  enabled: boolean;
  osReady: boolean;
  buildId: string | null;
  reason: 'module_disabled' | 'os_pending' | 'os_policy_invalid' | null;
};
export type ServiceSetupConfig = {
  ROCKSTAR_SERVICE_SETUP_ENABLED?: string;
  ROCKSTAR_OS_SERVICE_ACCEPTANCE_JSON?: string;
};
/** Operator-owned acceptance record. A client cannot set the OS release gate. */
export function serviceSetupReadiness(
  config: ServiceSetupConfig,
): ServiceSetupReadiness {
  if (config.ROCKSTAR_SERVICE_SETUP_ENABLED !== 'true')
    return {
      enabled: false,
      osReady: false,
      buildId: null,
      reason: 'module_disabled',
    };
  if (!config.ROCKSTAR_OS_SERVICE_ACCEPTANCE_JSON)
    return {
      enabled: true,
      osReady: false,
      buildId: null,
      reason: 'os_pending',
    };
  try {
    const p = JSON.parse(config.ROCKSTAR_OS_SERVICE_ACCEPTANCE_JSON);
    const capabilities = [
      'owner_auth',
      'entitlement',
      'permissions_budget',
      'private_storage_recovery',
      'sky_eve_entry',
    ];
    if (
      p.schema !== 'rockstar.os-service-acceptance/1' ||
      p.model !== 'Pixel 10' ||
      p.sku !== 'GL066' ||
      p.codename !== 'frankel' ||
      p.status !== 'accepted' ||
      typeof p.buildId !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(p.buildId) ||
      typeof p.evidenceSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(p.evidenceSha256) ||
      !Array.isArray(p.capabilities) ||
      !capabilities.every((c) => p.capabilities.includes(c))
    )
      throw new Error();
    return { enabled: true, osReady: true, buildId: p.buildId, reason: null };
  } catch {
    return {
      enabled: true,
      osReady: false,
      buildId: null,
      reason: 'os_policy_invalid',
    };
  }
}
export function requireServiceSetupReady(config: ServiceSetupConfig) {
  if (!serviceSetupReadiness(config).osReady)
    throw new ServiceSetupError(
      'OSの受入完了後に組み込む機能です。現在は利用開始と課金を停止しています。',
      503,
    );
}
export function setupId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:@-]{1,160}$/.test(value))
    throw new ServiceSetupError('対象の識別子を確認してください。', 400);
  return value;
}
export async function createServiceSetup(
  ownerId: string,
  orderId: string,
  deviceRef: string,
  termsValue: unknown,
  now = Date.now(),
): Promise<ServiceSetup> {
  const terms = parseLinuxTerms(termsValue);
  const quote = {
    schema: 'rockstar.service-quote/1',
    id: crypto.randomUUID(),
    ownerId,
    orderId: setupId(orderId),
    deviceRef: setupId(deviceRef),
    terms,
    billingTiming: 'monthly_arrears',
    initialChargeMinor: 0,
    quotedAt: now,
    expiresAt: now + 86400000,
  };
  return {
    schema: 'rockstar.service-setup/1',
    id: quote.id,
    ownerId,
    orderId,
    deviceRef,
    terms,
    quoteDigest: await sha256Hex(JSON.stringify(quote)),
    quotedAt: now,
    expiresAt: quote.expiresAt,
    acceptedAt: null,
    agreementDigest: null,
    billing: {
      requestedAt: null,
      sessionId: null,
      setupIntentId: null,
      paymentMethodId: null,
      verifiedAt: null,
    },
    workspaceId: null,
    runtime: {
      challenge: crypto.randomUUID(),
      requestedAt: null,
      verifiedAt: null,
      receiptDigest: null,
    },
  };
}
export async function acceptServiceSetup(
  setup: ServiceSetup,
  digest: unknown,
  accepted: unknown,
  recurringAccepted: unknown,
  now = Date.now(),
) {
  if (
    accepted !== true ||
    recurringAccepted !== true ||
    digest !== setup.quoteDigest
  )
    throw new ServiceSetupError(
      '料金・上限・停止条件と、月末の継続請求へ同意してください。',
      400,
    );
  if (setup.acceptedAt !== null) return setup;
  if (now >= setup.expiresAt)
    throw new ServiceSetupError('請求内容の有効期限が切れました。');
  const agreement = {
    schema: 'rockstar.service-agreement/1',
    quoteDigest: setup.quoteDigest,
    ownerId: setup.ownerId,
    orderId: setup.orderId,
    deviceRef: setup.deviceRef,
    billingTiming: 'monthly_arrears',
    recurringAccepted: true,
    acceptedAt: now,
  };
  return {
    ...setup,
    acceptedAt: now,
    agreementDigest: await sha256Hex(JSON.stringify(agreement)),
  };
}
export type SetupFacts = {
  readiness: ServiceSetupReadiness;
  currentGrant: boolean;
  workspaceMatches: boolean;
  linuxCanExecute: boolean;
  linuxReason: string | null;
};

export type ServiceAccessRequest = {
  ownerId: string;
  workspaceId: string;
  deviceKeyThumbprint: string;
  requiredScope: string;
  requestDigest: string;
};
/** Proposed server adapter contract, not a browser payload or a new persisted record.
 * Read a consistent current revision from existing authorities on EVERY call.
 * Retention permissions come from the owner-scoped artifact/recovery authority.
 */
export type ServiceAccessSnapshot = {
  schema: 'rockstar.service-access-authorities/1';
  revision: number;
  observedAt: number;
  validUntil: number;
  ownerId: string;
  workspaceId: string;
  telecom: 'online' | 'offline' | 'unknown';
  profile: 'installed' | 'not_required' | 'unknown';
  client: 'supported' | 'unsupported' | 'unknown';
  setup: ServiceSetup | null;
  setupFacts: SetupFacts;
  attachment: unknown;
  attachmentFacts: AttachmentFacts;
  // Current server authority independently binds contract and current rate consent.
  agreementDigest: string | null;
  payment: 'current' | 'restricted' | 'unknown';
  pricePolicy: 'resolved' | 'unresolved';
  budget: { state: 'reserved' | 'unavailable' | 'unknown'; requestDigest: string };
  retained: { ownerId: string; workspaceId: string; read: boolean; export: boolean };
};

/** Server composition only. Never expose readCurrent/resolveKey as request input.
 * This is an eligibility check, NOT a reusable dispatch permit: the Broker must
 * atomically recheck revision/epoch and consume the existing budget reservation.
 * No production adapter is enabled here; legacy onboarding views stay unchanged.
 */
export function serviceAccessEvaluator(authorities: {
  readCurrent: (request: ServiceAccessRequest, now: number) => Promise<ServiceAccessSnapshot | null>;
  resolveKey: (issuerId: string, keyId: string) => Promise<Uint8Array | null>;
}) {
  return async (request: ServiceAccessRequest, now = Date.now()) => {
    const denied = { canDispatch: false, canRead: false, canExport: false, revision: null as number | null };
    // Only authenticated, current retention authority may advance this fallback.
    // Subsequent failures in dispatch data must not erase granted recovery access.
    let result = denied;
    const digest = /^[a-f0-9]{64}$/;
    if (!request || !Number.isSafeInteger(now) ||
      ![request.ownerId, request.workspaceId, request.requiredScope].every((v) =>
        typeof v === 'string' && /^[A-Za-z0-9._:@-]{1,160}$/.test(v)) ||
      !digest.test(request.deviceKeyThumbprint) || !digest.test(request.requestDigest)) return denied;
    const boundRequest = { ownerId: request.ownerId, workspaceId: request.workspaceId,
      deviceKeyThumbprint: request.deviceKeyThumbprint, requiredScope: request.requiredScope,
      requestDigest: request.requestDigest };
    function retention(s: ServiceAccessSnapshot | null) {
      if (!s || !s.retained || s.schema !== 'rockstar.service-access-authorities/1' ||
        !Number.isSafeInteger(s.revision) || s.revision < 0 ||
        !Number.isSafeInteger(s.observedAt) || !Number.isSafeInteger(s.validUntil) ||
        s.observedAt > now || s.validUntil <= now ||
        s.ownerId !== boundRequest.ownerId || s.workspaceId !== boundRequest.workspaceId ||
        s.attachmentFacts?.ownerAuthenticated !== true ||
        s.attachmentFacts.ownerRef !== boundRequest.ownerId ||
        s.attachmentFacts.workspaceId !== boundRequest.workspaceId) return denied;
      const retained = s.retained?.ownerId === boundRequest.ownerId &&
        s.retained.workspaceId === boundRequest.workspaceId;
      return { ...denied, revision: s.revision,
        canRead: retained && s.retained.read === true,
        canExport: retained && s.retained.export === true };
    }
    try {
      const live = await authorities.readCurrent({ ...boundRequest }, now);
      const s = structuredClone(live);
      result = retention(s);
      if (!s || result.revision === null) return result;
      const snapshotBytes = JSON.stringify(s);
      const setup = s.setup;
      if (!setup || typeof setup !== 'object' || Array.isArray(setup) ||
        setup.schema !== 'rockstar.service-setup/1' ||
        !setup.billing || typeof setup.billing !== 'object' || Array.isArray(setup.billing) ||
        !setup.runtime || typeof setup.runtime !== 'object' || Array.isArray(setup.runtime) ||
        !setup.terms || typeof setup.terms !== 'object' || Array.isArray(setup.terms) ||
        setup.ownerId !== boundRequest.ownerId ||
        setup.workspaceId !== boundRequest.workspaceId ||
        !digest.test(s.agreementDigest ?? '') || setup.agreementDigest !== s.agreementDigest ||
        !Number.isSafeInteger(setup.acceptedAt) || (setup.acceptedAt as number) > now ||
        !Number.isSafeInteger(setup.billing.verifiedAt) || (setup.billing.verifiedAt as number) > now ||
        !Number.isSafeInteger(setup.runtime.verifiedAt) || (setup.runtime.verifiedAt as number) > now ||
        !digest.test(setup.runtime.receiptDigest ?? '') ||
        s.setupFacts.readiness.enabled !== true || s.setupFacts.readiness.osReady !== true ||
        s.setupFacts.currentGrant !== true || s.setupFacts.workspaceMatches !== true ||
        s.setupFacts.linuxCanExecute !== true ||
        s.client !== 'supported' || !['installed', 'not_required'].includes(s.profile) ||
        s.payment !== 'current' || s.pricePolicy !== 'resolved' ||
        s.budget.state !== 'reserved' || s.budget.requestDigest !== boundRequest.requestDigest ||
        s.attachmentFacts.ownerAuthenticated !== true ||
        s.attachmentFacts.deviceApproved !== true || s.attachmentFacts.deviceProofVerified !== true ||
        s.attachmentFacts.deviceRevoked !== false || s.attachmentFacts.issuerProfileActive !== true ||
        setup.terms.version !== s.attachmentFacts.contractVersion ||
        s.attachmentFacts.deviceKeyThumbprint !== boundRequest.deviceKeyThumbprint ||
        s.attachmentFacts.requiredScope !== boundRequest.requiredScope) return result;
      // No implicit cast/migration of legacy or malformed persisted terms.
      parseLinuxTerms(setup.terms);
      const attachment = await verifyServiceAttachment(
        s.attachment, s.attachmentFacts, authorities.resolveKey, now,
      );
      // The supplied snapshot may have changed or had nested facts replaced while
      // key resolution/crypto awaited. Recheck every authority, including retention.
      // This is object binding only: it does not read a parent DB or issue a Broker permit.
      let current: ServiceAccessSnapshot | null;
      try { current = structuredClone(live); } catch { return denied; }
      const retainedNow = retention(current);
      result = { ...retainedNow,
        canRead: result.canRead && retainedNow.canRead,
        canExport: result.canExport && retainedNow.canExport };
      return { ...result, canDispatch: attachment !== null &&
        JSON.stringify(current) === snapshotBytes };
    } catch {
      // Before retention authorization: all denied. After it: dispatch alone fails.
      return result;
    }
  };
}
/** Facts are read by the server from existing authorities, never posted by a browser. */
export function serviceSetupView(
  setup: ServiceSetup | null,
  facts: SetupFacts,
) {
  let state: string;
  if (!facts.readiness.osReady) state = 'deferred_until_os_ready';
  else if (!setup) state = 'profile_required';
  else if (!facts.currentGrant) state = 'profile_verification_required';
  else if (setup.acceptedAt === null) state = 'contract_required';
  else if (setup.billing.verifiedAt === null)
    state =
      setup.billing.requestedAt === null
        ? 'billing_setup_required'
        : 'billing_verification_required';
  else if (!setup.workspaceId || !facts.workspaceMatches)
    state = 'environment_required';
  else if (!facts.linuxCanExecute) state = 'service_restricted';
  else if (setup.runtime.verifiedAt === null)
    state = 'environment_verification_required';
  else state = 'active';
  return {
    state,
    canOpenSkyEve: state === 'active',
    dataRetained: true,
    reason:
      state === 'service_restricted'
        ? facts.linuxReason
        : facts.readiness.reason,
    initialChargeMinor: 0,
    billingTiming: 'monthly_arrears',
    // A setup receipt proves a payment method was registered, never that money was received.
    paymentCollected: false,
    skyPath: state === 'active' ? '/sky' : null,
    evePath: state === 'active' ? '/chat' : null,
  };
}
