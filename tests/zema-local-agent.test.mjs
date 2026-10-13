import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  executeZemaLocalAgentTool,
  parseZemaLocalAgentReply,
  runZemaLocalAgent,
  ZemaLocalAgentError,
  ZEMA_LOCAL_AGENT_SCHEMA,
} from '../lib/zema-local-agent.ts';

const response = (value) => JSON.stringify({ schema: ZEMA_LOCAL_AGENT_SCHEMA, ...value });

void test('local agent executes an allowlisted deterministic tool and stops on the model response', async () => {
  const replies = [
    response({ action: 'tool', tool: 'sky_route', arguments: { request: '出典を整理して' }, reason: '担当候補を確認' }),
    response({ action: 'respond', message: '出典整理役を候補にしました。まだ実行はしていません。' }),
  ];
  const result = await runZemaLocalAgent({
    request: '出典を整理して',
    planner: async ({ step }) => replies[step - 1],
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[0].tool, 'sky_route');
  assert.deepEqual(JSON.parse(result.artifacts[0].content), {
    matched: true,
    toolId: 'mr-citations',
    role: '出典整理役',
  });
  assert.match(result.text, /まだ実行はしていません/);
});

void test('citation and application checks reuse the existing pure tools', () => {
  const citations = executeZemaLocalAgentTool('format_citations', {
    markdown: '本文。（出典: [公式](https://example.com/source)）',
    language: 'ja',
  });
  assert.match(citations.content, /## 出典/);
  assert.ok(citations.content.includes('https://example.com/source'));

  const check = executeZemaLocalAgentTool('coconala_check', {
    brief: 'Zoom面談への参加が必須です。',
    proposal: '成果物を納品します。',
    bucket: 'single',
    orderRate: 80,
  });
  assert.match(check.content, /本人の参加が必要/);
  assert.match(check.content, /応募や送信は行いません/);
});

void test('planner output is a closed schema and arbitrary tools never execute', () => {
  assert.throws(() => parseZemaLocalAgentReply(response({
    action: 'tool', tool: 'shell', arguments: { command: 'whoami' }, reason: 'test',
  })), (error) => error instanceof ZemaLocalAgentError && error.code === 'INVALID_AGENT_PLAN');
  assert.throws(() => parseZemaLocalAgentReply(response({
    action: 'respond', message: 'ok', hiddenAuthority: true,
  })), (error) => error instanceof ZemaLocalAgentError && error.code === 'INVALID_AGENT_PLAN');
});

void test('duplicate calls and plans beyond three steps fail closed', async () => {
  const toolReply = response({
    action: 'tool', tool: 'sky_route', arguments: { request: '記事' }, reason: 'route',
  });
  await assert.rejects(runZemaLocalAgent({ request: '記事', planner: async () => toolReply }),
    (error) => error instanceof ZemaLocalAgentError && error.code === 'REPEATED_TOOL_CALL');

  let call = 0;
  await assert.rejects(runZemaLocalAgent({ request: '記事', planner: async () => response({
    action: 'tool', tool: 'sky_route', arguments: { request: `記事${++call}` }, reason: 'route',
  }) }), (error) => error instanceof ZemaLocalAgentError && error.code === 'AGENT_STEP_LIMIT');
});

void test('Zema chat sends local conversations through the bounded local agent endpoint', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../components/sky-chat-workspace.tsx'), 'utf8');
  assert.match(source, /\/api\/llm\/local-agent/);
  assert.match(source, /result\.steps/);
  assert.match(source, /ローカルAgent/);
});
