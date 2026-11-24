import type { NoahProviderRun } from './noah-provider-types.ts';
import type { NoahReceivedResult } from './noah-result-media.ts';
import type { NoahCloudFile, NoahCloudProfile, NoahCloudUsage } from './noah-cloud-contract.ts';
/**
 * 相手のサーバーで動く仕事（置き場所が provider）の、Work の記録。
 *
 * 依頼と成果の本文は、ここ（既存の Work）にだけ置く。進み具合は noah_asks（lib/noah-ask.ts）。
 * Noah は、相手のサーバーが返した内容を確かめていない。だから、終わった Work は `review` のままで、step を通した事にしない
 * （`verification: 'relay_observed_unverified'`。家の端末の仕事 = lib/noah-execution.ts の `host_observed_unverified` と同じ決まり）。
 * 費用は 0（`chargeMinor: 0`）。この file は、通信も保存もしない（保存は lib/work-store.ts）。
 * 仕様: docs/noah/spec-87-tool-agent.md の 4.1・11.3・11.4。
 */
import type { WorkJob } from './workflow.ts';

export const NOAH_REMOTE_TEMPLATE = 'noah-agent-remote';

export type NoahRemoteExecution = {
  provider?: NoahProviderRun;
  /** どの接続の、どの版か。 */
  connectionId: string; familyKey: string; digest: string;
  /** agent: 1 文で頼む（出した後）。form: 入力欄から、道具を 1 回呼ぶ。 */
  mode: 'agent' | 'form';
  /** form の時は、道具の名前と入力を 1 行にした物（1,000 文字まで）。 */
  prompt: string;
  /** 同じ操作かどうかを照らす hash（form は noahFormRequestSha256）。 */
  inputSha256: string;
  /** 頼んだ時の、接続先の道具の定義の hash（接続の時に読んだ物。無ければ空）。 */
  toolsSha256: string;
  /** form の時: 送り先の host、呼ぶ道具の名前、本人が入力欄を開いた時の、その道具の定義の hash。 */
  host?: string; tool?: string; toolSha256?: string;
  state: 'queued' | 'running' | 'your_turn' | 'returned' | 'failed' | 'cancelled' | 'limit' | 'unknown';
  /** 呼んだ道具の名前。 */
  used: string[];
  modelCalls: number; toolCalls: number; inputTokens: number; outputTokens: number;
  chargeMinor: 0; verification: 'relay_observed_unverified';
  startedAt?: number; completedAt?: number;
  /** 成果の文（文字として出す。HTML として解釈しない）。truncated: 長いので切った。attachments: 添付の数。images: 検査済みラスター画像の実体。 */
  result?: NoahReceivedResult;
  /** 成果に添える 1 行（「<host> の <道具> が返した内容です。費用 0。」）。 */
  note?: string;
  error?: string;
  /** Managed-cloud results keep the existing unverified Work/owner boundary. */
  cloud?: { projectId: string; profile: NoahCloudProfile; version: string; purpose?: 'eve-engineering'; freeTier?: true; reportedModelCalls?: number; files?: NoahCloudFile[]; usage?: NoahCloudUsage };
};

const iso = (at: number) => new Date(at).toISOString();
/** 文字の数で切る（サロゲートの途中で切らない）。 */
const head = (value: string, chars: number) => Array.from(value).slice(0, chars).join('');

/** 入力欄から頼んだ仕事の Work を作る（まだ保存しない）。`id` は Work の ID（依頼の ID とは別に作る）。 */
export function createNoahRemoteWork(id: string, input: {
  connectionId: string; familyKey: string; digest: string; agentName: string;
  host: string; tool: string; toolSha256: string; toolsSha256: string; args: Record<string, unknown>; inputSha256: string;
}, at: number): WorkJob {
  const prompt = head(`${input.tool} ${JSON.stringify(input.args)}`, 1000), now = iso(at);
  return {
    id, title: head(`${input.agentName}: ${input.tool}`, 120), templateId: NOAH_REMOTE_TEMPLATE,
    plan: { schemaVersion: 1, objective: prompt, approvalGates: [] }, revision: 0, status: 'active', events: [], createdAt: now, updatedAt: now,
    steps: [{ id: 'agent-result', title: 'Agentの結果を本人が確認', tool: NOAH_REMOTE_TEMPLATE, runner: 'noah-relay', passed: false }],
    noahRemote: {
      connectionId: input.connectionId, familyKey: input.familyKey, digest: input.digest, mode: 'form', prompt, inputSha256: input.inputSha256,
      toolsSha256: input.toolsSha256, host: input.host, tool: input.tool, toolSha256: input.toolSha256,
      state: 'queued', used: [], modelCalls: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0, chargeMinor: 0, verification: 'relay_observed_unverified',
    },
  };
}

/** 実行の場が取った（queued → running）。それ以外の状態からは、変えずに返す。 */
export function startNoahRemoteWork(job: WorkJob, at: number): WorkJob {
  const current = job.noahRemote;
  if (job.templateId !== NOAH_REMOTE_TEMPLATE || !current || current.state !== 'queued') return job;
  return { ...job, noahRemote: { ...current, state: 'running', startedAt: at }, revision: job.revision + 1, updatedAt: iso(at) };
}

export type NoahRemoteOutcome =
  | { state: 'returned'; result: NoahReceivedResult; note: string; used: string[] }
  | { state: 'failed' | 'cancelled' | 'unknown'; error: string; used?: string[] };

/**
 * 終わりを書く（queued・running → returned・failed・cancelled・unknown）。もう終わっている Work は、変えずに返す（後から届いた結果で、上書きしない）。
 * 終わった Work は `review`（止めた時は `cancelled`）。step は、通した事にしない。
 */
export function finishNoahRemoteWork(job: WorkJob, outcome: NoahRemoteOutcome, at: number): WorkJob {
  const current = job.noahRemote;
  if (job.templateId !== NOAH_REMOTE_TEMPLATE || !current || !['queued', 'running'].includes(current.state)) return job;
  const used = outcome.used ?? [];
  const next: NoahRemoteExecution = { ...current, state: outcome.state, used, toolCalls: used.length, completedAt: at };
  if (outcome.state === 'returned') { next.result = outcome.result; next.note = outcome.note; } else next.error = head(outcome.error, 300);
  return { ...job, noahRemote: next, status: outcome.state === 'cancelled' ? 'cancelled' : 'review', revision: job.revision + 1, updatedAt: iso(at) };
}
