import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateText,
  isTextModelProvider,
  readTextModelSelection,
  textModelProviders,
  LlmProviderError,
} from '../lib/llm-providers.ts';

const response = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });

void test('text model registry exposes replaceable local and cloud adapters', () => {
  assert.deepEqual(
    textModelProviders.map((provider) => provider.id),
    ['local-model', 'ollama', 'openai', 'anthropic', 'google', 'openai-compatible'],
  );
  assert.equal(isTextModelProvider('anthropic'), true);
  assert.equal(isTextModelProvider('unknown'), false);
  assert.deepEqual(readTextModelSelection(undefined), {
    provider: 'local-model',
    model: 'Qwen3-0.6B-Q8_0-GGUF',
  });
  assert.deepEqual(
    readTextModelSelection({
      textGeneration: 'ollama',
      textGenerationModel: 'qwen3:8b',
    }),
    { provider: 'ollama', model: 'qwen3:8b' },
  );
});

void test('OpenAI adapter uses server credentials and returns normalized text', async () => {
  let seen;
  const result = await generateText(
    {
      provider: 'openai',
      model: 'gpt-test',
      system: 'system',
      prompt: 'hello',
    },
    { OPENAI_API_KEY: 'server-only' },
    async (url, init) => {
      seen = { url, init };
      return response({
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
      });
    },
  );
  assert.equal(result.text, 'ok');
  assert.equal(seen.url, 'https://api.openai.com/v1/responses');
  assert.match(seen.init.headers.Authorization, /^Bearer server-only$/);
  assert.doesNotMatch(seen.init.body, /server-only/);
});

void test('Anthropic, Gemini and OpenAI-compatible adapters share one contract', async () => {
  const providers = [
    ['anthropic', { ANTHROPIC_API_KEY: 'a' }, { content: [{ type: 'text', text: 'claude' }] }],
    ['google', { GOOGLE_GENERATIVE_AI_API_KEY: 'g' }, { candidates: [{ content: { parts: [{ text: 'gemini' }] } }] }],
    ['openai-compatible', { SKY_LLM_COMPATIBLE_BASE_URL: 'http://127.0.0.1:1234/v1' }, { choices: [{ message: { content: 'compatible' } }] }],
  ];
  for (const [provider, runtimeEnv, payload] of providers) {
    const result = await generateText(
      { provider, prompt: 'hello' },
      runtimeEnv,
      async () => response(payload),
    );
    assert.equal(result.provider, provider);
    assert.ok(result.text);
  }
});

void test('local Qwen remains fail-closed until the native bridge is supplied', async () => {
  await assert.rejects(
    generateText({ provider: 'local-model', prompt: 'hello' }, {}),
    (error) => error instanceof LlmProviderError && error.code === 'LOCAL_LLM_BRIDGE_REQUIRED',
  );
});

void test('local Qwen uses an explicitly configured loopback OpenAI-compatible bridge', async () => {
  let seen;
  const result = await generateText(
    { provider: 'local-model', model: 'qwen-local', prompt: 'hello' },
    {
      SKY_LOCAL_LLM_BASE_URL: 'http://127.0.0.1:4317/v1',
      SKY_LOCAL_LLM_API_KEY: 'local-only',
    },
    async (url, init) => {
      seen = { url, init };
      return response({ choices: [{ message: { content: 'local ok' } }] });
    },
  );
  assert.equal(result.text, 'local ok');
  assert.equal(seen.url, 'http://127.0.0.1:4317/v1/chat/completions');
  assert.equal(seen.init.headers.Authorization, 'Bearer local-only');
});

void test('OpenAI returns measured duration and provider usage without inventing missing counts', async () => {
  const output = [{ content: [{ type: 'output_text', text: 'ok' }] }];
  for (const [usage, expected] of [
    [{ input_tokens: 12, output_tokens: 5, total_tokens: 17, input_tokens_details: { cached_tokens: 4 } },
      { inputTokens: 12, outputTokens: 5, totalTokens: 17, cachedInputTokens: 4 }],
    [undefined, null],
    [{ input_tokens: -1, output_tokens: 5, total_tokens: 4 }, null],
    [{ input_tokens: 12, output_tokens: 5, total_tokens: 100 }, null],
  ]) {
    const result = await generateText({ provider: 'openai', prompt: 'hello' },
      { OPENAI_API_KEY: 'fixture-key' }, async (_url, init) => {
        assert.equal(init.redirect, 'manual');
        assert.equal(JSON.parse(init.body).store, false);
        return response({ status: 'completed', output, usage });
      });
    assert.deepEqual(result.usage, expected);
    assert.ok(Number.isSafeInteger(result.durationMs) && result.durationMs >= 0);
  }
});

void test('provider failures distinguish timeout, transport and invalid or incomplete responses', async () => {
  const cases = [
    [async () => { throw new DOMException('sensitive provider details', 'TimeoutError'); }, 'UPSTREAM_TIMEOUT', 504],
    [async () => { throw new TypeError('sensitive network details'); }, 'UPSTREAM_UNAVAILABLE', 502],
    [async () => new Response('invalid json'), 'UPSTREAM_INVALID_RESPONSE', 502],
    [async () => response({ status: 'incomplete', output: [{ content: [{ type: 'output_text', text: 'partial' }] }] }), 'INCOMPLETE_RESPONSE', 502],
    [async () => new Response(null, { status: 302, headers: { location: 'https://example.com' } }), 'UPSTREAM_ERROR', 502],
  ];
  for (const [fetcher, code, status] of cases) {
    let calls = 0;
    await assert.rejects(generateText({ provider: 'openai', prompt: 'hello' },
      { OPENAI_API_KEY: 'fixture-key' }, async (...args) => { calls++; return fetcher(...args); }),
      error => error instanceof LlmProviderError && error.code === code && error.status === status &&
        !/sensitive|fixture-key/.test(error.message));
    assert.equal(calls, 1, 'failed requests must not be retried as duplicate billable requests');
  }
});
