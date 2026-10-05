import {
  A2AClientError,
  A2AQuoteRequestIndeterminateError,
  createA2AClient,
} from './a2a-client.ts';
import { a2aEgressOriginAllowed } from './a2a-authorization.ts';
import type { StoredA2AAgent } from './a2a-agent-directory.ts';
import { parseStoredA2AAgent } from './a2a-agent-directory.ts';
import {
  a2aPriceQuoteDigest,
  verifyA2APriceQuote,
  type A2APriceQuote,
} from './a2a-price-quote.ts';
import {
  hasActiveA2AUsageKeyForOrigin,
  trustedA2AUsageKeyResolver,
} from './a2a-usage-receipt.ts';
import {
  packageRuntimeQuoteRequirementsMatch,
  skyPackageRuntimeBindingDigest,
  trustedSkyPackageRuntimeBindingKeyResolver,
  verifySkyPackageRuntimeBinding,
  type SkyPackageRuntimeBinding,
} from './sky-package-runtime-binding.ts';

export class A2APriceQuoteAcquisitionError extends Error {
  readonly code: string;
  readonly status: number;
  readonly quoteRequestId?: string;

  constructor(code: string, status: number, quoteRequestId?: string) {
    super(code);
    this.name = 'A2APriceQuoteAcquisitionError';
    this.code = code;
    this.status = status;
    this.quoteRequestId = quoteRequestId;
  }
}

export type A2APriceQuoteAcquisitionInput = {
  agent: StoredA2AAgent;
  quoteRequestId: string;
  message: string;
  currency: string;
  maximumBudgetMinor: number;
  expiresAt: number;
  consentToSharePromptForQuote: boolean;
  extensionUri: unknown;
  allowedOrigins: unknown;
  trustedUsageKeys: unknown;
  packageRuntimeTarget?: {
    packageKey: string;
    manifestSha256: string;
    runtimeExtensionUri: string;
    inputSchemaSha256: string;
    outputSchemaSha256: string;
  };
  trustedPackageRuntimeBindingKeys?: unknown;
  fetcher?: typeof fetch;
};

/** Acquire and verify a quote only. This never creates or dispatches a task. */
export async function acquireA2APriceQuote(input: A2APriceQuoteAcquisitionInput) {
  if (!input.agent || !input.consentToSharePromptForQuote)
    throw new A2APriceQuoteAcquisitionError('QUOTE_CONSENT_REQUIRED', 400);
  if (typeof input.extensionUri !== 'string' ||
      !a2aEgressOriginAllowed(input.agent.origin, input.allowedOrigins))
    throw new A2APriceQuoteAcquisitionError('QUOTE_EXTENSION_UNAVAILABLE', 503);

  let card;
  try { card = parseStoredA2AAgent(input.agent.cardJson, [input.extensionUri]); }
  catch { throw new A2APriceQuoteAcquisitionError('AGENT_CARD_INVALID', 409); }
  if (card.name !== input.agent.agentName || card.version !== input.agent.agentVersion)
    throw new A2APriceQuoteAcquisitionError('AGENT_CARD_CHANGED', 409);

  const cardDigest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input.agent.cardJson),
  );
  const cardSha256 = [...new Uint8Array(cardDigest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (cardSha256 !== input.agent.cardSha256)
    throw new A2APriceQuoteAcquisitionError('AGENT_CARD_CHANGED', 409);
  if (!hasActiveA2AUsageKeyForOrigin(input.trustedUsageKeys, input.agent.origin))
    throw new A2APriceQuoteAcquisitionError('NO_TRUSTED_PROVIDER_KEY', 503);

  const client = createA2AClient({
    allowedOrigins: [input.agent.origin],
    priceQuoteExtensionUri: input.extensionUri,
    ...(input.packageRuntimeTarget ? { packageRuntimeExtensionUri: input.packageRuntimeTarget.runtimeExtensionUri } : {}),
    fetch: input.fetcher,
    timeoutMs: 12_000,
  });
  let result;
  try {
    result = await client.requestPriceQuote(
      card,
      input.quoteRequestId,
      input.message,
      input.currency,
      input.maximumBudgetMinor,
      input.expiresAt,
      input.consentToSharePromptForQuote,
      input.packageRuntimeTarget,
    );
  } catch (error) {
    if (error instanceof A2AQuoteRequestIndeterminateError)
      throw new A2APriceQuoteAcquisitionError(
        'QUOTE_RESPONSE_INDETERMINATE', 409, error.quoteRequestId,
      );
    if (error instanceof A2AClientError)
      throw new A2APriceQuoteAcquisitionError(error.code.toUpperCase(), 409);
    throw new A2APriceQuoteAcquisitionError('QUOTE_PROVIDER_UNAVAILABLE', 502);
  }

  const quote = result.priceQuote as A2APriceQuote;
  const verified = await verifyA2APriceQuote(quote, {
    agentOrigin: input.agent.origin,
    agentName: input.agent.agentName,
    agentVersion: input.agent.agentVersion,
    requestSha256: result.requestSha256,
    currency: input.currency,
    maximumBudgetMinor: input.maximumBudgetMinor,
  }, trustedA2AUsageKeyResolver(input.trustedUsageKeys));
  if (!verified || quote.maxAmountMinor !== input.maximumBudgetMinor)
    throw new A2APriceQuoteAcquisitionError('PROVIDER_QUOTE_UNTRUSTED', 502);

  let packageRuntimeBinding: SkyPackageRuntimeBinding | null = null;
  let packageRuntimeBindingDigest: string | null = null;
  if (input.packageRuntimeTarget) {
    const candidate = result.packageRuntimeBinding;
    packageRuntimeBinding = await verifySkyPackageRuntimeBinding(candidate, {
      ...input.packageRuntimeTarget,
      agentOrigin: input.agent.origin,
      agentName: input.agent.agentName,
      agentVersion: input.agent.agentVersion,
      agentCardSha256: input.agent.cardSha256,
    }, trustedSkyPackageRuntimeBindingKeyResolver(input.trustedPackageRuntimeBindingKeys));
    if (!packageRuntimeBinding || !packageRuntimeQuoteRequirementsMatch(packageRuntimeBinding, quote))
      throw new A2APriceQuoteAcquisitionError('PACKAGE_RUNTIME_BINDING_UNTRUSTED', 502);
    packageRuntimeBindingDigest = await skyPackageRuntimeBindingDigest(packageRuntimeBinding);
  }

  return {
    quote,
    requestSha256: result.requestSha256,
    quoteDigest: await a2aPriceQuoteDigest(quote),
    ...(packageRuntimeBinding && packageRuntimeBindingDigest
      ? { packageRuntimeBinding, packageRuntimeBindingDigest } : {}),
  };
}
