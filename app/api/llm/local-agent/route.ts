import { bindSkyAgentLlmInput } from '@/lib/sky-agent-library-store';
import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import {
  generateText,
  isLoopbackLlmEndpoint,
  isRemoteLlmRequest,
  isTextModelProvider,
  LlmProviderError,
  textModelProviderDefinition,
  type LlmRuntimeEnv,
} from '@/lib/llm-providers';
import { authorizeRemoteAiRequest, RemoteAiGuardError } from '@/lib/remote-ai-guard';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { runZemaLocalAgent, ZemaLocalAgentError } from '@/lib/zema-local-agent';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

const plannerSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['schema', 'action', 'message'],
      properties: {
        schema: { const: 'zema-local-agent/1' },
        action: { const: 'respond' },
        message: { type: 'string', minLength: 1, maxLength: 6_000 },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['schema', 'action', 'tool', 'arguments', 'reason'],
      properties: {
        schema: { const: 'zema-local-agent/1' },
        action: { const: 'tool' },
        tool: { enum: ['sky_route', 'format_citations', 'coconala_check'] },
        arguments: { type: 'object' },
        reason: { type: 'string', minLength: 1, maxLength: 500 },
      },
    },
  ],
} satisfies Record<string, unknown>;

function failure(error: unknown) {
  if (error instanceof RemoteAiGuardError)
    return Response.json({
      error: error.code === 'RATE_LIMITED'
        ? '利用上限に達しました。1分後に再試行してください。'
        : error.code === 'ORIGIN'
          ? 'このサイトから操作してください。'
          : 'サインインしてください。',
      code: error.code,
    }, { status: error.status, headers: noStoreHeaders });
  const status = error instanceof ZemaLocalAgentError || error instanceof LlmProviderError
    ? error.status
    : 400;
  const code = error instanceof ZemaLocalAgentError || error instanceof LlmProviderError
    ? error.code
    : 'INVALID_INPUT';
  console.error('local agent failed', code);
  return Response.json({
    error: code === 'AGENT_STEP_LIMIT'
      ? '安全な手順上限に達しました。依頼を小さく分けてください。'
      : 'ローカルAgentを実行できません。',
    code,
  }, { status, headers: noStoreHeaders });
}

export async function POST(request: Request) {
  try {
    const db = database();
    const owner = await authorizeRemoteAiRequest(request, 'llm-local-agent', db);
    if (!(await rockstarServiceScopeAllowed(
      db,
      owner,
      'rockstaros_access',
      (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }).ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED,
      env,
      request,
    ))) return missingRockstarServiceScope('RockstarOS');

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 18_000)
      throw new ZemaLocalAgentError('INVALID_AGENT_REQUEST', 413);
    const value = await bindSkyAgentLlmInput(db, owner, JSON.parse(raw) as Record<string, unknown>);
    if (typeof value.agentId === 'string') value.context = value.system;
    if (!isTextModelProvider(value.provider))
      throw new LlmProviderError('UNKNOWN_LLM_PROVIDER', 400);
    const provider = value.provider;
    if (textModelProviderDefinition(provider).locality !== 'local')
      throw new ZemaLocalAgentError('LOCAL_PROVIDER_REQUIRED', 403);
    if (typeof value.prompt !== 'string' || !value.prompt.trim())
      throw new ZemaLocalAgentError('INVALID_AGENT_REQUEST', 400);
    if (value.context !== undefined && typeof value.context !== 'string')
      throw new ZemaLocalAgentError('INVALID_AGENT_CONTEXT', 400);
    if (value.model !== undefined &&
        (typeof value.model !== 'string' || !value.model.trim() || value.model.length > 120))
      throw new LlmProviderError('INVALID_MODEL', 400);
    if (value.baseUrl !== undefined &&
        (typeof value.baseUrl !== 'string' || value.baseUrl.length > 240 ||
          !isLoopbackLlmEndpoint(value.baseUrl)))
      throw new LlmProviderError('LOCAL_ENDPOINT_REQUIRED', 400);

    const runtimeEnv = env as unknown as LlmRuntimeEnv;
    const requestedBaseUrl = typeof value.baseUrl === 'string' ? value.baseUrl.trim() : '';
    const requestEnv: LlmRuntimeEnv = requestedBaseUrl
      ? {
          ...runtimeEnv,
          ...(provider === 'local-model' ? { SKY_LOCAL_LLM_BASE_URL: requestedBaseUrl } : {}),
          ...(provider === 'ollama' ? { SKY_OLLAMA_BASE_URL: requestedBaseUrl } : {}),
          ...(provider === 'openai-compatible' ? { SKY_LLM_COMPATIBLE_BASE_URL: requestedBaseUrl } : {}),
        }
      : runtimeEnv;
    if (isRemoteLlmRequest(provider, requestEnv))
      throw new ZemaLocalAgentError('LOCAL_ENDPOINT_REQUIRED', 403);

    const result = await runZemaLocalAgent({
      request: value.prompt,
      context: typeof value.context === 'string' ? value.context : undefined,
      planner: async ({ system, prompt }) => {
        const response = await generateText({
          provider,
          model: typeof value.model === 'string' ? value.model : undefined,
          system,
          prompt,
          maxOutputTokens: 1_200,
          jsonOutput: true,
          jsonSchema: provider === 'ollama' ? plannerSchema : undefined,
          disableThinking: provider === 'ollama',
        }, requestEnv);
        return response.text;
      },
    });
    return Response.json({ ...result, provider, model: typeof value.model === 'string'
      ? value.model
      : textModelProviderDefinition(provider).defaultModel }, { headers: noStoreHeaders });
  } catch (error) {
    return failure(error);
  }
}
