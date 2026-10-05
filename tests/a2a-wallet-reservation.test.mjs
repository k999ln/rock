import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const fixture = JSON.parse(readFileSync(new URL('../android/core/src/test/resources/a2a-wallet-reservation-v2.json', import.meta.url), 'utf8'));

function payloadDigest(value) {
  const fields = [
    value.schema, value.ownerUserId, value.parentJobId, value.delegationId,
    value.stableTaskId, value.agentOrigin, value.agentName, value.agentVersion,
    value.currency, value.pricingVersion, value.requestSha256, value.priceQuoteDigest,
    String(value.limitMinor), String(value.parentBudgetLimitMinor), String(value.createdAt), String(value.deadlineAt),
  ];
  return createHash('sha256').update(fields.join('\n')).digest('hex');
}

void test('matches the native quote-bound Wallet approval digest vector', () => {
  assert.equal(fixture.schema, 'rockstaros-a2a-wallet-reservation/2');
  assert.equal(fixture.stableTaskId, fixture.delegationId);
  assert.equal(payloadDigest(fixture), fixture.payloadDigest);
});

void test('request changes and quote changes require a different Wallet approval', () => {
  assert.notEqual(payloadDigest({ ...fixture, requestSha256: 'b'.repeat(64) }), fixture.payloadDigest);
  assert.notEqual(payloadDigest({ ...fixture, priceQuoteDigest: 'd'.repeat(64) }), fixture.payloadDigest);
  assert.notEqual(payloadDigest({ ...fixture, limitMinor: 701 }), fixture.payloadDigest);
  assert.notEqual(payloadDigest({ ...fixture, parentBudgetLimitMinor: 901 }), fixture.payloadDigest);
});
