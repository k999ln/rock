import assert from 'node:assert/strict';
import test from 'node:test';
import {
  JEV_MODEL,
  JEV_RUBRIC_ID,
  makeJevReceipt,
  validateJevEvaluationInput,
} from '../lib/jev-evaluation.ts';

const valid = (overrides = {}) => ({
  rubricId: JEV_RUBRIC_ID,
  state: 'A short output that can be reviewed without private data.',
  consent: {
    provider: 'typesafe-ai-via-vercel-ai-gateway',
    approved: true,
    approvedAt: '2026-09-20T12:00:00.000Z',
  },
  ...overrides,
});

void test('Jev input is closed to the approved rubric and provider', () => {
  const parsed = validateJevEvaluationInput(valid());
  assert.equal(parsed.rubricId, JEV_RUBRIC_ID);
  assert.throws(() =>
    validateJevEvaluationInput(valid({ rubricId: 'freeform' })),
  );
  assert.throws(() =>
    validateJevEvaluationInput(
      valid({ consent: { ...valid().consent, approved: false } }),
    ),
  );
  assert.throws(() =>
    validateJevEvaluationInput(
      valid({ consent: { ...valid().consent, provider: 'openai' } }),
    ),
  );
});

void test('Jev receipt hashes state and rubric without storing state', async () => {
  const input = validateJevEvaluationInput(valid());
  const receipt = await makeJevReceipt(
    'request-1',
    input,
    {
      answers: {
        grounded: { type: 'boolean', probability: 0.91 },
        safe: { type: 'boolean', probability: 0.97 },
        usefulness: { type: 'score', score: 4 },
      },
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
    },
    '2026-09-20T12:01:00.000Z',
  );
  assert.equal(receipt.model, JEV_MODEL);
  assert.equal(receipt.authority, 'advisory-only');
  assert.equal(receipt.status, 'evaluated');
  assert.equal(receipt.evaluatedAt, '2026-09-20T12:01:00.000Z');
  assert.equal(receipt.stateHash.length, 64);
  assert.equal(receipt.rubricHash.length, 64);
  assert.equal('state' in receipt, false);
});
