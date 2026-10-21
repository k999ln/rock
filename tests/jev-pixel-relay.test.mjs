import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PIXEL_JEV_FIXTURE_BODY,
  PIXEL_JEV_MAX_BODY_BYTES,
  PIXEL_JEV_RESPONSE_MODEL_PREFIX,
  createPixelJevBridge,
  pixelJevFixtureRequest,
} from '../scripts/jev-pixel-relay.mjs';

function providerFor(result) {
  const calls = [];
  return {
    calls,
    decide: async (request) => {
      calls.push(request);
      return result;
    },
  };
}

function greenResult(overrides = {}) {
  return {
    provider: 'typesafe_jev',
    status: 'answered',
    modelId: 'jev-1.13.0',
    answers: { route: { kind: 'choice', value: 'local' } },
    usage: { inputTokens: 367, outputTokens: 31 },
    ...overrides,
  };
}

async function withBridge(provider, callback) {
  const bridge = createPixelJevBridge({ provider });
  await bridge.listen(0);
  try {
    const address = bridge.server.address();
    assert.equal(typeof address, 'object');
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await bridge.close();
  }
}

void test('fixture request is public, fixed, one-shot, and cost bounded', () => {
  const request = pixelJevFixtureRequest();
  assert.deepEqual(request.dataClasses, ['public']);
  assert.equal(request.effect, 'none');
  assert.equal(request.constraints.maxLatencyMs, 10_000);
  assert.equal(request.constraints.maxCostMicros, 1_000);
  assert.equal(request.constraints.maxAttempts, 1);
  assert.equal(request.questions.length, 1);
  assert.deepEqual(Object.keys(request.state), ['fixture', 'signal']);
});

void test('valid fixed request returns only safe result fields and cannot call twice', async () => {
  const provider = providerFor(greenResult());
  await withBridge(provider, async (base) => {
    const first = await fetch(`${base}/v1/pixel-jev-preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: PIXEL_JEV_FIXTURE_BODY,
    });
    assert.equal(first.status, 200);
    const body = await first.json();
    assert.deepEqual(Object.keys(body).sort(), [
      'answer',
      'model',
      'status',
      'token',
    ]);
    assert.deepEqual(body, {
      status: 'ok',
      answer: 'local',
      token: { input: 367, output: 31 },
      model: `${PIXEL_JEV_RESPONSE_MODEL_PREFIX}1.13.0`,
    });
    assert.equal(provider.calls.length, 1);
    assert.deepEqual(provider.calls[0].dataClasses, ['public']);

    await assert.rejects(
      fetch(`${base}/v1/pixel-jev-preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: PIXEL_JEV_FIXTURE_BODY,
      }),
    );
    assert.equal(provider.calls.length, 1);
  });
});

void test('arbitrary or oversized body is rejected without consuming provider call', async () => {
  const provider = providerFor(greenResult());
  await withBridge(provider, async (base) => {
    const invalid = await fetch(`${base}/v1/pixel-jev-preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fixture: 'user-input' }),
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).status, 'invalid_request');
    assert.equal(provider.calls.length, 0);

    const oversized = await fetch(`${base}/v1/pixel-jev-preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(PIXEL_JEV_MAX_BODY_BYTES + 1),
    });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).status, 'invalid_request');
    assert.equal(provider.calls.length, 0);
  });
});

void test('provider failures become explicit safe error states without leaking error text', async () => {
  const provider = providerFor(null);
  provider.decide = async () => {
    throw new Error('provider secret or response must not escape');
  };
  await withBridge(provider, async (base) => {
    const response = await fetch(`${base}/v1/pixel-jev-preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: PIXEL_JEV_FIXTURE_BODY,
    });
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.deepEqual(body, {
      status: 'provider_error',
      answer: '',
      token: { input: 0, output: 0 },
      model: '',
    });
    assert.equal(JSON.stringify(body).includes('must not escape'), false);
  });
});
