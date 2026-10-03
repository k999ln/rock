import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertSafeOutbound,
  detectSensitiveData,
  redactSensitiveData,
  SensitiveDataBlockedError,
  MAX_TEXT_LENGTH,
} from '../toolkits/spider-guard/detector.mjs';
import {
  generateText,
  isLoopbackLlmEndpoint,
  isRemoteLlmRequest,
} from '../lib/llm-providers.ts';
import { buildLegalAiRequest } from '../lib/legal-ai.ts';
import { buildPatentAiRequest } from '../lib/patent-ai.ts';
import {
  validateJevEvaluationInput,
  JEV_RUBRIC_ID,
} from '../lib/jev-evaluation.ts';
import { TypeSafeJevProvider } from '../lib/decision-layer.ts';

function blocked(error) {
  assert(error instanceof SensitiveDataBlockedError);
  assert.equal(error.code, 'SENSITIVE_DATA_BLOCKED');
  assert.equal(error.message, 'SENSITIVE_DATA_BLOCKED');
  return true;
}

void test('real detector labels credentials and personal values without retaining content', () => {
  const text =
    'first line\nOPENAI_API_KEY="only_a_test_value"\nAWS_SECRET_KEY=test_only\nuser@example.test\n090-0000-1234\n4111 1111 1111 1111';
  const findings = detectSensitiveData(text);
  assert.equal(findings.length, 5);
  assert.equal(findings[0].label, 'APIキー');
  assert.equal(
    text.slice(findings[0].start, findings[0].end),
    'only_a_test_value',
  );
  assert.equal(text.slice(0, findings[0].start).split('\n').length, 2);
  const masked = redactSensitiveData(text);
  for (const finding of findings) {
    const raw = text.slice(finding.start, finding.end);
    assert(!JSON.stringify(finding).includes(raw));
    assert(!masked.includes(raw));
  }
  assert.equal(detectSensitiveData(masked).length, 0);
  assert.deepEqual(detectSensitiveData(text), findings);
});

void test('multiline PEM, quoted escapes, token formats and overlapping values are protected', () => {
  const pem =
    '-----BEGIN PRIVATE KEY-----\nPLACEHOLDER\n-----END PRIVATE KEY-----';
  assert.equal(detectSensitiveData(pem)[0].end, pem.length);
  assert.equal(detectSensitiveData('PASSWORD="test\\"only"')[0].end, 20);
  const token = 'ghp_' + 'x'.repeat(36);
  assert.equal(detectSensitiveData(token).length, 1);
  const overlap = detectSensitiveData('access_token="user@example.test"');
  assert.equal(overlap.length, 1);
  assert.equal(overlap[0].kind, 'secret');
  assert.equal(detectSensitiveData('4111 1111 1111 1112').length, 0);
  assert.equal(detectSensitiveData('0000 0000 0000 0000').length, 0);
  assert.equal(
    detectSensitiveData('const OPENAI_API_KEY = process.env.OPENAI_API_KEY;')
      .length,
    0,
  );
});

void test('nested JSON, numeric personal values, secret fields and limits fail closed', () => {
  for (const value of [
    { data: [{ email: 'user@example.test' }] },
    { OPENAI_API_KEY: 'fixture_still_blocked' },
    { AWS_SECRET_ACCESS_KEY: 'fixture_still_blocked' },
    { GITHUB_TOKEN: 'fixture_still_blocked' },
    { number: 4111111111111111 },
    'x'.repeat(MAX_TEXT_LENGTH + 1),
  ])
    assert.throws(() => assertSafeOutbound(value), blocked);
  const cyclic = {};
  cyclic.again = cyclic;
  assert.throws(() => assertSafeOutbound(cyclic), blocked);
  const transformed = Object.defineProperty({}, 'toJSON', {
    value: () => 'must_not_run',
  });
  assert.throws(() => assertSafeOutbound(transformed), blocked);
  let deep = {};
  for (let i = 0; i < 22; i++) deep = { child: deep };
  assert.throws(() => assertSafeOutbound(deep), blocked);
  assert.throws(
    () =>
      assertSafeOutbound({
        get value() {
          throw new Error('must not run');
        },
      }),
    blocked,
  );
  assertSafeOutbound({
    text: 'Write a short greeting',
    count: 12,
    nested: [true, null],
  });
  assert.throws(
    () => detectSensitiveData('x'.repeat(MAX_TEXT_LENGTH + 1)),
    blocked,
  );
});

void test('every LLM HTTP adapter blocks personal/secret inputs before network dispatch', async () => {
  const runtime = {
    OPENAI_API_KEY: 'server-credential',
    ANTHROPIC_API_KEY: 'server-credential',
    GOOGLE_GENERATIVE_AI_API_KEY: 'server-credential',
    SKY_LLM_COMPATIBLE_BASE_URL: 'http://127.0.0.1:1234',
    SKY_LOCAL_LLM_BASE_URL: 'http://127.0.0.1:1234',
  };
  for (const provider of [
    'local-model',
    'ollama',
    'openai',
    'anthropic',
    'google',
    'openai-compatible',
  ]) {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      throw new Error('must not send');
    };
    for (const prompt of [
      'OPENAI_API_KEY="test_only"',
      'Contact user@example.test',
    ])
      await assert.rejects(
        generateText({ provider, prompt }, runtime, fetchImpl),
        blocked,
      );
    await assert.rejects(
      generateText(
        { provider, prompt: 'hello', system: '090-0000-1234' },
        runtime,
        fetchImpl,
      ),
      blocked,
    );
    assert.equal(calls, 0);
  }
  let calls = 0;
  const output = await generateText(
    { provider: 'openai', prompt: 'Write a greeting' },
    runtime,
    async (_url, init) => {
      calls++;
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, 'Bearer server-credential');
      assert(!init.body.includes('server-credential'));
      return new Response(
        JSON.stringify({
          output: [{ content: [{ type: 'output_text', text: 'Hello' }] }],
        }),
      );
    },
  );
  assert.equal(calls, 1);
  assert.equal(output.text, 'Hello');
});

void test('local endpoint classification uses actual configured address, including IPv6', () => {
  assert(isLoopbackLlmEndpoint('http://[::1]:1234'));
  assert(!isLoopbackLlmEndpoint('https://127.0.0.1.attacker.invalid'));
  assert(!isLoopbackLlmEndpoint('http://user:pass@localhost'));
  assert(
    isRemoteLlmRequest('ollama', {
      SKY_OLLAMA_BASE_URL: 'https://remote.example',
    }),
  );
  assert(
    isRemoteLlmRequest('local-model', {
      SKY_LOCAL_LLM_BASE_URL: 'https://remote.example',
    }),
  );
  assert(!isRemoteLlmRequest('ollama', {}));
});

void test('legal and patent outbound builders block free-text data before fetch can start', () => {
  const legal = {
    situationSummary: 'A generic question without identifiers.',
    desiredOutcome: 'Find public resources',
  };
  assert(buildLegalAiRequest(legal, '2026-10-02').input);
  assert.throws(
    () =>
      buildLegalAiRequest(
        { ...legal, desiredOutcome: 'mail user@example.test' },
        '2026-10-02',
      ),
    blocked,
  );
  const patent = Object.fromEntries(
    [
      'inventionTitle',
      'problem',
      'mechanism',
      'architecture',
      'technicalEffect',
      'differences',
      'knownPriorArt',
    ].map((key) => [key, 'General public technical description']),
  );
  assert(buildPatentAiRequest(patent, '2026-10-02').input);
  assert.throws(
    () =>
      buildPatentAiRequest(
        { ...patent, mechanism: 'API_KEY=test_only' },
        '2026-10-02',
      ),
    blocked,
  );
});

void test('both Jev paths block sensitive state before evaluate and direct calls enforce consent', async () => {
  const input = {
    rubricId: JEV_RUBRIC_ID,
    state: 'user@example.test',
    consent: {
      provider: 'typesafe-ai-via-vercel-ai-gateway',
      approved: true,
      approvedAt: '2026-10-02T00:00:00Z',
    },
  };
  assert.throws(() => validateJevEvaluationInput(input), blocked);
  let calls = 0;
  const provider = new TypeSafeJevProvider('server-credential', async () => {
    calls++;
    throw new Error('must not send');
  });
  await assert.rejects(
    provider.decide({ state: input.state, privacy: 'remote-allowed' }),
    blocked,
  );
  await assert.rejects(
    provider.decide({ state: 'hello', privacy: 'local-only' }),
    /REMOTE_CONSENT_REQUIRED/,
  );
  assert.equal(calls, 0);
});
