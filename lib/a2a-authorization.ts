import type { A2ADelegationInput } from './a2a-delegation-store';

export type A2AApprovalIntent = Omit<
  A2ADelegationInput,
  | 'idempotencyKey' | 'inputSha256' | 'authorizationSha256' | 'priceQuoteDigest' | 'priceQuote'
  | 'packageRuntimeBindingId' | 'packageRuntimeBindingDigest'
> & {
  ownerUserId: string;
  message: string;
  priceQuoteDigest?: string;
  packageRuntimeBindingDigest?: string;
};

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function createA2AIntentDigests(intent: A2AApprovalIntent) {
  const inputSha256 = await sha256(intent.message);
  const authorizationIntent = {
      ownerUserId: intent.ownerUserId,
      id: intent.id,
      parentJobId: intent.parentJobId,
      messageId: intent.messageId,
      targetOrigin: intent.targetOrigin,
      targetAgentName: intent.targetAgentName,
      targetAgentVersion: intent.targetAgentVersion,
      protocolVersion: intent.protocolVersion,
      inputSha256,
      budgetCurrency: intent.budgetCurrency,
      budgetLimitMinor: intent.budgetLimitMinor,
      parentBudgetLimitMinor: intent.parentBudgetLimitMinor,
      continueWhileDeviceOffline: intent.continueWhileDeviceOffline,
      deadlineAt: intent.deadlineAt,
  } as Record<string, unknown>;
  if (intent.priceQuoteDigest) authorizationIntent.priceQuoteDigest = intent.priceQuoteDigest;
  if (intent.packageRuntimeBindingDigest)
    authorizationIntent.packageRuntimeBindingDigest = intent.packageRuntimeBindingDigest;
  const authorizationSha256 = await sha256(JSON.stringify(authorizationIntent));
  return { inputSha256, authorizationSha256 };
}

export function a2aDelegationExecutionEnabled(value: unknown) {
  return value === 'true';
}

function publicHttpsOrigin(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.origin !== value ||
    url.port !== '' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !hostname.includes('.') ||
    hostname.endsWith('.') ||
    hostname.startsWith('[') ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
    ['.localhost', '.local', '.internal', '.test', '.invalid'].some((suffix) =>
      hostname.endsWith(suffix),
    )
  )
    return null;
  return url.origin;
}

/**
 * Cloudflare public egress is a platform capability, not owner consent. Only
 * connect to canonical HTTPS origins the operator configured for this Worker.
 * Empty or malformed configuration denies every origin.
 */
export function a2aEgressOriginAllowed(target: unknown, configuration: unknown) {
  if (typeof target !== 'string' || typeof configuration !== 'string')
    return false;
  const targetOrigin = publicHttpsOrigin(target);
  if (!targetOrigin || !configuration.trim() || configuration.length > 4096)
    return false;
  const entries = configuration.split(',').map((entry) => entry.trim());
  if (entries.length > 64 || entries.some((entry) => !entry)) return false;
  const allowed: string[] = [];
  for (const entry of entries) {
    const origin = publicHttpsOrigin(entry);
    if (!origin) return false;
    allowed.push(origin);
  }
  return allowed.includes(targetOrigin);
}
