import test from 'node:test';
import assert from 'node:assert/strict';
import { describeMcpToolResult } from '../lib/mcp-tool-result.ts';

void test('a successful MCP result shows the tool output without its transport envelope', () => {
  assert.deepEqual(
    describeMcpToolResult({
      content: [{ type: 'text', text: 'fallback' }],
      structuredContent: { output: '整理済みの本文\n' },
      isError: false,
    }),
    { ok: true, text: '整理済みの本文\n' },
  );
});

void test('an MCP tool error is a failed run and retains its human-readable reason', () => {
  assert.deepEqual(
    describeMcpToolResult({
      content: [{ type: 'text', text: '入力を確認してください。' }],
      isError: true,
    }),
    { ok: false, text: '入力を確認してください。' },
  );
  assert.deepEqual(describeMcpToolResult({ isError: true }), {
    ok: false,
    text: 'MCPからエラーが返りました。',
  });
});

void test('structured results without output stay inspectable', () => {
  assert.deepEqual(
    describeMcpToolResult({ structuredContent: { count: 3 }, isError: false }),
    { ok: true, text: '{\n  "count": 3\n}' },
  );
});

void test('an empty MCP response cannot become a successful result', () => {
  for (const value of [null, '', { isError: false }, { isError: false, content: [] }, { structuredContent: {}, isError: false }])
    assert.deepEqual(describeMcpToolResult(value), {
      ok: false,
      text: 'MCPは成果本文を返しませんでした。',
    });
});

void test('malformed error flags cannot be presented as a successful result', () => {
  for (const flag of ['true', 'false', null, 0, 1, {}, []]) {
    assert.deepEqual(
      describeMcpToolResult({ isError: flag, content: [{ type: 'text', text: 'result' }] }),
      { ok: false, text: 'MCPの応答形式を確認できません。実行結果を照合してください。' },
    );
  }
});
