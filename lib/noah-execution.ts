import { noahInviteAgentId } from './noah-invite-contract.mjs';
import { noahModelDigest } from './noah-model-catalog.mjs';
import type { WorkJob } from './workflow.ts';
import { recipeFor, modelFor, LIMITS, validArtifactName } from './noah-execution-contract.mjs';
import { parseTerminalRuntime } from './noah-terminal-contract.mjs';
import { isReleasePackageKey, releaseAgentId } from './noah-release-contract.mjs';
import { validOperationEvent, type NoahOperationEvent } from './noah-operation-events.ts';
import { operationUuid, operationRunId } from './noah-operation-contract.mjs';

export type NoahFile = { name: string; base64: string; sha256: string; bytes: number };
export type NoahExecution = {
  operation?: { id: string; sequence: number; configVersion?: number; bindingVersion?: number; event?: NoahOperationEvent };
  agentId: string; recipe: string; version: string; image: string; model: 'qwen2.5:1.5b' | 'qwen3:4b' | 'none' | 'codex-account'; prompt: string;
  modelSha256?: string;
  provider?: { name: 'openai-codex'; model: string; version: string; sha256: string; consent: 'codex-account/1'; metric: 'provider_turns' };
  source?: { uploadId: string; manifestSha256: string; sourceSha256: string; runtime: ReturnType<typeof parseTerminalRuntime> };
  release?: { packageKey: string; manifestSha256: string; sourceSha256: string; runtime: ReturnType<typeof parseTerminalRuntime>; timeoutSeconds: number };
  invite?: { inviteId: string; uploadId: string; manifestSha256: string; sourceSha256: string; runtime: ReturnType<typeof parseTerminalRuntime>; revision: number; expiresAt: number };
  inputSha256: string; claimSha256: string; state: 'queued' | 'running' | 'returned' | 'failed' | 'cancelled' | 'unknown';
  chargeMinor: 0; verification: 'host_observed_unverified'; calls: number;
  startedAt?: number; completedAt?: number;
  result?: { text: string; files: NoahFile[]; exitCode: number }; error?: string;
};
export class NoahExecutionError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export async function noahDigest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join('');
}
export function executionInputDigest(agentId: string, prompt: string) { return noahDigest(JSON.stringify(recipeFor(agentId)?.provider ? [agentId, prompt, 'codex-account/1'] : [agentId, prompt])); }
export async function createNoahWork(id: string, value: unknown): Promise<WorkJob> {
  const input = value as Partial<NoahExecution>;
  const recipe = recipeFor(input?.agentId);
  const p = input?.provider;
  const validProvider = recipe?.provider === 'openai-codex' ? p && Object.keys(p).length === 6 && p.name === recipe.provider && p.consent === 'codex-account/1' && p.metric === 'provider_turns' &&
    typeof p.model === 'string' && /^[a-zA-Z0-9_.:-]{1,120}$/.test(p.model) && typeof p.version === 'string' && /^codex-cli [a-zA-Z0-9.+-]{1,80}$/.test(p.version) && /^[a-f0-9]{64}$/.test(p.sha256) : p === undefined;
  let terminal = false;
  if (input?.source) {
    const s = input.source;
    try {
      terminal = Object.keys(s).length === 4 && Object.keys(s).every(k => ['uploadId', 'manifestSha256', 'sourceSha256', 'runtime'].includes(k)) &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(s.uploadId) && input.agentId === s.uploadId &&
        /^[a-f0-9]{64}$/.test(s.manifestSha256) && /^[a-f0-9]{64}$/.test(s.sourceSha256) &&
        input.recipe === 'terminal' && input.model === parseTerminalRuntime(s.runtime).model && /^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[a-zA-Z0-9.-]{1,16})?$/.test(input.version || '');
    } catch { /* Invalid terminal declarations remain rejected below. */ }
  }
  if (input?.release && !input.source) {
    const r = input.release;
    try {
      terminal = Object.keys(r).length === 5 && Object.keys(r).every(k => ['packageKey','manifestSha256','sourceSha256','runtime','timeoutSeconds'].includes(k)) &&
        isReleasePackageKey(r.packageKey) && input.agentId === releaseAgentId(r.manifestSha256) &&
        /^[a-f0-9]{64}$/.test(r.manifestSha256) && /^[a-f0-9]{64}$/.test(r.sourceSha256) &&
        input.recipe === 'terminal' && input.version === r.packageKey.split('@')[1] && input.model === parseTerminalRuntime(r.runtime).model &&
        Number.isInteger(r.timeoutSeconds) && r.timeoutSeconds > 0 && r.timeoutSeconds <= 240;
    } catch { terminal = false; }
  }
  if (input?.invite && !input.source && !input.release) {
    const r = input.invite;
    try {
      terminal = Object.keys(r).length === 7 && Object.keys(r).every(k => ['inviteId','uploadId','manifestSha256','sourceSha256','runtime','revision','expiresAt'].includes(k)) &&
        noahInviteAgentId(r.inviteId) !== null && input.agentId === noahInviteAgentId(r.inviteId) && noahInviteAgentId(r.uploadId) !== null &&
        /^[a-f0-9]{64}$/.test(r.manifestSha256) && /^[a-f0-9]{64}$/.test(r.sourceSha256) &&
        input.recipe === 'terminal' && input.model === parseTerminalRuntime(r.runtime).model && /^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[a-zA-Z0-9.-]{1,16})?$/.test(input.version || '') &&
        Number.isSafeInteger(r.revision) && r.revision >= 1 && Number.isSafeInteger(r.expiresAt) && r.expiresAt > 0;
    } catch { terminal = false; }
  }
  const o = input?.operation;
  if (o && (Object.keys(o).some(k => !['id','sequence','configVersion','bindingVersion','event'].includes(k)) || (o.configVersion !== undefined && (!Number.isInteger(o.configVersion) || o.configVersion < 1 || o.configVersion > 20)) || (o.bindingVersion !== undefined && (!Number.isInteger(o.bindingVersion) || o.bindingVersion < 1 || o.bindingVersion > 20)) || (o.event !== undefined && (!validOperationEvent(o.event) || o.event.lineage.at(-1) !== o.id || o.event.agentId === input.agentId || o.configVersion === undefined)) || !operationUuid(o.id) || !Number.isInteger(o.sequence) || o.sequence < 1 || o.sequence > 100 || operationRunId(o.id, o.sequence) !== id)) throw new NoahExecutionError('運用の実行番号を確認してください。');
  if (!input || typeof input !== 'object' || (input.modelSha256 !== undefined && (!noahModelDigest(input.model) || input.modelSha256 !== noahModelDigest(input.model))) || !validProvider || ([input.source,input.release,input.invite].filter(Boolean).length > 1) || Object.keys(input).some(k => !['agentId', 'recipe', 'version', 'image', 'model', 'modelSha256', 'prompt', 'inputSha256', 'claimSha256', 'source', 'release', 'invite', 'provider', 'operation'].includes(k)) ||
    typeof input.agentId !== 'string' || (!terminal && (input.source || input.release || input.invite || !recipe || input.recipe !== recipe.key || input.version !== recipe.version || input.model !== modelFor(recipe))) ||
    typeof input.prompt !== 'string' || !input.prompt.trim() || new TextEncoder().encode(input.prompt).length > LIMITS.inputBytes || !/^sha256:[a-f0-9]{64}$/.test(input.image || '') ||
    !/^[a-f0-9]{64}$/.test(input.claimSha256 || '') || input.inputSha256 !== await executionInputDigest(input.agentId, input.prompt)) throw new NoahExecutionError('実行するAgent・版・入力を確認してください。');
  const now = new Date().toISOString();
  return { id, title: `${input.recipe}: ${input.prompt.slice(0, 80)}`, templateId: 'noah-agent-local',
    plan: { schemaVersion: 1, objective: input.prompt.slice(0, 1000), approvalGates: [] }, revision: 0, status: 'active', events: [], createdAt: now, updatedAt: now,
    steps: [{ id: 'agent-result', title: 'Agentの結果を本人が確認', tool: 'noah-agent-local', runner: 'noah-isolated', passed: false }],
    noahExecution: { ...input as NoahExecution, state: 'queued', chargeMinor: 0, verification: 'host_observed_unverified', calls: 0 } };
}
export async function updateNoahWork(job: WorkJob, value: { action: string; claim?: string; state?: NoahExecution['state']; result?: NoahExecution['result']; error?: string; calls?: number }): Promise<WorkJob> {
  const current = job.noahExecution;
  if (job.templateId !== 'noah-agent-local' || !current) throw new NoahExecutionError('仕事が見つかりません。', 404);
  if (!/^[a-f0-9]{64}$/.test(value.claim || '') || await noahDigest(value.claim!) !== current.claimSha256) throw new NoahExecutionError('実行器の記録権限がありません。', 403);
  if (!['queued', 'running'].includes(current.state)) throw new NoahExecutionError('この実行は終了しています。', 409);
  const next = structuredClone(job), record = next.noahExecution!;
  if (value.action === 'start' && current.state === 'queued') { record.state = 'running'; record.startedAt = Date.now(); }
  else if (value.action === 'finish' && ['returned', 'failed', 'cancelled', 'unknown'].includes(value.state || '')) {
    record.state = value.state!;
    record.completedAt = Date.now();
    if (!Number.isInteger(value.calls) || value.calls! < 0 || value.calls! > (current.provider ? 1 : LIMITS.modelCalls)) throw new NoahExecutionError('呼出回数が不正です。');
    record.calls = value.calls!;
    if (value.result) {
      if (record.state !== 'returned' || !Number.isInteger(value.result.exitCode) || typeof value.result.text !== 'string' || !Array.isArray(value.result.files) || value.result.files.length > LIMITS.files || new TextEncoder().encode(JSON.stringify(value.result)).length > LIMITS.resultBytes) throw new NoahExecutionError('実行結果が上限または形式に一致しません。');
      const names = new Set(); let total = 0;
      for (const f of value.result.files) {
        if (!validArtifactName(f.name) || names.has(f.name) || !/^[a-f0-9]{64}$/.test(f.sha256) || typeof f.base64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.base64)) throw new NoahExecutionError('ファイルの形式が不正です。');
        const bytes = Uint8Array.from(atob(f.base64), c => c.charCodeAt(0)); total += bytes.length; names.add(f.name);
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
        if (bytes.length !== f.bytes || bytes.length > LIMITS.fileBytes || total > 65536 || digest !== f.sha256) throw new NoahExecutionError('ファイルを照合できません。');
      }
      record.result = value.result;
    } else if (record.state === 'returned') throw new NoahExecutionError('実行結果がありません。');
    if (value.error) record.error = value.error.slice(0, 240);
    next.status = record.state === 'cancelled' ? 'cancelled' : 'review';
  } else throw new NoahExecutionError('実行状態の遷移が不正です。', 409);
  next.revision++; next.updatedAt = new Date().toISOString();
  return next;
}
