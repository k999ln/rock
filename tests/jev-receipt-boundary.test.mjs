import assert from 'node:assert/strict';
import test from 'node:test';
import { JEV_RUBRIC_ID, makeJevReceipt, validateJevEvaluationInput } from '../lib/jev-evaluation.ts';

const input = validateJevEvaluationInput({
  rubricId: JEV_RUBRIC_ID,
  state: 'Public synthetic output for review.',
  consent: { provider: 'typesafe-ai-via-vercel-ai-gateway', approved: true,
    approvedAt: '2026-10-11T12:00:00.000Z' },
});
const answers = () => ({
  grounded: { type: 'boolean', probability: 0.8 },
  safe: { type: 'boolean', probability: 0.9 },
  usefulness: { type: 'score', score: 1.5 },
});
const receipt = (result) => makeJevReceipt('synthetic-request', input, result,
  '2026-10-11T12:01:00.000Z');

void test('an evaluated receipt requires exactly the three rubric answers', async () => {
  for (const invalid of [null, [], new Array(3), {}, { grounded: answers().grounded },
    { ...answers(), execute: { type: 'boolean', probability: 1 } }]) {
    await assert.rejects(receipt({ answers: invalid }), /INVALID_RESPONSE/);
  }
});

void test('receipt rejects mistyped, non-finite and out-of-range evaluation values', async () => {
  for (const probability of [-0.1, 1.1, NaN, Infinity, '0.5', null]) {
    await assert.rejects(receipt({ answers: { ...answers(),
      grounded: { type: 'boolean', probability } } }), /INVALID_RESPONSE/);
  }
  for (const score of [-0.1, 2.1, NaN, Infinity, '1', null]) {
    await assert.rejects(receipt({ answers: { ...answers(),
      usefulness: { type: 'score', score } } }), /INVALID_RESPONSE/);
  }
  await assert.rejects(receipt({ answers: { ...answers(),
    safe: { type: 'score', probability: 0.9 } } }), /INVALID_RESPONSE/);
});

void test('receipt projects verified scalar answers without provider-controlled metadata', async () => {
  const source = answers();
  source.grounded.rawState = 'private provider echo';
  source.usefulness.probabilities = { 0: 0.1, 1: 0.3, 2: 0.6 };
  const result = await receipt({ answers: source });
  assert.deepEqual(result.answers, answers());
  assert.deepEqual(result.usage, { inputTokens: null, outputTokens: null, totalTokens: null });
  assert.equal(result.authority, 'advisory-only');
  assert.doesNotMatch(JSON.stringify(result), /private provider echo|Public synthetic/);
  source.safe.probability = 0;
  assert.equal(result.answers.safe.probability, 0.9);
});

void test('reported usage is optional, integral, nonnegative and internally consistent', async () => {
  for (const usage of [null, [], { inputTokens: -1 }, { outputTokens: 0.5 },
    { totalTokens: Infinity }, { inputTokens: '3' },
    { inputTokens: 4, totalTokens: 3 }, { inputTokens: null },
    { inputTokens: 3, outputTokens: 2, totalTokens: 6 },
    { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 1, totalTokens: Number.MAX_SAFE_INTEGER }]) {
    await assert.rejects(receipt({ answers: answers(), usage }), /INVALID_RESPONSE/);
  }
  const result = await receipt({ answers: answers(), usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } });
  assert.deepEqual(result.usage, { inputTokens: 3, outputTokens: 2, totalTokens: 5 });
  const partial = await receipt({ answers: answers(), usage: { totalTokens: 5 } });
  assert.deepEqual(partial.usage, { inputTokens: null, outputTokens: null, totalTokens: 5 });
});

void test('zero and maximum rubric positions remain valid', async () => {
  for (const score of [0, 1, 2]) {
    const value = answers();
    value.grounded.probability = 0;
    value.safe.probability = 1;
    value.usefulness.score = score;
    assert.deepEqual((await receipt({ answers: value })).answers, value);
  }
});
