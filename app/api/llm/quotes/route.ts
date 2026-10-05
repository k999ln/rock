import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { authorizeRemoteAiRequest } from '@/lib/remote-ai-guard';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { prepareRemoteAiTextQuote } from '@/lib/remote-ai-text-pricing';
import { loadVerifiedRemoteAiTextRate } from '@/lib/remote-ai-text-rate';
import { RemoteAiTextStore } from '@/lib/remote-ai-text-store';
import { remoteAiTextJson, remoteAiTextHttpError, remoteAiTextPublicRecord, remoteAiTextQueueState, readRemoteAiTextInput, parseRemoteAiTextQuoteInput } from '@/lib/remote-ai-text-http';
import { remoteAiTextExecutionAvailable } from '@/lib/remote-ai-pricing-gate';

export async function GET(request: Request) {
  try {
    const db = database();
    const owner = await authorizeRemoteAiRequest(request, 'llm-quote-read', db);
    const runtime = env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string; SKY_REMOTE_LLM_ENABLED?: string; OPENAI_API_KEY?: string; REMOTE_AI_TEXT_INPUT_ENCRYPTION_KEY?: string };
    if (!await rockstarServiceScopeAllowed(db, owner, 'rockstaros_access', runtime.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED))
      return missingRockstarServiceScope('RockstarOS');
    const parentJobId = new URL(request.url).searchParams.get('parentJobId') ?? undefined;
    if (parentJobId !== undefined && !/^[A-Za-z0-9._:-]{1,128}$/.test(parentJobId))
      return remoteAiTextJson({ code: 'INVALID_INPUT' }, 400);
    const store = new RemoteAiTextStore(db);
    const executions = await store.list(owner, parentJobId);
    return remoteAiTextJson({ executions: await Promise.all(executions.map(async (item) => ({
      ...remoteAiTextPublicRecord(item), queueState: remoteAiTextQueueState(item, Boolean(await store.getInput(owner, item.id))),
    }))),
      executionAvailable: remoteAiTextExecutionAvailable(runtime) });
  } catch (error) { return remoteAiTextHttpError(error); }
}

export async function POST(request: Request) {
  try {
    const db = database();
    const owner = await authorizeRemoteAiRequest(request, 'llm-quote-create', db);
    const runtime = env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string; REMOTE_AI_TRUSTED_RATE_KEYS?: string; SKY_REMOTE_LLM_ENABLED?: string; OPENAI_API_KEY?: string; REMOTE_AI_TEXT_INPUT_ENCRYPTION_KEY?: string };
    if (!await rockstarServiceScopeAllowed(db, owner, 'rockstaros_access', runtime.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED))
      return missingRockstarServiceScope('RockstarOS');
    const input = parseRemoteAiTextQuoteInput(await readRemoteAiTextInput(request));
    const verified = await loadVerifiedRemoteAiTextRate(db, runtime.REMOTE_AI_TRUSTED_RATE_KEYS, input.model, input.currency);
    const quote = await prepareRemoteAiTextQuote(verified, { ...input, ownerId: owner });
    if (!quote) return remoteAiTextJson({ code: 'REMOTE_AI_QUOTE_OVER_CAP_OR_INVALID' }, 422);
    const created = await new RemoteAiTextStore(db).create(quote, verified, input.parentJobId, input.parentBudgetLimitMinor, input.saveResult);
    return remoteAiTextJson({ execution: remoteAiTextPublicRecord(created.record),
      executionAvailable: remoteAiTextExecutionAvailable(runtime), providerSubmission: 'not_performed',
      inserted: created.inserted }, created.inserted ? 201 : 200);
  } catch (error) { return remoteAiTextHttpError(error); }
}
