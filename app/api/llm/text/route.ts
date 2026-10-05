import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import {
  generateText,
  isTextModelProvider,
  LlmProviderError,
  textModelProviderDefinition,
} from '@/lib/llm-providers';
import {
  authorizeRemoteAiRequest,
  RemoteAiGuardError,
} from '@/lib/remote-ai-guard';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { remoteAiPricingGateAccepted, remoteAiPricingUnavailable } from '@/lib/remote-ai-pricing-gate';
import { REMOTE_AI_TEXT_MAX_QUEUE_AGE_MS, RemoteAiTextStore, RemoteAiTextStoreError } from '@/lib/remote-ai-text-store';
import { encryptRemoteAiTextInput } from '@/lib/remote-ai-text-input';
import { remoteAiTextQuoteMatches } from '@/lib/remote-ai-text-pricing';
import { loadVerifiedRemoteAiTextRate } from '@/lib/remote-ai-text-rate';
import { remoteAiTextPublicRecord, remoteAiTextHttpError } from '@/lib/remote-ai-text-http';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

function isLoopbackEndpoint(value: string | undefined) {
  if (!value) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const db = database();
    const owner = await authorizeRemoteAiRequest(request, 'llm-text', db);
    if (!(await rockstarServiceScopeAllowed(
      db,
      owner,
      'rockstaros_access',
      (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }).ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED,
    ))) return missingRockstarServiceScope('RockstarOS');

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 28_000) throw new LlmProviderError('INVALID_INPUT', 413);
    const value = JSON.parse(raw) as Record<string, unknown>;
    const provider = value.provider;
    if (!isTextModelProvider(provider))
      throw new LlmProviderError('UNKNOWN_LLM_PROVIDER', 400);
    if (typeof value.prompt !== 'string' || !value.prompt.trim())
      throw new LlmProviderError('INVALID_PROMPT', 400);
    if (
      value.system !== undefined &&
      (typeof value.system !== 'string' || value.system.length > 8_000)
    )
      throw new LlmProviderError('INVALID_SYSTEM_PROMPT', 400);
    if (
      value.model !== undefined &&
      (typeof value.model !== 'string' || value.model.length > 120)
    )
      throw new LlmProviderError('INVALID_MODEL', 400);
    if (
      value.baseUrl !== undefined &&
      (typeof value.baseUrl !== 'string' || value.baseUrl.length > 240)
    )
      throw new LlmProviderError('INVALID_ENDPOINT', 400);

    const runtimeEnv = env as unknown as {
      SKY_REMOTE_LLM_ENABLED?: string;
      SKY_LLM_COMPATIBLE_BASE_URL?: string;
      OPENAI_API_KEY?: string;
      ANTHROPIC_API_KEY?: string;
      GOOGLE_GENERATIVE_AI_API_KEY?: string;
      SKY_LLM_COMPATIBLE_API_KEY?: string;
      SKY_OLLAMA_BASE_URL?: string;
      SKY_LOCAL_LLM_BASE_URL?: string;
      SKY_LOCAL_LLM_API_KEY?: string;
      REMOTE_AI_TRUSTED_RATE_KEYS?: string;
      REMOTE_AI_TEXT_INPUT_ENCRYPTION_KEY?: string;
    };
    const definition = textModelProviderDefinition(provider);
    const requestedBaseUrl = typeof value.baseUrl === 'string'
      ? value.baseUrl.trim()
      : '';
    if (requestedBaseUrl &&
      (provider !== 'local-model' || !isLoopbackEndpoint(requestedBaseUrl) ||
        !/^https?:$/i.test(new URL(requestedBaseUrl).protocol)))
      throw new LlmProviderError('LOCAL_ENDPOINT_REQUIRED', 400);
    const configuredEndpoint = provider === 'local-model'
      ? requestedBaseUrl || runtimeEnv.SKY_LOCAL_LLM_BASE_URL
      : provider === 'ollama'
        ? runtimeEnv.SKY_OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
        : provider === 'openai-compatible'
          ? runtimeEnv.SKY_LLM_COMPATIBLE_BASE_URL
          : undefined;
    const remote =
      definition.locality === 'remote' ||
      Boolean(configuredEndpoint && !isLoopbackEndpoint(configuredEndpoint));
    if (remote && value.consent !== true)
      throw new LlmProviderError('EXPLICIT_REMOTE_CONSENT_REQUIRED', 403);
    if (remote && runtimeEnv.SKY_REMOTE_LLM_ENABLED !== 'true')
      throw new LlmProviderError('REMOTE_LLM_DISABLED', 503);
    if (remote && !remoteAiPricingGateAccepted())
      return remoteAiPricingUnavailable();
    if (remote) {
      if (provider !== 'openai') return remoteAiPricingUnavailable();
      if (typeof value.quoteId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(value.quoteId) ||
        typeof value.approvalDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.approvalDigest))
        throw new LlmProviderError('APPROVED_TEXT_QUOTE_REQUIRED', 400);
      const store = new RemoteAiTextStore(db);
      const current = await store.expireBeforeSend(owner, value.quoteId);
      if (!current) throw new RemoteAiTextStoreError('NOT_FOUND');
      const model = typeof value.model === 'string' && value.model.trim()
        ? value.model.trim() : definition.defaultModel;
      const verified = await loadVerifiedRemoteAiTextRate(db, runtimeEnv.REMOTE_AI_TRUSTED_RATE_KEYS,
        model, current.quote.ceiling.currency);
      const intent = {
        ownerId: owner, requestId: current.requestId, model,
        prompt: value.prompt, system: typeof value.system === 'string' ? value.system : undefined,
        maxOutputTokens: typeof value.maxOutputTokens === 'number' ? value.maxOutputTokens : 1_200,
        maximumBudgetMinor: current.quote.approvedCapMinor,
      };
      if (current.approvalDigest !== value.approvalDigest)
        throw new RemoteAiTextStoreError('APPROVAL_MISMATCH');
      if (current.state === 'completed' || current.state === 'unreconciled' || current.state === 'sending')
        return Response.json({ execution: remoteAiTextPublicRecord(current),
          result: current.saveResult ? current.resultText : null, providerSubmission: 'not_repeated' },
          { status: 202, headers: noStoreHeaders });
      if (current.state !== 'reserved' || !runtimeEnv.REMOTE_AI_TEXT_INPUT_ENCRYPTION_KEY)
        throw new LlmProviderError('DURABLE_QUEUE_UNAVAILABLE', 503);
      if (!await remoteAiTextQuoteMatches(current.quote, verified, intent))
        throw new RemoteAiTextStoreError('QUOTE_CONFLICT');
      const encrypted = await encryptRemoteAiTextInput(intent,
        runtimeEnv.REMOTE_AI_TEXT_INPUT_ENCRYPTION_KEY, owner, current.id);
      const queued = await store.saveInput(owner, current.id, value.approvalDigest, encrypted);
      return Response.json({
        execution: queued.record ? remoteAiTextPublicRecord(queued.record) : null,
        queue: { status: 'accepted', durable: true, inputEncryptedAtRest: true,
          executionDeadlineAt: current.quote.expiresAt + REMOTE_AI_TEXT_MAX_QUEUE_AGE_MS },
        providerSubmission: 'not_performed', inserted: queued.inserted,
      }, { status: 202, headers: noStoreHeaders });
    }

    const requestEnv = requestedBaseUrl
      ? { ...runtimeEnv, SKY_LOCAL_LLM_BASE_URL: requestedBaseUrl }
      : runtimeEnv;
    const result = await generateText(
      {
        provider,
        model: typeof value.model === 'string' ? value.model : undefined,
        system: typeof value.system === 'string' ? value.system : undefined,
        prompt: value.prompt,
        maxOutputTokens:
          typeof value.maxOutputTokens === 'number'
            ? value.maxOutputTokens
            : undefined,
      },
      requestEnv,
    );
    return Response.json(result, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof RemoteAiTextStoreError) return remoteAiTextHttpError(error);
    if (error instanceof RemoteAiGuardError)
      return Response.json(
        {
          error:
            error.code === 'RATE_LIMITED'
              ? '利用上限に達しました。1分後に再試行してください。'
              : error.code === 'ORIGIN'
                ? 'このサイトから操作してください。'
                : 'サインインしてください。',
          code: error.code,
        },
        { status: error.status, headers: noStoreHeaders },
      );
    const status = error instanceof LlmProviderError ? error.status : 400;
    const code = error instanceof LlmProviderError ? error.code : 'INVALID_INPUT';
    console.error('text llm failed', code);
    return Response.json(
      {
        error: code === 'REMOTE_AI_PRICING_GATE_UNAVAILABLE'
          ? 'クラウドAIの料金確認機能が接続されるまで外部LLMを利用できません。'
          : '選択したLLMを利用できません。',
        code,
      },
      { status, headers: noStoreHeaders },
    );
  }
}
