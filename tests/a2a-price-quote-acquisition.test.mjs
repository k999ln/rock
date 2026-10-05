import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { a2aPriceQuoteSigningBytes, A2A_PRICE_QUOTE_SCHEMA } from '../lib/a2a-price-quote.ts';
import { acquireA2APriceQuote } from '../lib/a2a-price-quote-acquisition.ts';

const origin = 'https://agent.example.com';
const extensionUri = 'https://rockstar.example.com/extensions/a2a-price-quote/v1';
const prompt = 'Prepare a short market research summary.';
const card = {
  name: 'Research Agent',
  description: 'Fixture provider agent.',
  version: '1.2.0',
  supportedInterfaces: [{ url: `${origin}/rpc`, protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
  capabilities: { extensions: [{ uri: extensionUri, required: true }] },
};
const cardJson = JSON.stringify(card);
const cardSha256 = createHash('sha256').update(cardJson).digest('hex');
const pair = generateKeyPairSync('ed25519');
const publicKeyHex = pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
const agent = {
  id: '123e4567-e89b-42d3-a456-426614174000', origin,
  cardUrl: `${origin}/.well-known/agent-card.json`, agentName: card.name,
  agentVersion: card.version, cardSha256, cardJson, discoveredAt: Date.now(),
};
const response = (id, result) => new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
  headers: { 'content-type': 'application/json' },
});

function signedQuote(requestSha256, maximumBudgetMinor = 500) {
  const quote = {
    schema: A2A_PRICE_QUOTE_SCHEMA,
    providerId: 'fixture-provider',
    keyId: 'fixture-key-1',
    quoteId: 'fixture-quote-1',
    agentOrigin: origin,
    agentName: card.name,
    agentVersion: card.version,
    requestSha256,
    pricingVersion: 'fixture-rates-1',
    pricingSha256: 'a'.repeat(64),
    currency: 'USD',
    estimateMinor: 125,
    maxAmountMinor: maximumBudgetMinor,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 20 * 60_000,
    usage: [{ meter: 'task', quantity: 1, unit: 'request', unitPriceMinor: 125, amountMinor: 125 }],
    signature: '',
  };
  quote.signature = sign(null, a2aPriceQuoteSigningBytes(quote), pair.privateKey).toString('base64url');
  return quote;
}

const baseInput = {
  agent,
  quoteRequestId: '123e4567-e89b-42d3-a456-426614174001',
  message: prompt,
  currency: 'USD',
  maximumBudgetMinor: 500,
  expiresAt: Date.now() + 60_000,
  consentToSharePromptForQuote: true,
  extensionUri,
  allowedOrigins: origin,
  trustedUsageKeys: JSON.stringify([{
    providerId: 'fixture-provider', keyId: 'fixture-key-1', agentOrigin: origin,
    publicKeyHex, status: 'active',
  }]),
};

void test('acquires a quote-only response and verifies it against the connected Agent and exact prompt', async () => {
  let calls = 0;
  const quote = signedQuote(createHash('sha256').update(prompt).digest('hex'));
  const result = await acquireA2APriceQuote({
    ...baseInput,
    fetcher: async (_url, init) => {
      calls++;
      assert.equal(init.headers.get('A2A-Extensions'), extensionUri);
      const rpc = JSON.parse(init.body);
      assert.equal(rpc.method, 'GetPriceQuote');
      assert.equal(rpc.params.executionRequested, false);
      assert.equal(rpc.params.message.parts[0].text, prompt);
      return response(rpc.id, {
        schema: 'rock-a2a-price-quote-response/1',
        quoteRequestId: baseInput.quoteRequestId,
        priceQuote: quote,
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.quote.estimateMinor, 125);
  assert.equal(result.quoteDigest.length, 64);
});

void test('rejects changed connected Agent snapshots and does not make a Provider call', async () => {
  let calls = 0;
  await assert.rejects(acquireA2APriceQuote({
    ...baseInput,
    agent: { ...agent, cardSha256: 'b'.repeat(64) },
    fetcher: async () => { calls++; throw new Error('must not call'); },
  }), { code: 'AGENT_CARD_CHANGED' });
  assert.equal(calls, 0);
});

void test('does not disclose the prompt to an origin without an active trusted Provider key', async () => {
  let calls = 0;
  await assert.rejects(acquireA2APriceQuote({
    ...baseInput,
    trustedUsageKeys: JSON.stringify([{
      providerId: 'other-provider', keyId: 'other-key', agentOrigin: 'https://other-agent.example',
      publicKeyHex, status: 'active',
    }]),
    fetcher: async () => { calls++; throw new Error('must not call'); },
  }), { code: 'NO_TRUSTED_PROVIDER_KEY' });
  assert.equal(calls, 0);
});

void test('rejects unsigned or request-mismatched Provider quote responses', async () => {
  const invalidQuote = signedQuote('f'.repeat(64));
  await assert.rejects(acquireA2APriceQuote({
    ...baseInput,
    fetcher: async (_url, init) => response(JSON.parse(init.body).id, {
      schema: 'rock-a2a-price-quote-response/1',
      quoteRequestId: baseInput.quoteRequestId,
      priceQuote: invalidQuote,
    }),
  }), { code: 'PROVIDER_QUOTE_UNTRUSTED' });
});
