import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteAiTextRequest, RemoteAiTextClientError, readEveTextEstimate, readRemoteTextEstimate, eveTextEstimateIsCurrent } from '../lib/remote-ai-text-client.ts';

void test('Eve read-only over-comparison estimate cannot bypass paid cap reader or change source binding', t => {
  const sourceRef = { jobId: 'synthetic-job', revision: 1, sourceSha256: 'a'.repeat(64), materialSha256: ['b'.repeat(64), 'c'.repeat(64)], builder: 'eve.text-estimate/1' };
  const value = { estimate: { currency: 'USD', maximumChargeMinor: 5, inputTokenUpperBound: 100, outputTokenLimit: 1200,
    modelId: 'fixture-model', pricingVersion: 'fixture-1', rateCardDigest: 'd'.repeat(64), expiresAt: Date.now() + 600_000 }, unitRates: [
    { category: 'ordinary-input', rateMinorMicrosPerMillionTokens: 1000000000 },
    { category: 'output', rateMinorMicrosPerMillionTokens: 2000000000 }],
    rateSource: 'https://example.test/rates', cardId: 'synthetic-card', withinUserCap: false, userCapMinor: 0,
    estimateOnly: true, executionAuthorized: false, providerSubmission: 'not_performed', sourceRef, promptDigest: 'e'.repeat(64) };
  const expected = { sourceRef, promptDigest: value.promptDigest, currency: 'USD', outputTokenLimit: 1200, comparisonCapMinor: 0 };
  assert.equal(readEveTextEstimate(value, expected).withinUserCap, false);
  assert.throws(() => readRemoteTextEstimate(value, { currency: 'USD', outputTokenLimit: 1200, maximumBudgetMinor: 0 }), error => error.code === 'REMOTE_AI_QUOTE_OVER_CAP_OR_INVALID');
  for (const changed of [{ ...value, executionAuthorized: true }, { ...value, providerSubmission: 'performed' },
    { ...value, estimateOnly: false }, { ...value, withinUserCap: true }, { ...value, userCapMinor: 1 },
    { ...value, promptDigest: 'f'.repeat(64) }, { ...value, sourceRef: { ...sourceRef, revision: 2 } },
    { ...value, sourceRef: { ...sourceRef, materialSha256: sourceRef.materialSha256.toReversed() } }])
    assert.throws(() => readEveTextEstimate(changed, expected), error => error.code === 'INVALID_RESPONSE');
  for (const unitRates of [[], [value.unitRates[0], value.unitRates[0]]])
    assert.throws(() => readEveTextEstimate({ ...value, unitRates }, expected), error => error.code === 'INVALID_RESPONSE');
  for (const expiresAt of [undefined, null, NaN, Infinity, 'future', -1, 1.5, Date.now(), Date.now() - 1])
    assert.throws(() => readEveTextEstimate({ ...value, estimate: { ...value.estimate, expiresAt } }, expected), error => error.code === 'INVALID_RESPONSE');
  const paid = { ...value, withinUserCap: true, estimate: { ...value.estimate } }; delete paid.estimate.expiresAt;
  assert.equal(readRemoteTextEstimate(paid, { currency: 'USD', outputTokenLimit: 1200, maximumBudgetMinor: 10 }), paid, 'legacy paid shape behavior unchanged');
  assert.equal(eveTextEstimateIsCurrent(value, value.estimate.expiresAt - 1), true);
  assert.equal(eveTextEstimateIsCurrent(value, value.estimate.expiresAt), false);
  assert.equal(eveTextEstimateIsCurrent(value, NaN), false);
  let at = Date.now(); const expiry = at + 1;
  const delayed = { ...value, estimate: { ...value.estimate, expiresAt: expiry } };
  Object.defineProperty(delayed, 'withinUserCap', { get() { at = expiry; return false; } });
  const clock = t.mock.method(Date, 'now', () => at);
  assert.throws(() => readEveTextEstimate(delayed, expected), error => error.code === 'INVALID_RESPONSE', 'time consumed by parsing cannot retain an expired estimate');
  clock.mock.restore();
});

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
