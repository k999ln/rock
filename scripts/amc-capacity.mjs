// Pure planning arithmetic. These functions do not benchmark, allocate resources,
// start agents, inspect accounts, or infer a desktop-wide concurrency limit.
export const GIB = 2 ** 30;
export const DEFAULT_PAYLOAD_CAP_BYTES = 1_000_000;
const CONFIDENCE = 'assumptions_not_benchmarks';

function quantity(value, name, { positive = false, integer = false } = {}) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number or null`);
  }
  if (value < 0 || (positive && value === 0)) {
    throw new RangeError(
      `${name} must be ${positive ? 'positive' : 'nonnegative'}`,
    );
  }
  if (integer && !Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer`);
  }
  return value;
}

function known(...values) {
  return values.every((value) => value !== null);
}

function count(available, perItem) {
  if (!known(available, perItem)) return null;
  const result = Math.floor(Math.max(0, available) / perItem);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('Calculated count exceeds safe integer precision');
  }
  return result;
}

function minimumWhenKnown(values) {
  // A known zero is a hard upper bound even if another constraint is unknown.
  if (values.includes(0)) return 0;
  return known(...values) ? Math.min(...values) : null;
}

/**
 * All sizes are GiB (2^30 bytes), not decimal GB. cpuSlots is a caller-supplied
 * workload assumption, NOT a physical-core count. configuredSlots is a scoped
 * session setting supplied by the caller, NOT a desktop-wide cap. Include the
 * coordinator in osAndAppsGiB or in the agent count, never silently exclude it.
 * providerSlots=null means unverified provider/account concurrency.
 */
export function calculateScenario(input = {}) {
  const values = {};
  for (const key of [
    'ramGiB',
    'osAndAppsGiB',
    'safetyGiB',
    'perAgentGiB',
    'storageFreeGiB',
    'storageReserveGiB',
    'perAgentDiskGiB',
  ]) {
    values[key] = quantity(input[key], key, {
      positive: ['ramGiB', 'perAgentGiB', 'perAgentDiskGiB'].includes(key),
    });
  }
  for (const key of ['cpuSlots', 'configuredSlots', 'providerSlots']) {
    values[key] = quantity(input[key], key, { integer: true });
  }
  const memoryAvailableGiB = known(
    values.ramGiB,
    values.osAndAppsGiB,
    values.safetyGiB,
  )
    ? Math.max(0, values.ramGiB - values.osAndAppsGiB - values.safetyGiB)
    : null;
  const storageAvailableGiB = known(
    values.storageFreeGiB,
    values.storageReserveGiB,
  )
    ? Math.max(0, values.storageFreeGiB - values.storageReserveGiB)
    : null;
  const storageReserveViolated = known(
    values.storageFreeGiB,
    values.storageReserveGiB,
  )
    ? values.storageFreeGiB < values.storageReserveGiB
    : null;
  const limits = {
    ramSlots: count(memoryAvailableGiB, values.perAgentGiB),
    cpuSlots: values.cpuSlots,
    diskSlots:
      storageReserveViolated === true
        ? 0
        : count(storageAvailableGiB, values.perAgentDiskGiB),
    configuredSlots: values.configuredSlots,
    providerSlots: values.providerSlots,
  };
  const localCalculatedSlots = minimumWhenKnown([
    limits.ramSlots,
    limits.cpuSlots,
    limits.diskSlots,
    limits.configuredSlots,
  ]);
  const calculatedSlots = minimumWhenKnown(Object.values(limits));
  const bindingCount = calculatedSlots ?? localCalculatedSlots;
  return {
    confidence: CONFIDENCE,
    inputs: values,
    limits,
    memoryAvailableGiB,
    storageAvailableGiB,
    storageReserveViolated,
    localCalculatedSlots,
    calculatedSlots,
    limitingResources:
      bindingCount === null
        ? []
        : Object.entries(limits)
            .filter(([, limit]) => limit === bindingCount)
            .map(([name]) => name),
    unknownInputs: Object.keys(values).filter((key) => values[key] === null),
    interpretation:
      'Scenario upper bound, not certified throughput. Provider/account limits, thermal behavior, workload peaks and shared usage still require measurement.',
  };
}

/**
 * Capacity of a serialized record payload, NOT the browser's supported task
 * count. measuredRecordBytes may be a measured mean or a conservative maximum;
 * include per-record separators/wrappers in that measurement. fixedBytes is the
 * non-record part of the same representation. The default 1 MB cap is a manual
 * planning budget, not a measured browser/device limit. RAM/DOM amplification
 * requires an explicit measured or assumed inMemoryExpansionFactor.
 */
export function calculateTaskStorageCapacity(input = {}) {
  const measuredRecordBytes = quantity(
    input.measuredRecordBytes,
    'measuredRecordBytes',
    { positive: true },
  );
  const fixedBytes = quantity(input.fixedBytes, 'fixedBytes');
  const payloadCapBytes = quantity(
    input.payloadCapBytes === undefined
      ? DEFAULT_PAYLOAD_CAP_BYTES
      : input.payloadCapBytes,
    'payloadCapBytes',
    { positive: true },
  );
  const memoryBudgetBytes = quantity(
    input.memoryBudgetBytes,
    'memoryBudgetBytes',
  );
  const inMemoryExpansionFactor = quantity(
    input.inMemoryExpansionFactor,
    'inMemoryExpansionFactor',
    { positive: true },
  );
  const payloadRecordCapacity = known(payloadCapBytes, fixedBytes)
    ? count(payloadCapBytes - fixedBytes, measuredRecordBytes)
    : null;
  const memoryEquivalentPayloadBytes = known(
    memoryBudgetBytes,
    inMemoryExpansionFactor,
  )
    ? memoryBudgetBytes / inMemoryExpansionFactor
    : null;
  const memoryRequested = memoryBudgetBytes !== null;
  const budgetBytes = memoryRequested
    ? known(payloadCapBytes, memoryEquivalentPayloadBytes)
      ? Math.min(payloadCapBytes, memoryEquivalentPayloadBytes)
      : null
    : payloadCapBytes;
  return {
    confidence: CONFIDENCE,
    measuredRecordBytes,
    fixedBytes,
    payloadCapBytes,
    memoryBudgetBytes,
    inMemoryExpansionFactor,
    payloadRecordCapacity,
    budgetBytes,
    recordCapacity: known(budgetBytes, fixedBytes)
      ? count(budgetBytes - fixedBytes, measuredRecordBytes)
      : null,
    scope: memoryRequested
      ? 'serialized_payload_and_explicit_memory_assumption'
      : 'serialized_payload_only',
    interpretation:
      'Byte-fit extrapolation only. Parsing, rendering, interaction latency and actual browser memory limits are not benchmarked.',
  };
}

/**
 * Ideal packed parameter weights: parameters * bits / 8. This lower bound omits
 * quantization metadata/alignment (weightOverheadGiB), KV cache, runtime and
 * context workspace. Every extra must be explicitly supplied (zero is allowed)
 * before reporting an estimated total or fit. No model is chosen or certified.
 */
export function calculateLocalLlmFit(input = {}) {
  const values = {};
  for (const key of [
    'parameterCount',
    'bitsPerParameter',
    'ramGiB',
    'osAndAppsGiB',
    'safetyGiB',
    'weightOverheadGiB',
    'kvCacheGiB',
    'runtimeGiB',
    'contextWorkspaceGiB',
  ]) {
    values[key] = quantity(input[key], key, {
      positive: ['parameterCount', 'bitsPerParameter', 'ramGiB'].includes(key),
    });
  }
  const weightOnlyGiB = known(values.parameterCount, values.bitsPerParameter)
    ? (values.parameterCount * values.bitsPerParameter) / 8 / GIB
    : null;
  if (weightOnlyGiB !== null && !Number.isFinite(weightOnlyGiB)) {
    throw new RangeError('Weight calculation exceeds finite precision');
  }
  const extras = [
    values.weightOverheadGiB,
    values.kvCacheGiB,
    values.runtimeGiB,
    values.contextWorkspaceGiB,
  ];
  const estimatedTotalGiB = known(weightOnlyGiB, ...extras)
    ? weightOnlyGiB + extras.reduce((sum, value) => sum + value, 0)
    : null;
  const memoryAvailableGiB = known(
    values.ramGiB,
    values.osAndAppsGiB,
    values.safetyGiB,
  )
    ? Math.max(0, values.ramGiB - values.osAndAppsGiB - values.safetyGiB)
    : null;
  return {
    confidence: CONFIDENCE,
    inputs: values,
    weightOnlyGiB,
    estimatedTotalGiB,
    memoryAvailableGiB,
    estimatedFitsInBudget: known(estimatedTotalGiB, memoryAvailableGiB)
      ? estimatedTotalGiB <= memoryAvailableGiB
      : null,
    unknownInputs: Object.keys(values).filter((key) => values[key] === null),
    interpretation:
      'One-instance unified-memory estimate only. Weight size is a lower bound, not model readiness, speed, context support or a concurrent-agent count.',
  };
}
