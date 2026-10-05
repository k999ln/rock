import assert from 'node:assert/strict';
import test from 'node:test';
import { remoteAiPricingGateAccepted, remoteAiTextExecutionAvailable, remoteAiPricingUnavailable } from '../lib/remote-ai-pricing-gate.ts';

void test('paid cloud LLM dispatch stays unavailable until pricing acceptance, remote enablement, and provider key are all present', async () => {
  assert.equal(remoteAiPricingGateAccepted(), false);
  assert.equal(remoteAiTextExecutionAvailable({ SKY_REMOTE_LLM_ENABLED: 'true', OPENAI_API_KEY: 'configured' }), false);
  assert.equal(remoteAiTextExecutionAvailable({ SKY_REMOTE_LLM_ENABLED: 'false', OPENAI_API_KEY: 'configured' }), false);
  assert.equal(remoteAiTextExecutionAvailable({ SKY_REMOTE_LLM_ENABLED: 'true' }), false);
  const response = remoteAiPricingUnavailable();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'REMOTE_AI_PRICING_GATE_UNAVAILABLE');
});
