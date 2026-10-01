export type TextModelProviderId =
  | 'local-model'
  | 'ollama'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'openai-compatible';

export type TextModelProviderDefinition = {
  id: TextModelProviderId;
  name: string;
  detail: string;
  defaultModel: string;
  locality: 'local' | 'remote';
  credentialEnv?: string;
};

export const textModelProviders: readonly TextModelProviderDefinition[] = [
  {
    id: 'local-model',
    name: 'Local Action Assistant / Qwen',
    detail: '端末内のQwen planner。Webから直接実行せず、Binder接続が必要です。',
    defaultModel: 'Qwen3-0.6B-Q8_0-GGUF',
    locality: 'local',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    detail: 'OllamaのローカルHTTP API。Qwen・Llama・Gemmaなどを差し替えます。',
    defaultModel: 'qwen3:0.6b',
    locality: 'local',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    detail: 'Responses API。用途ごとのモデルIDをサーバー側で選べます。',
    defaultModel: 'gpt-5.4-nano',
    locality: 'remote',
    credentialEnv: 'OPENAI_API_KEY',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    detail: 'Messages API。Claude系モデルを同じ文章生成契約で使います。',
    defaultModel: 'claude-3-5-haiku-latest',
    locality: 'remote',
    credentialEnv: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    detail: 'Generative Language API。Gemini系モデルを選べます。',
    defaultModel: 'gemini-2.5-flash',
    locality: 'remote',
    credentialEnv: 'GOOGLE_GENERATIVE_AI_API_KEY',
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI互換エンドポイント',
    detail: 'LM Studio・vLLM・llama.cppなど、Chat Completions互換の接続先です。',
    defaultModel: 'local-model',
    locality: 'local',
    credentialEnv: 'SKY_LLM_COMPATIBLE_API_KEY',
  },
] as const;

export const textModelProviderIds = textModelProviders.map(({ id }) => id);

/** Model IDs that can be selected in Sky without changing the routing contract. */
export const localModelPresets = [
  { value: 'Qwen3-0.6B-Q8_0-GGUF', label: '内蔵Qwen3 0.6B（軽量）' },
  { value: 'Qwen3-1.7B-Q8_0-GGUF', label: 'GGUF候補 Qwen3 1.7B（軽量強化）' },
  { value: 'Qwen3-4B-Q4_K_M-GGUF', label: 'GGUF候補 Qwen3 4B（標準）' },
  {
    value: 'Qwen2.5-Coder-3B-Instruct-Q4_K_M-GGUF',
    label: 'GGUF候補 Qwen2.5 Coder 3B（コード）',
  },
  {
    value: 'Gemma-3-4B-it-Q4_K_M-GGUF',
    label: 'GGUF候補 Gemma 3 4B（文章・画像）',
  },
  {
    value: 'SmolLM3-3B-Q4_K_M-GGUF',
    label: 'GGUF候補 SmolLM3 3B（小型推論）',
  },
  {
    value: 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M-GGUF',
    label: 'GGUF候補 DeepSeek R1 1.5B（推論実験）',
  },
  {
    value: 'Phi-4-mini-instruct-Q4_K_M-GGUF',
    label: 'GGUF候補 Phi-4 mini（文章・コード）',
  },
  {
    value: 'FunctionGemma-270M-it-GGUF',
    label: 'GGUF候補 FunctionGemma 270M（Tool選択）',
  },
  {
    value: 'Granite-3.3-2B-Instruct-Q4_K_M-GGUF',
    label: 'GGUF候補 IBM Granite 3.3 2B（多言語・業務）',
  },
  {
    value: 'Ministral-3-3B-Instruct-2512-Q4_K_M-GGUF',
    label: 'GGUF候補 Ministral 3 3B（多言語・推論）',
  },
  {
    value: 'Llama-3.2-1B-Instruct-GGUF',
    label: 'GGUF候補 Llama 3.2 1B（軽量・要変換）',
  },
  {
    value: 'Qwen2.5-0.5B-Instruct-ONNX',
    label: 'ONNX候補 Qwen2.5 0.5B（端末向け）',
  },
  {
    value: 'Qwen2.5-1.5B-Instruct-GGUF',
    label: 'GGUF候補 Qwen2.5 1.5B（端末向け）',
  },
  {
    value: 'Qwen2.5-3B-Instruct-Q4_0-GGUF',
    label: 'GGUF候補 Qwen2.5 3B（Tool向け）',
  },
  {
    value: 'Qwen3.5-4B-Q4_K_M-GGUF',
    label: 'GGUF候補 Qwen3.5 4B（画像・Tool）',
  },
  {
    value: 'Gemma-3n-E2B-it-LiteRT-LM',
    label: 'LiteRT候補 Gemma 3n E2B（画像・音声）',
  },
  {
    value: 'Gemma-4-E2B-it-LiteRT-LM',
    label: 'LiteRT候補 Gemma 4 E2B（端末エージェント）',
  },
  {
    value: 'Gemma-4-E4B-it-LiteRT-LM',
    label: 'LiteRT候補 Gemma 4 E4B（高性能端末）',
  },
  {
    value: 'Gemma-3-270M-LiteRT-LM',
    label: 'LiteRT候補 Gemma 3 270M（超軽量）',
  },
  {
    value: 'Gemma-3-1B-LiteRT-LM',
    label: 'LiteRT候補 Gemma 3 1B（軽量）',
  },
  {
    value: 'Gemini-Nano-AICore',
    label: '端末内蔵 Gemini Nano（対応Pixelのみ）',
  },
  {
    value: 'HY-MT-1.5-1.8B-GGUF',
    label: 'GGUF候補 HY-MT 1.5 1.8B（翻訳）',
  },
  { value: 'qwen3:8b', label: 'Ollama / Qwen3 8B（標準）' },
  { value: 'qwen3:14b', label: 'Ollama / Qwen3 14B（高品質）' },
  { value: 'gemma3:12b', label: 'Ollama / Gemma 3 12B（文章）' },
  { value: 'llama3.1:8b', label: 'Ollama / Llama 3.1 8B（汎用）' },
] as const;

export function isTextModelProvider(
  value: unknown,
): value is TextModelProviderId {
  return (
    typeof value === 'string' &&
    textModelProviderIds.includes(value as TextModelProviderId)
  );
}

export function textModelProviderDefinition(
  provider: TextModelProviderId,
): TextModelProviderDefinition {
  const definition = textModelProviders.find((item) => item.id === provider);
  if (!definition) throw new Error('UNKNOWN_LLM_PROVIDER');
  return definition;
}

export type TextModelSelection = {
  provider: TextModelProviderId;
  model: string;
};

export function readTextModelSelection(
  config: Record<string, string> | undefined,
): TextModelSelection {
  const provider = isTextModelProvider(config?.textGeneration)
    ? config.textGeneration
    : 'local-model';
  const model =
    config?.textGenerationModel?.trim() ||
    textModelProviderDefinition(provider).defaultModel;
  return { provider, model: model.slice(0, 120) };
}

export type TextGenerationRequest = {
  provider: TextModelProviderId;
  model?: string;
  system?: string;
  prompt: string;
  maxOutputTokens?: number;
};

export type TextGenerationResult = {
  provider: TextModelProviderId;
  model: string;
  text: string;
};

export type LlmRuntimeEnv = {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  SKY_LLM_COMPATIBLE_API_KEY?: string;
  SKY_LLM_COMPATIBLE_BASE_URL?: string;
  SKY_OLLAMA_BASE_URL?: string;
  SKY_LOCAL_LLM_BASE_URL?: string;
  SKY_LOCAL_LLM_API_KEY?: string;
};

export class LlmProviderError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 502) {
    super(code);
    this.name = 'LlmProviderError';
    this.code = code;
    this.status = status;
  }
}

type FetchLike = typeof fetch;

const PROVIDER_TIMEOUT_MS = 20_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function modelFor(request: TextGenerationRequest) {
  return (
    request.model?.trim() ||
    textModelProviderDefinition(request.provider).defaultModel
  ).slice(0, 120);
}

function limitFor(request: TextGenerationRequest) {
  const value = request.maxOutputTokens ?? 1_200;
  if (!Number.isSafeInteger(value) || value < 1 || value > 8_000)
    throw new LlmProviderError('INVALID_MAX_OUTPUT_TOKENS', 400);
  return value;
}

function messagesFor(request: TextGenerationRequest) {
  return [
    ...(request.system
      ? [{ role: 'system', content: request.system.trim() }]
      : []),
    { role: 'user', content: request.prompt.trim() },
  ];
}

async function jsonResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw new LlmProviderError('UPSTREAM_ERROR', 502);
  return payload as Record<string, unknown> | null;
}

function textFromOpenAiResponse(payload: Record<string, unknown> | null) {
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const text = output
    .flatMap((item) => {
      const record = asRecord(item);
      return Array.isArray(record?.content) ? record.content : [];
    })
    .map((item) => {
      const record = asRecord(item);
      return record?.type === 'output_text' && typeof record.text === 'string'
        ? record.text
        : '';
    })
    .join('\n')
    .trim();
  if (!text) throw new LlmProviderError('EMPTY_RESPONSE');
  return text;
}

function textFromChatResponse(payload: Record<string, unknown> | null) {
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  const text = choices
    .map((choice) => {
      const message = asRecord(asRecord(choice)?.message);
      return message?.content;
    })
    .filter((value: unknown): value is string => typeof value === 'string')
    .join('\n')
    .trim();
  if (!text) throw new LlmProviderError('EMPTY_RESPONSE');
  return text;
}

export async function generateText(
  request: TextGenerationRequest,
  runtimeEnv: LlmRuntimeEnv,
  fetchImpl: FetchLike = fetch,
): Promise<TextGenerationResult> {
  if (!request.prompt.trim() || request.prompt.length > 24_000)
    throw new LlmProviderError('INVALID_PROMPT', 400);
  const model = modelFor(request);
  const maxOutputTokens = limitFor(request);
  const messages = messagesFor(request);

  if (request.provider === 'local-model') {
    const base = runtimeEnv.SKY_LOCAL_LLM_BASE_URL?.trim();
    if (!base) throw new LlmProviderError('LOCAL_LLM_BRIDGE_REQUIRED', 503);
    const normalized = base.replace(/\/+$/, '');
    const endpoint = normalized.endsWith('/chat/completions')
      ? normalized
      : `${normalized.replace(/\/v1$/, '')}/v1/chat/completions`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (runtimeEnv.SKY_LOCAL_LLM_API_KEY)
      headers.Authorization = `Bearer ${runtimeEnv.SKY_LOCAL_LLM_API_KEY}`;
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxOutputTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    return {
      provider: request.provider,
      model,
      text: textFromChatResponse(await jsonResponse(response)),
    };
  }

  if (request.provider === 'ollama') {
    const base = (runtimeEnv.SKY_OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(
      /\/+$/,
      '',
    );
    const response = await fetchImpl(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    const payload = await jsonResponse(response);
    const text =
      payload && typeof payload.message === 'object' && payload.message
        ? (payload.message as { content?: unknown }).content
        : undefined;
    if (typeof text !== 'string' || !text.trim())
      throw new LlmProviderError('EMPTY_RESPONSE');
    return { provider: request.provider, model, text: text.trim() };
  }

  if (request.provider === 'openai') {
    if (!runtimeEnv.OPENAI_API_KEY)
      throw new LlmProviderError('MISSING_PROVIDER_CREDENTIAL', 503);
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${runtimeEnv.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: messages,
        max_output_tokens: maxOutputTokens,
        store: false,
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    return {
      provider: request.provider,
      model,
      text: textFromOpenAiResponse(await jsonResponse(response)),
    };
  }

  if (request.provider === 'anthropic') {
    if (!runtimeEnv.ANTHROPIC_API_KEY)
      throw new LlmProviderError('MISSING_PROVIDER_CREDENTIAL', 503);
    const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': runtimeEnv.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        system: request.system?.trim() || undefined,
        messages: [{ role: 'user', content: request.prompt.trim() }],
        max_tokens: maxOutputTokens,
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    const payload = await jsonResponse(response);
    const text = Array.isArray(payload?.content)
      ? payload.content
          .filter((item) => asRecord(item)?.type === 'text')
          .map((item) => asRecord(item)?.text)
          .filter((value: unknown): value is string => typeof value === 'string')
          .join('\n')
          .trim()
      : '';
    if (!text) throw new LlmProviderError('EMPTY_RESPONSE');
    return { provider: request.provider, model, text };
  }

  if (request.provider === 'google') {
    if (!runtimeEnv.GOOGLE_GENERATIVE_AI_API_KEY)
      throw new LlmProviderError('MISSING_PROVIDER_CREDENTIAL', 503);
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(runtimeEnv.GOOGLE_GENERATIVE_AI_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: [request.system?.trim(), request.prompt.trim()]
                    .filter(Boolean)
                    .join('\n\n'),
                },
              ],
            },
          ],
          generationConfig: { maxOutputTokens },
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      },
    );
    const payload = await jsonResponse(response);
    const text = Array.isArray(payload?.candidates)
      ? payload.candidates
          .flatMap((candidate) => {
            const content = asRecord(asRecord(candidate)?.content);
            return Array.isArray(content?.parts) ? content.parts : [];
          })
          .map((part) => asRecord(part)?.text)
          .filter((value: unknown): value is string => typeof value === 'string')
          .join('\n')
          .trim()
      : '';
    if (!text) throw new LlmProviderError('EMPTY_RESPONSE');
    return { provider: request.provider, model, text };
  }

  const base = runtimeEnv.SKY_LLM_COMPATIBLE_BASE_URL?.trim();
  if (!base) throw new LlmProviderError('MISSING_PROVIDER_ENDPOINT', 503);
  const endpoint = `${base.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (runtimeEnv.SKY_LLM_COMPATIBLE_API_KEY)
    headers.Authorization = `Bearer ${runtimeEnv.SKY_LLM_COMPATIBLE_API_KEY}`;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxOutputTokens,
      stream: false,
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  return {
    provider: request.provider,
    model,
    text: textFromChatResponse(await jsonResponse(response)),
  };
}
