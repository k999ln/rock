import {
  parseAdapterDescriptor,
  negotiateTextAdapters,
  type AdapterDescriptor,
} from './rockstar-adapters.ts';
import { parseLinuxAgent } from './sky-linux-record.ts';

export class LinkedExecutionError extends Error {
  readonly status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.name = 'LinkedExecutionError';
    this.status = status;
  }
}
const object = (v: unknown): v is Record<string, unknown> =>
  Boolean(v && typeof v === 'object' && !Array.isArray(v));
export function linkedFields(value: unknown, names: string[]) {
  if (
    !object(value) ||
    Object.keys(value).length !== names.length ||
    names.some((k) => !Object.hasOwn(value, k))
  )
    throw new LinkedExecutionError('INVALID_RUNTIME_FIELDS');
  return value;
}
export function linkedId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    throw new LinkedExecutionError('INVALID_RUNTIME_ID');
  return value;
}
export function linkedHash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new LinkedExecutionError('INVALID_RUNTIME_HASH');
  return value;
}
export const linkedCanonical = (v: unknown): string =>
  Array.isArray(v)
    ? '[' + v.map(linkedCanonical).join(',') + ']'
    : object(v)
      ? '{' +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + linkedCanonical(v[k]))
          .join(',') +
        '}'
      : JSON.stringify(v);
export async function linkedDigest(value: unknown) {
  const data = new TextEncoder().encode(
    typeof value === 'string' ? value : linkedCanonical(value),
  );
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', data)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export type LinkedModel = {
  id: string;
  name: string;
  scheme: 'gguf-sha256' | 'ollama-manifest-sha256';
  sha256: string;
};
export type LinkedAgent = {
  id: string;
  name: string;
  instructions: string;
  modelId: string;
  sha256: string;
};
export type LinkedRequest = {
  id: string;
  threadId: string;
  input: string;
  agent: LinkedAgent;
  model: Omit<LinkedModel, 'name'>;
  deadline: number;
  maxOutputTokens: number;
};
export type LinkedPresence = {
  schema: 'rockstaros.runtime-presence/1';
  name: string;
  phase: 'ready' | 'stopped';
  host: AdapterDescriptor;
  executor: AdapterDescriptor;
  output: AdapterDescriptor;
  agents: LinkedAgent[];
  models: LinkedModel[];
  preparedModels: string[];
};
export type LinkedCommand = {
  displayInput: string;
  schema: 'rockstaros.runtime-command/1';
  owner: string;
  deviceId: string;
  request: LinkedRequest;
  requestSha256: string;
  executorId: string;
};
export type LinkedReport = {
  schema: 'rockstaros.runtime-report/1';
  id: string;
  requestSha256: string;
  claimId: string;
  state: 'review' | 'unknown';
  text: string | null;
  outputSha256: string | null;
  model: Omit<LinkedModel, 'name'>;
  durationMs: number | null;
  errorCode: string | null;
};

export async function parseLinkedPresence(
  raw: unknown,
  now: number,
): Promise<LinkedPresence> {
  const v = linkedFields(raw, [
    'schema',
    'name',
    'phase',
    'host',
    'executor',
    'output',
    'agents',
    'models',
    'preparedModels',
  ]);
  if (
    v.schema !== 'rockstaros.runtime-presence/1' ||
    typeof v.name !== 'string' ||
    !v.name.trim() ||
    v.name.length > 80 ||
    !['ready', 'stopped'].includes(String(v.phase)) ||
    !Array.isArray(v.agents) ||
    v.agents.length > 32 ||
    !Array.isArray(v.models) ||
    v.models.length > 8 ||
    !Array.isArray(v.preparedModels) ||
    v.preparedModels.length > 8 ||
    JSON.stringify(v).length > 64000
  )
    throw new LinkedExecutionError('INVALID_RUNTIME_PRESENCE');
  const descriptors = [v.host, v.executor, v.output].map((d) =>
    parseAdapterDescriptor(d, now),
  );
  negotiateTextAdapters(
    ...(descriptors as [
      AdapterDescriptor,
      AdapterDescriptor,
      AdapterDescriptor,
    ]),
    now,
  );
  const models = v.models.map((rawModel) => {
    const m = linkedFields(rawModel, ['id', 'name', 'scheme', 'sha256']);
    if (
      typeof m.id !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(m.id) ||
      typeof m.name !== 'string' ||
      !m.name.trim() ||
      m.name.length > 180 ||
      !['gguf-sha256', 'ollama-manifest-sha256'].includes(String(m.scheme))
    )
      throw new LinkedExecutionError('INVALID_RUNTIME_MODEL');
    return {
      id: m.id,
      name: m.name,
      scheme: m.scheme as LinkedModel['scheme'],
      sha256: linkedHash(m.sha256),
    };
  });
  if (
    new Set(models.map((m) => m.id)).size !== models.length ||
    new Set(v.preparedModels).size !== v.preparedModels.length ||
    v.preparedModels.some(
      (id) => typeof id !== 'string' || !models.some((m) => m.id === id),
    )
  )
    throw new LinkedExecutionError('INVALID_PREPARED_MODELS');
  const agents = await Promise.all(
    v.agents.map(async (rawAgent) => {
      const a = linkedFields(rawAgent, [
        'id',
        'name',
        'instructions',
        'modelId',
        'sha256',
      ]);
      let agent;
      try {
        agent = parseLinuxAgent({
          name: a.name,
          instructions: a.instructions,
          modelId: a.modelId,
        });
      } catch {
        throw new LinkedExecutionError('INVALID_RUNTIME_AGENT');
      }
      const sha256 = linkedHash(a.sha256);
      if (
        (await linkedDigest(JSON.stringify(agent))) !== sha256 ||
        !models.some((m) => m.id === agent.modelId)
      )
        throw new LinkedExecutionError('RUNTIME_AGENT_PIN_MISMATCH');
      return { id: linkedId(a.id), ...agent, sha256 };
    }),
  );
  if (new Set(agents.map((a) => a.id)).size !== agents.length)
    throw new LinkedExecutionError('DUPLICATE_RUNTIME_AGENT');
  return {
    schema: 'rockstaros.runtime-presence/1',
    name: v.name.trim(),
    phase: v.phase as LinkedPresence['phase'],
    host: descriptors[0],
    executor: descriptors[1],
    output: descriptors[2],
    models,
    agents,
    preparedModels: v.preparedModels as string[],
  };
}

export async function parseLinkedReport(
  raw: unknown,
  command: LinkedCommand,
): Promise<LinkedReport> {
  const v = linkedFields(raw, [
    'schema',
    'id',
    'requestSha256',
    'claimId',
    'state',
    'text',
    'outputSha256',
    'model',
    'durationMs',
    'errorCode',
  ]);
  if (
    v.schema !== 'rockstaros.runtime-report/1' ||
    linkedId(v.id) !== command.request.id ||
    linkedHash(v.requestSha256) !== command.requestSha256 ||
    linkedCanonical(v.model) !== linkedCanonical(command.request.model)
  )
    throw new LinkedExecutionError('RUNTIME_REPORT_BINDING_MISMATCH');
  linkedId(v.claimId);
  if (v.state === 'review') {
    if (
      typeof v.text !== 'string' ||
      !v.text.trim() ||
      v.text.length > 32000 ||
      v.errorCode !== null ||
      !Number.isSafeInteger(v.durationMs) ||
      Number(v.durationMs) < 0 ||
      Number(v.durationMs) > 120000 ||
      linkedHash(v.outputSha256) !== (await linkedDigest(v.text))
    )
      throw new LinkedExecutionError('INVALID_RUNTIME_OUTPUT');
  } else if (
    v.state !== 'unknown' ||
    v.text !== null ||
    v.outputSha256 !== null ||
    v.durationMs !== null ||
    typeof v.errorCode !== 'string' ||
    !/^[A-Z][A-Z0-9_]{0,99}$/.test(v.errorCode)
  )
    throw new LinkedExecutionError('INVALID_RUNTIME_OUTCOME');
  return structuredClone(v) as LinkedReport;
}
