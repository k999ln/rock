import assert from 'node:assert/strict';
import test from 'node:test';
import { remoteAiTextPublicRecord, remoteAiTextQueueState } from '../lib/remote-ai-text-http.ts';

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
  assert.equal(view.spending.status, 'not_running');
  assert.equal(view.spending.currentChargeMinor, null);
  assert.equal(view.spending.currentEstimateMinor, null);
  assert.equal(view.spending.reservedMaximumMinor, 0);
  const running = remoteAiTextPublicRecord({ ...record, state: 'sending', settledMinor: null, price: null });
  assert.deepEqual(running.spending, {
    status: 'usage_not_yet_final', currency: 'USD', currentChargeMinor: null,
    currentEstimateMinor: null, estimateUpdatedAt: null, estimateBasis: null,
    reservedMaximumMinor: 42, providerMeter: 'not_reported', invoiceVerified: false,
  });
  const estimated = remoteAiTextPublicRecord({ ...record, state: 'sending', settledMinor: null, price: null,
    observation: { liveMeter: { estimatedChargeMinor: 12, observedAt: 99,
      basis: 'quoted_input_upper_bound_plus_output_utf8_bytes_divided_by_3' } } });
  assert.equal(estimated.spending.currentChargeMinor, null);
  assert.equal(estimated.spending.currentEstimateMinor, 12);
  assert.equal(estimated.spending.estimateUpdatedAt, 99);
  assert.equal(estimated.spending.providerMeter, 'stream_estimate');
});

void test('remote LLM queue states separate approval, durable acceptance and reconciliation', () => {
  assert.equal(remoteAiTextQueueState({ state: 'quoted' }, false), 'awaiting_approval');
  assert.equal(remoteAiTextQueueState({ state: 'reserved' }, false), 'approved_waiting_for_submission');
  assert.equal(remoteAiTextQueueState({ state: 'reserved' }, true), 'queued');
  assert.equal(remoteAiTextQueueState({ state: 'sending' }, true), 'running_or_reconciling');
  assert.equal(remoteAiTextQueueState({ state: 'unreconciled' }, false), 'usage_or_result_reconciliation_required');
});
