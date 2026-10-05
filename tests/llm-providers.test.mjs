import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateText,
  createOpenAiResponse,
  isTextModelProvider,
  readTextModelSelection,
  textModelProviders,
  LlmProviderError,
} from '../lib/llm-providers.ts';
import { buildLegalAiRequest, parseLegalAiResponse } from '../lib/legal-ai.ts';
import { buildPatentAiRequest, parsePatentAiResponse } from '../lib/patent-ai.ts';

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
      { inputTokens: 12, outputTokens: 5, totalTokens: 17, cachedInputTokens: 4, cacheWriteInputTokens: null }],
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

void test('reserved OpenAI execution streams bounded progress and keeps final Provider usage authoritative', async () => {
  const text = 'x'.repeat(700);
  const events = [
    { type: 'response.created', response: { id: 'resp_live' } },
    { type: 'response.output_text.delta', delta: text },
    { type: 'response.completed', response: {
      id: 'resp_live', model: 'fixture-model', status: 'completed', service_tier: 'default',
      output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
      usage: { input_tokens: 20, output_tokens: 7, total_tokens: 27 },
    } },
  ];
  const stream = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
  const progress = [];
  const result = await generateText({ provider: 'openai', model: 'fixture-model', prompt: 'hello' },
    { OPENAI_API_KEY: 'fixture-key' }, async (_url, init) => {
      assert.equal(JSON.parse(init.body).stream, true);
      assert.equal(JSON.parse(init.body).store, false);
      assert.equal(init.redirect, 'manual');
      return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
    }, async (value) => progress.push(value));
  assert.equal(result.text, text);
  assert.equal(result.responseStatus, 'completed');
  assert.equal(result.providerResponseId, 'resp_live');
  assert.deepEqual(result.usage, {
    inputTokens: 20, outputTokens: 7, totalTokens: 27,
    cachedInputTokens: null, cacheWriteInputTokens: null,
  });
  assert.ok(progress.length >= 1);
  assert.equal(progress.at(-1).outputBytes, 700);
});

void test('incomplete streamed Provider response is never promoted to a successful result', async () => {
  const stream = [
    { type: 'response.output_text.delta', delta: 'partial' },
  ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  await assert.rejects(generateText({ provider: 'openai', prompt: 'hello' },
    { OPENAI_API_KEY: 'fixture-key' }, async () => new Response(stream, {
      headers: { 'content-type': 'text/event-stream' },
    }), async () => {}),
    (error) => error instanceof LlmProviderError && error.code === 'UPSTREAM_INVALID_RESPONSE');
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

void test('cited research preserves search restrictions and returns measured provider usage', async () => {
  const legal = {
    issueType: 'housing', location: 'nyc', matterStage: 'general_information',
    situationSummary: 'Synthetic research input for the shared transport fixture.',
    desiredOutcome: 'Official information',
  };
  const patent = {
    inventionTitle: 'Synthetic research fixture', problem: 'Technical problem fixture',
    mechanism: 'Mechanism fixture', architecture: 'Architecture fixture',
    technicalEffect: 'Effect fixture', differences: 'Difference fixture',
    knownPriorArt: '', inventor: '', applicant: '', disclosureStatus: 'not_disclosed',
  };
  for (const [body, parse, citation] of [
    [buildLegalAiRequest(legal, '2026-10-02', 'fixture-model'), parseLegalAiResponse, 'https://nycourts.gov/'],
    [buildPatentAiRequest(patent, '2026-10-02', 'fixture-model'), parsePatentAiResponse, 'https://jpo.go.jp/'],
  ]) {
    let calls = 0;
    const result = await createOpenAiResponse(body, { OPENAI_API_KEY: 'fixture-server-key' }, async (url, init) => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(init.redirect, 'manual');
      assert.ok(init.signal instanceof AbortSignal);
      const sent = JSON.parse(init.body);
      assert.deepEqual(sent.tools, body.tools);
      assert.deepEqual(sent.tool_choice, body.tool_choice);
      assert.equal(sent.max_tool_calls, body.max_tool_calls);
      assert.equal(sent.store, false);
      assert.doesNotMatch(init.body, /fixture-server-key/);
      return response({ status: 'completed', model: 'fixture-model-actual',
        usage: { input_tokens: 11, output_tokens: 4, total_tokens: 15 },
        output: [
          { type: 'web_search_call', status: 'completed' },
          { type: 'message', content: [{ type: 'output_text', text: 'Cited fixture result',
            annotations: [{ type: 'url_citation', title: 'Official fixture', url: citation }] }] },
        ],
      });
    });
    assert.equal(calls, 1);
    assert.equal(parse(result.payload).citations[0].url, citation);
    assert.equal(result.webSearchCalls, 1);
    assert.equal(result.model, 'fixture-model-actual');
    assert.deepEqual(result.usage, { inputTokens: 11, outputTokens: 4, totalTokens: 15, cachedInputTokens: null, cacheWriteInputTokens: null });
    assert.ok(Number.isSafeInteger(result.durationMs) && result.durationMs >= 0);
  }
});

void test('standard text transport retains cache partitions, actual tier and unexpected tool use', async () => {
  const run = async (usage, output) => generateText({ provider: 'openai', model: 'fixture-model', prompt: 'test' },
    { OPENAI_API_KEY: 'fixture-key' }, async (_url, init) => {
      assert.equal(JSON.parse(init.body).service_tier, 'default');
      return response({ id: 'resp_fixture', model: 'fixture-model', service_tier: 'priority', status: 'completed', usage, output });
    });
  const message = { type: 'message', content: [{ type: 'output_text', text: 'result' }] };
  const usage = { input_tokens: 12, output_tokens: 5, total_tokens: 17,
    input_tokens_details: { cached_tokens: 4, cache_write_tokens: 3 } };
  const result = await run(usage, [message, { type: 'web_search_call' }]);
  assert.equal(result.serviceTier, 'priority', 'actual processing tier must not be inferred from the request');
  assert.equal(result.reportedModel, 'fixture-model');
  assert.equal(result.responseStatus, 'completed');
  assert.equal(result.providerResponseId, 'resp_fixture');
  assert.equal(result.webSearchCalls, 1);
  assert.equal(result.textOnlyOutput, false);
  assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 5, totalTokens: 17,
    cachedInputTokens: 4, cacheWriteInputTokens: 3 });
  const unknownTool = await run(usage, [message, { type: 'future_billable_tool' }]);
  assert.equal(unknownTool.textOnlyOutput, false);
  const invalid = await run({ ...usage, input_tokens_details: { cached_tokens: 10, cache_write_tokens: 3 } }, [message]);
  assert.equal(invalid.usage, null, 'cache categories must partition, not exceed, total input');
  const incomplete = await createOpenAiResponse({ model: 'fixture-model' }, { OPENAI_API_KEY: 'fixture-key' },
    async () => response({ usage }));
  assert.equal(incomplete.webSearchCalls, null, 'missing output is unknown, not zero tool usage');
  assert.equal(incomplete.serviceTier, null);
  assert.equal(incomplete.textOnlyOutput, false);
  assert.equal(incomplete.reportedModel, null, 'request model fallback is not observed provider identity');
  assert.equal(incomplete.responseStatus, null);
  assert.equal(incomplete.providerResponseId, null);
});

void test('research transport does not submit without a credential or valid model', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return response({}); };
  await assert.rejects(createOpenAiResponse({ model: 'fixture-model' }, {}, fetcher),
    error => error.code === 'MISSING_PROVIDER_CREDENTIAL' && error.status === 503);
  await assert.rejects(createOpenAiResponse({ model: '' }, { OPENAI_API_KEY: 'fixture-key' }, fetcher),
    error => error.code === 'INVALID_MODEL' && error.status === 400);
  await assert.rejects(createOpenAiResponse({ model: 'fixture-model' }, { OPENAI_API_KEY: 'fixture-key' }, fetcher, 'bad\nheader'),
    error => error.code === 'INVALID_CLIENT_REQUEST_ID' && error.status === 400);
  assert.equal(calls, 0);
});

void test('research response body timeout is indeterminate and never automatically resubmitted', async () => {
  let calls = 0;
  await assert.rejects(createOpenAiResponse({ model: 'fixture-model' }, { OPENAI_API_KEY: 'fixture-key' }, async () => {
    calls++;
    return { ok: true, headers: new Headers({ 'x-request-id': 'req_fixture_body_timeout' }),
      json: async () => { throw new DOMException('private body error', 'AbortError'); } };
  }), error => error.code === 'UPSTREAM_TIMEOUT' && error.status === 504 &&
    error.providerRequestId === 'req_fixture_body_timeout' && !/private/.test(error.message));
  assert.equal(calls, 1);
});
