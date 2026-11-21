import type { WorkJob } from './workflow.ts';
export type NoahRemoteExecution = {
  connectionId: string;
  familyKey: string;
  digest: string;
  mode: 'form';
  prompt: string;
  inputSha256: string;
  toolsSha256: string;
  state: 'queued' | 'running' | 'returned' | 'failed' | 'cancelled' | 'unknown';
  used: string[];
  modelCalls: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  chargeMinor: 0;
  verification: 'relay_observed_unverified';
  startedAt?: number;
  completedAt?: number;
  result?: { text: string; truncated: boolean; attachments: number };
  error?: string;
};
export function createNoahRemoteWork(
  id: string,
  input: Pick<
    NoahRemoteExecution,
    | 'connectionId'
    | 'familyKey'
    | 'digest'
    | 'prompt'
    | 'inputSha256'
    | 'toolsSha256'
  >,
  at: number,
): WorkJob {
  const now = new Date(at).toISOString();
  return {
    id,
    title: input.prompt.slice(0, 120),
    templateId: 'noah-agent-remote',
    plan: {
      schemaVersion: 1,
      objective: input.prompt.slice(0, 1000),
      approvalGates: [],
    },
    revision: 0,
    status: 'active',
    steps: [
      {
        id: 'agent-result',
        title: 'Agentの結果を本人が確認',
        tool: 'noah-agent-remote',
        runner: 'noah-relay',
        passed: false,
      },
    ],
    events: [],
    createdAt: now,
    updatedAt: now,
    noahRemote: {
      ...input,
      mode: 'form',
      state: 'queued',
      used: [],
      modelCalls: 0,
      toolCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      chargeMinor: 0,
      verification: 'relay_observed_unverified',
    },
  };
}
export function updateNoahRemoteWork(
  job: WorkJob,
  state: NoahRemoteExecution['state'],
  at: number,
  result?: NoahRemoteExecution['result'],
  error?: string,
  tool?: string,
): WorkJob {
  const execution = job.noahRemote!;
  return {
    ...job,
    revision: job.revision + 1,
    updatedAt: new Date(at).toISOString(),
    status:
      state === 'running'
        ? 'active'
        : state === 'cancelled'
          ? 'cancelled'
          : 'review',
    noahRemote: {
      ...execution,
      state,
      ...(state === 'running' ? { startedAt: at } : { completedAt: at }),
      result,
      error,
      ...(tool ? { used: [tool], toolCalls: 1 } : {}),
    },
  };
}
