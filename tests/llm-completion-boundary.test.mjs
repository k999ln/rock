import assert from 'node:assert/strict';
import test from 'node:test';
import { generateText, LlmProviderError } from '../lib/llm-providers.ts';

const chat = (finish_reason = 'stop', extra = {}) => ({
  choices: [{ finish_reason, message: { content: 'complete', ...extra } }],
});
const gemini = (finishReason = 'STOP', parts = [{ text: 'complete' }]) => ({
  candidates: [{ finishReason, content: { parts } }],
});
const fixtures = [
  { provider: 'ollama', env: {}, done: { done: true, done_reason: 'stop', message: { content: 'complete' } },
    incomplete: [{ done: false }, { done: undefined }, { done: 'true' },
      ...['length', 'load', null, undefined, ['stop']].map((done_reason) => ({ done_reason })),
      { message: { content: 'complete', tool_calls: [{ function: { name: 'unexpected' } }] } }] },
  { provider: 'anthropic', env: { ANTHROPIC_API_KEY: 'fixture' },
    done: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'complete' }] },
    incomplete: ['max_tokens', 'tool_use', 'pause_turn', 'refusal', null, undefined, ['end_turn']]
      .map((stop_reason) => ({ stop_reason })).concat([
        { content: [{ type: 'text', text: 'partial' }, { type: 'tool_use', name: 'unexpected' }] },
      ]) },
  { provider: 'google', env: { GOOGLE_GENERATIVE_AI_API_KEY: 'fixture' }, done: gemini(),
    incomplete: ['MAX_TOKENS', 'SAFETY', 'MALFORMED_FUNCTION_CALL', 'FINISH_REASON_UNSPECIFIED', null, '', ['STOP']]
      .map((reason) => gemini(reason)).concat([
        { candidates: [{ content: { parts: [{ text: 'partial' }] } }] },
        gemini('STOP', [{ text: 'partial' }, { functionCall: { name: 'unexpected', args: {} } }]),
        { candidates: [...gemini().candidates, ...gemini('MAX_TOKENS').candidates] },
      ]) },
  ...['local-model', 'openai-compatible'].map((provider) => ({ provider,
    env: { SKY_LOCAL_LLM_BASE_URL: 'http://127.0.0.1:4317/v1', SKY_LLM_COMPATIBLE_BASE_URL: 'http://127.0.0.1:1234/v1' },
    done: chat(), incomplete: ['length', 'tool_calls', 'content_filter', 'function_call', null, '', ['stop']]
      .map((reason) => chat(reason)).concat([
        { choices: [{ message: { content: 'partial' } }] },
        chat('stop', { tool_calls: [{ function: { name: 'unexpected' } }] }),
        chat('stop', { function_call: { name: 'unexpected' } }),
        { choices: [...chat().choices, ...chat('length').choices] },
      ]),
  })),
];
for (const fixture of fixtures) {
  void test(`${fixture.provider} requires a successful final reason without pending tool calls`, async () => {
    for (const patch of fixture.incomplete) {
      let calls = 0;
      await assert.rejects(generateText({ provider: fixture.provider, prompt: 'hello' }, fixture.env,
        async () => { calls++; return Response.json({ ...fixture.done, ...patch }); }),
      (error) => error instanceof LlmProviderError && error.code === 'INCOMPLETE_RESPONSE' && error.status === 502);
      assert.equal(calls, 1, 'partial generation must not trigger automatic duplicate requests');
    }
    const result = await generateText({ provider: fixture.provider, prompt: 'hello' }, fixture.env,
      async () => Response.json(fixture.done));
    assert.equal(result.text, 'complete');
  });
}

void test('completed optional tool defaults and Anthropic stop sequences remain usable', async () => {
  const cases = [
    ['anthropic', { ANTHROPIC_API_KEY: 'fixture' },
      { stop_reason: 'stop_sequence', stop_sequence: 'END', content: [{ type: 'text', text: 'complete' }] }],
    ...[undefined, null, []].flatMap((tool_calls) => [
      ['ollama', {}, { done: true, done_reason: 'stop', message: { content: 'complete', tool_calls } }],
      ['openai-compatible', { SKY_LLM_COMPATIBLE_BASE_URL: 'http://127.0.0.1:1234/v1' },
        chat('stop', { tool_calls, function_call: null })],
    ]),
    // Responses status is optional in the official SDK schema; this is not the
    // Chat Completions finish_reason contract. Unknown receipt fields stay null.
    ['openai', { OPENAI_API_KEY: 'fixture' },
      { output: [{ type: 'message', content: [{ type: 'output_text', text: 'complete' }] }] }],
  ];
  for (const [provider, env, payload] of cases) {
    const result = await generateText({ provider, prompt: 'hello' }, env, async () => Response.json(payload));
    assert.equal(result.text, 'complete');
    if (provider === 'openai') assert.equal(result.responseStatus, null);
  }
});

void test('OpenAI Responses still rejects every explicit non-completed status', async () => {
  for (const status of ['incomplete', 'failed', 'in_progress', 'cancelled', 'queued', null]) {
    await assert.rejects(generateText({ provider: 'openai', prompt: 'hello' }, { OPENAI_API_KEY: 'fixture' },
      async () => Response.json({ status, output: [{ type: 'message', content: [{ type: 'output_text', text: 'partial' }] }] })),
    (error) => error instanceof LlmProviderError && error.code === 'INCOMPLETE_RESPONSE');
  }
});

void test('Ollama receives the requested bounded output-token limit', async () => {
  for (const limit of [1, 237, 8_000]) {
    let body;
    await generateText({ provider: 'ollama', prompt: 'hello', maxOutputTokens: limit }, {},
      async (_url, init) => { body = JSON.parse(init.body); return Response.json(fixtures[0].done); });
    assert.equal(body.options.num_predict, limit);
    assert.equal(body.stream, false);
  }
});

void test('Ollama JSON mode is opt-in for bounded agent planning', async () => {
  let plainBody;
  await generateText({ provider: 'ollama', prompt: 'hello' }, {},
    async (_url, init) => { plainBody = JSON.parse(init.body); return Response.json(fixtures[0].done); });
  assert.equal(plainBody.format, undefined);

  let jsonBody;
  await generateText({ provider: 'ollama', prompt: 'hello', jsonOutput: true }, {},
    async (_url, init) => { jsonBody = JSON.parse(init.body); return Response.json(fixtures[0].done); });
  assert.equal(jsonBody.format, 'json');

  const schema = { type: 'object', required: ['message'], properties: { message: { type: 'string' } } };
  let schemaBody;
  await generateText({ provider: 'ollama', prompt: 'hello', jsonOutput: true, jsonSchema: schema }, {},
    async (_url, init) => { schemaBody = JSON.parse(init.body); return Response.json(fixtures[0].done); });
  assert.deepEqual(schemaBody.format, schema);

  let plannerBody;
  await generateText({ provider: 'ollama', prompt: 'hello', disableThinking: true }, {},
    async (_url, init) => { plannerBody = JSON.parse(init.body); return Response.json(fixtures[0].done); });
  assert.equal(plannerBody.think, false);
});
