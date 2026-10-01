import assert from 'node:assert/strict';
import test from 'node:test';
import {
  prepareRockFeeCollection,
  ROCK_SETTLEMENT_PROVIDER,
  validateFinancialProviderManifest,
} from '../lib/financial-provider.ts';

void test('Rock Settlement Wallet is the first provider without user custody', () => {
  const manifest = validateFinancialProviderManifest(ROCK_SETTLEMENT_PROVIDER);
  assert.equal(manifest.providerId, 'org.rockstar.settlement-wallet');
  assert.deepEqual(manifest.capabilities, [
    'collect_platform_fee',
    'reporting',
  ]);
  assert.equal(manifest.ownership, 'rock_first_party');
  assert.equal(manifest.userFundsCustodied, false);
  assert.equal(manifest.fundManagementEnabled, false);
  assert.equal(manifest.liveEnabled, false);
});

void test('Rock provider cannot silently add custody, funds or LIVE mode', () => {
  for (const patch of [
    { userFundsCustodied: true },
    { fundManagementEnabled: true },
    { capabilities: ['collect_platform_fee', 'custody'] },
    { mode: 'LIVE', liveEnabled: true, status: 'live_eligible' },
  ])
    assert.throws(
      () =>
        validateFinancialProviderManifest({
          ...ROCK_SETTLEMENT_PROVIDER,
          ...patch,
        }),
      /ROCK_SETTLEMENT_SCOPE|LIVE_DISABLED/,
    );
});

void test('verified Sky fee allocation prepares one idempotent sandbox collection', () => {
  const instruction = prepareRockFeeCollection({
    receiptId: 'earn:001',
    userId: 'owner:001',
    period: '2026-09',
    currency: 'usd',
    allocatedSkyFeeMinor: 488,
    previouslyCollectedMinor: 400,
    mode: 'SANDBOX',
  });
  assert.equal(instruction.providerId, 'org.rockstar.settlement-wallet');
  assert.equal(instruction.amountMinor, 488);
  assert.equal(instruction.status, 'ready');
  assert.equal(instruction.instructionId, instruction.idempotencyKey);
});

void test('collection rejects cap bypass, LIVE mode and unknown fields', () => {
  const base = {
    receiptId: 'earn:001',
    userId: 'owner:001',
    period: '2026-09',
    currency: 'usd',
    allocatedSkyFeeMinor: 489,
    previouslyCollectedMinor: 400,
    mode: 'SANDBOX',
  };
  assert.throws(() => prepareRockFeeCollection(base), /CAP_EXCEEDED/);
  assert.throws(
    () =>
      prepareRockFeeCollection({
        ...base,
        allocatedSkyFeeMinor: 1,
        mode: 'LIVE',
      }),
    /LIVE_DISABLED/,
  );
  assert.throws(
    () =>
      prepareRockFeeCollection({
        ...base,
        allocatedSkyFeeMinor: 1,
        payoutAddress: 'secret',
      }),
    /UNSUPPORTED_FIELD/,
  );
});
