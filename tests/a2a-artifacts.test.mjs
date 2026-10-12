import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeA2AArtifacts } from '../lib/a2a-artifacts.ts';

void test('A2A artifact normalization retains bounded text and omits remote file references', () => {
  const result = normalizeA2AArtifacts([
    {
      name: 'summary',
      description: 'A short report',
      parts: [
        { text: 'Useful result\u0000 text.' },
        { file: { uri: 'https://provider.example/private-result' } },
        { data: { token: 'must-not-be-returned' } },
      ],
    },
  ]);
  assert.deepEqual(result, {
    schemaVersion: 1,
    artifacts: [
      {
        name: 'summary',
        description: 'A short report',
        textParts: ['Useful result text.'],
      },
    ],
    omittedNonTextParts: 2,
    truncated: false,
  });
  assert.doesNotMatch(JSON.stringify(result), /provider\.example|must-not-be-returned/);
});

void test('A2A artifact normalization enforces response bounds and reports truncation', () => {
  const result = normalizeA2AArtifacts([
    { parts: [{ text: 'x'.repeat(40_000) }] },
    ...Array.from({ length: 20 }, () => ({ parts: [{ text: 'extra' }] })),
  ]);
  assert.ok(result);
  assert.equal(result.truncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 32_000);
  assert.ok(result.artifacts.length <= 16);
});

void test('empty or invalid artifacts do not become a result document', () => {
  assert.equal(normalizeA2AArtifacts(undefined), null);
  assert.equal(normalizeA2AArtifacts([]), null);
  assert.equal(normalizeA2AArtifacts([{ parts: [{ data: null }] }])?.omittedNonTextParts, 1);
});
