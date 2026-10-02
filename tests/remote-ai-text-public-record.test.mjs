import assert from 'node:assert/strict';
import test from 'node:test';
import { remoteAiTextPublicRecord } from '../lib/remote-ai-text-http.ts';

void test('public cloud LLM records expose verified unit prices without trust keys or owner identifiers', () => {
  const record = {
    id: 'quote-1',
    ownerUserId: 'owner-private',
    state: 'quoted',
    quote: { ceiling: { modelId: 'fixture-model', currency: 'USD', maximumChargeMinor: 42 } },
    verifiedRate: {
      digest: 'rate-digest-private',
      card: {
        schema: 'rockstar-remote-ai-rate-card/2', providerId: 'openai', keyId: 'trust-key-private',
        cardId: 'card-1', modelId: 'fixture-model', pricingVersion: 'test-rates-1', currency: 'USD',
        inputMinorMicrosPerMillionTokens: 100, outputMinorMicrosPerMillionTokens: 200,
        cachedInputMinorMicrosPerMillionTokens: 50, cacheWriteMinorMicrosPerMillionTokens: 300,
        effectiveAt: 10, expiresAt: 20, sourceUrl: 'https://provider.example/pricing',
        signature: 'signature-private', executionScope: 'text-only', serviceTier: 'default',
      },
    },
  };

  const view = remoteAiTextPublicRecord(record);
  assert.equal(view.rateCard.modelId, 'fixture-model');
  assert.equal(view.rateCard.inputMinorMicrosPerMillionTokens, 100);
  assert.equal(view.rateCard.cachedInputMinorMicrosPerMillionTokens, 50);
  assert.equal(view.rateCard.unit, 'millionths_of_currency_minor_unit_per_million_tokens');
  assert.equal(view.rateCard.signature, undefined);
  assert.equal(view.rateCard.keyId, undefined);
  assert.equal(view.verifiedRate, undefined);
  assert.equal(view.ownerUserId, undefined);
  assert.equal(view.invoiceVerified, false);
  assert.equal(view.budgetIsFundedWalletBalance, false);
});
