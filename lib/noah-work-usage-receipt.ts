import { NOAH_CLOUD_LIMITS, noahCloudDigest, noahCloudListYen, noahCloudUsageOf } from './noah-cloud-contract.ts';
import type { NoahRemoteExecution } from './noah-remote-work.ts';

export type NoahWorkUsageReceipt = {
  source: 'managed-cloud' | 'provider' | 'form' | 'local';
  agentVersion: string | null;
  pricingBasis: 'included' | 'noah-relay' | null;
  externalCharge: 'unreported' | 'not-applicable';
  metrics: {
    modelCalls: number | null;
    providerTurns?: number | null;
    toolCalls: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    neurons: number | null;
  };
  /** Display-only paid-plan equivalent of a free Worker measurement, never a charge. */
  estimateYen: number | null;
};

const count = (value: unknown, maximum = Number.MAX_SAFE_INTEGER) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : null;

function receipt(source: NoahWorkUsageReceipt['source']): NoahWorkUsageReceipt {
  return {
    source, agentVersion: null, pricingBasis: null,
    externalCharge: source === 'managed-cloud' ? 'not-applicable' : 'unreported',
    metrics: { modelCalls: null, toolCalls: null, inputTokens: null, outputTokens: null, neurons: null },
    estimateYen: null,
  };
}

export function noahRemoteUsageReceipt(
  source: 'managed-cloud' | 'provider' | 'form',
  remote?: NoahRemoteExecution,
  formToolCalls?: number,
): NoahWorkUsageReceipt {
  const row = receipt(source);
  if (source === 'form') row.metrics.toolCalls = count(formToolCalls);
  if (!remote || remote.verification !== 'relay_observed_unverified') return row;
  if (source === 'managed-cloud' && remote.cloud) {
    const cloud = remote.cloud;
    const usage = noahCloudUsageOf(cloud.usage);
    row.agentVersion = cloud.version || null;
    // Only the free Worker emits neuron usage. Older Work without a recorded tariff
    // can also come from a Container. Its relay placeholder is not a cloud receipt.
    if (remote.chargeMinor === 0 && (usage || cloud.freeTier === true)) row.pricingBasis = 'included';
    // A finished successful result has a validated call count. On old failed
    // jobs modelCalls was initialized to zero even when the model actually ran.
    row.metrics.modelCalls = count(cloud.reportedModelCalls, NOAH_CLOUD_LIMITS.modelCalls)
      ?? (remote.state === 'returned' ? count(remote.modelCalls, NOAH_CLOUD_LIMITS.modelCalls) : null);
    if (usage) {
      Object.assign(row.metrics, usage);
      row.estimateYen = noahCloudListYen(usage);
    }
  } else if (source !== 'managed-cloud') {
    row.pricingBasis = remote.chargeMinor === 0 ? 'noah-relay' : null;
    row.agentVersion = /^[a-f0-9]{64}$/.test(remote.digest) ? remote.digest : null;
    // An uncertain/cancelled provider result may have reached a billable API.
    // Zero initialized local counters do not measure work done at that provider.
    if (source === 'provider' && (remote.state === 'returned' || remote.toolCalls > 0)) {
      row.metrics.toolCalls = count(remote.toolCalls);
    }
  }
  return row;
}

export function noahLocalUsageReceipt(execution: Record<string, unknown>): NoahWorkUsageReceipt {
  const row = receipt('local');
  row.agentVersion = typeof execution.version === 'string' ? execution.version : null;
  if (execution.verification === 'host_observed_unverified') {
    row.pricingBasis = execution.chargeMinor === 0 ? 'noah-relay' : null;
    if (execution.state === 'returned') {
      const accountTurn = execution.model === 'codex-account';
      if (!accountTurn) row.metrics.modelCalls = count(execution.calls);
      else if (execution.provider && typeof execution.provider === 'object'
        && 'metric' in execution.provider && execution.provider.metric === 'provider_turns') {
        row.metrics.providerTurns = count(execution.calls, 1);
      }
    }
  }
  return row;
}


/** The free Worker reserves this filename and appends its own manifest after
 * Tool execution. A similarly named user file cannot establish the tariff.
 * The snapshot never needs to be sent to a provider or executed to count it. */
export async function noahCloudRecordedToolCalls(remote: NoahRemoteExecution): Promise<number | null> {
  const cloud = remote.cloud;
  if (!cloud || remote.verification !== 'relay_observed_unverified' || remote.state !== 'returned'
    || !(cloud.freeTier === true || noahCloudUsageOf(cloud.usage))) return null;
  const file = cloud.files?.find(item => item.name === 'noah-execution.json');
  if (!file || !Number.isInteger(file.bytes) || file.bytes <= 0 || file.bytes > NOAH_CLOUD_LIMITS.fileBytes
    || typeof file.base64 !== 'string' || file.base64.length !== Math.ceil(file.bytes / 3) * 4) return null;
  const digest = /^[a-f0-9]{64}$/;
  try {
    const bytes = Uint8Array.from(atob(file.base64), ch => ch.charCodeAt(0));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (bytes.length !== file.bytes || await noahCloudDigest(text) !== file.sha256) return null;
    const record = JSON.parse(text);
    const runtime = ['time', 'boss', 'hermes'].includes(cloud.profile) ? 'official-python-workers' : 'official-mcp-workers';
    if (!record || record.profile !== cloud.profile || record.version !== cloud.version
      || !digest.test(remote.digest) || record.distribution !== remote.digest || record.runtime !== runtime) return null;
    const operations: unknown = record.operations;
    if (!Array.isArray(operations) || operations.length < 1 || operations.length > 12
      || !operations.every(op => op && typeof op.name === 'string' && op.name.length > 0 && op.name.length <= 128
        && typeof op.ok === 'boolean' && typeof op.inputSha256 === 'string' && digest.test(op.inputSha256)
        && typeof op.resultSha256 === 'string' && digest.test(op.resultSha256)) || !operations.some(op => op.ok)) return null;
    return operations.length;
  } catch {
    return null;
  }
}
