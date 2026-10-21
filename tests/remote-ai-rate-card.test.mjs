import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  REMOTE_AI_RATE_CARD_SCHEMA,
  REMOTE_AI_TEXT_RATE_CARD_SCHEMA,
  estimateRemoteAiCostCeiling,
  remoteAiRateCardSigningBytes,
  textInputTokenUpperBound,
  verifyRemoteAiRateCard,
} from '../lib/remote-ai-rate-card.ts';
import {
  estimateRemoteAiTextLiveSpend,
  prepareRemoteAiTextQuote,
  remoteAiTextQuoteMatches,
  priceRemoteAiTextUsage,
} from '../lib/remote-ai-text-pricing.ts';
import { remoteAiTextRequestDigest } from '../lib/remote-ai-text-request.ts';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicKeyBytes = Uint8Array.from(publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
const now = 1_800_000_000_000;
const intent = { providerId: 'openai', modelId: 'model-a', currency: 'USD' };

function card(overrides = {}) {
  const value = {
    schema: REMOTE_AI_RATE_CARD_SCHEMA,
    providerId: 'openai',
    keyId: 'rate-key-1',
    cardId: 'card-2026-10',
    modelId: 'model-a',
    pricingVersion: 'rates-7',
    currency: 'USD',
    inputMinorMicrosPerMillionTokens: 2_000_000_000,
    outputMinorMicrosPerMillionTokens: 6_000_000_000,
    effectiveAt: now - 1_000,
    expiresAt: now + 60_000,
    sourceUrl: 'https://openai.com/pricing',
    signature: '',
    ...overrides,
  };
  value.signature = sign(null, remoteAiRateCardSigningBytes(value), privateKey).toString('base64url');
  return value;
}

const resolveKey = async ({ providerId, keyId }) =>
  providerId === 'openai' && keyId === 'rate-key-1' ? publicKeyBytes : null;

const textCard = (overrides = {}) => card({
  schema: REMOTE_AI_TEXT_RATE_CARD_SCHEMA,
  cachedInputMinorMicrosPerMillionTokens: 200_000_000,
  cacheWriteMinorMicrosPerMillionTokens: 4_000_000_000,
  executionScope: 'text-only', serviceTier: 'default', ...overrides,
});
const textIntent = {
  ownerId: 'synthetic-owner', requestId: 'synthetic-request', model: 'model-a',
  prompt: 'synthetic prompt', system: 'system', maxOutputTokens: 100, maximumBudgetMinor: 5,
};
const generation = {
  provider: 'openai', model: 'model-a', serviceTier: 'default', webSearchCalls: 0, textOnlyOutput: true,
  reportedModel: 'model-a', responseStatus: 'completed', providerResponseId: 'resp_synthetic',
  usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110, cachedInputTokens: 40, cacheWriteInputTokens: 30 },
};

void test('verifies a provider-signed rate card bound to provider, model and currency', async () => {
  const verified = await verifyRemoteAiRateCard(card(), intent, resolveKey, now);
  assert.ok(verified);
  assert.match(verified.digest, /^[a-f0-9]{64}$/);
  assert.equal(verified.card.modelId, intent.modelId);
});

void test('v2 signs cache prices and scope without changing legacy signing bytes', async () => {
  const legacy = card();
  const legacyBytes = new TextDecoder().decode(remoteAiRateCardSigningBytes(legacy));
  assert.equal(legacyBytes, 'rockstar-remote-ai-rate-card-signature/1\0' + JSON.stringify({
    schema: legacy.schema, providerId: legacy.providerId, keyId: legacy.keyId, cardId: legacy.cardId,
    modelId: legacy.modelId, pricingVersion: legacy.pricingVersion, currency: legacy.currency,
    inputMinorMicrosPerMillionTokens: legacy.inputMinorMicrosPerMillionTokens,
    outputMinorMicrosPerMillionTokens: legacy.outputMinorMicrosPerMillionTokens,
    effectiveAt: legacy.effectiveAt, expiresAt: legacy.expiresAt, sourceUrl: legacy.sourceUrl,
  }));
  const signed = textCard();
  assert.ok(await verifyRemoteAiRateCard(signed, intent, resolveKey, now));
  for (const changed of [
    { ...signed, cachedInputMinorMicrosPerMillionTokens: 0 },
    { ...signed, cacheWriteMinorMicrosPerMillionTokens: 0 },
    textCard({ serviceTier: 'priority' }), textCard({ executionScope: 'search' }),
    textCard({ cacheWriteMinorMicrosPerMillionTokens: -1 }),
    { ...signed, hiddenRate: 0 },
  ]) assert.equal(await verifyRemoteAiRateCard(changed, intent, resolveKey, now), null);
});

void test('v2 ceilings reserve the highest possible input-category rate', async () => {
  const verified = await verifyRemoteAiRateCard(textCard(), intent, resolveKey, now);
  const ceiling = estimateRemoteAiCostCeiling(verified, 500, 1, 3, now);
  assert.equal(ceiling.maximumChargeMinor, 3);
  assert.equal(ceiling.pricingCoverage, 'text-token-categories');
  assert.equal(estimateRemoteAiCostCeiling(verified, 500, 1, 2, now), null);
});

void test('live estimate uses conservative quoted input and visible output bytes without becoming final usage', async () => {
  const verified = await verifyRemoteAiRateCard(textCard(), intent, resolveKey, now);
  const ceiling = estimateRemoteAiCostCeiling(verified, 500, 100, 3, now);
  assert.ok(ceiling);
  const initial = estimateRemoteAiTextLiveSpend(verified, ceiling, 0, now);
  const progress = estimateRemoteAiTextLiveSpend(verified, ceiling, 80, now + 1);
  assert.ok(initial && progress);
  assert.equal(initial.estimatedInputTokens, 500);
  assert.equal(initial.estimatedOutputTokens, 0);
  assert.equal(progress.estimatedOutputTokens, 27);
  assert.ok(progress.estimatedChargeMinor >= initial.estimatedChargeMinor);
  assert.ok(progress.estimatedChargeMinor <= ceiling.maximumChargeMinor);
  assert.equal(progress.finalProviderUsage, false);
  assert.equal(progress.basis, 'quoted_input_upper_bound_plus_output_utf8_bytes_divided_by_3');
  assert.equal(estimateRemoteAiTextLiveSpend(verified, ceiling, -1, now), null);
  assert.equal(estimateRemoteAiTextLiveSpend({ ...verified, digest: '0'.repeat(64) }, ceiling, 10, now), null);
});

void test('browser and server share the same canonical quote-bound request digest', async () => {
  const quoted = await remoteAiTextRequestDigest({ model: ' model-a ', prompt: '  same request  ', system: ' system ', maxOutputTokens: 100 });
  const equivalent = await remoteAiTextRequestDigest({ model: 'model-a', prompt: 'same request', system: 'system', maxOutputTokens: 100 });
  const changed = await remoteAiTextRequestDigest({ model: 'model-a', prompt: 'different request', system: 'system', maxOutputTokens: 100 });
  assert.equal(quoted, equivalent);
  assert.notEqual(quoted, changed);
});

void test('quotes bind owner, exact request, output cap, approved budget, price digest and expiry', async () => {
  const verified = await verifyRemoteAiRateCard(textCard(), intent, resolveKey, now);
  const quote = await prepareRemoteAiTextQuote(verified, textIntent, now);
  assert.ok(quote);
  assert.equal(await remoteAiTextQuoteMatches(JSON.parse(JSON.stringify(quote)), verified, textIntent, now), true);
  assert.doesNotMatch(JSON.stringify(quote), /synthetic prompt|"system"/);
  for (const change of [
    { ownerId: 'other' }, { requestId: 'other' }, { prompt: 'changed' }, { system: 'changed' },
    { model: 'other' }, { maxOutputTokens: 101 }, { maximumBudgetMinor: 6 },
  ]) assert.equal(await remoteAiTextQuoteMatches(quote, verified, { ...textIntent, ...change }, now), false);
  assert.equal(await remoteAiTextQuoteMatches({ ...quote, approvedCapMinor: 6 }, verified, textIntent, now), false);
  assert.equal(await remoteAiTextQuoteMatches(quote, verified, textIntent, quote.expiresAt), false);
  const changedPrice = await verifyRemoteAiRateCard(textCard({ pricingVersion: 'rates-8' }), intent, resolveKey, now);
  assert.equal(await remoteAiTextQuoteMatches(quote, changedPrice, textIntent, now), false);
  const legacy = await verifyRemoteAiRateCard(card(), intent, resolveKey, now);
  assert.equal(await prepareRemoteAiTextQuote(legacy, textIntent, now), null);
});

void test('prices mutually exclusive token categories with exact arithmetic and a single rounding', async () => {
  const verified = await verifyRemoteAiRateCard(textCard(), intent, resolveKey, now);
  const quote = await prepareRemoteAiTextQuote(verified, textIntent, now);
  const priced = priceRemoteAiTextUsage(verified, quote.ceiling, generation);
  assert.equal(priced.status, 'priced');
  assert.equal(priced.numerator, '248000000000'); // 30 ordinary + 40 cached + 30 writes + 10 output
  assert.equal(priced.denominator, '1000000000000');
  assert.equal(priced.chargeMinor, 1);
  assert.deepEqual(priced.items.map(item => item.tokens), [30, 40, 30, 10]);
  assert.equal(priced.items.reduce((sum, item) => sum + item.tokens, 0), 110);
});

void test('unknown, inconsistent or unquoted charges cannot become a zero-cost settlement', async () => {
  const verified = await verifyRemoteAiRateCard(textCard(), intent, resolveKey, now);
  const { ceiling } = await prepareRemoteAiTextQuote(verified, textIntent, now);
  for (const [change, reason] of [
    [{ reportedModel: null }, 'MODEL_OR_TIER'],
    [{ responseStatus: null }, 'RESPONSE_IDENTITY'],
    [{ providerResponseId: null }, 'RESPONSE_IDENTITY'],
    [{ model: 'model-a-snapshot' }, 'MODEL_OR_TIER'],
    [{ serviceTier: null }, 'MODEL_OR_TIER'], [{ serviceTier: 'priority' }, 'MODEL_OR_TIER'],
    [{ webSearchCalls: 1 }, 'TOOL_USAGE'], [{ webSearchCalls: null }, 'TOOL_USAGE'],
    [{ textOnlyOutput: false }, 'TOOL_USAGE'], [{ usage: null }, 'MISSING_USAGE'],
    [{ usage: { ...generation.usage, cachedInputTokens: null } }, 'MISSING_USAGE'],
    [{ usage: { ...generation.usage, cacheWriteInputTokens: null } }, 'MISSING_USAGE'],
    [{ usage: { ...generation.usage, cacheWriteInputTokens: 70 } }, 'MISSING_USAGE'],
    [{ usage: { ...generation.usage, totalTokens: 111 } }, 'MISSING_USAGE'],
    [{ usage: { ...generation.usage, outputTokens: 101, totalTokens: 201 } }, 'USAGE_LIMIT'],
    [{ usage: { ...generation.usage, inputTokens: 1_000, totalTokens: 1_010 } }, 'USAGE_LIMIT'],
  ]) assert.deepEqual(priceRemoteAiTextUsage(verified, ceiling, { ...generation, ...change }),
    { status: 'unreconciled', reason });
  assert.equal(priceRemoteAiTextUsage(verified, { ...ceiling, maximumChargeMinor: 99 }, generation).reason, 'QUOTE_MISMATCH');
});

void test('rejects changed pricing, untrusted keys, mismatched intent and unsafe source URLs', async () => {
  const signed = card();
  assert.equal(await verifyRemoteAiRateCard({ ...signed, inputMinorMicrosPerMillionTokens: 9 }, intent, resolveKey, now), null);
  assert.equal(await verifyRemoteAiRateCard(signed, { ...intent, modelId: 'other-model' }, resolveKey, now), null);
  assert.equal(await verifyRemoteAiRateCard(signed, intent, async () => null, now), null);
  assert.equal(await verifyRemoteAiRateCard(card({ sourceUrl: 'https://openai.com.attacker.example/pricing' }), intent, resolveKey, now), null);
  assert.equal(await verifyRemoteAiRateCard(card({ sourceUrl: 'http://openai.com/pricing' }), intent, resolveKey, now), null);
});

void test('rejects expired, future-dated, overlong and malformed rate cards', async () => {
  assert.equal(await verifyRemoteAiRateCard(card({ expiresAt: now }), intent, resolveKey, now), null);
  assert.equal(await verifyRemoteAiRateCard(card({ effectiveAt: now + 31_000 }), intent, resolveKey, now), null);
  assert.equal(await verifyRemoteAiRateCard(card({ expiresAt: now + 91 * 24 * 60 * 60 * 1000 }), intent, resolveKey, now), null);
  assert.equal(await verifyRemoteAiRateCard(card({ outputMinorMicrosPerMillionTokens: Number.MAX_SAFE_INTEGER + 1 }), intent, resolveKey, now), null);
  assert.equal(await verifyRemoteAiRateCard({ ...card(), unexpected: true }, intent, resolveKey, now), null);
});

void test('uses a conservative UTF-8 token upper bound and ceilings cost in minor units', async () => {
  assert.equal(textInputTokenUpperBound('  hello  ', ' sys '), 128 + 5 + 3);
  assert.equal(textInputTokenUpperBound('猫'), 131);
  assert.equal(textInputTokenUpperBound(/** @type {any} */ (null)), null);

  const verified = await verifyRemoteAiRateCard(card(), intent, resolveKey, now);
  assert.ok(verified);
  const oneMinorUnit = estimateRemoteAiCostCeiling(verified, 100, 100, 1, now);
  assert.equal(oneMinorUnit?.maximumChargeMinor, 1);
  assert.equal(estimateRemoteAiCostCeiling(verified, 100, 100, 0, now), null);
  assert.equal(estimateRemoteAiCostCeiling(verified, 100, 8_001, 1, now), null);
  assert.equal(estimateRemoteAiCostCeiling(verified, 100, 100, 1, now + 60_000), null);
});
