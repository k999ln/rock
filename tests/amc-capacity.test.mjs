import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateScenario,
  calculateTaskStorageCapacity,
  calculateLocalLlmFit,
  DEFAULT_PAYLOAD_CAP_BYTES,
  GIB,
} from '../scripts/amc-capacity.mjs';

const scenario = {
  ramGiB: 16,
  osAndAppsGiB: 8,
  safetyGiB: 2,
  perAgentGiB: 1.5,
  cpuSlots: 3,
  storageFreeGiB: 30,
  storageReserveGiB: 10,
  perAgentDiskGiB: 2,
  configuredSlots: 4,
  providerSlots: null,
};

await test('capacity keeps local assumptions separate from unknown provider capacity', () => {
  const result = calculateScenario(scenario);
  assert.deepEqual(result.limits, {
    ramSlots: 4,
    cpuSlots: 3,
    diskSlots: 10,
    configuredSlots: 4,
    providerSlots: null,
  });
  assert.equal(result.localCalculatedSlots, 3);
  assert.equal(result.calculatedSlots, null);
  assert.deepEqual(result.unknownInputs, ['providerSlots']);
  assert.equal(result.confidence, 'assumptions_not_benchmarks');
  assert.deepEqual(result.limitingResources, ['cpuSlots']);
});

await test('known provider capacity can be the limiting factor', () => {
  const result = calculateScenario({ ...scenario, providerSlots: 2 });
  assert.equal(result.calculatedSlots, 2);
  assert.deepEqual(result.limitingResources, ['providerSlots']);
});

await test('low disk yields a safe zero even with unknown RAM/provider workload costs', () => {
  const result = calculateScenario({
    storageFreeGiB: 139848 / 1024 / 1024,
    storageReserveGiB: 10,
  });
  assert.equal(result.storageReserveViolated, true);
  assert.equal(result.storageAvailableGiB, 0);
  assert.equal(result.limits.diskSlots, 0);
  assert.equal(result.localCalculatedSlots, 0);
  assert.equal(result.calculatedSlots, 0);
});

await test('unknown or zero capacity is never replaced with an optimistic default', () => {
  assert.equal(calculateScenario().calculatedSlots, null);
  assert.equal(calculateScenario().localCalculatedSlots, null);
  assert.equal(
    calculateScenario({ ...scenario, cpuSlots: null }).localCalculatedSlots,
    null,
  );
  assert.equal(
    calculateScenario({ ...scenario, cpuSlots: 0 }).calculatedSlots,
    0,
  );
  assert.equal(
    calculateScenario({ ...scenario, osAndAppsGiB: 18 }).calculatedSlots,
    0,
  );
});

await test('scenario rejects invalid units/counts instead of silently coercing them', () => {
  for (const bad of [
    { perAgentGiB: 0 },
    { ramGiB: -1 },
    { configuredSlots: 1.5 },
    { cpuSlots: Infinity },
    { storageFreeGiB: '20' },
    { safetyGiB: NaN },
  ]) {
    assert.throws(() => calculateScenario({ ...scenario, ...bad }));
  }
});

await test('record storage extrapolation subtracts fixed bytes before rounding down', () => {
  const result = calculateTaskStorageCapacity({
    measuredRecordBytes: 600,
    fixedBytes: 40_000,
  });
  assert.equal(result.payloadCapBytes, DEFAULT_PAYLOAD_CAP_BYTES);
  assert.equal(result.recordCapacity, 1600);
  assert.equal(result.scope, 'serialized_payload_only');
  assert.equal(result.confidence, 'assumptions_not_benchmarks');
});

await test('record memory budget applies only with explicit amplification assumption', () => {
  const input = {
    measuredRecordBytes: 600,
    fixedBytes: 40_000,
    memoryBudgetBytes: 2_000_000,
  };
  assert.equal(calculateTaskStorageCapacity(input).recordCapacity, null);
  const result = calculateTaskStorageCapacity({
    ...input,
    inMemoryExpansionFactor: 4,
  });
  assert.equal(result.budgetBytes, 500_000);
  assert.equal(result.recordCapacity, 766);
  assert.equal(result.payloadRecordCapacity, 1600);
});

await test('record budget exhaustion is zero and missing/invalid measurements stay explicit', () => {
  assert.equal(calculateTaskStorageCapacity().recordCapacity, null);
  assert.equal(
    calculateTaskStorageCapacity({
      measuredRecordBytes: 600,
      fixedBytes: 1_100_000,
    }).recordCapacity,
    0,
  );
  assert.throws(() =>
    calculateTaskStorageCapacity({ measuredRecordBytes: 0, fixedBytes: 0 }),
  );
  assert.throws(() =>
    calculateTaskStorageCapacity({
      measuredRecordBytes: 1e-300,
      fixedBytes: 0,
    }),
  );
});

await test('LLM weight-only estimate cannot claim fit when mandatory overheads are unknown', () => {
  const result = calculateLocalLlmFit({
    parameterCount: 8_000_000_000,
    bitsPerParameter: 4,
    ramGiB: 16,
    osAndAppsGiB: 8,
    safetyGiB: 2,
  });
  assert.equal(result.weightOnlyGiB, 4_000_000_000 / GIB);
  assert.equal(result.estimatedTotalGiB, null);
  assert.equal(result.estimatedFitsInBudget, null);
  assert.ok(result.unknownInputs.includes('kvCacheGiB'));
  assert.ok(result.unknownInputs.includes('contextWorkspaceGiB'));
});

await test('LLM fit is only an explicit complete one-instance memory scenario', () => {
  const input = {
    parameterCount: 8 * GIB,
    bitsPerParameter: 4,
    ramGiB: 16,
    osAndAppsGiB: 8,
    safetyGiB: 2,
    weightOverheadGiB: 0.25,
    kvCacheGiB: 1,
    runtimeGiB: 0.25,
    contextWorkspaceGiB: 0.5,
  };
  const result = calculateLocalLlmFit(input);
  assert.equal(result.weightOnlyGiB, 4);
  assert.equal(result.estimatedTotalGiB, 6);
  assert.equal(result.estimatedFitsInBudget, true);
  assert.equal(
    calculateLocalLlmFit({ ...input, kvCacheGiB: 2 }).estimatedFitsInBudget,
    false,
  );
  assert.equal(
    calculateLocalLlmFit({ ...input, weightOverheadGiB: null })
      .estimatedFitsInBudget,
    null,
  );
  assert.equal(result.confidence, 'assumptions_not_benchmarks');
});

await test('capacity functions do not modify the caller input', () => {
  const frozen = Object.freeze({ ...scenario });
  calculateScenario(frozen);
  assert.deepEqual(frozen, scenario);
});
