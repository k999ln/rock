import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { authorizeRemoteAiRequest } from '@/lib/remote-ai-guard';
import { LlmProviderError } from '@/lib/llm-providers';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { RemoteAiTextStore, RemoteAiTextStoreError } from '@/lib/remote-ai-text-store';
import { loadVerifiedRemoteAiTextRate } from '@/lib/remote-ai-text-rate';
import { remoteAiTextJson, remoteAiTextHttpError, remoteAiTextPublicRecord, remoteAiTextQueueState, readRemoteAiTextInput } from '@/lib/remote-ai-text-http';
import { remoteAiTextExecutionAvailable } from '@/lib/remote-ai-pricing-gate';

type Context = { params: Promise<{ id: string }> };
async function access(request: Request, context: Context) {
  const db = database();
  const owner = await authorizeRemoteAiRequest(request, request.method === 'GET' ? 'llm-quote-status' : 'llm-quote-update', db);
  const runtime = env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string; REMOTE_AI_TRUSTED_RATE_KEYS?: string; SKY_REMOTE_LLM_ENABLED?: string; OPENAI_API_KEY?: string; REMOTE_AI_TEXT_INPUT_ENCRYPTION_KEY?: string };
  const scoped = await rockstarServiceScopeAllowed(db, owner, 'rockstaros_access', runtime.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED);
  const { id } = await context.params;
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(id)) throw new LlmProviderError('INVALID_ID', 400);
  return { db, owner, id, runtime, scoped, store: new RemoteAiTextStore(db) };
}
export async function GET(request: Request, context: Context) {
  try {
    const { store, owner, id, scoped, runtime } = await access(request, context);
    if (!scoped) return missingRockstarServiceScope('RockstarOS');
    const row = await store.expireBeforeSend(owner, id);
    if (!row) throw new RemoteAiTextStoreError('NOT_FOUND');
    if (new URL(request.url).searchParams.get('download') === '1') {
      if (row.state !== 'completed' || row.resultText === null)
        throw new RemoteAiTextStoreError('NOT_FOUND');
      return new Response(row.resultText, { headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="sky-ai-${row.id.replace(/[^A-Za-z0-9._-]/g, '-')}.md"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      } });
    }
    return remoteAiTextJson({ execution: remoteAiTextPublicRecord(row),
      queueState: remoteAiTextQueueState(row, Boolean(await store.getInput(owner, id))),
      executionAvailable: remoteAiTextExecutionAvailable(
      { SKY_REMOTE_LLM_ENABLED: runtime.SKY_REMOTE_LLM_ENABLED, OPENAI_API_KEY: runtime.OPENAI_API_KEY,
        REMOTE_AI_TEXT_INPUT_ENCRYPTION_KEY: runtime.REMOTE_AI_TEXT_INPUT_ENCRYPTION_KEY }) });
  } catch (error) { return remoteAiTextHttpError(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { db, store, owner, id, scoped, runtime } = await access(request, context);
    if (!scoped) return missingRockstarServiceScope('RockstarOS');
    const body = await readRemoteAiTextInput(request);
    if (Object.keys(body).some(key => !['action', 'approvalDigest', 'consent'].includes(key)) ||
      !['approve', 'cancel'].includes(String(body.action)) || body.consent !== true ||
      typeof body.approvalDigest !== 'string' || !/^[a-f0-9]{64}$/.test(body.approvalDigest))
      throw new LlmProviderError('INVALID_APPROVAL', 400);
    const current = await store.get(owner, id);
    if (!current) throw new RemoteAiTextStoreError('NOT_FOUND');
    if (body.action === 'approve' && current.state === 'quoted') {
      const verified = await loadVerifiedRemoteAiTextRate(db, runtime.REMOTE_AI_TRUSTED_RATE_KEYS,
        current.quote.ceiling.modelId, current.quote.ceiling.currency);
      if (verified.digest !== current.verifiedRate.digest) throw new RemoteAiTextStoreError('QUOTE_CONFLICT');
    }
    const row = body.action === 'approve' ? await store.reserve(owner, id, body.approvalDigest)
      : await store.cancelBeforeSend(owner, id, body.approvalDigest);
    return remoteAiTextJson({ execution: row ? remoteAiTextPublicRecord(row) : null, providerSubmission: 'not_performed' });
  } catch (error) { return remoteAiTextHttpError(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const { store, owner, id, scoped } = await access(request, context);
    if (!scoped) return missingRockstarServiceScope('RockstarOS');
    const row = await store.deleteSavedResult(owner, id);
    if (!row) throw new RemoteAiTextStoreError('NOT_FOUND');
    return remoteAiTextJson({ execution: remoteAiTextPublicRecord(row), resultDeleted: row.resultText === null });
  } catch (error) { return remoteAiTextHttpError(error); }
}
