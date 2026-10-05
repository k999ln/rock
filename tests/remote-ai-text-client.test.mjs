import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteAiTextRequest, RemoteAiTextClientError } from '../lib/remote-ai-text-client.ts';

void test('expired sign-in and redirects produce a recovery action without following another destination', async () => {
  for (const response of [Response.json({ code: 'UNAUTHORIZED' }, { status: 401 }), new Response('', { status: 302 })]) {
    let calls = 0;
    await assert.rejects(remoteAiTextRequest('/api/llm/quotes', 'GET', undefined, 1000, async (_url, init) => {
      calls++; assert.equal(init.redirect, 'manual'); return response;
    }), error => error instanceof RemoteAiTextClientError && error.status === 401 && /サインイン/.test(error.message));
    assert.equal(calls, 1);
  }
});
void test('an ambiguous execution response is never retried', async () => {
  let calls = 0;
  await assert.rejects(remoteAiTextRequest('/api/llm/text', 'POST', { quoteId: 'synthetic-quote' }, 1000, async () => {
    calls++; throw new DOMException('private network data', 'AbortError');
  }), error => error.code === 'NETWORK' && /再送せず/.test(error.message));
  assert.equal(calls, 1);
});
void test('server diagnostics do not expose provider messages and currency choices are bounded', async () => {
  await assert.rejects(remoteAiTextRequest('/api/llm/estimate', 'POST', {}, 1000, async () =>
    Response.json({ code: 'RATE_CARD_CURRENCY_REQUIRED', currencies: ['USD', 'JPY', 'bad', 123], message: 'private-provider-details' }, { status: 409 })),
  error => error.code === 'RATE_CARD_CURRENCY_REQUIRED' && error.currencies.join(',') === 'USD,JPY' && !error.message.includes('private-provider'));
  await assert.rejects(remoteAiTextRequest('/api/llm/quotes', 'GET', undefined, 1000, async () =>
    new Response('<html>private sign-in page</html>', { status: 200 })), error => error.code === 'INVALID_RESPONSE');
});
void test('cloud operations remain on the owned API and preserve the request without resubmission', async () => {
  let calls = 0;
  await assert.rejects(remoteAiTextRequest('https://other.example/api/llm/text', 'POST', {}, 1000, async () => {
    calls++; return Response.json({});
  }), error => error.code === 'INVALID_REQUEST');
  assert.equal(calls, 0);
  const result = await remoteAiTextRequest('/api/llm/quotes?parentJobId=owned-job', 'GET', undefined, 1000, async (url, init) => {
    calls++; assert.equal(url, '/api/llm/quotes?parentJobId=owned-job'); assert.equal(init.cache, 'no-store');
    return Response.json({ executions: [], executionAvailable: false });
  });
  assert.equal(result.executionAvailable, false); assert.equal(calls, 1);
});
