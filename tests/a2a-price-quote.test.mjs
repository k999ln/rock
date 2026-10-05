import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  A2A_PRICE_QUOTE_SCHEMA,
  a2aPriceQuoteDigest,
  a2aPriceQuoteSigningBytes,
  verifyA2APriceQuote,
} from '../lib/a2a-price-quote.ts';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keyBytes = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
const requestSha256 = 'a'.repeat(64);
const pricingSha256 = 'b'.repeat(64);
const intent = {
  agentOrigin: 'https://agent.example.com', agentName: 'Research Agent', agentVersion: '2.1.0',
  requestSha256, currency: 'USD', maximumBudgetMinor: 900,
};

function quote(overrides = {}) {
  const value = {
    schema: A2A_PRICE_QUOTE_SCHEMA, providerId: 'provider-a', keyId: 'key-1', quoteId: 'q-1',
    agentOrigin: intent.agentOrigin, agentName: intent.agentName, agentVersion: intent.agentVersion,
    requestSha256, pricingVersion: 'rates-12', pricingSha256, currency: 'USD',
    estimateMinor: 400, maxAmountMinor: 600, issuedAt: 1_000, expiresAt: 10_000,
    usage: [
      { meter: 'input', quantity: 3, unit: 'k-token', unitPriceMinor: 100, amountMinor: 300 },
      { meter: 'tool-call', quantity: 1, unit: 'call', unitPriceMinor: 100, amountMinor: 100 },
    ],
    signature: '',
    ...overrides,
  };
  value.signature = sign(null, a2aPriceQuoteSigningBytes(value), privateKey).toString('base64url');
  return value;
}

const resolve = async () => Uint8Array.from(keyBytes);

void test('matches the Android canonical signed quote and digest fixture', async () => {
  const fixture = JSON.parse(readFileSync(new URL('../android/core/src/test/resources/a2a-price-quote-v1.json', import.meta.url), 'utf8'));
  const publicKeyBytes = Buffer.from('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'hex');
  const fixtureIntent = { ...intent, maximumBudgetMinor: 900 };
  const fixtureResolver = async ({ providerId, keyId, agentOrigin }) =>
    providerId === 'provider-a' && keyId === 'key-1' && agentOrigin === intent.agentOrigin
      ? Uint8Array.from(publicKeyBytes) : null;
  assert.equal(await verifyA2APriceQuote(fixture, fixtureIntent, fixtureResolver, 2_000), true);
  assert.equal(await a2aPriceQuoteDigest(fixture), '9ca4537c42d9cbcc26b214aae683d5115fb2e18dec863d86e7ad7c1cdc4da964');
});

void test('accepts a provider-signed quote bound to the exact request, agent, rate and budget', async () => {
  const value = quote();
  assert.equal(await verifyA2APriceQuote(value, intent, resolve, 2_000), true);
  assert.match(await a2aPriceQuoteDigest(value), /^[a-f0-9]{64}$/);
});

void test('rejects tampering and a quote replayed for different request or agent terms', async () => {
  const value = quote();
  assert.equal(await verifyA2APriceQuote({ ...value, estimateMinor: 450 }, intent, resolve, 2_000), false);
  assert.equal(await verifyA2APriceQuote(value, { ...intent, requestSha256: 'c'.repeat(64) }, resolve, 2_000), false);
  assert.equal(await verifyA2APriceQuote(value, { ...intent, agentVersion: '2.2.0' }, resolve, 2_000), false);
});

void test('rejects arithmetic errors, a cap above the authorized budget, and an expired quote', async () => {
  assert.equal(await verifyA2APriceQuote(quote({ usage: [{ meter: 'input', quantity: 3, unit: 'k-token', unitPriceMinor: 100, amountMinor: 250 }] }), intent, resolve, 2_000), false);
  assert.equal(await verifyA2APriceQuote(quote({ maxAmountMinor: 901 }), intent, resolve, 2_000), false);
  assert.equal(await verifyA2APriceQuote(quote(), intent, resolve, 10_000), false);
});

void test('requires the trusted provider key for the quoted agent origin', async () => {
  const value = quote();
  assert.equal(await verifyA2APriceQuote(value, intent, async () => null, 2_000), false);
  assert.equal(await verifyA2APriceQuote(value, intent, async ({ agentOrigin }) => agentOrigin === 'https://other.example' ? Uint8Array.from(keyBytes) : null, 2_000), false);
});
