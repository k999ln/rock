import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLegalAiRequest, parseLegalAiResponse } from '../lib/legal-ai.ts';
import { buildPatentAiRequest, parsePatentAiResponse } from '../lib/patent-ai.ts';
import { RemoteAiGuardError } from '../lib/remote-ai-guard.ts';
import { SensitiveDataBlockedError } from '../toolkits/spider-guard/detector.mjs';
import {
  ResearchAiUpstreamError,
  requestResearchAi,
  researchAiErrorResponse,
} from '../lib/research-ai.ts';

const response = (annotations, text = 'Official information') => ({
  output: [
    { type: 'message', content: [{ type: 'output_text', text, annotations }] },
  ],
});
const citation = (url, title = ' Official source ') => ({
  type: 'url_citation',
  url,
  title,
});
const parsers = [
  {
    name: 'legal',
    parse: parseLegalAiResponse,
    domain: 'nycourts.gov',
    other: 'jpo.go.jp',
  },
  {
    name: 'patent',
    parse: parsePatentAiResponse,
    domain: 'jpo.go.jp',
    other: 'nycourts.gov',
  },
];
const messages = {
  logLabel: 'research fixture',
  upstream: 'The upstream service is unavailable.',
};
const noLog = () => {};

for (const { name, parse, domain, other } of parsers) {
  void test(`${name}: shared parser preserves text, deduplication, source title and timestamp`, () => {
    const url = `https://www.${domain}/document`;
    const payload = response([citation(url, ' First title ')]);
    payload.output.push({
      type: 'web_search_call',
      content: [{ type: 'output_text', text: 'not an answer' }],
    });
    payload.output.push({
      type: 'message',
      content: [
        {
          type: 'output_text',
          text: 'More information',
          annotations: [
            citation(url, ' Latest title '),
            citation(`https://${domain}/other`, ' '),
          ],
        },
      ],
    });
    const parsed = parse(payload, '2026-10-02T12:00:00.000Z');
    assert.equal(parsed.answer, 'Official information\n\nMore information');
    assert.deepEqual(parsed.citations, [
      { title: 'Latest title', url },
      { title: domain, url: `https://${domain}/other` },
    ]);
    assert.equal(parsed.searchedAt, '2026-10-02T12:00:00.000Z');
    if (name === 'legal') assert.equal(parsed.mode, 'remote-search');
    else assert.equal('mode' in parsed, false);
  });

  void test(`${name}: citation allowlist remains specific to its Tool`, () => {
    const parsed = parse(
      response([
        citation(`https://${domain}/allowed`),
        citation(`https://${other}/other-tool-only`),
        citation(`https://${domain}.example.com/fake`),
        citation(`https://fake${domain}/fake`),
      ]),
    );
    assert.deepEqual(parsed.citations, [
      { title: 'Official source', url: `https://${domain}/allowed` },
    ]);
    assert.throws(
      () => parse(response([citation(`https://${other}/`)])),
      /UNCITED_RESPONSE/,
    );
  });

  void test(`${name}: allowlisted hostnames cannot admit unsafe or ambiguous URLs`, () => {
    const unsafe = [
      `javascript://${domain}/alert(1)`,
      `data:text/html,https://${domain}/`,
      `file://${domain}/document`,
      `ftp://${domain}/document`,
      `http://${domain}/document`,
      `https://${domain}:8443/document`,
      `https://someone:secret@${domain}/document`,
      `https://evil.example@${domain}/document`,
      `https://${domain}@evil.example/document`,
      `//${domain}/document`,
      `https:${domain}/document`,
      ` https://${domain}/document`,
      `https://${domain}/line\nbreak`,
      `https://${domain}\\document`,
    ];
    for (const url of unsafe)
      assert.throws(
        () => parse(response([citation(url)])),
        /UNCITED_RESPONSE/,
        url,
      );
    const parsed = parse(
      response([
        ...unsafe.map((url) => citation(url)),
        citation(`https://www.${domain}:443/document`),
      ]),
    );
    assert.equal(parsed.citations.length, 1);
    assert.equal(parsed.citations[0].url, `https://www.${domain}:443/document`);
  });

  void test(`${name}: malformed or uncited responses fail without inventing sources`, () => {
    const malformed = [
      null,
      false,
      [],
      {},
      { output: {} },
      { output: [null, { type: 'message', content: {} }] },
      response([
        { type: 'url_citation', url: { toString: () => `https://${domain}/` } },
      ]),
      response([citation(`https://${domain}/`)], '   '),
      response([citation(`https://${domain}/`)], 123),
      response({ type: 'url_citation', url: `https://${domain}/` }),
    ];
    for (const payload of malformed)
      assert.throws(() => parse(payload), /UNCITED_RESPONSE/);
    const parsed = parse(
      response([null, citation(`https://${domain}/`, { invalid: true })]),
    );
    assert.deepEqual(parsed.citations, [
      { title: domain, url: `https://${domain}/` },
    ]);
  });
}

void test('research transport sends the caller policy unchanged to one fixed endpoint', async () => {
  const body = {
    model: 'fixture-model',
    store: false,
    max_tool_calls: 4,
    input: 'public fixture',
  };
  const payload = response([citation('https://nycourts.gov/')]);
  let calls = 0;
  const result = await requestResearchAi(
    body,
    'fixture-key',
    async (url, init) => {
      calls += 1;
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(init.method, 'POST');
      assert.equal(init.redirect, 'error');
      assert.deepEqual(init.headers, {
        Authorization: 'Bearer fixture-key',
        'Content-Type': 'application/json',
      });
      assert.deepEqual(JSON.parse(init.body), body);
      return Response.json(payload);
    },
  );
  assert.equal(calls, 1);
  assert.deepEqual(result, payload);
});

void test('parsed upstream failures retain the 502 path and do not expose upstream contents', async () => {
  for (const status of [401, 429, 500, 503]) {
    let calls = 0;
    try {
      await requestResearchAi({}, 'fixture-key', async () => {
        calls += 1;
        return Response.json(
          { error: { message: 'sensitive upstream detail' } },
          { status },
        );
      });
      assert.fail('upstream error was accepted');
    } catch (error) {
      assert.ok(error instanceof ResearchAiUpstreamError);
      assert.equal(error.status, status);
      assert.equal(error.message, 'RESEARCH_AI_UPSTREAM_FAILED');
      const logged = [];
      const result = researchAiErrorResponse(error, messages, (...values) =>
        logged.push(values),
      );
      assert.equal(result.status, 502);
      assert.equal(result.headers.get('Cache-Control'), 'no-store');
      assert.deepEqual(await result.json(), { error: messages.upstream });
      assert.deepEqual(logged, [['research fixture upstream failed', status]]);
    }
    assert.equal(calls, 1, 'failed requests must not be retried');
  }
});

void test('transport, invalid JSON and uncited answers retain the generic 400 route contract', async () => {
  const networkError = new Error('network unavailable');
  for (const fetchImpl of [
    async () => {
      throw networkError;
    },
    async () => new Response('not JSON', { status: 200 }),
    async () => new Response('not JSON', { status: 503 }),
  ]) {
    let failure;
    try {
      await requestResearchAi({}, 'fixture-key', fetchImpl);
    } catch (error) {
      failure = error;
    }
    assert.ok(failure instanceof Error);
    const result = researchAiErrorResponse(failure, messages, noLog);
    assert.equal(result.status, 400);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await result.json(), {
      error: '入力を確認して、もう一度お試しください。',
    });
  }
  assert.equal(
    researchAiErrorResponse(new Error('UNCITED_RESPONSE'), messages, noLog)
      .status,
    400,
  );
});

void test('shared error handling preserves auth, origin and per-user rate-limit errors', async () => {
  for (const [code, status, text] of [
    ['UNAUTHORIZED', 401, 'サインインしてください。'],
    ['ORIGIN', 403, 'このサイトから操作してください。'],
    ['RATE_LIMITED', 429, '利用上限に達しました。1分後に再試行してください。'],
  ]) {
    const result = researchAiErrorResponse(
      new RemoteAiGuardError(code, status),
      messages,
      () => assert.fail('guard error should not log input'),
    );
    assert.equal(result.status, status);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await result.json(), { error: text, code });
  }
});

void test('shared research transport blocks secrets and personal input before fetch and returns metadata only', async () => {
  let calls = 0;
  for (const [body, kind] of [
    [{ input: 'Contact owner@example.test' }, 'personal'],
    [{ input: [{ text: 'OPENAI_API_KEY="fixture_only"' }] }, 'secret'],
  ]) {
    let failure;
    try {
      await requestResearchAi(body, 'provider-credential', async () => {
        calls++;
        throw new Error('must_not_send');
      });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure instanceof SensitiveDataBlockedError);
    const result = researchAiErrorResponse(failure, messages, () => {
      assert.fail('blocked input must not be logged');
    });
    assert.equal(result.status, 422);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await result.json(), {
      error: 'Spider Guardが機密情報の外部送信を止めました。内容を取り除いて再試行してください。',
      code: 'SENSITIVE_DATA_BLOCKED',
      count: 1,
      kinds: [kind],
    });
  }
  assert.equal(calls, 0);
});

void test('both guarded builders remain compatible with the shared transport and block before dispatch', async () => {
  const cases = [
    {
      build: buildLegalAiRequest,
      input: { situationSummary: 'A generic public question.', desiredOutcome: 'Find public resources' },
      field: 'situationSummary',
    },
    {
      build: buildPatentAiRequest,
      input: Object.fromEntries([
        'inventionTitle', 'problem', 'mechanism', 'architecture',
        'technicalEffect', 'differences', 'knownPriorArt',
      ].map((field) => [field, 'General public technical description'])),
      field: 'mechanism',
    },
  ];
  for (const { build, input, field } of cases) {
    let calls = 0;
    const fetchImpl = async (_url, init) => {
      calls++;
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, 'Bearer provider-credential');
      assert.equal(init.body.includes('provider-credential'), false);
      return Response.json({ output: [] });
    };
    await requestResearchAi(build(input, '2026-10-03'), 'provider-credential', fetchImpl);
    assert.equal(calls, 1);
    for (const value of ['owner@example.test', 'API_KEY="fixture_only"']) {
      await assert.rejects(async () => requestResearchAi(
        build({ ...input, [field]: value }, '2026-10-03'),
        'provider-credential',
        fetchImpl,
      ), SensitiveDataBlockedError);
    }
    assert.equal(calls, 1, 'blocked input must not reach the shared transport');
  }
});

void test('generic research failure diagnostics never include exception text or input excerpts', async () => {
  for (const failure of [
    new Error('upstream echoed owner@example.test'),
    new SyntaxError('unexpected request text: private-input-marker'),
  ]) {
    const logged = [];
    const result = researchAiErrorResponse(failure, messages, (...values) => logged.push(values));
    assert.equal(result.status, 400);
    assert.deepEqual(logged, [['research fixture failed', 'UPSTREAM_OR_INPUT_ERROR']]);
    assert.deepEqual(await result.json(), { error: '入力を確認して、もう一度お試しください。' });
  }
});
