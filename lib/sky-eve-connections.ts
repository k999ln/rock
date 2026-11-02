import type { EveDevicePresence } from './eve-device-sync.ts';
import type {
  LinkedPresence,
  LinkedModel,
} from './rockstar-linked-execution.ts';
import { negotiateTextAdapters } from './rockstar-adapters.ts';

export type EveRuntimePresence = LinkedPresence & {
  deviceId: string;
  updatedAt: number;
};
export type EveExecutionPresence = EveDevicePresence | EveRuntimePresence;
export function isEveRuntimePresence(
  device: EveExecutionPresence,
): device is EveRuntimePresence {
  return (
    'schema' in device && device.schema === 'rockstaros.runtime-presence/1'
  );
}

/** A reference to an existing owner-bound device agent, never a grant or a copy. */
export type SkyEveDeviceSelection = {
  deviceId: string;
  agentId: string;
  agentSha256: string;
  modelSha256: string;
};
export type SkyEveRuntimeSelection = SkyEveDeviceSelection & {
  modelScheme: LinkedModel['scheme'];
};
export type SkyEveSelection =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | ({ kind: 'device' } & SkyEveDeviceSelection)
  | ({ kind: 'runtime' } & SkyEveRuntimeSelection);

/** UI identity includes the execution contract; the server keeps the original device ID. */
export function skyEveTargetKey(device: EveExecutionPresence): string {
  return `${isEveRuntimePresence(device) ? 'runtime' : 'device'}:${device.deviceId}`;
}
export function skyEveSelectionTargetKey(selection: SkyEveSelection): string {
  return selection.kind === 'device' || selection.kind === 'runtime'
    ? `${selection.kind}:${selection.deviceId}`
    : '';
}
/** One physical target, preferring the common contract unless an exact old URL was selected. */
export function skyEveExecutionTargets(
  devices: EveExecutionPresence[],
  selectedKey = '',
): EveExecutionPresence[] {
  const targets = new Map<string, EveExecutionPresence>();
  for (const device of devices) {
    const previous = targets.get(device.deviceId);
    if (!previous || skyEveTargetKey(device) === selectedKey ||
      (skyEveTargetKey(previous) !== selectedKey && !isEveRuntimePresence(previous) && isEveRuntimePresence(device)))
      targets.set(device.deviceId, device);
  }
  return [...targets.values()];
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hash = /^[a-f0-9]{64}$/;

export function readSkyEveSelection(params: {
  device?: string;
  deviceAgent?: string;
  agentHash?: string;
  modelHash?: string;
  runtime?: string;
  modelScheme?: string;
}): SkyEveSelection {
  const values = [
    params.device,
    params.deviceAgent,
    params.agentHash,
    params.modelHash,
    params.runtime,
    params.modelScheme,
  ];
  if (values.every((value) => value === undefined)) return { kind: 'none' };
  if (
    typeof params.device !== 'string' ||
    !uuid.test(params.device) ||
    typeof params.deviceAgent !== 'string' ||
    !uuid.test(params.deviceAgent) ||
    typeof params.agentHash !== 'string' ||
    !hash.test(params.agentHash) ||
    typeof params.modelHash !== 'string' ||
    !hash.test(params.modelHash)
  )
    return { kind: 'invalid' };
  const reference = {
    deviceId: params.device,
    agentId: params.deviceAgent,
    agentSha256: params.agentHash,
    modelSha256: params.modelHash,
  };
  if (params.runtime !== undefined || params.modelScheme !== undefined) {
    if (
      params.runtime !== '1' ||
      !['gguf-sha256', 'ollama-manifest-sha256'].includes(
        params.modelScheme ?? '',
      )
    )
      return { kind: 'invalid' };
    return {
      kind: 'runtime',
      ...reference,
      modelScheme: params.modelScheme as LinkedModel['scheme'],
    };
  }
  return { kind: 'device', ...reference };
}

export function skyEveDevicePath(
  selection: SkyEveDeviceSelection | SkyEveRuntimeSelection,
  threadId = '',
): string {
  const params = new URLSearchParams({
    device: selection.deviceId,
    deviceAgent: selection.agentId,
    agentHash: selection.agentSha256,
    modelHash: selection.modelSha256,
  });
  if ('modelScheme' in selection) {
    params.set('runtime', '1');
    params.set('modelScheme', selection.modelScheme);
  }
  if (threadId) params.set('thread', threadId);
  return `/os/eve?${params}`;
}

export function skyEveDeviceState(
  device: EveExecutionPresence,
  agentId: string,
  now: number,
) {
  const agent = device.agents.find((a) => a.id === agentId);
  const model = device.models.find((m) => m.id === agent?.modelId);
  if (!agent || !model)
    return {
      available: false,
      label: '担当とAIの組み合わせを確認してください',
    };
  if (
    !Number.isFinite(device.updatedAt) ||
    device.updatedAt > now + 5000 ||
    now - device.updatedAt >= 30000
  )
    return { available: false, label: '端末との接続を確認してください' };
  if (device.phase === 'stopped')
    return { available: false, label: isEveRuntimePresence(device) ? '実行先の受付は停止中です' : '端末のAIは停止中です' };
  if (device.phase === 'preparing')
    return { available: false, label: '端末でAIを準備しています' };
  if (device.phase !== 'ready' || !device.preparedModels.includes(model.id))
    return { available: false, label: '端末でこの担当のAIを準備してください' };
  if (isEveRuntimePresence(device)) {
    try {
      negotiateTextAdapters(device.host, device.executor, device.output, now);
    } catch {
      return {
        available: false,
        label: '実行先の能力・版・接続を確認してください',
      };
    }
  }
  return {
    available: true,
    label: '接続中・AIの準備済み。Eveで依頼を確認できます',
  };
}

export function skyEveSelectionMatches(
  selection: SkyEveSelection,
  device?: EveExecutionPresence,
  agentId = '',
): boolean {
  if (selection.kind === 'none') return true;
  if (
    selection.kind === 'invalid' ||
    !device ||
    device.deviceId !== selection.deviceId ||
    agentId !== selection.agentId
  )
    return false;
  if ((selection.kind === 'runtime') !== isEveRuntimePresence(device))
    return false;
  const agent = device.agents.find((a) => a.id === agentId);
  const model = device.models.find((m) => m.id === agent?.modelId);
  return (
    agent?.sha256 === selection.agentSha256 &&
    model?.sha256 === selection.modelSha256 &&
    (selection.kind !== 'runtime' ||
      Boolean(
        model && 'scheme' in model && model.scheme === selection.modelScheme,
      ))
  );
}

/** A display consent expires when any owner, target or content version changes. */
export function skyEveConsentKey(
  owner: string,
  device?: EveExecutionPresence,
  agentId = '',
): string {
  const agent = device?.agents.find((a) => a.id === agentId);
  const model = device?.models.find((m) => m.id === agent?.modelId);
  if (!owner || !device || !agent || !model) return '';
  const binding: unknown[] = [
    owner,
    device.deviceId,
    agent.id,
    agent.sha256,
    model.sha256,
  ];
  if (isEveRuntimePresence(device))
    binding.push(
      'runtime/1',
      'scheme' in model ? model.scheme : null,
      ...[device.host, device.executor, device.output].map((d) => [
        d.id,
        d.role,
        d.version,
        d.platform,
        d.protocols,
        Object.entries(d.capabilities).sort(([a], [b]) => a.localeCompare(b)),
      ]),
    );
  return JSON.stringify(binding);
}
