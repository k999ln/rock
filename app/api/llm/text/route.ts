import { env } from 'cloudflare:workers';
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
    await authorizeRemoteAiRequest(request, 'llm-text');

    const raw = await request.text();
    if (raw.length > 28_000) throw new LlmProviderError('INVALID_INPUT', 400);
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

    const runtimeEnv = env as unknown as {
      SKY_REMOTE_LLM_ENABLED?: string;
      SKY_LLM_COMPATIBLE_BASE_URL?: string;
      OPENAI_API_KEY?: string;
      ANTHROPIC_API_KEY?: string;
      GOOGLE_GENERATIVE_AI_API_KEY?: string;
      SKY_LLM_COMPATIBLE_API_KEY?: string;
      SKY_OLLAMA_BASE_URL?: string;
    };
    const definition = textModelProviderDefinition(provider);
    const remote =
      definition.locality === 'remote' ||
      (provider === 'openai-compatible' &&
        !isLoopbackEndpoint(runtimeEnv.SKY_LLM_COMPATIBLE_BASE_URL));
    if (remote && value.consent !== true)
      throw new LlmProviderError('EXPLICIT_REMOTE_CONSENT_REQUIRED', 403);
    if (remote && runtimeEnv.SKY_REMOTE_LLM_ENABLED !== 'true')
      throw new LlmProviderError('REMOTE_LLM_DISABLED', 503);

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
      runtimeEnv,
    );
    return Response.json(result, { headers: noStoreHeaders });
  } catch (error) {
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
      { error: '選択したLLMを利用できません。', code },
      { status, headers: noStoreHeaders },
    );
  }
}
