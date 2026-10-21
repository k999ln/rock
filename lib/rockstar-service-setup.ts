import { sha256Hex } from './rockstar-entitlement-claim.ts';
import { parseLinuxTerms, type LinuxTerms } from './sky-linux-service.ts';

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
