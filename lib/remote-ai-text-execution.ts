import {
  generateText,
  LlmProviderError,
  type LlmRuntimeEnv,
  type OpenAiOutputProgress,
} from './llm-providers.ts';
import { remoteAiTextQuoteMatches, remoteAiTextRequestDigest, type RemoteAiTextIntent } from './remote-ai-text-pricing.ts';
import type { VerifiedRemoteAiRateCard } from './remote-ai-rate-card.ts';
import { RemoteAiTextStore, RemoteAiTextStoreError } from './remote-ai-text-store.ts';

/** Server-only coordinator. HTTP callers must also enforce authentication, scope and the pricing gate. */
export async function executeReservedRemoteAiText(input: {
  store: RemoteAiTextStore;
  ownerId: string;
  id: string;
  approvalDigest: string;
  intent: RemoteAiTextIntent;
  verified: VerifiedRemoteAiRateCard;
  runtimeEnv: LlmRuntimeEnv & { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string };
  fetchImpl?: typeof fetch;
  onOutputProgress?: OpenAiOutputProgress;
}) {
  const { store, ownerId, id, approvalDigest, intent, verified, runtimeEnv } = input;
  const current = await store.get(ownerId, id);
  if (!current) throw new RemoteAiTextStoreError('NOT_FOUND');
  if (current.approvalDigest !== approvalDigest || intent.ownerId !== ownerId ||
    intent.requestId !== current.requestId ||
    current.quote.requestDigest !== await remoteAiTextRequestDigest(intent) ||
    intent.maximumBudgetMinor !== current.quote.approvedCapMinor)
    throw new RemoteAiTextStoreError('APPROVAL_MISMATCH');
  // A refresh/retry reads the original record; only one reservation can win the send claim.
  if (current.state === 'sending') {
    const record = await store.markUnreconciled(ownerId, id, 'DISPATCH_RESULT_UNKNOWN');
    return { record, providerSubmission: 'not_repeated' as const };
  }
  if (['completed', 'unreconciled'].includes(current.state))
    return { record: current, providerSubmission: 'not_repeated' as const };
  if (!await remoteAiTextQuoteMatches(current.quote, verified, intent, Date.now(), true))
    throw new RemoteAiTextStoreError('QUOTE_CONFLICT');
  // This is deployment configuration, not an intent/body boolean. Missing is the
  // existing preview default; malformed values must not downgrade a required gate.
  const serviceSetting = runtimeEnv.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED;
  if (serviceSetting !== undefined && serviceSetting !== 'true' && serviceSetting !== 'false')
    throw new RemoteAiTextStoreError('INVALID_STATE');
  const serviceAuthority = serviceSetting === 'true' ? 'required' : 'preview';
  if (!runtimeEnv.OPENAI_API_KEY) throw new LlmProviderError('MISSING_PROVIDER_CREDENTIAL', 503);
  if (!await store.claimDispatch(ownerId, id, approvalDigest))
    return { record: await store.get(ownerId, id), providerSubmission: 'not_repeated' as const };
  // A durable one-time claim makes Workflow callback replay fail closed. A crash
  // after this write but before fetch is conservatively unreconciled, never resent.
  let sendClaimed: boolean;
  try {
    sendClaimed = await store.claimProviderSend(ownerId, id, Date.now(), serviceAuthority);
  } catch (error) {
    // The existing recurring trigger aborts the INSERT on a known access denial.
    // Other errors leave persistence uncertain. Both retain the hold and never fetch.
    const recurringDenied = error instanceof Error &&
      /^(?:D1_ERROR: )?SKY_RECURRING_ACCESS_BLOCKED(?:: SQLITE_CONSTRAINT)?$/.test(error.message);
    await store.markUnreconciled(ownerId, id,
      recurringDenied ? 'PROVIDER_SEND_CLAIM_REJECTED' : 'PROVIDER_SEND_CLAIM_UNCONFIRMED');
    throw error;
  }
  if (!sendClaimed) {
    const record = await store.markUnreconciled(ownerId, id, 'PROVIDER_SEND_CLAIM_REJECTED');
    return { record, providerSubmission: 'not_repeated' as const };
  }
  const startedAt = Date.now();
  try {
    const result = await generateText({
      provider: 'openai', model: intent.model, system: intent.system,
      prompt: intent.prompt, maxOutputTokens: intent.maxOutputTokens,
      clientRequestId: id,
    }, runtimeEnv, input.fetchImpl, input.onOutputProgress);
    const record = await store.complete(ownerId, id, verified, result);
    return { record, result, providerSubmission: 'performed' as const };
  } catch (error) {
    const code = error instanceof LlmProviderError ? error.code : 'RESULT_PERSISTENCE_UNCONFIRMED';
    // Sending may already have incurred a charge. Neither timeout nor persistence failure releases the hold.
    await store.markUnreconciled(ownerId, id, code, Date.now(), {
      durationMs: Math.max(0, Date.now() - startedAt), clientRequestId: id,
      providerRequestId: error instanceof LlmProviderError ? error.providerRequestId ?? null : null,
    });
    throw error;
  }
}
